const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema({
  provider: { type: String, default: 'mongodb' },
  fileName: { type: String, required: true },
  contentType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  folder: { type: String, default: 'general' },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('StoredFile', storedFileSchema);
