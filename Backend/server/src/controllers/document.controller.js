import mongoose from 'mongoose';
import Document from '../models/document.models.js';
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
 * Returns all documents for the authenticated user (id, title, icon, updatedAt).
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

    return res.status(200).json(doc);
  } catch (error) {
    console.error('Error fetching document by ID:', error.message);
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
};

/**
 * POST /api/documents
 * Creates a new document for the authenticated user.
 */
export const createDocument = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { title, icon, coverImage, content } = req.body;

    // Reject unknown top-level fields
    const allowedFields = new Set(['title', 'icon', 'coverImage', 'content']);
    const unknownField = Object.keys(req.body).find((f) => !allowedFields.has(f));
    if (unknownField) {
      return res.status(400).json({ error: `Field '${unknownField}' is not allowed` });
    }

    const payload = {
      title: title ?? 'Untitled',
      icon: icon ?? '📝',
      coverImage: coverImage ?? '',
      content: content ?? [],
    };

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

    const newDoc = await Document.create({
      userId,
      title: payload.title.trim(),
      icon: payload.icon,
      coverImage: payload.coverImage,
      content: payload.content,
    });

    return res.status(201).json(newDoc);
  } catch (error) {
    console.error('Error creating document:', error.message);
    return res.status(500).json({ error: 'Failed to create document' });
  }
};

/**
 * PUT /api/documents/:id
 * Updates a document strictly isolated to its owner.
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

    // Strip out any attempt to override ownership or internal fields
    const updates = { ...req.body };
    delete updates.userId;
    delete updates._id;
    delete updates.__v;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Reject unknown fields
    const allowedFields = new Set(['title', 'icon', 'coverImage', 'content']);
    const unknownField = Object.keys(updates).find((f) => !allowedFields.has(f));
    if (unknownField) {
      return res.status(400).json({ error: `Field '${unknownField}' is not allowed` });
    }

    const validationErrors = validateDocumentInput(updates, { partial: true });
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ error: 'Invalid document data', fields: validationErrors });
    }

    if (updates.title !== undefined) {
      updates.title = updates.title.trim();
      if (updates.title.length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
    }

    const updatedDoc = await Document.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedDoc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

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