import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/user.models.js';
import { sendVerificationEmail } from '../services/email.service.js';
import { validateAuthInput } from '../utils/validation.js';
import { penaliseFailedLogin, clearLoginBuckets } from '../middleware/tokenBucketGuard.middleware.js';
import config from '../config/config.js';

const googleClient = new OAuth2Client();

// Seconds the PREVIOUS refresh token hash is still accepted after rotation.
// Prevents two-tab logouts when both tabs race to call /auth/refresh.
const GRACE_SECONDS = 10;

// Cookie configuration for maximum security (HttpOnly + SameSite + Secure in production)
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Helper to hash refresh tokens with SHA-256
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Helper to generate access token
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      name: user.name,
    },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiresIn }
  );
};

// Helper to generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      jti: crypto.randomUUID(),
    },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  );
};

/**
 * Extract a brief device hint from the request for session labelling only.
 * Never used for authentication decisions.
 */
const deviceHintFrom = (req) => {
  const ua = req.headers['user-agent'] || '';
  return ua.slice(0, 80); // trim to 80 chars
};

// Helper to verify Google ID token via google-auth-library OAuth2Client
export const verifyGoogleToken = async (idToken) => {
  if (!config.googleClientId) {
    console.error('[GoogleAuth] Failure: GOOGLE_CLIENT_ID is not configured on the server.');
    throw new Error('GOOGLE_AUTH_NOT_CONFIGURED');
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('No payload returned from Google verification');
    }
    if (payload.aud !== config.googleClientId) {
      throw new Error('Google token audience mismatch');
    }
    if (payload.email_verified !== true) {
      throw new Error('Google account email is not verified');
    }
    return payload;
  } catch (err) {
    console.error('[GoogleAuth] Token verification failed:', err.message);
    throw new Error('INVALID_GOOGLE_TOKEN', { cause: err });
  }
};

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    const { errors, normalizedEmail } = validateAuthInput(
      { name, email, password, confirmPassword },
      { requireName: true, requireConfirm: true }
    );
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Please correct the highlighted fields', fields: errors });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // High security: 12 salt rounds
    const hashedPassword = await bcrypt.hash(password, 12);

    // Email verification token: store hashed, send raw only via email (never in API response)
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = hashToken(rawVerificationToken);

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      isEmailVerified: false,
      emailVerificationToken: hashedVerificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const family = crypto.randomUUID();

    User.addSession(user, {
      hash: hashToken(refreshToken),
      family,
      deviceHint: deviceHintFrom(req),
    });
    await user.save();

    // Set secure HttpOnly cookie for refresh token (NEVER exposed to client JS)
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    // Send verification email; token goes only into the email, NOT the response body
    sendVerificationEmail({
      to: normalizedEmail,
      name: user.name,
      rawToken: rawVerificationToken,
    }).catch((err) => {
      console.error('[Register] Failed to send verification email:', err.message);
    });

    return res.status(201).json({
      message: 'Registration successful. A verification email has been sent. Please verify your email before linking accounts.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
      },
      accessToken,
      // NOTE: verificationToken is intentionally omitted from the response.
      // The token is delivered only via email to prevent token exposure in API logs.
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    if (error.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to register account' });
  }
};

// POST /api/auth/verify-email
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const hashed = hashToken(token);
    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired email verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    return res.status(200).json({
      message: 'Email verified successfully',
      isEmailVerified: true,
    });
  } catch (error) {
    console.error('Email verification error:', error.message);
    return res.status(500).json({ error: 'Failed to verify email' });
  }
};

