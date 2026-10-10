import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { validateAuthData } from '../services/validation';
import config from '../config';

// Helper to decode Google JWT payload without external library
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

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

  // Google OAuth specific state
  const [googleUser, setGoogleUser] = useState(null); // { credential, email, name, picture }
  const googleBtnContainerRef = useRef(null);

  const { login, register, googleAuth, continueAsGuest } = useAuth();

  const passwordStrength = getPasswordStrength(password);

  // Initialize Google Identity Services
  useEffect(() => {
    const clientId = config.googleClientId;
    if (!clientId) return;

    const initializeGSI = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) {
              const decoded = parseJwt(response.credential);
              if (decoded) {
                setGoogleUser({
                  credential: response.credential,
                  email: decoded.email,
                  name: decoded.name || decoded.email.split('@')[0],
                  picture: decoded.picture || null,
                });
                setError(null);
                setPassword('');
                setConfirmPassword('');
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
            width: '100%',
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
  }, []);

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

  // Google OAuth completion submit (sets password & confirm password)
  const handleGoogleAuthSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const validationError = validateAuthData(
        { email: googleUser.email, password, confirmPassword },
        { requireConfirm: true }
      );
      if (validationError) throw new Error(validationError);

      await googleAuth({
        credential: googleUser.credential,
        password,
        confirmPassword,
      });
    } catch (err) {
      console.error('Google auth error:', err);
      setError(err.message || 'Google account setup failed.');
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
              An intelligent, block-based workspace with bank-grade encryption, auto-saving, and unified Google Docs & Word editing capabilities.
            </p>
          </div>

          {/* Bottom Security Note */}
          <div className="relative z-10 text-[11px] text-blue-100/70 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>&copy; {new Date().getFullYear()} Document Workshops &middot; End-to-End Encrypted</span>
          </div>
        </div>

        {/* ================= RIGHT SECTION (Forms & Google Step) ================= */}
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
            {/* ── STEP 1: GOOGLE ACCOUNT CONNECTED — SETUP APP PASSWORD ── */}
            {googleUser ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleUser(null);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-800 mb-5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Choose another account</span>
                </button>

                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0D253A] tracking-tight mb-1">
                    Secure with Password
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Set a password for your account to enhance login security.
                  </p>
                </div>

                {/* Google Account Profile Card */}
                <div className="mb-5 p-3 rounded-2xl bg-blue-50/80 border border-blue-100 flex items-center gap-3">
                  {googleUser.picture ? (
                    <img
                      src={googleUser.picture}
                      alt={googleUser.name}
                      className="w-10 h-10 rounded-full border border-blue-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                      {googleUser.name?.charAt(0) || 'G'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-neutral-900 block truncate">
                      {googleUser.name}
                    </span>
                    <span className="text-[11px] text-blue-700 font-medium block truncate flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      {googleUser.email}
                    </span>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span className="font-medium leading-snug">{error}</span>
                  </div>
                )}

                <form onSubmit={handleGoogleAuthSubmit} className="space-y-3.5">
                  {/* Password */}
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
                        placeholder="Create Password (min 8 chars)"
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

                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="mt-2 px-1">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                          <span className="text-neutral-500">Security Strength:</span>
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

                  {/* Confirm Password */}
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
                    <div className="flex items-center gap-1.5 text-[11px] px-1 font-medium">
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

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || (confirmPassword && password !== confirmPassword)}
                    className="w-full py-3 px-4 bg-[#0B3B60] hover:bg-[#072842] active:scale-[0.99] text-white text-sm font-bold tracking-wide rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Securing account...</span>
                      </>
                    ) : (
                      <span>Complete Account Setup</span>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              /* ── STEP 0: STANDARD LOGIN / REGISTER FORM ── */
              <div>
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
                  onClick={handleGoogleClick}
                  className="w-full py-3 px-4 bg-white hover:bg-neutral-50 active:scale-[0.99] border border-neutral-200 text-neutral-700 text-sm font-bold tracking-tight rounded-xl transition-all shadow-xs flex items-center justify-center gap-3 cursor-pointer group"
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

                {/* Hidden container used by Google GSI if needed */}
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
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
