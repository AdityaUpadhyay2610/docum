import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import config from '../../config.js';

export default function GoogleConfirmButton({ onTokenReceived, isConfirmed = false }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const clientId = config.googleClientId;
    if (!clientId) {
      setError('Google Client ID not configured');
      return;
    }

    const init = () => {
      if (window.google?.accounts?.id && containerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
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
  }, [onTokenReceived]);

  if (isConfirmed) {
    return (
      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>Google identity confirmed</span>
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="my-1 flex justify-center" />
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
