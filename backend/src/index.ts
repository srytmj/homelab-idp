import { buildApp } from './app.js';
import { config } from './config/env.js';
import { initDb } from './db/index.js';

async function main() {
  try {
    console.log('🚀 Starting homelab-idp backend...');

    // Initialize database pool, migrations, and seed initial admin & vault
    await initDb();

    // Build Fastify application
    const app = await buildApp();

    await app.listen({ port: config.port, host: '0.0.0.0' });

    console.log(`✨ homelab-idp running at http://0.0.0.0:${config.port}`);
    console.log(`   Forward Auth:   http://localhost:${config.port}/api/auth/verify`);
    console.log(`   Vault API:      http://localhost:${config.port}/api/vault`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
