import jwt from 'jsonwebtoken';
import config from '../config/config.js';

/**
 * Auth Middleware – verifies the Bearer access token on every protected route.
 *
 * Returns precise error codes so the frontend can distinguish:
 *
 *  TOKEN_EXPIRED      → access token is valid but past its `exp` claim.
 *                       The client SHOULD attempt a silent refresh and replay.
 *
 *  INVALID_TOKEN      → token is malformed, tampered with, or signed with a
 *                       different secret. The client MUST clear session and
 *                       redirect to login.
 *
 *  TOKEN_MISSING      → no Authorization header / Bearer token present.
 */
export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authorization token required',
        code:  'TOKEN_MISSING',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: 'Authentication token missing',
        code:  'TOKEN_MISSING',
      });
    }

    const decoded = jwt.verify(token, config.jwtAccessSecret);
    req.user = {
      userId: decoded.userId,
      email:  decoded.email,
      name:   decoded.name,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // Access token has expired – client should silently refresh, NOT logout
      return res.status(401).json({
        error: 'Access token expired',
        code:  'TOKEN_EXPIRED',
      });
    }
    // Anything else (JsonWebTokenError, NotBeforeError, etc.) = credential mismatch
    return res.status(401).json({
      error: 'Invalid authentication token',
      code:  'INVALID_TOKEN',
    });
  }
};

export default authMiddleware;
