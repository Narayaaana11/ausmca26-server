const SearchIndex = require('../models/SearchIndex');

const normalizeKeywords = (value = '') => {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 50);
};

exports.upsertSearchDocument = async ({ entityId, entityType, title = '', text = '', keywords = [], category = '', year = '' }) => {
  if (!entityId || !entityType) return;

  const normalizedKeywords = [...new Set([...keywords, ...normalizeKeywords(`${title} ${text}`)])];

  await SearchIndex.updateOne(
    { entityId, entityType },
    {
      $set: {
        entityId,
        entityType,
        title,
        text,
        keywords: normalizedKeywords,
        category,
        year,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
};

exports.search = async ({ query = '', types = [], category = '', year = '', limit = 20, page = 1 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  if (types.length) filter.entityType = { $in: types };
  if (category) filter.category = category;
  if (year) filter.year = year;

  if (query) {
    filter.$text = { $search: query };
  }

  const projection = query
    ? { score: { $meta: 'textScore' }, entityId: 1, entityType: 1, title: 1, text: 1, keywords: 1, category: 1, year: 1 }
    : { entityId: 1, entityType: 1, title: 1, text: 1, keywords: 1, category: 1, year: 1 };

  let builder = SearchIndex.find(filter, projection).skip(skip).limit(safeLimit);
  builder = query ? builder.sort({ score: { $meta: 'textScore' }, updatedAt: -1 }) : builder.sort({ updatedAt: -1 });

  const [items, total] = await Promise.all([builder.lean(), SearchIndex.countDocuments(filter)]);
  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(Math.ceil(total / safeLimit), 1),
  };
};
