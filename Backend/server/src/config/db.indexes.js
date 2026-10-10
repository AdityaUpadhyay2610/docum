/**
 * db.indexes.js
 * Defines and synchronizes all MongoDB indexes for the application.
 * Called once after DB connection is established.
 */
import Document from '../models/document.models.js';
import User from '../models/user.models.js';

export const ensureIndexes = async () => {
  try {
    // ─── Document Collection Indexes ─────────────────────────────────────────

    // 1. Compound index: user-scoped listing sorted by most recently updated
    //    Covers: getAllDocuments (find userId, sort updatedAt -1)
    await Document.collection.createIndex(
      { userId: 1, updatedAt: -1 },
      { name: 'idx_doc_userId_updatedAt', background: true }
    );

    // 2. Compound index: ownership lookup for single-document access/update/delete
    //    Covers: getDocumentById, updateDocument, deleteDocument (find _id + userId)
    await Document.collection.createIndex(
      { _id: 1, userId: 1 },
      { name: 'idx_doc_id_userId', background: true }
    );

    // 3. Text index: future full-text search on title (fast typeahead queries)
    await Document.collection.createIndex(
      { title: 'text' },
      { name: 'idx_doc_title_text', background: true }
    );

    // ─── User Collection Indexes ──────────────────────────────────────────────

    // 4. Unique email index (already enforced by schema unique: true,
    //    but explicitly named here for monitoring/management clarity)
    await User.collection.createIndex(
      { email: 1 },
      { name: 'idx_user_email_unique', unique: true, background: true }
    );

    console.log('✅ MongoDB indexes synchronized successfully.');
  } catch (err) {
    console.error('❌ Failed to synchronize MongoDB indexes:', err.message);
    // Non-fatal: app continues even if index sync fails
  }
};
