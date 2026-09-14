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
 * Initialize database connection, run DDL migrations, and seed initial admin user.
 */
export async function initDb(): Promise<void> {
  console.log(`[Database] Connecting to database: ${config.databaseUrl.replace(/:[^:@]+@/, ':****@')}...`);

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
    console.log('[Database] Successfully connected to PostgreSQL.');
  } catch (err: any) {
    console.warn(`[Database] PostgreSQL connection failed (${err.message}).`);
    console.warn('[Database] Falling back to high-fidelity In-Memory Database store for dev/testing.');
    isUsingMemoryDb = true;
  }

  // Run migrations / table creation
  await runMigrations();

  // Seed initial admin user if empty
  await seedInitialAdmin();

  // Seed default OIDC clients (e.g. Komga, Nextcloud) for convenience
  await seedDefaultClients();

  // Seed initial sample vault credentials if empty
  await seedDefaultVault();
}

async function runMigrations(): Promise<void> {
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
    console.log('[Database] PostgreSQL schema migrations completed.');
  } else {
    memoryDb.query(ddl);
    console.log('[Database] In-memory database schema initialized.');
  }
}

async function seedInitialAdmin(): Promise<void> {
  const countRes = await query('SELECT COUNT(*) FROM users');
  const count = parseInt(countRes.rows[0]?.count || '0', 10);

  if (count === 0) {
    console.log(`[Database] Seeding initial admin account '${config.initialAdmin.username}'...`);
    const passwordHash = await hashPassword(config.initialAdmin.password);
    await query(
      `INSERT INTO users (username, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        config.initialAdmin.username,
        config.initialAdmin.email,
        passwordHash,
        config.initialAdmin.displayName,
        'admin',
      ]
    );
    console.log('[Database] Initial admin user seeded successfully.');
  }
}

async function seedDefaultClients(): Promise<void> {
  const check = await query('SELECT * FROM oidc_clients WHERE client_id = $1', ['komga-oidc']);
  if (check.rows.length === 0) {
    const secretHash = await hashPassword('komga_homelab_secret_2026');
    await query(
      `INSERT INTO oidc_clients (client_id, client_secret_hash, client_name, redirect_uris, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'komga-oidc',
        secretHash,
        'Komga Media Server',
        ['https://komga.homelab.internal/login/oauth2/code/homelab-idp', 'http://localhost:8080/login/oauth2/code/homelab-idp'],
        ['openid', 'profile', 'email'],
      ]
    );
  }

  const checkNextcloud = await query('SELECT * FROM oidc_clients WHERE client_id = $1', ['nextcloud-oidc']);
  if (checkNextcloud.rows.length === 0) {
    const secretHash = await hashPassword('nextcloud_homelab_secret_2026');
    await query(
      `INSERT INTO oidc_clients (client_id, client_secret_hash, client_name, redirect_uris, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'nextcloud-oidc',
        secretHash,
        'Nextcloud Storage',
        ['https://cloud.homelab.internal/apps/user_oidc/code', 'http://localhost:8081/apps/user_oidc/code'],
        ['openid', 'profile', 'email'],
      ]
    );
  }
}

async function seedDefaultVault(): Promise<void> {
  const existing = await query('SELECT * FROM vault_credentials');
  if (existing.rows.length === 0) {
    const samples = [
      {
        service_name: 'Nginx Proxy Manager',
        category: 'Network',
        service_url: 'http://npm.homelab.internal:81',
        username: 'admin@homelab.internal',
        password: 'ChangeMe_NPM_Admin_2026!',
        notes: 'Master reverse proxy configuration dashboard',
      },
      {
        service_name: 'Navidrome Music Streamer',
        category: 'Media',
        service_url: 'https://music.homelab.internal',
        username: 'audiophile_admin',
        password: 'VaultPass_Navidrome_Secret_99',
        notes: 'Connected via Subsonic API to mobile clients',
      },
      {
        service_name: 'Proxmox VE Cluster',
        category: 'Infrastructure',
        service_url: 'https://192.168.1.100:8006',
        username: 'root@pam',
        password: 'PVE_Cluster_Master_Node01#',
        notes: 'API Token ID: root@pam!backup-token',
      },
      {
        service_name: 'Pi-hole DNS & AdBlock',
        category: 'Network',
        service_url: 'http://pihole.homelab.internal/admin',
        username: 'admin',
        password: 'SecurePiHolePassword_2026',
        notes: 'Primary DNS server: 192.168.1.2',
      },
    ];

    for (const item of samples) {
      const encPass = encryptAesGcm(item.password, config.vaultSecretKey);
      const encNotes = encryptAesGcm(item.notes, config.vaultSecretKey);
      await query(
        `INSERT INTO vault_credentials (service_name, category, service_url, username, encrypted_password, encrypted_notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.service_name, item.category, item.service_url, item.username, encPass, encNotes]
      );
    }
  }
}
