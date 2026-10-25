import express from 'express';
import {
  register,
  login,
  googleAuth,
  refreshAccessToken,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
} from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { csrfGuard } from '../middleware/originGuard.middleware.js';
import {
  loginValidator,
  registerValidator,
  googleAuthValidator,
  verifyEmailValidator,
} from '../validators/auth.validator.js';
import {
  loginTokenBucketGuard,
  registerTokenBucketGuard,
} from '../middleware/tokenBucketGuard.middleware.js';
import {
  strictAuthRateLimiter,
  generousAuthRateLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// ─── Strict routes: 10 req / 15 min + token bucket ────────────────────────────
// Token bucket guard runs BEFORE validation so we reject flood attempts early,
// before spending CPU on bcrypt or DB lookups.

router.post('/register',            strictAuthRateLimiter, registerTokenBucketGuard, registerValidator,    validateRequest, register);
router.post('/verify-email',        strictAuthRateLimiter,                           verifyEmailValidator, validateRequest, verifyEmail);
router.post('/login',               strictAuthRateLimiter, loginTokenBucketGuard,    loginValidator,       validateRequest, login);
router.post('/google',              strictAuthRateLimiter, loginTokenBucketGuard,    googleAuthValidator,  validateRequest, googleAuth);
router.post('/resend-verification', strictAuthRateLimiter, authMiddleware, resendVerification);

// ─── Generous routes: 60 req / 15 min ─────────────────────────────────────────
// These are called automatically by the frontend; strict limits would cause
// false logouts / broken auto-refresh for users with multiple tabs open.

router.post('/refresh',  generousAuthRateLimiter, csrfGuard, refreshAccessToken);
router.post('/logout',   generousAuthRateLimiter, csrfGuard, logout);
router.get('/me',        generousAuthRateLimiter, authMiddleware, getMe);

export default router;
