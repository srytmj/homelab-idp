import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { forwardAuthRoutes } from './routes/forwardAuth.js';
import { oidcRoutes } from './routes/oidc.js';
import { vaultRoutes } from './routes/vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const fastify = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: true,
  });

  // CORS configuration
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow all origins in homelab or local dev
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Remote-User', 'Remote-Email', 'Remote-Name', 'Remote-Groups'],
  });

  // Form body parsing for OAuth2 token requests (application/x-www-form-urlencoded)
  await fastify.register(formbody);

  // Cookie parsing for homelab_session
  await fastify.register(cookie, {
    secret: config.jwtSecret,
    parseOptions: {},
  });

  // Rate Limiting
  await fastify.register(rateLimit, {
    global: false, // Applied per-route where needed
  });

  // Health check endpoint
  fastify.get('/api/health', async () => {
    return {
      status: 'healthy',
      app: 'homelab-idp',
      timestamp: new Date().toISOString(),
    };
  });

  // Register API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(forwardAuthRoutes, { prefix: '/api/auth' });
  await fastify.register(oidcRoutes);
  await fastify.register(vaultRoutes, { prefix: '/api/vault' });

  // Frontend static serving for SPA (if frontend/dist exists)
  const possibleDistPaths = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), 'public'),
  ];

  let clientDistPath = possibleDistPaths.find((p) => fs.existsSync(p));

  if (clientDistPath) {
    await fastify.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: any non-API GET route serves index.html
    fastify.setNotFoundHandler((request, reply) => {
      if (request.raw.url && (request.raw.url.startsWith('/api') || request.raw.url.startsWith('/.well-known'))) {
        return reply.status(404).send({ error: 'Not Found', path: request.raw.url });
      }

      const indexPath = path.join(clientDistPath!, 'index.html');
      if (fs.existsSync(indexPath)) {
        return reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'));
      }

      return reply.status(404).send({ error: 'Not Found' });
    });
  }

  return fastify;
}
