import 'dotenv/config';

import app from './app.js';
import connectDB from './config/db.config.js';

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });
});