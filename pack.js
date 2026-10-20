'use strict';
// Vercel Serverless Function: GET /api/pack?name=PackName
const { getPack } = require('../lib/telegram');

module.exports = async (req, res) => {
  try {
    const data = await getPack(String(req.query.name || ''));
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code || 'ERROR' });
  }
};
