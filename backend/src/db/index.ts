import pg from 'pg';
import { config } from '../config/env.js';
import { hashPassword } from '../crypto/hash.js';
import { memoryDb } from './memoryFallback.js';
import { encryptAesGcm } from '../crypto/aes.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isUsingMemoryDb = false;

export function getIsUsingMemoryDb(): boolean {
  return isUsingMemoryDb;
}

/**
 * Executes a SQL query against PostgreSQL or the in-memory fallback.
 */
export async function query(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  if (isUsingMemoryDb || !pool) {
    return memoryDb.query(sql, params);
  }

  try {
    const res = await pool.query(sql, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
    };
  } catch (err: any) {
    // If connection dropped, handle error or fallback
    console.error('Database query error:', err.message);
    throw err;
  }
}

/**
 * Close database pool connection.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Initialize database connection, run DDL migrations, and seed initial admin user.
 */
export async function initDb(quiet = false): Promise<void> {
  if (!quiet) {
    console.log(`[Database] Connecting to database: ${config.databaseUrl.replace(/:[^:@]+@/, ':****@')}...`);
  }

  try {
    const testPool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });

    // Test connection with a quick timeout
    const client = await testPool.connect();
    client.release();
    pool = testPool;
    isUsingMemoryDb = false;
    if (!quiet) {
      console.log('[Database] Successfully connected to PostgreSQL.');
    }
  } catch (err: any) {
    const isProduction = config.nodeEnv === 'production' || process.env.STRICT_DB === 'true';
    if (isProduction) {
      console.error('\n' + '='.repeat(70));
      console.error('[FATAL DATABASE ERROR] Production startup aborted!');
      console.error(`PostgreSQL connection to '${config.databaseUrl.replace(/:[^:@]+@/, ':****@')}' failed:`);
      console.error(`-> ${err.message}`);
      console.error('');
      console.error('In-memory database fallback is STRICTLY DISABLED in production');
      console.error('to prevent silent reset, credential loss, or container desynchronization.');
      console.error('Please ensure your PostgreSQL container and network are up and reachable.');
      console.error('homelab-idp is exiting with code 1 (fail-fast).');
      console.error('='.repeat(70) + '\n');
      process.exit(1);
    }

    if (!quiet) {
      console.warn(`[Database] PostgreSQL connection failed (${err.message}).`);
      console.warn(`[Database] [DEV/TEST ONLY] Falling back to high-fidelity In-Memory Database store (NODE_ENV=${config.nodeEnv}).`);
    }
    isUsingMemoryDb = true;
  }

  // Run migrations / table creation
  await runMigrations(quiet);

  // Seed initial admin user if empty
  await seedInitialAdmin(quiet);

  // Seed default OIDC clients (e.g. Komga, Nextcloud) for convenience
  await seedDefaultClients();

  // Seed initial sample vault credentials if empty
  await seedDefaultVault();
}

async function runMigrations(quiet = false): Promise<void> {
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(128) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(128),
      avatar_url TEXT,
      role VARCHAR(20) DEFAULT 'admin',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oidc_clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id VARCHAR(64) UNIQUE NOT NULL,
      client_secret_hash TEXT NOT NULL,
      client_name VARCHAR(128) NOT NULL,
      redirect_uris TEXT[] NOT NULL,
      scopes TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oidc_auth_codes (
      code VARCHAR(128) PRIMARY KEY,
      client_id VARCHAR(64) REFERENCES oidc_clients(client_id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS vault_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_name VARCHAR(128) NOT NULL,
      category VARCHAR(64) DEFAULT 'General',
      service_url TEXT,
      username VARCHAR(128) NOT NULL,
      encrypted_password TEXT NOT NULL,
      encrypted_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  if (!isUsingMemoryDb && pool) {
    await pool.query(ddl);
    if (!quiet) console.log('[Database] PostgreSQL schema migrations completed.');
  } else {
    memoryDb.query(ddl);
    if (!quiet) console.log('[Database] In-memory database schema initialized.');
  }
}

async function seedInitialAdmin(quiet = false): Promise<void> {
  const countRes = await query('SELECT COUNT(*) FROM users');
  const count = parseInt(countRes.rows[0]?.count || '0', 10);

  if (count === 0) {
    if (!quiet) console.log(`[Database] Seeding initial admin account '${config.initialAdmin.username}'...`);
    const passwordHash = await hashPassword(config.initialAdmin.password);
    await query(
      `INSERT INTO users (username, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [
        config.initialAdmin.username.toLowerCase(),
        config.initialAdmin.email.toLowerCase(),
        passwordHash,
        config.initialAdmin.displayName,
      ]
    );
    if (!quiet) console.log('[Database] Initial admin user seeded successfully.');
  }
}

async function seedDefaultClients(): Promise<void> {
  const countRes = await query('SELECT COUNT(*) FROM oidc_clients');
  const count = parseInt(countRes.rows[0]?.count || '0', 10);

  if (count === 0) {
    const defaultSecret = 'komga_homelab_secret_2026';
    const secretHash = await hashPassword(defaultSecret);
    await query(
      `INSERT INTO oidc_clients (client_id, client_secret_hash, client_name, redirect_uris, scopes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) DO NOTHING`,
      [
        'komga-oidc',
        secretHash,
        'Komga Comic & Manga Server',
        [
          'https://komga.homelab.local/oauth2/code/homelab',
          'http://localhost:8080/oauth2/code/homelab',
          'http://localhost:8080/login/oauth2/code/homelab-idp',
        ],
        ['openid', 'profile', 'email'],
      ]
    );
  }
}

async function seedDefaultVault(): Promise<void> {
  const countRes = await query('SELECT COUNT(*) FROM vault_credentials');
  const count = parseInt(countRes.rows[0]?.count || '0', 10);

  if (count === 0) {
    const samples = [
      {
        service_name: 'Proxmox VE Cluster',
        category: 'Infrastructure',
        service_url: 'https://pve.homelab.local:8006',
        username: 'root@pam',
        password: 'PveRootPassword2026!',
        notes: 'Node 1: 192.168.1.10. 2FA enabled on YubiKey backup.',
      },
      {
        service_name: 'Nextcloud Hub',
        category: 'Storage',
        service_url: 'https://cloud.homelab.local',
        username: 'admin',
        password: 'NextcloudAdminSecretPass!',
        notes: 'S3 primary storage backend with MinIO.',
      },
      {
        service_name: 'OPNsense Firewall',
        category: 'Network',
        service_url: 'https://router.homelab.local',
        username: 'root',
        password: 'OpnRouterP@ssword2026',
        notes: 'VLAN 10: Management, VLAN 20: Trusted, VLAN 30: IoT.',
      },
    ];

    for (const s of samples) {
      const encPass = encryptAesGcm(s.password, config.vaultSecretKey);
      const encNotes = encryptAesGcm(s.notes, config.vaultSecretKey);
      await query(
        `INSERT INTO vault_credentials (service_name, category, service_url, username, encrypted_password, encrypted_notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [s.service_name, s.category, s.service_url, s.username, encPass, encNotes]
      );
    }
  }
}
