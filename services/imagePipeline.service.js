const Image = require('../models/Image');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lightweight async pipeline scaffold for real-time UX. Heavy tasks can be moved to a queue later.
exports.enqueueImageProcessing = (imageDoc) => {
  if (!imageDoc?._id) return;

  setImmediate(async () => {
    try {
      await Image.updateOne({ _id: imageDoc._id }, { $set: { processingStatus: 'processing', moderationStatus: 'pending' } });

      // Placeholder for moderation provider integration.
      await pause(20);
      const moderationStatus = 'approved';

      const variants = {
        full: { url: imageDoc.imageUrl, width: 2400, height: 0 },
        medium: { url: imageDoc.imageUrl, width: 1200, height: 0 },
        thumb: { url: imageDoc.thumbnailUrl || imageDoc.imageUrl, width: 480, height: 0 },
      };

      await Image.updateOne(
        { _id: imageDoc._id },
        {
          $set: {
            variants,
            moderationStatus,
            processingStatus: moderationStatus === 'flagged' ? 'error' : 'ready',
            processedAt: new Date(),
            processingError: '',
          },
        },
      );
    } catch (error) {
      await Image.updateOne(
        { _id: imageDoc._id },
        {
          $set: {
            processingStatus: 'error',
            processingError: error.message || 'Image processing failed',
            processedAt: new Date(),
          },
        },
      );
    }
  });
};
