/**
 * VaultContext.jsx – Zero-Knowledge End-to-End Encryption Vault State
 *
 * Security Invariants:
 *  1. The vault passphrase NEVER leaves the browser.
 *  2. The Master Key is held in React memory only – NEVER saved to localStorage,
 *     sessionStorage, IndexedDB, or sent over the network.
 *  3. Auto-locks after 15 minutes of inactivity.
 *  4. Locks immediately upon user logout or session revocation.
 *  5. Clears decrypted document content from store upon lock.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import vaultServices from '../services/vaultServices.js';
import {
  setupVault as cryptoSetupVault,
  unlockVault as cryptoUnlockVault,
  changePassphrase as cryptoChangePassphrase,
  recoverWithKey as cryptoRecoverWithKey,
  resetPassphraseWithRecovery as cryptoResetPassphraseWithRecovery,
  generateRecoveryKey,
  validatePassphrase,
  scorePassphrase,
  clearKeyCache,
} from '../services/crypto/index.js';
import { useAuth } from './AuthContext.jsx';
import { useDispatch } from 'react-redux';
import { clearDecryptedContent } from '../store/slices/documentSlice.js';

const VaultContext = createContext(null);

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function VaultProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const dispatch = useDispatch();

  // In-memory Master Key (AES-256-GCM, non-extractable)
  const [masterKey, setMasterKey] = useState(null);
  const [isVaultEnabled, setIsVaultEnabled] = useState(false);
  const [isCheckingVault, setIsCheckingVault] = useState(false);
  const [vaultMeta, setVaultMeta] = useState(null);

  // Modals state
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [lastRecoveryKey, setLastRecoveryKey] = useState(null);

  const inactivityTimerRef = useRef(null);
  const pendingVaultSetupRef = useRef(null);

  const isUnlocked = Boolean(masterKey);

  // ── Lock Vault ─────────────────────────────────────────────────────────────
  const lockVault = useCallback(() => {
    setMasterKey(null);
    clearKeyCache();
    pendingVaultSetupRef.current = null;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    dispatch(clearDecryptedContent());
    // Notify application and keyCache that vault has locked (runs once)
    window.dispatchEvent(new CustomEvent('vault:locked'));
  }, [dispatch]);

  // ── Auto-lock on inactivity ────────────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (masterKey) {
      inactivityTimerRef.current = setTimeout(() => {
        lockVault();
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [masterKey, lockVault]);

  useEffect(() => {
    if (!masterKey) return undefined;

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [masterKey, resetInactivityTimer]);

  // ── Check Vault Status ─────────────────────────────────────────────────────
  const checkVaultStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setIsVaultEnabled(false);
      setVaultMeta(null);
      lockVault();
      return null;
    }

    setIsCheckingVault(true);
    try {
      const meta = await vaultServices.getVaultMeta();
      if (meta?.isVaultEnabled) {
        setIsVaultEnabled(true);
        setVaultMeta(meta);
      } else {
        setIsVaultEnabled(false);
        setVaultMeta(null);
      }
      return meta;
    } catch (err) {
      console.error('Failed to check vault status:', err.message);
      return null;
    } finally {
      setIsCheckingVault(false);
    }
  }, [isAuthenticated, lockVault]);

  // Check vault status whenever user authentication status changes
  useEffect(() => {
    let isCancelled = false;
    if (isAuthenticated) {
      vaultServices.getVaultMeta()
        .then((meta) => {
          if (!isCancelled) {
            if (meta?.isVaultEnabled) {
              setIsVaultEnabled(true);
              setVaultMeta(meta);
            } else {
              setIsVaultEnabled(false);
              setVaultMeta(null);
            }
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setIsVaultEnabled(false);
            setVaultMeta(null);
          }
        });
    } else {
      Promise.resolve().then(() => {
        if (!isCancelled) {
          setMasterKey(null);
          setIsVaultEnabled(false);
          setVaultMeta(null);
        }
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

  // Lock vault on session revocation, explicit logout, or lock request
  useEffect(() => {
    const handleLockEvent = () => lockVault();
    window.addEventListener('auth:session-revoked', handleLockEvent);
    window.addEventListener('vault:request-lock', handleLockEvent);

    return () => {
      window.removeEventListener('auth:session-revoked', handleLockEvent);
      window.removeEventListener('vault:request-lock', handleLockEvent);
    };
  }, [lockVault]);

  // ── Setup Vault Order: Step 1 (Derive & Prepare in memory) ─────────────────
  const prepareVaultSetup = useCallback(async (passphrase) => {
    const validation = validatePassphrase(passphrase);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    // Generate recovery key
    const { rawBytes: recoveryBytes, displayString: recoveryString } = generateRecoveryKey();

    // Browser Web Crypto setup (derives KEK, wraps Master Key, zeroes buffers)
    const cryptoResult = await cryptoSetupVault(passphrase, recoveryBytes);

    pendingVaultSetupRef.current = {
      cryptoResult,
      recoveryString,
      recoveryBytes,
    };

    return { recoveryKey: recoveryString };
  }, []);

  // ── Setup Vault Order: Step 2 (POST after confirmation) ────────────────────
  const confirmVaultSetup = useCallback(async (authPayload = {}) => {
    const pending = pendingVaultSetupRef.current;
    if (!pending) {
      throw new Error('No pending vault setup to confirm');
    }

    const { cryptoResult, recoveryString } = pending;

    // Save metadata on server only AFTER recovery key confirmed, with identity verification
    await vaultServices.setupVault({
      password:             authPayload.password,
      googleIdToken:        authPayload.googleIdToken,
      salt:                 cryptoResult.salt,
      kdfParams:            cryptoResult.kdfParams,
      wrappedMasterKey:     cryptoResult.wrappedMasterKey,
      wrappedMasterKeyIv:   cryptoResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   cryptoResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: cryptoResult.recoveryWrappedKeyIv,
    });

    // Master Key stays in memory
    setMasterKey(cryptoResult.masterKey);
    setIsVaultEnabled(true);
    setVaultMeta({
      isVaultEnabled:       true,
      salt:                 cryptoResult.salt,
      kdfParams:            cryptoResult.kdfParams,
      wrappedMasterKey:     cryptoResult.wrappedMasterKey,
      wrappedMasterKeyIv:   cryptoResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   cryptoResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: cryptoResult.recoveryWrappedKeyIv,
    });
    setLastRecoveryKey(recoveryString);
    pendingVaultSetupRef.current = null;
    setIsSetupModalOpen(false);

    return { recoveryKey: recoveryString };
  }, []);

  // ── Abort Vault Setup (Wipe pending keys on cancel) ─────────────────────────
  const abortVaultSetup = useCallback(() => {
    pendingVaultSetupRef.current = null;
  }, []);

  // Combined convenience helper (used by tests and scripts)
  const setupVault = useCallback(async (passphrase) => {
    await prepareVaultSetup(passphrase);
    return confirmVaultSetup();
  }, [prepareVaultSetup, confirmVaultSetup]);

  // ── Unlock Vault with Passphrase ───────────────────────────────────────────
  const unlockVault = useCallback(async (passphrase) => {
    let currentMeta = vaultMeta;
    if (!currentMeta?.wrappedMasterKey) {
      currentMeta = await checkVaultStatus();
    }
    if (!currentMeta || !currentMeta.isVaultEnabled) {
      throw new Error('Vault is not configured on this account');
    }

    const unwrappedMK = await cryptoUnlockVault(passphrase, currentMeta);
    setMasterKey(unwrappedMK);
    setIsUnlockModalOpen(false);
    return true;
  }, [vaultMeta, checkVaultStatus]);

  // ── Unlock Vault with Recovery Key ─────────────────────────────────────────
  const unlockWithRecovery = useCallback(async (recoveryString) => {
    let currentMeta = vaultMeta;
    if (!currentMeta?.recoveryWrappedKey) {
      currentMeta = await checkVaultStatus();
    }
    if (!currentMeta || !currentMeta.isVaultEnabled) {
      throw new Error('Vault is not configured on this account');
    }

    const unwrappedMK = await cryptoRecoverWithKey(recoveryString, currentMeta);
    setMasterKey(unwrappedMK);
    setIsUnlockModalOpen(false);
    return true;
  }, [vaultMeta, checkVaultStatus]);

  // ── Reset Passphrase with Recovery Key ──────────────────────────────────────
  const resetPassphraseWithRecovery = useCallback(async (recoveryStringOrOpts, maybeNewPassphrase, maybeAuth = {}) => {
    let recoveryString = recoveryStringOrOpts;
    let newPassphrase = maybeNewPassphrase;
    let password = maybeAuth.password;
    let googleIdToken = maybeAuth.googleIdToken;

    if (typeof recoveryStringOrOpts === 'object' && recoveryStringOrOpts !== null) {
      recoveryString = recoveryStringOrOpts.recoveryString || recoveryStringOrOpts.recoveryKey;
      newPassphrase = recoveryStringOrOpts.newPassphrase;
      password = recoveryStringOrOpts.password;
      googleIdToken = recoveryStringOrOpts.googleIdToken;
    }

    const validation = validatePassphrase(newPassphrase);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    let currentMeta = vaultMeta;
    if (!currentMeta?.recoveryWrappedKey) {
      currentMeta = await checkVaultStatus();
    }
    if (!currentMeta || !currentMeta.isVaultEnabled) {
      throw new Error('Vault is not configured on this account');
    }

    const result = await cryptoResetPassphraseWithRecovery(recoveryString, newPassphrase, currentMeta);

    // Persist new wrapped keys to server with re-authentication
    await vaultServices.updateVaultMeta({
      password,
      googleIdToken,
      salt:                 result.salt,
      kdfParams:            result.kdfParams,
      wrappedMasterKey:     result.wrappedMasterKey,
      wrappedMasterKeyIv:   result.wrappedMasterKeyIv,
      recoveryWrappedKey:   result.recoveryWrappedKey,
      recoveryWrappedKeyIv: result.recoveryWrappedKeyIv,
    });

    setMasterKey(result.masterKey);
    setVaultMeta({
      isVaultEnabled:       true,
      salt:                 result.salt,
      kdfParams:            result.kdfParams,
      wrappedMasterKey:     result.wrappedMasterKey,
      wrappedMasterKeyIv:   result.wrappedMasterKeyIv,
      recoveryWrappedKey:   result.recoveryWrappedKey,
      recoveryWrappedKeyIv: result.recoveryWrappedKeyIv,
      hasBackup:            false,
    });
    setLastRecoveryKey(result.newRecoveryKey);
    setIsUnlockModalOpen(false);

    return { recoveryKey: result.newRecoveryKey };
  }, [vaultMeta, checkVaultStatus]);

  // ── Change Vault Passphrase ────────────────────────────────────────────────
  const changePassphrase = useCallback(async (currentPassphraseOrOpts, maybeNewPassphrase, maybePassword, maybeGoogleToken) => {
    let currentPassphrase = currentPassphraseOrOpts;
    let newPassphrase = maybeNewPassphrase;
    let loginPassword = maybePassword;
    let googleIdToken = maybeGoogleToken;

    if (typeof currentPassphraseOrOpts === 'object' && currentPassphraseOrOpts !== null) {
      currentPassphrase = currentPassphraseOrOpts.currentPassphrase;
      newPassphrase = currentPassphraseOrOpts.newPassphrase;
      loginPassword = currentPassphraseOrOpts.password;
      googleIdToken = currentPassphraseOrOpts.googleIdToken;
    }

    const validation = validatePassphrase(newPassphrase);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    let currentMeta = vaultMeta;
    if (!currentMeta?.wrappedMasterKey) {
      currentMeta = await checkVaultStatus();
    }
    if (!currentMeta || !currentMeta.isVaultEnabled) {
      throw new Error('Vault is not configured on this account');
    }

    // Generate new recovery key
    const { rawBytes: newRecoveryBytes, displayString: newRecoveryString } = generateRecoveryKey();

    // Browser crypto change (unwraps old MK, re-wraps with new KEK + new recovery key)
    const cryptoResult = await cryptoChangePassphrase(
      currentPassphrase,
      newPassphrase,
      currentMeta,
      newRecoveryBytes
    );

    // Persist new wrapped keys with password or Google re-authentication on server
    await vaultServices.updateVaultMeta({
      password:             loginPassword,
      googleIdToken:        googleIdToken,
      salt:                 cryptoResult.salt,
      kdfParams:            cryptoResult.kdfParams,
      wrappedMasterKey:     cryptoResult.wrappedMasterKey,
      wrappedMasterKeyIv:   cryptoResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   cryptoResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: cryptoResult.recoveryWrappedKeyIv,
    });

    setMasterKey(cryptoResult.masterKey);
    setVaultMeta({
      isVaultEnabled:       true,
      salt:                 cryptoResult.salt,
      kdfParams:            cryptoResult.kdfParams,
      wrappedMasterKey:     cryptoResult.wrappedMasterKey,
      wrappedMasterKeyIv:   cryptoResult.wrappedMasterKeyIv,
      recoveryWrappedKey:   cryptoResult.recoveryWrappedKey,
      recoveryWrappedKeyIv: cryptoResult.recoveryWrappedKeyIv,
      hasBackup:            false,
    });
    setLastRecoveryKey(newRecoveryString);

    setIsChangeModalOpen(false);

    return { recoveryKey: newRecoveryString };
  }, [vaultMeta, checkVaultStatus]);

  const value = {
    masterKey,
    isVaultEnabled,
    isUnlocked,
    isCheckingVault,
    vaultMeta,
    prepareVaultSetup,
    confirmVaultSetup,
    abortVaultSetup,
    setupVault,
    unlockVault,
    unlockWithRecovery,
    resetPassphraseWithRecovery,
    changePassphrase,
    lockVault,
    checkVaultStatus,
    scorePassphrase,
    validatePassphrase,
    // Modal states and triggers
    isSetupModalOpen,
    openSetupModal: () => setIsSetupModalOpen(true),
    closeSetupModal: () => setIsSetupModalOpen(false),
    isUnlockModalOpen,
    openUnlockModal: () => setIsUnlockModalOpen(true),
    closeUnlockModal: () => setIsUnlockModalOpen(false),
    isChangeModalOpen,
    openChangeModal: () => setIsChangeModalOpen(true),
    closeChangeModal: () => setIsChangeModalOpen(false),
    isRecoveryModalOpen,
    openRecoveryModal: () => setIsRecoveryModalOpen(true),
    closeRecoveryModal: () => setIsRecoveryModalOpen(false),
    lastRecoveryKey,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}

export default VaultContext;
