const path = require('path');
const sharp = require('sharp');
const { uploadBuffer, deleteFile } = require('./cloud.service');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE_BYTES = Number(process.env.MAX_IMAGE_SIZE_MB || 10) * 1024 * 1024;

function sanitizeBaseName(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function validateFile(file) {
  if (!file) throw new Error('Image file is required');
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error('Unsupported file type. Allowed: JPG, PNG, WEBP');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`File exceeds ${process.env.MAX_IMAGE_SIZE_MB || 10}MB limit`);
  }
}

function buildSafeBaseName(file) {
  const original = path.parse(file.originalname || 'image').name;
  const safe = sanitizeBaseName(original) || 'image';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${suffix}-${safe}`;
}

async function optimizeForStorage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 2400, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: 82 })
    .toBuffer();
}

async function buildThumbnail(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 480, height: 480, fit: 'cover' })
    .webp({ quality: 72 })
    .toBuffer();
}

async function uploadImage({ file, folder = 'general' }) {
  validateFile(file);
  const safeBase = buildSafeBaseName(file);

  const optimizedBuffer = await optimizeForStorage(file.buffer);
  const thumbBuffer = await buildThumbnail(file.buffer);

  const [fullUpload, thumbUpload] = await Promise.all([
    uploadBuffer({
      buffer: optimizedBuffer,
      fileName: `${safeBase}.webp`,
      contentType: 'image/webp',
      folder: `${folder}/full`,
    }),
    uploadBuffer({
      buffer: thumbBuffer,
      fileName: `${safeBase}-thumb.webp`,
      contentType: 'image/webp',
      folder: `${folder}/thumbs`,
    }),
  ]);

  return {
    provider: fullUpload.provider || 'mongodb',
    cloudFileId: fullUpload.id,
    cloudThumbId: thumbUpload.id,
    imageUrl: `/api/images/file/${fullUpload.id}`,
    thumbnailUrl: `/api/images/file/${thumbUpload.id}`,
    optimizedSize: fullUpload.size,
    originalSize: file.size,
    mimeType: 'image/webp',
    originalMimeType: file.mimetype,
  };
}

async function removeImageAssets({ cloudFileId, cloudThumbId }) {
  await Promise.allSettled([deleteFile(cloudFileId), deleteFile(cloudThumbId)]);
}

module.exports = {
  uploadImage,
  removeImageAssets,
};
