import pg from 'pg';
import { config } from '../config/env.js';
import { memoryDb } from './memoryFallback.js';
import { hashPassword } from '../crypto/hash.js';
import { encryptAesGcm } from '../crypto/aes.js';

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let isUsingMemoryDb = false;

export async function query(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  if (!isUsingMemoryDb && pool) {
    try {
      const res = await pool.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount || 0 };
    } catch (err: any) {
      console.error('[Database Error]', err.message);
      throw err;
    }
  }

  return memoryDb.query(sql, params);
}

export async function initDb(quiet = false): Promise<void> {
  // If explicitly configured for in-memory or running headless
  if (config.databaseUrl.startsWith('memory://') || process.env.USE_MEMORY_DB === 'true') {
    if (!quiet) console.log('[Database] Using in-memory database store.');
    isUsingMemoryDb = true;
    await runMigrations(quiet);
    await seedInitialAdmin(quiet);
    await seedDefaultVault();
    return;
  }

  try {
    const maskedUrl = config.databaseUrl.replace(/:[^:@]+@/, ':****@');
    if (!quiet) console.log(`[Database] Connecting to database: ${maskedUrl}...`);

    pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 30000,
      max: 20,
    });

    // Test connection
    const client = await pool.connect();
    client.release();

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

  // Seed initial sample vault credentials if empty
  await seedDefaultVault();
}

async function runMigrations(quiet = false): Promise<void> {
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Drop legacy OIDC tables if present
    DROP TABLE IF EXISTS oidc_auth_codes CASCADE;
    DROP TABLE IF EXISTS oidc_clients CASCADE;

    -- 1. Users table (SSO accounts & Forward Auth)
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

    -- 2. Credential Vault table (Password Bank)
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

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
