-- Database Schema for homelab-idp
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table (Master homelab admin / accounts)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(128),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'admin', -- 'admin' or 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. OIDC Registered Clients (Komga, Nextcloud, dsb.)
CREATE TABLE IF NOT EXISTS oidc_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR(64) UNIQUE NOT NULL,
    client_secret_hash TEXT NOT NULL,
    client_name VARCHAR(128) NOT NULL,
    redirect_uris TEXT[] NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. OIDC Auth Codes & Active Sessions
CREATE TABLE IF NOT EXISTS oidc_auth_codes (
    code VARCHAR(128) PRIMARY KEY,
    client_id VARCHAR(64) REFERENCES oidc_clients(client_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    scope TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- 4. Credential Vault (Password Saver)
CREATE TABLE IF NOT EXISTS vault_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(128) NOT NULL,
    category VARCHAR(64) DEFAULT 'General', -- e.g. 'Media', 'Storage', 'System', 'Network'
    service_url TEXT,
    username VARCHAR(128) NOT NULL,
    encrypted_password TEXT NOT NULL, -- AES-256-GCM (hex format of iv:authTag:ciphertext)
    encrypted_notes TEXT,             -- Optional: API keys, recovery tokens
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
