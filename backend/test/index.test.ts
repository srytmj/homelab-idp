import assert from 'assert';
import { encryptAesGcm, decryptAesGcm } from '../src/crypto/aes.js';
import { hashPassword, verifyPassword } from '../src/crypto/hash.js';
import { getJWKS, signOidcIdToken, signSessionToken, verifySessionToken, getOidcKeyPair } from '../src/crypto/jwks.js';
import { initDb, query } from '../src/db/index.js';
import { buildApp } from '../src/app.js';
import { config } from '../src/config/env.js';

async function runTests() {
  console.log('🧪 Running homelab-idp comprehensive test suite...\n');

  // 1. Test AES-256-GCM
  console.log('▶ Testing AES-256-GCM encryption & decryption...');
  const secret = 'super_secret_homelab_key_32bytes!';
  const plaintext = 'SuperSecretP@ssword2026!#$';
  const encrypted1 = encryptAesGcm(plaintext, secret);
  const encrypted2 = encryptAesGcm(plaintext, secret);

  assert(encrypted1 !== plaintext, 'Encrypted text should not equal plaintext');
  assert(encrypted1 !== encrypted2, 'Two encryptions of same plaintext should produce different ciphertexts (random IV)');

  const parts = encrypted1.split(':');
  assert.strictEqual(parts.length, 3, 'Format should be iv:authTag:ciphertext');
  assert.strictEqual(parts[0].length, 24, 'IV should be 12 bytes (24 hex characters)');
  assert.strictEqual(parts[1].length, 32, 'AuthTag should be 16 bytes (32 hex characters)');

  const decrypted = decryptAesGcm(encrypted1, secret);
  assert.strictEqual(decrypted, plaintext, 'Decrypted text should match original plaintext');

  // Verify tampering fails
  const tampered = parts[0] + ':' + parts[1] + ':' + parts[2].substring(0, parts[2].length - 2) + 'aa';
  assert.throws(() => decryptAesGcm(tampered, secret), 'Tampered ciphertext should throw error');
  console.log('  ✅ AES-256-GCM passed.');

  // 2. Test Argon2id
  console.log('▶ Testing Argon2id password hashing...');
  const password = 'homelab_master_password_123';
  const hash = await hashPassword(password);
  assert(hash.startsWith('$argon2id$'), 'Hash should be Argon2id format');
  const match = await verifyPassword(hash, password);
  assert.strictEqual(match, true, 'Valid password should verify successfully');
  const mismatch = await verifyPassword(hash, 'wrong_password');
  assert.strictEqual(mismatch, false, 'Invalid password should fail verification');
  console.log('  ✅ Argon2id passed.');

  // 3. Test JWKS and JWT
  console.log('▶ Testing JWKS and JWT tokens...');
  const jwks = await getJWKS();
  assert(Array.isArray(jwks.keys), 'JWKS should contain keys array');
  assert(jwks.keys.length > 0, 'JWKS should have at least 1 key');
  assert.strictEqual(jwks.keys[0].kty, 'RSA', 'Key type should be RSA');
  assert.strictEqual(jwks.keys[0].alg, 'RS256', 'Algorithm should be RS256');

  // Session Token
  const sessionToken = await signSessionToken({
    userId: '11111111-2222-3333-4444-555555555555',
    username: 'admin',
    email: 'admin@homelab.local',
    displayName: 'Admin User',
    role: 'admin',
  });
  const verifiedSession = await verifySessionToken(sessionToken);
  assert(verifiedSession, 'Session token should verify successfully');
  assert.strictEqual(verifiedSession.username, 'admin');

  // OIDC ID Token
  const idToken = await signOidcIdToken({
    sub: '11111111-2222-3333-4444-555555555555',
    preferred_username: 'admin',
    email: 'admin@homelab.local',
    aud: 'komga-oidc',
  });
  assert(typeof idToken === 'string', 'ID token should be a string');
  assert.strictEqual(idToken.split('.').length, 3, 'JWT should have 3 parts');
  console.log('  ✅ JWKS & Tokens passed.');

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
  const sessionCookie = loginRes.cookies.find((c) => c.name === 'homelab_session')?.value;
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

  // 6. Test Forward Auth (/api/auth/verify)
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
  assert.strictEqual(authVerify.headers['remote-user'], config.initialAdmin.username);
  assert.strictEqual(authVerify.headers['remote-email'], config.initialAdmin.email);
  assert(authVerify.headers['remote-name'], 'Remote-Name header must be present');
  console.log('  ✅ Forward Auth passed. Correctly injects Remote-User, Remote-Email, Remote-Name.');

  // 7. Test OIDC Discovery & JWKS
  console.log('▶ Testing OIDC Discovery & Token Flow...');
  const oidcConfigRes = await app.inject({
    method: 'GET',
    url: '/.well-known/openid-configuration',
  });
  assert.strictEqual(oidcConfigRes.statusCode, 200);
  const oidcConfig = JSON.parse(oidcConfigRes.body);
  assert.strictEqual(oidcConfig.issuer, config.appUrl);
  assert(oidcConfig.authorization_endpoint.includes('/api/oauth/authorize'));
  assert(oidcConfig.token_endpoint.includes('/api/oauth/token'));
  assert(oidcConfig.jwks_uri.includes('/.well-known/jwks.json'));

  const jwksRes = await app.inject({
    method: 'GET',
    url: '/.well-known/jwks.json',
  });
  assert.strictEqual(jwksRes.statusCode, 200);

  // OIDC Consent Decision
  const authorizeDecisionRes = await app.inject({
    method: 'POST',
    url: '/api/oauth/authorize',
    cookies: { homelab_session: sessionCookie },
    payload: {
      client_id: 'komga-oidc',
      redirect_uri: 'http://localhost:8080/login/oauth2/code/homelab-idp',
      scope: 'openid profile email',
      state: 'test-state-xyz',
      action: 'allow',
    },
  });
  assert.strictEqual(authorizeDecisionRes.statusCode, 200);
  const authDecision = JSON.parse(authorizeDecisionRes.body);
  assert(authDecision.redirect_url.includes('code='), 'Should return redirect url with auth code');
  assert(authDecision.redirect_url.includes('state=test-state-xyz'));

  // Extract auth code from redirect URL
  const codeUrl = new URL(authDecision.redirect_url);
  const issuedCode = codeUrl.searchParams.get('code')!;

  // Exchange code for token
  const tokenRes = await app.inject({
    method: 'POST',
    url: '/api/oauth/token',
    payload: {
      grant_type: 'authorization_code',
      code: issuedCode,
      client_id: 'komga-oidc',
      client_secret: 'komga_homelab_secret_2026',
      redirect_uri: 'http://localhost:8080/login/oauth2/code/homelab-idp',
    },
  });
  assert.strictEqual(tokenRes.statusCode, 200);
  const tokenBody = JSON.parse(tokenRes.body);
  assert(tokenBody.access_token, 'Response must contain access_token');
  assert(tokenBody.id_token, 'Response must contain id_token');
  assert.strictEqual(tokenBody.token_type, 'Bearer');

  // Call userinfo endpoint with access_token
  const userinfoRes = await app.inject({
    method: 'GET',
    url: '/api/oauth/userinfo',
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
    },
  });
  assert.strictEqual(userinfoRes.statusCode, 200);
  const userinfoBody = JSON.parse(userinfoRes.body);
  assert.strictEqual(userinfoBody.preferred_username, config.initialAdmin.username);
  assert.strictEqual(userinfoBody.email, config.initialAdmin.email);
  console.log('  ✅ OIDC Authorization Code Flow & Userinfo passed.');

  // 8. Test Credential Vault API
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

  // Verify database stores encrypted ciphertext, NOT plaintext
  const rawDbRes = await query('SELECT * FROM vault_credentials WHERE id = $1', [createdItem.id]);
  assert.strictEqual(rawDbRes.rows.length, 1);
  assert(rawDbRes.rows[0].encrypted_password.includes(':'), 'Encrypted password must be formatted iv:authTag:ciphertext');
  assert(!rawDbRes.rows[0].encrypted_password.includes('SuperSecretHomeAssistantPassword987!'), 'DB must NOT store plaintext');

  // List vault credentials
  const listVaultRes = await app.inject({
    method: 'GET',
    url: '/api/vault',
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(listVaultRes.statusCode, 200);
  const listVaultBody = JSON.parse(listVaultRes.body);
  const found = listVaultBody.credentials.find((c: any) => c.id === createdItem.id);
  assert(found, 'Created item must be present in vault list');
  assert.strictEqual(found.password, 'SuperSecretHomeAssistantPassword987!', 'Password must be decrypted for authorized client');

  // Search vault credentials
  const searchVaultRes = await app.inject({
    method: 'GET',
    url: '/api/vault?q=assistant',
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(searchVaultRes.statusCode, 200);
  const searchBody = JSON.parse(searchVaultRes.body);
  assert(searchBody.credentials.some((c: any) => c.service_name === 'Home Assistant'));

  // Update vault credential
  const updateVaultRes = await app.inject({
    method: 'PUT',
    url: `/api/vault/${createdItem.id}`,
    cookies: { homelab_session: sessionCookie },
    payload: {
      service_name: 'Home Assistant Supervised',
      category: 'System',
      service_url: 'http://homeassistant.local:8123',
      username: 'hass_admin',
      password: 'UpdatedPassword2026!#',
      notes: 'Updated token',
    },
  });
  assert.strictEqual(updateVaultRes.statusCode, 200);
  const updatedItem = JSON.parse(updateVaultRes.body);
  assert.strictEqual(updatedItem.service_name, 'Home Assistant Supervised');
  assert.strictEqual(updatedItem.password, 'UpdatedPassword2026!#');

  // Delete vault credential
  const deleteVaultRes = await app.inject({
    method: 'DELETE',
    url: `/api/vault/${createdItem.id}`,
    cookies: { homelab_session: sessionCookie },
  });
  assert.strictEqual(deleteVaultRes.statusCode, 200);
  console.log('  ✅ Credential Vault CRUD & AES-256-GCM encryption passed.');

  // 9. Logout
  const logoutRes = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
  });
  assert.strictEqual(logoutRes.statusCode, 200);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
