/**
 * passphrase.js – Vault passphrase strength enforcement
 *
 * The vault passphrase is DIFFERENT from the login password.
 * It is never sent to the server. We cannot recover it.
 *
 * Uses zxcvbn for realistic password strength evaluation.
 * Requirement: Minimum length 12 AND score >= 3.
 */

import zxcvbn from 'zxcvbn';

// ── Score ─────────────────────────────────────────────────────────────────────

const LABELS = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

/**
 * Score the passphrase strength using zxcvbn.
 *
 * @param {string} passphrase
 * @returns {{ score: number, label: string, reasons: string[], feedback: object }}
 */
export function scorePassphrase(passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    return {
      score: 0,
      label: 'Very Weak',
      reasons: ['Passphrase is required'],
      feedback: { warning: 'Passphrase is required', suggestions: [] },
    };
  }

  const result = zxcvbn(passphrase);
  const reasons = [];

  if (passphrase.length < 12) {
    reasons.push('Must be at least 12 characters');
  }

  if (result.feedback?.warning) {
    reasons.push(result.feedback.warning);
  }
  if (result.feedback?.suggestions?.length) {
    reasons.push(...result.feedback.suggestions);
  }

  return {
    score: result.score,
    label: LABELS[result.score] || 'Very Weak',
    reasons,
    feedback: result.feedback,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a vault passphrase.
 * Requires minimum length 12 AND score >= 3.
 * Returns consistent shape: { valid: boolean, score: number, reason?: string }
 *
 * @param {string} passphrase
 * @returns {{ valid: boolean, score: number, reason: string | null, error?: string }}
 */
export function validatePassphrase(passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    return {
      valid: false,
      score: 0,
      reason: 'Passphrase is required',
      error: 'Passphrase is required',
    };
  }

  if (passphrase.length < 12) {
    return {
      valid: false,
      score: 0,
      reason: 'Passphrase must be at least 12 characters',
      error: 'Passphrase must be at least 12 characters',
    };
  }

  const { score, reasons } = scorePassphrase(passphrase);

  if (score < 3) {
    const reasonText = reasons[0] || 'Passphrase is too weak. Please use a longer or less predictable passphrase.';
    return {
      valid: false,
      score,
      reason: reasonText,
      error: reasonText,
    };
  }

  return {
    valid: true,
    score,
    reason: null,
  };
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
  const safeScore = Math.max(0, Math.min(4, score || 0));
  return {
    colour: SCORE_COLOURS[safeScore] || SCORE_COLOURS[0],
    width:  SCORE_WIDTHS[safeScore]  || SCORE_WIDTHS[0],
  };
}
