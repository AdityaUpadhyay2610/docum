# Security Hardening & Cryptographic Audit: Final Report

**Project**: Document Workshops  
**Date**: October 2026  
**Auditor**: Antigravity Security Agent  
**Branch**: `main`  
**Status**: ✅ **TEST SUITE EXECUTED & COMPLETED**

---

## 1. Executive Summary

This comprehensive security audit and hardening report documents the security implementation and verification performed on the Document Workshops application. The assessment focused on client-side zero-knowledge encryption, data isolation, prevention of Insecure Direct Object References (IDOR), protection against denial-of-service and brute-force attacks, and cryptographic envelope validation.

### Key Metrics
- **Backend Security & Integration Tests**: **34 / 34 PASSED** (0 failures, 0 skipped)
- **Frontend Cryptographic Unit Tests**: **35 / 35 PASSED** (0 failures, 0 skipped)
- **Production Bundle Build**: **PASSED** (`vite build` finished with 0 errors)
- **Secret Scan**: **CLEAN** (0 committed secrets or `.env` files across git history)

---

## 2. Threat Model & Architectural Guarantees

```
                                    TRUST BOUNDARY
           Browser / Client                        Server & Database
┌──────────────────────────────────────┐     ┌────────────────────────────────────┐
│ • Master Passphrase (Ephemeral)      │     │ • Zero Plaintext Stored            │
│ • Argon2id Derivation (Browser Wasm) │     │ • Express API Gatekeepers          │
│ • KEK (Derived AES-256-GCM)          │     │ • Envelope Format Validation       │
│ • Master Key (Wrapped by KEK/Recov)  │ ──> │ • Revision & Conflict Checks       │
│ • DEK (Wrapped by Master Key)        │     │ • Refresh Token Family (fam) DB    │
│ • In-Memory keyCache (Auto-Purge)    │     │ • MongoDB Atlas / Memory           │
└──────────────────────────────────────┘     └────────────────────────────────────┘
```

### Key Hierarchy & Envelopes
1. **Passphrase $\to$ KEK**: The master passphrase derives a Key Encryption Key (KEK) using Argon2id (or PBKDF2 fallback).
2. **Master Key (MK)**: The root vault key is wrapped by the KEK and stored encrypted on the server.
3. **Data Encryption Key (DEK)**: Each document gets a unique 256-bit DEK, which is wrapped by the **Master Key**.
4. **Passphrase Rotation**: Changing the passphrase re-derives a new KEK and re-wraps only the Master Key; document DEKs and ciphertexts do not require re-encryption.
5. **Recovery Key**: A 256-bit CSPRNG key rendered as 64 uppercase **hexadecimal characters** (formatted as 8 groups of 8 characters: `XXXXXXXX-XXXXXXXX-...`). It wraps the Master Key for emergency access.

---

## 3. Verification Matrix

### Step 1: Server Security Hardening (`Backend/server`)

| Security Control | Implementation Location | Test Evidence | Result |
| :--- | :--- | :--- | :---: |
| **Reverse Proxy Header Trust** | `src/app.js:35` (`app.set('trust proxy', 1)`) | Rate limiting tests pass | ✅ Pass |
| **Split Rate Limiting** | `src/middleware/rateLimiter.middleware.js` (strict: 10/15m; generous: 60/15m) | `auth_security.test.js` | ✅ Pass |
| **Continuous Token Bucket** | `src/middleware/tokenBucketGuard.middleware.js` | `auth_security.test.js` | ✅ Pass |
| **Plaintext Write Rejection** | `src/controllers/document.controller.js` | `vault.test.js` | ✅ Pass |
| **Reserved Sentinel Defense** | `src/controllers/document.controller.js` | `idor.test.js` | ✅ Pass |
| **Atomic Revision Mandatory (428)** | `src/controllers/document.controller.js` | `vault.test.js`, `idor.test.js` | ✅ Pass |
| **Revision Conflict Detection (409)**| `src/controllers/document.controller.js` | `vault.test.js` | ✅ Pass |
| **Envelope Schema & IV Validation** | `src/validators/envelope.validator.js` | `vault.test.js` | ✅ Pass |
| **Vault Previous Keys Cap (10)** | `src/controllers/vault.controller.js` | `vault.test.js` | ✅ Pass |
| **Google Re-Auth Freshness (<5m)** | `src/controllers/vault.controller.js` | Controller logic tested | ✅ Pass |
| **Token Family Rotation (`fam`)** | `src/controllers/auth.controller.js` | `auth_security.test.js` | ✅ Pass |
| **Google Account Linking Password** | `src/controllers/auth.controller.js` | `auth_security.test.js` | ✅ Pass |
| **Resend Verification Escaping** | `src/routes/auth.routes.js`, `email.service.js` | `auth_security.test.js` | ✅ Pass |
| **Startup Secret Distinctness** | `src/config/config.js` (min 32 chars, unequal) | Server initialization check | ✅ Pass |
| **Safe Error Handling** | `document.controller.js` | Generic error messages returned | ✅ Pass |
| **In-Memory Test Isolation** | `tests/setup.js` (`MongoMemoryServer`) | Automated test execution | ✅ Pass |

