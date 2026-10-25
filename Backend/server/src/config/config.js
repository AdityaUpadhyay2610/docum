/**
 * Central Configuration Module – Backend
 *
 * All environment variables are read and validated HERE.
 * Every other module imports from this file instead of reading
 * process.env directly. This gives us:
 *  - A single crash-fast check at startup if required vars are missing
 *  - Easy discoverability of every config key the app needs
 *  - No silent undefined values scattered across the codebase
 *
 * Load order: server.js already calls `import 'dotenv/config'` before
 * anything else, so process.env is fully populated by the time this
 * module is evaluated.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read a required env var. Throws a descriptive error at startup if missing.
 * @param {string} key - The environment variable name.
 * @returns {string}
 */
function required(key) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `FATAL: Environment variable "${key}" must be set. ` +
      `Check your .env file or deployment platform settings.`
    );
  }
  return value.trim();
}

/**
 * Read an optional env var with a fallback.
 * @param {string} key - The environment variable name.
 * @param {string} fallback - Default value if the var is not set.
 * @returns {string}
 */
function optional(key, fallback = '') {
  const value = process.env[key];
  return value ? value.trim() : fallback;
}

// ── Configuration Object ──────────────────────────────────────────────────────

const config = {
  // ── Server ──────────────────────────────────────────────────────────────────
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  get isProd() {
    return this.nodeEnv === 'production';
  },

  // ── Database ─────────────────────────────────────────────────────────────────
  mongoUri: required('MONGO_URI'),

  // ── JWT Secrets ──────────────────────────────────────────────────────────────
  // IMPORTANT: Both must be long (≥32 chars), random hex strings – NEVER the same value.
  jwtAccessSecret: (() => {
    const s = required('JWT_ACCESS_SECRET');
    if (s.length < 32) throw new Error('FATAL: JWT_ACCESS_SECRET must be at least 32 characters long.');
    return s;
  })(),
  jwtRefreshSecret: (() => {
    const s = required('JWT_REFRESH_SECRET');
    if (s.length < 32) throw new Error('FATAL: JWT_REFRESH_SECRET must be at least 32 characters long.');
    return s;
  })(),

  // JWT token lifetimes
  jwtAccessExpiresIn:  optional('JWT_ACCESS_EXPIRES_IN',  '10m'),
  jwtRefreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  // ── CORS & Client ────────────────────────────────────────────────────────────
  // Comma-separated list of allowed frontend origins (e.g. Vercel preview URL)
  clientUrl: (() => {
    const val = optional('CLIENT_URL', '');
    if (optional('NODE_ENV', 'development') === 'production' && !val) {
      throw new Error('FATAL: Environment variable "CLIENT_URL" must be set in production.');
    }
    return val;
  })(),

  // ── Origin Guard shared secret ───────────────────────────────────────────────
  // The frontend sends this in the X-App-Request header on every request.
  // Must match VITE_APP_REQUEST_TOKEN in the frontend .env.
  appRequestToken: optional('APP_REQUEST_TOKEN', ''),

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  googleClientId: optional('GOOGLE_CLIENT_ID', ''),
  googleClientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
};

// ── Cross-secret check ────────────────────────────────────────────────────────
// Enforce that the two JWT secrets are distinct at startup.
// Using the same secret for both allows refresh tokens to be used as access tokens.
if (config.jwtAccessSecret === config.jwtRefreshSecret) {
  throw new Error(
    'FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values. ' +
    'Using the same secret for both is a security vulnerability.'
  );
}

export default config;

