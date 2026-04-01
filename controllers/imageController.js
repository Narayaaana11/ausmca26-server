const Image = require('../models/Image');
const FacePerson = require('../models/FacePerson');
const { uploadImage, removeImageAssets } = require('../services/storage.service');
const { fetchFileStream } = require('../services/cloud.service');
const { enqueueImageProcessing } = require('../services/imagePipeline.service');
const { upsertFacesForImage, getPeopleClusters, updatePerson, mergePeople } = require('../services/faceIndex.service');
const { upsertSearchDocument } = require('../services/searchIndex.service');

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
      processingStatus: 'pending',
      moderationStatus: 'pending',
    });

    enqueueImageProcessing(image);
    await upsertSearchDocument({
      entityId: String(image._id),
      entityType: 'image',
      title: image.title,
      text: image.description,
      keywords: [image.category],
      category: image.category,
    });

    return res.status(201).json({ success: true, image });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getImages = async (req, res) => {
  try {
    const { category, processingStatus, moderationStatus, q, limit = 24, page = 1 } = req.query;
    const filter = category ? { category } : {};
    if (processingStatus) filter.processingStatus = processingStatus;
    if (moderationStatus) filter.moderationStatus = moderationStatus;
    if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];

    const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [images, total] = await Promise.all([
      Image.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(safeLimit),
      Image.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      count: images.length,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.max(Math.ceil(total / safeLimit), 1),
      images,
    });
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

exports.upsertImageFaces = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

    const faces = Array.isArray(req.body?.faces) ? req.body.faces : [];
    const inserted = await upsertFacesForImage({ imageDoc: image, faces });

    return res.json({ success: true, count: inserted.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFacePeople = async (req, res) => {
  try {
    const includeHidden = String(req.query.includeHidden || '').toLowerCase() === 'true';
    const people = await getPeopleClusters({ includeHidden });
    return res.json({ success: true, count: people.length, people });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateFacePerson = async (req, res) => {
  try {
    const person = await updatePerson({
      personId: req.params.personId,
      displayName: req.body.displayName,
      hidden: req.body.hidden,
      coverImageId: req.body.coverImageId,
    });
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

    return res.json({ success: true, person });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.mergeFacePeople = async (req, res) => {
  try {
    const { sourcePersonId, targetPersonId } = req.body || {};
    const merged = await mergePeople({ sourcePersonId, targetPersonId });
    if (!merged) return res.status(400).json({ success: false, message: 'Invalid merge request' });

    return res.json({ success: true, person: merged });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteFacePerson = async (req, res) => {
  try {
    const person = await FacePerson.findById(req.params.personId);
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

    person.hidden = true;
    await person.save();

    return res.json({ success: true, message: 'Person hidden' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
