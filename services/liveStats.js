const User = require('../models/User');
const Memory = require('../models/Memory');
const Post = require('../models/Post');
const Event = require('../models/Event');

const STATS_CHANNEL = 'live-stats:update';
const STATS_INTERVAL_MS = 5000;

function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function getInteractionTotals(Model) {
  const [result] = await Model.aggregate([
    {
      $project: {
        likesCount: { $size: { $ifNull: ['$likes', []] } },
        commentsCount: { $size: { $ifNull: ['$comments', []] } },
      },
    },
    {
      $group: {
        _id: null,
        likes: { $sum: '$likesCount' },
        comments: { $sum: '$commentsCount' },
      },
    },
  ]);

  if (!result) return { likes: 0, comments: 0 };
  return { likes: result.likes || 0, comments: result.comments || 0 };
}

async function buildLiveStats(serverStartedAt) {
  const [users, memories, posts, events, memoryInteractions, postInteractions] = await Promise.all([
    User.countDocuments(),
    Memory.countDocuments(),
    Post.countDocuments(),
    Event.countDocuments(),
    getInteractionTotals(Memory),
    getInteractionTotals(Post),
  ]);

  const memoryBlocks = memories + posts + events;
  const totalInteractions =
    memoryInteractions.likes +
    memoryInteractions.comments +
    postInteractions.likes +
    postInteractions.comments;
  const activityBase = Math.max(memoryBlocks, 1);
  const spiritScore = Math.min(100, Math.round((totalInteractions / (activityBase * 5)) * 100));
  const uptimeSeconds = Math.floor((Date.now() - serverStartedAt) / 1000);

  return {
    activeNodes: users,
    memoryBlocks,
    uptimeSeconds,
    batchSpirit: spiritScore,
    display: {
      activeNodes: `${users}+`,
      memoryBlocks: `${memoryBlocks}+`,
      uptime: formatUptime(uptimeSeconds),
      batchSpirit: `${spiritScore}%`,
    },
    updatedAt: new Date().toISOString(),
  };
}

function setupLiveStats(io) {
  const serverStartedAt = Date.now();

  async function publishStats(target) {
    try {
      const payload = await buildLiveStats(serverStartedAt);
      target.emit(STATS_CHANNEL, payload);
    } catch (error) {
      console.error('Failed to publish live stats:', error.message);
    }
  }

  io.on('connection', (socket) => {
    publishStats(socket);
  });

  const intervalId = setInterval(() => publishStats(io), STATS_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
}

module.exports = setupLiveStats;
