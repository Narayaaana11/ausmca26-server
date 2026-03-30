const User = require('../models/User');
const { uploadImage } = require('../services/storage.service');

const ROLL_NO_REGEX = /^24M11MC\d{3}$/i;
const MOBILE_REGEX = /^\d{10}$/;
const VALID_SECTIONS = new Set(['A', 'B', 'C', 'F']);

const normalizeInstagram = (value) => {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://instagram.com/${raw.replace(/^@/, '')}`;
};

exports.getAllMembers = async (req, res) => {
  try {
    const members = await User.find().select('-password -__v').sort({ name: 1 });

    const normalized = members.map((member) => ({
      ...member.toObject(),
      profilePicture: member.avatar || '',
      favoriteQuote: member.quote || '',
    }));

    res.json({ success: true, count: normalized.length, members: normalized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createMember = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const rollNo = req.body.rollNo?.trim().toUpperCase();
    const mobile = req.body.mobile?.trim();
    const section = req.body.section?.trim().toUpperCase();
    const instagramId = req.body.instagramId?.trim();

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Person photo is required.' });
    }
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }
    if (!rollNo || !ROLL_NO_REGEX.test(rollNo)) {
      return res.status(400).json({ success: false, message: 'Roll number must be in format 24M11MC176.' });
    }
    if (!mobile || !MOBILE_REGEX.test(mobile)) {
      return res.status(400).json({ success: false, message: 'Mobile number must be 10 digits.' });
    }
    if (!section || !VALID_SECTIONS.has(section)) {
      return res.status(400).json({ success: false, message: 'Section must be one of A, B, C, or F.' });
    }

    const existingRollNo = await User.findOne({ rollNo });
    if (existingRollNo) {
      return res.status(409).json({ success: false, message: 'Member with this roll number already exists.' });
    }

    const storage = await uploadImage({ file: req.file, folder: 'members' });

    let email = `${rollNo.toLowerCase()}@registry.local`;
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      email = `${rollNo.toLowerCase()}-${Date.now()}@registry.local`;
    }

    const member = await User.create({
      name,
      email,
      avatar: storage.imageUrl,
      batch: '2024-2026',
      branch: `Section ${section}`,
      rollNo,
      bio: mobile,
      socialLinks: {
        instagram: normalizeInstagram(instagramId),
      },
    });

    const normalized = {
      ...member.toObject(),
      profilePicture: member.avatar || '',
      favoriteQuote: member.quote || '',
    };

    return res.status(201).json({ success: true, member: normalized });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
