#!/usr/bin/env node

import { initDb, closeDb, query } from './db/index.js';
import { hashPassword } from './crypto/hash.js';
import { encryptAesGcm, decryptAesGcm } from './crypto/aes.js';
import { signSessionToken, verifySessionToken } from './crypto/jwks.js';
import { config } from './config/env.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(val: string): boolean {
  return UUID_REGEX.test(val.trim());
}

async function resolveUser(target: string) {
  const clean = target.trim();
  if (isUuid(clean)) {
    const byId = await query('SELECT * FROM users WHERE id = $1', [clean]);
    if (byId.rows.length > 0) return byId.rows[0];
  }
  const byUsername = await query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [clean]);
  return byUsername.rows[0] || null;
}

async function resolveVaultCredential(target: string): Promise<any | null> {
  const clean = target.trim();

  // 1. If it's a valid UUID, search by ID directly
  if (isUuid(clean)) {
    const byId = await query('SELECT * FROM vault_credentials WHERE id = $1', [clean]);
    if (byId.rows.length > 0) return byId.rows[0];
  }

  // 2. Exact match on service_name (case-insensitive)
  const exact = await query('SELECT * FROM vault_credentials WHERE LOWER(service_name) = LOWER($1)', [clean]);
  if (exact.rows.length > 0) return exact.rows[0];

  // 3. Substring match on service_name (case-insensitive)
  const partial = await query('SELECT * FROM vault_credentials WHERE LOWER(service_name) LIKE LOWER($1)', [`%${clean}%`]);
  if (partial.rows.length === 1) {
    return partial.rows[0];
  } else if (partial.rows.length > 1) {
    console.error(`Multiple credentials found matching '${clean}':`);
    for (const r of partial.rows) {
      console.error(`  - ${r.service_name} (UUID: ${r.id})`);
    }
    console.error('Please specify the exact service name or full UUID.');
    process.exit(1);
  }

  return null;
}

interface ParsedArgs {
  command: string;
  subcommand: string;
  positionals: string[];
  options: Record<string, string | boolean | string[]>;
}

function parseArgs(args: string[]): ParsedArgs {
  let command = '';
  let subcommand = '';
  const positionals: string[] = [];
  const options: Record<string, string | boolean | string[]> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        appendOption(options, key, val);
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          appendOption(options, key, next);
          i++;
        } else {
          options[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      if (key === 'h') options['help'] = true;
      else if (key === 'j') options['json'] = true;
      else if (key === 'y') options['yes'] = true;
      else if (key === 'r') options['reveal'] = true;
      else options[key] = true;
    } else {
      if (!command) {
        command = arg.toLowerCase();
      } else if (!subcommand) {
        subcommand = arg.toLowerCase();
      } else {
        positionals.push(arg);
      }
    }
    i++;
  }

  return { command, subcommand, positionals, options };
}

function appendOption(options: Record<string, string | boolean | string[]>, key: string, val: string) {
  if (options[key] === undefined) {
    options[key] = val;
  } else if (Array.isArray(options[key])) {
    (options[key] as string[]).push(val);
  } else {
    options[key] = [options[key] as string, val];
  }
}

function getOption(options: Record<string, string | boolean | string[]>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (typeof options[k] === 'string') return options[k] as string;
  }
  return undefined;
}

function printHelp() {
  console.log(`
homelab-idp CLI - Password Bank & Nginx Forward Auth Manager

USAGE:
  homelab-idp <command> <subcommand> [options]

COMMANDS:
  user, sso
    add, register   Register a new SSO user account
    list            List all registered users
    update, edit    Update user profile (username, email, display name, password)
    passwd          Update a user's password
    delete          Delete a user account

  vault
    add, create     Store a new secret / password in the vault
    list            List credentials (masked or revealed)
    get             Inspect a single credential by service name or UUID
    update          Update an existing credential by service name or UUID
    delete          Remove a credential from the vault by service name or UUID

  token
    generate        Generate a signed session / bearer JWT token for any user

  forward-auth
    test            Simulate forward-auth subrequest verification with a token

GLOBAL OPTIONS:
  --json, -j        Output machine-readable JSON (ideal for AI agents & jq)
  --help, -h        Show help message

EXAMPLES:
  # 1. Register an SSO user
  homelab-idp user add --username john --email john@local.dev --password MySecretPassword! --role admin

  # 2. Update vault password by service name
  homelab-idp vault update Nextcloud --password "NewNextcloudSecretPass!"

  # 3. Inspect a vault entry with decrypted password
  homelab-idp vault get Nextcloud --reveal

  # 4. Delete vault entry by service name
  homelab-idp vault delete Nextcloud

  # 5. Generate a JWT forward-auth token
  homelab-idp token generate --username admin --hours 24
`);
}

