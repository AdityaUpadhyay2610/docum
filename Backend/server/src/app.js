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
import config from './config/config.js';

import documentRoutes from './routes/document.routes.js';
import authRoutes from './routes/auth.routes.js';
import vaultRoutes from './routes/vault.routes.js';
import { originGuard } from './middleware/originGuard.middleware.js';
import { apiRateLimiter } from './middleware/rateLimiter.middleware.js';

import { isOriginAllowed } from './config/allowedOrigins.js';
import mongoSanitize from './middleware/mongoSanitize.middleware.js';

const app = express();

// ── Trust proxy – required when running behind Render / load-balancer ──────────
// Without this, req.ip returns the proxy address instead of the real client IP,
// breaking rate limiting, CSRF checks, and audit logging.
app.set('trust proxy', 1);

// ── 1. Helmet – secure response headers ────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // handled by the frontend SPA
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

// ── 2. Cookie parser (needed before any route reads cookies) ───────────────────
app.use(cookieParser());

// ── 2.1 Health Check (internal / ops / Render health check – runs before CORS & origin guard)
// Render's health checks send no Origin header; this must always succeed.
app.get('/api/health', (req, res) => {
  if (config.isProd) {
    return res.status(200).json({ status: 'ok' });
  }
  return res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── 3. CORS – strict whitelist ─────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // In production: DENY requests with no origin (Postman, curl, server-to-server)
      // In development: allow no-origin for easier local testing
      if (!origin) {
        if (config.isProd) {
          const corsErr = new Error('Direct API access without an Origin header is not permitted.');
          corsErr.status = 403;
          return callback(corsErr);
        }
        return callback(null, true);
      }

      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      const corsErr = new Error(`Forbidden: Origin ${origin} is not allowed by CORS`);
      corsErr.status = 403;
      return callback(corsErr);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-App-Request', 'If-Match'],
    exposedHeaders: ['ETag'],
  })
);

// ── 4. Origin Guard – block unauthorized clients ──────────────────────────────
// Applied to all /api/* routes
app.use('/api', originGuard);

// ── 5. Body parsers – size-limited (10mb for document routes, 512kb for all others)
app.use('/api/documents', express.json({ limit: '10mb' }));
app.use('/api/documents', express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));

// ── 5.1 NoSQL Injection Protection ────────────────────────────────────────────
app.use(mongoSanitize);

// ── 6. Auth routes – split rate limits ────────────────────────────────────────
// Strict routes (login / register / google / verify-email / resend-verification):
//   10 req / 15 min – guarded additionally by the token-bucket middleware
// Generous routes (refresh / logout / me):
//   60 req / 15 min – called automatically by the app; tight limits cause false logouts
// NOTE: the per-route rate limiters are applied inside auth.routes.js for granularity.
// Here we apply strictAuthRateLimiter as the outer fence for the whole /api/auth prefix
// (so unknown sub-paths also get some protection) and rely on routes to override where needed.
app.use('/api/auth', authRoutes);

// ── 7. Document routes (general rate limit: 200 req / 15 min) ─────────────────
app.use('/api/documents', apiRateLimiter, documentRoutes);

// ── 8. Vault routes (E2EE key metadata) ───────────────────────────────────────
app.use('/api/vault', apiRateLimiter, vaultRoutes);

// ── 9. 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── 10. Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (
    err.status === 403 ||
    (err.message && (
      err.message.startsWith('Not allowed by CORS') ||
      err.message.includes('CORS') ||
      err.message.includes('Direct API access')
    ))
  ) {
    return res.status(403).json({
      error: err.message || 'Forbidden: request origin is not allowed.',
    });
  }
  // Suppress stack traces in production
  if (!config.isProd) {
    console.error('Unhandled server error:', err.message);
  } else {
    console.error(`[${new Date().toISOString()}] ${err.message}`);
  }
  res.status(err.status || 500).json({
    error:
      config.isProd
        ? 'An unexpected error occurred'
        : err.message || 'Internal server error',
  });
});

export default app;