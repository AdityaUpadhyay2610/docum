# Security Policy & Cryptographic Specification

## 🛡️ Overview & Zero-Knowledge Threat Model

Document Workshops implements a **Zero-Knowledge, End-to-End Encrypted (E2EE) Vault** alongside defense-in-depth server security. The security model is built on the principle of least privilege and assumes an untrusted or compromised server environment:

1. **Untrusted Server / Compromised Database**: Even if the backend server, database, or network transport is fully compromised or subpoenaed, encrypted document contents, titles, and icons cannot be decrypted without the user's master passphrase or 256-bit recovery key.
2. **Zero Knowledge**: Passphrases, derived Key Encryption Keys (KEKs), Master Keys, and Data Encryption Keys (DEKs) are never transmitted to or stored in plaintext on the server.
3. **Defense in Depth**: Robust authentication with refresh token family rotation, Origin guard against CSRF, continuous token bucket rate limiters, strict schema/envelope validation, and atomic revision conflict detection.

---

## 🔐 Cryptographic Specifications

### 1. Key Derivation Function (KDF)
- **Primary KDF**: Argon2id
  - Memory: 64 MB (65,536 KiB)
  - Iterations: 3 passes
  - Parallelism: 1 thread (optimized for browser WebAssembly)
  - Salt: 16 cryptographically secure random bytes (CSPRNG `crypto.getRandomValues`)
  - Output: 256-bit Key Encryption Key (KEK)
- **Fallback KDF**: PBKDF2-HMAC-SHA-256
  - Iterations: 600,000 iterations (OWASP recommended baseline)
  - Salt: 16 cryptographically secure random bytes
  - Output: 256-bit Key Encryption Key (KEK)

### 2. Envelope Encryption Hierarchy
- **Master Passphrase**: Chosen by the user, validated against `zxcvbn` (minimum length: 12 characters, minimum score: 3).
- **Key Encryption Key (KEK)**: 256-bit AES-GCM key derived from the passphrase via Argon2id / PBKDF2. Used solely to wrap/unwrap the Master Key.
- **Master Key (MK)**: 256-bit AES-GCM root vault key generated on first setup. Re-imported as non-extractable in browser memory.
- **Data Encryption Key (DEK)**: Unique 256-bit AES-GCM key generated per document via CSPRNG (`crypto.getRandomValues(new Uint8Array(32))`).
- **Recovery Key**: 256-bit CSPRNG key rendered as 64 uppercase **hexadecimal characters** formatted into 8 groups of 8 characters separated by hyphens (`XXXXXXXX-XXXXXXXX-...`). Wraps the Master Key to permit emergency recovery without server involvement.
- **Key Wrapping**:
  - The **Master Key** is wrapped by the **KEK** (and separately by the **Recovery Key**).
  - Each document's **Data Encryption Key (DEK)** is wrapped by the **Master Key** via AES-GCM-256 with a unique 12-byte IV per wrap.
  - When rotating the vault passphrase, only the Master Key is re-wrapped with the new KEK; individual document DEKs and ciphertexts remain untouched.

### 3. Symmetric Encryption Scheme
- **Algorithm**: AES-256-GCM (Galois/Counter Mode) with 128-bit authentication tag.
- **Initialization Vector (IV)**: 12 random bytes per encryption operation. Nonces are never reused.
- **Additional Authenticated Data (AAD)**: Each encrypted field binds to `documentId\0fieldName\0v1` to prevent cross-field and cross-document ciphertext swapping.
- **Ciphertext Serialization**: Stored as base64-encoded envelope objects:
  ```json
  {
    "iv": "<base64 12 bytes>",
    "ct": "<base64 ciphertext + auth tag>",
    "v": 1
  }
  ```
- **Chunked Base64 Processing**: Safe base64 encoding/decoding using 8,192-byte chunks to prevent call-stack overflows on multi-megabyte payloads.

---

## 🔒 Security Invariants & Guarantees

