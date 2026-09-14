import { FastifyRequest, FastifyReply } from 'fastify';
import { verifySessionToken, SessionPayload } from '../crypto/jwks.js';
import { query } from '../db/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionPayload;
  }
}

/**
 * Extracts and verifies session token from cookie or Authorization header.
 * Returns SessionPayload if valid, null otherwise.
 */
export async function getAuthenticatedUser(request: FastifyRequest): Promise<SessionPayload | null> {
  let token: string | undefined;

  // 1. Check httpOnly cookie 'homelab_session'
  if (request.cookies && request.cookies.homelab_session) {
    token = request.cookies.homelab_session;
  }

  // 2. Check Authorization header: Bearer <token>
  if (!token && request.headers.authorization) {
    const authHeader = request.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }

  // Verify that user still exists in database
  const userRes = await query('SELECT id, username, email, display_name, role, avatar_url FROM users WHERE id = $1', [
    payload.userId,
  ]);

  if (userRes.rows.length === 0) {
    return null;
  }

  const dbUser = userRes.rows[0];
  return {
    userId: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    displayName: dbUser.display_name || dbUser.username,
    role: dbUser.role || 'member',
    avatarUrl: dbUser.avatar_url,
  };
}

/**
 * Middleware: Requires an active valid user session.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
  }
  request.user = user;
}

/**
 * Middleware: Requires admin role.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);
  if (!user || user.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden', message: 'Administrator privileges required' });
  }
  request.user = user;
}
