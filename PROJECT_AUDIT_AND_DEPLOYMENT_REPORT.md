# Document Workshops & Security Vault: Full System Audit & Deployment Report

**Report Generated:** October 2026  
**Application Architecture:** React (Vite) + Express (Node.js) + MongoDB + Zero-Knowledge Web Crypto Vault  

---

## 1. Executive Summary

This report documents the identification, diagnosis, and resolution of critical UI/UX bugs, cryptographic validation edge cases, Content Security Policy violations, and third-party authentication warnings across the **Document Workshops** project. Additionally, it outlines the end-to-end production deployment configuration for taking the full-stack system live.

---

## 2. Defects Identified & Exact Resolutions Applied

### 2.1 Passphrase Text & Password Masking Dots Invisible
- **Symptoms:** Passphrase input fields in modal dialogs appeared blank when typing; password dots were invisible.
- **Root Cause:** In `Frontend/src/index.css`, `body` is styled with dark-mode defaults (`background-color: #090a0f`, `color: #f8fafc`). Input elements inside white modal dialogs (`bg-white`) inherited the `#f8fafc` (off-white) text color from `body`, resulting in a ~1:1 contrast ratio against the white input background.
- **Resolution:**
  1. Updated `Frontend/src/index.css` to explicitly style `input`, `textarea`, and `select` with `#111827` and `-webkit-text-fill-color: #111827`.
  2. Updated `VaultSetupModal.jsx`, `VaultUnlockModal.jsx`, and `VaultChangePassphraseModal.jsx` to include `text-neutral-900 bg-white` on all form inputs.

### 2.2 Conflicting Passphrase Strength Indicator & Disabled "Generate Keys" Button
- **Symptoms:** The UI displayed `Strength: Strong` on the left side of the meter with a ~75% blue progress bar, but simultaneously rendered `Too weak (needs score ≥ 3)` on the right. The "Generate Keys & Continue" button remained permanently disabled.
- **Root Cause:**
  - In `VaultSetupModal.jsx`, the helper text was rendered as:
    ```jsx
    <span>{score >= 3 && passphrase.length >= 12 ? 'Meets requirement' : 'Too weak (needs score ≥ 3)'}</span>
    ```
  - When the user entered a password that scored 3 in `zxcvbn` (e.g. `Pass@word12`, length 10), the left label correctly showed `Strength: Strong`. However, because `passphrase.length < 12`, the ternary expression defaulted to `'Too weak (needs score ≥ 3)'` instead of explaining that the length was insufficient.
  - The submit button was disabled due to `passphrase.length < 12`.
- **Resolution:**
  - Updated the strength status message to accurately differentiate between length and entropy:
    ```jsx
    <span>{passphrase.length < 12 ? `Needs ≥ 12 characters (${passphrase.length}/12)` : score < 3 ? 'Too weak (needs score ≥ 3)' : 'Meets requirement'}</span>
    ```
  - Users now clearly see how many characters they have typed and what is needed to enable key generation.

### 2.3 Content Security Policy (CSP) Blocking Google Fonts
- **Symptoms:** Browser console error:
  `Loading the stylesheet 'https://fonts.googleapis.com/...' violates Content Security Policy directive: "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style"`.
- **Root Cause:** In `Frontend/index.html`, the CSP `<meta>` tag allowed Google Sign-In styles (`accounts.google.com/gsi/style`), but omitted `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`.
- **Resolution:**
  - Updated `Frontend/index.html` CSP directive to include:
    - `style-src ... https://fonts.googleapis.com`
    - `font-src ... https://fonts.gstatic.com`

### 2.4 Google Sign-In Invalid Button Width Warning
- **Symptoms:** Browser console warning: `[GSI_LOGGER]: Provided button width is invalid: 100%`.
- **Root Cause:** In `Frontend/src/pages/AuthPage.jsx`, `window.google.accounts.id.renderButton` was passed `width: '100%'`. Google Identity Services only accepts integer pixel values between 200 and 400.
- **Resolution:** Changed `width: '100%'` to `width: 380`.

### 2.5 Google Identity Services FedCM Migration Warning
- **Symptoms:** Browser console warning: `[GSI_LOGGER]: Your client application uses one of the Google One Tap prompt UI status methods that may stop functioning when FedCM becomes mandatory`.
- **Root Cause:** The Google Identity Services library requires explicit opt-in to the modern Federated Credential Management (FedCM) API.
- **Resolution:** Added `use_fedcm_for_prompt: true` to `window.google.accounts.id.initialize` in both `Frontend/src/pages/AuthPage.jsx` and `Frontend/src/components/vault/GoogleConfirmButton.jsx`.

### 2.6 Vault Activation Re-Authentication Failure (Google ID Token Missing)
- **Symptoms:** In Step 2 of Vault Setup ("Confirm Your Recovery Key"), clicking **Confirm & Activate Vault** failed with `POST /api/vault/setup 400 (Bad Request)` and the error:
  `A fresh Google ID token is required to configure vault for Google-only accounts`.
