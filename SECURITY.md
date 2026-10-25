# Security Policy & Cryptographic Specification

## 🛡️ Overview & Zero-Knowledge Threat Model

Document Workshops implements a **Zero-Knowledge, End-to-End Encrypted (E2EE) Vault** alongside defense-in-depth server security. The security model is built on the principle of least privilege and assumes an untrusted or compromised server environment:

1. **Untrusted Server / Compromised Database**: Even if the backend server, database, or network transport is fully compromised or subpoenaed, encrypted document contents, titles, and icons cannot be decrypted without the user's master passphrase or 256-bit recovery key.
2. **Zero Knowledge**: Passphrases, derived Key Encryption Keys (KEKs), and Data Encryption Keys (DEKs) are never transmitted to or stored on the server.
3. **Defense in Depth**: Robust authentication with refresh token family rotation, Origin guard against CSRF, continuous token bucket rate limiters, strict schema/envelope validation, and atomic revision conflict detection.

---

## 🔐 Cryptographic Specifications

### 1. Key Derivation Function (KDF)
- **Primary KDF**: Argon2id
  - Memory: 64 MB (65,536 KiB)
  - Iterations: 3 passes
  - Parallelism: 1 thread (optimized for browser WebAssembly / Web Workers)
  - Salt: 16 cryptographically secure random bytes (CSPRNG `crypto.getRandomValues`)
  - Output: 256-bit Key Encryption Key (KEK)
- **Fallback KDF**: PBKDF2-HMAC-SHA-256
  - Iterations: 600,000 iterations (OWASP recommended baseline)
  - Salt: 16 cryptographically secure random bytes
  - Output: 256-bit Key Encryption Key (KEK)

### 2. Envelope Encryption Hierarchy
- **Master Passphrase**: Chosen by the user, validated against `zxcvbn` (minimum length: 12 characters, minimum score: 3).
- **Key Encryption Key (KEK)**: 256-bit AES-GCM key derived from the passphrase via Argon2id / PBKDF2.
- **Data Encryption Key (DEK)**: Unique 256-bit AES-GCM key generated per document via CSPRNG (`crypto.getRandomValues(new Uint8Array(32))`).
- **Recovery Key**: 256-bit CSPRNG key rendered as a base64 recovery code. Wraps the root keys to permit emergency recovery without server involvement.
- **Key Wrapping**: The DEK is wrapped using the KEK via AES-GCM-256 with a unique 12-byte IV per wrap.

### 3. Symmetric Encryption Scheme
- **Algorithm**: AES-256-GCM (Galois/Counter Mode) with 128-bit authentication tag.
- **Initialization Vector (IV)**: 12 random bytes per encryption operation. Nonces are never reused.
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
| **Client Memory Safety** | DEKs and unwrap keys are **never stored in Redux** or `localStorage`. They are managed in a private, in-memory `keyCache` module that automatically clears on vault lock, logout, or session revocation. |
| **Auto-Lock Security** | The vault automatically locks after 15 minutes of user inactivity (mouse, keyboard, scroll, touch). On lock, decrypted document contents are purged from application state. |
| **Clipboard Sanitization** | Recovery keys copied to the clipboard during vault setup are automatically wiped from the OS clipboard after 60 seconds, or immediately upon closing the setup modal. |
| **Optimistic Concurrency & Integrity** | All document updates strictly require an `If-Match` header or `revision` field (returns `428 Precondition Required` if absent). Stale revisions are rejected with `409 Conflict`, preventing concurrent overwrites and replay desynchronization. |
| **Rate Limiting & Anti-Abuse** | Sensitive authentication endpoints (`/auth/login`, `/auth/register`, `/auth/google`, `/auth/verify-email`, `/auth/resend-verification`) use strict rate limiting (10 requests/15 min) and token bucket guards. Background calls (`/auth/refresh`, `/auth/logout`, `/auth/me`) use generous limits (60 requests/15 min). |
| **Refresh Token Rotation & Family Revocation** | Refresh tokens contain a unique family ID (`fam`). If an already-rotated refresh token is replayed, the entire token family is immediately revoked, terminating all sessions for that device. |
| **Origin Guard CSRF Protection** | Mutating endpoints enforce valid matching `Origin` or `Referer` headers against allowed client URLs, neutralizing Cross-Site Request Forgery. |
| **Safe Error Handling** | Error handlers never leak stack traces, database schema specifics, tokens, passphrases, or decrypted document fragments in API responses or logs. |

---

## 🧪 Security Verification

The security posture is covered by automated regression and penetration test suites:
- **Backend Security Tests (34/34 passing)**:
  - IDOR protection (cross-user read/write/delete isolation)
  - Envelope bypass prevention and plaintext rejection
  - Refresh token reuse detection & token family revocation
  - Rate limiting & token bucket verification
  - Mandatory revision enforcement (`428`) and conflict detection (`409`)
  - NoSQL injection prevention (`express-mongo-sanitize`)
  - Google OAuth audience & verified-email validation
- **Frontend Crypto Tests (35/35 passing)**:
  - Argon2id / PBKDF2 derivation round-trips
  - KEK/DEK wrapping and unwrapping
  - Passphrase change and recovery-key reset workflows
  - Large payload chunked base64 conversions (1MB to 5MB)
  - `keyCache` memory lifecycle and auto-clearing

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
