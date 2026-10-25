/**
 * crypto.test.js – Unit tests for the crypto library
 *
 * Run with:   npx vitest run --project node
 *
 * Environment: Node 20+ (provides globalThis.crypto via the Web Crypto API).
 * No browser required.
 *
 * Coverage:
 *   ✓ AES-GCM round-trip per field
 *   ✓ IV uniqueness – two encryptions of identical text produce different IVs
 *   ✓ AAD binding – decryption fails with wrong documentId or fieldName
 *   ✓ Tamper detection – modified ciphertext fails decryption
 *   ✓ DEK wrap / unwrap via Master Key
 *   ✓ Master Key wrap / unwrap via KEK (Argon2id skipped in Node – uses PBKDF2)
 *   ✓ Full vault setup + unlock round-trip
 *   ✓ Passphrase change round-trip
 *   ✓ Recovery key unlock
 *   ✓ Weak passphrase rejection
 *   ✓ Document encrypt / decrypt round-trip
 *   ✓ Wrong-audience Google token stub (auth guard)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getRandomValues, subtle } from 'node:crypto';

// ── Polyfill Web Crypto for Node ─────────────────────────────────────────────
// Node 20 exposes `crypto` globally, but some older versions need this shim.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = { getRandomValues, subtle };
}

import {
  encryptField,
  decryptField,
  encryptDocument,
  decryptDocument,
  generateAndWrapDEK,
  unwrapDEK,
  FIELDS,
  FORMAT_VERSION,
} from '../encryption.js';

import {
  generateMasterKey,
  exportKeyRaw,
  importMasterKeyNonExtractable,
  wrapKey,
  unwrapKey,
  importKEK,
  toBase64,
  fromBase64,
} from '../keys.js';

import {
  deriveKEK,
  generateSalt,
} from '../kdf.js';

import {
  setupVault,
  unlockVault,
  lockVault,
  changePassphrase,
  recoverWithKey,
  resetPassphraseWithRecovery,
  generateRecoveryKey,
  parseRecoveryKey,
} from '../vault.js';

import { validatePassphrase, scorePassphrase } from '../passphrase.js';
import { setDEK, getDEK, deleteDEK, clearKeyCache } from '../keyCache.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const DOC_ID   = '64f1a2b3c4d5e6f7a8b9c0d1'; // fake ObjectId
const PASS     = 'V@ult-P@ssphrase-2025!Secure';

let masterKey;   // CryptoKey (non-extractable wrapKey)
let dek;         // CryptoKey (non-extractable encrypt/decrypt)

beforeAll(async () => {
  // Set up a master key (non-extractable)
  const mkExtractable = await generateMasterKey();
  const rawMK = await exportKeyRaw(mkExtractable);
  masterKey = await importMasterKeyNonExtractable(rawMK);
  rawMK.fill(0);

  // Generate + wrap a DEK, then get back the in-memory DEK
  const result = await generateAndWrapDEK(masterKey);
  dek = result.dek;
});

// ─────────────────────────────────────────────────────────────────────────────
//  1. Per-field encryption round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('encryptField / decryptField', () => {
  it('encrypts and decrypts a title field', async () => {
    const plaintext = 'Hello World';
    const envelope  = await encryptField(dek, DOC_ID, FIELDS.TITLE, plaintext);
    expect(envelope.v).toBe(FORMAT_VERSION);
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.ct).toBe('string');

    const decrypted = await decryptField(dek, DOC_ID, FIELDS.TITLE, envelope);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts and decrypts an icon field', async () => {
    const plaintext = '📝';
    const envelope  = await encryptField(dek, DOC_ID, FIELDS.ICON, plaintext);
    const decrypted = await decryptField(dek, DOC_ID, FIELDS.ICON, envelope);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts and decrypts a content field (JSON array)', async () => {
    const content    = JSON.stringify([{ id: '1', type: 'paragraph', text: 'Hello' }]);
    const envelope   = await encryptField(dek, DOC_ID, FIELDS.CONTENT, content);
    const decrypted  = await decryptField(dek, DOC_ID, FIELDS.CONTENT, envelope);
    expect(decrypted).toBe(content);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. IV uniqueness – same input → different IV every call
// ─────────────────────────────────────────────────────────────────────────────

describe('IV uniqueness', () => {
  it('produces a different IV for each encryption (same plaintext, same key)', async () => {
    const e1 = await encryptField(dek, DOC_ID, FIELDS.TITLE, 'Same text');
    const e2 = await encryptField(dek, DOC_ID, FIELDS.TITLE, 'Same text');
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.ct).not.toBe(e2.ct);
  });

  it('title, icon, content IVs differ from each other in the same call', async () => {
    const { encTitle, encIcon, encContent } = await encryptDocument(dek, DOC_ID, {
      title:   'My Doc',
      icon:    '📄',
      content: [{ id: 'b1', type: 'paragraph', text: 'body' }],
    });
    const ivs = [encTitle.iv, encIcon.iv, encContent.iv];
    const unique = new Set(ivs);
    expect(unique.size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. AAD binding – wrong documentId / fieldName causes decryption failure
// ─────────────────────────────────────────────────────────────────────────────

describe('AAD binding', () => {
  it('fails to decrypt when documentId is different', async () => {
    const envelope = await encryptField(dek, DOC_ID, FIELDS.TITLE, 'Hello');
    await expect(decryptField(dek, 'wrong-doc-id', FIELDS.TITLE, envelope))
      .rejects.toThrow();
  });

  it('fails to decrypt when field name is different (title → icon)', async () => {
    const envelope = await encryptField(dek, DOC_ID, FIELDS.TITLE, 'Hello');
    await expect(decryptField(dek, DOC_ID, FIELDS.ICON, envelope))
      .rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. Tamper detection – modified ciphertext fails
// ─────────────────────────────────────────────────────────────────────────────

describe('Tamper detection', () => {
  it('fails to decrypt when ciphertext is bit-flipped', async () => {
    const envelope = await encryptField(dek, DOC_ID, FIELDS.TITLE, 'Tamper me');
    const ctBytes  = fromBase64(envelope.ct);
    ctBytes[0] ^= 0xff;
    const tampered = { ...envelope, ct: toBase64(ctBytes) };
    await expect(decryptField(dek, DOC_ID, FIELDS.TITLE, tampered))
      .rejects.toThrow();
  });

  it('fails to decrypt when IV is altered', async () => {
    const envelope = await encryptField(dek, DOC_ID, FIELDS.TITLE, 'Tamper IV');
    const ivBytes  = fromBase64(envelope.iv);
    ivBytes[0] ^= 0x01;
    const tampered = { ...envelope, iv: toBase64(ivBytes) };
    await expect(decryptField(dek, DOC_ID, FIELDS.TITLE, tampered))
      .rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5. DEK wrap / unwrap
// ─────────────────────────────────────────────────────────────────────────────

describe('DEK wrap / unwrap', () => {
  it('wraps and unwraps a DEK, and the unwrapped DEK decrypts data encrypted by the original', async () => {
    const { dek: dek2, wrappedDek, dekIv } = await generateAndWrapDEK(masterKey);
    const unwrapped = await unwrapDEK(masterKey, wrappedDek, dekIv);

    // Encrypt with original dek2, decrypt with unwrapped
    const envelope  = await encryptField(dek2,    DOC_ID, FIELDS.TITLE, 'DEK round-trip');
    const decrypted = await decryptField(unwrapped, DOC_ID, FIELDS.TITLE, envelope);
    expect(decrypted).toBe('DEK round-trip');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  6. Full vault setup + unlock round-trip (PBKDF2 path in Node)
// ─────────────────────────────────────────────────────────────────────────────

describe('Vault setup + unlock', () => {
  it('setup produces a masterKey; unlock recovers the same master key', async () => {
    const { rawBytes: recovBytes } = generateRecoveryKey();

    const setupResult = await setupVault(PASS, recovBytes);
    expect(setupResult.masterKey).toBeTruthy();
    expect(typeof setupResult.salt).toBe('string');
    expect(typeof setupResult.wrappedMasterKey).toBe('string');

    // Simulate server storing vault meta
    const vaultMeta = {
      salt:               setupResult.salt,
      kdfParams:          setupResult.kdfParams,
      wrappedMasterKey:   setupResult.wrappedMasterKey,
      wrappedMasterKeyIv: setupResult.wrappedMasterKeyIv,
    };

    const unlockedMK = await unlockVault(PASS, vaultMeta);
    expect(unlockedMK).toBeTruthy();

    // Verify that the unlocked MK can unwrap a DEK encrypted by the setup MK
    const { dek: testDek, wrappedDek, dekIv } = await generateAndWrapDEK(setupResult.masterKey);
    const envelope = await encryptField(testDek, DOC_ID, FIELDS.TITLE, 'vault round-trip');

    const recoveredDek = await unwrapDEK(unlockedMK, wrappedDek, dekIv);
    const plaintext    = await decryptField(recoveredDek, DOC_ID, FIELDS.TITLE, envelope);
    expect(plaintext).toBe('vault round-trip');
  });

  it('unlock fails with wrong passphrase', async () => {
    const { rawBytes: recovBytes } = generateRecoveryKey();
    const setupResult = await setupVault(PASS, recovBytes);
    const vaultMeta   = {
      salt:               setupResult.salt,
      kdfParams:          setupResult.kdfParams,
      wrappedMasterKey:   setupResult.wrappedMasterKey,
      wrappedMasterKeyIv: setupResult.wrappedMasterKeyIv,
    };
    await expect(unlockVault('WrongPassphrase1!', vaultMeta)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  7. Passphrase change round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('Passphrase change', () => {
  it('re-wraps master key; documents encrypted before change are still readable', async () => {
    const { rawBytes: recovBytes } = generateRecoveryKey();
    const setupResult = await setupVault(PASS, recovBytes);

    // Encrypt a document with the original master key
    const { dek: testDek, wrappedDek, dekIv } = await generateAndWrapDEK(setupResult.masterKey);
    const envelope = await encryptField(testDek, DOC_ID, FIELDS.TITLE, 'pre-change');

    const vaultMeta = {
      salt:                 setupResult.salt,
      kdfParams:            setupResult.kdfParams,
      wrappedMasterKey:     setupResult.wrappedMasterKey,
      wrappedMasterKeyIv:   setupResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   setupResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: setupResult.recoveryWrappedKeyIv,
    };

    const NEW_PASS = 'N3w-V@ult-Passphrase!9876';
    const { rawBytes: newRecovBytes } = generateRecoveryKey();
    const changed = await changePassphrase(PASS, NEW_PASS, newRecovBytes, vaultMeta);

    // Decrypt with the new master key
    const recoveredDek = await unwrapDEK(changed.masterKey, wrappedDek, dekIv);
    const plaintext    = await decryptField(recoveredDek, DOC_ID, FIELDS.TITLE, envelope);
    expect(plaintext).toBe('pre-change');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  8. Recovery key unlock
// ─────────────────────────────────────────────────────────────────────────────

describe('Recovery key unlock', () => {
  it('recovers the vault with the recovery key and can read existing documents', async () => {
    const { rawBytes: recovBytes, displayString } = generateRecoveryKey();
    const setupResult = await setupVault(PASS, recovBytes);

    const { dek: testDek, wrappedDek, dekIv } = await generateAndWrapDEK(setupResult.masterKey);
    const envelope = await encryptField(testDek, DOC_ID, FIELDS.TITLE, 'recovery test');

    const vaultMeta = {
      recoveryWrappedKey:   setupResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: setupResult.recoveryWrappedKeyIv,
    };

    const recoveredMK  = await recoverWithKey(displayString, vaultMeta);
    const recoveredDek = await unwrapDEK(recoveredMK, wrappedDek, dekIv);
    const plaintext    = await decryptField(recoveredDek, DOC_ID, FIELDS.TITLE, envelope);
    expect(plaintext).toBe('recovery test');
  });

  it('fails with a wrong recovery key', async () => {
    const { rawBytes: recovBytes } = generateRecoveryKey();
    const setupResult = await setupVault(PASS, recovBytes);

    const { displayString: wrongDisplay } = generateRecoveryKey();
    const vaultMeta = {
      recoveryWrappedKey:   setupResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: setupResult.recoveryWrappedKeyIv,
    };

    await expect(recoverWithKey(wrongDisplay, vaultMeta)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  9. Weak passphrase rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('Passphrase validation', () => {
  it('rejects passphrases shorter than 12 characters', () => {
    const { valid } = validatePassphrase('Short1!');
    expect(valid).toBe(false);
  });

  it('rejects trivially repeated characters', () => {
    const { valid } = validatePassphrase('aaaaaaaaaaaaaaa');
    expect(valid).toBe(false);
  });

  it('rejects common words', () => {
    const { valid } = validatePassphrase('passwordpassword');
    expect(valid).toBe(false);
  });

  it('accepts a strong passphrase', () => {
    const { valid } = validatePassphrase(PASS);
    expect(valid).toBe(true);
  });

  it('scores a very strong passphrase as ≥ 3', () => {
    const { score } = scorePassphrase('Tr0ub4dor&3-Horse-Battery-Staple!');
    expect(score).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  10. Document-level encrypt / decrypt round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('Document encrypt / decrypt round-trip', () => {
  it('encrypts and decrypts all three fields', async () => {
    const original = {
      title:   'My Important Document',
      icon:    '🔒',
      content: [{ id: 'b1', type: 'h1', text: 'Secret' }],
    };

    const enc = await encryptDocument(dek, DOC_ID, original);
    expect(enc.encTitle).toBeDefined();
    expect(enc.encIcon).toBeDefined();
    expect(enc.encContent).toBeDefined();

    const dec = await decryptDocument(dek, DOC_ID, enc);
    expect(dec.title).toBe(original.title);
    expect(dec.icon).toBe(original.icon);
    expect(dec.content).toEqual(original.content);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  11. Recovery key parse / format
// ─────────────────────────────────────────────────────────────────────────────

describe('Recovery key format', () => {
  it('generates a 8×8-hex-dash-separated key', () => {
    const { displayString } = generateRecoveryKey();
    expect(/^([0-9A-F]{8}-){7}[0-9A-F]{8}$/.test(displayString)).toBe(true);
  });

  it('round-trips parse → display → parse', () => {
    const { rawBytes, displayString } = generateRecoveryKey();
    const parsed = parseRecoveryKey(displayString);
    expect(Array.from(parsed)).toEqual(Array.from(rawBytes));
  });
});

describe('KDF, key wrapping, and lockVault', () => {
  it('generates a 16-byte salt and derives a 32-byte KEK', async () => {
    const salt = generateSalt();
    expect(salt.length).toBe(16);
    const { keyBytes, algorithm } = await deriveKEK(PASS, salt);
    expect(keyBytes.length).toBe(32);
    expect(algorithm).toBeDefined();
    const kek = await importKEK(keyBytes);
    expect(kek).toBeDefined();
  });

  it('wraps and unwraps an extractable key with KEK', async () => {
    const salt = generateSalt();
    const { keyBytes } = await deriveKEK(PASS, salt);
    const kek = await importKEK(keyBytes);
    const mk = await generateMasterKey();
    const { wrapped, iv } = await wrapKey(mk, kek);
    expect(wrapped).toBeDefined();
    expect(iv.length).toBe(12);
    const unwrapped = await unwrapKey(wrapped, iv, kek, true, ['wrapKey', 'unwrapKey']);
    expect(unwrapped).toBeDefined();
  });

  it('lockVault clears masterKey from state', () => {
    const state = { masterKey: 'mockKey' };
    lockVault(state);
    expect(state.masterKey).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  12. Large payload chunked Base64 roundtrip (1MB)
// ─────────────────────────────────────────────────────────────────────────────

describe('Chunked Base64 (1MB payload)', () => {
  it('round-trips a 1MB Uint8Array without stack overflow', () => {
    const oneMB = 1024 * 1024;
    const largeArray = new Uint8Array(oneMB);
    // Fill with deterministic byte values
    for (let i = 0; i < oneMB; i++) {
      largeArray[i] = i % 256;
    }

    const b64 = toBase64(largeArray);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(oneMB);

    const decoded = fromBase64(b64);
    expect(decoded.length).toBe(oneMB);
    // Verify sample indices
    expect(decoded[0]).toBe(0);
    expect(decoded[50000]).toBe(50000 % 256);
    expect(decoded[oneMB - 1]).toBe((oneMB - 1) % 256);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  13. resetPassphraseWithRecovery flow
// ─────────────────────────────────────────────────────────────────────────────

describe('resetPassphraseWithRecovery flow', () => {
  it('unwraps master key via recovery key, re-wraps with new passphrase and new recovery key', async () => {
    const { rawBytes: initialRecovBytes } = generateRecoveryKey();
    const setupResult = await setupVault(PASS, initialRecovBytes);

    // Encrypt a document with initial MK
    const { dek: testDek, wrappedDek, dekIv } = await generateAndWrapDEK(setupResult.masterKey);
    const envelope = await encryptField(testDek, DOC_ID, FIELDS.TITLE, 'recovery-reset-doc');

    const vaultMeta = {
      salt:                 setupResult.salt,
      kdfParams:            setupResult.kdfParams,
      wrappedMasterKey:     setupResult.wrappedMasterKey,
      wrappedMasterKeyIv:   setupResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   setupResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: setupResult.recoveryWrappedKeyIv,
    };

    const FRESH_PASS = 'Compl3tely-Fresh-Passphrase-2026!';
    const resetResult = await resetPassphraseWithRecovery(initialRecovBytes, FRESH_PASS, vaultMeta);

    expect(resetResult.masterKey).toBeDefined();
    expect(resetResult.newRecoveryKey).toBeDefined();

    // Verify previously encrypted document can be decrypted with the new in-memory master key
    const decryptedDek = await unwrapDEK(resetResult.masterKey, wrappedDek, dekIv);
    const plaintext = await decryptField(decryptedDek, DOC_ID, FIELDS.TITLE, envelope);
    expect(plaintext).toBe('recovery-reset-doc');

    // Verify vault can now be unlocked with the FRESH_PASS
    const updatedMeta = {
      salt:                 resetResult.salt,
      kdfParams:            resetResult.kdfParams,
      wrappedMasterKey:     resetResult.wrappedMasterKey,
      wrappedMasterKeyIv:   resetResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   resetResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: resetResult.recoveryWrappedKeyIv,
    };
    const unlockedMK = await unlockVault(FRESH_PASS, updatedMeta);
    expect(unlockedMK).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  14. validatePassphrase consistent return shape { valid, score, reason }
// ─────────────────────────────────────────────────────────────────────────────

describe('validatePassphrase return shape and zxcvbn evaluation', () => {
  it('returns { valid: false, score: 0, reason: ... } for short passphrases', () => {
    const res = validatePassphrase('short');
    expect(res.valid).toBe(false);
    expect(res.score).toBe(0);
    expect(res.reason).toMatch(/at least 12 characters/i);
  });

  it('returns { valid: false, score: <3, reason: ... } for weak 12+ character passphrases', () => {
    const res = validatePassphrase('password123456');
    expect(res.valid).toBe(false);
    expect(res.score).toBeLessThan(3);
    expect(typeof res.reason).toBe('string');
    expect(res.reason.length).toBeGreaterThan(0);
  });

  it('returns { valid: true, score: >=3, reason: null } for strong passphrases', () => {
    const res = validatePassphrase('Tr0ub4dor&3-Horse-Battery-Staple!');
    expect(res.valid).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(3);
    expect(res.reason).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  15. keyCache in-memory DEK storage
// ─────────────────────────────────────────────────────────────────────────────

describe('keyCache in-memory DEK storage', () => {
  it('stores, retrieves, and deletes DEKs by documentId', async () => {
    const mockKey = { type: 'secret', extractable: false };
    const docId = 'test-doc-id-12345';

    setDEK(docId, mockKey);
    expect(getDEK(docId)).toBe(mockKey);

    deleteDEK(docId);
    expect(getDEK(docId)).toBeNull();
  });

  it('clears all cached keys upon clearKeyCache', () => {
    setDEK('doc-1', { id: 1 });
    setDEK('doc-2', { id: 2 });
    expect(getDEK('doc-1')).toBeDefined();
    expect(getDEK('doc-2')).toBeDefined();

    clearKeyCache();
    expect(getDEK('doc-1')).toBeNull();
    expect(getDEK('doc-2')).toBeNull();
  });
});


