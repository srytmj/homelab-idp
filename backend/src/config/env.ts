import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or backend directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

function requireSecret(name: string, minLength: number): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `Missing or insufficient ${name}: must be set to a random value of at least ${minLength} characters. ` +
        `Refusing to start with a default/fallback secret.`
    );
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: (process.env.APP_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/homelab_idp?sslmode=disable',
  vaultSecretKey: requireSecret('VAULT_SECRET_KEY', 32),
  jwtSecret: requireSecret('JWT_SECRET', 32),
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '720', 10),
  initialAdmin: {
    username: process.env.INITIAL_ADMIN_USERNAME || 'admin',
    password: process.env.INITIAL_ADMIN_PASSWORD || 'change_this_master_password',
    email: process.env.INITIAL_ADMIN_EMAIL || 'admin@suryatmaja.dev',
    displayName: process.env.INITIAL_ADMIN_NAME || 'Homelab Administrator',
  },
};
