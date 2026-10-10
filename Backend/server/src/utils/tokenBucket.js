/**
 * Token Bucket Rate Limiter
 *
 * A pure in-memory token bucket implementation. Unlike fixed-window counters
 * (express-rate-limit), token buckets:
 *
 *  1. Refill tokens CONTINUOUSLY over time — an attacker cannot burst exactly
 *     at the window boundary to bypass a fixed-window check.
 *  2. Allow short legitimate bursts while still enforcing a strict average rate.
 *  3. Track state per-key (IP, email, or composite) so different attack vectors
 *     are caught independently.
 *
 * Algorithm:
 *  - Each key gets a bucket with `capacity` tokens.
 *  - Tokens refill at `refillRate` tokens per second (fractional, continuous).
 *  - Each request consumes `tokensPerRequest` tokens.
 *  - If the bucket is empty, the request is rejected with 429.
 *  - A periodic GC sweep removes idle entries to avoid unbounded memory growth.
 *
 * @module TokenBucket
 */

// ── Bucket store ───────────────────────────────────────────────────────────────
// Map<key, { tokens: number, lastRefill: number (ms timestamp) }>
const store = new Map();

// ── GC: remove entries that have been idle for > 30 minutes ───────────────────
const GC_INTERVAL_MS = 5 * 60 * 1000;       // run GC every 5 minutes
const GC_MAX_IDLE_MS = 30 * 60 * 1000;       // evict buckets idle for 30 min

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (now - bucket.lastRefill > GC_MAX_IDLE_MS) {
      store.delete(key);
    }
  }
}, GC_INTERVAL_MS).unref(); // .unref() so GC timer never blocks process exit

// ── Core consume function ──────────────────────────────────────────────────────
/**
 * Attempt to consume tokens from a named bucket.
 *
 * @param {string}  key             - Unique key for this bucket (e.g. `ip:1.2.3.4`)
 * @param {object}  opts
 * @param {number}  opts.capacity        - Max tokens the bucket can hold
 * @param {number}  opts.refillRate      - Tokens added per second (continuous)
 * @param {number}  [opts.tokensPerReq]  - Tokens consumed per request (default: 1)
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function consumeToken(key, { capacity, refillRate, tokensPerReq = 1 }) {
  const now = Date.now();

  let bucket = store.get(key);
  if (!bucket) {
    // First request for this key – start with a full bucket
    bucket = { tokens: capacity, lastRefill: now };
    store.set(key, bucket);
  }

  // Refill based on elapsed time
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= tokensPerReq) {
    bucket.tokens -= tokensPerReq;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
  }

  // Not enough tokens – calculate when refill will provide enough
  const deficit = tokensPerReq - bucket.tokens;
  const retryAfterMs = Math.ceil((deficit / refillRate) * 1000);
  return { allowed: false, remaining: 0, retryAfterMs };
}

/**
 * Manually drain tokens from a bucket (e.g. on failed login to apply extra penalty).
 * Safe to call even if the bucket doesn't exist yet.
 *
 * @param {string} key
 * @param {number} tokens - How many tokens to drain
 * @param {number} capacity - Needed to cap the bucket on creation
 */
export function drainTokens(key, tokens, capacity) {
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
    store.set(key, bucket);
  }
  bucket.tokens = Math.max(0, bucket.tokens - tokens);
}

/**
 * Peek at the current token count without consuming.
 * Returns 0 if the key doesn't exist.
 */
export function peekTokens(key) {
  const bucket = store.get(key);
  return bucket ? Math.floor(bucket.tokens) : 0;
}

/**
 * Completely reset a bucket (e.g. on successful login to clear failed-attempt state).
 */
export function resetBucket(key) {
  store.delete(key);
}
