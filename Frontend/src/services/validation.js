const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BLOCK_TYPES = new Set([
  'paragraph', 'h1', 'h2', 'h3', 'heading', 'bullet', 'numbered', 'todo',
  'quote', 'callout', 'code', 'divider', 'table', 'board', 'page-break',
]);
const FONT_FAMILIES = new Set([
  'Calibri', 'Aptos', 'Arial', 'Georgia', 'Inter',
  'Times New Roman', 'Courier New', 'Verdana', 'Roboto', 'monospace', 'inherit'
]);
const FONT_SIZES = new Set([
  '8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px', '72px'
]);

export function validateAuthData(
  { name, email, password, confirmPassword },
  { requireName = false, requireConfirm = false } = {}
) {
  if (requireName && (!name || name.trim().length < 2 || name.trim().length > 80)) {
    return 'Name must be between 2 and 80 characters';
  }
  if (!email || email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return 'Please provide a valid email address';
  }
  if (!password || password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters';
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasUpper || !hasLower || !hasNumber) {
    return 'Password must contain uppercase letters, lowercase letters, and at least one number';
  }
  if (requireConfirm) {
    if (!confirmPassword) return 'Please confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
  }
  return null;
}

export function validateDocumentData(data, { partial = false } = {}) {
  const allowedFields = ['title', 'icon', 'coverImage', 'content'];
  const unknownField = Object.keys(data).find((field) => !allowedFields.includes(field));
  if (unknownField) return `${unknownField} is not an allowed document field`;
  if (!partial || data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.trim().length < 1 || data.title.trim().length > 200) return 'Title must be between 1 and 200 characters';
  }
  if (data.icon !== undefined && (typeof data.icon !== 'string' || data.icon.length > 20)) return 'Icon must be a short string';
  if (data.coverImage !== undefined && (typeof data.coverImage !== 'string' || data.coverImage.length > 500)) return 'Cover image value is too long';
  if (data.content !== undefined) {
    if (!Array.isArray(data.content) || data.content.length > 500) return 'Content must contain at most 500 blocks';
    const invalidBlock = data.content.find((block) => {
      if (!block || typeof block !== 'object' || typeof block.id !== 'string' || !BLOCK_TYPES.has(block.type) || (block.text !== undefined && typeof block.text !== 'string')) return true;
      const style = block.style;
      return style !== undefined && (!style || typeof style !== 'object' || (style.fontFamily !== undefined && !FONT_FAMILIES.has(style.fontFamily)) || (style.fontSize !== undefined && !FONT_SIZES.has(style.fontSize)) || (style.color !== undefined && !/^#[0-9a-f]{6}$/i.test(style.color)) || ['bold', 'italic', 'underline'].some((field) => style[field] !== undefined && typeof style[field] !== 'boolean'));
    });
    if (invalidBlock) return 'Content contains an invalid block';
  } else if (!partial) return 'Content must be an array';
  return null;
}