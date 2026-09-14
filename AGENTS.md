# AGENTS.md

## If you are an AI read this

This document provides machine-actionable specifications, architectural contracts, and automated interaction recipes for autonomous agents interacting with `homelab-idp`.

---

### System Model and Architecture

`homelab-idp` functions as a unified identity boundary and secret manager for homelab infrastructure:

1. **OIDC/OAuth2 Authorization Server**:
   - Implements RFC 6749 (OAuth 2.0) and OpenID Connect Core 1.0 (Authorization Code Flow).
   - Issues RS256-signed identity tokens using RSA 2048-bit keypairs generated at startup.
   - Exposes standard JWKS key sets at `/.well-known/jwks.json`.
   - Exposes OpenID Provider Metadata at `/.well-known/openid-configuration`.

2. **Forward Authentication Proxy Interceptor**:
   - Serves high-speed HTTP verification subrequests at `GET /api/auth/verify`.
   - Ingests incoming cookies (`homelab_session`) or Bearer tokens (`Authorization: Bearer <jwt>`).
   - On success: Emits HTTP 200 with downstream identity headers:
     - `Remote-User`: Username
     - `Remote-Email`: Account email address
     - `Remote-Name`: Display name
     - `Remote-Groups`: Account role (`admin`, `user`)
   - On failure: Emits HTTP 401 Unauthorized without body.

3. **Encrypted Credential Vault**:
   - Stores homelab service credentials with authenticated AES-256-GCM symmetric encryption.
   - Encryption key derived from `VAULT_SECRET_KEY` (32 bytes).
   - Storage format: `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
   - Each secret has an isolated 12-byte cryptographically secure random IV (`crypto.randomBytes(12)`).
   - Passwords for user logins are hashed with Argon2id (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`).

---

### Machine Endpoints and Wire Protocols

All JSON endpoints accept and return `application/json`. Sessions use `homelab_session` HttpOnly cookie or standard HTTP Authorization Bearer token header.

| Endpoint | Method | Purpose | Authentication |
|---|---|---|---|
| `/api/health` | `GET` | Container / service readiness probe | None |
| `/.well-known/openid-configuration` | `GET` | RFC 8414 OAuth 2.0 / OIDC Discovery | None |
| `/.well-known/jwks.json` | `GET` | RFC 7517 Public Key Keyset | None |
| `/api/auth/login` | `POST` | Authenticate username + password | None (Rate limited: 10/min) |
| `/api/auth/logout` | `POST` | Invalidate cookie session | Session / Bearer |
| `/api/auth/me` | `GET` | Inspect current user identity | Session / Bearer |
| `/api/auth/verify` | `GET` | Forward Auth subrequest gate | Session / Bearer |
| `/api/oauth/authorize` | `GET` / `POST` | Authorization Code initiation & consent | Session / Bearer |
| `/api/oauth/token` | `POST` | Exchange auth code for ID & access tokens | Basic Auth / Form body |
| `/api/oauth/userinfo` | `GET` | Return OpenID user claims | Bearer Access Token |
| `/api/oidc/clients` | `GET` / `POST` | OIDC Client Registry management | Admin role required |
| `/api/oidc/clients/:id` | `DELETE` | Revoke OIDC client registration | Admin role required |
| `/api/vault` | `GET` / `POST` | Credential listing & creation | Session / Bearer |
| `/api/vault/:id` | `PUT` / `DELETE` | Credential update & deletion | Session / Bearer |

---

### Machine Interaction Recipes for AI Agents

#### 1. Programmatic Authentication (Obtaining a Session)

```bash
curl -s -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"change_this_master_password"}'
```

Response format:
```json
{
  "token": "<jwt_string>",
  "user": {
    "id": "c1f7b0e1-4c17-48f8-a15d-000000000001",
    "username": "admin",
    "email": "admin@homelab.internal",
    "displayName": "Administrator",
    "role": "admin"
  }
}
```

#### 2. Registering a New OIDC Client Application

To dynamically attach a service (e.g., Grafana, Nextcloud) to `homelab-idp`:

```bash
curl -s -b cookies.txt -X POST http://localhost:4000/api/oidc/clients \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Grafana Homelab",
    "redirect_uris": [
      "https://grafana.homelab.internal/login/generic_oauth"
    ]
  }'
```

Response format:
```json
{
  "client": {
    "id": "18fbd862-4303-4903-b09e-7117e3f9a76d",
    "client_id": "grafana-homelab",
    "client_name": "Grafana Homelab",
    "redirect_uris": ["https://grafana.homelab.internal/login/generic_oauth"],
    "created_at": "2026-09-14T05:00:00.000Z"
  },
  "client_secret": "sec_b3f9..."
}
```
*Note: `client_secret` is returned only once at creation time.*

#### 3. Automated Token Exchange (Authorization Code Grant)

Step A: Initiate authorization:
```bash
curl -s -b cookies.txt -X POST http://localhost:4000/api/oauth/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "grafana-homelab",
    "redirect_uri": "https://grafana.homelab.internal/login/generic_oauth",
    "scope": "openid profile email",
    "action": "allow"
  }'
```
Response:
```json
{
  "code": "auth_code_hex_string",
  "redirect_url": "https://grafana.homelab.internal/login/generic_oauth?code=auth_code_hex_string"
}
```

Step B: Exchange code for tokens:
```bash
curl -s -X POST http://localhost:4000/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=auth_code_hex_string" \
  -d "redirect_uri=https://grafana.homelab.internal/login/generic_oauth" \
  -d "client_id=grafana-homelab" \
  -d "client_secret=sec_b3f9..."
```
Response:
```json
{
  "access_token": "<jwt_string>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "id_token": "<signed_rs256_jwt_string>"
}
```

#### 4. Programmatic Secret Retrieval from Vault

```bash
curl -s -b cookies.txt "http://localhost:4000/api/vault?q=postgres"
```
Response returns decrypted plaintext for authorized sessions:
```json
{
  "credentials": [
    {
      "id": "72c1823d-d0b2-4360-a49a-82cca6f7cc76",
      "service_name": "PostgreSQL Core",
      "category": "Infrastructure",
      "service_url": "postgres://localhost:5432",
      "username": "postgres",
      "password": "production_database_password",
      "notes": "Main homelab cluster"
    }
  ]
}
```

---

### Error Handling Rules for Autonomous Systems

1. **HTTP 401 Unauthorized**: Session expired or invalid credentials. Call `/api/auth/login` to renew session.
2. **HTTP 429 Too Many Requests**: Rate limiting active on login attempts (limit is 10 requests per minute per IP). Exponential backoff is recommended.
3. **HTTP 400 Invalid Redirect URI**: The `redirect_uri` supplied in `/api/oauth/authorize` must match one of the exact strings stored in `oidc_clients.redirect_uris`.
4. **Database Mode**: If PostgreSQL is unreachable at boot, the server logs a warning and engages an in-memory fallback adapter (`memoryFallback.ts`). All routes and cryptographic behaviors remain 100% operational in ephemeral mode.
