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

    const safeCreateIndex = async (collection, spec, options) => {
      try {
        await collection.createIndex(spec, options);
      } catch (err) {
        // If index already exists with default or different name, ignore
        if (err.codeName !== 'IndexKeySpecsConflict' && !err.message.includes('already exists')) {
          console.warn(`⚠️ Index creation notice for ${JSON.stringify(spec)}:`, err.message);
        }
      }
    };

    // 1. Compound index: user-scoped listing sorted by most recently updated
    await safeCreateIndex(
      Document.collection,
      { userId: 1, updatedAt: -1 },
      { name: 'idx_doc_userId_updatedAt', background: true }
    );

    // 2. Compound index: ownership lookup for single-document access/update/delete
    await safeCreateIndex(
      Document.collection,
      { _id: 1, userId: 1 },
      { name: 'idx_doc_id_userId', background: true }
    );

    // 3. Drop legacy text index on title if present (E2EE zero-knowledge prevents plaintext indexing)
    try {
      await Document.collection.dropIndex('idx_doc_title_text');
    } catch {
      // Index does not exist or already dropped, safe to ignore
    }

    // ─── User Collection Indexes ──────────────────────────────────────────────

    // 4. Unique email index
    await safeCreateIndex(
      User.collection,
      { email: 1 },
      { name: 'idx_user_email_unique', unique: true, background: true }
    );

    console.log('✅ MongoDB indexes synchronized successfully.');
  } catch (err) {
    console.error('❌ Failed to synchronize MongoDB indexes:', err.message);
    // Non-fatal: app continues even if index sync fails
  }
};
