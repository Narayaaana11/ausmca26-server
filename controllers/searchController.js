const { search } = require('../services/searchIndex.service');

exports.globalSearch = async (req, res) => {
  try {
    const { q = '', types = '', category = '', year = '', page = 1, limit = 20 } = req.query;
    const parsedTypes = String(types)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const result = await search({
      query: String(q || '').trim(),
      types: parsedTypes,
      category: String(category || '').trim(),
      year: String(year || '').trim(),
      page,
      limit,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
