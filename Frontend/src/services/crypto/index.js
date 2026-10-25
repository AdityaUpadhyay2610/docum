/**
 * crypto/index.js – Public re-exports
 *
 * Import from here in application code.  Internal modules can import
 * from each other directly to avoid circular dependencies.
 */

export {
  // KDF
  deriveKEK,
  generateSalt,
  buildKdfParamRecord,
  isArgon2idAvailable,
  KDF_VERSION,
  KDF_PARAMS,
} from './kdf.js';

export {
  // Key generation / import
  generateMasterKey,
  importKEK,
  importMasterKeyNonExtractable,
  importDEKForDecrypt,
  generateDEK,
  generateIV,
  wrapKey,
  unwrapKey,
  exportKeyRaw,
  toBase64,
  fromBase64,
} from './keys.js';

export {
  // Encryption / decryption
  encryptField,
  decryptField,
  encryptDocument,
  decryptDocument,
  generateAndWrapDEK,
  unwrapDEK,
  buildAAD,
  FORMAT_VERSION,
  FIELDS,
} from './encryption.js';

export {
  // Vault lifecycle
  setupVault,
  unlockVault,
  lockVault,
  changePassphrase,
  recoverWithKey,
  resetPassphraseWithRecovery,
  generateRecoveryKey,
  parseRecoveryKey,
} from './vault.js';

export {
  // Passphrase strength
  scorePassphrase,
  validatePassphrase,
  strengthBarProps,
} from './passphrase.js';

export {
  // Key Cache (in-memory, TTL, lock-purged)
  setDEK,
  getDEK,
  deleteDEK,
  clearKeyCache,
} from './keyCache.js';

