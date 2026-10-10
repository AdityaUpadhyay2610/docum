import mongoose from 'mongoose';
import dns from 'dns';
import { ensureIndexes } from './db.indexes.js';
import config from './config.js';

// Force Node to use reliable public DNS servers for SRV resolution when connecting to Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Could not set custom DNS servers:', e.message);
}

const connectDB = async () => {
  const uri = config.mongoUri;  // validated & required at startup by config.js
  try {
    const conn = await mongoose.connect(uri, {
      // Recommended connection pool settings for production
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Synchronize all collection indexes after successful connection
    await ensureIndexes();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;