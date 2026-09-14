import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../config/env.js';
import { query } from '../db/index.js';
import { hashPassword, verifyPassword } from '../crypto/hash.js';
import { getJWKS, signOidcIdToken, signSessionToken, verifySessionToken } from '../crypto/jwks.js';
import { getAuthenticatedUser, requireAuth, requireAdmin } from '../middleware/auth.js';

export async function oidcRoutes(fastify: FastifyInstance) {
  // Discovery: /.well-known/openid-configuration
  fastify.get('/.well-known/openid-configuration', async (_request, reply) => {
    return reply.send({
      issuer: config.appUrl,
      authorization_endpoint: `${config.appUrl}/api/oauth/authorize`,
      token_endpoint: `${config.appUrl}/api/oauth/token`,
      userinfo_endpoint: `${config.appUrl}/api/oauth/userinfo`,
      jwks_uri: `${config.appUrl}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'preferred_username', 'name', 'email', 'picture'],
      code_challenge_methods_supported: ['S256', 'plain'],
    });
  });

  // JWKS: /.well-known/jwks.json
  fastify.get('/.well-known/jwks.json', async (_request, reply) => {
    const jwks = await getJWKS();
    return reply.send(jwks);
  });

  // GET /api/oauth/authorize
  fastify.get('/api/oauth/authorize', async (request: FastifyRequest, reply: FastifyReply) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      scope = 'openid profile email',
      state = '',
      nonce = '',
    } = request.query as Record<string, string>;

    if (!client_id || !redirect_uri) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'client_id and redirect_uri are required parameters',
      });
    }

    if (response_type && response_type !== 'code') {
      return reply.status(400).send({
        error: 'unsupported_response_type',
        error_description: 'Only response_type=code is supported',
      });
    }

    // Verify client exists
    const clientRes = await query('SELECT * FROM oidc_clients WHERE client_id = $1', [client_id]);
    if (clientRes.rows.length === 0) {
      return reply.status(400).send({
        error: 'unauthorized_client',
        error_description: `Client '${client_id}' is not registered`,
      });
    }

    const client = clientRes.rows[0];
    const redirectUris: string[] = client.redirect_uris || [];
    const isUriAllowed = redirectUris.some((uri) => uri.trim() === redirect_uri.trim());

    if (!isUriAllowed) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: `redirect_uri '${redirect_uri}' is not registered for client '${client_id}'`,
      });
    }

    // Check if user is logged in
    const user = await getAuthenticatedUser(request);
    if (!user) {
      // Redirect to login page with return parameter
      const returnUrl = encodeURIComponent(request.url);
      return reply.redirect(`/login?rd=${returnUrl}`);
    }

    // Check if consent has already been confirmed via query param or proceed to consent screen
    const consentParam = (request.query as Record<string, string>).consent;
    if (consentParam === 'granted') {
      // Generate authorization code (expires in 5 minutes)
      const code = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await query(
        `INSERT INTO oidc_auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [code, client_id, user.userId, redirect_uri, scope, expiresAt]
      );

      const redirectTarget = new URL(redirect_uri);
      redirectTarget.searchParams.set('code', code);
      if (state) redirectTarget.searchParams.set('state', state);

      return reply.redirect(redirectTarget.toString());
    }

    // Redirect to frontend consent screen
    const consentParams = new URLSearchParams({
      client_id,
      client_name: client.client_name,
      redirect_uri,
      scope,
      state,
      nonce,
    });
    return reply.redirect(`/consent?${consentParams.toString()}`);
  });

  // POST /api/oauth/authorize - Submit Consent Decision
  fastify.post('/api/oauth/authorize', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      client_id: string;
      redirect_uri: string;
      scope?: string;
      state?: string;
      action: 'allow' | 'deny';
    };

    const { client_id, redirect_uri, scope = 'openid profile email', state = '', action } = body;
    const user = request.user!;

    if (action === 'deny') {
      const redirectTarget = new URL(redirect_uri);
      redirectTarget.searchParams.set('error', 'access_denied');
      redirectTarget.searchParams.set('error_description', 'The user denied the authorization request');
      if (state) redirectTarget.searchParams.set('state', state);
      return reply.send({ redirect_url: redirectTarget.toString() });
    }

    // Verify client
    const clientRes = await query('SELECT * FROM oidc_clients WHERE client_id = $1', [client_id]);
    if (clientRes.rows.length === 0) {
      return reply.status(400).send({ error: 'invalid_client' });
    }

    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await query(
      `INSERT INTO oidc_auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [code, client_id, user.userId, redirect_uri, scope, expiresAt]
    );

    const redirectTarget = new URL(redirect_uri);
    redirectTarget.searchParams.set('code', code);
    if (state) redirectTarget.searchParams.set('state', state);

    return reply.send({
      success: true,
      redirect_url: redirectTarget.toString(),
    });
  });

  // POST /api/oauth/token
  fastify.post('/api/oauth/token', async (request: FastifyRequest, reply: FastifyReply) => {
    let clientId: string | undefined;
    let clientSecret: string | undefined;

    // Check Basic Auth header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const creds = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
      const [u, p] = creds.split(':');
      clientId = u;
      clientSecret = p;
    }

    const body = (request.body as Record<string, any>) || {};
    if (!clientId) clientId = body.client_id;
    if (!clientSecret) clientSecret = body.client_secret;

    const { grant_type, code, redirect_uri } = body;

    if (grant_type !== 'authorization_code') {
      return reply.status(400).send({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported',
      });
    }

    if (!code || !clientId) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'code and client_id are required',
      });
    }

    // Verify client
    const clientRes = await query('SELECT * FROM oidc_clients WHERE client_id = $1', [clientId]);
    if (clientRes.rows.length === 0) {
      return reply.status(401).send({
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });
    }

    const client = clientRes.rows[0];

    // If client has a secret, verify it
    if (client.client_secret_hash) {
      if (!clientSecret) {
        return reply.status(401).send({
          error: 'invalid_client',
          error_description: 'Client secret is required',
        });
      }
      const isSecretValid = await verifyPassword(client.client_secret_hash, clientSecret);
      if (!isSecretValid) {
        return reply.status(401).send({
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        });
      }
    }

    // Verify code
    const codeRes = await query('SELECT * FROM oidc_auth_codes WHERE code = $1', [code]);
    if (codeRes.rows.length === 0) {
      return reply.status(400).send({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      });
    }

    const authCode = codeRes.rows[0];
    if (authCode.used) {
      return reply.status(400).send({
        error: 'invalid_grant',
        error_description: 'Authorization code has already been used',
      });
    }

    if (new Date(authCode.expires_at).getTime() < Date.now()) {
      return reply.status(400).send({
        error: 'invalid_grant',
        error_description: 'Authorization code has expired',
      });
    }

    if (authCode.client_id !== clientId) {
      return reply.status(400).send({
        error: 'invalid_grant',
        error_description: 'Authorization code was not issued to this client',
      });
    }

    if (redirect_uri && authCode.redirect_uri !== redirect_uri) {
      return reply.status(400).send({
        error: 'invalid_grant',
        error_description: 'redirect_uri does not match original authorization request',
      });
    }

    // Mark code as used
    await query('UPDATE oidc_auth_codes SET used = TRUE WHERE code = $1', [code]);

    // Fetch user
    const userRes = await query('SELECT * FROM users WHERE id = $1', [authCode.user_id]);
    if (userRes.rows.length === 0) {
      return reply.status(400).send({
        error: 'invalid_grant',
        error_description: 'User not found',
      });
    }

    const user = userRes.rows[0];

    // Issue ID token
    const idToken = await signOidcIdToken({
      sub: user.id,
      preferred_username: user.username,
      email: user.email,
      name: user.display_name || user.username,
      picture: user.avatar_url,
      aud: clientId,
    });

    // Issue Access Token
    const accessToken = await signSessionToken(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name || user.username,
        role: user.role || 'member',
        avatarUrl: user.avatar_url,
      },
      1 // 1 hour access token TTL
    );

    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    return reply.send({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
      scope: authCode.scope,
    });
  });

  // GET /api/oauth/userinfo
  fastify.get('/api/oauth/userinfo', async (request: FastifyRequest, reply: FastifyReply) => {
    let token: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return reply.status(401).send({ error: 'invalid_token', error_description: 'Missing access token' });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return reply.status(401).send({ error: 'invalid_token', error_description: 'Invalid or expired token' });
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    if (userRes.rows.length === 0) {
      return reply.status(404).send({ error: 'user_not_found' });
    }

    const user = userRes.rows[0];
    return reply.send({
      sub: user.id,
      preferred_username: user.username,
      email: user.email,
      name: user.display_name || user.username,
      picture: user.avatar_url,
    });
  });

  // --- OIDC Client Management API ---

  // GET /api/oidc/clients (Requires admin)
  fastify.get('/api/oidc/clients', { preHandler: requireAdmin }, async (_request, reply) => {
    const clientsRes = await query('SELECT id, client_id, client_name, redirect_uris, scopes, created_at FROM oidc_clients ORDER BY created_at DESC');
    return reply.send({ clients: clientsRes.rows });
  });

  // POST /api/oidc/clients (Create new OIDC client)
  fastify.post('/api/oidc/clients', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const createSchema = z.object({
      client_name: z.string().min(1, 'Client name is required'),
      client_id: z.string().optional(),
      redirect_uris: z.array(z.string().url()).min(1, 'At least one redirect URI is required'),
      scopes: z.array(z.string()).optional(),
    });

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }

    const { client_name, redirect_uris, scopes = ['openid', 'profile', 'email'] } = parsed.data;
    const clientId = parsed.data.client_id || `${client_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    const rawSecret = crypto.randomBytes(24).toString('hex');
    const secretHash = await hashPassword(rawSecret);

    const insertRes = await query(
      `INSERT INTO oidc_clients (client_id, client_secret_hash, client_name, redirect_uris, scopes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, client_name, redirect_uris, scopes, created_at`,
      [clientId, secretHash, client_name, redirect_uris, scopes]
    );

    return reply.status(201).send({
      client: insertRes.rows[0],
      client_secret: rawSecret, // Returned once upon creation for initial config
    });
  });

  // DELETE /api/oidc/clients/:id
  fastify.delete('/api/oidc/clients/:id', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await query('DELETE FROM oidc_clients WHERE id = $1', [id]);
    return reply.send({ success: true, message: 'Client deleted' });
  });
}