| Invariant | Implementation & Enforcement |
|-----------|------------------------------|
| **No Plaintext Leakage** | When a user has vault enabled, the server rejects document creation or updates containing plaintext `title`, `icon`, or `content`. Attempts to send `isEncrypted: true` alongside plaintext fields are rejected with `400 Bad Request`. |
| **Sentinel Value Protection** | Plaintext documents cannot use reserved sentinel titles or icons (e.g. `[Encrypted]` or `🔒`). |
| **Client Memory Safety** | Master keys, DEKs, and unwrap keys are **never stored in Redux**, `localStorage`, or `IndexedDB`. They reside in a private, in-memory `keyCache` module that automatically clears on vault lock, logout, or session revocation. |
| **Auto-Lock Security** | The vault automatically locks after 15 minutes of user inactivity (mouse, keyboard, scroll, touch). On lock, decrypted document contents are purged from application state. |
| **Clipboard Sanitization** | Recovery keys copied to the clipboard during vault setup are automatically wiped from the OS clipboard after 60 seconds, or immediately upon closing the setup modal. |
| **Optimistic Concurrency & Integrity** | All document updates strictly require an `If-Match` header or `revision` field (returns `428 Precondition Required` if absent). Stale revisions are rejected with `409 Conflict`, preventing concurrent overwrites and replay desynchronization. |
| **Rate Limiting & Anti-Abuse** | Sensitive authentication endpoints (`/auth/login`, `/auth/register`, `/auth/google`, `/auth/verify-email`, `/auth/resend-verification`) use strict rate limiting (10 requests/15 min) and token bucket guards. Background calls (`/auth/refresh`, `/auth/logout`, `/auth/me`) use generous limits (60 requests/15 min). |
| **Refresh Token Rotation & Family Revocation** | Refresh tokens contain a unique family ID (`fam`). If an already-rotated refresh token is replayed, the entire token family is immediately revoked, terminating all sessions for that device. |
| **Origin Guard CSRF Protection** | Mutating endpoints enforce valid matching `Origin` or `Referer` headers against allowed client URLs, neutralizing Cross-Site Request Forgery. |
| **KDF Downgrade & DoS Protection** | On vault unlock, client validates server-provided KDF parameters against strict bounds (Argon2id: 16–256 MB memory, 1–10 iterations; PBKDF2: 100k–2M iterations) and rejects unsafe values. |
| **Safe Error Handling** | Error handlers never leak stack traces, database schema specifics, tokens, passphrases, or decrypted document fragments in API responses or logs. |

---

## 🧪 Security Verification & Scope of Testing

### What Was Tested
- **Backend Test Suite (34 automated tests)**:
  - IDOR protection across documents (user isolation on read, update, delete)
  - Envelope bypass prevention and plaintext rejection for vault users
  - Sentinel value rejection for unencrypted documents
  - Refresh token reuse detection & token family revocation (`fam`)
  - Continuous token bucket rate limiting and burst throttling
  - Mandatory revision enforcement (`428`) and concurrent conflict detection (`409`)
  - NoSQL injection prevention (`mongoSanitize` rejecting `$` and `.`)
  - Google OAuth token audience validation and email verification checks (with mocked OAuth2Client)
  - Server-side vault metadata persistence, previousKeys capping, and re-authentication
- **Frontend Cryptographic Test Suite (35 automated tests)**:
  - Argon2id and PBKDF2 key derivation correctness
  - Key wrapping/unwrapping round-trips for Master Keys and DEKs
  - Passphrase change and recovery-key reconstruction workflows
  - Large payload chunked base64 conversions (1MB to 5MB)
  - In-memory `keyCache` TTL expiry, explicit deletion, and event-based purging on lock/logout
  - Dynamic `zxcvbn` password strength evaluation and validation bounds
  - Safe KDF bounds checking against server downgrade attacks

### What Was NOT Tested
- Live external network calls to Google OAuth API endpoints (mocked via `OAuth2Client.prototype.verifyIdToken`).
- Live SMTP mail server transport (mocked in development/test environments).
- Multi-region database replication failover scenarios.
- Distributed rate limiting across horizontal cluster nodes (currently uses in-memory token bucket per server process).

---

## ⚠️ Known Limitations & Design Boundaries

1. **Safari / iOS Cross-Domain Cookie Restrictions (ITP)**:
   - WebKit's Intelligent Tracking Prevention blocks third-party cross-site cookies. In production, frontend (`app.domain.com`) and backend (`api.domain.com`) must be hosted on subdomains of the same root domain for `HttpOnly` refresh cookies to persist.
2. **Main-Thread KDF Computation**:
   - Argon2id derivation runs synchronously on the main thread for ~500–800ms during initial vault unlock. On low-end mobile devices, this may cause a brief UI hesitation before keys resolve.
3. **Zero-Knowledge Loss Scenario**:
   - If a user loses both their master passphrase and their 64-character hexadecimal recovery key, document contents are mathematically unrecoverable. The server stores no escrow keys or backdoor recovery mechanisms.
4. **Optimistic Concurrency (No CRDT / OT)**:
   - Document synchronization relies on atomic revision checking (`If-Match`). Concurrent edits by multiple open tabs will trigger a 409 conflict rather than real-time character-level operational transformation.

---

## 📬 Reporting a Vulnerability

If you discover a security vulnerability within Document Workshops, please report it responsibly:

1. **Email**: Send vulnerability details to `security@document-workshops.local` (or open a confidential GitHub Security Advisory).
2. **Details to Include**:
   - Step-by-step reproduction instructions or proof of concept.
   - Affected components (Backend server, Frontend client, Crypto service).
   - Potential impact of the issue.
3. **Response Commitment**:
   - Initial acknowledgement within 48 hours.
   - Remediation and patch deployment timeline within 7 days for critical vulnerabilities.
