import 'dotenv/config';

import app from './app.js';
import connectDB from './config/db.config.js';
import config from './config/config.js';

connectDB().then(() => {
  app.listen(config.port, () => {
    console.log(`🚀 Server listening on port ${config.port} [${config.nodeEnv}]`);
  });
});