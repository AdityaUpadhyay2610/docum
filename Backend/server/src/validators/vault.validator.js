/**
 * vault.validator.js – Express-validator rules for vault endpoints
 *
 * Validates envelope shapes and max sizes for all vault string fields.
 * All values are base64-encoded opaque blobs from the client.
 *
 * Max length rationale:
 *   salt (16 bytes raw) → base64 ~24 chars → allow up to 64 for future growth
 *   wrappedMasterKey (32 bytes + 16-byte GCM tag = 48 bytes raw) → base64 ~64 chars → allow 256
 *   IV (12 bytes raw) → base64 = 16 chars → allow 64
 *   recoveryWrappedKey same as wrappedMasterKey → 256 chars
 *   kdfParams: an object – validated as JSON-parseable object
 */

import { body } from 'express-validator';

// Base64 pattern (standard + URL-safe, with optional padding)
const BASE64_RE = /^[A-Za-z0-9+/\-_]+=*$/;

const isBase64 = (value) => {
  if (typeof value !== 'string') return false;
  return BASE64_RE.test(value);
};

export const validateVaultSetup = [
  body('salt')
    .isString().withMessage('Salt must be a string')
    .notEmpty().withMessage('Salt must be a non-empty string')
    .isLength({ max: 64 }).withMessage('Salt is too long (max 64 chars)')
    .custom(isBase64).withMessage('Salt must be a valid base64 string'),

  body('kdfParams')
    .isObject().withMessage('kdfParams must be an object'),

  body('wrappedMasterKey')
    .isString().withMessage('wrappedMasterKey must be a string')
    .notEmpty().withMessage('wrappedMasterKey must be a non-empty string')
    .isLength({ max: 256 }).withMessage('wrappedMasterKey is too long (max 256 chars)')
    .custom(isBase64).withMessage('wrappedMasterKey must be a valid base64 string'),

  body('wrappedMasterKeyIv')
    .isString().withMessage('wrappedMasterKeyIv must be a string')
    .notEmpty().withMessage('wrappedMasterKeyIv must be a non-empty string')
    .isLength({ max: 64 }).withMessage('wrappedMasterKeyIv is too long (max 64 chars)')
    .custom(isBase64).withMessage('wrappedMasterKeyIv must be a valid base64 string'),

  body('recoveryWrappedKey')
    .isString().withMessage('recoveryWrappedKey must be a string')
    .notEmpty().withMessage('recoveryWrappedKey must be a non-empty string')
    .isLength({ max: 256 }).withMessage('recoveryWrappedKey is too long (max 256 chars)')
    .custom(isBase64).withMessage('recoveryWrappedKey must be a valid base64 string'),

  body('recoveryWrappedKeyIv')
    .isString().withMessage('recoveryWrappedKeyIv must be a string')
    .notEmpty().withMessage('recoveryWrappedKeyIv must be a non-empty string')
    .isLength({ max: 64 }).withMessage('recoveryWrappedKeyIv is too long (max 64 chars)')
    .custom(isBase64).withMessage('recoveryWrappedKeyIv must be a valid base64 string'),
];

export const validateVaultUpdate = [
  body('salt')
    .isString().withMessage('Salt must be a string')
    .notEmpty().withMessage('Salt must be a non-empty string')
    .isLength({ max: 64 }).withMessage('Salt is too long (max 64 chars)')
    .custom(isBase64).withMessage('Salt must be a valid base64 string'),

  body('kdfParams')
    .isObject().withMessage('kdfParams must be an object'),

  body('wrappedMasterKey')
    .isString().withMessage('wrappedMasterKey must be a string')
    .notEmpty().withMessage('wrappedMasterKey must be a non-empty string')
    .isLength({ max: 256 }).withMessage('wrappedMasterKey is too long (max 256 chars)')
    .custom(isBase64).withMessage('wrappedMasterKey must be a valid base64 string'),

  body('wrappedMasterKeyIv')
    .isString().withMessage('wrappedMasterKeyIv must be a string')
    .notEmpty().withMessage('wrappedMasterKeyIv must be a non-empty string')
    .isLength({ max: 64 }).withMessage('wrappedMasterKeyIv is too long (max 64 chars)')
    .custom(isBase64).withMessage('wrappedMasterKeyIv must be a valid base64 string'),

  body('recoveryWrappedKey')
    .isString().withMessage('recoveryWrappedKey must be a string')
    .notEmpty().withMessage('recoveryWrappedKey must be a non-empty string')
    .isLength({ max: 256 }).withMessage('recoveryWrappedKey is too long (max 256 chars)')
    .custom(isBase64).withMessage('recoveryWrappedKey must be a valid base64 string'),

  body('recoveryWrappedKeyIv')
    .isString().withMessage('recoveryWrappedKeyIv must be a string')
    .notEmpty().withMessage('recoveryWrappedKeyIv must be a non-empty string')
    .isLength({ max: 64 }).withMessage('recoveryWrappedKeyIv is too long (max 64 chars)')
    .custom(isBase64).withMessage('recoveryWrappedKeyIv must be a valid base64 string'),

  // password is optional (only for local accounts); checked in controller
  body('password')
    .optional()
    .isString().withMessage('Password must be a string')
    .isLength({ max: 128 }).withMessage('Password too long'),

  // googleIdToken is optional (only for Google-only accounts)
  body('googleIdToken')
    .optional()
    .isString().withMessage('googleIdToken must be a string')
    .isLength({ max: 2048 }).withMessage('googleIdToken is too long'),
];
