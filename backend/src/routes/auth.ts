import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../db/index.js';
import { verifyPassword, hashPassword } from '../crypto/hash.js';
import { signSessionToken } from '../crypto/jwks.js';
import { config } from '../config/env.js';
import { getAuthenticatedUser } from '../middleware/auth.js';

const loginSchema = z.object({
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(64),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().optional(),
});

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dots, underscores, and dashes')
    .optional(),
  email: z.string().email('Invalid email address').optional(),
  displayName: z.string().max(128).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register
  fastify.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          issues: parsed.error.issues,
        });
      }

      const { username, email, password, displayName } = parsed.data;

      // Check if username already exists
      const existingUser = await query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
      if (existingUser.rows.length > 0) {
        return reply.status(409).send({
          error: 'Username taken',
          message: `Username '${username}' is already registered`,
        });
      }

      // Check if email already exists
      const existingEmail = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existingEmail.rows.length > 0) {
        return reply.status(409).send({
          error: 'Email taken',
          message: `Email '${email}' is already registered`,
        });
      }

      const passwordHash = await hashPassword(password);
      const insertRes = await query(
        `INSERT INTO users (username, email, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, display_name, role, created_at`,
        [username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username, 'member']
      );

      const newUser = insertRes.rows[0];
      const userPayload = {
        userId: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.display_name || newUser.username,
        role: newUser.role || 'member',
      };

      const token = await signSessionToken(userPayload);

      // Set secure session cookie
      reply.setCookie('homelab_session', token, {
      domain: config.cookieDomain,
        path: '/',
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: config.sessionTtlHours * 3600,
      });

      return reply.status(201).send({
        success: true,
        user: userPayload,
        token,
      });
    }
  );

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
      domain: config.cookieDomain,
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
    reply.clearCookie('homelab_session', { path: '/', domain: config.cookieDomain });
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

  // PUT /api/auth/profile - Update SSO Username, Email, Display Name, and/or Password
  fastify.put('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = await getAuthenticatedUser(request);
    if (!currentUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'No active session',
      });
    }

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        message: parsed.error.issues[0]?.message || 'Validation failed',
        issues: parsed.error.issues,
      });
    }

    const { username, email, displayName, currentPassword, newPassword } = parsed.data;

    // Fetch existing user record with password_hash
    const userRes = await query('SELECT * FROM users WHERE id = $1', [currentUser.userId]);
    if (userRes.rows.length === 0) {
      return reply.status(404).send({
        error: 'Not found',
        message: 'User account not found',
      });
    }

    const dbUser = userRes.rows[0];

    // Password change logic
    let passwordHash = dbUser.password_hash;
    if (newPassword) {
      if (!currentPassword) {
        return reply.status(400).send({
          error: 'Current password required',
          message: 'Current password is required to set a new password',
        });
      }
      const isCurrentValid = await verifyPassword(dbUser.password_hash, currentPassword);
      if (!isCurrentValid) {
        return reply.status(400).send({
          error: 'Invalid password',
          message: 'Current password is incorrect',
        });
      }
      passwordHash = await hashPassword(newPassword);
    } else if (currentPassword) {
      // If current password was provided to verify identity
      const isCurrentValid = await verifyPassword(dbUser.password_hash, currentPassword);
      if (!isCurrentValid) {
        return reply.status(400).send({
          error: 'Invalid password',
          message: 'Current password is incorrect',
        });
      }
    }

    const finalUsername = username ? username.trim().toLowerCase() : dbUser.username.toLowerCase();
    const finalEmail = email ? email.trim().toLowerCase() : dbUser.email.toLowerCase();
    const finalDisplayName = displayName !== undefined ? displayName.trim() : (dbUser.display_name || finalUsername);

    // Check username uniqueness if changed
    if (finalUsername !== dbUser.username.toLowerCase()) {
      const checkUser = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [
        finalUsername,
        currentUser.userId,
      ]);
      if (checkUser.rows.length > 0) {
        return reply.status(409).send({
          error: 'Username taken',
          message: `Username '${username}' is already registered by another account`,
        });
      }
    }

    // Check email uniqueness if changed
    if (finalEmail !== dbUser.email.toLowerCase()) {
      const checkEmail = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
        finalEmail,
        currentUser.userId,
      ]);
      if (checkEmail.rows.length > 0) {
        return reply.status(409).send({
          error: 'Email taken',
          message: `Email '${email}' is already registered by another account`,
        });
      }
    }

    const updateRes = await query(
      `UPDATE users
       SET username = $1, email = $2, display_name = $3, password_hash = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, email, display_name, role, avatar_url, updated_at`,
      [finalUsername, finalEmail, finalDisplayName, passwordHash, currentUser.userId]
    );

    const updated = updateRes.rows[0];
    const userPayload = {
      userId: updated.id,
      username: updated.username,
      email: updated.email,
      displayName: updated.display_name || updated.username,
      role: updated.role || 'member',
      avatarUrl: updated.avatar_url,
    };

    const token = await signSessionToken(userPayload);

    // Refresh cookie
    reply.setCookie('homelab_session', token, {
      domain: config.cookieDomain,
      path: '/',
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.sessionTtlHours * 3600,
    });

    return reply.send({
      success: true,
      user: userPayload,
      token,
      message: 'Account & SSO profile updated successfully',
    });
  });
}
