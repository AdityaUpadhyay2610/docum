// ─── Constants ────────────────────────────────────────────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DOCUMENT_BLOCK_TYPES = new Set([
  'paragraph', 'h1', 'h2', 'h3', 'heading',
  'bullet', 'numbered', 'todo',
  'quote', 'callout', 'code',
  'divider', 'table', 'board',
]);

const BLOCK_STYLE_KEYS = new Set([
  'fontFamily', 'fontSize', 'color', 'backgroundColor',
  'bold', 'italic', 'underline', 'strikethrough',
  'textAlign', 'lineHeight',
]);

const FONT_SIZE_RE = /^([8-9]|[1-9][0-9]|1[0-1][0-9]|120)px$/;
const COLOR_RE = /^(#([0-9a-fA-F]{3,8})|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)|transparent)$/i;
const TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const CALLOUT_TYPES = new Set(['info', 'warning', 'success', 'error', 'tip']);

// ─── Auth validation ──────────────────────────────────────────────────────────

export const normalizeEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

export const validateAuthInput = (
  { name, email, password, confirmPassword },
  { requireName = false, requireConfirm = false } = {}
) => {
  const errors = {};
  const normalizedEmail = normalizeEmail(email);

  if (requireName) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      errors.name = 'Name must be between 2 and 80 characters';
    }
    // Block names with only special characters
    if (!errors.name && !/[a-zA-Z]/.test(name.trim())) {
      errors.name = 'Name must contain at least one letter';
    }
  }
  if (!normalizedEmail || normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    errors.email = 'Please provide a valid email address';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    errors.password = 'Password must be between 8 and 128 characters';
  } else {
    // Increased security: must contain uppercase, lowercase, and at least one number
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasNumber) {
      errors.password = 'Password must contain uppercase letters, lowercase letters, and at least one number';
    }
  }
  // Warn on common weak passwords
  if (!errors.password && /^(.)\1+$/.test(password)) {
    errors.password = 'Password cannot be all the same character';
  }

  if (requireConfirm) {
    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm password is required';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
  }

  return { errors, normalizedEmail };
};

// ─── Block validation ─────────────────────────────────────────────────────────

const validateBlock = (block, index) => {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return `content[${index}] must be an object`;
  }
  if (typeof block.id !== 'string' || block.id.length < 1 || block.id.length > 100) {
    return `content[${index}].id is invalid (must be 1–100 characters)`;
  }
  if (!DOCUMENT_BLOCK_TYPES.has(block.type)) {
    return `content[${index}].type "${block.type}" is not a valid block type`;
  }
  if (block.text !== undefined) {
    if (typeof block.text !== 'string') return `content[${index}].text must be a string`;
    if (block.text.length > 100_000) return `content[${index}].text exceeds 100,000 characters`;
  }
  if (block.type === 'todo' && block.checked !== undefined && typeof block.checked !== 'boolean') {
    return `content[${index}].checked must be a boolean`;
  }
  if (block.type === 'callout' && block.calloutType !== undefined) {
    if (!CALLOUT_TYPES.has(block.calloutType)) {
      return `content[${index}].calloutType "${block.calloutType}" is not allowed`;
    }
  }
  if (block.style !== undefined) {
    const style = block.style;
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      return `content[${index}].style must be an object`;
    }
    const unknownKey = Object.keys(style).find((k) => !BLOCK_STYLE_KEYS.has(k));
    if (unknownKey) return `content[${index}].style has unknown key "${unknownKey}"`;
    if (style.fontFamily !== undefined && (typeof style.fontFamily !== 'string' || style.fontFamily.length > 100)) {
      return `content[${index}].style.fontFamily is invalid`;
    }
    if (style.fontSize !== undefined && !FONT_SIZE_RE.test(style.fontSize)) {
      return `content[${index}].style.fontSize "${style.fontSize}" must be a valid pixel size (8px–120px)`;
    }
    if (style.color !== undefined && !COLOR_RE.test(style.color)) {
      return `content[${index}].style.color must be a valid hex/rgb color`;
    }
    if (style.backgroundColor !== undefined && !COLOR_RE.test(style.backgroundColor)) {
      return `content[${index}].style.backgroundColor must be a valid color or "transparent"`;
    }
    for (const boolKey of ['bold', 'italic', 'underline', 'strikethrough']) {
      if (style[boolKey] !== undefined && typeof style[boolKey] !== 'boolean') {
        return `content[${index}].style.${boolKey} must be a boolean`;
      }
    }
    if (style.textAlign !== undefined && !TEXT_ALIGNS.has(style.textAlign)) {
      return `content[${index}].style.textAlign must be "left", "center", "right", or "justify"`;
    }
    if (style.lineHeight !== undefined && (typeof style.lineHeight !== 'string' || style.lineHeight.length > 10)) {
      return `content[${index}].style.lineHeight is invalid`;
    }
  }
  return null;
};

// ─── Document input validation ────────────────────────────────────────────────

