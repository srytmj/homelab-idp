import crypto from 'crypto';

interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url?: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

interface OidcClientRecord {
  id: string;
  client_id: string;
  client_secret_hash: string;
  client_name: string;
  redirect_uris: string[];
  scopes: string[];
  created_at: Date;
}

interface OidcAuthCodeRecord {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  expires_at: Date;
  used: boolean;
}

interface VaultCredentialRecord {
  id: string;
  service_name: string;
  category: string;
  service_url: string;
  username: string;
  encrypted_password: string;
  encrypted_notes: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * High-fidelity in-memory database simulation for testing and local environments
 * when PostgreSQL is not running.
 */
class MemoryDbStore {
  users: Map<string, UserRecord> = new Map();
  oidcClients: Map<string, OidcClientRecord> = new Map();
  oidcAuthCodes: Map<string, OidcAuthCodeRecord> = new Map();
  vaultCredentials: Map<string, VaultCredentialRecord> = new Map();

  query(sql: string, params: any[] = []): { rows: any[]; rowCount: number } {
    const trimmed = sql.trim().replace(/\s+/g, ' ');

    // 1. COUNT users
    if (/SELECT COUNT\(\*\) FROM users/i.test(trimmed)) {
      return { rows: [{ count: this.users.size.toString() }], rowCount: 1 };
    }

    // 2. SELECT users WHERE username = $1
    if (/SELECT \* FROM users WHERE username = \$1/i.test(trimmed)) {
      const username = params[0]?.toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.username.toLowerCase() === username || u.email.toLowerCase() === username
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 3. SELECT users WHERE id = $1
    if (/SELECT \* FROM users WHERE id = \$1/i.test(trimmed)) {
      const id = params[0];
      const user = this.users.get(id);
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 4. SELECT users (general)
    if (/SELECT .* FROM users/i.test(trimmed)) {
      const all = Array.from(this.users.values());
      return { rows: all.map((u) => ({ ...u })), rowCount: all.length };
    }

    // 5. INSERT INTO users
    if (/INSERT INTO users/i.test(trimmed)) {
      // params: [username, email, password_hash, display_name, role] or with id
      const id = params.length >= 6 ? params[0] : crypto.randomUUID();
      const offset = params.length >= 6 ? 1 : 0;
      const user: UserRecord = {
        id,
        username: params[offset],
        email: params[offset + 1],
        password_hash: params[offset + 2],
        display_name: params[offset + 3] || params[offset],
        role: params[offset + 4] || 'admin',
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.users.set(id, user);
      return { rows: [{ ...user }], rowCount: 1 };
    }

    // 6. OIDC Clients: SELECT * FROM oidc_clients WHERE client_id = $1
    if (/SELECT \* FROM oidc_clients WHERE client_id = \$1/i.test(trimmed)) {
      const clientId = params[0];
      const client = Array.from(this.oidcClients.values()).find((c) => c.client_id === clientId);
      return { rows: client ? [{ ...client }] : [], rowCount: client ? 1 : 0 };
    }

    // 7. OIDC Clients: SELECT * FROM oidc_clients ORDER BY
    if (/SELECT \* FROM oidc_clients/i.test(trimmed)) {
      const all = Array.from(this.oidcClients.values()).sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime()
      );
      return { rows: all.map((c) => ({ ...c })), rowCount: all.length };
    }

    // 8. OIDC Clients: INSERT INTO oidc_clients
    if (/INSERT INTO oidc_clients/i.test(trimmed)) {
      const id = crypto.randomUUID();
      const client: OidcClientRecord = {
        id,
        client_id: params[0],
        client_secret_hash: params[1],
        client_name: params[2],
        redirect_uris: Array.isArray(params[3]) ? params[3] : [params[3]],
        scopes: Array.isArray(params[4]) ? params[4] : ['openid', 'profile', 'email'],
        created_at: new Date(),
      };
      this.oidcClients.set(id, client);
      return { rows: [{ ...client }], rowCount: 1 };
    }

    // 9. OIDC Clients: DELETE FROM oidc_clients WHERE id = $1
    if (/DELETE FROM oidc_clients WHERE id = \$1/i.test(trimmed)) {
      const id = params[0];
      const existed = this.oidcClients.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    // 10. OIDC Auth Codes: INSERT INTO oidc_auth_codes
    if (/INSERT INTO oidc_auth_codes/i.test(trimmed)) {
      const codeRecord: OidcAuthCodeRecord = {
        code: params[0],
        client_id: params[1],
        user_id: params[2],
        redirect_uri: params[3],
        scope: params[4],
        expires_at: new Date(params[5]),
        used: false,
      };
      this.oidcAuthCodes.set(codeRecord.code, codeRecord);
      return { rows: [{ ...codeRecord }], rowCount: 1 };
    }

    // 11. OIDC Auth Codes: SELECT * FROM oidc_auth_codes WHERE code = $1
    if (/SELECT \* FROM oidc_auth_codes WHERE code = \$1/i.test(trimmed)) {
      const code = params[0];
      const rec = this.oidcAuthCodes.get(code);
      return { rows: rec ? [{ ...rec }] : [], rowCount: rec ? 1 : 0 };
    }

    // 12. OIDC Auth Codes: UPDATE oidc_auth_codes SET used = TRUE
    if (/UPDATE oidc_auth_codes SET used = TRUE/i.test(trimmed)) {
      const code = params[0];
      const rec = this.oidcAuthCodes.get(code);
      if (rec) {
        rec.used = true;
        return { rows: [{ ...rec }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 13. Vault: SELECT * FROM vault_credentials WHERE id = $1
    if (/SELECT \* FROM vault_credentials WHERE id = \$1/i.test(trimmed)) {
      const id = params[0];
      const rec = this.vaultCredentials.get(id);
      return { rows: rec ? [{ ...rec }] : [], rowCount: rec ? 1 : 0 };
    }

    // 14. Vault: SELECT * FROM vault_credentials
    if (/SELECT \* FROM vault_credentials/i.test(trimmed)) {
      let all = Array.from(this.vaultCredentials.values()).sort(
        (a, b) => b.updated_at.getTime() - a.updated_at.getTime()
      );
      return { rows: all.map((c) => ({ ...c })), rowCount: all.length };
    }

    // 15. Vault: INSERT INTO vault_credentials
    if (/INSERT INTO vault_credentials/i.test(trimmed)) {
      const id = crypto.randomUUID();
      const rec: VaultCredentialRecord = {
        id,
        service_name: params[0],
        category: params[1] || 'General',
        service_url: params[2] || '',
        username: params[3] || '',
        encrypted_password: params[4],
        encrypted_notes: params[5] || '',
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.vaultCredentials.set(id, rec);
      return { rows: [{ ...rec }], rowCount: 1 };
    }

    // 16. Vault: UPDATE vault_credentials SET
    if (/UPDATE vault_credentials/i.test(trimmed)) {
      // params: [service_name, category, service_url, username, encrypted_password, encrypted_notes, id]
      const id = params[6];
      const existing = this.vaultCredentials.get(id);
      if (existing) {
        existing.service_name = params[0];
        existing.category = params[1];
        existing.service_url = params[2];
        existing.username = params[3];
        existing.encrypted_password = params[4];
        existing.encrypted_notes = params[5];
        existing.updated_at = new Date();
        return { rows: [{ ...existing }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 17. Vault: DELETE FROM vault_credentials WHERE id = $1
    if (/DELETE FROM vault_credentials WHERE id = \$1/i.test(trimmed)) {
      const id = params[0];
      const existed = this.vaultCredentials.delete(id);
      return { rows: existed ? [{ id }] : [], rowCount: existed ? 1 : 0 };
    }

    // Catch-all for CREATE TABLE or extensions
    return { rows: [], rowCount: 0 };
  }
}

export const memoryDb = new MemoryDbStore();