async function handleUser(subcommand: string, positionals: string[], options: Record<string, any>, isJson: boolean) {
  if (subcommand === 'add' || subcommand === 'register') {
    const username = getOption(options, ['username', 'u', 'user']) || positionals[0];
    const email = getOption(options, ['email', 'e']) || positionals[1];
    const password = getOption(options, ['password', 'p', 'pass']);
    const displayName = getOption(options, ['name', 'display-name']) || username;
    const role = getOption(options, ['role', 'r']) || 'member';

    if (!username || !email || !password) {
      console.error('Error: --username, --email, and --password are required.');
      process.exit(1);
    }

    const check = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.toLowerCase(), email.toLowerCase()]
    );

    if (check.rows.length > 0) {
      console.error(`Error: User with username '${username}' or email '${email}' already exists.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    const insertRes = await query(
      `INSERT INTO users (username, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, display_name, role, created_at`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash, displayName, role]
    );

    const user = insertRes.rows[0];
    if (isJson) {
      console.log(JSON.stringify({ success: true, user }, null, 2));
    } else {
      console.log(`User '${user.username}' created successfully.\n`);
      console.log(`ID:           ${user.id}`);
      console.log(`Username:     ${user.username}`);
      console.log(`Email:        ${user.email}`);
      console.log(`Display Name: ${user.display_name}`);
      console.log(`Role:         ${user.role}`);
    }
    return;
  }

  if (subcommand === 'list') {
    const res = await query('SELECT id, username, email, display_name, role, created_at FROM users ORDER BY created_at ASC');
    if (isJson) {
      console.log(JSON.stringify({ users: res.rows }, null, 2));
    } else {
      console.log(`Found ${res.rows.length} user(s):\n`);
      console.log(`USERNAME          ROLE      EMAIL                           DISPLAY NAME`);
      console.log(`----------------  --------  ------------------------------  -------------------`);
      for (const u of res.rows) {
        const un = u.username.padEnd(16).slice(0, 16);
        const r = (u.role || 'member').padEnd(8).slice(0, 8);
        const em = u.email.padEnd(30).slice(0, 30);
        const dn = (u.display_name || '-').padEnd(19).slice(0, 19);
        console.log(`${un}  ${r}  ${em}  ${dn}`);
      }
    }
    return;
  }

  if (subcommand === 'passwd' || subcommand === 'password') {
    const target = positionals[0] || getOption(options, ['username', 'id', 'user']);
    const password = getOption(options, ['password', 'p', 'pass']) || positionals[1];

    if (!target || !password) {
      console.error('Error: target user and new password are required.');
      process.exit(1);
    }

    const user = await resolveUser(target);
    if (!user) {
      console.error(`Error: User '${target}' not found.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

    if (isJson) {
      console.log(JSON.stringify({ success: true, message: `Password updated for ${user.username}` }, null, 2));
    } else {
      console.log(`Password updated successfully for user '${user.username}'.`);
    }
    return;
  }

  if (subcommand === 'update' || subcommand === 'edit') {
    const target = positionals[0] || getOption(options, ['username', 'id', 'user']);
    if (!target) {
      console.error('Error: target user is required.');
      process.exit(1);
    }

    const user = await resolveUser(target);
    if (!user) {
      console.error(`Error: User '${target}' not found.`);
      process.exit(1);
    }

    const newUsername = getOption(options, ['username', 'u'])?.toLowerCase();
    const newEmail = getOption(options, ['email', 'e'])?.toLowerCase();
    const newDisplayName = getOption(options, ['display-name', 'name']);
    const newPassword = getOption(options, ['password', 'p']);

    if (newUsername && newUsername !== user.username) {
      const dup = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [newUsername, user.id]);
      if (dup.rows.length > 0) {
        console.error(`Error: Username '${newUsername}' is already taken.`);
        process.exit(1);
      }
    }

    if (newEmail && newEmail !== user.email) {
      const dup = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, user.id]);
      if (dup.rows.length > 0) {
        console.error(`Error: Email '${newEmail}' is already registered.`);
        process.exit(1);
      }
    }

    const finalUsername = newUsername || user.username;
    const finalEmail = newEmail || user.email;
    const finalDisplayName = newDisplayName !== undefined ? newDisplayName : user.display_name;

    let updateQuery = `UPDATE users SET username = $1, email = $2, display_name = $3`;
    const params: any[] = [finalUsername, finalEmail, finalDisplayName];

    if (newPassword) {
      const newHash = await hashPassword(newPassword);
      updateQuery += `, password_hash = $4 WHERE id = $5 RETURNING id, username, email, display_name, role, updated_at`;
      params.push(newHash, user.id);
    } else {
      updateQuery += ` WHERE id = $4 RETURNING id, username, email, display_name, role, updated_at`;
      params.push(user.id);
    }

    const updateRes = await query(updateQuery, params);
    const updated = updateRes.rows[0];

    if (isJson) {
      console.log(JSON.stringify({ success: true, user: updated }, null, 2));
    } else {
      console.log(`User '${updated.username}' updated successfully.`);
      console.log(`ID:           ${updated.id}`);
      console.log(`Username:     ${updated.username}`);
      console.log(`Email:        ${updated.email}`);
      console.log(`Display Name: ${updated.display_name}`);
      if (newPassword) {
        console.log(`Password:     [UPDATED]`);
      }
    }
    return;
  }

  if (subcommand === 'delete') {
    const target = positionals[0] || getOption(options, ['username', 'id', 'user']);
    if (!target) {
      console.error('Error: target user is required.');
      process.exit(1);
    }

    const user = await resolveUser(target);
    if (!user) {
      console.error(`Error: User '${target}' not found.`);
      process.exit(1);
    }

    await query('DELETE FROM users WHERE id = $1', [user.id]);

    if (isJson) {
      console.log(JSON.stringify({ success: true, message: `Deleted user ${user.username}` }, null, 2));
    } else {
      console.log(`User '${user.username}' deleted successfully.`);
    }
    return;
  }

  console.error(`Unknown user subcommand: '${subcommand}'. Use 'homelab-idp user --help'.`);
  process.exit(1);
}

