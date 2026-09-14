import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or backend directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: (process.env.APP_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/homelab_idp?sslmode=disable',
  vaultSecretKey: process.env.VAULT_SECRET_KEY || 'homelab_idp_default_vault_secret_key_32_bytes!',
  jwtSecret: process.env.JWT_SECRET || 'homelab_idp_default_jwt_secret_must_be_long_and_secure_64_chars_min_length',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '720', 10),
  initialAdmin: {
    username: process.env.INITIAL_ADMIN_USERNAME || 'admin',
    password: process.env.INITIAL_ADMIN_PASSWORD || 'change_this_master_password',
    email: process.env.INITIAL_ADMIN_EMAIL || 'admin@suryatmaja.dev',
    displayName: process.env.INITIAL_ADMIN_NAME || 'Homelab Administrator',
  },
};
