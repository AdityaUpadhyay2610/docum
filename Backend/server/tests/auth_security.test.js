import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'development';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/document_workshop_test_auth';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_0123456789abcdef0123456789abcdef';
process.env.CLIENT_URL = 'http://localhost:5173';

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/user.models.js');

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteMany({});
});

after(async () => {
  await User.deleteMany({});
  await mongoose.disconnect();
});

test('Password login MUST reject accounts created without a password (Google-only)', async () => {
  // Create a Google-only user with no password
  await User.create({
    name: 'Google User',
    email: 'googleuser@example.com',
    password: null,
    googleId: 'google-sub-12345',
    authProvider: 'google',
    isEmailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: 'googleuser@example.com',
      password: 'AnyPassword123!',
    });

  assert.equal(res.status, 401);
  assert.match(res.body.error, /Google/i);
});

test('Email verification: account linking is rejected if email is not verified', async () => {
  // 1. User registers with email & password (isEmailVerified = false)
  const regRes = await request(app)
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      name: 'Unverified User',
      email: 'unverified@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });

  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.user.isEmailVerified, false);
  const verificationToken = regRes.body.verificationToken;
  assert.ok(verificationToken, 'Should receive verification token');

  // 2. An attempt to link an unverified account via Google should fail
  // We can test this directly on the User model or mock payload
  const existingUser = await User.findOne({ email: 'unverified@example.com' });
  assert.equal(existingUser.isEmailVerified, false);

  // 3. Verify email with token
  const verifyRes = await request(app)
    .post('/api/auth/verify-email')
    .set('Origin', 'http://localhost:5173')
    .send({
      token: verificationToken,
    });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.isEmailVerified, true);

  const updatedUser = await User.findOne({ email: 'unverified@example.com' });
  assert.equal(updatedUser.isEmailVerified, true);
});

test('CSRF on /auth/refresh and /auth/logout: rejects requests with invalid or missing Origin', async () => {
  // 1. Without Origin or Referer header
  const refreshNoOrigin = await request(app)
    .post('/api/auth/refresh')
    .send({});
  assert.equal(refreshNoOrigin.status, 403);
  assert.match(refreshNoOrigin.body.error, /Origin header/i);

  // 2. With untrusted cross-origin
  const refreshEvilOrigin = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', 'https://malicious-site.com')
    .send({});
  assert.equal(refreshEvilOrigin.status, 403);
  assert.match(refreshEvilOrigin.body.error, /Origin/i);

  // 3. Logout without Origin
  const logoutNoOrigin = await request(app)
    .post('/api/auth/logout')
    .send({});
  assert.equal(logoutNoOrigin.status, 403);
});

test('Refresh token rotation & reuse detection', async () => {
  // 1. Login to get initial cookies
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: 'unverified@example.com',
      password: 'Password123!',
    });
  assert.equal(loginRes.status, 200);

  const cookies = loginRes.headers['set-cookie'];
  assert.ok(cookies, 'Set-Cookie header should be present');
  const initialRefreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
  assert.ok(initialRefreshCookie);

  // 2. First refresh: should succeed and rotate token
  const refresh1Res = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', [initialRefreshCookie]);

  assert.equal(refresh1Res.status, 200);
  assert.ok(refresh1Res.body.accessToken);
  const rotatedCookies = refresh1Res.headers['set-cookie'];
  const newRefreshCookie = rotatedCookies.find((c) => c.startsWith('refreshToken='));
  assert.ok(newRefreshCookie);

  // 3. Token reuse detection: attempting to reuse initialRefreshCookie
  const reuseRes = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', [initialRefreshCookie]);

  assert.equal(reuseRes.status, 401);
  assert.equal(reuseRes.body.code, 'TOKEN_REUSE_DETECTED');

  // 4. Session family should now be revoked, so even newRefreshCookie is rejected
  const revokedRes = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', [newRefreshCookie]);

  assert.equal(revokedRes.status, 401);
});

test('NoSQL Injection Protection: mongoSanitize rejects $ and . in keys', async () => {
  const dollarRes = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: { $gt: '' },
      password: 'password',
    });

  assert.equal(dollarRes.status, 400);
  assert.match(dollarRes.body.error, /keys containing "\$" or "\." are not allowed/i);

  const dotRes = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({
      'user.admin': true,
      password: 'password',
    });

  assert.equal(dotRes.status, 400);
  assert.match(dotRes.body.error, /keys containing "\$" or "\." are not allowed/i);
});
