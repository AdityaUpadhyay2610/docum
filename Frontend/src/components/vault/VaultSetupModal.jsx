import { useState } from 'react';
import {
  X,
  Shield,
  Lock,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext.jsx';
import RecoveryKeyModal from './RecoveryKeyModal.jsx';

export default function VaultSetupModal({ isOpen, onClose }) {
  const { setupVault, scorePassphrase, validatePassphrase } = useVault();

  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Recovery Key step
  const [recoveryKey, setRecoveryKey] = useState(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  if (!isOpen) return null;

  const { score, label } = scorePassphrase(passphrase);
  const isMatch = passphrase.length > 0 && passphrase === confirmPassphrase;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const validation = validatePassphrase(passphrase);
    if (!validation.valid) {
      setError(validation.reason);
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    setLoading(true);
    try {
      const { recoveryKey: generatedKey } = await setupVault(passphrase);
      setRecoveryKey(generatedKey);
      setShowRecoveryModal(true);
    } catch (err) {
      console.error('Vault setup failed:', err);
      setError(err.message || 'Failed to setup encryption vault');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthBarColor = () => {
    if (score <= 1) return 'bg-rose-500';
    if (score === 2) return 'bg-amber-500';
    if (score === 3) return 'bg-blue-500';
    return 'bg-emerald-500';
  };

  return (
    <>
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
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-neutral-900">Set Up Document Vault</h2>
                <p className="text-xs text-neutral-500">Zero-Knowledge End-to-End Encryption</p>
              </div>
            </div>

            {/* Critical Security Warning */}
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              <span className="font-semibold block mb-0.5">⚠️ Important Security Warning</span>
              <p className="leading-relaxed">
                This vault passphrase is <strong>different from your login password</strong>.
                It is never sent to our servers. <strong>We cannot recover it or reset it for you.</strong>
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="Enter a strong passphrase (≥ 12 characters)"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                  />
                </div>

                {/* Strength Meter */}
                {passphrase.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[11px] text-neutral-500">
                      <span>Strength: {label}</span>
                      <span>{score >= 2 ? 'Meets requirement' : 'Too weak'}</span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${getStrengthBarColor()}`}
                        style={{ width: `${Math.max(15, (score + 1) * 20)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Confirm Vault Passphrase
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Re-enter vault passphrase"
                    required
                    className="w-full pl-9 pr-9 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                  />
                  {isMatch && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || score < 2 || !isMatch}
                  className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    loading || score < 2 || !isMatch
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deriving Keys & Setting Up...
                    </>
                  ) : (
                    'Generate Vault & Recovery Key'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showRecoveryModal && (
        <RecoveryKeyModal
          isOpen={showRecoveryModal}
          recoveryKey={recoveryKey}
          onConfirmed={() => {
            setShowRecoveryModal(false);
            onClose();
          }}
          onClose={() => {
            setShowRecoveryModal(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
