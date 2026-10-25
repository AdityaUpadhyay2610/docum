import mongoose from 'mongoose';
import Document from '../models/document.models.js';
import User from '../models/user.models.js';
import { validateDocumentInput } from '../utils/validation.js';
import {
  getUserDocumentsPipeline,
  getDocumentByIdPipeline,
} from '../config/document.aggregation.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Validates a MongoDB ObjectId string. */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Extracts and validates the authenticated userId from the request.
 * Returns the userId string or null if missing/invalid.
 */
const getAuthUserId = (req) => {
  const id = req.user?.userId;
  return id && isValidObjectId(id) ? id : null;
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/documents
 * Returns all documents for the authenticated user (id, title, icon, updatedAt, enc metadata).
 * Uses aggregation pipeline with compound (userId, updatedAt) index.
 */
export const getAllDocuments = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const pipeline = getUserDocumentsPipeline(userId);
    const docs = await Document.aggregate(pipeline);

    return res.status(200).json(docs);
  } catch (error) {
    console.error('Error fetching user documents:', error.message);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

/**
 * GET /api/documents/:id
 * Returns a single document strictly isolated to its owner.
 * Uses aggregation pipeline with compound (_id, userId) index.
 */
export const getDocumentById = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    const pipeline = getDocumentByIdPipeline(id, userId);
    const [doc] = await Document.aggregate(pipeline);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    res.setHeader('ETag', `"${doc.revision ?? 0}"`);
    return res.status(200).json(doc);
  } catch (error) {
    console.error('Error fetching document by ID:', error.message);
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
};

/**
 * POST /api/documents
 * Creates a new document for the authenticated user.
 * Supports client-provided _id for E2EE AAD binding.
 * Rejects plaintext documents if vault is enabled.
 */
export const createDocument = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    // Check if vault is enabled for this account
    const user = await User.findById(userId, 'vault');
    const isVaultEnabled = user?.vault?.isVaultEnabled === true;
    if (isVaultEnabled && req.body.isEncrypted !== true) {
      return res.status(400).json({
        error: 'Plaintext document writes rejected: vault is enabled for this account',
      });
    }

    // Reject unknown top-level fields
    const allowedFields = new Set([
      '_id', 'title', 'icon', 'coverImage', 'content',
      'isEncrypted', 'revision',
      'encTitle', 'encIcon', 'encContent', 'encDek',
    ]);
    const unknownField = Object.keys(req.body).find((f) => !allowedFields.has(f));
    if (unknownField) {
      return res.status(400).json({ error: `Field '${unknownField}' is not allowed` });
    }

    const isEncrypted = req.body.isEncrypted === true;

    // Step 1b: If writing an encrypted document, reject any plaintext title/icon/content
    if (isEncrypted) {
      const hasPlaintext = req.body.title !== undefined || req.body.icon !== undefined || req.body.content !== undefined;
      if (hasPlaintext) {
        return res.status(400).json({
          error: 'Encrypted documents must not include plaintext title, icon, or content fields',
        });
      }
    }
    const payload = isEncrypted
      ? {
          _id: req.body._id,
          isEncrypted: true,
          revision: req.body.revision ?? 0,
          coverImage: req.body.coverImage ?? '',
          encTitle: req.body.encTitle,
          encIcon: req.body.encIcon,
          encContent: req.body.encContent,
          encDek: req.body.encDek,
        }
      : {
          _id: req.body._id,
          isEncrypted: false,
          revision: req.body.revision ?? 0,
          title: req.body.title ?? 'Untitled',
          icon: req.body.icon ?? '📝',
          coverImage: req.body.coverImage ?? '',
          content: req.body.content ?? [],
        };

    if (!isEncrypted && payload.title && payload.title.trim() === '[Encrypted]') {
      return res.status(400).json({ error: 'Title cannot be the reserved sentinel "[Encrypted]"' });
    }

    const validationErrors = validateDocumentInput(payload);
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ error: 'Invalid document data', fields: validationErrors });
    }

    // Enforce per-user document count limit (max 100 docs)
    const count = await Document.countDocuments({ userId });
    if (count >= 100) {
      return res.status(403).json({
        error: 'Document limit reached. You can have a maximum of 100 documents.',
      });
    }

    // Use client-generated ID if provided (for E2EE AAD binding), else new ObjectId
    let docId = new mongoose.Types.ObjectId();
    if (payload._id && isValidObjectId(payload._id)) {
      docId = new mongoose.Types.ObjectId(payload._id);
    }

    let newDoc;
    if (isEncrypted) {
      newDoc = await Document.create({
        _id: docId,
        userId,
        isEncrypted: true,
        revision: 0,
        encTitle: payload.encTitle,
        encIcon: payload.encIcon || null,
        encContent: payload.encContent,
        encDek: payload.encDek,
        title: '[Encrypted]',
        icon: '🔒',
        coverImage: payload.coverImage,
        content: [],
      });
    } else {
      newDoc = await Document.create({
        _id: docId,
        userId,
        isEncrypted: false,
        revision: 0,
        title: payload.title.trim(),
        icon: payload.icon,
        coverImage: payload.coverImage,
        content: payload.content,
      });
    }

    res.setHeader('ETag', `"${newDoc.revision ?? 0}"`);
    return res.status(201).json(newDoc);
  } catch (error) {
    console.error('Error creating document:', error.message);
    return res.status(500).json({ error: 'Failed to create document' });
  }
};

