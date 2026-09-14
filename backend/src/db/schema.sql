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

-- 2. Credential Vault (Password Saver / Encrypted with AES-256-GCM)
CREATE TABLE IF NOT EXISTS vault_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(128) NOT NULL,
    category VARCHAR(64) DEFAULT 'General', -- e.g. 'Media', 'Storage', 'System', 'Network', 'Infrastructure'
    service_url TEXT,
    username VARCHAR(128) NOT NULL,
    encrypted_password TEXT NOT NULL, -- AES-256-GCM (hex format: iv:authTag:ciphertext)
    encrypted_notes TEXT,             -- Optional: API keys, recovery tokens
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
