/**
 * keyCache.js – In-memory cache for document DEKs (Document Encryption Keys)
 *
 * Security Invariant:
 * Non-extractable CryptoKeys must NEVER be placed in Redux state or serialized storage.
 * This module stores DEKs in a private Map with a 15-minute inactivity TTL.
 * Explicitly purged on vault lock and logout.
 */

const INACTIVITY_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Map<documentId, { key: CryptoKey, timer: any, lastAccessed: number }>
const cache = new Map();

/**
 * Store a DEK in memory for a document.
 * Sets a 15-minute inactivity TTL timer.
 *
 * @param {string} documentId
 * @param {CryptoKey} key
 */
export function setDEK(documentId, key) {
  if (!documentId || !key) return;

  // Clear existing timer if any
  if (cache.has(documentId)) {
    const existing = cache.get(documentId);
    if (existing.timer) clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    cache.delete(documentId);
  }, INACTIVITY_TTL_MS);

  cache.set(documentId, {
    key,
    timer,
    lastAccessed: Date.now(),
  });
}

/**
 * Retrieve a DEK for a document.
 * Refreshes the 15-minute inactivity TTL timer upon access.
 *
 * @param {string} documentId
 * @returns {CryptoKey | null}
 */
export function getDEK(documentId) {
  if (!documentId || !cache.has(documentId)) return null;

  const entry = cache.get(documentId);

  // Refresh timer on access
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    cache.delete(documentId);
  }, INACTIVITY_TTL_MS);
  entry.lastAccessed = Date.now();

  return entry.key;
}

/**
 * Remove a single DEK from the cache.
 *
 * @param {string} documentId
 */
export function deleteDEK(documentId) {
  if (!documentId) return;
  const entry = cache.get(documentId);
  if (entry?.timer) clearTimeout(entry.timer);
  cache.delete(documentId);
}

/**
 * Explicitly purge all keys from the cache.
 * Must be called on lock and logout.
 */
export function clearKeyCache() {
  for (const entry of cache.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  cache.clear();
}

// Automatically listen for lock/logout events in browser environments
if (typeof window !== 'undefined') {
  window.addEventListener('vault:locked', () => clearKeyCache());
  window.addEventListener('auth:session-revoked', () => clearKeyCache());
  window.addEventListener('auth:logout', () => clearKeyCache());
}
