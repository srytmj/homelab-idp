# 🚀 homelab-idp

**Homelab Identity Provider & Credential Vault**  
Sistem Single-Sign-On (SSO) internal dan pengelola kredensial terenkripsi mandiri untuk ekosistem homelab pribadi, dilengkapi antarmuka web modern dengan desain **minimalis monokrom profesional**.

---

## 🌟 Fitur Utama

1. **Lightweight OIDC / OAuth2 Provider**:
   - Menerbitkan ID Token berstandar JWT (`RS256`) dan JWKS endpoint (`/.well-known/jwks.json`).
   - Mendukung integrasi native OIDC dengan aplikasi homelab seperti **Komga**, **Nextcloud**, **Audiobookshelf**, dll.
   - Endpoint discovery standar: `/.well-known/openid-configuration`.
   - Layar consent interaktif dengan visual scopes review.

2. **Reverse Proxy Forward Auth Engine**:
   - Endpoint verifikasi cepat: `GET /api/auth/verify`.
   - Menginjeksi header identitas terverifikasi untuk upstream service:
     - `Remote-User: <username>`
     - `Remote-Email: <email>`
     - `Remote-Name: <display_name>`
     - `Remote-Groups: <role>`
   - Mudah dipasangkan dengan **Nginx Proxy Manager (NPM)**, **Traefik**, atau **Caddy** untuk melindungi layanan seperti Navidrome, Filebrowser, StreamVault, Proxmox, dsb.

3. **Encrypted Credential Vault (Password Saver)**:
   - Penyimpanan kredensial mandiri dengan enkripsi tingkat militer **AES-256-GCM**.
   - Setiap password dan catatan terenkripsi dengan **Initialization Vector (IV) 12-byte acak** dan tag otentikasi.
   - Fitur pencarian instan (real-time instant search) dan filter kategori (`Media`, `Storage`, `Infrastructure`, `Network`, `System`, `General`).
   - One-click copy untuk username dan password dengan feedback toast.
   - Dot-masked password view dengan toggle Show/Hide.
   - Built-in **Entropy Password Generator** (customizable length, numbers, symbols, strength meter).

4. **Minimalist Monochrome UI**:
   - Desain profesional, clean, berdensitas tinggi, dan bebas gaya "AI slop".
   - Skema warna monokrom presisi tinggi (`#09090b` / `#111113`, crisp borders `#27272a`, stark contrast white accents `#fafafa`).
   - Tampilan Grid Card dan Table View yang responsif dan cepat.
   - Modal konfigurasi Nginx Proxy Manager dan OIDC Client Registry langsung dari UI.

---

## 📁 Struktur Monorepo

```
homelab-idp/
├── backend/                  # Fastify + TypeScript Backend
│   ├── src/
│   │   ├── config/env.ts     # Konfigurasi & Environment parsing
│   │   ├── crypto/           # AES-256-GCM, Argon2id, JWKS & JWT utils
│   │   ├── db/               # PostgreSQL pool, auto-migrations, memory fallback
│   │   ├── middleware/       # Session & Role authentication
│   │   ├── routes/           # Auth, Forward Auth, OIDC Provider, Vault
│   │   ├── app.ts            # Fastify server setup & SPA static serving
│   │   └── index.ts          # Server entrypoint
│   ├── test/                 # Test suite komprehensif
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Vite + React (TypeScript) + Tailwind CSS (Monochrome UI)
│   ├── src/
│   │   ├── api/client.ts     # Typed REST API client
│   │   ├── components/       # Modals, Toast, Password Generator, Navbar
│   │   ├── pages/            # Login, Consent, Vault Dashboard
│   │   ├── App.tsx
│   │   └── index.css         # Clean monochrome design tokens
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── Dockerfile                # Multi-stage build container
├── docker-compose.yml        # Orchestration homelab network
├── .env.example              # Template konfigurasi environment
└── README.md
```

---

## 🚀 Quick Start (Docker Deployment)

### 1. Salin file environment

```bash
cp .env.example .env
```

Sesuaikan nilai pada `.env`:
- `JWT_SECRET`: String acak 64 karakter untuk signing session.
- `VAULT_SECRET_KEY`: Kunci rahasia 32-byte (string atau hex 64 karakter) untuk AES-256-GCM.
- `DATABASE_URL`: Koneksi ke PostgreSQL 17 homelab Anda.
- `INITIAL_ADMIN_USERNAME` & `INITIAL_ADMIN_PASSWORD`: Akun administrator awal yang dibuat otomatis saat database masih kosong.

