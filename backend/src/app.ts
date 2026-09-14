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
import { vaultRoutes } from './routes/vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const fastify = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: true,
  });

  // Handle empty JSON bodies gracefully instead of throwing FST_ERR_CTP_EMPTY_JSON_BODY
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const bodyStr = typeof body === 'string' ? body : (body ? body.toString() : '');
    if (!bodyStr || bodyStr.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(bodyStr));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // CORS configuration
  await fastify.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Remote-User', 'Remote-Email', 'Remote-Name', 'Remote-Groups'],
  });

  // Form body parsing
  await fastify.register(formbody);

  // Cookie parsing for homelab_session
  await fastify.register(cookie, {
    secret: config.jwtSecret,
    parseOptions: {},
  });

  // Rate Limiting
  await fastify.register(rateLimit, {
    global: false,
  });

  // Health check endpoint
  fastify.get('/api/health', async () => {
    return {
      status: 'healthy',
      app: 'homelab-idp',
      timestamp: new Date().toISOString(),
    };
  });

  // Core API Routes (Auth, Nginx Forward-Auth SSO, & Credential Vault)
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(forwardAuthRoutes, { prefix: '/api/auth' });
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
      if (request.raw.url && request.raw.url.startsWith('/api')) {
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
