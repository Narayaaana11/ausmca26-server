const mongoose = require('mongoose');

const connectDB = async () => {
  const configuredUri = process.env.MONGODB_URI?.trim();
  const fallbackUri = process.env.MONGODB_FALLBACK_URI?.trim();

  if (!configuredUri) {
    console.error('❌ MongoDB Error: MONGODB_URI is not set in server/.env');
    process.exit(1);
  }

  const containsPlaceholder = configuredUri.includes('<db_password>');
  const connectionCandidates = [];

  if (containsPlaceholder) {
    console.warn('⚠️ MONGODB_URI contains <db_password>. Skipping primary URI.');
  } else {
    connectionCandidates.push({ uri: configuredUri, label: 'primary' });
  }

  if (fallbackUri) {
    connectionCandidates.push({ uri: fallbackUri, label: 'fallback' });
  }

  if (connectionCandidates.length === 0) {
    console.error('❌ MongoDB Error: Set a valid MONGODB_URI or define MONGODB_FALLBACK_URI in server/.env');
    process.exit(1);
  }

  let lastError;
  for (const candidate of connectionCandidates) {
    try {
      const conn = await mongoose.connect(candidate.uri);
      const suffix = candidate.label === 'fallback' ? ' (fallback)' : '';
      console.log(`✅ MongoDB Connected${suffix}: ${conn.connection.host}`);
      return;
    } catch (error) {
      lastError = error;

      if (candidate.label === 'primary' && fallbackUri) {
        console.warn('⚠️ Primary MongoDB connection failed. Retrying with MONGODB_FALLBACK_URI...');
      }
    }
  }

  if (lastError) {
    console.error(`❌ MongoDB Error: ${lastError.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
