import { useState } from 'react';
import { Trash2, Check, X, Lock } from 'lucide-react';

export default function DocumentItem({ doc, document: documentProp, isActive, onSelect, onDelete }) {
  const item = doc || documentProp || {};
  const docId = item.id || item._id;
  const isEncrypted = Boolean(item.isEncrypted);
  const isLocked = Boolean(item.isLocked);

  const docIcon = isLocked ? '🔒' : (item.icon || (isEncrypted ? '🔒' : '📝'));
  const docTitle = isLocked
    ? '[Encrypted]'
    : (item.title && item.title.trim() !== '' ? item.title : 'Untitled');

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleDelete = (e) => {
    e.stopPropagation();
    if (docId && onDelete) onDelete(docId);
    setIsConfirmingDelete(false);
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setIsConfirmingDelete(false);
  };

  const handlePromptDelete = (e) => {
    e.stopPropagation();
    setIsConfirmingDelete(true);
  };

  return (
    <div
      onClick={() => onSelect && docId && onSelect(docId)}
      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-sm font-medium transition-all select-none ${
        isActive
          ? 'bg-neutral-200/90 text-neutral-900 font-semibold shadow-xs'
          : 'text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900'
      }`}
    >
      <div className="flex items-center gap-2 truncate min-w-0 flex-1 mr-1">
        <span className="text-base shrink-0 select-none">{docIcon}</span>
        <span className="truncate text-xs sm:text-sm">
          {docTitle}
        </span>
        {isEncrypted && (
          <Lock
            className={`w-3 h-3 shrink-0 ${isLocked ? 'text-amber-500' : 'text-emerald-600'}`}
            title={isLocked ? 'Encrypted (Vault Locked)' : 'End-to-End Encrypted'}
          />
        )}
      </div>

      {/* Delete Controls / Confirmation */}
      {isConfirmingDelete ? (
        <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-100" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded text-xs transition-colors"
            title="Confirm Delete"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCancelDelete}
            className="p-1 hover:bg-neutral-200 text-neutral-500 rounded text-xs transition-colors"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePromptDelete}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-300/60 rounded text-neutral-400 hover:text-red-600 transition-all shrink-0"
          title="Delete document"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}