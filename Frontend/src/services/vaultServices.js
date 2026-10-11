import api from './api.js';

export const vaultServices = {
  /**
   * Fetch stored vault metadata (salt, kdfParams, wrappedMasterKey, recoveryWrappedKey)
   * Returns { isVaultEnabled: boolean, ... }
   */
  getVaultMeta: async () => {
    return api.get('/vault/meta');
  },

  /**
   * First-time vault setup.
   * Sends salt, kdfParams, wrappedMasterKey, and recoveryWrappedKey.
   */
  setupVault: async (payload) => {
    return api.post('/vault/setup', payload);
  },

  /**
   * Update vault metadata (e.g. passphrase rotation or recovery).
   * Requires login password re-authentication.
   */
  updateVaultMeta: async (payload) => {
    return api.put('/vault/meta', payload);
  },
};

export default vaultServices;
