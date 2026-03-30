const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  type: { type: String, default: 'Other' },
  date: { type: Date, required: true },
  description: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  coverThumb: { type: String, default: '' },
  coverStorageId: { type: String, default: '' },
  coverThumbStorageId: { type: String, default: '' },
  photos: [{ type: String }],
  attendees: [{ type: String }],
  createdByName: { type: String, default: 'System' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Event', eventSchema);
