/**
 * encryption.js – Per-field AES-256-GCM encryption / decryption
 *
 * Design decisions (per spec):
 *
 * 1. PER-FIELD IVs: title, icon, and content each receive their own independent
 *    random 96-bit IV.  Reusing an IV with the same key would break AES-GCM
 *    confidentiality (nonce reuse attack).
 *
 * 2. AAD (Additional Authenticated Data) per field:
 *      AAD = documentId + "\x00" + fieldName + "\x00" + FORMAT_VERSION
 *    This binds each ciphertext to its document and field.  Moving a title
 *    ciphertext to a different field or document will cause decryption to fail.
 *
 * 3. Wire format (per field):
 *      { v: number, iv: base64, ct: base64 }
 *    The DEK itself is stored separately as:
 *      { wrappedDek: base64, dekIv: base64 }
 *    The server stores ONLY these opaque base64 blobs plus the IVs; it cannot
 *    decrypt any field.
 *
 * 4. The DEK is generated once per document, wrapped with the Master Key, and
 *    stored in the document record.  Rotating the passphrase ONLY re-wraps the
 *    Master Key; document DEKs and ciphertext are untouched.
 */

import { generateIV, wrapKey, unwrapKey, generateDEK, exportKeyRaw, importDEKForDecrypt, toBase64, fromBase64 } from './keys.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fixed format version string embedded in AAD.  Increment on wire-format changes. */
export const FORMAT_VERSION = 'v1';

/** Supported field names */
export const FIELDS = Object.freeze({
  TITLE:   'title',
  ICON:    'icon',
  CONTENT: 'content',
});

// ── AAD construction ──────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Build the Additional Authenticated Data for a specific field.
 * AAD = documentId + NUL + fieldName + NUL + FORMAT_VERSION
 *
 * @param {string} documentId
 * @param {string} fieldName  - 'title' | 'icon' | 'content'
 * @returns {Uint8Array}
 */
export function buildAAD(documentId, fieldName) {
  return enc.encode(`${documentId}\x00${fieldName}\x00${FORMAT_VERSION}`);
}

// ── Per-field encryption ──────────────────────────────────────────────────────

/**
 * Encrypt a single field value with AES-256-GCM.
 *
 * @param {CryptoKey} dek        - Document Encryption Key (AES-256-GCM, encrypt usage)
 * @param {string}    documentId - MongoDB ObjectId string bound to this document
 * @param {string}    fieldName  - 'title' | 'icon' | 'content'
 * @param {string}    plaintext  - Field value as a JSON-serialized string
 * @returns {Promise<{ v: string, iv: string, ct: string }>}
 *          v   = FORMAT_VERSION
 *          iv  = base64-encoded 12-byte IV
 *          ct  = base64-encoded ciphertext (includes GCM auth tag)
 */
export async function encryptField(dek, documentId, fieldName, plaintext) {
  const iv  = generateIV();
  const aad = buildAAD(documentId, fieldName);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    dek,
    enc.encode(plaintext),
  );

  return {
    v:  FORMAT_VERSION,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(cipherBuf)),
  };
}

/**
 * Decrypt a single field ciphertext.
 *
 * @param {CryptoKey} dek        - Document Encryption Key
 * @param {string}    documentId
 * @param {string}    fieldName
 * @param {{ v, iv, ct }} envelope - As returned by encryptField / stored on server
 * @returns {Promise<string>} Plaintext string
 * @throws If the ciphertext was tampered with, the AAD doesn't match, or the key is wrong.
 */
export async function decryptField(dek, documentId, fieldName, envelope) {
  if (!envelope || envelope.v !== FORMAT_VERSION) {
    throw new Error(`[crypto] Unsupported ciphertext version: ${envelope?.v}`);
  }

  const iv  = fromBase64(envelope.iv);
  const ct  = fromBase64(envelope.ct);
  const aad = buildAAD(documentId, fieldName);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    dek,
    ct,
  );

  return dec.decode(plainBuf);
}

// ── Document-level helpers ────────────────────────────────────────────────────

/**
 * Encrypt a full document's sensitive fields using its DEK.
 * Each field gets an independent random IV.
 *
 * @param {CryptoKey} dek
 * @param {string}    documentId
 * @param {{ title: string, icon: string, content: object[] }} fields
 * @returns {Promise<{
 *   encTitle:   { v, iv, ct },
 *   encIcon:    { v, iv, ct },
 *   encContent: { v, iv, ct },
 * }>}
 */
export async function encryptDocument(dek, documentId, { title, icon, content }) {
  const [encTitle, encIcon, encContent] = await Promise.all([
    encryptField(dek, documentId, FIELDS.TITLE,   title),
    encryptField(dek, documentId, FIELDS.ICON,    icon),
    encryptField(dek, documentId, FIELDS.CONTENT, JSON.stringify(content)),
  ]);

  return { encTitle, encIcon, encContent };
}

/**
 * Decrypt all sensitive fields of a document.
 *
 * @param {CryptoKey} dek
 * @param {string}    documentId
 * @param {{ encTitle, encIcon, encContent }} encFields
 * @returns {Promise<{ title: string, icon: string, content: object[] }>}
 */
export async function decryptDocument(dek, documentId, { encTitle, encIcon, encContent }) {
  const [title, icon, contentStr] = await Promise.all([
    decryptField(dek, documentId, FIELDS.TITLE,   encTitle),
    decryptField(dek, documentId, FIELDS.ICON,    encIcon),
    decryptField(dek, documentId, FIELDS.CONTENT, encContent),
  ]);

  return { title, icon, content: JSON.parse(contentStr) };
}

// ── DEK lifecycle helpers ─────────────────────────────────────────────────────

/**
 * Generate a new DEK, wrap it with the Master Key, and return both the
 * in-memory DEK and the encrypted blob for storage.
 *
 * @param {CryptoKey} masterKey - Non-extractable AES-256-GCM wrapKey key
 * @returns {Promise<{
 *   dek:        CryptoKey,       // in-memory, non-extractable decrypt key
 *   wrappedDek: string,          // base64 — store on server
 *   dekIv:      string,          // base64 — store on server
 * }>}
 */
export async function generateAndWrapDEK(masterKey) {
  const dekExtractable = await generateDEK();
  const { wrapped, iv } = await wrapKey(dekExtractable, masterKey);

  // Re-export raw bytes so we can re-import non-extractable
  const rawBytes = await exportKeyRaw(dekExtractable);
  const dek      = await importDEKForDecrypt(rawBytes);

  // Best-effort: we cannot zero a Uint8Array that the GC controls, but
  // we discard the extractable CryptoKey reference immediately.
  rawBytes.fill(0);

  return {
    dek,
    wrappedDek: toBase64(wrapped),
    dekIv:      toBase64(iv),
  };
}

/**
 * Unwrap a stored DEK using the Master Key.
 *
 * @param {CryptoKey} masterKey
 * @param {string}    wrappedDek - base64 wrapped DEK bytes
 * @param {string}    dekIv      - base64 IV used when wrapping
 * @returns {Promise<CryptoKey>} Non-extractable decrypt key
 */
export async function unwrapDEK(masterKey, wrappedDek, dekIv) {
  return unwrapKey(
    fromBase64(wrappedDek),
    fromBase64(dekIv),
    masterKey,
    false,           // non-extractable
    ['encrypt', 'decrypt'],
  );
}
