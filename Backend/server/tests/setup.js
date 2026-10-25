/**
 * tests/setup.js – Shared test setup using mongodb-memory-server
 *
 * This module replaces the dependency on a local MongoDB instance.
 * `npm test` now works anywhere without running `mongod`.
 *
 * Usage in test files:
 *   import { setupTestDB, teardownTestDB } from './setup.js';
 *
 *   before(async () => { await setupTestDB(); });
 *   after(async () => { await teardownTestDB(); });
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer;

/**
 * Start an in-memory MongoDB instance and connect Mongoose.
 * Sets the MONGO_URI env var so the app config module picks it up.
 */
export async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);
}

/**
 * Drop all collections, disconnect, and stop the in-memory server.
 */
export async function teardownTestDB() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}
