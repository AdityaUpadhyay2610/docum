import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';
import { validateAuthData } from '../services/validation';
import config from '../config';

// Password strength evaluator
function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: 'bg-neutral-200', textColor: 'text-neutral-400' };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500', textColor: 'text-red-500' };
  if (score <= 4) return { score, label: 'Medium', color: 'bg-amber-500', textColor: 'text-amber-500' };
  return { score, label: 'Strong', color: 'bg-emerald-500', textColor: 'text-emerald-500' };
}

export default function AuthPage({ defaultMode = 'login' }) {
  const [isLogin, setIsLogin] = useState(defaultMode === 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Google account linking with existing password account
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState(null);

  const googleBtnContainerRef = useRef(null);

  const { login, register, googleAuth, continueAsGuest } = useAuth();

  const passwordStrength = getPasswordStrength(password);

  const handleConfirmLink = async (e) => {
    e?.preventDefault();
    if (!linkPassword || !pendingGoogleCredential) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      await googleAuth({
        credential: pendingGoogleCredential,
        password: linkPassword,
      });
      setShowLinkModal(false);
      setPendingGoogleCredential('');
      setLinkPassword('');
    } catch (err) {
      console.error('Google account linking error:', err);
      setLinkError(err.message || 'Incorrect password. Please verify and try again.');
    } finally {
      setLinkLoading(false);
    }
  };

  // Initialize Google Identity Services
  useEffect(() => {
    const clientId = config.googleClientId;
    if (!clientId) return;

    const initializeGSI = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          callback: async (response) => {
            if (response.credential) {
              setError(null);
              setLoading(true);
              try {
                await googleAuth({ credential: response.credential });
              } catch (err) {
                console.error('Google auth error:', err);
                if (err.code === 'PASSWORD_REQUIRED_TO_LINK') {
                  setPendingGoogleCredential(response.credential);
                  setShowLinkModal(true);
                  setError(null);
                  return;
                }
                setError(err.message || 'Google authentication failed.');
              } finally {
                setLoading(false);
              }
            }
          },
        });

        if (googleBtnContainerRef.current) {
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            shape: 'rectangular',
            text: 'continue_with',
            width: 380,
          });
        }
      }
    };

    if (window.google?.accounts?.id) {
      initializeGSI();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeGSI();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [googleAuth]);

  const handleGoogleClick = () => {
    setError(null);
    if (!config.googleClientId) {
      setError(
        'Google Client ID is not configured. Please add VITE_GOOGLE_CLIENT_ID to your frontend .env file.'
      );
      return;
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // If OneTap prompt was suppressed, click the rendered hidden button fallback
          const renderedBtn = googleBtnContainerRef.current?.querySelector('div[role="button"]');
          if (renderedBtn) renderedBtn.click();
        }
      });
    } else {
      setError('Google Sign In script is still loading. Please try again in a moment.');
    }
  };

  // Regular login / register submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const validationError = validateAuthData({ email, password });
        if (validationError) throw new Error(validationError);
        await login({ email, password });
      } else {
        const validationError = validateAuthData(
          { name, email, password, confirmPassword },
          { requireName: true, requireConfirm: true }
        );
        if (validationError) throw new Error(validationError);
        await register({ name, email, password, confirmPassword });
      }
    } catch (err) {
      console.error('Auth submission error:', err);
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#EBF2F8] p-3 sm:p-6 lg:p-10 font-sans text-neutral-800 antialiased selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Background Soft Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Split-Screen Card Container */}
      <div className="w-full max-w-5xl min-h-[640px] bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row relative z-10 border border-neutral-100">
        
        {/* ================= LEFT SECTION (Blue Gradient with 3D Bubbles) ================= */}
        <div className="w-full lg:w-[48%] bg-gradient-to-br from-[#005BEA] via-[#0066F6] to-[#0047C4] text-white p-8 sm:p-12 lg:p-14 flex flex-col justify-between relative overflow-hidden shrink-0">
          
          {/* 3D Decorative Spheres / Bubbles */}
          <div
            className="absolute -bottom-24 -left-20 w-80 h-80 rounded-full pointer-events-none shadow-2xl"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #2989FF 0%, #0056D6 60%, #003699 100%)',
              boxShadow: 'inset 0 -10px 25px rgba(0,0,0,0.35), 0 20px 40px rgba(0,0,0,0.3)',
            }}
          />
          <div
            className="absolute -bottom-16 right-[-10px] w-64 h-64 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #3DA2FF 0%, #0060E6 60%, #003B9E 100%)',
              boxShadow: 'inset 0 -10px 25px rgba(0,0,0,0.3), 0 15px 35px rgba(0,0,0,0.25)',
            }}
          />
          <div
            className="absolute top-[-30px] right-[-20px] w-40 h-40 rounded-full pointer-events-none opacity-40"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #5CB3FF 0%, #0066F6 70%, #0044B3 100%)',
            }}
          />

          {/* Left Content */}
          <div className="relative z-10 my-auto py-10 lg:py-16">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-wider uppercase leading-tight mb-2 text-white drop-shadow-sm">
              WELCOME
            </h1>
            <h2 className="text-sm sm:text-base lg:text-lg font-bold tracking-[0.2em] uppercase text-blue-100 mb-6 drop-shadow-xs">
              DOCUMENT WORKSHOPS
            </h2>
            <p className="text-xs sm:text-sm text-blue-50/85 leading-relaxed max-w-sm font-normal">
              An intelligent, block-based workspace with auto-saving and unified Google Docs & Word editing capabilities.
            </p>
          </div>

          {/* Bottom Security Note */}
          <div className="relative z-10 text-[11px] text-blue-100/70 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>&copy; {new Date().getFullYear()} Document Workshops &middot; Privacy & Security First</span>
          </div>
        </div>

        {/* ================= RIGHT SECTION (Forms) ================= */}
        <div className="w-full lg:w-[52%] bg-white p-8 sm:p-12 lg:p-14 flex flex-col justify-center relative">
          
          {/* Bottom Right Decorative Blue Bubble */}
          <div
            className="absolute -bottom-16 -right-16 w-44 h-44 rounded-full pointer-events-none hidden sm:block"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #2E8DFF 0%, #0062E0 65%, #003EAB 100%)',
              boxShadow: 'inset 0 -8px 20px rgba(0,0,0,0.25)',
            }}
          />

          <div className="max-w-sm w-full mx-auto relative z-10">
            {/* Title & Subtitle */}
            <div className="mb-6">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0D253A] tracking-tight mb-1.5">
                {isLogin ? 'Sign in' : 'Sign up'}
              </h2>
              <p className="text-xs text-neutral-400 font-normal">
                {isLogin
                  ? 'Welcome back! Please enter your details to sign in.'
                  : 'Create a secured account with cloud auto-save & sync.'}
              </p>
            </div>

            {/* Continue with Google Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleClick}
              className="w-full py-3 px-4 bg-white hover:bg-neutral-50 active:scale-[0.99] border border-neutral-200 text-neutral-700 text-sm font-bold tracking-tight rounded-xl transition-all shadow-xs flex items-center justify-center gap-3 cursor-pointer group disabled:opacity-60"
            >
              {/* Google 'G' Multi-Color SVG Icon */}
              <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="text-neutral-700 group-hover:text-neutral-900 transition-colors">
                Continue with Google
              </span>
            </button>

            {/* Hidden container used by Google GSI fallback if needed */}
            <div ref={googleBtnContainerRef} className="hidden" />

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="w-full border-t border-neutral-200"></div>
              <span className="absolute bg-white px-3 text-xs text-neutral-400 font-medium">
                Or continue with email
              </span>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="font-medium leading-snug">{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Name Field (Sign Up mode only) */}
              {!isLogin && (
                <div className="relative flex items-center bg-[#F3F6F9] rounded-xl px-4 py-3 border border-transparent focus-within:border-neutral-300 focus-within:bg-white transition-all shadow-2xs">
                  <User className="w-5 h-5 text-neutral-700 shrink-0 mr-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none font-medium"
                  />
                </div>
              )}

              {/* Email / Username Field */}
              <div className="relative flex items-center bg-[#F3F6F9] rounded-xl px-4 py-3 border border-transparent focus-within:border-neutral-300 focus-within:bg-white transition-all shadow-2xs">
                {isLogin ? (
                  <User className="w-5 h-5 text-neutral-700 shrink-0 mr-3" />
                ) : (
                  <Mail className="w-5 h-5 text-neutral-700 shrink-0 mr-3" />
                )}
                <input
                  type="email"
                  required
                  value={email}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isLogin ? 'User Name / Email' : 'Email Address'}
                  className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none font-medium"
                />
              </div>

              {/* Password Field */}
              <div>
                <div className="relative flex items-center bg-[#F3F6F9] rounded-xl px-4 py-3 border border-transparent focus-within:border-neutral-300 focus-within:bg-white transition-all shadow-2xs">
                  <Lock className="w-5 h-5 text-neutral-700 shrink-0 mr-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 8 chars)"
                    className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none font-medium pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 text-[11px] font-extrabold tracking-wider text-[#0B3B60] hover:text-blue-600 transition-colors uppercase cursor-pointer"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>

                {/* Password Strength Meter (Shown when typing in Sign Up) */}
                {!isLogin && password && (
                  <div className="mt-2 px-1">
                    <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                      <span className="text-neutral-500">Strength:</span>
                      <span className={passwordStrength.textColor}>{passwordStrength.label}</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field (Sign Up mode only) */}
              {!isLogin && (
                <div>
                  <div className="relative flex items-center bg-[#F3F6F9] rounded-xl px-4 py-3 border border-transparent focus-within:border-neutral-300 focus-within:bg-white transition-all shadow-2xs">
                    <Lock className="w-5 h-5 text-neutral-700 shrink-0 mr-3" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm Password"
                      className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 text-[11px] font-extrabold tracking-wider text-[#0B3B60] hover:text-blue-600 transition-colors uppercase cursor-pointer"
                    >
                      {showConfirmPassword ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>

                  {confirmPassword && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] px-1 font-medium">
                      {password === confirmPassword ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Passwords match
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1">
                          <X className="w-3.5 h-3.5" /> Passwords do not match
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Remember Me & Forgot Password (Sign in mode) */}
              <div className="flex items-center justify-between text-xs pt-1 pb-1">
                <label className="flex items-center gap-2 text-neutral-600 select-none cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-[#0B3B60] border-neutral-300 focus:ring-0 cursor-pointer accent-[#0B3B60]"
                  />
                  <span>Remember me</span>
                </label>

                {isLogin && (
                  <button
                    type="button"
                    onClick={() => alert('Please contact administrator to reset your password.')}
                    className="text-[#0B3B60] hover:text-blue-600 font-semibold cursor-pointer transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>

              {/* Primary Solid Action Button */}
              <button
                type="submit"
                disabled={loading || (!isLogin && confirmPassword && password !== confirmPassword)}
                className="w-full py-3 px-4 bg-[#0B3B60] hover:bg-[#072842] active:scale-[0.99] text-white text-sm font-bold tracking-wide rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Please wait...</span>
                  </>
                ) : (
                  <span>{isLogin ? 'Sign in' : 'Sign up'}</span>
                )}
              </button>
            </form>

            {/* Secondary Outlined Action Button (Guest Access) */}
            <div className="mt-3">
              <button
                type="button"
                onClick={continueAsGuest}
                className="w-full py-2.5 px-4 bg-white hover:bg-neutral-50 active:scale-[0.99] border border-neutral-200 text-neutral-600 hover:text-neutral-900 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                Sign in as Guest
              </button>
            </div>

            {/* Bottom Mode Switcher */}
            <div className="mt-5 text-center text-xs text-neutral-500">
              <span>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
              </span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsLogin(!isLogin);
                }}
                className="font-bold text-[#0B3B60] hover:text-blue-600 hover:underline cursor-pointer transition-colors"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </div>
        </div>

      {/* Account Linking Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3 text-neutral-900 font-bold text-base">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">🔗</span>
              <span>Link Google Account</span>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              An existing account was found for your Google email. Please enter your account password to confirm ownership and link Google sign-in.
            </p>
            {linkError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium">
                {linkError}
              </div>
            )}
            <form onSubmit={handleConfirmLink} className="space-y-3">
              <input
                type="password"
                placeholder="Account password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkModal(false);
                    setPendingGoogleCredential('');
                    setLinkPassword('');
                    setLinkError(null);
                  }}
                  className="flex-1 py-2 px-3 border border-neutral-200 hover:bg-neutral-50 rounded-xl text-xs font-semibold text-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkLoading || !linkPassword}
                  className="flex-1 py-2 px-3 bg-[#0B3B60] hover:bg-[#072844] text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {linkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Confirm & Link</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
