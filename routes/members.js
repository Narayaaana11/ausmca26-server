const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { getAllMembers, createMember } = require('../controllers/memberController');

router.get('/', getAllMembers);
router.post('/', upload.single('photo'), createMember);

module.exports = router;