- **Root Cause:** The backend controller (`vault.controller.js`) strictly enforces identity verification (`verifyUserIdentity`) for vault configuration. For Google-authenticated users, it requires a fresh `googleIdToken` (and for email/password users, the account password). `VaultSetupModal.jsx` called `confirmVaultSetup()` with no authentication payload and lacked the re-authentication UI.
- **Resolution:**
  - Integrated `useAuth` and `GoogleConfirmButton` into `VaultSetupModal.jsx`.
  - Added an identity verification step to Step 2 of the setup flow.
  - Passed `{ googleIdToken, password }` into `confirmVaultSetup(...)`.

---

## 3. Files Modified

| File Path | Description of Changes |
| :--- | :--- |
| `Frontend/src/index.css` | Added global input text color overrides (`#111827`) and placeholder styling. |
| `Frontend/index.html` | Added `https://fonts.googleapis.com` and `https://fonts.gstatic.com` to CSP `<meta>` tag. |
| `Frontend/src/pages/AuthPage.jsx` | Fixed button width (`380` px) and added `use_fedcm_for_prompt: true`. |
| `Frontend/src/components/vault/VaultSetupModal.jsx` | Added explicit input text classes, clarified length requirement message, and integrated Google/password re-authentication for vault activation. |
| `Frontend/src/components/vault/VaultUnlockModal.jsx` | Added `text-neutral-900 bg-white` to passphrase, textarea, and reset inputs. |
| `Frontend/src/components/vault/VaultChangePassphraseModal.jsx` | Added `text-neutral-900 bg-white` across all passphrase input fields. |
| `Frontend/src/components/vault/GoogleConfirmButton.jsx` | Added `use_fedcm_for_prompt: true` to Google initialization. |

---

## 4. Verification and Build Status

A full production compilation was executed:
```bash
npm --prefix Frontend run build
```
**Result:**
- Build completed successfully in 9.87s.
- Bundle output: `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`.
- Zero compilation errors.

---

## 5. End-to-End Production Deployment Guide (Going Live)

### Architecture Overview
- **Database:** MongoDB Atlas (Cloud database with IP whitelist `0.0.0.0/0`)
- **Backend Service:** Render.com Web Service (Docker / Node.js)
- **Frontend SPA:** Vercel (Edge CDN)
- **Authentication:** Google OAuth 2.0 Web Client

---

### Step 1: Database Deployment (MongoDB Atlas)
1. Sign in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Create or select your cluster (e.g. Free M0 Tier).
3. Under **Security** $\to$ **Network Access**, ensure `0.0.0.0/0` is added to allow cloud connections from Render.
4. Under **Security** $\to$ **Database Access**, create a user with read/write privileges.
5. Click **Connect** $\to$ **Drivers** $\to$ Copy the connection string:
   ```text
   mongodb+srv://<username>:<password>@cluster0.mongodb.net/document_workshops?retryWrites=true&w=majority
   ```

---

### Step 2: Backend Deployment (Render.com)
1. Push your repository to GitHub.
2. Sign in to [Render.com](https://render.com) and click **New +** $\to$ **Web Service**.
3. Connect your repository.
4. Configure service details:
   - **Name:** `document-workshops-backend`
   - **Root Directory:** `Backend/server`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Under **Environment Variables**, add:
   | Key | Value |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `MONGO_URI` | *(Your Atlas connection string)* |
   | `JWT_SECRET` | *(64-byte random hex string)* |
   | `JWT_REFRESH_SECRET` | *(64-byte random hex string)* |
   | `CLIENT_URL` | `https://your-app.vercel.app` *(update after Step 3)* |
   | `GOOGLE_CLIENT_ID` | *(From Google Cloud Console)* |
   | `GOOGLE_CLIENT_SECRET` | *(From Google Cloud Console)* |
   | `APP_REQUEST_TOKEN` | *(Shared random secret matching frontend)* |
6. Click **Deploy Web Service**. Once deployed, copy your backend URL:
   `https://document-workshops-backend.onrender.com`

---

### Step 3: Frontend Deployment (Vercel)
1. Sign in to [Vercel.com](https://vercel.com) and click **Add New** $\to$ **Project**.
2. Select your repository.
3. Configure settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `Frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Under **Environment Variables**, add:
   | Key | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://document-workshops-backend.onrender.com/api` |
   | `VITE_GOOGLE_CLIENT_ID` | `your-google-client-id.apps.googleusercontent.com` |
   | `VITE_APP_REQUEST_TOKEN` | *(Matching the value configured on backend)* |
5. Click **Deploy**.
6. Once deployed, copy your live frontend URL (e.g., `https://document-workshops.vercel.app`).
7. Return to your Render backend dashboard and update `CLIENT_URL` with this live URL.

---

### Step 4: Google OAuth Credentials Configuration
1. Open the [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Open your OAuth 2.0 Web Client ID.
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173`
   - `https://document-workshops.vercel.app` *(Your live Vercel domain)*
4. Under **Authorized redirect URIs**, add your production redirect URI (if applicable).
5. Click **Save**. Allow up to 5 minutes for Google changes to take effect.
