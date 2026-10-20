'use strict';
// Vercel Serverless Function: GET /api/file?id=FILE_ID
const { getFile } = require('../lib/telegram');

module.exports = async (req, res) => {
  try {
    const f = await getFile(String(req.query.id || ''));
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.status(200).send(f.buffer);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code || 'ERROR' });
  }
};
