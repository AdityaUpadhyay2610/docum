import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Mail } from 'lucide-react';
import authServices from '../services/authServices';

export default function VerifyEmailPage() {
  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null;
  const [status, setStatus] = useState(token ? 'loading' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'No verification token provided. Please check the link from your email.'
  );

  useEffect(() => {
    if (!token) return undefined;

    let isMounted = true;
    authServices
      .verifyEmail(token)
      .then((res) => {
        if (!isMounted) return;
        setStatus('success');
        setMessage(res?.message || 'Your email address has been successfully verified.');
      })
      .catch((err) => {
        if (!isMounted) return;
        setStatus('error');
        setMessage(err?.message || 'Verification token is invalid or has expired.');
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleGoToApp = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 text-neutral-100 p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center bg-neutral-800/80 border border-neutral-700">
          {status === 'loading' && <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-8 h-8 text-emerald-400" />}
          {status === 'error' && <XCircle className="w-8 h-8 text-rose-400" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {status === 'loading' && 'Verifying your email...'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            {status === 'loading' && 'Please wait while we confirm your email token with the server.'}
            {status !== 'loading' && message}
          </p>
        </div>

        {status === 'success' && (
          <div className="pt-2">
            <button
              onClick={handleGoToApp}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              <span>Continue to Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3 pt-2">
            <button
              onClick={handleGoToApp}
              className="w-full py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-neutral-700"
            >
              <Mail className="w-4 h-4" />
              <span>Back to Login</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
