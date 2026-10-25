import api from './api';
import { validateDocumentData } from './validation';
import {
  encryptDocument,
  decryptDocument,
  decryptField,
  generateAndWrapDEK,
  unwrapDEK,
  FIELDS,
  setDEK,
  getDEK,
  deleteDEK,
} from './crypto/index';

/**
 * Generate a cryptographically strong 24-character hex MongoDB ObjectId.
 * Format: 4-byte timestamp + 8 random bytes = 12 bytes = 24 hex characters.
 */
export function generateObjectId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return (timestamp + randomHex).slice(0, 24);
}

/**
 * Document Service CRUD operations supporting Zero-Knowledge E2EE
 */
export const documentServices = {
  /**
   * Fetch list of all documents (for sidebar).
   * If masterKey is provided, in-memory decrypts titles and icons.
   */
  async getAll({ masterKey } = {}) {
    const docs = await api.get('/documents');
    if (!masterKey || !Array.isArray(docs)) {
      return docs;
    }

    // Decrypt encrypted documents in parallel
    const decryptedDocs = await Promise.all(
      docs.map(async (doc) => {
        if (!doc.isEncrypted || !doc.encDek) {
          return doc;
        }
        try {
          let dek = getDEK(doc._id);
          if (!dek) {
            dek = await unwrapDEK(masterKey, doc.encDek.wrappedDek, doc.encDek.dekIv);
            setDEK(doc._id, dek);
          }
          const title = await decryptField(dek, doc._id, FIELDS.TITLE, doc.encTitle);
          const icon = doc.encIcon ? await decryptField(dek, doc._id, FIELDS.ICON, doc.encIcon) : (doc.icon || '📝');
          return { ...doc, title, icon };
        } catch {
          return { ...doc, title: '[Encrypted]', icon: '🔒', isLocked: true };
        }
      })
    );

    return decryptedDocs;
  },

  /**
   * Fetch a single full document by its ID.
   * If masterKey is provided, in-memory decrypts sensitive fields.
   */
  async getById(id, { masterKey } = {}) {
    if (!id) throw new Error('Document ID is required');
    const doc = await api.get(`/documents/${id}`);

    if (!doc.isEncrypted) {
      return doc;
    }

    if (!masterKey) {
      return { ...doc, isLocked: true };
    }

    try {
      let dek = getDEK(doc._id);
      if (!dek) {
        dek = await unwrapDEK(masterKey, doc.encDek.wrappedDek, doc.encDek.dekIv);
        setDEK(doc._id, dek);
      }
      const decrypted = await decryptDocument(dek, doc._id, {
        encTitle: doc.encTitle,
        encIcon: doc.encIcon,
        encContent: doc.encContent,
      });

      return {
        ...doc,
        title: decrypted.title,
        icon: decrypted.icon,
        content: decrypted.content,
      };
    } catch (err) {
      console.error('Failed to decrypt document:', err.message);
      return { ...doc, isLocked: true, decryptError: err.message };
    }
  },

  /**
   * Create a new document.
   * If masterKey is provided, generates DEK and encrypts client-side before sending.
   */
  async create(data = {}, { masterKey } = {}) {
    const docId = data._id || generateObjectId();
    const title = data.title || 'Untitled';
    const icon = data.icon || '📝';
    const coverImage = data.coverImage || '';
    const content = data.content || [
      { id: crypto.randomUUID(), type: 'h1', text: 'Welcome to your new document' },
      { id: crypto.randomUUID(), type: 'paragraph', text: 'Start typing or press "/" to insert blocks...' },
    ];

    if (masterKey) {
      // 1. Generate new DEK and wrap it with Master Key
      const { dek, wrappedDek, dekIv } = await generateAndWrapDEK(masterKey);
      setDEK(docId, dek);

      // 2. Encrypt sensitive fields with per-field IVs and AAD bound to docId
      const encFields = await encryptDocument(dek, docId, { title, icon, content });

      const payload = {
        _id: docId,
        isEncrypted: true,
        encTitle: encFields.encTitle,
        encIcon: encFields.encIcon,
        encContent: encFields.encContent,
        encDek: { wrappedDek, dekIv },
        coverImage,
      };

      const res = await api.post('/documents', payload);
      // Return with in-memory decrypted fields attached for UI (DEK stored in keyCache)
      return {
        ...res,
        title,
        icon,
        content,
      };
    }

    // Plaintext creation
    const payload = {
      _id: docId,
      title,
      icon,
      coverImage,
      content,
    };
    const validationError = validateDocumentData(payload);
    if (validationError) throw new Error(validationError);
    return api.post('/documents', payload);
  },

  /**
   * Update an existing document by ID.
   * If document is encrypted, encrypts sensitive fields and sends revision ETag.
   */
  async update(id, updates = {}, { masterKey, expectedRevision } = {}) {
    if (!id) throw new Error('Document ID is required');

    const isEncrypted = updates.isEncrypted || Boolean(updates.encDek) || Boolean(masterKey);

    if (isEncrypted) {
      if (!masterKey) {
        throw new Error('Vault is locked. Unlock vault to edit or save this encrypted document.');
      }

      // Get or unwrap DEK
      let dek = getDEK(id);
      if (!dek && updates.encDek) {
        dek = await unwrapDEK(masterKey, updates.encDek.wrappedDek, updates.encDek.dekIv);
      }

      if (!dek) {
        throw new Error('Cannot update encrypted document without valid decryption key');
      }
      setDEK(id, dek);

      const fieldsToEncrypt = {};
      if (updates.title !== undefined) fieldsToEncrypt.title = updates.title;
      if (updates.icon !== undefined) fieldsToEncrypt.icon = updates.icon;
      if (updates.content !== undefined) fieldsToEncrypt.content = updates.content;

      const payload = {
        isEncrypted: true,
      };

      if (Object.keys(fieldsToEncrypt).length > 0) {
        const encFields = await encryptDocument(dek, id, fieldsToEncrypt);
        if (encFields.encTitle) payload.encTitle = encFields.encTitle;
        if (encFields.encIcon) payload.encIcon = encFields.encIcon;
        if (encFields.encContent) payload.encContent = encFields.encContent;
      }

      if (updates.coverImage !== undefined) {
        payload.coverImage = updates.coverImage;
      }
      if (updates.encDek) {
        payload.encDek = updates.encDek;
      }

      const headers = {};
      const rev = expectedRevision ?? updates.revision;
      if (rev !== undefined && rev !== null) {
        headers['If-Match'] = `"${rev}"`;
        payload.revision = rev;
      }

      const res = await api.put(`/documents/${id}`, payload, { headers });
      return {
        ...res,
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.icon !== undefined && { icon: updates.icon }),
        ...(updates.content !== undefined && { content: updates.content }),
      };
    }

    // Plaintext update - send only changed fields
    const payload = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.icon !== undefined) payload.icon = updates.icon;
    if (updates.coverImage !== undefined) payload.coverImage = updates.coverImage;
    if (updates.content !== undefined) payload.content = updates.content;

    const validationError = validateDocumentData(payload, { partial: true });
    if (validationError) throw new Error(validationError);

    const headers = {};
    const rev = expectedRevision ?? updates.revision;
    if (rev !== undefined && rev !== null) {
      headers['If-Match'] = `"${rev}"`;
      payload.revision = rev;
    }

    return api.put(`/documents/${id}`, payload, { headers });
  },

  /**
   * Delete a document by ID
   */
  async delete(id) {
    if (!id) throw new Error('Document ID is required');
    deleteDEK(id);
    return api.delete(`/documents/${id}`);
  },
};

export default documentServices;
