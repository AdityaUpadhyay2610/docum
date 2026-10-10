/**
 * Auth Service Layer
 *
 * NOTE: `refresh()` uses a raw fetch (not api.js) to avoid circular retry loops.
 * Every other call goes through api.js which handles silent refresh automatically.
 */

import api, { API_BASE_URL, setAccessToken, clearAuthTokens } from './api';

// Build the shared headers without importing the full request() closure
function sharedHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(import.meta.env.VITE_APP_REQUEST_TOKEN
      ? { 'X-App-Request': import.meta.env.VITE_APP_REQUEST_TOKEN }
      : {}),
  };
}

export const authServices = {
  /**
   * Register a new user account
   */
  async register(data) {
    const res = await api.post('/auth/register', data);
    if (res.accessToken) {
      setAccessToken(res.accessToken);
      if (res.user) localStorage.setItem('user', JSON.stringify(res.user));
      localStorage.removeItem('isGuest');
    }
    return res;
  },

  /**
   * Log in to an existing account
   */
  async login(credentials) {
    const res = await api.post('/auth/login', credentials);
    if (res.accessToken) {
      setAccessToken(res.accessToken);
      if (res.user) localStorage.setItem('user', JSON.stringify(res.user));
      localStorage.removeItem('isGuest');
    }
    return res;
  },

  /**
   * Silently refresh the access token using the HttpOnly refresh-token cookie.
   *
   * Uses raw `fetch` (NOT api.js) so that:
   *  • There is no circular dependency (api.js calls this to refresh)
   *  • A 401 from the refresh endpoint does NOT trigger another refresh attempt
   *
   * Returns the new access token string on success, throws on failure.
   */
  async refresh() {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method:      'POST',
      credentials: 'include',   // sends HttpOnly refreshToken cookie
      headers:     sharedHeaders(),
      body:        JSON.stringify({}),
    });

    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const err = new Error(body?.error ?? 'Refresh failed');
      err.status = res.status;
      err.code   = body?.code ?? 'REFRESH_FAILED';
      throw err;
    }

    const data = await res.json();
    if (data.accessToken) setAccessToken(data.accessToken);
    return data;
  },

  /**
   * Explicitly log out — revokes the refresh token on the server
   */
  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch (err) {
      // Best-effort: if the server call fails, we still clear locally
      console.warn('[authServices] Logout server call failed:', err?.message);
    } finally {
      clearAuthTokens();
    }
  },

  /**
   * Fetch the authenticated user's profile.
   * api.js will transparently refresh the access token if it has expired.
   */
  async getMe() {
    return api.get('/auth/me');
  },
};

export default authServices;
