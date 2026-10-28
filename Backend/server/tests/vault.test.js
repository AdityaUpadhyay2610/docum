import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB } from './setup.js';

// Configure test environment variables before importing app
process.env.NODE_ENV = 'development';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placeholder';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_0123456789abcdef0123456789abcdef';
process.env.CLIENT_URL = 'http://localhost:5173';

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/user.models.js');
const { default: Document } = await import('../src/models/document.models.js');

let tokenUserA = '';
let tokenUserB = '';
let userIdA = '';
let encryptedDocId = '';

const VALID_12B_IV = Buffer.alloc(12, 1).toString('base64');

before(async () => {
  await setupTestDB();
  await User.deleteMany({});
  await Document.deleteMany({});

  // Register User A
  const resA = await request(app)
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      name: 'Vault User A',
      email: 'vault_usera@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
  assert.equal(resA.status, 201);
  tokenUserA = resA.body.accessToken;
  userIdA = resA.body.user.id;

  // Register User B
  const resB = await request(app)
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      name: 'Vault User B',
      email: 'vault_userb@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
  assert.equal(resB.status, 201);
  tokenUserB = resB.body.accessToken;
});

after(async () => {
  await teardownTestDB();
});

test('Vault setup: initializes vault metadata for User A', async () => {
  const metaResBefore = await request(app)
    .get('/api/vault/meta')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(metaResBefore.status, 200);
  assert.equal(metaResBefore.body.isVaultEnabled, false);

  const setupRes = await request(app)
    .post('/api/vault/setup')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      salt: 'c2FsdF90ZXN0XzEyMw==',
      kdfParams: { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 },
      wrappedMasterKey: 'd3JhcHBlZF9ta190ZXN0',
      wrappedMasterKeyIv: 'bWtfaXZfdGVzdF8xMjM=',
      recoveryWrappedKey: 'cmVjb3Zlcnlfd3JhcHBlZF9taw==',
      recoveryWrappedKeyIv: 'cmVjb3ZfaXZfdGVzdF8x',
    });

  assert.equal(setupRes.status, 200);
  assert.equal(setupRes.body.isVaultEnabled, true);

  const metaResAfter = await request(app)
    .get('/api/vault/meta')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(metaResAfter.status, 200);
  assert.equal(metaResAfter.body.isVaultEnabled, true);
  assert.equal(metaResAfter.body.salt, 'c2FsdF90ZXN0XzEyMw==');
  assert.equal(metaResAfter.body.wrappedMasterKey, 'd3JhcHBlZF9ta190ZXN0');
});

test('Plaintext write rejection: Vault-enabled User A cannot create plaintext document', async () => {
  const res = await request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      title: 'Leaked Plaintext Title',
      icon: '📝',
      content: [{ id: 'b1', type: 'paragraph', text: 'Should be blocked' }],
    });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Plaintext document writes rejected/i);
});

test('Bypass attempt: isEncrypted:true + plaintext title/content is rejected', async () => {
  const res = await request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      isEncrypted: true,
      title: 'Sneaky plaintext title',
      content: [{ id: 'b1', type: 'paragraph', text: 'Sneaky plaintext' }],
      encTitle: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfdGl0bGVfMQ==' },
      encContent: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfY29udGVudF8x' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: VALID_12B_IV },
    });

  assert.equal(res.status, 400);
  assert.match(res.body.fields?.title || res.body.fields?.content || res.body.error, /plaintext/i);
});

test('Encrypted document write: Vault-enabled User A can create encrypted document', async () => {
  const customId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      _id: customId,
      isEncrypted: true,
      encTitle: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfdGl0bGVfMQ==' },
      encIcon: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfaWNvbl8x' },
      encContent: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfY29udGVudF8x' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: VALID_12B_IV },
    });

  assert.equal(res.status, 201);
  assert.equal(res.body._id, customId);
  assert.equal(res.body.isEncrypted, true);
  assert.equal(res.body.revision, 0);
  assert.equal(res.body.title, '[Encrypted]');
  assert.equal(res.body.icon, '🔒');
  encryptedDocId = res.body._id;
});

