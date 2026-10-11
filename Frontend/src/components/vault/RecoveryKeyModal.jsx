import { useState } from 'react';
import {
  X,
  Key,
  Copy,
  Check,
  Download,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

export default function RecoveryKeyModal({
  isOpen,
  onClose,
  recoveryKey,
  title = 'Your Recovery Key',
  onConfirmed,
}) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen || !recoveryKey) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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

  const handleProceed = () => {
    if (onConfirmed) onConfirmed();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-lg w-full overflow-hidden relative">
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
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
              <p className="text-xs text-neutral-500">Save this one-time recovery key immediately</p>
            </div>
          </div>

          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-xs text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            <div>
              <span className="font-semibold">Do not lose this key.</span>
              <p className="mt-0.5">
                Because Document Workshops uses zero-knowledge encryption, our servers never see your passphrase or keys.
                If you lose both your passphrase and this recovery key, your encrypted documents will be <strong>permanently lost</strong>.
              </p>
            </div>
          </div>

          <div className="p-4 bg-neutral-900 text-neutral-100 rounded-xl font-mono text-xs sm:text-sm tracking-wider break-all text-center select-all border border-neutral-800">
            {recoveryKey}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 py-2 px-3 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied to Clipboard' : 'Copy Key'}
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

          <label className="flex items-start gap-3 mt-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
            />
            <span className="text-xs text-neutral-600 leading-relaxed">
              I have saved my recovery key in a secure location. I acknowledge that Document Workshops cannot recover it for me.
            </span>
          </label>

          <button
            type="button"
            disabled={!acknowledged}
            onClick={handleProceed}
            className={`w-full mt-6 py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
              acknowledged
                ? 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-md'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            I Have Saved My Recovery Key
          </button>
        </div>
      </div>
    </div>
  );
}
