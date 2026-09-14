import * as jose from 'jose';
import crypto from 'crypto';
import { config } from '../config/env.js';

interface JWKSEntry {
  kty: string;
  use: string;
  alg: string;
  kid: string;
  n: string;
  e: string;
}

let rsaKeyPair: {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  kid: string;
} | null = null;

let cachedJWKS: { keys: JWKSEntry[] } | null = null;

/**
 * Initializes or gets the RSA Key Pair used for signing OIDC tokens.
 */
export async function getOidcKeyPair() {
  if (rsaKeyPair) return rsaKeyPair;

  // Generate a 2048-bit RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // Unique Key ID based on public key fingerprint
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const kid = crypto.createHash('sha256').update(spki).digest('hex').substring(0, 16);

  rsaKeyPair = {
    privateKey,
    publicKey,
    kid,
  };

  const jwk = await jose.exportJWK(publicKey);
  cachedJWKS = {
    keys: [
      {
        kty: jwk.kty || 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid,
        n: jwk.n || '',
        e: jwk.e || '',
      },
    ],
  };

  return rsaKeyPair;
}

/**
 * Returns the public JWKS set for standard OIDC discovery.
 */
export async function getJWKS() {
  if (!cachedJWKS) {
    await getOidcKeyPair();
  }
  return cachedJWKS!;
}

export interface IdTokenPayload {
  sub: string;
  preferred_username: string;
  email: string;
  name?: string;
  picture?: string;
  aud: string; // client_id
  nonce?: string;
}

/**
 * Signs an OIDC ID Token with RS256 using the server's private RSA key.
 */
export async function signOidcIdToken(payload: IdTokenPayload, expiresInSeconds = 3600): Promise<string> {
  const { privateKey, kid } = await getOidcKeyPair();

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    sub: payload.sub,
    preferred_username: payload.preferred_username,
    email: payload.email,
    name: payload.name || payload.preferred_username,
    picture: payload.picture,
    nonce: payload.nonce,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(config.appUrl)
    .setAudience(payload.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(privateKey);

  return jwt;
}

export interface SessionPayload {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

/**
 * Signs a session JWT for web dashboard & forward-auth session cookie.
 */
export async function signSessionToken(payload: SessionPayload, ttlHours = config.sessionTtlHours): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const jwt = await new jose.SignJWT({
    sub: payload.userId,
    username: payload.username,
    email: payload.email,
    displayName: payload.displayName,
    role: payload.role,
    avatarUrl: payload.avatarUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.appUrl)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(secret);

  return jwt;
}

/**
 * Verifies and decodes a session JWT.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: config.appUrl,
    });

    return {
      userId: payload.sub as string,
      username: (payload.username as string) || '',
      email: (payload.email as string) || '',
      displayName: (payload.displayName as string) || (payload.username as string) || '',
      role: (payload.role as string) || 'member',
      avatarUrl: payload.avatarUrl as string | undefined,
    };
  } catch {
    return null;
  }
}
