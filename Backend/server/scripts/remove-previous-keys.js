/**
 * scripts/remove-previous-keys.js
 * Removes legacy previousKeys arrays from all user vault records in MongoDB.
 *
 * Usage:
 *   node scripts/remove-previous-keys.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import config from '../src/config/config.js';
import User from '../src/models/user.models.js';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(config.mongoUri);

  const result = await User.updateMany(
    { 'vault.previousKeys': { $exists: true, $ne: [] } },
    { $set: { 'vault.previousKeys': [] } }
  );

  console.log(`Cleaned previousKeys from ${result.modifiedCount} user(s).`);
  await mongoose.disconnect();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
