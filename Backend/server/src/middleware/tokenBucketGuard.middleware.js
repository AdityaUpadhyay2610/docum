/**
 * Token Bucket Auth Guard Middleware
 *
 * Applies THREE independent token bucket checks to every authentication request:
 *
 *  ┌─────────────────────────────────────────────────────────────────────────┐
 *  │ Guard 1 · Per-IP bucket                                                 │
 *  │   Capacity : 20 tokens  |  Refill: 1 token / 3 min  (≈ 20/hr sustained)│
 *  │   Blocks a single IP from trying many different accounts (IP sweeping). │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │ Guard 2 · Per-email bucket                                              │
 *  │   Capacity : 5 tokens   |  Refill: 1 token / 5 min  (≈ 12/hr sustained)│
 *  │   Blocks targeting one account from many IPs (distributed attack).      │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │ Guard 3 · Composite (IP + email) bucket                                 │
 *  │   Capacity : 5 tokens   |  Refill: 1 token / 2 min  (≈ 30/hr sustained)│
 *  │   Tightest check: one IP repeatedly attacking one account.              │
 *  └─────────────────────────────────────────────────────────────────────────┘
 *
 * On failed login the controller calls `penaliseFailedLogin(ip, email)` to drain
 * extra tokens from all three buckets, creating progressive slowdown / lockout.
 *
 * Successful login calls `clearLoginBuckets(ip, email)` to reset state so a
 * legitimate user is never permanently locked out after changing their password.
 *
 * All three checks must PASS — rejection at any check returns 429.
 */

import { consumeToken, drainTokens, resetBucket } from '../utils/tokenBucket.js';

// ── Bucket configs ─────────────────────────────────────────────────────────────

/** Per-IP: wide net to stop one IP from sweeping many email addresses */
const IP_CONFIG = {
  capacity: 20,
  refillRate: 1 / 180, // 1 token per 3 minutes
};

/** Per-email: stop distributed attacks from many IPs against one account */
const EMAIL_CONFIG = {
  capacity: 5,
  refillRate: 1 / 300, // 1 token per 5 minutes
};

/** Per-IP+email composite: tightest limit for the same IP → same account */
const COMPOSITE_CONFIG = {
  capacity: 5,
  refillRate: 1 / 120, // 1 token per 2 minutes
};

/** Extra tokens drained on each failed login attempt (exponential burn) */
const FAIL_DRAIN_EXTRA = 2;

// ── Key builders ───────────────────────────────────────────────────────────────

const ipKey = (ip) => `login:ip:${ip}`;
const emailKey = (email) => `login:email:${email ? email.toLowerCase() : '_unknown_'}`;
const compositeKey = (ip, email) => `login:comp:${ip}:${email ? email.toLowerCase() : '_unknown_'}`;

// ── Helpers exported for use in auth controller ────────────────────────────────

/**
 * Drain additional tokens after a FAILED login attempt.
 * The extra burn creates an escalating delay for repeated failures.
 *
 * @param {string} ip
 * @param {string} email
 */
export function penaliseFailedLogin(ip, email) {
  drainTokens(ipKey(ip), FAIL_DRAIN_EXTRA, IP_CONFIG.capacity);
  drainTokens(emailKey(email), FAIL_DRAIN_EXTRA, EMAIL_CONFIG.capacity);
  drainTokens(compositeKey(ip, email), FAIL_DRAIN_EXTRA, COMPOSITE_CONFIG.capacity);
}

/**
 * Reset all buckets for a user after a SUCCESSFUL login.
 * A legitimate user must never be permanently locked out.
 *
 * @param {string} ip
 * @param {string} email
 */
export function clearLoginBuckets(ip, email) {
  resetBucket(ipKey(ip));
  resetBucket(emailKey(email));
  resetBucket(compositeKey(ip, email));
}

// ── Middleware factory ─────────────────────────────────────────────────────────

/**
 * Express middleware that runs all three token bucket guards.
 * Attach to POST /auth/login and POST /auth/register.
 */
export const loginTokenBucketGuard = (req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || '0.0.0.0';
  // Read email from body early – it may not be present (malformed request), that's fine
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;

  // ── Check 1: Per-IP ─────────────────────────────────────────────────────────
  const ipResult = consumeToken(ipKey(ip), IP_CONFIG);
  if (!ipResult.allowed) {
    return res
      .status(429)
      .set('Retry-After', Math.ceil(ipResult.retryAfterMs / 1000))
      .json({
        error: 'Too many login attempts from your IP address. Please wait before trying again.',
        retryAfterSeconds: Math.ceil(ipResult.retryAfterMs / 1000),
        code: 'RATE_LIMIT_IP',
      });
  }

  // ── Check 2: Per-email (only if email was supplied) ─────────────────────────
  if (email) {
    const emailResult = consumeToken(emailKey(email), EMAIL_CONFIG);
    if (!emailResult.allowed) {
      return res
        .status(429)
        .set('Retry-After', Math.ceil(emailResult.retryAfterMs / 1000))
        .json({
          error: 'This account has been temporarily locked due to too many failed attempts. Please wait.',
          retryAfterSeconds: Math.ceil(emailResult.retryAfterMs / 1000),
          code: 'RATE_LIMIT_ACCOUNT',
        });
    }
  }

  // ── Check 3: Composite IP + email ───────────────────────────────────────────
  if (email) {
    const compResult = consumeToken(compositeKey(ip, email), COMPOSITE_CONFIG);
    if (!compResult.allowed) {
      return res
        .status(429)
        .set('Retry-After', Math.ceil(compResult.retryAfterMs / 1000))
        .json({
          error: 'Too many login attempts for this account from your device. Please wait.',
          retryAfterSeconds: Math.ceil(compResult.retryAfterMs / 1000),
          code: 'RATE_LIMIT_DEVICE_ACCOUNT',
        });
    }
  }

  // Attach helpers onto req so the controller can call them without re-computing keys
  req._tokenBucket = { ip, email };

  return next();
};

/**
 * Lighter guard for POST /auth/register — only IP-based.
 * Account creation is less sensitive to email-targeted attacks.
 */
export const registerTokenBucketGuard = (req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || '0.0.0.0';

  // Slightly looser IP config for registration (same IP registering many accounts)
  const regIpConfig = { capacity: 10, refillRate: 1 / 300 }; // 1 token / 5 min
  const ipResult = consumeToken(`register:ip:${ip}`, regIpConfig);

  if (!ipResult.allowed) {
    return res
      .status(429)
      .set('Retry-After', Math.ceil(ipResult.retryAfterMs / 1000))
      .json({
        error: 'Too many registration attempts from your IP address. Please wait.',
        retryAfterSeconds: Math.ceil(ipResult.retryAfterMs / 1000),
        code: 'RATE_LIMIT_REGISTER_IP',
      });
  }

  return next();
};
