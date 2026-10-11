import bcrypt from 'bcryptjs';
import User from '../models/user.models.js';

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
      hasBackup: (user.vault.previousKeys?.length || 0) > 0,
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
 * 1. Requires login password re-authentication.
 * 2. Backs up previous wrapped keys to previousKeys array.
 * 3. Invariant: isVaultEnabled cannot be set back to false.
 */
export const updateVaultMeta = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const {
      password,
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

    // Require password re-authentication if account has a password
    if (user.password) {
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
    }

    // Backup current wrapped keys before updating
    if (!user.vault.previousKeys) {
      user.vault.previousKeys = [];
    }
    user.vault.previousKeys.push({
      salt: user.vault.salt,
      kdfParams: user.vault.kdfParams,
      wrappedMasterKey: user.vault.wrappedMasterKey,
      wrappedMasterKeyIv: user.vault.wrappedMasterKeyIv,
      recoveryWrappedKey: user.vault.recoveryWrappedKey,
      recoveryWrappedKeyIv: user.vault.recoveryWrappedKeyIv,
      replacedAt: new Date(),
    });

    // Update vault keys
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
      hasBackup: true,
    });
  } catch (error) {
    console.error('Error in updateVaultMeta:', error.message);
    return res.status(500).json({ error: 'Failed to update vault metadata' });
  }
};
