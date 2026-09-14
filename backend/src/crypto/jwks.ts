import * as jose from 'jose';
import { config } from '../config/env.js';

export interface SessionPayload {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

/**
 * Signs a session JWT for web dashboard & forward-auth session cookie (HS256).
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
      avatarUrl: (payload.avatarUrl as string) || undefined,
    };
  } catch {
    return null;
  }
}
