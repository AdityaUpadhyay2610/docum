/**
 * AuthContext – global authentication state
 *
 * Session lifecycle:
 *
 *  ┌──────────────┐   login / register   ┌──────────────────┐
 *  │  logged out  │ ─────────────────────▶│  authenticated   │
 *  └──────────────┘                       └──────────────────┘
 *         ▲                                       │
 *         │  auth:session-revoked event           │ access token expires
 *         │  (refresh token invalid/revoked)      │ (TOKEN_EXPIRED)
 *         │                                       ▼
 *         │                               api.js silently POSTs /auth/refresh
 *         │                               ├─ success → set new access token,
 *         │                               │            replay original request
 *         │                               │            user stays logged in ✅
 *         └───────────────────────────────┘─ failure → fires auth:session-revoked
 *                                                       AuthContext clears state
 *                                                       user sees login screen ❌
 *
 * The user is NEVER logged out due to normal access token expiry.
 * They are only logged out when:
 *   • They click "Logout"
 *   • The refresh token itself has expired (7-day idle)
 *   • The backend revokes the session (password change, logout from another tab)
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import authServices from '../services/authServices';
import { getAccessToken, clearAuthTokens } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialise from localStorage so there is no flicker on hard refresh
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isGuest, setIsGuest] = useState(
    () => localStorage.getItem('isGuest') === 'true'
  );

  // `loading` is only true during the initial session-validation on mount.
  // It is NOT set to true during background silent refreshes.
  const [loading, setLoading] = useState(true);

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);



  // ── Session init on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const token = getAccessToken();

      if (token) {
        // Fast path: we have an access token — validate it against /auth/me
        // api.js will handle TOKEN_EXPIRED silently (refresh + retry) if needed
        try {
          const res = await authServices.getMe();
          if (isMounted && res?.user) {
            setUser(res.user);
            localStorage.setItem('user', JSON.stringify(res.user));
            setIsGuest(false);
          }
        } catch {
          // getMe failed AND silent refresh also failed → user must log in again
          // (api.js already fired auth:session-revoked in this case)
          if (isMounted) {
            clearAuthTokens();
            setUser(null);
          }
        }
      } else {
        // No access token in localStorage — attempt silent restore via cookie
        try {
          const refreshRes = await authServices.refresh();
          if (refreshRes?.accessToken && isMounted) {
            const profileRes = await authServices.getMe();
            if (isMounted && profileRes?.user) {
              setUser(profileRes.user);
              localStorage.setItem('user', JSON.stringify(profileRes.user));
              setIsGuest(false);
            }
          }
        } catch {
          // Cookie missing / expired — leave user as guest if they chose guest mode
          if (isMounted && localStorage.getItem('isGuest') === 'true') {
            setIsGuest(true);
            setUser(null);
          }
        }
      }

      if (isMounted) setLoading(false);
    }

    initSession();

    // ── Global event: api.js fires this when a refresh fails ─────────────────
    // This is the ONLY path that forces a logout due to token issues.
    // It distinguishes credential mismatch / revoked session from normal expiry.
    const handleSessionRevoked = (e) => {
      const reason = e.detail?.reason ?? 'UNKNOWN';
      console.warn('[AuthContext] Session revoked:', reason);
      clearAuthTokens();
      setUser(null);
      setIsGuest(false);
    };

    window.addEventListener('auth:session-revoked', handleSessionRevoked);

    // Legacy event name — keep for backwards compatibility
    window.addEventListener('auth:expired', handleSessionRevoked);

    return () => {
      isMounted = false;
      window.removeEventListener('auth:session-revoked', handleSessionRevoked);
      window.removeEventListener('auth:expired', handleSessionRevoked);
    };
  }, []);

  // ── Auth actions ────────────────────────────────────────────────────────────

  const login = useCallback(async (credentials) => {
    const res = await authServices.login(credentials);
    if (res?.user) {
      setUser(res.user);
      setIsGuest(false);
    }
    return res;
  }, []);

  const register = useCallback(async (data) => {
    const res = await authServices.register(data);
    if (res?.user) {
      setUser(res.user);
      setIsGuest(false);
      setIsRegisterModalOpen(false);
    }
    return res;
  }, []);

  const googleAuth = useCallback(async (data) => {
    const res = await authServices.googleAuth(data);
    if (res?.user) {
      setUser(res.user);
      setIsGuest(false);
      setIsRegisterModalOpen(false);
    }
    return res;
  }, []);

  const continueAsGuest = useCallback(() => {
    clearAuthTokens();
    setUser(null);
    setIsGuest(true);
    localStorage.setItem('isGuest', 'true');
  }, []);

  const logout = useCallback(async () => {
    // Explicit user-initiated logout — revokes refresh token on the server
    try {
      await authServices.logout();
    } catch {
      // Even if the server call fails, clear local state
    }
    clearAuthTokens();
    setUser(null);
    setIsGuest(false);
  }, []);

  const openRegisterModal  = useCallback(() => setIsRegisterModalOpen(true),  []);
  const closeRegisterModal = useCallback(() => setIsRegisterModalOpen(false), []);

  // ── isAuthenticated: true when we have BOTH a user object AND an access token
  // Using user state (not localStorage) prevents stale reads between renders.
  // The access token check uses getAccessToken() which reads localStorage —
  // this is fine because setAccessToken() is called synchronously before any
  // state update, so isAuthenticated never flickers to false during a refresh.
  const isAuthenticated = Boolean(user && getAccessToken());

  const value = {
    user,
    isAuthenticated,
    isGuest,
    loading,
    login,
    register,
    googleAuth,
    continueAsGuest,
    logout,
    isRegisterModalOpen,
    openRegisterModal,
    closeRegisterModal,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
