/**
 * Central API Client
 *
 * Silent refresh flow:
 *  1. Every request attaches the stored access token as a Bearer header.
 *  2. On 401 with code "TOKEN_EXPIRED"  → attempt one silent refresh via the
 *     HttpOnly cookie (POST /auth/refresh).  On success, retry the original
 *     request transparently – the caller never sees the 401.
 *  3. On 401 with code "SESSION_REVOKED" (or any other non-expiry 401) →
 *     clear local tokens and fire `auth:session-revoked` so AuthContext can
 *     show the login screen.  Do NOT fire this event for normal token expiry.
 *  4. Multiple concurrent requests that all 401 at the same moment queue up
 *     (subscriber pattern) and are replayed once the single refresh resolves.
 *  5. Refresh calls themselves (`/auth/refresh`) are never retried to avoid
 *     infinite loops.
 */

import config from '../config.js';

// ── Base URL ──────────────────────────────────────────────────────────────────
function getApiBaseUrl() {
  let url = config.apiUrl.replace(/\/+$/, '');
  url = url.replace(/\/api\/documents\/?$/, '');
  url = url.replace(/\/documents\/?$/, '');
  if (!url.endsWith('/api')) url = `${url}/api`;
  return url;
}

export const API_BASE_URL = getApiBaseUrl();

// ── Error class ───────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name  = 'ApiError';
    this.status = status;
    this.data   = data;
    // Expose the server-side `code` field for auth logic
    this.code   = data?.code ?? null;
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────
// Only the short-lived access token lives in localStorage.
// The refresh token is strictly HttpOnly cookie – JS never touches it.
try { localStorage.removeItem('refreshToken'); } catch { /* ignore */ }

export const getAccessToken  = ()       => localStorage.getItem('accessToken');
export const setAccessToken  = (token)  => {
  if (token) localStorage.setItem('accessToken', token);
  try { localStorage.removeItem('refreshToken'); } catch { /* ignore */ }
};
export const clearAuthTokens = ()       => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('isGuest');
};

// ── Shared default headers ────────────────────────────────────────────────────
function buildDefaultHeaders() {
  return {
    'Content-Type': 'application/json',
    // Shared-secret header consumed by originGuard on the backend.
    // Set VITE_APP_REQUEST_TOKEN in frontend .env to match APP_REQUEST_TOKEN on backend.
    ...(config.appRequestToken
      ? { 'X-App-Request': config.appRequestToken }
      : {}),
  };
}

// ── Silent refresh state machine ──────────────────────────────────────────────
let isRefreshing      = false;
let refreshSubscribers = [];   // queue of { resolve, reject } callbacks

function enqueueRequest(resolve, reject) {
  refreshSubscribers.push({ resolve, reject });
}

function flushSubscribers(newToken) {
  refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
  refreshSubscribers = [];
}

function rejectSubscribers(err) {
  refreshSubscribers.forEach(({ reject }) => reject(err));
  refreshSubscribers = [];
}

// ── Core refresh attempt (called once per concurrent 401 burst) ───────────────
async function attemptSilentRefresh() {
  const refreshUrl = `${API_BASE_URL}/auth/refresh`;
  const res = await fetch(refreshUrl, {
    method:      'POST',
    credentials: 'include',       // sends HttpOnly refreshToken cookie
    headers:     buildDefaultHeaders(),
    body:         JSON.stringify({}),
  });

  if (!res.ok) {
    // Read the code the server sent back
    let body;
    try { body = await res.json(); } catch { /* ignore */ }
    const code = body?.code ?? (res.status === 401 ? 'SESSION_REVOKED' : 'REFRESH_FAILED');
    throw new ApiError(body?.error ?? 'Session expired', res.status, { ...body, code });
  }

  const data = await res.json();
  return data.accessToken;
}

// ── Main request function ─────────────────────────────────────────────────────
async function request(endpoint, options = {}, _isRetry = false) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders = buildDefaultHeaders();
  const token = getAccessToken();
  if (token) defaultHeaders['Authorization'] = `Bearer ${token}`;

  const config = {
    credentials: 'include',
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  // Serialize plain objects (but not FormData / strings)
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const res  = await fetch(url, config);

  // Parse body
  let data;
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  // ── Silent refresh on access-token expiry ─────────────────────────────────
  // Only trigger for:
  //  • HTTP 401
  //  • NOT already a retry (prevents infinite loops)
  //  • NOT the refresh endpoint itself
  //  • Server says code === 'TOKEN_EXPIRED'  (or no code — older servers)
  const serverCode = data?.code ?? null;
  const isExpiry   =
    res.status === 401 &&
    !_isRetry &&
    !endpoint.includes('/auth/refresh') &&
    (serverCode === 'TOKEN_EXPIRED' || serverCode === null);

  if (isExpiry) {
    if (!isRefreshing) {
      // ── First concurrent request to hit 401 ── triggers the refresh
      isRefreshing = true;
      try {
        const newToken = await attemptSilentRefresh();
        setAccessToken(newToken);
        isRefreshing = false;
        flushSubscribers(newToken);
        // Replay the original request with the new token
        return request(endpoint, options, true);
      } catch (refreshErr) {
        isRefreshing = false;
        rejectSubscribers(refreshErr);
        // Only clear session and notify UI if the refresh itself was rejected
        // (i.e. refresh token is expired / revoked / missing)
        clearAuthTokens();
        window.dispatchEvent(new CustomEvent('auth:session-revoked', {
          detail: { reason: refreshErr?.code ?? 'REFRESH_FAILED' },
        }));
        // Re-throw so the original caller gets a proper error
        throw refreshErr instanceof ApiError
          ? refreshErr
          : new ApiError('Session expired. Please log in again.', 401, { code: 'SESSION_REVOKED' });
      }
    } else {
      // ── Subsequent concurrent requests — wait for the in-flight refresh ──
      return new Promise((resolve, reject) => {
        enqueueRequest(
          (newToken) => {
            const retryOptions = {
              ...options,
              headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
            };
            resolve(request(endpoint, retryOptions, true));
          },
          reject,
        );
      });
    }
  }

  // ── Any other non-ok response ─────────────────────────────────────────────
  if (!res.ok) {
    // 401 that is NOT a token-expiry (wrong credentials, session revoked, etc.)
    if (res.status === 401 && !endpoint.includes('/auth/refresh')) {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent('auth:session-revoked', {
        detail: { reason: serverCode ?? 'INVALID_CREDENTIALS' },
      }));
    }
    const msg = data?.error || data?.message || `Request failed with status ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }

  return data;
}

// ── Public API surface ────────────────────────────────────────────────────────
export const api = {
  get:    (endpoint, options)       => request(endpoint, { ...options, method: 'GET'    }),
  post:   (endpoint, body, options) => request(endpoint, { ...options, method: 'POST',   body }),
  put:    (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT',    body }),
  patch:  (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH',  body }),
  delete: (endpoint, options)       => request(endpoint, { ...options, method: 'DELETE'        }),
};

export default api;
