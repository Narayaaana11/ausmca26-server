const mongoose = require('mongoose');

const facePersonSchema = new mongoose.Schema({
  displayName: { type: String, default: 'Unnamed Person', trim: true },
  hidden: { type: Boolean, default: false, index: true },
  coverImageId: { type: String, default: '' },
  representativeEmbedding: [{ type: Number }],
  embeddingVersion: { type: String, default: 'face-api-0.22.2' },
  imageCount: { type: Number, default: 0 },
  faceCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

facePersonSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

facePersonSchema.index({ hidden: 1, imageCount: -1 });

module.exports = mongoose.model('FacePerson', facePersonSchema);
