/**
 * Rate Limiting Middleware
 *
 * Tiered rate limits:
 *
 *  strictAuthRateLimiter  – login, register, google, verify-email, resend-verification
 *    10 requests / 15 minutes per IP (brute-force protection)
 *
 *  generousAuthRateLimiter – refresh, logout, me
 *    60 requests / 15 minutes per IP (called automatically by the app)
 *
 *  apiRateLimiter – documents, vault
 *    200 requests / 15 minutes per IP (general DoS protection)
 */

import rateLimit from 'express-rate-limit';

// ─── Shared response formatter ─────────────────────────────────────────────────
const rateLimitHandler = (req, res, _next, options) => {
  res.status(options.statusCode).json({
    error: options.message,
    retryAfter: Math.ceil(options.windowMs / 1000),
  });
};

// ─── Strict Auth endpoints (login / register / google / verify / resend) ───────
// 10 attempts per 15 minutes per IP – prevents brute-force / credential stuffing
export const strictAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,   // Return `RateLimit-*` headers
  legacyHeaders: false,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  handler: rateLimitHandler,
  skipSuccessfulRequests: false,
});

// ─── Generous Auth endpoints (refresh / logout / me) ────────────────────────
// Called automatically by the app; tight limits would cause false logouts.
// 60 requests per 15 minutes per IP is still a meaningful guard against abuse.
export const generousAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many session requests. Please try again later.',
  handler: rateLimitHandler,
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

// Backwards-compatible alias so existing imports of `authRateLimiter` keep working
export const authRateLimiter = strictAuthRateLimiter;
