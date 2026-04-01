const mongoose = require('mongoose');

const searchIndexSchema = new mongoose.Schema({
  entityId: { type: String, required: true, index: true },
  entityType: { type: String, enum: ['memory', 'post', 'event', 'member', 'image'], required: true, index: true },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  keywords: [{ type: String }],
  category: { type: String, default: '' },
  year: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

searchIndexSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

searchIndexSchema.index({ entityType: 1, createdAt: -1 });
searchIndexSchema.index({ keywords: 1 });
searchIndexSchema.index({ category: 1, year: 1, createdAt: -1 });
searchIndexSchema.index({ title: 'text', text: 'text', keywords: 'text' });

module.exports = mongoose.model('SearchIndex', searchIndexSchema);
