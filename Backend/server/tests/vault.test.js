import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';

// Configure test environment variables before importing app
process.env.NODE_ENV = 'development';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/document_workshop_test_vault';
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

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
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
  await User.deleteMany({});
  await Document.deleteMany({});
  await mongoose.disconnect();
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

test('Encrypted document write: Vault-enabled User A can create encrypted document', async () => {
  const customId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      _id: customId,
      isEncrypted: true,
      encTitle: { v: 'v1', iv: 'aXZfdGl0bGVfMQ==', ct: 'Y3RfdGl0bGVfMQ==' },
      encIcon: { v: 'v1', iv: 'aXZfaWNvbl8x', ct: 'Y3RfaWNvbl8x' },
      encContent: { v: 'v1', iv: 'aXZfY29udGVudF8x', ct: 'Y3RfY29udGVudF8x' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: 'ZGVrX2l2XzE=' },
    });

  assert.equal(res.status, 201);
  assert.equal(res.body._id, customId);
  assert.equal(res.body.isEncrypted, true);
  assert.equal(res.body.revision, 0);
  assert.equal(res.body.title, '[Encrypted]');
  encryptedDocId = res.body._id;
});

test('Atomic revision: update with matching revision increments revision and succeeds', async () => {
  const res = await request(app)
    .put(`/api/documents/${encryptedDocId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .set('If-Match', '"0"')
    .send({
      isEncrypted: true,
      encTitle: { v: 'v1', iv: 'aXZfdGl0bGVfMg==', ct: 'Y3RfdGl0bGVfMg==' },
      encContent: { v: 'v1', iv: 'aXZfY29udGVudF8y', ct: 'Y3RfY29udGVudF8y' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: 'ZGVrX2l2XzE=' },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.revision, 1);
  assert.equal(res.headers.etag, '"1"');
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
      encTitle: { v: 'v1', iv: 'aXZfdGl0bGVfMw==', ct: 'Y3RfdGl0bGVfMw==' },
      encContent: { v: 'v1', iv: 'aXZfY29udGVudF8z', ct: 'Y3RfY29udGVudF8z' },
      encDek: { wrappedDek: 'd3JhcHBlZF9kZWtfMQ==', dekIv: 'ZGVrX2l2XzE=' },
    });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /Conflict/i);
  assert.equal(res.body.currentRevision, 1);
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
