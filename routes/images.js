const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { uploadImage, getImages, streamImage, deleteImage } = require('../controllers/imageController');

router.get('/', getImages);
router.get('/file/:fileId', streamImage);
router.post('/', upload.single('image'), uploadImage);
router.delete('/:id', deleteImage);

module.exports = router;
