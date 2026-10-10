import { body } from 'express-validator';

const email = body('email')
  .exists({ checkFalsy: true }).withMessage('Email is required').bail()
  .isEmail().withMessage('Please provide a valid email address').bail()
  .normalizeEmail()
  .isLength({ max: 254 }).withMessage('Email cannot exceed 254 characters');

const password = body('password')
  .exists({ checkFalsy: true }).withMessage('Password is required').bail()
  .isString().withMessage('Password must be a string').bail()
  .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters').bail()
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number');

export const registerValidator = [
  body('name')
    .exists({ checkFalsy: true }).withMessage('Name is required').bail()
    .isString().withMessage('Name must be a string').bail()
    .trim()
    .isLength({ min: 2, max: 80 }).withMessage('Name must be between 2 and 80 characters'),
  email,
  password,
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value && value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

export const loginValidator = [
  email,
  body('password').exists({ checkFalsy: true }).withMessage('Password is required'),
];

export const googleAuthValidator = [
  body('credential')
    .exists({ checkFalsy: true }).withMessage('Google credential is required').bail()
    .isString().withMessage('Google credential must be a valid token string'),
  body('password')
    .exists({ checkFalsy: true }).withMessage('Password is required for app login security').bail()
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters'),
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value && value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];