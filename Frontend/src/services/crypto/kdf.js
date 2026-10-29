/**
 * kdf.js – Key Derivation Functions
 *
 * Primary:  Argon2id via hash-wasm (WASM)
 * Fallback: PBKDF2-SHA-256 (≥ 600 000 iterations) if Argon2id unavailable
 *
 * Output is always a 32-byte Uint8Array (= 256 bits, enough for AES-256).
 * KDF params are versioned so we can upgrade them later without breaking
 * existing vaults.
 *
 * SECURITY NOTES
 * - The raw passphrase is never stored or transmitted.
 * - The derived KEK is used only to wrap/unwrap the Master Key; it never
 *   leaves the browser.
 * - hash-wasm requires 'wasm-unsafe-eval' in the CSP script-src.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Current KDF parameter version.  Bump when cost params change. */
export const KDF_VERSION = 1;

/**
 * Versioned KDF parameter sets.
 * Stored alongside the wrapped Master Key so we can re-derive the KEK
 * even after a future parameter upgrade.
 */
export const KDF_PARAMS = {
  1: {
    algorithm: 'argon2id',
    memoryCost: 65536,      // 64 MiB
    timeCost:   3,           // 3 iterations
    parallelism: 1,
    outputLen:  32,          // bytes
    saltLen:    16,          // bytes
  },
};

/** Fallback PBKDF2 params (used if Argon2id / WASM unavailable) */
export const PBKDF2_PARAMS = {
  algorithm:  'pbkdf2',
  hash:       'SHA-256',
  iterations: 600_000,
  outputLen:  32,
  saltLen:    16,
};

// ── Salt ──────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random salt.
 * @param {number} [len=16] - Salt length in bytes.
 * @returns {Uint8Array}
 */
export function generateSalt(len = 16) {
  const salt = new Uint8Array(len);
  crypto.getRandomValues(salt);
  return salt;
}

// ── Argon2id ─────────────────────────────────────────────────────────────────

let _argon2idAvailable = null; // null = not checked yet

/**
 * Test whether Argon2id is available (hash-wasm WASM loaded OK).
 * Result is cached after the first call.
 * @returns {Promise<boolean>}
 */
export async function isArgon2idAvailable() {
  if (_argon2idAvailable !== null) return _argon2idAvailable;
  try {
    const { argon2id } = await import('hash-wasm');
    // Quick smoke test with minimal cost
    await argon2id({
      password:    'test',
      salt:        new Uint8Array(16),
      iterations:  1,
      memorySize:  256,
      hashLength:  4,
      parallelism: 1,
      outputType:  'binary',
    });
    _argon2idAvailable = true;
  } catch {
    _argon2idAvailable = false;
  }
  return _argon2idAvailable;
}

// ── Core derivation ───────────────────────────────────────────────────────────

/**
 * Derive a 256-bit KEK from the passphrase + salt using Argon2id.
 *
 * @param {string}     passphrase
 * @param {Uint8Array} salt
 * @param {object}     [params]   - KDF params (default: KDF_PARAMS[KDF_VERSION])
 * @returns {Promise<Uint8Array>} 32-byte derived key material
 */
async function deriveWithArgon2id(passphrase, salt, params = KDF_PARAMS[KDF_VERSION]) {
  const { argon2id } = await import('hash-wasm');
  return argon2id({
    password:    passphrase,
    salt,
    iterations:  params.timeCost,
    memorySize:  params.memoryCost,
    parallelism: params.parallelism,
    hashLength:  params.outputLen,
    outputType:  'binary',
  });
}

/**
 * Derive a 256-bit KEK from the passphrase + salt using PBKDF2-SHA-256.
 *
 * @param {string}     passphrase
 * @param {Uint8Array} salt
 * @param {object}     [params]   - PBKDF2 params
 * @returns {Promise<Uint8Array>} 32-byte derived key material
 */
async function deriveWithPBKDF2(passphrase, salt, params = PBKDF2_PARAMS) {
  const enc      = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name:       'PBKDF2',
      salt,
      iterations: params.iterations,
      hash:       params.hash,
    },
    keyMaterial,
    params.outputLen * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Validate that KDF parameters received from the server satisfy cryptographic safety minimums
 * and reasonable bounds to protect against downgrade attacks and client DoS.
 */
