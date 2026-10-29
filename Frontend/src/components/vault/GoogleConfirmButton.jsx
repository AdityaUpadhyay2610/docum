import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import config from '../../config.js';

export default function GoogleConfirmButton({ onTokenReceived, isConfirmed = false }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const clientId = config.googleClientId;

  useEffect(() => {
    if (!clientId) {
      return;
    }

    const init = () => {
      if (window.google?.accounts?.id && containerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            use_fedcm_for_prompt: true,
            callback: (res) => {
              if (res.credential) {
                onTokenReceived(res.credential);
              }
            },
          });

          window.google.accounts.id.renderButton(containerRef.current, {
            theme: 'outline',
            size: 'medium',
            text: 'continue_with',
            shape: 'rectangular',
            width: 250,
          });
        } catch (e) {
          setError(e.message);
        }
      }
    };

    if (window.google?.accounts?.id) {
      init();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          init();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [clientId, onTokenReceived]);

  if (isConfirmed) {
    return (
      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>Google identity confirmed</span>
      </div>
    );
  }

  const displayError = error || (!clientId ? 'Google Client ID not configured' : null);

  return (
    <div>
      <div ref={containerRef} className="my-1 flex justify-center" />
      {displayError && <p className="text-[11px] text-red-500 mt-1">{displayError}</p>}
    </div>
  );
}
