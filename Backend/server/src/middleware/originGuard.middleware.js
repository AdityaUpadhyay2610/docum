/**
 * Origin Guard Middleware
 *
 * Blocks requests that do NOT originate from a known browser context.
 * This stops direct API access from Postman, curl, and other third-party
 * HTTP clients that cannot set the `Origin` or `Referer` header from a
 * real browser page hosted on an allowed domain.
 *
 * Strategy:
 *  1. In PRODUCTION every request MUST carry an Origin (or Referer as a fallback)
 *     that matches the whitelist.
 *  2. The custom header `X-App-Request` must equal the value stored in
 *     VITE_APP_REQUEST_TOKEN / APP_REQUEST_TOKEN env vars (shared secret).
 *  3. Requests without either will receive 403.
 *
 * Note: CORS already rejects cross-origin browser requests; this layer
 * additionally rejects non-browser tool requests (which carry no Origin at all).
 */

const ALLOWED_ORIGINS = (() => {
  const list = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
  if (process.env.CLIENT_URL) {
    process.env.CLIENT_URL.split(',').forEach((u) => {
      const t = u.trim().replace(/\/+$/, '');
      if (t) list.push(t);
    });
  }
  return list;
})();

/**
 * Checks if a given origin string is in the allowed list or is a *.vercel.app subdomain.
 */
function isOriginAllowed(origin) {
  if (!origin) return false;
  const normalised = origin.replace(/\/+$/, '');
  if (ALLOWED_ORIGINS.some((o) => o.replace(/\/+$/, '') === normalised)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname.endsWith('.vercel.app')) return true;
  } catch (_) {
    // ignore
  }
  return false;
}

/**
 * Extracts the effective origin from the request.
 * Falls back to the `Referer` header (browsers always send one of these).
 */
function extractOrigin(req) {
  if (req.headers.origin) return req.headers.origin;
  if (req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      return `${u.protocol}//${u.host}`;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

/**
 * originGuard – apply to all API routes you want to protect.
 *
 * In development (NODE_ENV !== 'production') the check is relaxed so you can
 * still use tools like REST Client / Insomnia against localhost without the
 * shared-secret header; the Origin check still applies.
 */
export const originGuard = (req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';

  const effectiveOrigin = extractOrigin(req);

  // ── 1. Origin / Referer check ──────────────────────────────────────────────
  if (effectiveOrigin && !isOriginAllowed(effectiveOrigin)) {
    return res.status(403).json({
      error: 'Forbidden: request origin is not allowed.',
    });
  }

  // ── 2. Shared-secret header check (production only) ───────────────────────
  // The frontend sets this header on every request via the API client.
  // Postman / curl users cannot know this value unless they have the env var.
  if (isProd) {
    const appSecret = process.env.APP_REQUEST_TOKEN;
    const clientHeader = req.headers['x-app-request'];

    if (appSecret && clientHeader !== appSecret) {
      return res.status(403).json({
        error: 'Forbidden: missing or invalid request signature.',
      });
    }

    // In production, require a real origin at all times
    if (!effectiveOrigin) {
      return res.status(403).json({
        error: 'Forbidden: requests without an Origin header are not permitted in production.',
      });
    }
  }

  return next();
};

export default originGuard;
