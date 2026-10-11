import mongoose from 'mongoose';

// ─── Allowed value sets ───────────────────────────────────────────────────────

const ALLOWED_BLOCK_TYPES = [
  'paragraph', 'h1', 'h2', 'h3', 'heading',
  'bullet', 'numbered', 'todo',
  'quote', 'callout', 'code',
  'divider', 'table', 'board', 'page-break',
];

const ALLOWED_CALLOUT_TYPES = ['info', 'warning', 'success', 'error'];

const ALLOWED_FONT_FAMILIES = [
  'Calibri', 'Aptos', 'Arial', 'Georgia', 'Inter',
  'Times New Roman', 'Courier New', 'Verdana', 'Roboto', 'monospace', 'inherit'
];
const ALLOWED_FONT_SIZES = [
  '8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px', '72px'
];

// ─── Block subdocument validator ──────────────────────────────────────────────

/**
 * Validates a single content block object.
 * Returns an error string on failure, or null on success.
 */
const validateBlock = (block, index) => {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return `content[${index}] must be an object`;
  }
  if (typeof block.id !== 'string' || block.id.length < 1 || block.id.length > 100) {
    return `content[${index}].id is invalid (must be 1–100 chars)`;
  }
  if (!ALLOWED_BLOCK_TYPES.includes(block.type)) {
    return `content[${index}].type "${block.type}" is not allowed`;
  }
  if (block.text !== undefined) {
    if (typeof block.text !== 'string') return `content[${index}].text must be a string`;
    if (block.text.length > 100_000) return `content[${index}].text exceeds 100,000 characters`;
  }
  if (block.type === 'todo' && block.checked !== undefined && typeof block.checked !== 'boolean') {
    return `content[${index}].checked must be a boolean`;
  }
  if (block.type === 'callout' && block.calloutType !== undefined) {
    if (!ALLOWED_CALLOUT_TYPES.includes(block.calloutType)) {
      return `content[${index}].calloutType "${block.calloutType}" is not allowed`;
    }
  }
  if (block.style !== undefined) {
    if (!block.style || typeof block.style !== 'object' || Array.isArray(block.style)) {
      return `content[${index}].style must be an object`;
    }
    const ALLOWED_STYLE_KEYS = new Set([
      'fontFamily', 'fontSize', 'color', 'backgroundColor',
      'bold', 'italic', 'underline', 'strikethrough',
      'textAlign', 'lineHeight',
    ]);
    const unknownKey = Object.keys(block.style).find((k) => !ALLOWED_STYLE_KEYS.has(k));
    if (unknownKey) return `content[${index}].style has unknown key "${unknownKey}"`;
    if (block.style.fontFamily !== undefined && !ALLOWED_FONT_FAMILIES.includes(block.style.fontFamily)) {
      return `content[${index}].style.fontFamily "${block.style.fontFamily}" is not allowed`;
    }
    if (block.style.fontSize !== undefined && !ALLOWED_FONT_SIZES.includes(block.style.fontSize)) {
      return `content[${index}].style.fontSize "${block.style.fontSize}" is not allowed`;
    }
    if (block.style.color !== undefined && !/^#[0-9a-fA-F]{3,6}$/.test(block.style.color)) {
      return `content[${index}].style.color must be a valid hex color`;
    }
    if (block.style.backgroundColor !== undefined && !/^(#[0-9a-fA-F]{3,6}|transparent)$/.test(block.style.backgroundColor)) {
      return `content[${index}].style.backgroundColor must be a valid hex color or "transparent"`;
    }
    for (const boolKey of ['bold', 'italic', 'underline', 'strikethrough']) {
      if (block.style[boolKey] !== undefined && typeof block.style[boolKey] !== 'boolean') {
        return `content[${index}].style.${boolKey} must be a boolean`;
      }
    }
    if (block.style.textAlign !== undefined && !['left', 'center', 'right', 'justify'].includes(block.style.textAlign)) {
      return `content[${index}].style.textAlign must be left, center, right, or justify`;
    }
  }
  return null;
};

const encryptedFieldSchema = new mongoose.Schema(
  {
    v:  { type: String, default: null },
    iv: { type: String, default: null },
    ct: { type: String, default: null },
  },
  { _id: false }
);

const encryptedDekSchema = new mongoose.Schema(
  {
    wrappedDek: { type: String, default: null },
    dekIv:      { type: String, default: null },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Document must belong to a user'],
      index: true,
    },
    // Explicit integer revision counter for optimistic concurrency (ETag)
    revision: {
      type: Number,
      default: 0,
      required: true,
    },
    // Flag indicating whether document sensitive fields are encrypted client-side
    isEncrypted: {
      type: Boolean,
      default: false,
      index: true,
    },
    // ── Encrypted envelope fields (stored opaque in DB) ──────────────────────
    encTitle:   { type: encryptedFieldSchema, default: null },
    encIcon:    { type: encryptedFieldSchema, default: null },
    encContent: { type: encryptedFieldSchema, default: null },
    encDek:     { type: encryptedDekSchema,   default: null },

    // ── Plaintext fields (used for non-vault users or placeholder metadata) ───
    title: {
      type: String,
      default: 'Untitled',
      trim: true,
      validate: {
        validator: function (v) {
          if (this.isEncrypted) return true;
          return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 200;
        },
        message: 'Title must be between 1 and 200 characters',
      },
    },
    icon: {
      type: String,
      default: '📝',
      maxlength: [20, 'Icon must be a short string (max 20 chars)'],
      validate: {
        validator: (v) => typeof v === 'string',
        message: 'Icon must be a string',
      },
    },
    coverImage: {
      type: String,
      default: '',
      maxlength: [500, 'Cover image reference cannot exceed 500 characters'],
      validate: {
        validator: (v) => typeof v === 'string',
        message: 'Cover image must be a string',
      },
    },
    content: {
      type: Array,
      default: [],
      validate: [
        {
          validator: function (value) {
            if (this.isEncrypted) return true;
            return Array.isArray(value) && value.length <= 500;
          },
          message: 'Document content cannot contain more than 500 blocks',
        },
        {
          validator: function (value) {
            if (this.isEncrypted) return true;
            if (!Array.isArray(value)) return false;
            return value.every((block, i) => validateBlock(block, i) === null);
          },
          message: function (props) {
            const blockError = props.value
              .map((block, i) => validateBlock(block, i))
              .find(Boolean);
            return blockError || 'Content contains an invalid block';
          },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Compound Indexes (also defined in db.indexes.js for explicit management) ─

documentSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('Document', documentSchema);