const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
	uploadImage,
	getImages,
	streamImage,
	deleteImage,
	upsertImageFaces,
	getFacePeople,
	updateFacePerson,
	mergeFacePeople,
	deleteFacePerson,
} = require('../controllers/imageController');

router.get('/', getImages);
router.get('/faces/people', getFacePeople);
router.post('/faces/people/merge', mergeFacePeople);
router.put('/faces/people/:personId', updateFacePerson);
router.delete('/faces/people/:personId', deleteFacePerson);
router.post('/:id/faces', upsertImageFaces);
router.get('/file/:fileId', streamImage);
router.post('/', upload.single('image'), uploadImage);
router.delete('/:id', deleteImage);

module.exports = router;
