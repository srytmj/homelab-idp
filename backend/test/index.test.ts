import { test } from 'node:test';
import assert from 'node:assert';
import { encryptAesGcm, decryptAesGcm } from '../src/crypto/aes.js';
import { hashPassword, verifyPassword } from '../src/crypto/hash.js';
import { signSessionToken, verifySessionToken } from '../src/crypto/jwks.js';
import { buildApp } from '../src/app.js';
import { initDb, query } from '../src/db/index.js';
import { config } from '../src/config/env.js';

test('Comprehensive homelab-idp Core Test Suite', async () => {
  console.log('\n🧪 Running homelab-idp comprehensive test suite...\n');

  // 1. Test AES-256-GCM
  console.log('▶ Testing AES-256-GCM encryption & decryption...');
  const originalSecret = 'ProxmoxClusterRootPass_2026!#$';
  const encrypted = encryptAesGcm(originalSecret, config.vaultSecretKey);
  assert(encrypted.includes(':'), 'Encrypted output should be in iv:authTag:ciphertext format');
  const decrypted = decryptAesGcm(encrypted, config.vaultSecretKey);
  assert.strictEqual(decrypted, originalSecret, 'Decrypted text should match original');

  // Tampered ciphertext check
  const parts = encrypted.split(':');
  parts[2] = parts[2].substring(0, parts[2].length - 2) + '00';
  assert.throws(() => {
    decryptAesGcm(parts.join(':'), config.vaultSecretKey);
  }, /auth/i, 'Tampered ciphertext must fail authentication tag verification');
  console.log('  ✅ AES-256-GCM passed.');

  // 2. Test Argon2id
  console.log('▶ Testing Argon2id password hashing...');
  const userPassword = 'MySuperSecurePassword2026!';
  const hashedPassword = await hashPassword(userPassword);
  assert(hashedPassword.startsWith('$argon2id$'), 'Hash should be formatted as Argon2id');
  const validCheck = await verifyPassword(hashedPassword, userPassword);
  assert.strictEqual(validCheck, true, 'Valid password verification should be true');
  const invalidCheck = await verifyPassword(hashedPassword, 'WrongPassword123');
  assert.strictEqual(invalidCheck, false, 'Invalid password verification should be false');
  console.log('  ✅ Argon2id passed.');

  // 3. Test JWT Session Tokens
  console.log('▶ Testing Session JWT tokens...');
  const sessionToken = await signSessionToken({
    userId: '11111111-2222-3333-4444-555555555555',
    username: 'admin',
    email: 'admin@homelab.local',
    displayName: 'Homelab Administrator',
    role: 'admin',
  });
  const verifiedSession = await verifySessionToken(sessionToken);
  assert(verifiedSession, 'Session token should verify successfully');
  assert.strictEqual(verifiedSession.username, 'admin');
  console.log('  ✅ Session JWT tokens passed.');

  // 4. Test DB Initializer
  console.log('▶ Initializing Database and running migrations & seeds...');
  await initDb();
  const userCountRes = await query('SELECT COUNT(*) FROM users');
  const userCount = parseInt(userCountRes.rows[0].count, 10);
  assert(userCount >= 1, 'Initial admin user must exist');
  console.log(`  ✅ Database initialized. Found ${userCount} users.`);

  // 5. Test Fastify API Endpoints
  console.log('▶ Testing Fastify API Endpoints...');
  const app = await buildApp();

  // Health check
  const healthRes = await app.inject({
    method: 'GET',
    url: '/api/health',
  });
  assert.strictEqual(healthRes.statusCode, 200);

  // User Registration endpoint test (POST /api/auth/register)
  console.log('▶ Testing SSO User Registration (POST /api/auth/register)...');
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: 'testuser_sso',
      email: 'testuser@homelab.local',
      password: 'StrongPassword123!',
      displayName: 'Test SSO User',
    },
  });
  assert.strictEqual(regRes.statusCode, 201, 'Registration should return 201 Created');
  const regBody = JSON.parse(regRes.body);
  assert.strictEqual(regBody.user.username, 'testuser_sso');
  assert.strictEqual(regBody.user.email, 'testuser@homelab.local');
  assert(regBody.token, 'Registration should return auth token');

  // Duplicate registration conflict test
  const dupRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: 'testuser_sso',
      email: 'another@homelab.local',
      password: 'StrongPassword123!',
    },
  });
  assert.strictEqual(dupRes.statusCode, 409, 'Duplicate username should return 409 Conflict');
  console.log('  ✅ SSO User Registration passed.');

  // Login with invalid credentials
  const badLoginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'wrongpassword' },
  });
  assert.strictEqual(badLoginRes.statusCode, 401);

  // Login with valid credentials
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username: config.initialAdmin.username,
      password: config.initialAdmin.password,
    },
  });
  assert.strictEqual(loginRes.statusCode, 200);
  const loginBody = JSON.parse(loginRes.body);
  assert.strictEqual(loginBody.user.username, config.initialAdmin.username);
  let sessionCookie = loginRes.cookies.find((c) => c.name === 'homelab_session')?.value;
  assert(sessionCookie, 'homelab_session cookie must be set');

  // Verify auth session (/api/auth/me)
  const meRes = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(meRes.statusCode, 200);
  const meBody = JSON.parse(meRes.body);
  assert.strictEqual(meBody.user.username, config.initialAdmin.username);

  // 5b. Test Update Profile & Settings (PUT /api/auth/profile)
  console.log('▶ Testing Profile & Account Settings (PUT /api/auth/profile)...');
  // Rejection with wrong current password when updating password
  const badPassRes = await app.inject({
    method: 'PUT',
    url: '/api/auth/profile',
    cookies: { homelab_session: sessionCookie },
    payload: {
      currentPassword: 'wrong_current_password',
      newPassword: 'BrandNewStrongPassword2026!',
    },
  });
  assert.strictEqual(badPassRes.statusCode, 400, 'Invalid current password should fail');

  // Update username, email, and password successfully
  const updateProfileRes = await app.inject({
    method: 'PUT',
    url: '/api/auth/profile',
    cookies: { homelab_session: sessionCookie },
    payload: {
      username: 'admin_updated',
      email: 'admin.updated@homelab.local',
      displayName: 'Lead Homelab Admin',
      currentPassword: config.initialAdmin.password,
      newPassword: 'BrandNewStrongPassword2026!',
    },
  });
  assert.strictEqual(updateProfileRes.statusCode, 200, 'Profile update should return 200 OK');
  const updatedProfileBody = JSON.parse(updateProfileRes.body);
  assert.strictEqual(updatedProfileBody.user.username, 'admin_updated');
  assert.strictEqual(updatedProfileBody.user.email, 'admin.updated@homelab.local');
  assert.strictEqual(updatedProfileBody.user.displayName, 'Lead Homelab Admin');

  // New cookie from profile update
  const newCookie = updateProfileRes.cookies.find((c) => c.name === 'homelab_session')?.value;
  assert(newCookie, 'Updated session cookie should be issued');
  sessionCookie = newCookie;

  // Verify login with newly updated credentials
  const newLoginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username: 'admin_updated',
      password: 'BrandNewStrongPassword2026!',
    },
  });
  assert.strictEqual(newLoginRes.statusCode, 200, 'Login with updated username & password should succeed');
  console.log('  ✅ Profile & Account Settings update passed.');

  // 6. Test Forward Auth (/api/auth/verify) for Nginx Proxy Manager
  console.log('▶ Testing Forward Auth endpoint for Nginx Proxy Manager...');
  const unauthVerify = await app.inject({
    method: 'GET',
    url: '/api/auth/verify',
  });
  assert.strictEqual(unauthVerify.statusCode, 401, 'Unauthenticated forward auth must return 401');

  const authVerify = await app.inject({
    method: 'GET',
    url: '/api/auth/verify',
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(authVerify.statusCode, 200, 'Authenticated forward auth must return 200 OK');
  assert.strictEqual(authVerify.headers['remote-user'], 'admin_updated');
  assert.strictEqual(authVerify.headers['remote-email'], 'admin.updated@homelab.local');
  assert.strictEqual(authVerify.headers['remote-name'], 'Lead Homelab Admin');
  console.log('  ✅ Forward Auth passed. Correctly injects updated Remote-User, Remote-Email, Remote-Name.');

  // 7. Test Credential Vault API (AES-256-GCM CRUD)
  console.log('▶ Testing Credential Vault API with AES-256-GCM encryption...');
  // Create credential
  const createVaultRes = await app.inject({
    method: 'POST',
    url: '/api/vault',
    cookies: { homelab_session: sessionCookie },
    payload: {
      service_name: 'Home Assistant',
      category: 'System',
      service_url: 'http://homeassistant.local:8123',
      username: 'hass_admin',
      password: 'SuperSecretHomeAssistantPassword987!',
      notes: 'Long-lived access token: eyJhbGciOi...',
    },
  });
  assert.strictEqual(createVaultRes.statusCode, 201);
  const createdItem = JSON.parse(createVaultRes.body);
  assert.strictEqual(createdItem.service_name, 'Home Assistant');
  assert.strictEqual(createdItem.password, 'SuperSecretHomeAssistantPassword987!');

  // List credentials
  const listVaultRes = await app.inject({
    method: 'GET',
    url: '/api/vault',
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(listVaultRes.statusCode, 200);
  const listBody = JSON.parse(listVaultRes.body);
  assert(listBody.credentials.length >= 1);

  // Search filter
  const searchVaultRes = await app.inject({
    method: 'GET',
    url: '/api/vault?q=assistant',
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(searchVaultRes.statusCode, 200);
  const searchBody = JSON.parse(searchVaultRes.body);
  assert(searchBody.credentials.length >= 1);
  assert.strictEqual(searchBody.credentials[0].service_name, 'Home Assistant');

  // Update credential (Password & Notes & URL)
  const updateVaultRes = await app.inject({
    method: 'PUT',
    url: `/api/vault/${createdItem.id}`,
    cookies: { homelab_session: sessionCookie },
    payload: {
      service_name: 'Home Assistant Hub',
      category: 'System',
      service_url: 'https://hass.homelab.local',
      username: 'hass_admin',
      password: 'NewUpdatedHassPassword2026#',
      notes: 'Updated token notes',
    },
  });
  assert.strictEqual(updateVaultRes.statusCode, 200);
  const updatedItem = JSON.parse(updateVaultRes.body);
  assert.strictEqual(updatedItem.password, 'NewUpdatedHassPassword2026#');
  assert.strictEqual(updatedItem.service_name, 'Home Assistant Hub');

  // Delete credential
  const deleteVaultRes = await app.inject({
    method: 'DELETE',
    url: `/api/vault/${createdItem.id}`,
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(deleteVaultRes.statusCode, 200);
  console.log('  ✅ Credential Vault CRUD & AES-256-GCM encryption passed.');

  // 8. Test Logout endpoint
  console.log('▶ Testing Logout endpoint (with and without application/json Content-Type header on empty body)...');
  const logoutResNoHeader = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
  });
  assert.strictEqual(logoutResNoHeader.statusCode, 200);

  const logoutResWithHeader = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { 'content-type': 'application/json' },
  });
  assert.strictEqual(logoutResWithHeader.statusCode, 200);
  console.log('  ✅ Logout passed.');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n');
});
