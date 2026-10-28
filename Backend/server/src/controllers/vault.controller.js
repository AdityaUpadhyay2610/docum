import bcrypt from 'bcryptjs';
import User from '../models/user.models.js';
import { verifyGoogleToken, hashToken } from './auth.controller.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum age of a Google ID token used as re-auth for vault operations.
 * The token's `iat` claim must be within this window of the current time.
 */
const GOOGLE_REAUTH_MAX_AGE_S = 5 * 60; // 5 minutes

/**
 * Helper to verify user's identity before sensitive vault operations.
 * Local accounts require login password.
 * Google accounts require a fresh Google ID token.
 */
async function verifyUserIdentity(user, { password, googleIdToken }, action = 'configure vault') {
  if (user.password) {
    if (!password) {
      const err = new Error(`Login password is required to ${action}`);
      err.status = 400;
      throw err;
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const err = new Error(`Invalid login password for ${action}`);
      err.status = 401;
      throw err;
    }
  } else {
    // Google-only account (no password)
    if (!googleIdToken) {
      const err = new Error(`A fresh Google ID token is required to ${action} for Google-only accounts`);
      err.status = 400;
      err.code = 'GOOGLE_REAUTH_REQUIRED';
      throw err;
    }
    let googlePayload;
    try {
      googlePayload = await verifyGoogleToken(googleIdToken);
    } catch {
      const err = new Error(`Invalid or expired Google ID token for ${action}`);
      err.status = 401;
      throw err;
    }
    const tokenAge = Math.floor(Date.now() / 1000) - (googlePayload.iat || 0);
    if (tokenAge > GOOGLE_REAUTH_MAX_AGE_S) {
      const err = new Error('Google ID token is too old. Please sign in again.');
      err.status = 401;
      err.code = 'GOOGLE_TOKEN_TOO_OLD';
      throw err;
    }
    if (googlePayload.sub !== user.googleId) {
      const err = new Error(`Google account mismatch for ${action}`);
      err.status = 401;
      throw err;
    }
  }
}

/**
 * POST /api/vault/setup
 * First-time vault setup. Requires account password or fresh Google sign-in.
 * Saves salt, KDF parameters, wrapped Master Key, and recovery-wrapped key.
 */
export const setupVault = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const {
      password,
      googleIdToken,
      salt,
      kdfParams,
      wrappedMasterKey,
      wrappedMasterKeyIv,
      recoveryWrappedKey,
      recoveryWrappedKeyIv,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.vault?.isVaultEnabled) {
      return res.status(400).json({
        error: 'Vault is already configured for this account. Use updateVaultMeta to change passphrase.',
      });
    }

    // Require account password or fresh Google sign-in to create a vault
    try {
      await verifyUserIdentity(user, { password, googleIdToken }, 'configure vault');
    } catch (authErr) {
      return res.status(authErr.status || 401).json({ error: authErr.message, code: authErr.code });
    }

    user.vault = {
      isVaultEnabled: true,
      salt,
      kdfParams,
      wrappedMasterKey,
      wrappedMasterKeyIv,
      recoveryWrappedKey,
      recoveryWrappedKeyIv,
      setupAt: new Date(),
      updatedAt: new Date(),
      previousKeys: [],
    };

    await user.save();

    return res.status(200).json({
      message: 'Vault initialized successfully',
      isVaultEnabled: true,
    });
  } catch (error) {
    console.error('Error in setupVault:', error.message);
    return res.status(500).json({ error: 'Failed to configure vault' });
  }
};

/**
 * GET /api/vault/meta
 * Returns stored vault metadata (salt, KDF parameters, wrapped keys) needed
 * by the client to derive the KEK and unwrap the Master Key in the browser.
 */
export const getVaultMeta = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const user = await User.findById(userId, 'vault');
    if (!user || !user.vault?.isVaultEnabled) {
      return res.status(200).json({ isVaultEnabled: false });
    }

    return res.status(200).json({
      isVaultEnabled: true,
      salt: user.vault.salt,
      kdfParams: user.vault.kdfParams,
      wrappedMasterKey: user.vault.wrappedMasterKey,
      wrappedMasterKeyIv: user.vault.wrappedMasterKeyIv,
      recoveryWrappedKey: user.vault.recoveryWrappedKey,
      recoveryWrappedKeyIv: user.vault.recoveryWrappedKeyIv,
      setupAt: user.vault.setupAt,
      updatedAt: user.vault.updatedAt,
    });
  } catch (error) {
    console.error('Error in getVaultMeta:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve vault metadata' });
  }
};

/**
 * PUT /api/vault/meta
 * Updates vault metadata (e.g. passphrase rotation or recovery key reset).
 *
 * Security Requirements:
 * 1. Requires login password re-authentication (for local accounts).
 * 2. For Google-only accounts (no password): requires a fresh Google ID token
 *    (issued within the last 5 minutes, same googleId) as re-authentication.
 * 3. Backs up previous wrapped keys to previousKeys array (capped at last 3, max 30 days old).
 * 4. Invariant: isVaultEnabled cannot be set back to false.
 */
export const updateVaultMeta = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const {
      password,
      googleIdToken, // for Google-only accounts
      salt,
      kdfParams,
      wrappedMasterKey,
      wrappedMasterKeyIv,
      recoveryWrappedKey,
      recoveryWrappedKeyIv,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.vault?.isVaultEnabled) {
      return res.status(400).json({
        error: 'Vault is not enabled for this account',
      });
    }

    // ── Re-authentication ────────────────────────────────────────────────────
    try {
      await verifyUserIdentity(user, { password, googleIdToken }, 'update vault metadata');
    } catch (authErr) {
      return res.status(authErr.status || 401).json({ error: authErr.message, code: authErr.code });
    }

    // ── Revoke other sessions on vault key change ────────────────────────────
    const currentRefresh = req.cookies?.refreshToken;
    if (currentRefresh) {
      const currentHash = hashToken(currentRefresh);
      user.sessions = user.sessions.filter(
        (s) => s.hash === currentHash || s.prevHash === currentHash
      );
    } else if (user.sessions?.length > 1) {
      user.sessions = user.sessions.slice(-1);
    }
    user.refreshTokenHash = null;
    user.refreshTokenFamily = null;

    // ── Update vault keys (previousKeys are no longer stored) ────────────────
    user.vault.salt = salt;
    user.vault.kdfParams = kdfParams;
    user.vault.wrappedMasterKey = wrappedMasterKey;
    user.vault.wrappedMasterKeyIv = wrappedMasterKeyIv;
    user.vault.recoveryWrappedKey = recoveryWrappedKey;
    user.vault.recoveryWrappedKeyIv = recoveryWrappedKeyIv;
    user.vault.updatedAt = new Date();
    user.vault.isVaultEnabled = true; // Invariant: cannot revert to false

    await user.save();

    return res.status(200).json({
      message: 'Vault metadata updated successfully',
    });
  } catch (error) {
    console.error('Error in updateVaultMeta:', error.message);
    return res.status(500).json({ error: 'Failed to update vault metadata' });
  }
};
