const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  imageId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: 'guest' },
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
  title: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  provider: { type: String, default: 'onedrive' },
  cloudFileId: { type: String, required: true },
  cloudThumbId: { type: String, default: '' },
  mimeType: { type: String, default: 'image/webp' },
  originalMimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
  originalSize: { type: Number, default: 0 },
  category: { type: String, enum: ['memory', 'post', 'event', 'general'], default: 'general' },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'error'],
    default: 'pending',
    index: true,
  },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'flagged'],
    default: 'pending',
    index: true,
  },
  processingError: { type: String, default: '' },
  processedAt: { type: Date },
  variants: {
    full: {
      url: { type: String, default: '' },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },
    medium: {
      url: { type: String, default: '' },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },
    thumb: {
      url: { type: String, default: '' },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },
  },
  sourceRef: {
    kind: { type: String, default: '' },
    id: { type: String, default: '' },
  },
});

imageSchema.index({ category: 1, uploadedAt: -1 });
imageSchema.index({ processingStatus: 1, uploadedAt: -1 });
imageSchema.index({ moderationStatus: 1, uploadedAt: -1 });

module.exports = mongoose.model('Image', imageSchema);
