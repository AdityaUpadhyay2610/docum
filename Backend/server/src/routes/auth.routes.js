import express from 'express';
import {
  register,
  login,
  googleAuth,
  refreshAccessToken,
  logout,
  getMe,
  verifyEmail,
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

const router = express.Router();

// Token bucket guard runs BEFORE validation so we reject flood attempts early,
// before spending CPU on bcrypt or DB lookups.

router.post('/register',     registerTokenBucketGuard, registerValidator,    validateRequest, register);
router.post('/verify-email',                           verifyEmailValidator, validateRequest, verifyEmail);
router.post('/login',        loginTokenBucketGuard,    loginValidator,       validateRequest, login);
router.post('/google',       loginTokenBucketGuard,    googleAuthValidator,  validateRequest, googleAuth);
router.post('/refresh',      csrfGuard, refreshAccessToken);
router.post('/logout',       csrfGuard, logout);
router.get('/me',            authMiddleware, getMe);

export default router;
