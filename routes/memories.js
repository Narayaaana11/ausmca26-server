const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
	getMemories,
	createMemory,
	createMemoriesBulk,
	likeMemory,
	addComment,
	deleteMemory,
} = require('../controllers/memoryController');

router.get('/', getMemories);
router.post('/bulk', upload.array('images', 24), createMemoriesBulk);
router.post('/', upload.single('image'), createMemory);
router.put('/:id/like', likeMemory);
router.post('/:id/comment', addComment);
router.delete('/:id', deleteMemory);

module.exports = router;
