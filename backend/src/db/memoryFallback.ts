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
  vaultCredentials: Map<string, VaultCredentialRecord> = new Map();

  query(sql: string, params: any[] = []): { rows: any[]; rowCount: number } {
    const trimmed = sql.trim().replace(/\s+/g, ' ');

    // 1. COUNT users
    if (/SELECT COUNT\(\*\) FROM users/i.test(trimmed)) {
      return { rows: [{ count: this.users.size.toString() }], rowCount: 1 };
    }

    // 2. Check username or email: SELECT ... FROM users WHERE username = $1 OR email = $2
    if (/SELECT .* FROM users WHERE username = \$1 OR email = \$2/i.test(trimmed)) {
      const uVal = params[0]?.toLowerCase();
      const eVal = params[1]?.toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.username.toLowerCase() === uVal || u.email.toLowerCase() === eVal
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2a. SELECT ... FROM users WHERE id = $1 OR username = $2
    if (/SELECT .* FROM users WHERE (?:id = \$1 OR username = \$2|username = \$2 OR id = \$1)/i.test(trimmed)) {
      const idVal = params[0];
      const uVal = params[1]?.toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.id === idVal || u.username.toLowerCase() === uVal
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2b. SELECT ... FROM users WHERE username = $1 OR id = $1
    if (/SELECT .* FROM users WHERE (?:username = \$1 OR id = \$1|id = \$1 OR username = \$1)/i.test(trimmed)) {
      const target = params[0]?.toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.id === params[0] || u.username.toLowerCase() === target
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2c. SELECT ... FROM users WHERE username = $1 AND id != $2
    if (/SELECT .* FROM users WHERE username = \$1 AND id (?:!=|<>)/i.test(trimmed)) {
      const uVal = params[0]?.toLowerCase();
      const idVal = params[1];
      const user = Array.from(this.users.values()).find(
        (u) => u.username.toLowerCase() === uVal && u.id !== idVal
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2d. SELECT ... FROM users WHERE email = $1 AND id != $2
    if (/SELECT .* FROM users WHERE email = \$1 AND id (?:!=|<>)/i.test(trimmed)) {
      const eVal = params[0]?.toLowerCase();
      const idVal = params[1];
      const user = Array.from(this.users.values()).find(
        (u) => u.email.toLowerCase() === eVal && u.id !== idVal
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2e. SELECT ... FROM users WHERE username = $1
    if (/SELECT .* FROM users WHERE username = \$1/i.test(trimmed)) {
      const username = params[0]?.toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.username.toLowerCase() === username || u.email.toLowerCase() === username
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2f. SELECT ... FROM users WHERE LOWER(username) = LOWER($1)
    if (/SELECT .* FROM users WHERE LOWER\(username\) = LOWER\(\$1\)/i.test(trimmed)) {
      const username = (params[0] || '').toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.username.toLowerCase() === username
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 2g. SELECT ... FROM users WHERE email = $1
    if (/SELECT .* FROM users WHERE email = \$1/i.test(trimmed)) {
      const email = (params[0] || '').toLowerCase();
      const user = Array.from(this.users.values()).find(
        (u) => u.email.toLowerCase() === email
      );
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 3. Find user by id: SELECT ... FROM users WHERE id = $1
    if (/SELECT .* FROM users WHERE id = \$1/i.test(trimmed)) {
      const user = this.users.get(params[0]);
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // 4. List users
    if (/SELECT .* FROM users/i.test(trimmed) && !/WHERE/i.test(trimmed)) {
      return { rows: Array.from(this.users.values()), rowCount: this.users.size };
    }

    // 5. INSERT INTO users
    if (/INSERT INTO users/i.test(trimmed)) {
      const id = params.length >= 6 ? params[0] : crypto.randomUUID();
      const offset = params.length >= 6 ? 1 : 0;
      let role = params[offset + 4];
      if (!role) {
        if (/'admin'/i.test(trimmed)) {
          role = 'admin';
        } else {
          role = 'member';
        }
      }
      const user: UserRecord = {
        id,
        username: params[offset],
        email: params[offset + 1],
        password_hash: params[offset + 2],
        display_name: params[offset + 3] || params[offset],
        role,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.users.set(id, user);
      return { rows: [{ ...user }], rowCount: 1 };
    }

    // 5a. UPDATE users SET password_hash = $1
    if (/UPDATE users SET password_hash = \$1 WHERE id = \$2/i.test(trimmed)) {
      const user = this.users.get(params[1]);
      if (user) {
        user.password_hash = params[0];
        user.updated_at = new Date();
        return { rows: [{ ...user }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 5b. UPDATE users (general profile update)
    if (/UPDATE users SET/i.test(trimmed)) {
      let id = params[params.length - 1];
      let user = this.users.get(id);
      if (!user) {
        user = Array.from(this.users.values()).find((u) => u.id === id);
      }
      if (user) {
        if (/username = \$1/i.test(trimmed)) {
          user.username = params[0];
          user.email = params[1];
          user.display_name = params[2];
          if (/password_hash = \$4/i.test(trimmed)) {
            user.password_hash = params[3];
          }
        }
        user.updated_at = new Date();
        return { rows: [{ ...user }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 5c. DELETE FROM users WHERE id = $1 OR username = $1
    if (/DELETE FROM users/i.test(trimmed)) {
      const target = params[0];
      const user = Array.from(this.users.values()).find(
        (u) => u.id === target || u.username.toLowerCase() === target.toLowerCase()
      );
      if (user) {
        this.users.delete(user.id);
        return { rows: [{ ...user }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 6. Vault: SELECT ... FROM vault_credentials WHERE id = $1 (without OR)
    if (/SELECT .* FROM vault_credentials WHERE id = \$1(?:\s|$)/i.test(trimmed) && !/OR/i.test(trimmed)) {
      const id = params[0];
      const rec = this.vaultCredentials.get(id);
      return { rows: rec ? [{ ...rec }] : [], rowCount: rec ? 1 : 0 };
    }

    // 6a. Vault: SELECT ... FROM vault_credentials WHERE LOWER(service_name) = LOWER($1)
    if (/SELECT .* FROM vault_credentials WHERE LOWER\(service_name\) = LOWER\(\$1\)/i.test(trimmed)) {
      const target = (params[0] || '').toLowerCase();
      const rec = Array.from(this.vaultCredentials.values()).find(
        (v) => v.service_name.toLowerCase() === target
      );
      return { rows: rec ? [{ ...rec }] : [], rowCount: rec ? 1 : 0 };
    }

    // 6b. Vault: SELECT ... FROM vault_credentials WHERE LOWER(service_name) LIKE LOWER($1)
    if (/SELECT .* FROM vault_credentials WHERE LOWER\(service_name\) LIKE LOWER\(\$1\)/i.test(trimmed)) {
      const raw = (params[0] || '').replace(/%/g, '').toLowerCase();
      const matches = Array.from(this.vaultCredentials.values()).filter(
        (v) => v.service_name.toLowerCase().includes(raw)
      );
      return { rows: matches.map((m) => ({ ...m })), rowCount: matches.length };
    }

    // 6c. Vault: SELECT ... FROM vault_credentials WHERE id = $1 OR service_name = $1
    if (/SELECT .* FROM vault_credentials WHERE (?:id = \$1 OR service_name = \$1|service_name = \$1 OR id = \$1)/i.test(trimmed)) {
      const target = params[0]?.toLowerCase();
      const rec = Array.from(this.vaultCredentials.values()).find(
        (v) => v.id === params[0] || v.service_name.toLowerCase() === target
      );
      return { rows: rec ? [{ ...rec }] : [], rowCount: rec ? 1 : 0 };
    }

    // 7. Vault: COUNT vault_credentials
    if (/SELECT COUNT\(\*\) FROM vault_credentials/i.test(trimmed)) {
      return { rows: [{ count: this.vaultCredentials.size.toString() }], rowCount: 1 };
    }

    // 8. Vault: SELECT ... FROM vault_credentials (list or filter)
    if (/SELECT .* FROM vault_credentials/i.test(trimmed)) {
      let items = Array.from(this.vaultCredentials.values());

      if (params.length > 0 && params[0]) {
        const queryTerm = params[0].toString().replace(/%/g, '').toLowerCase();
        items = items.filter(
          (i) =>
            i.service_name.toLowerCase().includes(queryTerm) ||
            i.username.toLowerCase().includes(queryTerm) ||
            i.category.toLowerCase().includes(queryTerm)
        );
      }

      if (params.length > 1 && params[1]) {
        const cat = params[1].toString().toLowerCase();
        items = items.filter((i) => i.category.toLowerCase() === cat);
      }

      items.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return { rows: items.map((i) => ({ ...i })), rowCount: items.length };
    }

    // 9. Vault: INSERT INTO vault_credentials
    if (/INSERT INTO vault_credentials/i.test(trimmed)) {
      const id = crypto.randomUUID();
      const rec: VaultCredentialRecord = {
        id,
        service_name: params[0],
        category: params[1] || 'General',
        service_url: params[2] || '',
        username: params[3],
        encrypted_password: params[4],
        encrypted_notes: params[5] || '',
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.vaultCredentials.set(id, rec);
      return { rows: [{ ...rec }], rowCount: 1 };
    }

    // 10. Vault: UPDATE vault_credentials
    if (/UPDATE vault_credentials SET/i.test(trimmed)) {
      const id = params[params.length - 1];
      const rec = this.vaultCredentials.get(id);
      if (rec) {
        rec.service_name = params[0];
        rec.category = params[1] || 'General';
        rec.service_url = params[2] || '';
        rec.username = params[3];
        rec.encrypted_password = params[4];
        rec.encrypted_notes = params[5] || '';
        rec.updated_at = new Date();
        return { rows: [{ ...rec }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 11. Vault: DELETE FROM vault_credentials
    if (/DELETE FROM vault_credentials WHERE id = \$1/i.test(trimmed)) {
      const id = params[0];
      const deleted = this.vaultCredentials.delete(id);
      return { rows: deleted ? [{ id }] : [], rowCount: deleted ? 1 : 0 };
    }

    // DDL commands (CREATE, DROP, ALTER)
    if (/CREATE|ALTER|DROP/i.test(trimmed)) {
      return { rows: [], rowCount: 0 };
    }

    console.warn(`[MemoryDB] Unhandled SQL query in fallback: ${trimmed}`);
    return { rows: [], rowCount: 0 };
  }
}

export const memoryDb = new MemoryDbStore();
