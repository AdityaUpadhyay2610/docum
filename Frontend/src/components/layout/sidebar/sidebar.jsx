import { useState } from 'react';
import {
  Plus,
  Search,
  FilePlus,
  X,
  BookOpen,
  LogOut,
  User,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  Unlock,
  Shield,
  KeyRound,
  LogIn,
} from 'lucide-react';
import DocumentItem from './documentitems';
import { useVault } from '../../../context/VaultContext';

export default function Sidebar({
  documents = [],
  activeDocId,
  user = null,
  isGuest = false,
  onSelectDoc,
  onCreateDoc,
  onDeleteDoc,
  onLogout,
  onTriggerAuth,
  isOpen = false,
  onClose,
  onToggle,
}) {
  const {
    isVaultEnabled,
    isUnlocked,
    lockVault,
    openUnlockModal,
    openSetupModal,
    openChangeModal,
  } = useVault();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const filteredDocs = documents.filter((doc) =>
    (doc.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleSelect = (id) => {
    onSelectDoc(id);
    if (window.innerWidth < 768 && onClose) onClose();
  };

  const handleCreate = () => {
    onCreateDoc();
    if (window.innerWidth < 768 && onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      {/* Floating Toggle Button when Sidebar is Collapsed */}
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle || onClose}
          className="fixed left-0 top-3 z-40 bg-white hover:bg-neutral-100 text-neutral-700 hover:text-blue-600 border border-neutral-300/80 border-l-0 rounded-r-xl px-2.5 py-2 shadow-md transition-all cursor-pointer group flex items-center gap-1"
          title="Open Document Explorer (Sidebar)"
        >
          <PanelLeftOpen className="w-4 h-4 text-neutral-600 group-hover:text-blue-600 transition-colors" />
          <span className="text-xs font-semibold text-neutral-700 group-hover:text-blue-600 hidden sm:inline">Docs</span>
        </button>
      )}

      {/* Collapsible Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 md:static h-screen bg-neutral-50/95 border-r border-neutral-200/80 flex flex-col select-none shrink-0 shadow-xl md:shadow-none transition-all duration-300 ease-in-out ${
          isOpen
            ? 'w-72 translate-x-0 opacity-100'
            : 'w-0 -translate-x-full md:w-0 md:translate-x-0 opacity-0 overflow-hidden pointer-events-none'
        }`}
      >
        {/* Workspace Header */}
        <div className="p-3.5 border-b border-neutral-200/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm text-neutral-900 tracking-tight block leading-tight truncate">
                Document Workshops
              </span>
              <span className="text-[11px] text-neutral-400 font-medium truncate block">
                {isGuest ? 'Guest Session' : 'Personal Workspace'}
              </span>
            </div>
          </div>

          {/* Collapse Button (Works on Desktop and Mobile) */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer shrink-0"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="px-3 py-2 border-b border-neutral-200/60 text-sm">
          {isSearchOpen ? (
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search docs..."
                className="w-full bg-white border border-neutral-200 rounded-md pl-8 pr-7 py-1 text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 shadow-xs"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="p-1 text-neutral-400 hover:text-neutral-700 absolute right-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-neutral-200/60 transition-colors text-left text-neutral-600 font-medium text-xs cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-neutral-400" />
                <span>Search documents</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono bg-neutral-200/60 px-1.5 py-0.5 rounded">
                /
              </span>
            </button>
          )}
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
              Documents ({documents.length})
            </span>
            <button
              type="button"
              onClick={handleCreate}
              className="p-1 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
              title="New Document"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-400">
              {searchQuery ? 'No documents match search.' : 'No documents found.'}
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <DocumentItem
                key={doc.id || doc._id}
                doc={doc}
                document={doc}
                isActive={(doc.id || doc._id) === activeDocId}
                onSelect={() => handleSelect(doc.id || doc._id)}
                onDelete={() => onDeleteDoc(doc.id || doc._id)}
              />
            ))
          )}
        </div>

        {/* Quick New Document Button */}
        <div className="p-2 border-t border-neutral-200/60">
          <button
            type="button"
            onClick={handleCreate}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-700 hover:text-neutral-900 border border-neutral-200 rounded-lg text-xs font-semibold transition-all shadow-2xs active:scale-98 cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5 text-neutral-600" />
            <span>New Document</span>
          </button>
        </div>

        {/* Vault Controls (Logged-in only) */}
        {!isGuest && user && (
          <div className="p-2.5 border-t border-neutral-200/60 bg-neutral-100/50">
            {!isVaultEnabled ? (
              <button
                type="button"
                onClick={openSetupModal}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Enable E2EE Vault</span>
              </button>
            ) : isUnlocked ? (
              <div className="flex items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold truncate">
                  <Unlock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Vault Unlocked</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={openChangeModal}
                    className="p-1 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/70 rounded transition-colors"
                    title="Change Vault Passphrase"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={lockVault}
                    className="px-2 py-0.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
                    title="Lock Vault immediately"
                  >
                    Lock
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openUnlockModal}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Unlock Vault</span>
              </button>
            )}
          </div>
        )}

        {/* User Account / Guest Profile Footer */}
        <div className="p-3 border-t border-neutral-200/80 bg-neutral-100/70">
          {isGuest ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-800 truncate">Guest Mode</p>
                  <p className="text-[10px] text-neutral-500 truncate">In-memory session</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onTriggerAuth}
                className="flex items-center gap-1 text-[11px] font-bold text-neutral-900 bg-white hover:bg-neutral-200 border border-neutral-200 px-2 py-1 rounded-md transition-colors cursor-pointer shrink-0 shadow-2xs"
                title="Sign In or Register to save documents permanently"
              >
                <LogIn className="w-3 h-3" />
                <span>Sign In</span>
              </button>
            </div>
          ) : user ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {user.name ? user.name.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-800 truncate">{user.name || 'User'}</p>
                  <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer shrink-0"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}