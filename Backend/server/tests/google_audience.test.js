/**
 * google_audience.test.js
 *
 * Tests that:
 *  1. Google tokens with the wrong audience are rejected with HTTP 401
 *  2. Google tokens with the correct audience are accepted
 *
 * The google-auth-library OAuth2Client is mocked so no network call is made.
 */

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// ── Environment must be set BEFORE any module imports ────────────────────────
process.env.NODE_ENV      = 'development';
process.env.MONGO_URI     = 'mongodb://127.0.0.1:27017/placeholder';
process.env.JWT_ACCESS_SECRET  = 'test_access_secret_0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_0123456789abcdef0123456789abcdef';
process.env.CLIENT_URL    = 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID   = 'correct-client-id.apps.googleusercontent.com';

// ── Import the module under test AFTER setting env vars ──────────────────────
const { verifyGoogleToken } = await import('../src/controllers/auth.controller.js');
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/user.models.js');

// ── Mock helper ───────────────────────────────────────────────────────────────
/**
 * Replace verifyGoogleToken in the auth controller module for one test, then restore.
 * We do this by directly overriding the module export that auth.routes.js would call.
 * Because auth.controller.js exports verifyGoogleToken and googleAuth calls it by
 * closure-reference, we need to mock at the OAuth2Client level instead.
 *
 * Strategy: mock the OAuth2Client.prototype.verifyIdToken that the controller holds.
 */
import { OAuth2Client } from 'google-auth-library';

import { setupTestDB, teardownTestDB } from './setup.js';

before(async () => {
  await setupTestDB();
  await User.deleteMany({});
});

after(async () => {
  await teardownTestDB();
  mock.restoreAll();
});

// ── Unit tests for verifyGoogleToken helper ───────────────────────────────────

test('verifyGoogleToken: rejects a token whose audience does not match GOOGLE_CLIENT_ID', async () => {
  // Mock verifyIdToken to return a payload with the WRONG aud
  const originalVerify = OAuth2Client.prototype.verifyIdToken;

  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      aud:            'wrong-audience.apps.googleusercontent.com',
      sub:            'google-sub-bad-aud',
      email:          'badaud@example.com',
      email_verified: true,
      name:           'Bad Aud User',
    }),
  });

  try {
    await assert.rejects(
      () => verifyGoogleToken('fake-id-token-wrong-aud'),
      /INVALID_GOOGLE_TOKEN/
    );
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
  }
});

test('verifyGoogleToken: rejects a token when email_verified is false', async () => {
  const originalVerify = OAuth2Client.prototype.verifyIdToken;

  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      aud:            process.env.GOOGLE_CLIENT_ID,
      sub:            'google-sub-unverified',
      email:          'unverified@example.com',
      email_verified: false,
      name:           'Unverified User',
    }),
  });

  try {
    await assert.rejects(
      () => verifyGoogleToken('fake-id-token-unverified'),
      /INVALID_GOOGLE_TOKEN/
    );
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
  }
});

test('verifyGoogleToken: accepts a valid token with matching audience and verified email', async () => {
  const originalVerify = OAuth2Client.prototype.verifyIdToken;

  const expected = {
    aud:            process.env.GOOGLE_CLIENT_ID,
    sub:            'google-sub-valid',
    email:          'valid@example.com',
    email_verified: true,
    name:           'Valid User',
  };

  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => expected,
  });

  try {
    const payload = await verifyGoogleToken('fake-id-token-valid');
    assert.equal(payload.email, 'valid@example.com');
    assert.equal(payload.sub, 'google-sub-valid');
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
  }
});

// ── Integration test: /api/auth/google rejects bad-audience tokens ────────────

test('POST /api/auth/google returns 401 when verifyIdToken returns wrong audience', async () => {
  const originalVerify = OAuth2Client.prototype.verifyIdToken;

  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      aud:            'evil-client.apps.googleusercontent.com',
      sub:            'google-sub-evil',
      email:          'evil@example.com',
      email_verified: true,
    }),
  });

  try {
    const res = await request(app)
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'bad-audience-token' });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid|unverified/i);
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
  }
});

test('Google linking full flow: PASSWORD_REQUIRED_TO_LINK -> wrong password rejected -> correct password links and revokes other sessions', async () => {
  const originalVerify = OAuth2Client.prototype.verifyIdToken;

  // 1. Create a verified local account with an existing session
  const regRes = await request(app)
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      name: 'Link Tester',
      email: 'linktester@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
  assert.equal(regRes.status, 201);

  // Mark verified in DB and add an existing session
  const localUser = await User.findOne({ email: 'linktester@example.com' });
  localUser.isEmailVerified = true;
  localUser.sessions = [{ hash: 'existing-session-hash-1', family: 'old-family-1' }];
  await localUser.save();

  // 2. Mock Google verification returning matching email
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      aud:            process.env.GOOGLE_CLIENT_ID,
      sub:            'google-sub-linktest-999',
      email:          'linktester@example.com',
      email_verified: true,
      name:           'Link Tester Google',
    }),
  });

  try {
    // 3. Step A: Call /auth/google without password -> PASSWORD_REQUIRED_TO_LINK
    const resNoPass = await request(app)
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'valid-google-token' });

    assert.equal(resNoPass.status, 400);
    assert.equal(resNoPass.body.code, 'PASSWORD_REQUIRED_TO_LINK');

    // Confirm googleId not set
    let dbUser = await User.findOne({ email: 'linktester@example.com' });
    assert.equal(dbUser.googleId, null);
    assert.equal(dbUser.sessions.length, 1);

    // 4. Step B: Call with wrong password -> 401 INVALID_PASSWORD_FOR_LINK
    const resWrongPass = await request(app)
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'valid-google-token', password: 'WrongPassword123!' });

    assert.equal(resWrongPass.status, 401);
    assert.equal(resWrongPass.body.code, 'INVALID_PASSWORD_FOR_LINK');

    // Confirm googleId still not set
    dbUser = await User.findOne({ email: 'linktester@example.com' });
    assert.equal(dbUser.googleId, null);

    // 5. Step C: Call with correct password -> 200 Linked, other sessions revoked
    const resSuccess = await request(app)
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'valid-google-token', password: 'Password123!' });

    assert.equal(resSuccess.status, 200);
    assert.ok(resSuccess.body.accessToken, 'Access token should be issued');

    dbUser = await User.findOne({ email: 'linktester@example.com' });
    assert.equal(dbUser.googleId, 'google-sub-linktest-999');
    // Previous session 'old-family-1' must have been revoked
    assert.ok(!dbUser.sessions.some((s) => s.family === 'old-family-1'), 'Previous sessions revoked');
    assert.equal(dbUser.sessions.length, 1, 'Only the new session exists');
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
  }
});