// POST /api/auth/google
export const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google authentication credential is required' });
    }

    let googlePayload;
    try {
      googlePayload = await verifyGoogleToken(credential);
    } catch {
      return res.status(401).json({ error: 'Invalid or unverified Google token' });
    }

    const googleEmail = googlePayload.email.trim().toLowerCase();
    const googleName = googlePayload.name || googleEmail.split('@')[0];
    const googleSub = googlePayload.sub;
    const googlePicture = googlePayload.picture || null;

    let user = await User.findOne({
      $or: [{ googleId: googleSub }, { email: googleEmail }],
    });

    if (user) {
      // If user exists by email but googleId is not yet linked:
      if (!user.googleId) {
        // Enforce: email must be verified before account linking
        if (!user.isEmailVerified) {
          return res.status(403).json({
            error: 'Cannot link Google account: Please verify your account email address first.',
            code: 'EMAIL_NOT_VERIFIED',
          });
        }

        user.googleId = googleSub;
        if (!user.avatar && googlePicture) {
          user.avatar = googlePicture;
        }
      }
    } else {
      // New user registering with Google (password is optional / omitted)
      user = new User({
        name: googleName,
        email: googleEmail,
        password: null,
        googleId: googleSub,
        avatar: googlePicture,
        authProvider: 'google',
        isEmailVerified: true, // Google verifies email identity
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const family = crypto.randomUUID();

    User.addSession(user, {
      hash: hashToken(refreshToken),
      family,
      deviceHint: deviceHintFrom(req),
    });
    await user.save();

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Google authentication successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    return res.status(500).json({ error: 'Google authentication failed' });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { errors, normalizedEmail } = validateAuthInput({ email, password });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Please provide a valid email and password', fields: errors });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      if (req._tokenBucket) penaliseFailedLogin(req._tokenBucket.ip, normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Password login must reject accounts without a password (Google-only accounts)
    if (!user.password) {
      if (req._tokenBucket) penaliseFailedLogin(req._tokenBucket.ip, normalizedEmail);
      return res.status(401).json({
        error: 'This account was created with Google sign-in. Please sign in using Google.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      if (req._tokenBucket) penaliseFailedLogin(req._tokenBucket.ip, normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (req._tokenBucket) clearLoginBuckets(req._tokenBucket.ip, normalizedEmail);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const family = crypto.randomUUID();

    User.addSession(user, {
      hash: hashToken(refreshToken),
      family,
      deviceHint: deviceHintFrom(req),
    });
    await user.save();

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Failed to log in' });
  }
};

// POST /api/auth/refresh
export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No active session found. Please log in again.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    } catch (err) {
      res.clearCookie('refreshToken', COOKIE_OPTIONS);
      const code = err.name === 'TokenExpiredError' ? 'REFRESH_TOKEN_EXPIRED' : 'SESSION_REVOKED';
      return res.status(401).json({ error: 'Your session has expired. Please log in again.', code });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      res.clearCookie('refreshToken', COOKIE_OPTIONS);
      return res.status(401).json({ error: 'Session is no longer valid. Please log in again.', code: 'SESSION_REVOKED' });
    }

    const incomingHash = hashToken(refreshToken);
    const { session, isGrace } = User.findSession(user, incomingHash);

    if (!session) {
      // Hash matches NO known session and NO grace window → possible replay attack.
      // Check whether any session shares a family with the decoded jti's family.
      // We don't have the family in the JWT, so we revoke all sessions as a safety measure.
      console.warn(`[Auth] Token reuse / unknown hash detected for user ${decoded.userId}. Revoking all sessions.`);
      user.sessions = [];
      await user.save();
      res.clearCookie('refreshToken', COOKIE_OPTIONS);
      return res.status(401).json({
        error: 'Security alert: Token reuse detected. All sessions revoked.',
        code: 'TOKEN_REUSE_DETECTED',
      });
    }

    if (isGrace) {
      // The token was already rotated but we're within the grace window.
      // Respond with the SAME new access token without rotating again.
      // (The session already has the latest hash stored from the first rotation.)
      const newAccessToken = generateAccessToken(user);
      // Do NOT rotate the refresh cookie – the new cookie was already set in the winning request.
      return res.status(200).json({ accessToken: newAccessToken });
    }

    // Normal rotation: generate new tokens, set grace window on current session
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    const newHash = hashToken(newRefreshToken);

    session.prevHash   = session.hash;
    session.hash       = newHash;
    session.issuedAt   = new Date();
    session.graceUntil = new Date(Date.now() + GRACE_SECONDS * 1000);
    await user.save();

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      const user = await User.findOne({
        'sessions.hash': hashed,
      });
      if (user) {
        // Remove only the matching session slot (device-specific logout)
        user.sessions = user.sessions.filter((s) => s.hash !== hashed);
        await user.save();
      }
    }

    res.clearCookie('refreshToken', COOKIE_OPTIONS);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    return res.status(500).json({ error: 'Logout failed' });
  }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};
