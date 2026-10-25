import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Configure test environment variables before importing app
process.env.NODE_ENV = 'development';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placeholder';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_0123456789abcdef0123456789abcdef';
process.env.CLIENT_URL = 'http://localhost:5173';

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/user.models.js');
const { default: Document } = await import('../src/models/document.models.js');
import { setupTestDB, teardownTestDB } from './setup.js';

let tokenUserA = '';
let tokenUserB = '';
let docAId = '';

before(async () => {
  await setupTestDB();
  await User.deleteMany({});
  await Document.deleteMany({});

  // 1. Register User A
  const resA = await request(app)
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      name: 'User A',
      email: 'usera@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
  assert.equal(resA.status, 201, `User A registration failed: ${JSON.stringify(resA.body)}`);
  tokenUserA = resA.body.accessToken;

  // 2. Register User B
  const resB = await request(app)
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      name: 'User B',
      email: 'userb@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
  assert.equal(resB.status, 201, `User B registration failed: ${JSON.stringify(resB.body)}`);
  tokenUserB = resB.body.accessToken;

  // 3. User A creates a document
  const createDocRes = await request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      title: 'User A Private Document',
      icon: '🔒',
      content: [{ id: 'block-1', type: 'paragraph', text: 'Top Secret' }],
    });
  assert.equal(createDocRes.status, 201);
  docAId = createDocRes.body._id;
  assert.ok(docAId, 'Document ID should be present');
});

after(async () => {
  await teardownTestDB();
});

test('IDOR Protection: User B CANNOT read User A document', async () => {
  const res = await request(app)
    .get(`/api/documents/${docAId}`)
    .set('Authorization', `Bearer ${tokenUserB}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(res.status, 404);
  assert.match(res.body.error, /not found or access denied/i);
});

test('IDOR Protection: User B CANNOT update User A document', async () => {
  const res = await request(app)
    .put(`/api/documents/${docAId}`)
    .set('Authorization', `Bearer ${tokenUserB}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      title: 'Hacked by User B',
    });

  assert.equal(res.status, 404);
  assert.match(res.body.error, /not found or access denied/i);

  // Verify in database that doc was NOT updated
  const docInDb = await Document.findById(docAId);
  assert.equal(docInDb.title, 'User A Private Document');
});

test('IDOR Protection: User B CANNOT delete User A document', async () => {
  const res = await request(app)
    .delete(`/api/documents/${docAId}`)
    .set('Authorization', `Bearer ${tokenUserB}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(res.status, 404);
  assert.match(res.body.error, /not found or access denied/i);

  // Verify in database that doc was NOT deleted
  const docInDb = await Document.findById(docAId);
  assert.ok(docInDb, 'Document must still exist in DB');
});

test('Owner Access: User A CAN read their own document', async () => {
  const res = await request(app)
    .get(`/api/documents/${docAId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'User A Private Document');
});

test('Owner Access: User A CAN update their own document', async () => {
  const res = await request(app)
    .put(`/api/documents/${docAId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      title: 'User A Updated Document',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'User A Updated Document');
});

test('Owner Access: User A CAN delete their own document', async () => {
  const res = await request(app)
    .delete(`/api/documents/${docAId}`)
    .set('Authorization', `Bearer ${tokenUserA}`)
    .set('Origin', 'http://localhost:5173');

  assert.equal(res.status, 200);

  const docInDb = await Document.findById(docAId);
  assert.equal(docInDb, null, 'Document should be deleted');
});