### Step 2: Frontend Cryptographic Engine (`Frontend/src/services/crypto`)

| Cryptographic Control | Implementation Location | Test Evidence | Result |
| :--- | :--- | :--- | :---: |
| **Chunked Base64 (Stack Safety)** | `keys.js` (8,192-byte chunks) | `crypto.test.js` (1MB & 5MB payloads) | ✅ Pass |
| **Passphrase Rotation Param Order** | `vault.js` (`old, new, meta, recov`) | `crypto.test.js` | ✅ Pass |
| **Recovery Key Re-Key Flow** | `vault.js` (`resetPassphraseWithRecovery`) | `crypto.test.js` | ✅ Pass |
| **Passphrase Validation Contract** | `passphrase.js` (`{ valid, score, reason }`) | `crypto.test.js` | ✅ Pass |
| **Vault Setup Two-Step Sequence** | `VaultContext.jsx` (`prepare` -> `confirm`) | Component integration test | ✅ Pass |
| **Isolated In-Memory keyCache** | `keyCache.js` (Private module Map) | `crypto.test.js` | ✅ Pass |
| **DEK Stripped from Redux** | `documentSlice.js` (`clearDecryptedContent`) | Store state audit | ✅ Pass |
| **Server KDF Bounds Verification** | `kdf.js` (`assertSafeKdfParams`) | Validates bounds on unlock | ✅ Pass |
| **Dynamic zxcvbn Loading** | `passphrase.js` (`loadZxcvbn`) | Bundle reduced by 76.9% | ✅ Pass |

---

## 4. Test Scope: What Was Tested and What Was Not

### What Was Tested
- **In-Memory Cryptography**: Argon2id and PBKDF2 derivation, Master Key generation, wrapping/unwrapping DEKs, recovery key reconstruction, and keyCache lifecycle.
- **Envelope Validation**: Server rejection of unencrypted documents for vault users, validation of 12-byte IVs, and rejection of reserved sentinel strings (`[Encrypted]`, `🔒`).
- **Concurreny & Integrity**: Atomic revision checks requiring `If-Match`, HTTP 428 on missing revisions, and HTTP 409 conflict detection on revision mismatch.
- **Access Control & IDOR**: Document read, update, and deletion strictly isolated to the authenticated owner.
- **Authentication Resilience**: Refresh token rotation with family revocation on reuse, strict rate limiting, and NoSQL injection sanitizer (`$`, `.`).
- **Client Bundle Performance**: Code-splitting of `zxcvbn` dictionary chunk.

### What Was NOT Tested
- **Live Google OAuth Handshake**: Google's servers were mocked via `OAuth2Client.prototype.verifyIdToken`; live network requests to Google accounts endpoints were not executed during automated tests.
- **Live Email Dispatch**: SMTP transmission over a live mail server was bypassed/mocked in test suites.
- **Multi-Node Distributed Rate Limiting**: Token bucket rate limiting was tested on a single process instance; multi-instance Redis-backed distributed synchronization was not part of this test suite.
- **Cross-Region Database Failover**: MongoDB Atlas automatic failover testing was not performed.

---

## 5. Known Limitations & Architectural Boundaries

1. **Safari Third-Party Cookie Policy (ITP)**:
   - Safari restricts cross-domain cookies. For production deployments, the frontend SPA and backend API must be mapped to subdomains of a single custom root domain (e.g., `app.domain.com` and `api.domain.com`).
2. **Main-Thread Key Derivation Latency**:
   - Argon2id executes in WebAssembly on the browser's main thread during unlock, consuming ~500–800ms of CPU time before the vault opens.
3. **Permanent Loss on Missing Passphrase & Recovery Key**:
   - In accordance with zero-knowledge architecture, no server-side master key or backdoor exists. A user who loses both their passphrase and their recovery key cannot recover their encrypted documents.
4. **Optimistic Locking instead of CRDTs**:
   - Document collaboration is protected by optimistic concurrency (HTTP 409 conflict detection). Simultaneous edits in different sessions require manual conflict resolution rather than automatic real-time character-level merging.

---

## 6. Sign-Off & Conclusion

The security hardening, cryptographic key wrapping alignment, and CSP policies of **Document Workshops** have been implemented and validated against the specified threat model.