/**
 * PUT /api/documents/:id
 * Updates a document strictly isolated to its owner.
 * Performs atomic revision increments; returns 409 Conflict on revision mismatch.
 */
export const updateDocument = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    // Check if vault is enabled for this account
    const user = await User.findById(userId, 'vault');
    const isVaultEnabled = user?.vault?.isVaultEnabled === true;
    if (isVaultEnabled && req.body.isEncrypted !== true) {
      return res.status(400).json({
        error: 'Plaintext document writes rejected: vault is enabled for this account',
      });
    }

    // Strip out any attempt to override ownership or internal fields
    const updates = { ...req.body };
    delete updates.userId;
    delete updates._id;
    delete updates.__v;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Reject unknown fields
    const allowedFields = new Set([
      'title', 'icon', 'coverImage', 'content',
      'isEncrypted', 'revision',
      'encTitle', 'encIcon', 'encContent', 'encDek',
    ]);
    const unknownField = Object.keys(updates).find((f) => !allowedFields.has(f));
    if (unknownField) {
      return res.status(400).json({ error: `Field '${unknownField}' is not allowed` });
    }

    const validationErrors = validateDocumentInput(updates, { partial: true });
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ error: 'Invalid document data', fields: validationErrors });
    }

    const existing = await Document.findOne({ _id: id, userId });
    if (!existing) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    const isEncrypted = req.body.isEncrypted === true;

    // Step 1b: Reject plaintext fields in encrypted writes
    if (isEncrypted) {
      const hasPlaintext = updates.title !== undefined || updates.icon !== undefined || updates.content !== undefined;
      if (hasPlaintext) {
        return res.status(400).json({
          error: 'Encrypted documents must not include plaintext title, icon, or content fields',
        });
      }
    } else {
      if (updates.title && updates.title.trim() === '[Encrypted]') {
        return res.status(400).json({ error: 'Title cannot be the reserved sentinel "[Encrypted]"' });
      }
    }

    // Revision is MANDATORY for ALL document updates (prevents blind overwrites for both encrypted and plaintext)
    const rawRevision = req.headers['if-match'] ?? updates.revision;
    if (rawRevision === undefined || rawRevision === null || rawRevision === '') {
      return res.status(428).json({
        error: 'Precondition Required: If-Match header or revision field is required for all document updates',
      });
    }

    const expectedRevision = parseInt(String(rawRevision).replace(/["']/g, ''), 10);
    if (isNaN(expectedRevision)) {
      return res.status(400).json({ error: 'Invalid revision value in If-Match header or revision body field' });
    }
    delete updates.revision; // revision is managed atomically via $inc

    if (existing.revision !== expectedRevision) {
      return res.status(409).json({
        error: 'Conflict: Document revision mismatch',
        currentRevision: existing.revision,
      });
    }

    // Step 1b: Force plaintext sentinel values on encrypted writes
    // This ensures migrated documents never accidentally keep real plaintext metadata.
    if (isEncrypted) {
      updates.title   = '[Encrypted]';
      updates.icon    = '🔒';
      updates.content = [];
    }

    const updateFilter = { _id: id, userId, revision: expectedRevision };

    const updatedDoc = await Document.findOneAndUpdate(
      updateFilter,
      { $set: updates, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedDoc) {
      return res.status(409).json({
        error: 'Conflict: Document revision mismatch or concurrent modification',
      });
    }

    res.setHeader('ETag', `"${updatedDoc.revision}"`);
    return res.status(200).json(updatedDoc);
  } catch (error) {
    console.error('Error updating document:', error.message);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid document data', details: error.message });
    }
    return res.status(500).json({ error: 'Failed to update document' });
  }
};

/**
 * DELETE /api/documents/:id
 * Deletes a document strictly isolated to its owner.
 */
export const deleteDocument = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    const deletedDoc = await Document.findOneAndDelete({ _id: id, userId });
    if (!deletedDoc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    return res.status(200).json({ message: 'Document deleted successfully', id });
  } catch (error) {
    console.error('Error deleting document:', error.message);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
};