### 2. Jalankan dengan Docker Compose

Pastikan Docker external network `homelab-net` sudah ada:

```bash
docker network create homelab-net || true
docker compose up -d --build
```

Aplikasi akan berjalan pada port **8300** (host) -> port **4000** (container):
- **Web UI & Vault**: `http://<homelab-ip>:8300/`
- **OIDC Discovery**: `http://<homelab-ip>:8300/.well-known/openid-configuration`
- **Forward Auth Verify**: `http://<homelab-ip>:8300/api/auth/verify`

---

## 🔒 Security & Cryptography Standards

1. **Argon2id**:
   - Login password akun di-hash menggunakan algoritma **Argon2id** (memory cost 64MB, time cost 3, parallelism 4), standar tertinggi perlindungan brute-force dan GPU attack.
2. **AES-256-GCM**:
   - Password dan catatan vault dienkripsi secara independen.
   - IV unik 12-byte dihasilkan secara kriptografis (`crypto.randomBytes(12)`) per entri.
   - Format penyimpanan dalam database: `iv:authTag:ciphertext` (dalam format hex).
   - Verifikasi integritas ciphertext otomatis mendeteksi perubahan atau manipulasi data.
3. **RS256 & JWKS**:
   - ID Token OIDC ditandatangani menggunakan RSA 2048-bit key pair. Public key dipublikasikan di endpoint `/.well-known/jwks.json`.

---

## 🛡️ Panduan Konfigurasi Nginx Proxy Manager (Forward Auth)

Untuk melindungi layanan apa pun di homelab Anda (misal: Navidrome, StreamVault, Filebrowser) dengan Single Sign-On:

1. Buka **Nginx Proxy Manager** dashboard.
2. Pilih **Proxy Hosts** -> Tambah atau edit host yang ingin dilindungi.
3. Buka tab **Advanced**, lalu tempelkan konfigurasi berikut:

```nginx
# ============================================================
# Nginx Proxy Manager - Forward Auth via homelab-idp
# ============================================================

# 1. Forward Auth Verification Request
location /npm-auth-verify {
    internal;
    proxy_pass http://homelab-idp:4000/api/auth/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $http_host;
}

# 2. Protect Root Routes with Forward Auth
location / {
    auth_request /npm-auth-verify;

    # Inject identity headers from homelab-idp to downstream service
    auth_request_set $remote_user $upstream_http_remote_user;
    auth_request_set $remote_email $upstream_http_remote_email;
    auth_request_set $remote_name $upstream_http_remote_name;

    proxy_set_header Remote-User $remote_user;
    proxy_set_header Remote-Email $remote_email;
    proxy_set_header Remote-Name $remote_name;

    # Redirect ke IDP jika belum login
    error_page 401 = @error401;

    proxy_pass $forward_scheme://$server:$port;
}

# 3. Redirect Handler
location @error401 {
    return 302 https://idp.yourdomain.com/login?rd=$scheme://$http_host$request_uri;
}
```

---

## 🌐 Panduan Integrasi OIDC (Komga / Nextcloud)

### Contoh Konfigurasi Komga (`application.yml`):

```yaml
komga:
  oauth2:
    client:
      homelab-idp:
        client-id: komga-oidc
        client-secret: <your_generated_client_secret>
        client-name: Homelab IDP
        scope: openid,profile,email
        issuer-uri: https://idp.yourdomain.com
```

### Pendaftaran Client di UI:
1. Buka dashboard `homelab-idp`.
2. Klik tombol **OIDC Clients** di navigasi atas.
3. Masukkan nama aplikasi (misal `Komga`) dan daftar Redirect URI yang diizinkan (misal `https://komga.yourdomain.com/login/oauth2/code/homelab-idp`).
4. Simpan dan salin `client_id` serta `client_secret` yang dihasilkan.

---

## 🧪 Menjalankan Tests & Local Development

Untuk menjalankan unit and integration test suite:

```bash
cd backend
npm test
```

Untuk menjalankan development server (Vite + Fastify):

```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

---

## 📄 Lisensi
MIT License © 2026 homelab-idp.
