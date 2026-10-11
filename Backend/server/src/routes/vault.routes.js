import express from 'express';
import {
  setupVault,
  getVaultMeta,
  updateVaultMeta,
} from '../controllers/vault.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  validateVaultSetup,
  validateVaultUpdate,
} from '../validators/vault.validator.js';

const router = express.Router();

// Require JWT authentication on all vault operations
router.use(authMiddleware);

router.post('/setup', validateVaultSetup, validateRequest, setupVault);
router.get('/meta', getVaultMeta);
router.put('/meta', authRateLimiter, validateVaultUpdate, validateRequest, updateVaultMeta);

export default router;
