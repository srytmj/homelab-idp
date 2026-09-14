# homelab-idp

Self-hosted identity provider, forward authentication gateway, and encrypted credential vault for homelab environments.

---

## If you are an AI read this

If you are an autonomous AI agent, coding assistant, or machine operator interacting with this repository, observe the following architectural contracts and execution rules:

- **System Role**: `homelab-idp` operates as a dual-purpose security boundary: an RFC-compliant OpenID Connect / OAuth 2.0 Authorization Server and an AES-256-GCM encrypted credential vault with Forward Auth reverse proxy injection.
- **Machine Specifications**: Refer to [AGENTS.md](file:///root/homelab-idp/AGENTS.md) for full wire protocols, API schema tables, automation recipes, and error handling guidelines.
- **CLI for Agents**: You do not need to operate the web browser or simulate UI interactions. Use the native `homelab-idp` CLI with the `--json` flag to inspect and configure the system:
  - Add SSO user: `homelab-idp user add --username <user> --email <email> --password <pass> --json`
  - Register OIDC client: `homelab-idp oidc register --name <app> --redirect-uri <uri> --json`
  - Manage vault secrets: `homelab-idp vault add/list/get --json`
  - Generate bearer token: `homelab-idp token generate --username <user> --json`
- **Machine Discovery**:
  - OpenID Configuration: `GET /.well-known/openid-configuration`
  - Public JWKS: `GET /.well-known/jwks.json`
  - Service Health Probe: `GET /api/health` -> `{"status":"healthy","app":"homelab-idp"}`
  - Proxy Forward Auth Gate: `GET /api/auth/verify` -> HTTP 200 with headers `Remote-User`, `Remote-Email`, `Remote-Name`, `Remote-Groups`, or HTTP 401.
- **Cryptographic Invariants**:
  - Account passwords use Argon2id (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`).
  - Secret vault entries are encrypted using AES-256-GCM with unique 12-byte random IVs in the format `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
  - OIDC ID Tokens are signed with RS256 using an RSA 2048-bit keypair.
- **Resilience**: The backend incorporates an automatic in-memory fallback database adapter if PostgreSQL is unavailable, enabling continuous test and mock environments without external dependencies.

---

## User Interface

### Vault Dashboard (Grid View)
![Vault Dashboard Grid View](docs/screenshots/02-vault-dashboard-grid.png)

### Vault Dashboard (Table View)
![Vault Dashboard Table View](docs/screenshots/03-vault-dashboard-table.png)

### Credential Entry Modal and Entropy Generator
![Credential Entry Modal](docs/screenshots/04-vault-modal.png)

### Single Sign-On Authentication
![Login Screen](docs/screenshots/01-login.png)

### OIDC Consent Screen
![OIDC Consent Screen](docs/screenshots/05-oidc-consent.png)

---

## Core Capabilities

1. **Lightweight OIDC / OAuth2 Provider**:
   - Issues standard JWT identity tokens signed with RS256.
   - Exposes standard JWKS (`/.well-known/jwks.json`) and discovery metadata (`/.well-known/openid-configuration`).
   - Native integration with homelab applications like Komga, Nextcloud, Audiobookshelf, Grafana, and Portainer.
   - Interactive consent confirmation workflow with requested scopes inspection.

2. **Reverse Proxy Forward Authentication**:
   - High-throughput verification endpoint at `GET /api/auth/verify`.
   - Injects verified identity headers to protected upstream services:
     - `Remote-User: <username>`
     - `Remote-Email: <email>`
     - `Remote-Name: <display_name>`
     - `Remote-Groups: <role>`
   - Compatible with Nginx Proxy Manager, Traefik, Caddy, and Envoy.

3. **Encrypted Credential Vault**:
   - AES-256-GCM authenticated encryption for all stored passwords and secrets.
   - 12-byte cryptographically random Initialization Vector (IV) generated per item.
   - Stored format: `iv:authTag:ciphertext` in hexadecimal encoding.
   - Real-time instant search across service names, usernames, URLs, categories, and notes.
   - One-click clipboard copy for usernames and passwords with toast confirmation.
   - Masked password toggle and built-in entropy password generator.

4. **Command-Line Interface (CLI)**:
   - Full command-line management for terminal users and AI agents.
   - User account registration, OIDC client registration, and encrypted vault operations.
   - Direct JWT token issuance for headless scripting.
   - Global `--json` flag across all commands for machine-parseable output.

5. **Minimalist Monochrome Interface**:
   - High data-density interface built with pure neutral grays, stark blacks, and crisp whites.
   - Zero unnecessary gradients, neon effects, or visual bloat.
   - Responsive switching between Card Grid and Table views.

---

## Command-Line Management (CLI)

`homelab-idp` includes a built-in CLI utility for managing SSO users, OIDC client applications, and encrypted vault entries directly from your terminal or shell scripts.

### Running the CLI

- **From repository root**:
  ```bash
  ./bin/homelab-idp <command> [options]
  # Or via npm
  npm run cli -- <command> [options]
  ```
- **From inside Docker container**:
  ```bash
  docker compose exec homelab-idp homelab-idp <command> [options]
  ```

---

### 1. User and SSO Management

#### Register / Add an SSO User
```bash
# Human readable
./bin/homelab-idp user add --username alice --email alice@homelab.local --password "SecretPassword123!" --name "Alice" --role member

# Output as JSON (for AI agents or scripts)
./bin/homelab-idp user add --username alice --email alice@homelab.local --password "SecretPassword123!" --json
```

#### List Registered Users
```bash
./bin/homelab-idp user list
./bin/homelab-idp user list --json
```

#### Update User Password
```bash
./bin/homelab-idp user passwd alice --password "NewSecurePassword2026!"
```

#### Delete User
```bash
./bin/homelab-idp user delete alice
```

---

### 2. OIDC Client Registration

#### Register a New Client Application
```bash
# Register Nextcloud
./bin/homelab-idp oidc register \
  --name "Nextcloud Storage" \
  --redirect-uri "https://cloud.homelab.local/apps/user_oidc/code"

# Register Komga with custom client ID
./bin/homelab-idp oidc register \
  --name "Komga Media" \
  --id "komga-oidc" \
  --redirect-uri "https://komga.homelab.local/login/oauth2/code/homelab-idp" \
  --json
```
*Note: The CLI returns both `client_id` and the generated `client_secret`.*

#### List Registered OIDC Clients
```bash
./bin/homelab-idp oidc list
./bin/homelab-idp oidc list --json
```

#### Delete an OIDC Client
```bash
./bin/homelab-idp oidc delete komga-oidc
```

---

### 3. Credential Vault Management

#### Add a Credential to the Vault
```bash
./bin/homelab-idp vault add \
  --service "Proxmox Cluster" \
  --username "root@pam" \
  --password "ClusterRootP@ssword2026" \
  --url "https://192.168.1.100:8006" \
  --category "Infrastructure" \
  --notes "Cluster master node"
```

#### List Vault Credentials
```bash
# List with passwords masked
./bin/homelab-idp vault list

# List with passwords decrypted
./bin/homelab-idp vault list --reveal

# Search credentials and output JSON
./bin/homelab-idp vault list --query "proxmox" --reveal --json
```

#### Inspect / Retrieve a Credential
```bash
./bin/homelab-idp vault get "Proxmox Cluster" --reveal
./bin/homelab-idp vault get "Proxmox Cluster" --reveal --json
```

#### Update a Credential
```bash
./bin/homelab-idp vault update "Proxmox Cluster" --password "NewPvePassword2026!"
```

#### Delete a Credential
```bash
./bin/homelab-idp vault delete "Proxmox Cluster"
```

---

### 4. Direct Token Generation and Testing

#### Generate a Session / Bearer JWT Token
Generate a signed token for automated scripts without completing a browser login:
```bash
./bin/homelab-idp token generate --username admin --hours 24 --json
```

#### Test Forward Authentication with a Token
Simulate a reverse proxy subrequest to verify token headers:
```bash
./bin/homelab-idp forward-auth test --token "<jwt_token>"
```

---

## Quick Start (Docker Deployment)

### 1. Copy Environment Configuration

```bash
cp .env.example .env
```

Set the required secrets in `.env`:
- `JWT_SECRET`: Random 64-character string for signing session tokens.
- `VAULT_SECRET_KEY`: 32-byte secret key (hex or base64) for AES-256-GCM vault encryption.
- `DATABASE_URL`: Connection string to your PostgreSQL instance.
- `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`: Default administrator credentials for automatic seeding.

### 2. Launch with Docker Compose

Ensure the shared Docker external network `homelab-net` exists:

```bash
docker network create homelab-net || true
docker compose up -d --build
```

Access points:
- Web Interface and Vault: `http://<server-ip>:8300/`
- OIDC Discovery: `http://<server-ip>:8300/.well-known/openid-configuration`
- Forward Auth Verification: `http://<server-ip>:8300/api/auth/verify`

Default credentials: `admin` / `change_this_master_password`

---

## Setup and Service Integration Guide

### 1. Registering OIDC Clients

You can register OIDC clients either via the Web Dashboard or via the CLI:

```bash
docker compose exec homelab-idp homelab-idp oidc register \
  --name "Komga" \
  --redirect-uri "https://komga.yourdomain.com/login/oauth2/code/homelab-idp"
```

Save the displayed `client_id` and `client_secret`.

---

### 2. Native OIDC Service Integrations

#### Komga
Add the following to your Komga `application.yml` or configure via Docker environment variables:

```yaml
komga:
  oauth2:
    client:
      homelab-idp:
        client-id: komga-oidc
        client-secret: <your_client_secret>
        client-name: Homelab IDP
        scope: openid,profile,email
        issuer-uri: https://idp.yourdomain.com
```

#### Nextcloud
1. In Nextcloud, install and enable the **user_oidc** (OpenID Connect user backend) app from the app store.
2. Go to **Administration Settings** -> **OpenID Connect**.
3. Click **Add Provider**:
   - **Identifier**: `homelab-idp`
   - **Client ID**: `<your_client_id>`
   - **Client Secret**: `<your_client_secret>`
   - **Discovery Endpoint**: `https://idp.yourdomain.com/.well-known/openid-configuration`
   - **Scope**: `openid profile email`
4. Save the configuration. Nextcloud will now offer single sign-on via `homelab-idp`.

#### Audiobookshelf
1. Open Audiobookshelf **Settings** -> **Authentication**.
2. Enable **OpenID Connect (OIDC)**:
   - **Issuer URL**: `https://idp.yourdomain.com`
   - **Client ID**: `<your_client_id>`
   - **Client Secret**: `<your_client_secret>`
   - **Button Text**: `Login with Homelab IDP`
3. Set the callback URL in `homelab-idp` client redirect URIs to:  
   `https://audiobookshelf.yourdomain.com/auth/openid/callback`

#### Grafana
In your Grafana configuration file (`grafana.ini`) or environment variables:

```ini
[auth.generic_oauth]
enabled = true
name = Homelab IDP
allow_sign_up = true
client_id = <your_client_id>
client_secret = <your_client_secret>
scopes = openid profile email
auth_url = https://idp.yourdomain.com/api/oauth/authorize
token_url = https://idp.yourdomain.com/api/oauth/token
api_url = https://idp.yourdomain.com/api/oauth/userinfo
auto_login = false
```

#### Portainer CE
1. Navigate to **Settings** -> **Authentication** in Portainer.
2. Select **OAuth** as the authentication provider.
3. Configure the fields:
   - **Provider**: `Custom`
   - **Client ID**: `<your_client_id>`
   - **Client Secret**: `<your_client_secret>`
   - **Authorization URL**: `https://idp.yourdomain.com/api/oauth/authorize`
   - **Access Token URL**: `https://idp.yourdomain.com/api/oauth/token`
   - **Resource URL**: `https://idp.yourdomain.com/api/oauth/userinfo`
   - **Redirect URL**: Displayed by Portainer (add this exact URL to `homelab-idp` redirect URIs).
   - **User Identifier**: `sub` or `username`
   - **Scopes**: `openid profile email`

#### Custom Node.js / Python Web Applications
Any standard OpenID Connect client library works out-of-the-box. Example with standard `openid-client` (Node.js):

```javascript
import { Issuer } from 'openid-client';

const homelabIssuer = await Issuer.discover('https://idp.yourdomain.com');
const client = new homelabIssuer.Client({
  client_id: 'my-custom-app',
  client_secret: 'sec_...',
  redirect_uris: ['https://my-app.yourdomain.com/callback'],
  response_types: ['code'],
});

// Step 1: Redirect user to authorization URL
const authorizationUrl = client.authorizationUrl({
  scope: 'openid profile email',
  state: 'random_state_string',
});

// Step 2: Handle callback and exchange code
const params = client.callbackParams(req);
const tokenSet = await client.callback('https://my-app.yourdomain.com/callback', params, { state: 'random_state_string' });
const claims = tokenSet.claims();
console.log('User identity:', claims.preferred_username, claims.email);
```

---

### 3. Forward Authentication Setup

Forward Authentication lets you protect applications that lack native OAuth/OIDC support (such as Navidrome, Filebrowser, StreamVault, qBittorrent, and Proxmox) by delegating authentication checks to `homelab-idp`.

#### Nginx Proxy Manager (NPM)

1. Open your **Nginx Proxy Manager** administrative dashboard.
2. Edit or add the **Proxy Host** for the application you want to protect.
3. Go to the **Advanced** tab.
4. Paste the following configuration snippet:

```nginx
# ============================================================
# Nginx Proxy Manager - Forward Auth via homelab-idp
# ============================================================

# 1. Forward Auth Verification Subrequest
location /npm-auth-verify {
    internal;
    proxy_pass http://homelab-idp:4000/api/auth/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $http_host;
}

# 2. Guard Root Routes and Inject Headers
location / {
    auth_request /npm-auth-verify;

    # Capture identity headers returned by homelab-idp
    auth_request_set $remote_user $upstream_http_remote_user;
    auth_request_set $remote_email $upstream_http_remote_email;
    auth_request_set $remote_name $upstream_http_remote_name;

    # Inject identity headers to downstream application
    proxy_set_header Remote-User $remote_user;
    proxy_set_header Remote-Email $remote_email;
    proxy_set_header Remote-Name $remote_name;

    # Redirect unauthenticated requests to login
    error_page 401 = @error401;
    proxy_pass $forward_scheme://$server:$port;
}

# 3. Redirect Handler
location @error401 {
    return 302 https://idp.yourdomain.com/login?rd=$scheme://$http_host$request_uri;
}
```

#### Traefik v2 / v3
Define a ForwardAuth middleware in your Traefik dynamic configuration:

```yaml
http:
  middlewares:
    homelab-auth:
      forwardAuth:
        address: "http://homelab-idp:4000/api/auth/verify"
        authResponseHeaders:
          - "Remote-User"
          - "Remote-Email"
          - "Remote-Name"
          - "Remote-Groups"

  routers:
    navidrome:
      rule: "Host(`music.yourdomain.com`)"
      service: "navidrome"
      middlewares:
        - "homelab-auth"
```

#### Caddy
In your `Caddyfile`:

```caddy
music.yourdomain.com {
    forward_auth http://homelab-idp:4000 {
        uri /api/auth/verify
        copy_headers Remote-User Remote-Email Remote-Name
    }
    reverse_proxy http://navidrome:4533
}
```

#### Configuring Downstream Upstream Services

- **Navidrome**: Set environment variable `ND_REVERSEPROXYUSERHEADER=Remote-User`. Navidrome will automatically log in the user based on the header.
- **Filebrowser**: Run Filebrowser with flags `--auth.method=proxy --auth.header=Remote-User`.
- **Custom APIs**: Inspect `req.headers['remote-user']` or `request.headers.get('Remote-User')`.

---

## Security and Cryptography

1. **Argon2id Password Hashing**:
   - Master account passwords are encrypted using Argon2id with OWASP-recommended parameters:
     - Memory cost: 64 MB
     - Time cost: 3 iterations
     - Parallelism: 4 threads

2. **AES-256-GCM Vault Encryption**:
   - Each secret entry is encrypted with an isolated 12-byte random IV.
   - Authentication tags are checked upon decryption to prevent ciphertext tampering.
   - Ciphertexts are stored in the format: `iv:authTag:ciphertext`.

3. **RSA 2048-bit JWKS Signing**:
   - OIDC ID tokens are signed using RS256.
   - Public keys are exposed via standard JWKS format at `/.well-known/jwks.json`.

---

## API Reference

### Authentication
- `POST /api/auth/register`: Programmatically registers a new SSO user account (`username`, `email`, `password`, `displayName`, `role`).
- `POST /api/auth/login`: Authenticates with username and password, sets `homelab_session` cookie. Rate limited.
- `POST /api/auth/logout`: Clears session cookie.
- `GET /api/auth/me`: Returns current authenticated user profile.

### Forward Auth
- `GET /api/auth/verify`: Verifies incoming session or bearer token. Returns HTTP 200 with identity headers, or HTTP 401.

### OIDC Endpoints
- `GET /.well-known/openid-configuration`: OpenID Provider metadata.
- `GET /.well-known/jwks.json`: Public JSON Web Key Set.
- `GET /api/oauth/authorize`: Authorization code initiation.
- `POST /api/oauth/authorize`: Consent decision submission.
- `POST /api/oauth/token`: Code-to-token exchange.
- `GET /api/oauth/userinfo`: Authenticated user claims.

### Credential Vault
- `GET /api/vault`: Lists decrypted vault entries with optional query filter (`?q=`) and category filter (`?category=`).
- `POST /api/vault`: Encrypts and stores a new credential entry.
- `PUT /api/vault/:id`: Updates an existing credential entry.
- `DELETE /api/vault/:id`: Deletes a credential entry.

---

## Testing and Development

Run the integration test suite:

```bash
npm run test
```

Build all packages:

```bash
npm run build
```

Start the application:

```bash
npm start
```

---

## License

MIT License. Copyright (c) 2026 homelab-idp.
