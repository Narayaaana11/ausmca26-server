const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Please provide a name'], trim: true },
  email: { type: String, required: [true, 'Please provide an email'], unique: true, lowercase: true },
  avatar: { type: String, default: '' },
  batch: { type: String, default: '2024' },
  branch: { type: String, default: '' },
  rollNo: { type: String, default: '' },
  quote: { type: String, default: '' },
  bio: { type: String, default: '' },
  socialLinks: {
    instagram: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
