import mongoose from 'mongoose';

/**
 * Per-device session sub-document.
 *
 * Each login or Google sign-in creates one session slot (up to MAX_SESSIONS).
 * When the limit is reached the oldest session is evicted.
 *
 * Fields:
 *   hash       – SHA-256 of the current refresh token for this slot
 *   family     – UUID shared across rotations; used to detect token reuse
 *   deviceHint – Optional user-agent / IP fragment stored for display (not auth)
 *   issuedAt   – When this slot was last refreshed
 *   graceUntil – If set, the PREVIOUS hash is accepted until this timestamp
 *                (prevents dual-tab logouts when both tabs race to refresh)
 *   prevHash   – The hash accepted during the grace window
 */
const sessionSchema = new mongoose.Schema(
  {
    hash:       { type: String, required: true },
    family:     { type: String, required: true },
    deviceHint: { type: String, default: '' },
    issuedAt:   { type: Date,   default: Date.now },
    graceUntil: { type: Date,   default: null },
    prevHash:   { type: String, default: null },
  },
  { _id: true }
);

// Maximum concurrent sessions per user (one per browser/device)
const MAX_SESSIONS = 10;

// ── Vault Subdocument Schemas ─────────────────────────────────────────────────

const vaultBackupSchema = new mongoose.Schema(
  {
    salt:                 { type: String, required: true },
    kdfParams:            { type: mongoose.Schema.Types.Mixed, required: true },
    wrappedMasterKey:     { type: String, required: true },
    wrappedMasterKeyIv:   { type: String, required: true },
    recoveryWrappedKey:   { type: String, required: true },
    recoveryWrappedKeyIv: { type: String, required: true },
    replacedAt:           { type: Date, default: Date.now },
  },
  { _id: false }
);

const vaultSchema = new mongoose.Schema(
  {
    isVaultEnabled:       { type: Boolean, default: false },
    salt:                 { type: String, default: null },
    kdfParams:            { type: mongoose.Schema.Types.Mixed, default: null },
    wrappedMasterKey:     { type: String, default: null },
    wrappedMasterKeyIv:   { type: String, default: null },
    recoveryWrappedKey:   { type: String, default: null },
    recoveryWrappedKeyIv: { type: String, default: null },
    setupAt:              { type: Date, default: null },
    updatedAt:            { type: Date, default: null },
    previousKeys:         { type: [vaultBackupSchema], default: [] },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email cannot exceed 254 characters'],
      match: [/\S+@\S+\.\S+/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      default: null,
      minlength: [8, 'Password must be at least 8 characters'],
      maxlength: [128, 'Password cannot exceed 128 characters'],
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },

    // ── Per-device sessions ─────────────────────────────────────────────────────
    // Replaces the single refreshTokenHash / refreshTokenFamily fields.
    // Each login creates a new slot; MAX_SESSIONS slots per user.
    sessions: {
      type: [sessionSchema],
      default: [],
    },

    // ── Legacy single-session fields (kept for safe migration, not used by new code) ──
    // Remove these after one deploy cycle once all tokens have rotated.
    refreshTokenHash:   { type: String, default: null },
    refreshTokenFamily: { type: String, default: null },

    // ── E2EE Vault Metadata ─────────────────────────────────────────────────────
    vault: {
      type: vaultSchema,
      default: () => ({ isVaultEnabled: false }),
    },
  },
  {
    timestamps: true,
  }
);

// ── Static helpers ──────────────────────────────────────────────────────────────

/**
 * Add a new session slot for a user, evicting the oldest if MAX_SESSIONS is reached.
 * Call this after generating a new refresh token.
 *
 * @param {mongoose.Document} user
 * @param {{ hash: string, family: string, deviceHint?: string }} opts
 */
userSchema.statics.addSession = function (user, { hash, family, deviceHint = '' }) {
  user.sessions.push({ hash, family, deviceHint, issuedAt: new Date() });
  if (user.sessions.length > MAX_SESSIONS) {
    // Evict oldest
    user.sessions.splice(0, user.sessions.length - MAX_SESSIONS);
  }
};

/**
 * Find the session slot matching either the current hash or the grace-window prevHash.
 *
 * @param {mongoose.Document} user
 * @param {string} incomingHash – SHA-256 of the incoming refresh token
 * @returns {{ session: object|null, isGrace: boolean }}
 */
userSchema.statics.findSession = function (user, incomingHash) {
  const now = new Date();
  for (const session of user.sessions) {
    if (session.hash === incomingHash) {
      return { session, isGrace: false };
    }
    // Grace window: accept the previous hash for up to GRACE_SECONDS after rotation
    if (
      session.prevHash === incomingHash &&
      session.graceUntil &&
      session.graceUntil > now
    ) {
      return { session, isGrace: true };
    }
  }
  return { session: null, isGrace: false };
};

// ── Serialization guard ────────────────────────────────────────────────────────

// Remove sensitive fields from serialized outputs
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.sessions;
  delete userObject.refreshTokenHash;
  delete userObject.refreshTokenFamily;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  userObject.isVaultEnabled = this.vault?.isVaultEnabled || false;
  delete userObject.vault;
  return userObject;
};

export default mongoose.model('User', userSchema);
