/**
 * vault.js – Vault lifecycle operations
 *
 * This module is the single source of truth for:
 *   1. Vault setup  (first-time: generate salt + Master Key, wrap it, store server-side)
 *   2. Vault unlock (re-derive KEK from passphrase + stored salt, unwrap Master Key)
 *   3. Vault lock   (discard in-memory Master Key)
 *   4. Passphrase change (re-derive old KEK → unwrap MK → re-derive new KEK → re-wrap MK)
 *   5. Recovery key generation / recovery unlock
 *
 * SECURITY INVARIANTS
 *  • The passphrase NEVER leaves the browser.
 *  • The Master Key is held only in memory (never serialized to localStorage / IndexedDB).
 *  • The Master Key is generated as extractable only during setup/change/recovery,
 *    wrapped immediately, then re-imported as non-extractable.
 *  • The extractable raw bytes are zero-filled after wrapping.
 *  • Recovery key is 32 random bytes encoded as base32-like hex; it is shown ONCE.
 */

import { deriveKEK, generateSalt, buildKdfParamRecord } from './kdf.js';
import {
  importKEK,
  generateMasterKey,
  exportKeyRaw,
  importMasterKeyNonExtractable,
  wrapKey,
  unwrapKey,
  toBase64,
  fromBase64,
} from './keys.js';

// ── Recovery key ──────────────────────────────────────────────────────────────

/** Length in bytes of the raw recovery key */
const RECOVERY_KEY_BYTES = 32;

/**
 * Generate a new random recovery key.
 * @returns {{ rawBytes: Uint8Array, displayString: string }}
 *   rawBytes     – used for wrapping the Master Key
 *   displayString – shown to the user (uppercase hex with dashes every 8 chars)
 */
export function generateRecoveryKey() {
  const rawBytes = new Uint8Array(RECOVERY_KEY_BYTES);
  crypto.getRandomValues(rawBytes);

  // Format: 8 groups of 8 hex chars separated by dashes
  const hex = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const displayString = hex.match(/.{8}/g).join('-');
  return { rawBytes, displayString };
}

/**
 * Parse a display-format recovery key back to bytes.
 * @param {string} displayString - "XXXXXXXX-XXXXXXXX-..."
 * @returns {Uint8Array}
 */