export function assertSafeKdfParams(params) {
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid KDF parameters: expected an object');
  }

  if (params.algorithm === 'argon2id') {
    const memoryCost = Number(params.memoryCost);
    const timeCost = Number(params.timeCost);
    const parallelism = Number(params.parallelism || 1);
    const outputLen = Number(params.outputLen || 32);

    if (!Number.isInteger(memoryCost) || memoryCost < 16384 || memoryCost > 262144) {
      throw new Error(`Unsafe Argon2id memoryCost: ${params.memoryCost}`);
    }
    if (!Number.isInteger(timeCost) || timeCost < 1 || timeCost > 10) {
      throw new Error(`Unsafe Argon2id timeCost: ${params.timeCost}`);
    }
    if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 8) {
      throw new Error(`Unsafe Argon2id parallelism: ${params.parallelism}`);
    }
    if (outputLen !== 32) {
      throw new Error(`Unsafe Argon2id outputLen: ${params.outputLen} (expected 32)`);
    }
    return;
  }

  if (params.algorithm === 'pbkdf2') {
    const iterations = Number(params.iterations);
    const outputLen = Number(params.outputLen || 32);

    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) {
      throw new Error(`Unsafe PBKDF2 iterations: ${params.iterations}`);
    }
    if (params.hash && !['SHA-256', 'SHA-384', 'SHA-512'].includes(params.hash)) {
      throw new Error(`Unsafe PBKDF2 hash algorithm: ${params.hash}`);
    }
    if (outputLen !== 32) {
      throw new Error(`Unsafe PBKDF2 outputLen: ${params.outputLen} (expected 32)`);
    }
    return;
  }

  throw new Error(`Unsupported or unsafe KDF algorithm: ${params.algorithm}`);
}

/**
 * Derive the KEK (Key Encryption Key) from the vault passphrase.
 *
 * Tries Argon2id first; falls back to PBKDF2 if WASM unavailable.
 * The returned { keyBytes, algorithm } tells the caller which algorithm was used
 * so it can be stored in the vault metadata.
 *
 * @param {string}     passphrase  - The vault passphrase (never the login password)
 * @param {Uint8Array} salt        - Random per-user salt (stored in vault metadata)
 * @param {object}     [kdfParams] - Stored KDF params (for re-derivation from stored vault)
 * @returns {Promise<{ keyBytes: Uint8Array, algorithm: string }>}
 */
export async function deriveKEK(passphrase, salt, kdfParams = null) {
  if (salt.length < 16) {
    throw new Error('Unsafe salt length: must be at least 16 bytes');
  }

  if (kdfParams) {
    assertSafeKdfParams(kdfParams);

    // Re-deriving from stored params (unlock / change-passphrase)
    if (kdfParams.algorithm === 'argon2id') {
      const keyBytes = await deriveWithArgon2id(passphrase, salt, kdfParams);
      return { keyBytes, algorithm: 'argon2id' };
    }
    if (kdfParams.algorithm === 'pbkdf2') {
      const keyBytes = await deriveWithPBKDF2(passphrase, salt, kdfParams);
      return { keyBytes, algorithm: 'pbkdf2' };
    }
    throw new Error(`Unknown KDF algorithm: ${kdfParams.algorithm}`);
  }

  // First-time derivation: prefer Argon2id
  if (await isArgon2idAvailable()) {
    const params   = KDF_PARAMS[KDF_VERSION];
    const keyBytes = await deriveWithArgon2id(passphrase, salt, params);
    return { keyBytes, algorithm: 'argon2id' };
  }

  // Fallback
  console.warn('[kdf] Argon2id unavailable – falling back to PBKDF2-SHA-256 (600k iterations)');
  const keyBytes = await deriveWithPBKDF2(passphrase, salt);
  return { keyBytes, algorithm: 'pbkdf2' };
}

/**
 * Build the full KDF param record to persist alongside the vault.
 * The server stores this; the client reads it on every unlock to reproduce
 * the exact same KEK.
 *
 * @param {string} algorithm - 'argon2id' | 'pbkdf2'
 * @returns {object}
 */
export function buildKdfParamRecord(algorithm) {
  if (algorithm === 'argon2id') {
    return {
      v:          KDF_VERSION,
      algorithm:  'argon2id',
      memoryCost: KDF_PARAMS[KDF_VERSION].memoryCost,
      timeCost:   KDF_PARAMS[KDF_VERSION].timeCost,
      parallelism: KDF_PARAMS[KDF_VERSION].parallelism,
      outputLen:  KDF_PARAMS[KDF_VERSION].outputLen,
      saltLen:    KDF_PARAMS[KDF_VERSION].saltLen,
    };
  }
  return {
    v:          0,
    algorithm:  'pbkdf2',
    hash:       PBKDF2_PARAMS.hash,
    iterations: PBKDF2_PARAMS.iterations,
    outputLen:  PBKDF2_PARAMS.outputLen,
    saltLen:    PBKDF2_PARAMS.saltLen,
  };
}
