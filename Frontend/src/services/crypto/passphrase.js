/**
 * passphrase.js – Vault passphrase strength enforcement
 *
 * The vault passphrase is DIFFERENT from the login password.
 * It is never sent to the server.  We cannot recover it.
 *
 * Strength rules (minimum bar for Argon2id / PBKDF2 to be meaningful):
 *   • At least 12 characters
 *   • Entropy estimate ≥ 40 bits (rough Shannon entropy)
 *   • Not a simple pattern (all same char, sequential digits, etc.)
 *   • Not the string "password" or trivially guessable
 *
 * Strength levels:  0 = very weak,  1 = weak,  2 = fair,  3 = strong,  4 = very strong
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Estimate Shannon entropy in bits for the passphrase. */
function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((acc, f) => {
    const p = f / len;
    return acc + p * Math.log2(p);
  }, 0) * len;
}

const TRIVIAL_PATTERNS = [
  /^(.)\1+$/,                    // all same character: aaaaaaaaaa
  /^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|qwerty|asdf)/i,
  /^(password|passphrase|vaultkey|secret|letmein|admin|master)/i,
];

// ── Score ─────────────────────────────────────────────────────────────────────

/**
 * Score the passphrase strength.
 *
 * @param {string} passphrase
 * @returns {{ score: number, label: string, entropy: number, reasons: string[] }}
 *   score: 0–4
 */
export function scorePassphrase(passphrase) {
  const reasons = [];
  let score     = 0;

  if (!passphrase || typeof passphrase !== 'string') {
    return { score: 0, label: 'Very Weak', entropy: 0, reasons: ['Passphrase is required'] };
  }

  const len     = passphrase.length;
  const entropy = shannonEntropy(passphrase);

  // Length checks
  if (len < 12)  reasons.push('Must be at least 12 characters');
  else if (len >= 12) score += 1;
  if (len >= 16) score += 1;
  if (len >= 24) score += 1;

  // Entropy check
  if (entropy < 40) reasons.push('Too predictable – add more varied characters');
  else              score += 1;

  // Pattern checks
  for (const re of TRIVIAL_PATTERNS) {
    if (re.test(passphrase)) {
      reasons.push('Avoid obvious patterns or common words');
      score = Math.max(0, score - 2);
      break;
    }
  }

  const clamped = Math.min(4, Math.max(0, score));
  const labels  = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  return { score: clamped, label: labels[clamped], entropy, reasons };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a vault passphrase.
 *
 * @param {string} passphrase
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePassphrase(passphrase) {
  const { score, reasons } = scorePassphrase(passphrase);

  if (score < 2) {
    return {
      valid: false,
      error: reasons[0] || 'Passphrase is too weak. Use at least 12 varied characters.',
    };
  }

  return { valid: true };
}

// ── UI colour helper ──────────────────────────────────────────────────────────

const SCORE_COLOURS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
const SCORE_WIDTHS  = ['10%', '25%', '50%', '75%', '100%'];

/**
 * Return display properties for a strength indicator bar.
 * @param {number} score - 0..4
 * @returns {{ colour: string, width: string }}
 */
export function strengthBarProps(score) {
  return {
    colour: SCORE_COLOURS[score] || SCORE_COLOURS[0],
    width:  SCORE_WIDTHS[score]  || SCORE_WIDTHS[0],
  };
}