export const validateDocumentInput = (payload = {}, { partial = false } = {}) => {
  const errors = {};

  if (payload.isEncrypted === true) {
    const allowedEncFields = new Set([
      '_id', 'isEncrypted', 'revision', 'title', 'icon', 'coverImage',
      'encTitle', 'encIcon', 'encContent', 'encDek',
    ]);

    Object.keys(payload).forEach((field) => {
      if (!allowedEncFields.has(field)) {
        errors[field] = `"${field}" is not an allowed document field`;
      }
    });

    // ── Envelope shape + max-size validation ──────────────────────────────────
    // Max sizes: v ≤ 16 chars, iv ≤ 64 chars (base64 of 12 bytes = 16, generous limit),
    //            ct ≤ 5 MB base64, wrappedDek ≤ 256, dekIv ≤ 64
    const BASE64_RE = /^[A-Za-z0-9+/\-_]+=*$/;
    const MAX_IV_LEN = 64;
    const MAX_VERSION_LEN = 16;
    const MAX_CT_TITLE_LEN = 2048;       // title ciphertext
    const MAX_CT_ICON_LEN = 512;         // icon ciphertext
    const MAX_CT_CONTENT_LEN = 5242880;  // content ciphertext (5 MB)
    const MAX_WRAPPED_DEK_LEN = 256;
    const MAX_DEK_IV_LEN = 64;

    const validateEnvelope = (envelope, fieldName, maxCtLen) => {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
        return `${fieldName} must be an encrypted envelope object`;
      }
      const { v, iv, ct } = envelope;
      if (typeof v !== 'string' || typeof iv !== 'string' || typeof ct !== 'string') {
        return `${fieldName} must contain { v, iv, ct } string properties`;
      }
      if (v.length > MAX_VERSION_LEN) return `${fieldName}.v exceeds max length (${MAX_VERSION_LEN})`;
      if (iv.length > MAX_IV_LEN) return `${fieldName}.iv exceeds max length (${MAX_IV_LEN})`;
      if (ct.length > maxCtLen) return `${fieldName}.ct exceeds max length (${maxCtLen})`;
      if (!BASE64_RE.test(iv)) return `${fieldName}.iv must be valid base64`;
      if (!BASE64_RE.test(ct)) return `${fieldName}.ct must be valid base64`;
      return null;
    };

    // Validate encTitle
    if (!partial || payload.encTitle !== undefined) {
      const err = validateEnvelope(payload.encTitle, 'encTitle', MAX_CT_TITLE_LEN);
      if (err) errors.encTitle = err;
    }

    // Validate encContent
    if (!partial || payload.encContent !== undefined) {
      const err = validateEnvelope(payload.encContent, 'encContent', MAX_CT_CONTENT_LEN);
      if (err) errors.encContent = err;
    }

    // Validate encIcon
    if (payload.encIcon !== undefined && payload.encIcon !== null) {
      const err = validateEnvelope(payload.encIcon, 'encIcon', MAX_CT_ICON_LEN);
      if (err) errors.encIcon = err;
    }

    // Validate encDek
    if (!partial || payload.encDek !== undefined) {
      if (!payload.encDek || typeof payload.encDek !== 'object' || Array.isArray(payload.encDek)) {
        errors.encDek = 'encDek must be an encrypted DEK envelope object';
      } else {
        const { wrappedDek, dekIv } = payload.encDek;
        if (typeof wrappedDek !== 'string' || typeof dekIv !== 'string') {
          errors.encDek = 'encDek must contain { wrappedDek, dekIv } string properties';
        } else {
          if (wrappedDek.length > MAX_WRAPPED_DEK_LEN) errors.encDek = `encDek.wrappedDek exceeds max length (${MAX_WRAPPED_DEK_LEN})`;
          else if (dekIv.length > MAX_DEK_IV_LEN) errors.encDek = `encDek.dekIv exceeds max length (${MAX_DEK_IV_LEN})`;
          else if (!BASE64_RE.test(wrappedDek)) errors.encDek = 'encDek.wrappedDek must be valid base64';
          else if (!BASE64_RE.test(dekIv)) errors.encDek = 'encDek.dekIv must be valid base64';
        }
      }
    }

    // Cover image validation
    if (payload.coverImage !== undefined) {
      if (typeof payload.coverImage !== 'string') {
        errors.coverImage = 'Cover image must be a string';
      } else if (payload.coverImage.length > 500) {
        errors.coverImage = 'Cover image reference cannot exceed 500 characters';
      }
    }

    // Revision validation
    if (payload.revision !== undefined) {
      if (typeof payload.revision !== 'number' || !Number.isInteger(payload.revision) || payload.revision < 0) {
        errors.revision = 'Revision must be a non-negative integer';
      }
    }

    return errors;
  }

  // Plaintext mode
  const allowedFields = new Set(['_id', 'title', 'icon', 'coverImage', 'content', 'revision', 'isEncrypted']);

  // Reject unknown fields
  Object.keys(payload).forEach((field) => {
    if (!allowedFields.has(field)) errors[field] = `"${field}" is not an allowed document field`;
  });

  // Title validation
  if (!partial || payload.title !== undefined) {
    if (
      typeof payload.title !== 'string' ||
      payload.title.trim().length < 1 ||
      payload.title.trim().length > 200
    ) {
      errors.title = 'Title must be between 1 and 200 characters';
    }
  }

  // Icon validation
  if (payload.icon !== undefined) {
    if (typeof payload.icon !== 'string') errors.icon = 'Icon must be a string';
    else if (payload.icon.length > 20) errors.icon = 'Icon must not exceed 20 characters';
  }

  // Cover image validation
  if (payload.coverImage !== undefined) {
    if (typeof payload.coverImage !== 'string') {
      errors.coverImage = 'Cover image must be a string';
    } else if (payload.coverImage.length > 500) {
      errors.coverImage = 'Cover image reference cannot exceed 500 characters';
    }
  }

  // Content validation
  if (payload.content !== undefined) {
    if (!Array.isArray(payload.content)) {
      errors.content = 'Content must be an array';
    } else if (payload.content.length > 500) {
      errors.content = 'Content cannot contain more than 500 blocks';
    } else {
      const blockError = payload.content.map(validateBlock).find(Boolean);
      if (blockError) errors.content = blockError;
    }
  } else if (!partial) {
    errors.content = 'Content is required';
  }

  return errors;
};