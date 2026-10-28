import { useState } from 'react';
import {
  X,
  KeyRound,
  Lock,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import RecoveryKeyModal from './RecoveryKeyModal.jsx';
import GoogleConfirmButton from './GoogleConfirmButton.jsx';

export default function VaultChangePassphraseModal({ isOpen, onClose }) {
  const { changePassphrase, scorePassphrase, validatePassphrase } = useVault();
  const { user } = useAuth();
  const isGoogleUser = user?.authProvider === 'google';

  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [googleIdToken, setGoogleIdToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // New recovery key display
  const [newRecoveryKey, setNewRecoveryKey] = useState(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  if (!isOpen) return null;

  const { score, label } = scorePassphrase(newPassphrase);
  const isMatch = newPassphrase.length > 0 && newPassphrase === confirmNewPassphrase;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const validation = validatePassphrase(newPassphrase);
    if (!validation.valid) {
      setError(validation.reason);
      return;
    }

    if (newPassphrase !== confirmNewPassphrase) {
      setError('New passphrases do not match');
      return;
    }

    if (isGoogleUser && !googleIdToken) {
      setError('Please confirm your identity with Google before updating your passphrase.');
      return;
    }

    if (!isGoogleUser && !loginPassword) {
      setError('Please enter your account login password to confirm your identity.');
      return;
    }

    setLoading(true);
    try {
      const { recoveryKey } = await changePassphrase({
        currentPassphrase,
        newPassphrase,
        password: loginPassword,
        googleIdToken,
      });
      setNewRecoveryKey(recoveryKey);
      setShowRecoveryModal(true);
    } catch (err) {
      console.error('Change passphrase failed:', err);
      setError(err.message || 'Failed to change vault passphrase. Verify your current passwords.');
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
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-neutral-900">Change Vault Passphrase</h2>
                <p className="text-xs text-neutral-500">Re-wraps Master Key with a new passphrase</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Current Vault Passphrase
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={currentPassphrase}
                    onChange={(e) => setCurrentPassphrase(e.target.value)}
                    placeholder="Enter current vault passphrase"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  New Vault Passphrase
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={newPassphrase}
                    onChange={(e) => setNewPassphrase(e.target.value)}
                    placeholder="Enter new passphrase (≥ 12 chars)"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                  />
                </div>

                {newPassphrase.length > 0 && (
                  <div className="mt-1.5 space-y-1">
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
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Confirm New Vault Passphrase
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={confirmNewPassphrase}
                    onChange={(e) => setConfirmNewPassphrase(e.target.value)}
                    placeholder="Re-enter new passphrase"
                    required
                    className="w-full pl-9 pr-9 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                  />
                  {isMatch && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>              {!isGoogleUser ? (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Account Login Password (Re-authentication)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your account login password"
                      required
                      className="w-full pl-9 pr-9 py-2 text-sm border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Required to verify your identity before overwriting vault metadata.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Confirm with Google (Re-authentication)
                  </label>
                  <GoogleConfirmButton
                    onTokenReceived={(token) => {
                      setGoogleIdToken(token);
                      setError(null);
                    }}
                    isConfirmed={Boolean(googleIdToken)}
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Sign in with your Google account to confirm identity before updating passphrase.
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || score < 2 || !isMatch || (!isGoogleUser && !loginPassword) || (isGoogleUser && !googleIdToken)}
                  className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    loading || score < 2 || !isMatch || (!isGoogleUser && !loginPassword) || (isGoogleUser && !googleIdToken)
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating Passphrase & Re-wrapping...
                    </>
                  ) : (
                    'Update Passphrase'
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
          recoveryKey={newRecoveryKey}
          title="New Recovery Key"
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