async function handleVault(subcommand: string, positionals: string[], options: Record<string, any>, isJson: boolean) {
  if (subcommand === 'add' || subcommand === 'create') {
    const service = getOption(options, ['service', 'service-name', 'name']) || positionals[0];
    const username = getOption(options, ['username', 'u', 'user']);
    const password = getOption(options, ['password', 'p', 'pass']);
    const category = getOption(options, ['category', 'cat']) || 'General';
    const url = getOption(options, ['url', 'service-url']) || '';
    const notes = getOption(options, ['notes', 'note']) || '';

    if (!service || !username || !password) {
      console.error('Error: --service, --username, and --password are required.');
      process.exit(1);
    }

    const encPassword = encryptAesGcm(password, config.vaultSecretKey);
    const encNotes = notes ? encryptAesGcm(notes, config.vaultSecretKey) : '';

    const res = await query(
      `INSERT INTO vault_credentials (service_name, category, service_url, username, encrypted_password, encrypted_notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, service_name, category, service_url, username, created_at`,
      [service, category, url, username, encPassword, encNotes]
    );

    const created = res.rows[0];
    if (isJson) {
      console.log(JSON.stringify({ success: true, credential: created }, null, 2));
    } else {
      console.log(`Saved credentials for '${created.service_name}' to vault.\n`);
      console.log(`ID:           ${created.id}`);
      console.log(`Service:      ${created.service_name}`);
      console.log(`Category:     ${created.category}`);
      console.log(`Username:     ${created.username}`);
      console.log(`URL:          ${created.service_url || '-'}`);
      console.log(`Encryption:   AES-256-GCM (Protected)`);
    }
    return;
  }

  if (subcommand === 'list') {
    const cat = getOption(options, ['category', 'cat']);
    const search = getOption(options, ['query', 'q', 'search']);
    const reveal = !!options['reveal'] || !!options['r'];

    let sql = 'SELECT * FROM vault_credentials';
    const params: any[] = [];
    const where: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(LOWER(service_name) LIKE LOWER($${params.length}) OR LOWER(username) LIKE LOWER($${params.length}))`);
    }

    if (cat && cat !== 'All') {
      params.push(cat);
      where.push(`LOWER(category) = LOWER($${params.length})`);
    }

    if (where.length > 0) {
      sql += ' WHERE ' + where.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const res = await query(sql, params);

    const mapped = res.rows.map((r) => {
      let password = '••••••••••••';
      let notes = '';

      if (reveal) {
        try {
          password = decryptAesGcm(r.encrypted_password, config.vaultSecretKey);
          notes = r.encrypted_notes ? decryptAesGcm(r.encrypted_notes, config.vaultSecretKey) : '';
        } catch {
          password = '[DECRYPTION FAILED]';
        }
      }

      return {
        id: r.id,
        service_name: r.service_name,
        category: r.category,
        service_url: r.service_url,
        username: r.username,
        password,
        notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    if (isJson) {
      console.log(JSON.stringify({ credentials: mapped }, null, 2));
    } else {
      if (mapped.length === 0) {
        console.log('No credentials found in vault.');
        return;
      }
      console.log(`Found ${mapped.length} credential(s):\n`);
      console.log(`SERVICE              CATEGORY        USERNAME         PASSWORD`);
      console.log(`-------------------  --------------  ---------------  -------------------`);
      for (const m of mapped) {
        const s = m.service_name.padEnd(19).slice(0, 19);
        const c = m.category.padEnd(14).slice(0, 14);
        const u = m.username.padEnd(15).slice(0, 15);
        console.log(`${s}  ${c}  ${u}  ${m.password}`);
      }
      if (!reveal) {
        console.log('\n(Passwords are masked. Use --reveal or -r to view in plaintext)');
      }
    }
    return;
  }

  if (subcommand === 'get') {
    const target = positionals[0] || getOption(options, ['id', 'service']);
    const reveal = !!options['reveal'] || !!options['r'];

    if (!target) {
      console.error('Error: target service name or UUID is required.');
      process.exit(1);
    }

    const row = await resolveVaultCredential(target);
    if (!row) {
      console.error(`Error: Credential matching '${target}' not found in vault.`);
      process.exit(1);
    }

    let password = '••••••••••••';
    let notes = '';

    if (reveal) {
      try {
        password = decryptAesGcm(row.encrypted_password, config.vaultSecretKey);
        notes = row.encrypted_notes ? decryptAesGcm(row.encrypted_notes, config.vaultSecretKey) : '';
      } catch {
        password = '[DECRYPTION FAILED]';
      }
    }

    const output = {
      id: row.id,
      service_name: row.service_name,
      category: row.category,
      service_url: row.service_url,
      username: row.username,
      password,
      notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    if (isJson) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`Credential Details for '${output.service_name}':\n`);
      console.log(`ID:           ${output.id}`);
      console.log(`Service:      ${output.service_name}`);
      console.log(`Category:     ${output.category}`);
      console.log(`URL:          ${output.service_url || '-'}`);
      console.log(`Username:     ${output.username}`);
      console.log(`Password:     ${output.password}`);
      if (notes) console.log(`Notes:        ${output.notes}`);
      console.log(`Created:      ${new Date(output.created_at).toISOString()}`);
    }
    return;
  }

  if (subcommand === 'update') {
    const target = positionals[0] || getOption(options, ['id', 'service']);
    if (!target) {
      console.error('Error: target service name or UUID is required.');
      process.exit(1);
    }

    const existing = await resolveVaultCredential(target);
    if (!existing) {
      console.error(`Error: Credential matching '${target}' not found in vault.`);
      process.exit(1);
    }

    const service = getOption(options, ['service', 'service-name', 'name']) || existing.service_name;
    const username = getOption(options, ['username', 'u', 'user']) || existing.username;
    const category = getOption(options, ['category', 'cat']) || existing.category;
    const url = getOption(options, ['url', 'service-url']) !== undefined ? getOption(options, ['url', 'service-url']) : existing.service_url;
    const notes = getOption(options, ['notes', 'note']);
    const password = getOption(options, ['password', 'p', 'pass']);

    const encPassword = password ? encryptAesGcm(password, config.vaultSecretKey) : existing.encrypted_password;
    const encNotes = notes !== undefined ? (notes ? encryptAesGcm(notes, config.vaultSecretKey) : '') : existing.encrypted_notes;

    await query(
      `UPDATE vault_credentials
       SET service_name = $1, category = $2, service_url = $3, username = $4, encrypted_password = $5, encrypted_notes = $6, updated_at = NOW()
       WHERE id = $7`,
      [service, category, url, username, encPassword, encNotes, existing.id]
    );

    if (isJson) {
      console.log(JSON.stringify({ success: true, message: `Updated credential ${service}`, id: existing.id }, null, 2));
    } else {
      console.log(`Credential '${service}' (UUID: ${existing.id}) updated successfully.`);
    }
    return;
  }

  if (subcommand === 'delete') {
    const target = positionals[0] || getOption(options, ['id', 'service']);
    if (!target) {
      console.error('Error: target service name or UUID is required.');
      process.exit(1);
    }

    const item = await resolveVaultCredential(target);
    if (!item) {
      console.error(`Error: Credential matching '${target}' not found in vault.`);
      process.exit(1);
    }

    await query('DELETE FROM vault_credentials WHERE id = $1', [item.id]);

    if (isJson) {
      console.log(JSON.stringify({ success: true, message: `Deleted credential ${item.service_name}`, id: item.id }, null, 2));
    } else {
      console.log(`Credential '${item.service_name}' (UUID: ${item.id}) deleted from vault.`);
    }
    return;
  }

  console.error(`Unknown vault subcommand: '${subcommand}'. Use 'homelab-idp vault --help'.`);
  process.exit(1);
}

async function handleToken(subcommand: string, positionals: string[], options: Record<string, any>, isJson: boolean) {
  if (subcommand === 'generate') {
    const username = getOption(options, ['username', 'u', 'user']) || positionals[0];
    const hours = parseInt(getOption(options, ['hours', 'h']) || '24', 10);

    if (!username) {
      console.error('Error: --username is required.');
      process.exit(1);
    }

    const user = await resolveUser(username);
    if (!user) {
      console.error(`Error: User '${username}' not found.`);
      process.exit(1);
    }

    const token = await signSessionToken(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name || user.username,
        role: user.role || 'member',
      },
      hours
    );

    if (isJson) {
      console.log(JSON.stringify({ token, expires_in_hours: hours, user: { id: user.id, username: user.username } }, null, 2));
    } else {
      console.log(`Signed Session JWT generated for '${user.username}' (Valid for ${hours}h):\n`);
      console.log(token);
    }
    return;
  }

  console.error(`Unknown token subcommand: '${subcommand}'. Use 'homelab-idp token --help'.`);
  process.exit(1);
}

async function handleForwardAuth(subcommand: string, positionals: string[], options: Record<string, any>, isJson: boolean) {
  if (subcommand === 'test' || subcommand === 'verify') {
    const token = getOption(options, ['token', 't']) || positionals[0];
    if (!token) {
      console.error('Error: --token is required.');
      process.exit(1);
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      if (isJson) {
        console.log(JSON.stringify({ status: 401, error: 'Unauthorized', message: 'Invalid or expired token' }, null, 2));
      } else {
        console.log(`Status: 401 Unauthorized (Invalid or expired token)`);
      }
      process.exit(1);
    }

    const user = await resolveUser(payload.username);
    if (!user) {
      if (isJson) {
        console.log(JSON.stringify({ status: 401, error: 'Unauthorized', message: 'User not found' }, null, 2));
      } else {
        console.log(`Status: 401 Unauthorized (User not found)`);
      }
      process.exit(1);
    }

    const headers = {
      'Remote-User': user.username,
      'Remote-Email': user.email,
      'Remote-Name': user.display_name || user.username,
      'Remote-Groups': user.role || 'member',
    };

    if (isJson) {
      console.log(JSON.stringify({ status: 200, message: 'Authorized', headers }, null, 2));
    } else {
      console.log(`Status: 200 OK (Authorized)\n`);
      console.log(`Injected Forward Auth Headers:`);
      for (const [k, v] of Object.entries(headers)) {
        console.log(`  ${k}: ${v}`);
      }
    }
    return;
  }

  console.error(`Unknown forward-auth subcommand: '${subcommand}'. Use 'homelab-idp forward-auth --help'.`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed.command || parsed.options['help'] || parsed.command === 'help') {
    printHelp();
    process.exit(0);
  }

  const isJson = !!parsed.options['json'] || !!parsed.options['j'];

  try {
    // Initialize database in quiet mode so it doesn't pollute stdout/JSON
    await initDb(true);

    switch (parsed.command) {
      case 'user':
      case 'sso':
        await handleUser(parsed.subcommand, parsed.positionals, parsed.options, isJson);
        break;

      case 'vault':
        await handleVault(parsed.subcommand, parsed.positionals, parsed.options, isJson);
        break;

      case 'token':
        await handleToken(parsed.subcommand, parsed.positionals, parsed.options, isJson);
        break;

      case 'forward-auth':
      case 'verify':
        await handleForwardAuth(parsed.subcommand, parsed.positionals, parsed.options, isJson);
        break;

      default:
        console.error(`Unknown command: '${parsed.command}'. Run 'homelab-idp --help' for usage.`);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
