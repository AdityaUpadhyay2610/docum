/**
 * Email Service
 *
 * Sends transactional emails (verification, etc.) via SMTP / Nodemailer.
 *
 * Configuration (all optional at startup; the service degrades gracefully):
 *   EMAIL_HOST        – SMTP host          (e.g. smtp.resend.com)
 *   EMAIL_PORT        – SMTP port          (default 587)
 *   EMAIL_SECURE      – "true" for port 465 / implicit TLS (default false)
 *   EMAIL_USER        – SMTP auth username (e.g. "resend" for Resend)
 *   EMAIL_PASS        – SMTP auth password / API key
 *   EMAIL_FROM        – Sender address     (e.g. "noreply@yourdomain.com")
 *   CLIENT_URL        – Used to build the verification link in the email body
 *
 * To use Resend (recommended):
 *   EMAIL_HOST=smtp.resend.com
 *   EMAIL_PORT=587
 *   EMAIL_USER=resend
 *   EMAIL_PASS=re_YOUR_RESEND_API_KEY
 *   EMAIL_FROM=noreply@yourdomain.com
 *
 * To use Gmail (dev / small scale):
 *   EMAIL_HOST=smtp.gmail.com
 *   EMAIL_PORT=587
 *   EMAIL_USER=your@gmail.com
 *   EMAIL_PASS=your_app_password    # Google "App Password", NOT your account password
 *   EMAIL_FROM=your@gmail.com
 *
 * SECURITY RULES:
 *   - The raw verification token is ONLY passed to this service; it is NEVER
 *     returned in any API response body.
 *   - If SMTP is not configured the service logs a warning and skips sending.
 *     In production you should always configure SMTP – the missing email would
 *     leave accounts permanently unverifiable.
 */

import nodemailer from 'nodemailer';
import config from '../config/config.js';

/**
 * Build a Nodemailer transport from env vars.
 * Returns null if EMAIL_HOST / EMAIL_PASS are not configured.
 */
function createTransport() {
  const host = process.env.EMAIL_HOST;
  const pass = process.env.EMAIL_PASS;

  if (!host || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true', // true = port 465 implicit TLS
    auth: {
      user: process.env.EMAIL_USER || '',
      pass,
    },
  });
}

/**
 * Send an email verification link to a newly registered user.
 *
 * @param {object} params
 * @param {string} params.to        – Recipient email address
 * @param {string} params.name      – Recipient display name
 * @param {string} params.rawToken  – Raw (unhashed) verification token
 *
 * @returns {Promise<void>}  Resolves when the email is queued; rejects on SMTP error.
 */
export async function sendVerificationEmail({ to, name, rawToken }) {
  const transport = createTransport();

  if (!transport) {
    // Log a clear warning so operators know email is not going out.
    console.warn(
      '[EmailService] ⚠️  SMTP is not configured (EMAIL_HOST / EMAIL_PASS missing). ' +
      `Verification email NOT sent to ${to}. ` +
      'Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM in your environment.'
    );
    return; // Degrade gracefully – do not throw; registration still succeeds
  }

  // HTML-escape the display name to prevent any XSS if a malicious name is stored
  const safeName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // Build the verification link: the raw token goes in the URL, not the response body
  const baseUrl = config.clientUrl
    ? config.clientUrl.split(',')[0].trim() // use first allowed origin
    : 'http://localhost:5173';

  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@example.com';

  await transport.sendMail({
    from: `"Document Workshops" <${from}>`,
    to,
    subject: 'Verify your email address – Document Workshops',
    text: [
      `Hi ${name},`,
      '',
      'Thanks for registering! Please verify your email address by visiting the link below.',
      'The link is valid for 24 hours.',
      '',
      verifyUrl,
      '',
      'If you did not create an account, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi ${safeName},</p>
      <p>Thanks for registering! Please verify your email address by clicking the button below.</p>
      <p>The link is valid for <strong>24 hours</strong>.</p>
      <p style="margin:24px 0">
        <a href="${verifyUrl}"
           style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:600;display:inline-block">
          Verify Email
        </a>
      </p>
      <p>Or copy and paste this URL into your browser:</p>
      <p style="word-break:break-all;color:#6b7280;font-size:13px">${verifyUrl}</p>
      <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb"/>
      <p style="color:#9ca3af;font-size:12px">
        If you did not create a Document Workshops account, you can safely ignore this email.
      </p>
    `,
  });

  console.info(`[EmailService] Verification email sent to ${to}`);
}
