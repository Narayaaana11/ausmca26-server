const Post = require('../models/Post');
const Image = require('../models/Image');
const { uploadImage, removeImageAssets } = require('../services/storage.service');
const { enqueueImageProcessing } = require('../services/imagePipeline.service');
const { upsertSearchDocument } = require('../services/searchIndex.service');

const getClientId = (req) => req.get('x-client-id')?.trim() || 'guest';

const normalizePost = (postDoc) => {
  const post = postDoc.toObject();
  const authorName = typeof post.author === 'object' && post.author?.name
    ? post.author.name
    : post.authorName || 'Batch Member';

  return {
    ...post,
    author: { name: post.isAnonymous ? 'Anonymous Node' : authorName },
  };
};

exports.getPosts = async (req, res) => {
  try {
    const { q = '', limit = 24, page = 1 } = req.query;
    const filter = {};
    if (q) filter.content = { $regex: q, $options: 'i' };

    const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [posts, total] = await Promise.all([
      Post.find(filter).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(safeLimit),
      Post.countDocuments(filter),
    ]);

    res.json({
      success: true,
      count: posts.length,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.max(Math.ceil(total / safeLimit), 1),
      posts: posts.map(normalizePost),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createPost = async (req, res) => {
  try {
    const isAnonymous = String(req.body.isAnonymous).toLowerCase() === 'true';
    const authorName = req.body.authorName?.trim() || 'Batch Member';
    let storage = null;

    if (req.file) {
      storage = await uploadImage({ file: req.file, folder: 'posts' });
    }

    const post = await Post.create({
      author: { name: authorName },
      authorName,
      isAnonymous,
      content: req.body.content,
      imageUrl: storage?.imageUrl || '',
      thumbnailUrl: storage?.thumbnailUrl || '',
      imageStorageId: storage?.cloudFileId || '',
      imageThumbStorageId: storage?.cloudThumbId || '',
    });

    if (storage) {
      const image = await Image.create({
        imageId: storage.cloudFileId,
        userId: getClientId(req),
        imageUrl: storage.imageUrl,
        thumbnailUrl: storage.thumbnailUrl,
        title: 'Wall post image',
        description: req.body.content || '',
        provider: storage.provider,
        cloudFileId: storage.cloudFileId,
        cloudThumbId: storage.cloudThumbId,
        mimeType: storage.mimeType,
        originalMimeType: storage.originalMimeType,
        size: storage.optimizedSize,
        originalSize: storage.originalSize,
        category: 'post',
        sourceRef: { kind: 'post', id: String(post._id) },
        processingStatus: 'pending',
        moderationStatus: 'pending',
      });

      enqueueImageProcessing(image);
    }

    await upsertSearchDocument({
      entityId: String(post._id),
      entityType: 'post',
      title: post.authorName,
      text: post.content,
      keywords: [post.isAnonymous ? 'anonymous' : 'named'],
      category: 'wall',
    });

    res.status(201).json({ success: true, post: normalizePost(post) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.likePost = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const idx = post.likes.indexOf(clientId);
    if (idx === -1) post.likes.push(clientId);
    else post.likes.splice(idx, 1);

    await post.save();
    res.json({ success: true, likes: post.likes.length, liked: idx === -1 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const clientId = getClientId(req);
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.comments.push({
      clientId,
      userName: req.body.userName?.trim() || 'Guest',
      text: req.body.text,
    });

    await post.save();
    res.json({ success: true, comments: post.comments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.imageStorageId || post.imageThumbStorageId) {
      await removeImageAssets({
        cloudFileId: post.imageStorageId,
        cloudThumbId: post.imageThumbStorageId,
      });
      await Image.deleteOne({ imageId: post.imageStorageId });
    }

    await post.deleteOne();
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
