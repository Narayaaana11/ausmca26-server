const Memory = require('../models/Memory');
const Image = require('../models/Image');
const { uploadImage, removeImageAssets } = require('../services/storage.service');
const { enqueueImageProcessing } = require('../services/imagePipeline.service');
const { upsertSearchDocument } = require('../services/searchIndex.service');

const getClientId = (req) => req.get('x-client-id')?.trim() || 'guest';
const MAX_BULK_MEMORY_FILES = 24;

const parseTags = (tagsValue) => {
  if (typeof tagsValue !== 'string' || !tagsValue.trim()) return [];
  return tagsValue
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const createMemoryWithImage = async ({ file, fields, clientId }) => {
  const { title, description, year, event, tags, uploadedByName } = fields;
  const storage = await uploadImage({ file, folder: 'memories' });

  const memory = await Memory.create({
    title,
    description,
    year,
    event,
    tags: parseTags(tags),
    imageUrl: storage.imageUrl,
    thumbnailUrl: storage.thumbnailUrl,
    imageStorageId: storage.cloudFileId,
    imageThumbStorageId: storage.cloudThumbId,
    uploadedByName: uploadedByName?.trim() || 'Batch Member',
  });

  const image = await Image.create({
    imageId: storage.cloudFileId,
    userId: clientId,
    imageUrl: storage.imageUrl,
    thumbnailUrl: storage.thumbnailUrl,
    title: title || '',
    description: description || '',
    provider: storage.provider,
    cloudFileId: storage.cloudFileId,
    cloudThumbId: storage.cloudThumbId,
    mimeType: storage.mimeType,
    originalMimeType: storage.originalMimeType,
    size: storage.optimizedSize,
    originalSize: storage.originalSize,
    category: 'memory',
    sourceRef: { kind: 'memory', id: String(memory._id) },
    processingStatus: 'pending',
    moderationStatus: 'pending',
  });

  enqueueImageProcessing(image);
  await upsertSearchDocument({
    entityId: String(memory._id),
    entityType: 'memory',
    title: memory.title,
    text: memory.description,
    keywords: memory.tags || [],
    category: memory.event || 'General',
    year: memory.year || '',
  });

  return memory;
};

exports.getMemories = async (req, res) => {
  try {
    const { year, event, tag, limit = 24, page = 1, q = '' } = req.query;
    const filter = {};
    if (year) filter.year = year;
    if (event) filter.event = event;
    if (tag) filter.tags = tag;
    if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];

    const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [memories, total] = await Promise.all([
      Memory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      Memory.countDocuments(filter),
    ]);

    res.json({
      success: true,
      count: memories.length,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.max(Math.ceil(total / safeLimit), 1),
      memories,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createMemory = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Please upload an image' });
    const memory = await createMemoryWithImage({
      file: req.file,
      fields: req.body,
      clientId: getClientId(req),
    });

    res.status(201).json({ success: true, memory });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createMemoriesBulk = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files.slice(0, MAX_BULK_MEMORY_FILES) : [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'Please upload at least one image' });
    }

    const clientId = getClientId(req);
    const uploaded = [];
    const failed = [];

    for (const file of files) {
      try {
        const memory = await createMemoryWithImage({ file, fields: req.body, clientId });
        uploaded.push(memory);
      } catch (error) {
        failed.push({ name: file.originalname, message: error.message });
      }
    }

    if (!uploaded.length) {
      return res.status(500).json({
        success: false,
        message: failed[0]?.message || 'Bulk upload failed',
        failed,
      });
    }

    return res.status(failed.length ? 207 : 201).json({
      success: true,
      count: uploaded.length,
      failedCount: failed.length,
      memories: uploaded,
      failed,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.likeMemory = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const memory = await Memory.findById(req.params.id);
    if (!memory) return res.status(404).json({ success: false, message: 'Memory not found' });

    const idx = memory.likes.indexOf(clientId);
    if (idx === -1) memory.likes.push(clientId);
    else memory.likes.splice(idx, 1);

    await memory.save();
    res.json({ success: true, likes: memory.likes.length, liked: idx === -1 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const memory = await Memory.findById(req.params.id);
    if (!memory) return res.status(404).json({ success: false, message: 'Memory not found' });

    memory.comments.push({
      clientId,
      userName: req.body.userName?.trim() || 'Guest',
      text: req.body.text,
    });

    await memory.save();
    res.json({ success: true, comments: memory.comments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteMemory = async (req, res) => {
  try {
    const memory = await Memory.findById(req.params.id);
    if (!memory) return res.status(404).json({ success: false, message: 'Memory not found' });

    if (memory.imageStorageId || memory.imageThumbStorageId) {
      await removeImageAssets({
        cloudFileId: memory.imageStorageId,
        cloudThumbId: memory.imageThumbStorageId,
      });
      await Image.deleteOne({ imageId: memory.imageStorageId });
    }

    await memory.deleteOne();
    res.json({ success: true, message: 'Memory deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
