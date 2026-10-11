import { body } from 'express-validator';

export const validateVaultSetup = [
  body('salt').isString().notEmpty().withMessage('Salt must be a non-empty string'),
  body('kdfParams').isObject().withMessage('kdfParams must be an object'),
  body('wrappedMasterKey').isString().notEmpty().withMessage('wrappedMasterKey must be a non-empty string'),
  body('wrappedMasterKeyIv').isString().notEmpty().withMessage('wrappedMasterKeyIv must be a non-empty string'),
  body('recoveryWrappedKey').isString().notEmpty().withMessage('recoveryWrappedKey must be a non-empty string'),
  body('recoveryWrappedKeyIv').isString().notEmpty().withMessage('recoveryWrappedKeyIv must be a non-empty string'),
];

export const validateVaultUpdate = [
  body('salt').isString().notEmpty().withMessage('Salt must be a non-empty string'),
  body('kdfParams').isObject().withMessage('kdfParams must be an object'),
  body('wrappedMasterKey').isString().notEmpty().withMessage('wrappedMasterKey must be a non-empty string'),
  body('wrappedMasterKeyIv').isString().notEmpty().withMessage('wrappedMasterKeyIv must be a non-empty string'),
  body('recoveryWrappedKey').isString().notEmpty().withMessage('recoveryWrappedKey must be a non-empty string'),
  body('recoveryWrappedKeyIv').isString().notEmpty().withMessage('recoveryWrappedKeyIv must be a non-empty string'),
];
