import bcrypt from 'bcryptjs';
import User from '../models/user.models.js';
import { verifyGoogleToken } from './auth.controller.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum age of a Google ID token used as re-auth for vault meta updates.
 * The token's `iat` claim must be within this window of the current time.
 */
const GOOGLE_REAUTH_MAX_AGE_S = 5 * 60; // 5 minutes

/**
 * POST /api/vault/setup
 * First-time vault setup. Saves salt, KDF parameters, wrapped Master Key,
 * and recovery-wrapped key. Server never sees raw passphrase or plaintext keys.
 */
export const setupVault = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const {
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

    if (user.password) {
      // Local account: require login password
      if (!password) {
        return res.status(400).json({
          error: 'Login password is required to update vault metadata',
        });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          error: 'Invalid login password for vault re-authentication',
        });
      }
    } else {
      // Google-only account (no password): require a fresh Google ID token
      if (!googleIdToken) {
        return res.status(400).json({
          error: 'A fresh Google ID token is required to update vault metadata for Google-only accounts',
          code: 'GOOGLE_REAUTH_REQUIRED',
        });
      }

      let googlePayload;
      try {
        googlePayload = await verifyGoogleToken(googleIdToken);
      } catch {
        return res.status(401).json({
          error: 'Invalid or expired Google ID token for vault re-authentication',
        });
      }

      // Verify the token was issued recently (within last 5 minutes)
      const tokenAge = Math.floor(Date.now() / 1000) - (googlePayload.iat || 0);
      if (tokenAge > GOOGLE_REAUTH_MAX_AGE_S) {
        return res.status(401).json({
          error: 'Google ID token is too old for vault re-authentication. Please sign in again.',
          code: 'GOOGLE_TOKEN_TOO_OLD',
        });
      }

      // Verify it belongs to the same Google account
      if (googlePayload.sub !== user.googleId) {
        return res.status(401).json({
          error: 'Google account mismatch for vault re-authentication',
        });
      }
    }

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
