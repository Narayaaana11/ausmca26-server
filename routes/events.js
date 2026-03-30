const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { getEvents, createEvent, deleteEvent } = require('../controllers/eventController');

router.get('/', getEvents);
router.post('/', upload.single('coverImage'), createEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
