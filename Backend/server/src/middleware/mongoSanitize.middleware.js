/**
 * Mongo Sanitize Middleware
 *
 * Protects against NoSQL injection by detecting and rejecting keys
 * containing '$' (MongoDB query operators) or '.' (dotted path notation).
 */

function hasProhibitedKey(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (hasProhibitedKey(item)) {
        return true;
      }
    }
    return false;
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (hasProhibitedKey(obj[key])) {
      return true;
    }
  }

  return false;
}

export const mongoSanitize = (req, res, next) => {
  if (req.body && hasProhibitedKey(req.body)) {
    return res.status(400).json({
      error: 'Invalid input: keys containing "$" or "." are not allowed.',
    });
  }

  if (req.query && hasProhibitedKey(req.query)) {
    return res.status(400).json({
      error: 'Invalid query: keys containing "$" or "." are not allowed.',
    });
  }

  if (req.params && hasProhibitedKey(req.params)) {
    return res.status(400).json({
      error: 'Invalid parameters: keys containing "$" or "." are not allowed.',
    });
  }

  return next();
};

export default mongoSanitize;
