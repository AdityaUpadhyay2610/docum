/**
 * keys.js – Key generation, wrapping, and unwrapping
 *
 * Key hierarchy:
 *
 *   Passphrase ──(Argon2id/PBKDF2)──► KEK (AES-256-GCM, in-memory only)
 *   KEK ──(AES-GCM wrap)────────────► Wrapped Master Key  (stored on server)
 *   Master Key ──(AES-GCM wrap)──────► Wrapped DEK         (stored per document)
 *   DEK ──(AES-GCM encrypt)──────────► Ciphertext          (stored per document)
 *
 * Master Key lifecycle:
 *   1. Generated as EXTRACTABLE during first-time vault setup.
 *   2. Exported as raw bytes.
 *   3. Wrapped with KEK → bytes sent to server.
 *   4. Re-imported as NON-EXTRACTABLE CryptoKey → held in memory.
 *   5. Extractable raw copy is overwritten and discarded.
 *
 * Neither the passphrase nor any plaintext key material ever leaves the browser.
 */

// ── AES-GCM parameters ────────────────────────────────────────────────────────

const AES_ALGORITHM  = 'AES-GCM';
const AES_KEY_LENGTH = 256;        // bits
const IV_LENGTH      = 12;         // bytes (96-bit IV for AES-GCM)

// ── IV generation ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 96-bit IV.
 * Must be called for EVERY encryption operation — never reuse an IV with the same key.
 * @returns {Uint8Array} 12 random bytes
 */
export function generateIV() {
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

// ── Key import from raw bytes ─────────────────────────────────────────────────

/**
 * Import raw key bytes as a CryptoKey for AES-GCM.
 *
 * @param {Uint8Array} keyBytes   - 32 raw bytes
 * @param {boolean}   extractable - true only during setup/wrap/change operations
 * @param {string[]}  usages      - ['wrapKey','unwrapKey'] or ['encrypt','decrypt']
 * @returns {Promise<CryptoKey>}
 */
export async function importRawKey(keyBytes, extractable, usages) {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    extractable,
    usages,
  );
}

// ── KEK ───────────────────────────────────────────────────────────────────────

/**
 * Import the derived KEK bytes as a non-extractable AES-GCM wrapKey/unwrapKey.
 * Used only to wrap/unwrap the Master Key; never used to encrypt documents directly.
 *
 * @param {Uint8Array} kekBytes - 32 raw bytes from deriveKEK()
 * @returns {Promise<CryptoKey>} Non-extractable KEK
 */
export async function importKEK(kekBytes) {
  return importRawKey(kekBytes, false, ['wrapKey', 'unwrapKey']);
}

// ── Master Key ────────────────────────────────────────────────────────────────

/**
 * Generate a new random Master Key.
 *
 * Returns an EXTRACTABLE key so it can be exported → wrapped → discarded.
 * The caller MUST:
 *   1. Export raw bytes.
 *   2. Wrap with the KEK.
 *   3. Re-import as non-extractable (importMasterKeyNonExtractable).
 *   4. Zero the raw bytes (best-effort with Uint8Array.fill(0)).
 *
 * @returns {Promise<CryptoKey>} Extractable AES-256-GCM Master Key
 */
export async function generateMasterKey() {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,   // extractable — required only for wrapping; discarded after
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

/**
 * Re-import raw Master Key bytes as non-extractable.
 * Call this immediately after wrapping the extractable copy.
 *
 * @param {Uint8Array} rawBytes - 32 raw bytes of the Master Key
 * @returns {Promise<CryptoKey>} Non-extractable AES-256-GCM Master Key
 */
export async function importMasterKeyNonExtractable(rawBytes) {
  return importRawKey(rawBytes, false, ['wrapKey', 'unwrapKey']);
}

// ── Wrapping / Unwrapping ─────────────────────────────────────────────────────

/**
 * Wrap a CryptoKey with AES-GCM using the provided wrapper key.
 * Returns the wrapped bytes as a Uint8Array.
 *
 * @param {CryptoKey}  keyToWrap   - The key to wrap (extractable)
 * @param {CryptoKey}  wrapperKey  - AES-GCM key used to wrap
 * @returns {Promise<{ wrapped: Uint8Array, iv: Uint8Array }>}
 */
export async function wrapKey(keyToWrap, wrapperKey) {
  const iv      = generateIV();
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    keyToWrap,
    wrapperKey,
    { name: AES_ALGORITHM, iv },
  );
  return { wrapped: new Uint8Array(wrapped), iv };
}

/**
 * Unwrap a previously wrapped key.
 *
 * @param {Uint8Array} wrappedBytes   - The wrapped key bytes
 * @param {Uint8Array} iv             - IV used during wrapping
 * @param {CryptoKey}  unwrappingKey  - AES-GCM key used to unwrap
 * @param {boolean}    extractable    - true during change-passphrase/recovery
 * @param {string[]}   usages         - Key usages for the unwrapped key
 * @param {string}     [algorithm]    - Default 'AES-GCM'
 * @returns {Promise<CryptoKey>}
 */
export async function unwrapKey(
  wrappedBytes,
  iv,
  unwrappingKey,
  extractable,
  usages,
  algorithm = AES_ALGORITHM,
) {
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedBytes,
    unwrappingKey,
    { name: AES_ALGORITHM, iv },      // algorithm used to wrap
    { name: algorithm, length: AES_KEY_LENGTH }, // algorithm of the unwrapped key
    extractable,
    usages,
  );
}

// ── Document Encryption Keys (DEKs) ──────────────────────────────────────────

/**
 * Generate a new random Document Encryption Key (DEK).
 * Extractable so it can be wrapped by the Master Key.
 *
 * @returns {Promise<CryptoKey>}
 */
export async function generateDEK() {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,   // extractable — must be wrapped before storing
    ['encrypt', 'decrypt'],
  );
}

/**
 * Import raw DEK bytes as an encrypt/decrypt key.
 *
 * @param {Uint8Array} rawBytes
 * @returns {Promise<CryptoKey>}
 */
export async function importDEKForDecrypt(rawBytes) {
  return importRawKey(rawBytes, false, ['encrypt', 'decrypt']);
}

// ── Export helpers ────────────────────────────────────────────────────────────

/**
 * Export a CryptoKey as raw bytes.
 * Only works for extractable keys.
 *
 * @param {CryptoKey} key
 * @returns {Promise<Uint8Array>}
 */
export async function exportKeyRaw(key) {
  const buf = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(buf);
}

// ── Base64 helpers ────────────────────────────────────────────────────────────

/** Uint8Array → base64 string */
export function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

/** base64 string → Uint8Array */
export function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
