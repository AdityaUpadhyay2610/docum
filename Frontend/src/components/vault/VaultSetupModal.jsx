import { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Shield,
  Lock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Key,
  Copy,
  Check,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import GoogleConfirmButton from './GoogleConfirmButton.jsx';

export default function VaultSetupModal({ isOpen, onClose }) {
  const {
    prepareVaultSetup,
    confirmVaultSetup,
    abortVaultSetup,
    scorePassphrase,
    validatePassphrase,
  } = useVault();
  const { user } = useAuth();
  const isGoogle = user?.authProvider === 'google';
  const [accountPassword, setAccountPassword] = useState('');
  const [googleIdToken, setGoogleIdToken] = useState('');

  // Step 1: passphrase entry; Step 2: recovery key display and confirmation
  const [step, setStep] = useState(1);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Recovery Key step
  const [recoveryKey, setRecoveryKey] = useState('');
  const [copied, setCopied] = useState(false);

  // Challenge groups (indices 0..7)
  const [challengeIndices, setChallengeIndices] = useState([0, 1]);
  const [challengeInputA, setChallengeInputA] = useState('');
  const [challengeInputB, setChallengeInputB] = useState('');
  const clipboardTimerRef = useRef(null);

  // Clean up clipboard timer on unmount
  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    };
  }, []);

  const groups = useMemo(() => {
    return recoveryKey ? recoveryKey.split('-') : [];
  }, [recoveryKey]);

  if (!isOpen) return null;

  const { score, label } = scorePassphrase(passphrase);
  const isMatch = passphrase.length > 0 && passphrase === confirmPassphrase;

  const handleClose = () => {
    if (step === 2) {
      abortVaultSetup();
    }
    // Clear clipboard timer and wipe clipboard if recovery key was copied
    if (clipboardTimerRef.current) {
      clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = null;
      navigator.clipboard?.writeText('').catch(() => {});
    }
    setStep(1);
    setPassphrase('');
    setConfirmPassphrase('');
    setError(null);
    setRecoveryKey('');
    setChallengeInputA('');
    setChallengeInputB('');
    setAccountPassword('');
    setGoogleIdToken('');
    onClose();
  };

  const handleGenerateKeys = async (e) => {
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
      // Step 1 & 2: Derive keys + generate recovery key in memory WITHOUT posting to server yet
      const { recoveryKey: generatedKey } = await prepareVaultSetup(passphrase);
      setRecoveryKey(generatedKey);

      // Pick two distinct random groups between 0 and 7
      const idxA = Math.floor(Math.random() * 8);
      let idxB = Math.floor(Math.random() * 7);
      if (idxB >= idxA) idxB += 1;
      setChallengeIndices([Math.min(idxA, idxB), Math.max(idxA, idxB)]);

      setStep(2);
    } catch (err) {
      console.error('Vault key derivation failed:', err);
      setError(err.message || 'Failed to prepare encryption vault');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Auto-clear clipboard after 60 seconds for security
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = setTimeout(() => {
        navigator.clipboard?.writeText('').catch(() => {});
        clipboardTimerRef.current = null;
      }, 60_000);
    } catch {
      // Fallback — clipboard API not available
    }
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob(
      [
        `DOCUMENT WORKSHOPS - E2EE VAULT RECOVERY KEY\n` +
        `============================================\n\n` +
        `Recovery Key:\n${recoveryKey}\n\n` +
        `WARNING:\n` +
        `This recovery key can unlock your encrypted documents if you forget your vault passphrase.\n` +
        `Store this file securely. We do not store this key and cannot recover it for you.\n`,
      ],
      { type: 'text/plain' }
    );
    element.href = URL.createObjectURL(file);
    element.download = 'document-workshops-recovery-key.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const isChallengeMatched =
    groups.length === 8 &&
    challengeInputA.trim().toUpperCase() === groups[challengeIndices[0]] &&
    challengeInputB.trim().toUpperCase() === groups[challengeIndices[1]];

  const isAuthConfirmed = isGoogle ? Boolean(googleIdToken) : Boolean(accountPassword);

  const handleConfirmAndActivate = async () => {
    if (!isChallengeMatched) {
      setError('The entered groups do not match the recovery key');
      return;
    }

    if (!isGoogle && !accountPassword) {
      setError('Please enter your account login password to verify identity');
      return;
    }

    if (isGoogle && !googleIdToken) {
      setError('Please confirm your identity with Google re-authentication');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Step 4: POST /api/vault/setup only upon successful confirmation of recovery key
      await confirmVaultSetup({
        password: accountPassword,
        googleIdToken,
      });
      handleClose();
    } catch (err) {
      console.error('Vault setup confirmation failed:', err);
      setError(err.message || 'Failed to save vault configuration');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-lg w-full overflow-hidden relative">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          {step === 1 ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900">Set Up Document Vault</h2>
                  <p className="text-xs text-neutral-500">Step 1: Choose a strong passphrase</p>
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

              <form onSubmit={handleGenerateKeys} className="space-y-4">
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
                      className="w-full pl-9 pr-3 py-2 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
                    />
                  </div>

                  {/* Strength Meter */}
                  {passphrase.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[11px] text-neutral-500">
                        <span>Strength: {label}</span>
                        <span>{passphrase.length < 12 ? `Needs ≥ 12 characters (${passphrase.length}/12)` : score < 3 ? 'Too weak (needs score ≥ 3)' : 'Meets requirement'}</span>
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
                      className="w-full pl-9 pr-9 py-2 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition"
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
                    disabled={loading || score < 3 || passphrase.length < 12 || !isMatch}
                    className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      loading || score < 3 || passphrase.length < 12 || !isMatch
                        ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                        : 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                    }`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deriving Keys...
                      </>
                    ) : (
                      'Generate Keys & Continue'
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              {/* Step 2: Confirm Recovery Key */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900">Confirm Your Recovery Key</h2>
                  <p className="text-xs text-neutral-500">Step 2: Save and confirm before activation</p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-xs text-amber-800">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                <div>
                  <span className="font-semibold">Save this recovery key now.</span>
                  <p className="mt-0.5">
                    Your vault will only be activated once you confirm below. If you close without confirming,
                    keys are wiped and vault setup is aborted.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-3 bg-neutral-900 text-neutral-100 rounded-xl font-mono text-xs tracking-wider break-all text-center select-all border border-neutral-800">
                {recoveryKey}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-1 py-2 px-3 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy Key'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 py-2 px-3 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download .txt
                </button>
              </div>

              {/* Challenge Confirmation */}
              <div className="mt-5 p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-neutral-800">
                  Verify you have saved the key: enter groups #{challengeIndices[0] + 1} and #{challengeIndices[1] + 1}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Group #{challengeIndices[0] + 1}
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={challengeInputA}
                      onChange={(e) => setChallengeInputA(e.target.value)}
                      placeholder="e.g. 8 chars"
                      className="w-full px-2.5 py-1.5 text-xs font-mono uppercase text-neutral-900 bg-white border border-neutral-300 rounded-lg focus:ring-1 focus:ring-neutral-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Group #{challengeIndices[1] + 1}
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={challengeInputB}
                      onChange={(e) => setChallengeInputB(e.target.value)}
                      placeholder="e.g. 8 chars"
                      className="w-full px-2.5 py-1.5 text-xs font-mono uppercase text-neutral-900 bg-white border border-neutral-300 rounded-lg focus:ring-1 focus:ring-neutral-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Identity Verification before activation */}
              <div className="mt-4 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-neutral-800">
                  Step 2b: Verify identity to activate
                </p>
                {isGoogle ? (
                  <div>
                    <GoogleConfirmButton
                      onTokenReceived={(token) => {
                        setGoogleIdToken(token);
                        setError(null);
                      }}
                      isConfirmed={Boolean(googleIdToken)}
                    />
                    <p className="text-[11px] text-neutral-500 mt-1 text-center">
                      Confirm with Google to activate your encrypted vault.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Account Login Password
                    </label>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Enter account login password"
                      className="w-full px-2.5 py-1.5 text-xs text-neutral-900 bg-white border border-neutral-300 rounded-lg focus:ring-1 focus:ring-neutral-900 outline-none"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Required by server to verify your identity.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 px-4 border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Abort & Wipe
                </button>
                <button
                  type="button"
                  disabled={loading || !isChallengeMatched || !isAuthConfirmed}
                  onClick={handleConfirmAndActivate}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    loading || !isChallengeMatched
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    'Confirm & Activate Vault'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
