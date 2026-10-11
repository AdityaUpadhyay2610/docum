import { useState } from 'react';
import {
  X,
  Lock,
  Key,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext.jsx';

export default function VaultUnlockModal({ isOpen, onClose }) {
  const { unlockVault, unlockWithRecovery } = useVault();

  const [activeTab, setActiveTab] = useState('passphrase'); // 'passphrase' | 'recovery'
  const [passphrase, setPassphrase] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleUnlockPassphrase = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await unlockVault(passphrase);
      onClose();
    } catch (err) {
      console.error('Vault unlock failed:', err);
      setError('Incorrect vault passphrase. Please try again or use your recovery key.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockRecovery = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await unlockWithRecovery(recoveryKey.trim());
      onClose();
    } catch (err) {
      console.error('Vault recovery unlock failed:', err);
      setError('Invalid recovery key. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-md w-full overflow-hidden relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900">Unlock Vault</h2>
              <p className="text-xs text-neutral-500">Decrypt your private document workspace</p>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex p-1 bg-neutral-100 rounded-xl mb-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setActiveTab('passphrase'); setError(null); }}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'passphrase'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Vault Passphrase
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('recovery'); setError(null); }}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'recovery'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              Recovery Key
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'passphrase' ? (
            <form onSubmit={handleUnlockPassphrase} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Vault Passphrase
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter your vault passphrase"
                    required
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !passphrase}
                  className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    loading || !passphrase
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Unlocking Vault...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Unlock Vault
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setActiveTab('recovery'); setError(null); }}
                  className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors underline"
                >
                  Forgot your vault passphrase? Use Recovery Key
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleUnlockRecovery} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Recovery Key
                </label>
                <textarea
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-..."
                  required
                  autoFocus
                  rows={3}
                  className="w-full p-3 font-mono text-xs border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition resize-none"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Enter the 64-character hex recovery key provided during setup.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !recoveryKey.trim()}
                  className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    loading || !recoveryKey.trim()
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Recovering Vault...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Unlock with Recovery Key
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
