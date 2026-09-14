import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../db/index.js';
import { verifyPassword } from '../crypto/hash.js';
import { signSessionToken } from '../crypto/jwks.js';
import { config } from '../config/env.js';
import { getAuthenticatedUser } from '../middleware/auth.js';

const loginSchema = z.object({
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login
  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          issues: parsed.error.issues,
        });
      }

      const { username, password } = parsed.data;

      // Search by username or email
      const userRes = await query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      let user = userRes.rows[0];
      if (!user) {
        // Try email match if username search didn't find anyone
        const emailRes = await query('SELECT * FROM users WHERE email = $1', [username]);
        user = emailRes.rows[0];
      }

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Incorrect username or password',
        });
      }

      const isPasswordValid = await verifyPassword(user.password_hash, password);
      if (!isPasswordValid) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Incorrect username or password',
        });
      }

      const userPayload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name || user.username,
        role: user.role || 'member',
        avatarUrl: user.avatar_url,
      };

      const token = await signSessionToken(userPayload);

      // Set secure session cookie
      reply.setCookie('homelab_session', token, {
        path: '/',
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: config.sessionTtlHours * 3600,
      });

      return reply.send({
        success: true,
        user: userPayload,
        token, // Also return token for clients sending Authorization: Bearer
      });
    }
  );

  // POST /api/auth/logout
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('homelab_session', { path: '/' });
    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  // GET /api/auth/me
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'No active session',
      });
    }

    return reply.send({
      user,
    });
  });
}
