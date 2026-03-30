const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { getPosts, createPost, likePost, addComment, deletePost } = require('../controllers/postController');

router.get('/', getPosts);
router.post('/', upload.single('image'), createPost);
router.put('/:id/like', likePost);
router.post('/:id/comment', addComment);
router.delete('/:id', deletePost);

module.exports = router;
