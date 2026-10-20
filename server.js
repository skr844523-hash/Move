'use strict';
// خادم بسيط بدون أي حزم خارجية: يخدم الواجهة + /api/pack + /api/file
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// قراءة .env يدويًا (إن وُجد)
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* لا يوجد .env */ }

const { getPack, getFile } = require('./lib/telegram');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/pack') {
        res.setHeader('Cache-Control', 'public, max-age=60');
        return sendJson(res, 200, await getPack(url.searchParams.get('name') || ''));
      }
      if (url.pathname === '/api/file') {
        const f = await getFile(url.searchParams.get('id') || '');
        res.writeHead(200, { 'Content-Type': f.contentType, 'Cache-Control': 'public, max-age=86400, immutable' });
        return res.end(f.buffer);
      }
      if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, token: !!process.env.BOT_TOKEN });
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.message, code: e.code || 'ERROR' });
    }
    // ملفات ثابتة
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  if (!process.env.BOT_TOKEN) console.warn('⚠️  BOT_TOKEN غير مضبوط. أنشئ ملف .env (انظر .env.example).');
  createServer().listen(port, () => console.log(`Sticker ZIP يعمل على http://localhost:${port}`));
}

module.exports = { createServer };