export function parseRecoveryKey(displayString) {
  const hex = displayString.replace(/-/g, '').trim();
  if (hex.length !== RECOVERY_KEY_BYTES * 2) {
    throw new Error('Invalid recovery key length');
  }
  const bytes = new Uint8Array(RECOVERY_KEY_BYTES);
  for (let i = 0; i < RECOVERY_KEY_BYTES; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Internal: import recovery key as AES-GCM wrap key ────────────────────────

async function importRecoveryKey(rawBytes) {
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// ── Vault Setup ───────────────────────────────────────────────────────────────

/**
 * First-time vault setup.
 *
 * Steps:
 *   1. Score passphrase (caller should already have validated it).
 *   2. Generate random salt.
 *   3. Derive KEK from passphrase + salt.
 *   4. Import KEK (non-extractable wrapKey).
 *   5. Generate Master Key (EXTRACTABLE).
 *   6. Export MK raw bytes.
 *   7. Wrap MK with KEK  → { wrapped, iv }
 *   8. Wrap MK with recovery key → { wrapped, iv }
 *   9. Re-import MK as NON-EXTRACTABLE.
 *  10. Zero the raw bytes.
 *  11. Return server payload + in-memory masterKey.
 *
 * @param {string} passphrase     - Vault passphrase (validated by caller)
 * @param {string} [recoveryHex]  - Optional: displayString of pre-generated recovery key
 * @returns {Promise<VaultSetupResult>}
 */
export async function setupVault(passphrase, recoveryKeyBytes) {
  const salt = generateSalt();
  const { keyBytes: kekBytes, algorithm } = await deriveKEK(passphrase, salt);
  const kek = await importKEK(kekBytes);

  // Generate extractable Master Key
  const masterKeyExtractable = await generateMasterKey();
  const masterRawBytes = await exportKeyRaw(masterKeyExtractable);

  // Wrap with KEK
  const { wrapped: wrappedMK, iv: mkIv } = await wrapKey(masterKeyExtractable, kek);

  // Wrap with recovery key
  const recovKey = await importRecoveryKey(recoveryKeyBytes);
  const { wrapped: recovWrappedMK, iv: recovMkIv } = await wrapKey(masterKeyExtractable, recovKey);

  // Re-import as non-extractable
  const masterKey = await importMasterKeyNonExtractable(masterRawBytes);

  // Zero raw bytes (best-effort)
  masterRawBytes.fill(0);

  return {
    // Persist on server
    salt:            toBase64(salt),
    kdfParams:       buildKdfParamRecord(algorithm),
    wrappedMasterKey:    toBase64(wrappedMK),
    wrappedMasterKeyIv:  toBase64(mkIv),
    recoveryWrappedKey:  toBase64(recovWrappedMK),
    recoveryWrappedKeyIv: toBase64(recovMkIv),
    // In-memory only
    masterKey,
  };
}

// ── Vault Unlock ──────────────────────────────────────────────────────────────

/**
 * Unlock the vault: re-derive KEK and unwrap the Master Key.
 *
 * @param {string}    passphrase
 * @param {VaultMeta} vaultMeta  - Fetched from the server
 *   { salt, kdfParams, wrappedMasterKey, wrappedMasterKeyIv }
 * @returns {Promise<CryptoKey>} Non-extractable Master Key
 * @throws On wrong passphrase (decryption failure) or corrupted vault
 */
export async function unlockVault(passphrase, vaultMeta) {
  const salt = fromBase64(vaultMeta.salt);
  const { keyBytes: kekBytes } = await deriveKEK(passphrase, salt, vaultMeta.kdfParams);
  const kek = await importKEK(kekBytes);

  const wrappedBytes = fromBase64(vaultMeta.wrappedMasterKey);
  const iv           = fromBase64(vaultMeta.wrappedMasterKeyIv);

  // unwrapKey non-extractable
  const masterKey = await unwrapKey(
    wrappedBytes,
    iv,
    kek,
    false,
    ['wrapKey', 'unwrapKey'],
  );

  return masterKey;
}

// ── Vault Lock ────────────────────────────────────────────────────────────────

/**
 * Lock the vault: discard the in-memory Master Key.
 * CryptoKey objects are garbage-collected; there is no explicit zero.
 *
 * Callers must clear any decrypted document content from Redux/state.
 *
 * @param {object} vaultState - Mutable state object holding { masterKey }
 */
export function lockVault(vaultState) {
  if (vaultState) {
    vaultState.masterKey = null;
  }
}

// ── Passphrase Change ─────────────────────────────────────────────────────────

/**
 * Change the vault passphrase.
 *
 * Steps:
 *   1. Unlock with old passphrase → get extractable MK.
 *   2. Derive new KEK from new passphrase + new salt.
 *   3. Re-wrap MK with new KEK.
 *   4. Re-wrap MK with recovery key.
 *   5. Return server payload.
 *
 * Does NOT re-encrypt any document DEKs (DEKs are wrapped by MK, which is unchanged).
 *
 * @param {string}    oldPassphrase
 * @param {string}    newPassphrase
 * @param {Uint8Array} newRecoveryKeyBytes - New recovery key (caller should show to user first)
 * @param {VaultMeta} vaultMeta            - Current vault metadata from server
 * @returns {Promise<ChangePassphraseResult>}
 */
export async function changePassphrase(oldPassphrase, newPassphrase, newRecoveryKeyBytes, vaultMeta) {
  // Unlock with old passphrase — re-import as EXTRACTABLE for re-wrapping
  const salt    = fromBase64(vaultMeta.salt);
  const { keyBytes: oldKekBytes } = await deriveKEK(oldPassphrase, salt, vaultMeta.kdfParams);
  const oldKek  = await importKEK(oldKekBytes);

  const wrappedBytes = fromBase64(vaultMeta.wrappedMasterKey);
  const iv           = fromBase64(vaultMeta.wrappedMasterKeyIv);

  // Unwrap as EXTRACTABLE so we can re-wrap
  const masterKeyExtractable = await unwrapKey(
    wrappedBytes,
    iv,
    oldKek,
    true,   // extractable — needed for re-wrap
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );

  const masterRawBytes = await exportKeyRaw(masterKeyExtractable);

  // New salt + KEK
  const newSalt = generateSalt();
  const { keyBytes: newKekBytes, algorithm } = await deriveKEK(newPassphrase, newSalt);
  const newKek = await importKEK(newKekBytes);

  // Re-wrap with new KEK
  const { wrapped: newWrappedMK, iv: newMkIv } = await wrapKey(masterKeyExtractable, newKek);

  // Re-wrap with new recovery key
  const recovKey = await importRecoveryKey(newRecoveryKeyBytes);
  const { wrapped: newRecovWrappedMK, iv: newRecovMkIv } = await wrapKey(masterKeyExtractable, recovKey);

  // Re-import as non-extractable (active session)
  const masterKey = await importMasterKeyNonExtractable(masterRawBytes);
  masterRawBytes.fill(0);

  return {
    salt:                toBase64(newSalt),
    kdfParams:           buildKdfParamRecord(algorithm),
    wrappedMasterKey:    toBase64(newWrappedMK),
    wrappedMasterKeyIv:  toBase64(newMkIv),
    recoveryWrappedKey:  toBase64(newRecovWrappedMK),
    recoveryWrappedKeyIv: toBase64(newRecovMkIv),
    masterKey,  // new non-extractable in-memory copy
  };
}

// ── Recovery ──────────────────────────────────────────────────────────────────

/**
 * Unlock the vault using the recovery key.
 * Unwraps the Master Key as EXTRACTABLE so it can be re-wrapped with a new passphrase.
 *
 * @param {string|Uint8Array} recoveryKeyInput - User-entered recovery display string or raw bytes
 * @param {VaultMeta}         vaultMeta
 * @returns {Promise<CryptoKey>} Extractable Master Key
 */
export async function recoverWithKey(recoveryKeyInput, vaultMeta) {
  const recovBytes = typeof recoveryKeyInput === 'string'
    ? parseRecoveryKey(recoveryKeyInput)
    : recoveryKeyInput;
  const recovKey   = await importRecoveryKey(recovBytes);

  const wrappedBytes = fromBase64(vaultMeta.recoveryWrappedKey);
  const iv           = fromBase64(vaultMeta.recoveryWrappedKeyIv);

  const masterKey = await unwrapKey(
    wrappedBytes,
    iv,
    recovKey,
    true, // extractable
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );

  return masterKey;
}

/**
 * Complete recovery flow: reset passphrase using the recovery key.
 * 1. Unwraps master key as EXTRACTABLE using recovery key.
 * 2. Re-wraps with newly derived KEK from fresh passphrase.
 * 3. Generates a new recovery key and re-wraps with it.
 * 4. Re-imports master key as NON-EXTRACTABLE for runtime use.
 *
 * @param {string|Uint8Array} recoveryKeyBytes - Existing recovery key
 * @param {string}            newPassphrase    - Fresh passphrase
 * @param {VaultMeta}         vaultMeta        - Current vault metadata
 * @returns {Promise<{
 *   salt: string,
 *   kdfParams: object,
 *   wrappedMasterKey: string,
 *   wrappedMasterKeyIv: string,
 *   recoveryWrappedKey: string,
 *   recoveryWrappedKeyIv: string,
 *   masterKey: CryptoKey,
 *   newRecoveryKey: string,
 *   newRecoveryBytes: Uint8Array,
 * }>}
 */
export async function resetPassphraseWithRecovery(recoveryKeyBytes, newPassphrase, vaultMeta) {
  const masterKeyExtractable = await recoverWithKey(recoveryKeyBytes, vaultMeta);
  const masterRawBytes = await exportKeyRaw(masterKeyExtractable);

  // New salt + KEK
  const newSalt = generateSalt();
  const { keyBytes: newKekBytes, algorithm } = await deriveKEK(newPassphrase, newSalt);
  const newKek = await importKEK(newKekBytes);

  // Re-wrap with new KEK
  const { wrapped: newWrappedMK, iv: newMkIv } = await wrapKey(masterKeyExtractable, newKek);

  // Re-wrap with new recovery key
  const { rawBytes: newRecovBytes, displayString: newRecoveryDisplayString } = generateRecoveryKey();
  const newRecovKey = await importRecoveryKey(newRecovBytes);
  const { wrapped: newRecovWrappedMK, iv: newRecovMkIv } = await wrapKey(masterKeyExtractable, newRecovKey);

  // Re-import as non-extractable (active session)
  const masterKey = await importMasterKeyNonExtractable(masterRawBytes);
  masterRawBytes.fill(0);

  return {
    salt:                 toBase64(newSalt),
    kdfParams:            buildKdfParamRecord(algorithm),
    wrappedMasterKey:     toBase64(newWrappedMK),
    wrappedMasterKeyIv:   toBase64(newMkIv),
    recoveryWrappedKey:   toBase64(newRecovWrappedMK),
    recoveryWrappedKeyIv: toBase64(newRecovMkIv),
    masterKey,            // non-extractable in-memory copy
    newRecoveryKey:       newRecoveryDisplayString,
    newRecoveryBytes:     newRecovBytes,
  };
}
