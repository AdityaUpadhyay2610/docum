import { body } from 'express-validator';

// ─── Allowed value sets ───────────────────────────────────────────────────────

const ALLOWED_FIELDS = new Set([
  '_id', 'title', 'icon', 'coverImage', 'content',
  'isEncrypted', 'revision',
  'encTitle', 'encIcon', 'encContent', 'encDek',
]);

const BLOCK_TYPES = new Set([
  'paragraph', 'h1', 'h2', 'h3', 'heading',
  'bullet', 'numbered', 'todo',
  'quote', 'callout', 'code',
  'divider', 'table', 'board',
]);

const ALLOWED_STYLE_KEYS = new Set([
  'fontFamily', 'fontSize', 'color', 'backgroundColor',
  'bold', 'italic', 'underline', 'strikethrough',
  'textAlign', 'lineHeight',
]);

const FONT_SIZE_RE = /^([8-9]|[1-9][0-9]|1[0-1][0-9]|120)px$/;
const COLOR_RE = /^(#([0-9a-fA-F]{3,8})|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)|transparent)$/i;
const TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const CALLOUT_TYPES = new Set(['info', 'warning', 'success', 'error', 'tip']);

// ─── Field validators ─────────────────────────────────────────────────────────

/** Reject any top-level field that is not in the allowed set. */
const documentFields = body().custom((value) => {
  const unknownField = Object.keys(value || {}).find((field) => !ALLOWED_FIELDS.has(field));
  if (unknownField) throw new Error(`"${unknownField}" is not an allowed document field`);
  return true;
});

const title = body('title')
  .optional({ nullable: true })
  .custom((val, { req }) => {
    if (req.body?.isEncrypted) return true;
    if (typeof val !== 'string') throw new Error('Title must be a string');
    if (val.trim().length < 1 || val.trim().length > 200) {
      throw new Error('Title must be between 1 and 200 characters');
    }
    return true;
  });

const icon = body('icon')
  .optional({ nullable: true })
  .isString().withMessage('Icon must be a string').bail()
  .isLength({ max: 20 }).withMessage('Icon must not exceed 20 characters');

const coverImage = body('coverImage')
  .optional({ nullable: true })
  .isString().withMessage('Cover image must be a string').bail()
  .isLength({ max: 500 }).withMessage('Cover image reference cannot exceed 500 characters');

const content = body('content')
  .optional({ nullable: true })
  .custom((blocks, { req }) => {
    if (req.body?.isEncrypted) return true;
    if (!blocks) return true;
    if (!Array.isArray(blocks)) throw new Error('Content must be an array');
    if (blocks.length > 500) throw new Error('Content must be an array with at most 500 blocks');
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        throw new Error(`content[${i}] must be an object`);
      }
      if (typeof block.id !== 'string' || block.id.length < 1 || block.id.length > 100) {
        throw new Error(`content[${i}].id is invalid (must be 1–100 characters)`);
      }
      if (!BLOCK_TYPES.has(block.type)) {
        throw new Error(`content[${i}].type "${block.type}" is not a valid block type`);
      }
      if (block.text !== undefined && (typeof block.text !== 'string' || block.text.length > 100_000)) {
        throw new Error(`content[${i}].text must be a string under 100,000 characters`);
      }
      if (block.type === 'todo' && block.checked !== undefined && typeof block.checked !== 'boolean') {
        throw new Error(`content[${i}].checked must be a boolean`);
      }
      if (block.type === 'callout' && block.calloutType !== undefined && !CALLOUT_TYPES.has(block.calloutType)) {
        throw new Error(`content[${i}].calloutType "${block.calloutType}" is not allowed`);
      }
      if (block.style !== undefined) {
        if (!block.style || typeof block.style !== 'object' || Array.isArray(block.style)) {
          throw new Error(`content[${i}].style must be an object`);
        }
        const unknownKey = Object.keys(block.style).find((k) => !ALLOWED_STYLE_KEYS.has(k));
        if (unknownKey) throw new Error(`content[${i}].style has unknown key "${unknownKey}"`);
        if (block.style.fontFamily !== undefined && (typeof block.style.fontFamily !== 'string' || block.style.fontFamily.length > 100)) {
          throw new Error(`content[${i}].style.fontFamily is invalid`);
        }
        if (block.style.fontSize !== undefined && !FONT_SIZE_RE.test(block.style.fontSize)) {
          throw new Error(`content[${i}].style.fontSize must be a valid pixel size (8px–120px)`);
        }
        if (block.style.color !== undefined && !COLOR_RE.test(block.style.color)) {
          throw new Error(`content[${i}].style.color must be a valid hex/rgb color`);
        }
        if (block.style.backgroundColor !== undefined && !COLOR_RE.test(block.style.backgroundColor)) {
          throw new Error(`content[${i}].style.backgroundColor must be a valid color or "transparent"`);
        }
        for (const boolKey of ['bold', 'italic', 'underline', 'strikethrough']) {
          if (block.style[boolKey] !== undefined && typeof block.style[boolKey] !== 'boolean') {
            throw new Error(`content[${i}].style.${boolKey} must be a boolean`);
          }
        }
        if (block.style.textAlign !== undefined && !TEXT_ALIGNS.has(block.style.textAlign)) {
          throw new Error(`content[${i}].style.textAlign must be "left", "center", "right", or "justify"`);
        }
        if (block.style.lineHeight !== undefined && (typeof block.style.lineHeight !== 'string' || block.style.lineHeight.length > 10)) {
          throw new Error(`content[${i}].style.lineHeight is invalid`);
        }
      }
    }
    return true;
  });

