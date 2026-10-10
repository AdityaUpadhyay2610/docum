/**
 * Express Application – Security hardened
 *
 * Security layers applied (in order):
 *  1. Helmet          – secure HTTP response headers
 *  2. CORS            – browser cross-origin policy (whitelist-only)
 *  3. Origin Guard    – blocks Postman / curl / headless clients in production
 *  4. Rate Limiters   – coarse per-IP throttling (express-rate-limit, outer fence)
 *  5. Token Bucket    – fine-grained per-IP / per-email / composite guard on auth routes
 *  6. Body parsers    – size-limited JSON & urlencoded
 *  7. Request validators (per-route, via express-validator)
 *  8. Auth middleware  (per-route JWT verification)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import documentRoutes from './routes/document.routes.js';
import authRoutes from './routes/auth.routes.js';
import { originGuard } from './middleware/originGuard.middleware.js';
import { authRateLimiter, apiRateLimiter } from './middleware/rateLimiter.middleware.js';

const app = express();

// ── 1. Helmet – secure response headers ────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // handled by the frontend SPA
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

// ── 2. Cookie parser (needed before any route reads cookies) ───────────────────
app.use(cookieParser());

// ── 3. CORS – strict whitelist ─────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

if (process.env.CLIENT_URL) {
  process.env.CLIENT_URL.split(',').forEach((url) => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (trimmed) allowedOrigins.push(trimmed);
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      // In production: DENY requests with no origin (Postman, curl, server-to-server)
      // In development: allow no-origin for easier local testing
      if (!origin) {
        if (process.env.NODE_ENV === 'production') {
          return callback(new Error('Direct API access is not permitted'));
        }
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, '');
      let isAllowed = allowedOrigins.some(
        (allowed) => allowed.replace(/\/+$/, '') === normalizedOrigin
      );

      // Automatically allow Vercel preview domains
      if (!isAllowed) {
        try {
          const parsed = new URL(origin);
          if (parsed.hostname.endsWith('.vercel.app')) {
            isAllowed = true;
          }
        } catch (_) {
          // ignore invalid origin URLs
        }
      }

      if (isAllowed) return callback(null, true);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-App-Request'],
  })
);

// ── 4. Origin Guard – block Postman / curl / headless clients ─────────────────
// Applied to all /api/* routes; skips health check
app.use('/api', originGuard);

// ── 5. Body parsers – size-limited ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 6. Health Check (internal / ops use only, not behind origin guard) ─────────
// Returns minimal info – no sensitive uptime or version data in production
app.get('/api/health', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(200).json({ status: 'ok' });
  }
  return res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── 7. Auth routes (tight rate limit: 10 req / 15 min) ────────────────────────
app.use('/api/auth', authRateLimiter, authRoutes);

// ── 8. Document routes (general rate limit: 200 req / 15 min) ─────────────────
app.use('/api/documents', apiRateLimiter, documentRoutes);

// ── 9. 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── 10. Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Suppress stack traces in production
  if (process.env.NODE_ENV !== 'production') {
    console.error('Unhandled server error:', err);
  } else {
    console.error(`[${new Date().toISOString()}] ${err.message}`);
  }
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message || 'Internal server error',
  });
});

export default app;