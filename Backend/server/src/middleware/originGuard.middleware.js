/**
 * Origin Guard Middleware
 *
 * Blocks requests that do NOT originate from an allowed origin.
 *
 * NOTE:
 * - Strict Origin check against CLIENT_URL (and allowed dev origins) is the primary control.
 * - X-App-Request header is a public/client-side token (embedded in the frontend bundle)
 *   and acts as a secondary defense-in-depth marker, NOT a secret.
 * - Blanket wildcards like *.vercel.app are intentionally prohibited.
 */

import config from '../config/config.js';
import { isOriginAllowed, extractOrigin } from '../config/allowedOrigins.js';

export const originGuard = (req, res, next) => {
  const isProd = config.isProd;
  const effectiveOrigin = extractOrigin(req);

  // 1. Origin / Referer check
  if (effectiveOrigin && !isOriginAllowed(effectiveOrigin)) {
    return res.status(403).json({
      error: 'Forbidden: request origin is not allowed.',
    });
  }

  // 2. Secondary check in production
  if (isProd) {
    const appToken = config.appRequestToken;
    const clientHeader = req.headers['x-app-request'];

    if (appToken && clientHeader !== appToken) {
      return res.status(403).json({
        error: 'Forbidden: missing or invalid request signature.',
      });
    }

    if (!effectiveOrigin) {
      return res.status(403).json({
        error: 'Forbidden: requests without an Origin or Referer header are not permitted in production.',
      });
    }
  }

  return next();
};

/**
 * Strict CSRF guard specifically for sensitive state-changing or token routes
 * (/auth/refresh, /auth/logout).
 * Strict Origin / Referer check against allowed origins is the PRIMARY control.
 * X-App-Request is secondary.
 */
export const csrfGuard = (req, res, next) => {
  const effectiveOrigin = extractOrigin(req);

  // Primary control: Origin or Referer MUST match allowed origins
  if (!effectiveOrigin || !isOriginAllowed(effectiveOrigin)) {
    return res.status(403).json({
      error: 'Forbidden: invalid or missing Origin header for CSRF-protected action.',
    });
  }

  // Secondary control: X-App-Request if configured
  if (config.appRequestToken) {
    const clientHeader = req.headers['x-app-request'];
    if (clientHeader && clientHeader !== config.appRequestToken) {
      return res.status(403).json({
        error: 'Forbidden: invalid request header signature.',
      });
    }
  }

  return next();
};

export default originGuard;
