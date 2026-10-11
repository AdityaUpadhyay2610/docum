/**
 * document.aggregation.js
 * MongoDB Aggregation Pipeline definitions for the Document collection.
 * All pipelines are pure functions returning pipeline arrays — no side effects.
 */
import mongoose from 'mongoose';

/**
 * Pipeline: Get all documents for a user (sidebar listing).
 * Returns: _id, title, icon, updatedAt — sorted newest first.
 * Optimized to use the (userId, updatedAt) compound index.
 *
 * @param {string} userId - The authenticated user's ObjectId string.
 * @returns {Array} Aggregation pipeline array.
 */
export const getUserDocumentsPipeline = (userId) => [
  // Stage 1: Match on indexed userId field
  {
    $match: { userId: new mongoose.Types.ObjectId(userId) },
  },
  // Stage 2: Sort by updatedAt descending (uses compound index)
  {
    $sort: { updatedAt: -1 },
  },
  // Stage 3: Project sidebar/listing fields (supports both plaintext & E2EE)
  {
    $project: {
      _id: 1,
      title: 1,
      icon: 1,
      coverImage: 1,
      updatedAt: 1,
      createdAt: 1,
      revision: 1,
      isEncrypted: 1,
      encTitle: 1,
      encIcon: 1,
      encDek: 1,
    },
  },
];

/**
 * Pipeline: Get a single document with ownership enforcement.
 * Returns the full document or empty array if not found / access denied.
 *
 * @param {string} docId   - The document's ObjectId string.
 * @param {string} userId  - The authenticated user's ObjectId string.
 * @returns {Array} Aggregation pipeline array.
 */
export const getDocumentByIdPipeline = (docId, userId) => [
  // Stage 1: Match on compound (docId + userId) — hits idx_doc_id_userId
  {
    $match: {
      _id: new mongoose.Types.ObjectId(docId),
      userId: new mongoose.Types.ObjectId(userId),
    },
  },
  // Stage 2: Limit to 1 document (short-circuit after first match)
  { $limit: 1 },
];

/**
 * Pipeline: Get a user's document count and last-updated timestamp.
 * Useful for dashboard statistics / analytics.
 *
 * @param {string} userId - The authenticated user's ObjectId string.
 * @returns {Array} Aggregation pipeline array.
 */
export const getUserDocumentStatsPipeline = (userId) => [
  {
    $match: { userId: new mongoose.Types.ObjectId(userId) },
  },
  {
    $group: {
      _id: '$userId',
      totalDocuments: { $sum: 1 },
      lastUpdated: { $max: '$updatedAt' },
      oldestDocument: { $min: '$createdAt' },
    },
  },
  {
    $project: {
      _id: 0,
      totalDocuments: 1,
      lastUpdated: 1,
      oldestDocument: 1,
    },
  },
];
