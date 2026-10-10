/**
 * Rate Limiting Middleware
 *
 * Applies tiered rate limits to prevent brute-force attacks and API abuse.
 * Tight limits on auth endpoints; moderate limits on all other API routes.
 */

import rateLimit from 'express-rate-limit';

// ─── Shared response formatter ─────────────────────────────────────────────────
const rateLimitHandler = (req, res, _next, options) => {
  res.status(options.statusCode).json({
    error: options.message,
    retryAfter: Math.ceil(options.windowMs / 1000),
  });
};

// ─── Auth endpoints (login / register / refresh) ──────────────────────────────
// 10 attempts per 15 minutes per IP – prevents brute-force / credential stuffing
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,   // Return `RateLimit-*` headers
  legacyHeaders: false,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  handler: rateLimitHandler,
  skipSuccessfulRequests: false,
});

// ─── General API endpoints ────────────────────────────────────────────────────
// 200 requests per 15 minutes per IP – general DoS protection
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP. Please try again later.',
  handler: rateLimitHandler,
});
