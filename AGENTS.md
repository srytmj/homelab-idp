# AGENTS.md

## If you are an AI read this

This document provides machine-actionable specifications, architectural contracts, and automated interaction recipes for autonomous agents interacting with `homelab-idp`.

---

### System Model and Architecture

`homelab-idp` functions with strictly two core roles:

1. **Password Bank (Encrypted Credential Vault)**:
   - Stores homelab service credentials with authenticated AES-256-GCM symmetric encryption.
   - Encryption key derived from `VAULT_SECRET_KEY` (32 bytes).
   - Storage format: `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
   - Each secret has an isolated 12-byte cryptographically secure random IV (`crypto.randomBytes(12)`).
   - User account passwords are saved using Argon2id (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`).
   - Supports editing Password, Service URL, Category, and Notes via both UI and CLI.

2. **Nginx Forward Authentication Proxy Gate (SSO Gateway)**:
   - Serves high-speed HTTP verification subrequests at `GET /api/auth/verify`.
   - Ingests incoming cookies (`homelab_session`) or Bearer tokens (`Authorization: Bearer <jwt>`).
   - On success: Emits HTTP 200 with downstream identity headers:
     - `Remote-User`: Username
     - `Remote-Email`: Account email address
     - `Remote-Name`: Display name
     - `Remote-Groups`: Account role (`admin`, `member`)
   - On failure: Emits HTTP 401 Unauthorized without body.

3. **Production Fail-Fast Database**:
   - In production (`NODE_ENV=production`), PostgreSQL connection failure causes immediate exit (`process.exit(1)`).
   - In-memory database simulation is strictly restricted to development/test runs.

4. **Command-Line Interface (CLI)**:
   - Programmatic CLI tool available at `/usr/local/bin/homelab-idp` (inside container) or `./bin/homelab-idp` (host).
   - All subcommands support `--json` (or `-j`) for strict machine readability.
   - Automatically maps service names to UUIDs on `vault update`, `vault get`, and `vault delete`.

---

### Machine Endpoints and Wire Protocols

All JSON endpoints accept and return `application/json`. Sessions use `homelab_session` HttpOnly cookie or standard HTTP Authorization Bearer token header.

| Endpoint | Method | Purpose | Authentication |
|---|---|---|---|
| `/api/health` | `GET` | Container / service readiness probe | None |
| `/api/auth/register` | `POST` | Programmatic SSO user registration | None |
| `/api/auth/login` | `POST` | Authenticate username + password | None (Rate limited: 10/min) |
| `/api/auth/logout` | `POST` | Invalidate cookie session | Session / Bearer |
| `/api/auth/me` | `GET` | Inspect current user identity | Session / Bearer |
| `/api/auth/profile` | `PUT` | Update username, email, display name, password | Session / Bearer |
| `/api/auth/verify` | `GET` | Forward Auth subrequest gate | Session / Bearer |
| `/api/vault` | `GET` / `POST` | Credential listing & creation | Session / Bearer |
| `/api/vault/:id` | `PUT` / `DELETE` | Credential update & deletion | Session / Bearer |

---

### Autonomous Agent CLI Recipes (Zero-Browser Automation)

When executing inside or alongside the container, preference should be given to the native CLI with `--json`.

#### 1. Generate an Immediate Bearer Token for API Operations
Agents do not need to issue POST requests to `/api/auth/login` to obtain an authentication token:
```bash
homelab-idp token generate --username admin --hours 24 --json
```
Output:
```json
{
  "token": "<signed_bearer_token>",
  "expires_in_hours": 24,
  "user": {
    "id": "uuid",
    "username": "admin"
  }
}
```

#### 2. Register an SSO User
```bash
homelab-idp user add \
  --username "agent_subsystem" \
  --email "agent@homelab.local" \
  --password "SecureGeneratedPass99#" \
  --name "AI Subsystem" \
  --role member \
  --json
```

#### 3. Save, Query, and Update Encrypted Vault Credentials
```bash
# Add secret
homelab-idp vault add \
  --service "PostgreSQL Master" \
  --username "postgres" \
  --password "db_pass_123" \
  --url "postgres://10.0.0.5:5432" \
  --category "Database" \
  --json

# Query secrets with decrypted passwords
homelab-idp vault list --query "postgres" --reveal --json

# Inspect single secret by service name
homelab-idp vault get "PostgreSQL Master" --reveal --json

# Update password directly by service name (no UUID required)
homelab-idp vault update "PostgreSQL Master" --password "NewSecureDbPass2026!" --json

# Delete secret by service name
homelab-idp vault delete "PostgreSQL Master" --json
```

#### 4. Verify Forward Authentication
```bash
homelab-idp forward-auth test --token "<jwt_token>" --json
```
Output:
```json
{
  "status": 200,
  "message": "Authorized",
  "headers": {
    "Remote-User": "admin",
    "Remote-Email": "admin@homelab.local",
    "Remote-Name": "Homelab Administrator",
    "Remote-Groups": "admin"
  }
}
```

---

### HTTP API Recipes for AI Agents

#### 1. Programmatic User Registration
```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "new_operator",
    "email": "operator@homelab.local",
    "password": "StrongPassword2026!",
    "displayName": "Operator One"
  }'
```

#### 2. Programmatic Authentication (Obtaining a Session)
```bash
curl -s -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"change_this_master_password"}'
```

#### 3. Programmatic Secret Retrieval from Vault
```bash
curl -s -H "Authorization: Bearer <jwt_token>" "http://localhost:4000/api/vault?q=postgres"
```

---

### Error Handling Rules for Autonomous Systems

1. **HTTP 401 Unauthorized**: Session expired or invalid credentials. Call `/api/auth/login` or `homelab-idp token generate` to renew session.
2. **HTTP 409 Conflict**: Returned by `POST /api/auth/register` when the requested `username` or `email` already exists.
3. **HTTP 429 Too Many Requests**: Rate limiting active on login and register endpoints (10 requests per minute per IP). Apply exponential backoff.
4. **Database Mode**: If PostgreSQL is unreachable in production (`NODE_ENV=production`), the application terminates (`exit 1`) to avoid data confusion. In development/test, it falls back to ephemeral memory store.
