import config from './config.js';

/**
 * Shared Allowed Origins List & Origin Validator
 *
 * NOTE on Security Controls:
 * - Strict Origin / Referer check matching configured CLIENT_URL is the primary control.
 * - X-App-Request header is a public/client-side value (embedded in frontend bundle),
 *   serving only as a secondary defense-in-depth marker, NOT a secret.
 * - Blanket wildcards like *.vercel.app are intentionally disallowed to prevent arbitrary
 *   third-party Vercel deployments from making authenticated cross-origin requests.
 */

const baseOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

export const getAllowedOrigins = () => {
  const origins = [...baseOrigins];
  if (config.clientUrl) {
    config.clientUrl.split(',').forEach((url) => {
      const trimmed = url.trim().replace(/\/+$/, '');
      if (trimmed && !origins.includes(trimmed)) {
        origins.push(trimmed);
      }
    });
  }
  return origins;
};

export const isOriginAllowed = (origin) => {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/+$/, '');
  const allowed = getAllowedOrigins();
  return allowed.some((allowedOrigin) => allowedOrigin.replace(/\/+$/, '') === normalized);
};

export const extractOrigin = (req) => {
  if (req.headers.origin) {
    return req.headers.origin.trim().replace(/\/+$/, '');
  }
  if (req.headers.referer) {
    try {
      const url = new URL(req.headers.referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      // ignore invalid URL format
    }
  }
  return null;
};
