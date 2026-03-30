const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    name: { type: String, default: 'Batch Member' },
  },
  authorName: { type: String, default: 'Batch Member' },
  isAnonymous: { type: Boolean, default: false },
  content: { type: String, required: [true, 'Post content is required'] },
  imageUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  imageStorageId: { type: String, default: '' },
  imageThumbStorageId: { type: String, default: '' },
  likes: [{ type: String }],
  comments: [{
    clientId: { type: String, default: 'guest' },
    userName: { type: String, default: 'Guest' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  isPinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Post', postSchema);
