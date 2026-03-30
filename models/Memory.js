const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema({
  title: { type: String, required: [true, 'Title is required'], trim: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  imageStorageId: { type: String, default: '' },
  imageThumbStorageId: { type: String, default: '' },
  uploadedByName: { type: String, default: 'Batch Member' },
  year: { type: String, default: '2024' },
  event: { type: String, default: 'General' },
  tags: [{ type: String }],
  likes: [{ type: String }],
  comments: [{
    clientId: { type: String, default: 'guest' },
    userName: { type: String, default: 'Guest' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Memory', memorySchema);
