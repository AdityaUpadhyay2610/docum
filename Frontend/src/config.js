/**
 * Central Configuration Module – Frontend
 *
 * All Vite environment variables (import.meta.env.VITE_*) are read HERE.
 * Every other module should import from this file instead of reading
 * import.meta.env directly, giving us:
 *  - A single place to see every config value the frontend needs
 *  - Clear error messages when required vars are missing
 *  - Easy mocking in tests
 *
 * Variables MUST be prefixed with VITE_ to be exposed by Vite.
 * See: https://vitejs.dev/guide/env-and-mode.html
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read an optional Vite env var with a fallback.
 * @param {string} key - The VITE_ prefixed env var name.
 * @param {string} fallback - Default value if the var is not set.
 * @returns {string}
 */
function optional(key, fallback = '') {
  const value = import.meta.env[key];
  return value ? String(value).trim() : fallback;
}

// ── Configuration Object ──────────────────────────────────────────────────────

const config = {
  // ── API ───────────────────────────────────────────────────────────────────────
  // Base URL of the backend server (without trailing slash or /api suffix).
  // Set VITE_API_URL in .env to your backend origin.
  apiUrl: optional('VITE_API_URL', optional('VITE_API_BASE_URL', 'http://localhost:3000')),

  // ── Origin Guard ──────────────────────────────────────────────────────────────
  // Shared secret sent in X-App-Request header on every API call.
  // Must match APP_REQUEST_TOKEN in the backend .env (production only).
  appRequestToken: optional('VITE_APP_REQUEST_TOKEN', ''),

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  googleClientId: optional('VITE_GOOGLE_CLIENT_ID', ''),

  // ── Environment ───────────────────────────────────────────────────────────────
  mode: import.meta.env.MODE ?? 'development',
  get isProd() {
    return this.mode === 'production';
  },
  isDev: import.meta.env.DEV ?? true,
};

export default config;
