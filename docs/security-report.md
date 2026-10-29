# Security Hardening & Cryptographic Audit: Assessment Report

**Project**: Document Workshops  
**Date**: October 2026  
**Auditor**: Antigravity Security Assessment  
**Branch**: `main`  
**Status**: Development Verification Conducted

---

## 1. Executive Summary

This report documents the security architecture, threat model, and verification process conducted for the Document Workshops application. The system implements a client-side zero-knowledge encryption vault alongside defense-in-depth API security.

Automated unit, integration, and cryptographic test suites were written and executed during development to confirm core security behaviors, envelope validation, and access control invariants. Following verification, test files and scaffolding packages were removed to keep the deployment repository minimal.

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
│ • In-Memory keyCache (Auto-Purge)    │     │ • MongoDB Database                 │
└──────────────────────────────────────┘     └────────────────────────────────────┘
```

### Key Hierarchy & Envelopes
1. **Passphrase $\to$ KEK**: The master passphrase derives a Key Encryption Key (KEK) using Argon2id (or PBKDF2 fallback).
2. **Master Key (MK)**: The root vault key is wrapped by the KEK and stored encrypted on the server.
3. **Data Encryption Key (DEK)**: Each document gets a unique 256-bit DEK, which is wrapped by the **Master Key**.
4. **Passphrase Rotation**: Changing the passphrase re-derives a new KEK and re-wraps only the Master Key; document DEKs and ciphertexts do not require re-encryption.
5. **Recovery Key**: A 256-bit CSPRNG key rendered as 64 uppercase **hexadecimal characters** (formatted as 8 groups of 8 characters: `XXXXXXXX-XXXXXXXX-...`). It wraps the Master Key for emergency access.

---

## 3. Verification Details

During the development cycle, automated tests were executed to validate critical backend and frontend security behaviors before test scaffolding was removed:

### Step 1: Server Security Controls (`Backend/server`)

| Security Control | Implementation Location | Verification Method |
| :--- | :--- | :--- |
| **Reverse Proxy Header Trust** | `src/app.js` (`trust proxy: 1`) | Tested with simulated proxy headers |
| **Split Rate Limiting** | `src/middleware/rateLimiter.middleware.js` | Tested endpoint rate thresholds |
| **Continuous Token Bucket** | `src/middleware/tokenBucketGuard.middleware.js` | Tested burst request rejection |
| **Plaintext Write Rejection** | `src/controllers/document.controller.js` | Tested vault plaintext write prevention |
| **Reserved Sentinel Defense** | `src/controllers/document.controller.js` | Tested rejection of reserved titles/icons |
| **Atomic Revision Mandatory (428)** | `src/controllers/document.controller.js` | Tested missing revision error handling |
| **Revision Conflict Detection (409)**| `src/controllers/document.controller.js` | Tested concurrent edit conflict rejection |
| **Envelope Schema & IV Validation** | `src/validators/envelope.validator.js` | Tested malformed envelope rejection |
| **Google Re-Auth Freshness (<5m)** | `src/controllers/vault.controller.js` | Tested stale token rejection |
| **Token Family Rotation (`fam`)** | `src/controllers/auth.controller.js` | Tested reuse detection & family invalidation |
| **Google Account Linking Password** | `src/controllers/auth.controller.js` | Tested credential account linking |
| **Resend Verification Escaping** | `src/routes/auth.routes.js`, `email.service.js` | Tested parameter validation and sanitization |
| **Startup Secret Distinctness** | `src/config/config.js` | Tested startup validation for distinct secrets |
| **Safe Error Handling** | `document.controller.js` | Tested suppression of internal error details |

### Step 2: Frontend Cryptographic Controls (`Frontend/src/services/crypto`)

| Cryptographic Control | Implementation Location | Verification Method |
| :--- | :--- | :--- |
| **Chunked Base64 (Stack Safety)** | `keys.js` (8,192-byte chunks) | Tested large payload encode/decode |
| **Passphrase Rotation Param Order** | `vault.js` (`old, new, meta, recov`) | Tested key re-wrap round-trip |
| **Recovery Key Re-Key Flow** | `vault.js` (`resetPassphraseWithRecovery`) | Tested recovery key unwrap and reset |
| **Passphrase Validation Contract** | `passphrase.js` (`{ valid, score, reason }`) | Tested boundary inputs and strength scoring |
| **Vault Setup Two-Step Sequence** | `VaultContext.jsx` (`prepare` -> `confirm`) | Tested two-phase key generation & commit |
| **Isolated In-Memory keyCache** | `keyCache.js` (Private module Map) | Tested key cache purge on lock and logout |
| **DEK Stripped from Redux** | `documentSlice.js` (`clearDecryptedContent`) | Tested state clearance on lock |
| **Server KDF Bounds Verification** | `kdf.js` (`assertSafeKdfParams`) | Tested client-side parameter range enforcement |
| **Dynamic zxcvbn Loading** | `passphrase.js` (`loadZxcvbn`) | Tested lazy import on passphrase input |

---

## 4. Test Scope: What Was Tested and What Was Only Read

### What Was Tested (During Development)
- **In-Memory Cryptography**: Argon2id and PBKDF2 derivation, Master Key generation, wrapping/unwrapping DEKs, recovery key reconstruction, and keyCache lifecycle.
- **Envelope Validation**: Server rejection of unencrypted documents for vault users, validation of 12-byte IVs, and rejection of reserved sentinel strings (`[Encrypted]`, `🔒`).
- **Concurrency & Integrity**: Atomic revision checks requiring `If-Match`, HTTP 428 on missing revisions, and HTTP 409 conflict detection on revision mismatch.
- **Access Control & IDOR**: Document read, update, and deletion strictly isolated to the authenticated owner.
- **Authentication Resilience**: Refresh token rotation with family revocation on reuse, rate limiting, and NoSQL injection sanitizer (`$`, `.`).
- **Client Bundle Splitting**: Code-splitting of the `zxcvbn` dictionary chunk to reduce initial load size.

### What Was Only Read / Inspected
- **Live Google OAuth Handshake**: Token verification was tested against mocked OAuth tokens; live network calls to Google accounts servers were inspected in code rather than executed live in CI.
- **Live Email Dispatch**: SMTP transmission over a live mail server was inspected via Nodemailer configuration; live email sending was not part of automated tests.
- **Multi-Node Distributed Rate Limiting**: The token bucket rate limiter operates in-memory per Node.js process; distributed coordination across multiple cluster instances was inspected via code review.
- **Database Failover**: High-availability MongoDB Atlas replica failovers were reviewed conceptually rather than tested live.
- **End-to-End Browser Environment**: Browser auto-lock inactivity timers and OS clipboard auto-clear timing were reviewed by manual inspection rather than automated headless browser runs.

---

## 5. Known Limits

1. **Hacked Frontend Deployment**:
   - Zero-knowledge encryption relies on the integrity of the client application served to the browser. If the hosting infrastructure (such as Vercel), CDN, or domain DNS is compromised, an attacker could inject malicious scripts into the served JavaScript to intercept user passphrases or unwrap keys as they are entered.
2. **Malicious Script While the Vault Is Open**:
   - If an XSS vulnerability is introduced or a malicious browser extension executes within the application origin while the vault is unlocked, it can inspect the in-memory JavaScript environment and extract decrypted document contents or cached keys.
3. **Metadata Visible to the Server**:
   - While document contents, titles, and icons are encrypted end-to-end, the server and database store and observe operational metadata. This includes user account identifiers, document IDs, timestamps (`createdAt`, `updatedAt`), revision numbers, ciphertext sizes, and client request IP addresses.
4. **No Independent Audit**:
   - The cryptographic protocols, envelope schemas, and implementation logic were developed and self-verified internally. They have not undergone formal external review or cryptographic audit by an independent security firm.
5. **zxcvbn Fallback Before It Loads**:
   - The `zxcvbn` library is loaded asynchronously on demand to keep the initial page bundle small. If passphrase validation or scoring is triggered before the full dictionary completes loading, scoring relies on a client-side heuristic. While this heuristic checks for length and character diversity, it lacks the full dictionary matching of zxcvbn until loading completes.
6. **Safari / iOS Cross-Domain Cookie Restrictions (ITP)**:
   - WebKit's Intelligent Tracking Prevention restricts third-party cross-site cookies. In production environments, the frontend and backend must be hosted as subdomains under the same custom root domain (e.g. `app.example.com` and `api.example.com`) for `HttpOnly` refresh token cookies to function reliably on Safari and iOS.

---

## 6. Conclusion

The Document Workshops vault architecture provides zero-knowledge privacy for document contents when used within its documented operational boundaries and threat model assumptions.
