const Event = require('../models/Event');
const Image = require('../models/Image');
const { uploadImage, removeImageAssets } = require('../services/storage.service');

const getClientId = (req) => req.get('x-client-id')?.trim() || 'guest';

exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const { name, title, date, description, type, createdByName } = req.body;
    let storage = null;

    if (req.file) {
      storage = await uploadImage({ file: req.file, folder: 'events' });
    }

    const event = await Event.create({
      title: (title || name || '').trim(),
      type: (type || 'Other').trim(),
      date,
      description,
      coverImage: storage?.imageUrl || '',
      coverThumb: storage?.thumbnailUrl || '',
      coverStorageId: storage?.cloudFileId || '',
      coverThumbStorageId: storage?.cloudThumbId || '',
      createdByName: (createdByName || 'System').trim(),
    });

    if (storage) {
      await Image.create({
        imageId: storage.cloudFileId,
        userId: getClientId(req),
        imageUrl: storage.imageUrl,
        thumbnailUrl: storage.thumbnailUrl,
        title: event.title,
        description: event.description || '',
        provider: storage.provider,
        cloudFileId: storage.cloudFileId,
        cloudThumbId: storage.cloudThumbId,
        mimeType: storage.mimeType,
        originalMimeType: storage.originalMimeType,
        size: storage.optimizedSize,
        originalSize: storage.originalSize,
        category: 'event',
        sourceRef: { kind: 'event', id: String(event._id) },
      });
    }

    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    if (event.coverStorageId || event.coverThumbStorageId) {
      await removeImageAssets({
        cloudFileId: event.coverStorageId,
        cloudThumbId: event.coverThumbStorageId,
      });
      await Image.deleteOne({ imageId: event.coverStorageId });
    }

    await event.deleteOne();
    res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
