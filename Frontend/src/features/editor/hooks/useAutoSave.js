import { useState, useRef, useEffect, useCallback } from 'react';
import documentServices from '../../../services/documentServices';
import { useVault } from '../../../context/VaultContext';

/**
 * Custom hook for handling debounced auto-saving with state management and vault encryption
 * @param {Object} activeDoc - Current active document object
 * @param {Function} onDocumentUpdated - Callback to notify parent of synced updates
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 600ms)
 * @param {boolean} isGuest - Flag whether user is in guest mode (skips DB updates)
 */
export function useAutoSave(activeDoc, onDocumentUpdated, debounceMs = 600, isGuest = false) {
  const { masterKey } = useVault();
  const [saveStatus, setSaveStatus] = useState(isGuest ? 'guest' : 'saved'); // 'saved' | 'saving' | 'error' | 'guest' | 'conflict'
  const pendingChangesRef = useRef({});
  const timerRef = useRef(null);
  const activeDocIdRef = useRef(activeDoc?._id || activeDoc?.id);

  // Keep track of the active document id to avoid saving stale doc data across doc switching
  useEffect(() => {
    const currentId = activeDoc?._id || activeDoc?.id;
    if (currentId !== activeDocIdRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingChangesRef.current = {};
      activeDocIdRef.current = currentId;
      setSaveStatus(isGuest ? 'guest' : 'saved');
    }
  }, [activeDoc?._id, activeDoc?.id, isGuest]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Step 3a: On vault lock, cancel any pending debounced autosaves of encrypted documents immediately
  useEffect(() => {
    const handleVaultLock = () => {
      if (activeDoc?.isEncrypted) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        pendingChangesRef.current = {};
        setSaveStatus('saved');
      }
    };

    window.addEventListener('vault:locked', handleVaultLock);
    return () => {
      window.removeEventListener('vault:locked', handleVaultLock);
    };
  }, [activeDoc?.isEncrypted]);

  const saveToBackend = useCallback(
    async (docId, updates, options = {}) => {
      if (isGuest) {
        setSaveStatus('guest');
        if (onDocumentUpdated) {
          onDocumentUpdated({ ...activeDoc, ...updates });
        }
        return;
      }

      if (!docId || Object.keys(updates).length === 0) return;

      // Never attempt to save encrypted doc without masterKey
      if (activeDoc?.isEncrypted && !masterKey) {
        return;
      }

      setSaveStatus('saving');
      try {
        const fullUpdates = {
          ...updates,
          isEncrypted: activeDoc?.isEncrypted,
          encDek:      activeDoc?.encDek,
        };
        const updated = await documentServices.update(docId, fullUpdates, {
          masterKey,
          expectedRevision: options.expectedRevision ?? activeDoc?.revision,
        });
        if (onDocumentUpdated) {
          onDocumentUpdated(updated);
        }
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to auto-save document:', err);
        if (err.status === 409) {
          setSaveStatus('conflict');
          window.dispatchEvent(
            new CustomEvent('document:conflict', {
              detail: {
                docId,
                activeDoc,
                currentRevision: err.data?.currentRevision,
                error: err.data?.error || err.message,
              },
            })
          );
        } else {
          setSaveStatus('error');
        }
      }
    },
    [isGuest, activeDoc, onDocumentUpdated, masterKey]
  );

  const queueAutoSave = useCallback(
    (updates) => {
      const docId = activeDoc?._id || activeDoc?.id;
      if (!docId) return;

      if (isGuest) {
        setSaveStatus('guest');
        if (onDocumentUpdated) {
          onDocumentUpdated({ ...activeDoc, ...updates });
        }
        return;
      }

      // Do not queue auto-save if encrypted doc is locked
      if (activeDoc?.isEncrypted && !masterKey) {
        return;
      }

      // Merge changes
      pendingChangesRef.current = {
        ...pendingChangesRef.current,
        ...updates,
      };

      setSaveStatus('saving');

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const changesToSave = { ...pendingChangesRef.current };
        pendingChangesRef.current = {};
        saveToBackend(docId, changesToSave);
      }, debounceMs);
    },
    [activeDoc, isGuest, debounceMs, onDocumentUpdated, saveToBackend, masterKey]
  );

  const saveImmediate = useCallback(
    async (updates, options = {}) => {
      const docId = activeDoc?._id || activeDoc?.id;
      if (!docId) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (isGuest) {
        setSaveStatus('guest');
        if (onDocumentUpdated) {
          onDocumentUpdated({ ...activeDoc, ...updates });
        }
        return;
      }

      if (activeDoc?.isEncrypted && !masterKey) {
        return;
      }

      const merged = {
        ...pendingChangesRef.current,
        ...updates,
      };
      pendingChangesRef.current = {};
      await saveToBackend(docId, merged, options);
    },
    [activeDoc, isGuest, onDocumentUpdated, saveToBackend, masterKey]
  );

  const cancelAutoSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingChangesRef.current = {};
  }, []);

  return {
    saveStatus,
    queueAutoSave,
    saveImmediate,
    cancelAutoSave,
  };
}

export default useAutoSave;