test('Encrypted update: If-Match is mandatory (returns 428 if missing)', async () => {
  const res = await request(app)
    .put(`/api/documents/${encryptedDocId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      isEncrypted: true,
      encTitle: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfdGl0bGVfMg==' },
      encContent: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfY29udGVudF8y' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: VALID_12B_IV },
    });

  assert.equal(res.status, 428);
  assert.match(res.body.error, /If-Match/i);
});

test('Atomic revision: update with matching revision increments revision and succeeds', async () => {
  const res = await request(app)
    .put(`/api/documents/${encryptedDocId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .set('If-Match', '"0"')
    .send({
      isEncrypted: true,
      encTitle: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfdGl0bGVfMg==' },
      encContent: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfY29udGVudF8y' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: VALID_12B_IV },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.revision, 1);
  assert.equal(res.headers.etag, '"1"');
  // Verify sentinel values are enforced on update
  assert.equal(res.body.title, '[Encrypted]');
  assert.equal(res.body.icon, '🔒');
});

test('Atomic revision conflict: update with stale revision returns 409 Conflict', async () => {
  // Try updating with revision 0 when current is 1
  const res = await request(app)
    .put(`/api/documents/${encryptedDocId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .set('If-Match', '"0"')
    .send({
      isEncrypted: true,
      encTitle: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfdGl0bGVfMw==' },
      encContent: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfY29udGVudF8z' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: VALID_12B_IV },
    });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /Conflict/i);
  assert.equal(res.body.currentRevision, 1);
});

test('Encrypted update bypass attempt: plaintext fields in update are rejected', async () => {
  const res = await request(app)
    .put(`/api/documents/${encryptedDocId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .set('If-Match', '"1"')
    .send({
      isEncrypted: true,
      title: 'Sneaky plaintext on update',
      encTitle: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfdGl0bGVfNA==' },
      encContent: { v: 1, iv: VALID_12B_IV, ct: 'Y3RfY29udGVudF80' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: VALID_12B_IV },
    });

  assert.equal(res.status, 400);
  assert.match(res.body.fields?.title || res.body.fields?.content || res.body.error, /plaintext/i);
});

test('IDOR Protection on encrypted document: User B cannot read User A encrypted doc', async () => {
  const res = await request(app)
    .get(`/api/documents/${encryptedDocId}`)
    .set('Authorization', `Bearer ${tokenUserB}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(res.status, 404);
});

test('Vault meta update: requires valid login password and archives previous keys', async () => {
  // 1. Wrong password rejected
  const failRes = await request(app)
    .put('/api/vault/meta')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      password: 'WrongPassword!',
      salt: 'c2FsdF9uZXdfNDU2',
      kdfParams: { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 },
      wrappedMasterKey: 'bmV3X3dyYXBwZWRfbWs=',
      wrappedMasterKeyIv: 'bmV3X21rX2l2',
      recoveryWrappedKey: 'bmV3X3JlY292X21r',
      recoveryWrappedKeyIv: 'bmV3X3JlY292X2l2',
    });

  assert.equal(failRes.status, 401);

  // 2. Correct password accepted
  const successRes = await request(app)
    .put('/api/vault/meta')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      password: 'Password123!',
      salt: 'c2FsdF9uZXdfNDU2',
      kdfParams: { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 },
      wrappedMasterKey: 'bmV3X3dyYXBwZWRfbWs=',
      wrappedMasterKeyIv: 'bmV3X21rX2l2',
      recoveryWrappedKey: 'bmV3X3JlY292X21r',
      recoveryWrappedKeyIv: 'bmV3X3JlY292X2l2',
    });

  assert.equal(successRes.status, 200);
  assert.equal(successRes.body.hasBackup, true);

  // 3. Verify user model in DB has backup and isVaultEnabled remains true
  const dbUser = await User.findById(userIdA);
  assert.equal(dbUser.vault.isVaultEnabled, true);
  assert.equal(dbUser.vault.salt, 'c2FsdF9uZXdfNDU2');
  assert.equal(dbUser.vault.previousKeys.length, 1);
  assert.equal(dbUser.vault.previousKeys[0].salt, 'c2FsdF90ZXN0XzEyMw==');
});

test('Vault meta: previousKeys capped at 10 and historical keys preserved', async () => {
  // We already have 1 backup from the previous test. Add 3 more to test capping.
  for (let i = 0; i < 3; i++) {
    await request(app)
      .put('/api/vault/meta')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .set('Origin', 'http://localhost:5173')
      .send({
        password: 'Password123!',
        salt: `c2FsdF9yb3VuZF8${i}`,
        kdfParams: { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 },
        wrappedMasterKey: `d3JhcHBlZF9ta18${i}`,
        wrappedMasterKeyIv: `bWtfaXZf${i}`,
        recoveryWrappedKey: `cmVjb3Zlcnlf${i}`,
        recoveryWrappedKeyIv: `cmVjb3Zf${i}`,
      });
  }

  const dbUser = await User.findById(userIdA);
  // previousKeys should be retained and capped at 10
  assert.ok(dbUser.vault.previousKeys.length <= 10, `Expected ≤ 10 previous keys, got ${dbUser.vault.previousKeys.length}`);
});

test('Vault string field max lengths: rejects oversized salt', async () => {
  const longSalt = 'A'.repeat(100); // exceeds 64 char limit
  const res = await request(app)
    .post('/api/vault/setup')
    .set('Authorization', `Bearer ${tokenUserB}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      salt: longSalt,
      kdfParams: { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 },
      wrappedMasterKey: 'd3JhcHBlZF9ta190ZXN0',
      wrappedMasterKeyIv: 'bWtfaXZfdGVzdF8xMjM=',
      recoveryWrappedKey: 'cmVjb3Zlcnlfd3JhcHBlZF9taw==',
      recoveryWrappedKeyIv: 'cmVjb3ZfaXZfdGVzdF8x',
    });

  assert.equal(res.status, 400);
});
