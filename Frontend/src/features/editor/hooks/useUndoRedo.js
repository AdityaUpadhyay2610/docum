import { useState, useCallback, useRef } from 'react';

/**
 * Hook to manage undo and redo history for document blocks
 * @param {Array} initialBlocks
 * @param {Function} onBlocksChange
 */
export function useUndoRedo(initialBlocks = [], onBlocksChange) {
  const [history, setHistory] = useState([initialBlocks]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isInternalUpdate = useRef(false);

  // Push new state to history stack
  const pushState = useCallback((newBlocks) => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    setHistory((prev) => {
      // Cut off any future redo states
      const trimmed = prev.slice(0, currentIndex + 1);
      // Avoid duplicate states
      if (JSON.stringify(trimmed[trimmed.length - 1]) === JSON.stringify(newBlocks)) {
        return prev;
      }
      // Cap history at 50 states
      const next = [...trimmed, newBlocks];
      if (next.length > 50) next.shift();
      return next;
    });

    setCurrentIndex((prev) => Math.min(prev + 1, 49));
  }, [currentIndex]);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const targetIndex = currentIndex - 1;
    const targetState = history[targetIndex];
    if (targetState) {
      isInternalUpdate.current = true;
      setCurrentIndex(targetIndex);
      onBlocksChange(targetState);
    }
  }, [canUndo, currentIndex, history, onBlocksChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const targetIndex = currentIndex + 1;
    const targetState = history[targetIndex];
    if (targetState) {
      isInternalUpdate.current = true;
      setCurrentIndex(targetIndex);
      onBlocksChange(targetState);
    }
  }, [canRedo, currentIndex, history, onBlocksChange]);

  const resetHistory = useCallback((initial) => {
    setHistory([initial]);
    setCurrentIndex(0);
  }, []);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    pushState,
    resetHistory,
  };
}

export default useUndoRedo;