const BASE64_RE = /^[A-Za-z0-9+/\-_]+=*$/;
const MAX_IV_LEN = 64;
const MAX_VERSION_LEN = 16;
const MAX_CT_TITLE_LEN = 2048;
const MAX_CT_ICON_LEN = 512;
const MAX_CT_CONTENT_LEN = 5242880;
const MAX_WRAPPED_DEK_LEN = 256;
const MAX_DEK_IV_LEN = 64;

const encTitle = body('encTitle')
  .optional({ nullable: true })
  .custom((val, { req }) => {
    if (!req.body?.isEncrypted) return true;
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      throw new Error('encTitle must be an object');
    }
    if (typeof val.v !== 'string' || typeof val.iv !== 'string' || typeof val.ct !== 'string') {
      throw new Error('encTitle must contain { v, iv, ct } strings');
    }
    if (val.v.length > MAX_VERSION_LEN) throw new Error(`encTitle.v exceeds max length (${MAX_VERSION_LEN})`);
    if (val.iv.length > MAX_IV_LEN) throw new Error(`encTitle.iv exceeds max length (${MAX_IV_LEN})`);
    if (val.ct.length > MAX_CT_TITLE_LEN) throw new Error(`encTitle.ct exceeds max length (${MAX_CT_TITLE_LEN})`);
    if (!BASE64_RE.test(val.iv)) throw new Error('encTitle.iv must be valid base64');
    if (!BASE64_RE.test(val.ct)) throw new Error('encTitle.ct must be valid base64');
    return true;
  });

const encContent = body('encContent')
  .optional({ nullable: true })
  .custom((val, { req }) => {
    if (!req.body?.isEncrypted) return true;
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      throw new Error('encContent must be an object');
    }
    if (typeof val.v !== 'string' || typeof val.iv !== 'string' || typeof val.ct !== 'string') {
      throw new Error('encContent must contain { v, iv, ct } strings');
    }
    if (val.v.length > MAX_VERSION_LEN) throw new Error(`encContent.v exceeds max length (${MAX_VERSION_LEN})`);
    if (val.iv.length > MAX_IV_LEN) throw new Error(`encContent.iv exceeds max length (${MAX_IV_LEN})`);
    if (val.ct.length > MAX_CT_CONTENT_LEN) throw new Error(`encContent.ct exceeds max length (${MAX_CT_CONTENT_LEN})`);
    if (!BASE64_RE.test(val.iv)) throw new Error('encContent.iv must be valid base64');
    if (!BASE64_RE.test(val.ct)) throw new Error('encContent.ct must be valid base64');
    return true;
  });

const encIcon = body('encIcon')
  .optional({ nullable: true })
  .custom((val, { req }) => {
    if (!req.body?.isEncrypted || !val) return true;
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error('encIcon must be an object');
    }
    if (typeof val.v !== 'string' || typeof val.iv !== 'string' || typeof val.ct !== 'string') {
      throw new Error('encIcon must contain { v, iv, ct } strings');
    }
    if (val.v.length > MAX_VERSION_LEN) throw new Error(`encIcon.v exceeds max length (${MAX_VERSION_LEN})`);
    if (val.iv.length > MAX_IV_LEN) throw new Error(`encIcon.iv exceeds max length (${MAX_IV_LEN})`);
    if (val.ct.length > MAX_CT_ICON_LEN) throw new Error(`encIcon.ct exceeds max length (${MAX_CT_ICON_LEN})`);
    if (!BASE64_RE.test(val.iv)) throw new Error('encIcon.iv must be valid base64');
    if (!BASE64_RE.test(val.ct)) throw new Error('encIcon.ct must be valid base64');
    return true;
  });

const encDek = body('encDek')
  .optional({ nullable: true })
  .custom((val, { req }) => {
    if (!req.body?.isEncrypted) return true;
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      throw new Error('encDek must be an object');
    }
    if (typeof val.wrappedDek !== 'string' || typeof val.dekIv !== 'string') {
      throw new Error('encDek must contain { wrappedDek, dekIv } strings');
    }
    if (val.wrappedDek.length > MAX_WRAPPED_DEK_LEN) throw new Error(`encDek.wrappedDek exceeds max length (${MAX_WRAPPED_DEK_LEN})`);
    if (val.dekIv.length > MAX_DEK_IV_LEN) throw new Error(`encDek.dekIv exceeds max length (${MAX_DEK_IV_LEN})`);
    if (!BASE64_RE.test(val.wrappedDek)) throw new Error('encDek.wrappedDek must be valid base64');
    if (!BASE64_RE.test(val.dekIv)) throw new Error('encDek.dekIv must be valid base64');
    return true;
  });

// ─── Validator chains ─────────────────────────────────────────────────────────

export const createDocumentValidator = [
  documentFields,
  title,
  icon,
  coverImage,
  content,
  encTitle,
  encIcon,
  encContent,
  encDek,
];

export const updateDocumentValidator = [
  documentFields,
  title,
  icon,
  coverImage,
  content,
  encTitle,
  encIcon,
  encContent,
  encDek,
];