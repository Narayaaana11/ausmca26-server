const mongoose = require('mongoose');

const faceEmbeddingSchema = new mongoose.Schema({
  imageId: { type: String, required: true, index: true },
  imageRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', required: true, index: true },
  personRef: { type: mongoose.Schema.Types.ObjectId, ref: 'FacePerson', index: true },
  descriptor: [{ type: Number, required: true }],
  box: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  previewUrl: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  embeddingVersion: { type: String, default: 'face-api-0.22.2' },
  createdAt: { type: Date, default: Date.now },
});

faceEmbeddingSchema.index({ personRef: 1, createdAt: -1 });
faceEmbeddingSchema.index({ imageId: 1, createdAt: -1 });

module.exports = mongoose.model('FaceEmbedding', faceEmbeddingSchema);
