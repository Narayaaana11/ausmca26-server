const Image = require('../models/Image');
const { uploadImage, removeImageAssets } = require('../services/storage.service');
const { fetchFileStream } = require('../services/cloud.service');

const getClientId = (req) => req.get('x-client-id')?.trim() || 'guest';

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file' });
    }

    const result = await uploadImage({
      file: req.file,
      folder: req.body.folder || 'general',
    });

    const image = await Image.create({
      imageId: result.cloudFileId,
      userId: getClientId(req),
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl,
      title: req.body.title || '',
      description: req.body.description || '',
      provider: result.provider,
      cloudFileId: result.cloudFileId,
      cloudThumbId: result.cloudThumbId,
      mimeType: result.mimeType,
      originalMimeType: result.originalMimeType,
      size: result.optimizedSize,
      originalSize: result.originalSize,
      category: req.body.category || 'general',
    });

    return res.status(201).json({ success: true, image });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getImages = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};
    const images = await Image.find(filter).sort({ uploadedAt: -1 });
    return res.json({ success: true, count: images.length, images });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.streamImage = async (req, res) => {
  try {
    const streamResponse = await fetchFileStream(req.params.fileId);
    const contentType = streamResponse.headers.get('content-type') || 'image/webp';
    const cacheControl = process.env.IMAGE_CACHE_CONTROL || 'public, max-age=300';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);

    const arrayBuffer = await streamResponse.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

    await removeImageAssets({ cloudFileId: image.cloudFileId, cloudThumbId: image.cloudThumbId });
    await image.deleteOne();

    return res.json({ success: true, message: 'Image deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
