# Document Workshops

A privacy-first, web-based document editing platform featuring client-side Zero-Knowledge End-to-End Encryption (E2EE), optimistic concurrency control, and Google Docs-style document authoring.

Document Workshops allows users to create, format, and organize rich documents either as standard documents or inside an encrypted Zero-Knowledge Vault. When vault mode is enabled, document contents, titles, and icons are encrypted directly in the user's browser using AES-256-GCM before transmission. The backend server and database never receive or store the vault passphrase, master keys, or document encryption keys in plaintext.

---

## Table of Contents

- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Authentication Architecture](#authentication-architecture)
- [Cryptographic Data Flows](#cryptographic-data-flows)
  - [Key Hierarchy](#key-hierarchy)
  - [Document Encryption and Save Flow](#document-encryption-and-save-flow)
  - [Concurrency Control and Conflict Resolution](#concurrency-control-and-conflict-resolution)
- [File Structure](#file-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Security Defenses](#security-defenses)
- [Known Limits](#known-limits)

---

## Core Features

- **Block-Based Rich Text Editor**: Paragraphs, Headings (H1, H2, H3), Callouts (Info, Warning, Success, Error, Tip), Code Blocks with syntax display, Tables, Interactive Task Lists, and Kanban Boards.
- **Zero-Knowledge Encryption Vault**: Browser-side key derivation via Argon2id WebAssembly, hierarchical AES-256-GCM key wrapping, and CSPRNG 64-character hex recovery keys.
- **Session Management**: Dual-token architecture using short-lived in-memory JWT access tokens and HttpOnly rotating refresh tokens with session family reuse detection.
- **Google OAuth 2.0 Integration**: One-click authentication with account linking, credential synchronization, and fresh re-authentication checks for sensitive vault actions.
- **Optimistic Concurrency & Auto-Save**: Real-time debounced auto-save engine with atomic revision counters (`If-Match`) and silent auto-rebase conflict resolution.
- **Document Exporting**: Client-side document export to Microsoft Word (`.docx`) and native print-to-PDF formatting.
- **Guest Mode**: Try the editor and test document features immediately in local storage without registration, with seamless one-click migration to a permanent account.

---

## System Architecture

The application is structured as a decoupled client-server architecture:

```
┌────────────────────────────────────────────────────────┐
│                   Frontend (React SPA)                 │
│  - Vite + React 19 + Tailwind CSS v4                   │
│  - Redux Toolkit (Document, Settings, UI state)        │
│  - Web Crypto API + hash-wasm (Argon2id Wasm)          │
│  - In-Memory Key Cache & Auto-Lock Lifecycle           │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS (REST API)
                           │ Bearer JWT (Access Token)
                           │ Cookie: refreshToken (HttpOnly)
                           │ Header: X-App-Request (Origin Guard)
┌──────────────────────────▼─────────────────────────────┐
│                 Backend Server (Express)               │
│  - Node.js + Express 5 (ES Modules)                    │
│  - Helmet + Strict CORS Origin Verification            │
│  - Leaky-Bucket & Express Rate Limiting                │
│  - Cryptographic Envelope Format Validators            │
│  - Session Family Tracking & Token Rotation            │
└──────────────────────────┬─────────────────────────────┘
                           │ MongoDB Driver / Mongoose
┌──────────────────────────▼─────────────────────────────┐
│                   MongoDB Database                     │
│  - Users Collection (profiles, hashed creds, vault)    │
│  - Documents Collection (envelopes, revisions, logs)   │
└────────────────────────────────────────────────────────┘
```

---

## Authentication Architecture

Document Workshops employs a secure dual-token authentication model paired with strict multi-device session management.

### Token Lifecycle & Silent Refresh

1. **Access Token**: Short-lived JSON Web Token (10 minutes) stored only in frontend memory (`localStorage` for tab persistence). Attached to API requests via `Authorization: Bearer <token>`.
2. **Refresh Token**: Long-lived JSON Web Token (7 days) stored exclusively in a secure, `HttpOnly`, `SameSite=None` (production) cookie. JavaScript cannot read or extract this cookie.
3. **Session Families (`fam`)**: Every login or refresh chain belongs to a cryptographically unique session family ID.
   - When `/api/auth/refresh` is called, the server validates the incoming token hash against the database.
   - The server replaces the existing refresh token with a new token and advances the session hash.
   - A 10-second grace window prevents race conditions from concurrent network requests from invalidating a valid session.
   - If an old or reused refresh token is presented outside the grace window, the backend treats it as an attack and revokes the **entire session family**, logging out that client immediately.
4. **Silent Refresh Interceptor**: When an API request returns HTTP 401 with `code: "TOKEN_EXPIRED"`, the client interceptor buffers concurrent requests, performs a single background `POST /api/auth/refresh`, updates the access token, and transparently replays the original requests without user interruption.

```
+-------------+         login / register          +---------------+
|  Logged Out | --------------------------------> | Authenticated |
+-------------+                                   +---------------+
       ^                                                  |
       |  auth:session-revoked                            | access token expires
       |  (family reused or expired)                      | (TOKEN_EXPIRED)
       |                                                  v
       |                                    api.js silently calls /auth/refresh
       |                                    +-- success -> save new access token
       |                                    |              replay requests
       +------------------------------------+-- failure -> clear auth state
                                                           show login modal
```

---

## Cryptographic Data Flows

### Key Hierarchy

The Zero-Knowledge Vault ensures the server never has access to unencrypted document contents or raw encryption keys.

```
Master Passphrase (Browser Memory)
       │
       ▼ Argon2id (hash-wasm, 64MB memory, 3 iterations)
Key Encryption Key [KEK] (256-bit AES-GCM)
       │
       ├──────────────────────────────────────────┐
       ▼ AES-GCM Wrap                             ▼ AES-GCM Wrap
Wrapped Master Key (Stored on Server)     Recovery Wrapped Key (Stored on Server)
       │                                          ▲
       │ (Unwrapped into memory)                  │ AES-GCM Wrap
Master Key [MK] (256-bit AES-GCM, In-Memory)      │
       │                                  Recovery Key (64-char Hex CSPRNG)
       ▼ AES-GCM Wrap
Document Data Encryption Key [DEK] (256-bit AES-GCM, unique per document)
       │
       ▼ AES-GCM Encrypt (12-byte unique IV per field)
Document Ciphertext Envelopes { encTitle, encIcon, encContent }
```

- **Passphrase $\to$ KEK**: Derived in browser WebAssembly using Argon2id with 64 MB memory cost, 3 iterations, and 4 degrees of parallelism (falls back gracefully to PBKDF2 with 600,000 SHA-256 iterations if WebAssembly is unavailable).
- **Master Key (MK)**: Generated as a 256-bit random key. It is wrapped by the KEK and uploaded to the server. Unwrapped keys are held in browser memory as non-extractable `CryptoKey` objects.
- **Document DEK**: Each encrypted document generates its own 256-bit AES-GCM key, wrapped by the user's Master Key and stored in the document document header (`encDek`).
- **Passphrase Rotation**: Changing the vault passphrase derives a new KEK and re-wraps only the Master Key. Document contents and document DEKs do not need to be re-encrypted.
- **Recovery Key Flow**: A 64-character hexadecimal CSPRNG key is generated during setup. It wraps the Master Key independently, allowing complete passphrase resets without data loss.

### Document Encryption and Save Flow

```
[ User edits document ]
         │
         ▼
[ useAutoSave debounce timer (600ms) ]
         │
         ├─────────────────────────────────────────┐
         │ Plaintext Doc                           │ Encrypted Doc (Vault)
         │                                         ▼
         │                         [ Check keyCache for Master Key ]
         │                                         │
         │                         [ Generate or fetch Document DEK ]
         │                                         │
         │                         [ Encrypt title, icon, and content ]
         │                           (AES-256-GCM, 12-byte random IV)
         │                                         │
         │                         [ Build envelope with encDek + IVs ]
         ▼                                         ▼
[ PUT /api/documents/:id with If-Match: <revision> header ]
         │
         ▼
[ Backend Express: originGuard -> authMiddleware -> envelopeValidator ]
         │
         ▼
[ Verify document ownership & check revision equality ]
         │
         ├─ Revision match ──> [ Increment revision & save to MongoDB ] -> HTTP 200
         │
         └─ Revision conflict -> HTTP 409 Conflict Response
```

### Concurrency Control and Conflict Resolution

Every document maintains a monotonically increasing `revision` number:
- All update calls (`PUT /api/documents/:id`) must include an `If-Match` header specifying the expected revision.
- If the server revision does not match the incoming `If-Match` header, the request is rejected with **HTTP 409 Conflict**.
- **Silent Auto-Rebase**: When a 409 occurs during auto-save, `useAutoSave` fetches the latest revision from the server. If the server content matches local content (e.g. concurrent tabs or redundant saves), the local revision counter silently rebases to match the server.
- **User Resolution**: If content has diverged, a non-destructive conflict banner appears giving the user the option to retry, reload the server version, or overwrite.

---

## File Structure

```
document-workshops/
├── Backend/
│   └── server/
│       ├── src/
│       │   ├── app.js                         # Express application setup, security middlewares, routes
│       │   ├── server.js                      # Server entry point and database connection bootstrapper
│       │   ├── config/
│       │   │   ├── allowedOrigins.js          # CORS whitelist configuration and domain validators
│       │   │   ├── config.js                  # Central environment variable schema and validator
│       │   │   ├── db.config.js               # Mongoose MongoDB connection pool manager
│       │   │   ├── db.indexes.js              # Database index definitions and synchronization
│       │   │   └── document.aggregation.js    # Optimized aggregation pipelines for document queries
│       │   ├── controllers/
│       │   │   ├── auth.controller.js         # Authentication, refresh token rotation, Google OAuth
│       │   │   ├── document.controller.js     # CRUD operations, envelope enforcement, revisions
│       │   │   └── vault.controller.js        # Vault setup, metadata updates, passphrase rotation
│       │   ├── middleware/
│       │   │   ├── auth.middleware.js         # Bearer JWT verification and user hydration
│       │   │   ├── mongoSanitize.middleware.js# NoSQL injection protection (removes $, . prefixes)
│       │   │   ├── originGuard.middleware.js  # Origin header validation and shared request tokens
│       │   │   ├── rateLimiter.middleware.js  # Express rate limiting for standard API endpoints
│       │   │   ├── tokenBucketGuard.middleware.js # In-memory token bucket rate limiter for auth
│       │   │   └── validate.middleware.js     # Express-validator error formatting middleware
│       │   ├── models/
│       │   │   ├── document.models.js         # Document schema (plaintext & encrypted envelopes)
│       │   │   └── user.models.js             # User schema, session families, vault metadata
│       │   ├── routes/
│       │   │   ├── auth.routes.js             # Endpoints for login, register, refresh, OAuth
│       │   │   ├── document.routes.js         # Endpoints for document lifecycle management
│       │   │   └── vault.routes.js            # Endpoints for vault setup, unlock, and recovery
│       │   ├── services/
│       │   │   └── email.service.js           # Nodemailer transport service for email verification
│       │   ├── utils/
│       │   │   ├── tokenBucket.js             # Leaky bucket token counter implementation
│       │   │   └── validation.js              # Shared regex patterns, block sanity checks
│       │   └── validators/
│       │       ├── auth.validator.js          # Input schemas for auth routes
│       │       ├── document.validator.js      # Input schemas for document creation and updates
│       │       ├── envelope.validator.js      # Base64, IV length (12-byte), and envelope checks
│       │       └── vault.validator.js         # Cryptographic parameter and salt validators
│       ├── .env.example                       # Backend environment template
│       ├── eslint.config.js                   # Backend ESLint configuration
│       └── package.json                       # Backend scripts and dependencies
│
├── Frontend/
│   ├── public/                                # Static assets (favicon, SVG icons)
│   ├── src/
│   │   ├── App.jsx                            # Root application component and React Router setup
│   │   ├── config.js                          # Central Vite client environment variable registry
│   │   ├── index.css                          # Tailwind CSS v4 styling rules
│   │   ├── main.jsx                           # React DOM root entry point
│   │   ├── components/
│   │   │   ├── auth/                          # Guest registration modal and prompts
│   │   │   ├── common/                        # ErrorBoundary, ColorPickerDropdown, UI primitives
│   │   │   ├── layout/                        # Sidebar, navigation items, workspace chrome
│   │   │   └── vault/                         # Vault unlock, setup, passphrase change, recovery UI
│   │   ├── context/
│   │   │   ├── AuthContext.jsx                # Global authentication provider and session events
│   │   │   ├── EditorSettingsContext.jsx      # Editor visual preferences (page width, margins)
│   │   │   └── VaultContext.jsx               # Vault unlock status, keyCache coordinator, setup
│   │   ├── features/
│   │   │   └── editor/
│   │   │       ├── blocks/                    # Block components (Callouts, Tables, Code, Boards)
│   │   │       ├── components/                # GoogleDocsToolbar, Outline, Ruler, Find & Replace
│   │   │       ├── hooks/                     # useAutoSave, useUndoRedo, useWordStats
│   │   │       ├── editorCanvas.jsx           # Main paginated document editing surface
│   │   │       └── slashMenu.jsx              # Slash command block insertion popover
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx                   # Login, registration, and password forms
│   │   │   ├── VerifyEmailPage.jsx            # Email verification confirmation landing page
│   │   │   └── WorkspacePage.jsx              # Core editing environment and document manager
│   │   ├── services/
│   │   │   ├── crypto/                        # Web Crypto AES-GCM, Argon2id, keyCache, recovery
│   │   │   ├── api.js                         # Fetch wrapper with silent token refresh interceptor
│   │   │   ├── authServices.js                # Auth endpoints HTTP client
│   │   │   ├── documentServices.js            # Document CRUD HTTP client with E2EE integration
│   │   │   ├── docxExport.js                  # Client-side .docx document exporter
│   │   │   ├── printService.js                # Print styling and pagination handler
│   │   │   └── vaultServices.js               # Vault metadata endpoints HTTP client
│   │   └── store/
│   │       ├── slices/                        # Redux state slices (document, editorSettings, UI)
│   │       └── index.js                       # Redux Toolkit store definition
│   ├── .env.example                           # Frontend environment template
│   ├── eslint.config.js                       # Frontend ESLint configuration
│   ├── package.json                           # Frontend dependencies and Vite scripts
│   ├── vercel.json                            # Vercel SPA routing and security header overrides
│   └── vite.config.js                         # Vite build configuration and Tailwind plugin
│
└── docs/
    └── security-report.md                     # Security architecture and cryptographic audit report
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **MongoDB**: v6.0 or higher (local installation or MongoDB Atlas cluster)
- **Git**

### Backend Setup

1. Open your terminal and navigate to the backend server directory:
   ```bash
   cd Backend/server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` configuration file from the template:
   ```bash
   cp .env.example .env
   ```
4. Configure required variables in `.env`:
   - `MONGO_URI`: Your MongoDB connection string.
   - `JWT_ACCESS_SECRET`: Random 32+ character string.
   - `JWT_REFRESH_SECRET`: Random 32+ character string (must differ from access secret).
   - `CLIENT_URL`: URL of your frontend application (e.g. `http://localhost:5173`).
   - `APP_REQUEST_TOKEN`: Shared secret token for the origin guard.
5. Start the server in development mode:
   ```bash
   npm run dev
   ```
   The backend will start at `http://localhost:3000`. Test health with `curl http://localhost:3000/api/health`.

### Frontend Setup

1. In a separate terminal, navigate to the frontend directory:
   ```bash
   cd Frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file from the template:
   ```bash
   cp .env.example .env
   ```
4. Configure your `.env`:
   - `VITE_API_URL`: Backend URL (e.g. `http://localhost:3000`).
   - `VITE_APP_REQUEST_TOKEN`: Matching secret string set in backend's `APP_REQUEST_TOKEN`.
   - `VITE_GOOGLE_CLIENT_ID`: (Optional) Google OAuth Client ID.
5. Start the Vite development server:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:5173`.

---

## Security Defenses

- **Defense in Depth**: Even outside encrypted vaults, standard documents benefit from input sanitization, block schema validation, and authorization checks preventing IDOR vulnerabilities.
- **Origin Guard**: Blocks arbitrary direct API invocations (e.g. curl/Postman against production APIs) by requiring verified browser origins and matching secret handshake headers.
- **Continuous Token Bucket**: Critical authentication routes (login, register, email resend) enforce aggressive rate limits using an in-memory leaky token bucket algorithm.
- **Memory Wipe & Auto-Lock**: Decrypted master keys in memory are automatically cleared after 15 minutes of user inactivity or immediately when the browser tab is locked or closed.
- **Cryptographic Bounds Checking**: Client-side parameter bounds prevent malicious servers from forcing weak KDF parameters (minimum 64MB Argon2 memory, minimum 600,000 PBKDF2 iterations).

---

## Known Limits

- **Hosting Layer Dependency**: Zero-knowledge guarantees assume the client bundle served to the browser is authentic. If hosting infrastructure, CDN, or DNS are compromised, an adversary could modify served JavaScript.
- **Client Runtime Integrity**: If malware, malicious extensions, or an XSS flaw exists inside the browser origin while a vault is unlocked, cached keys in memory could be inspected.
- **Server-Visible Metadata**: The server observes operational metadata, including user identifiers, revision histories, document timestamps, ciphertext sizes, and client IP addresses.
- **Cross-Domain Safari Cookies**: WebKit Intelligent Tracking Prevention (ITP) requires production deployments of the frontend and backend to share a common root apex domain (e.g. `app.domain.com` and `api.domain.com`) for `HttpOnly` refresh token cookies to persist across sessions.

---

## License

This project is licensed under the ISC License.
