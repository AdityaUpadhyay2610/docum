import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.models.js';
import { validateAuthInput } from '../utils/validation.js';
import { penaliseFailedLogin, clearLoginBuckets } from '../middleware/tokenBucketGuard.middleware.js';
import config from '../config/config.js';

// JWT secrets and lifetimes come from the central config module.
// config.js throws at startup if either secret is missing, so no guard needed here.

// Cookie configuration for maximum security (HttpOnly + SameSite + Secure in production)
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
    },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  );
};

// Helper to verify Google ID token via Google OAuth tokeninfo endpoint
const verifyGoogleToken = async (credential) => {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) {
      throw new Error('Invalid or expired Google authentication token');
    }
    const payload = await res.json();
    if (!payload.email || !payload.email_verified) {
      throw new Error('Google account email is not verified');
    }
    return payload;
  } catch (err) {
    throw new Error(err.message || 'Failed to verify Google token');
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

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    // Set secure HttpOnly cookie for refresh token (NEVER exposed to client JS)
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    if (error.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to register account' });
  }
};

// POST /api/auth/google (Continue with Google + Password Security)
export const googleAuth = async (req, res) => {
  try {
    const { credential, password, confirmPassword } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google authentication credential is required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required to secure your account' });
    }

    // Verify Google ID token
    const googleUser = await verifyGoogleToken(credential);
    const googleEmail = googleUser.email.trim().toLowerCase();
    const googleName = googleUser.name || googleEmail.split('@')[0];
    const googleSub = googleUser.sub;
    const googlePicture = googleUser.picture || null;

    let user = await User.findOne({ email: googleEmail });

    if (user) {
      // Existing account: verify app password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        if (req._tokenBucket) penaliseFailedLogin(req._tokenBucket.ip, googleEmail);
        return res.status(401).json({
          error: 'Incorrect password for this account. Please enter your valid app password.',
          isExistingUser: true,
        });
      }

      // Link googleId if missing
      if (!user.googleId) {
        user.googleId = googleSub;
        if (!user.avatar && googlePicture) user.avatar = googlePicture;
        await user.save();
      }

      if (req._tokenBucket) clearLoginBuckets(req._tokenBucket.ip, googleEmail);
    } else {
      // New user registering with Google: validate password strength and confirm match
      const { errors } = validateAuthInput(
        { name: googleName, email: googleEmail, password, confirmPassword },
        { requireName: false, requireConfirm: true }
      );
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: 'Please correct the highlighted fields', fields: errors });
      }

      // Hash password with 12 salt rounds
      const hashedPassword = await bcrypt.hash(password, 12);

      user = new User({
        name: googleName,
        email: googleEmail,
        password: hashedPassword,
        googleId: googleSub,
        avatar: googlePicture,
        authProvider: 'google',
      });
      await user.save();
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Google authentication successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: error.message || 'Google authentication failed' });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { errors, normalizedEmail } = validateAuthInput({ email, password });
    if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Please provide a valid email and password', fields: errors });
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Penalise even on unknown email – don't reveal whether account exists
      if (req._tokenBucket) penaliseFailedLogin(req._tokenBucket.ip, normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Drain extra tokens from all three buckets (escalating penalty)
      if (req._tokenBucket) penaliseFailedLogin(req._tokenBucket.ip, normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Successful login – reset token buckets so the user isn't penalised further
    if (req._tokenBucket) clearLoginBuckets(req._tokenBucket.ip, normalizedEmail);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    // Set secure HttpOnly cookie for refresh token (NEVER exposed to client JS)
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to log in' });
  }
};

// POST /api/auth/refresh (Generate new access token using HttpOnly cookie ONLY)
// NOTE: req.body.refreshToken is intentionally NOT accepted.
// Refresh tokens must only be transmitted via the secure HttpOnly cookie.
// This prevents non-browser clients (Postman, curl) from reusing a stolen refresh token.
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
      // Distinguish expired cookie vs tampered token
      const code = err.name === 'TokenExpiredError' ? 'REFRESH_TOKEN_EXPIRED' : 'SESSION_REVOKED';
      return res.status(401).json({ error: 'Your session has expired. Please log in again.', code });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken) {
      // Token was valid but not in DB – possible token reuse / account tampered
      res.clearCookie('refreshToken', COOKIE_OPTIONS);
      return res.status(401).json({ error: 'Session is no longer valid. Please log in again.', code: 'SESSION_REVOKED' });
    }

    // Generate new access token (valid for 10m) and rotate refresh token
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshToken = newRefreshToken;
    await user.save();

    // Update the HttpOnly cookie with rotated refresh token
    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
      await User.findOneAndUpdate({ refreshToken }, { $set: { refreshToken: null } });
    }
    // Clear the HttpOnly cookie
    res.clearCookie('refreshToken', COOKIE_OPTIONS);

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
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
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};
