/**
 * envelope.validator.js
 *
 * Shared envelope and DEK validation rules used by both
 * validation middleware (express-validator) and utility validators.
 *
 * Enforces:
 * - Envelope must contain ONLY { v, iv, ct } (no extra keys)
 * - v must be allowed version (1 or '1')
 * - iv must be valid base64 and decode to exactly 12 bytes
 * - ct must be valid base64 and within max length limit
 * - encDek must contain ONLY { wrappedDek, dekIv }
 * - dekIv must decode to exactly 12 bytes
 * - wrappedDek must be valid base64 and <= 256 chars
 */

export const BASE64_RE = /^[A-Za-z0-9+/\-_]+=*$/;

export const MAX_CT_TITLE_LEN = 2048;       // title ciphertext
export const MAX_CT_ICON_LEN = 512;         // icon ciphertext
export const MAX_CT_CONTENT_LEN = 5242880;  // content ciphertext (5 MB)
export const MAX_WRAPPED_DEK_LEN = 256;

export function isValidBase64(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  return BASE64_RE.test(str);
}

export function validateEnvelopeObject(envelope, fieldName, maxCtLen) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return `${fieldName} must be an object`;
  }

  const keys = Object.keys(envelope);
  const extraKeys = keys.filter((k) => !['v', 'iv', 'ct'].includes(k));
  if (extraKeys.length > 0) {
    return `${fieldName} contains disallowed keys: ${extraKeys.join(', ')}`;
  }

  const { v, iv, ct } = envelope;

  // Version check (must be 1 or '1')
  if (v === undefined || v === null || (v !== 1 && v !== '1' && v !== 'v1')) {
    return `${fieldName}.v must be 1`;
  }

  // IV check: exactly 12 raw bytes (16 base64 characters)
  if (typeof iv !== 'string' || !isValidBase64(iv)) {
    return `${fieldName}.iv must be valid base64`;
  }
  const ivBuf = Buffer.from(iv, 'base64');
  if (ivBuf.length !== 12) {
    return `${fieldName}.iv must decode to exactly 12 bytes (got ${ivBuf.length})`;
  }

  // Ciphertext check
  if (typeof ct !== 'string' || !isValidBase64(ct)) {
    return `${fieldName}.ct must be valid base64`;
  }
  if (ct.length > maxCtLen) {
    return `${fieldName}.ct exceeds max length (${maxCtLen})`;
  }

  return null;
}

export function validateEncDekObject(encDek) {
  if (!encDek || typeof encDek !== 'object' || Array.isArray(encDek)) {
    return 'encDek must be an encrypted DEK envelope object';
  }

  const keys = Object.keys(encDek);
  const extraKeys = keys.filter((k) => !['wrappedDek', 'dekIv'].includes(k));
  if (extraKeys.length > 0) {
    return `encDek contains disallowed keys: ${extraKeys.join(', ')}`;
  }

  const { wrappedDek, dekIv } = encDek;

  if (typeof wrappedDek !== 'string' || !isValidBase64(wrappedDek)) {
    return 'encDek.wrappedDek must be valid base64';
  }
  if (wrappedDek.length > MAX_WRAPPED_DEK_LEN) {
    return `encDek.wrappedDek exceeds max length (${MAX_WRAPPED_DEK_LEN})`;
  }

  if (typeof dekIv !== 'string' || !isValidBase64(dekIv)) {
    return 'encDek.dekIv must be valid base64';
  }
  const dekIvBuf = Buffer.from(dekIv, 'base64');
  if (dekIvBuf.length !== 12) {
    return `encDek.dekIv must decode to exactly 12 bytes (got ${dekIvBuf.length})`;
  }

  return null;
}
