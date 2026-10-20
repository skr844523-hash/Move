'use strict';
// اختبار شامل: خادم تيليجرام وهمي + خادم التطبيق الحقيقي + بناء ZIP والتحقق من محتواه
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const files = {
  'stickers/file_0.webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), Buffer.alloc(300, 7)]),
  'stickers/file_1.webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([9, 9, 9, 9]), Buffer.from('WEBPVP8 '), Buffer.alloc(500, 3)]),
  'stickers/file_2.tgs': Buffer.from([0x1f, 0x8b, 8, 0, 1, 2, 3, 4, 5, 6, 7]),
  'stickers/file_3.webm': Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]),
  'thumbnails/thumb_2.webp': Buffer.from('RIFFxxxxWEBPthumb2'),
  'thumbnails/thumb_3.webp': Buffer.from('RIFFxxxxWEBPthumb3')
};
const ids = { FILEID_STATIC_0: 'stickers/file_0.webp', FILEID_STATIC_1: 'stickers/file_1.webp', FILEID_ANIM_2: 'stickers/file_2.tgs', FILEID_VIDEO_3: 'stickers/file_3.webm', THUMBID_ANIM_2: 'thumbnails/thumb_2.webp', THUMBID_VIDEO_3: 'thumbnails/thumb_3.webm'.replace('.webm', '.webp') };

const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const j = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/botTESTTOKEN/getStickerSet') {
    if (u.searchParams.get('name') !== 'TestPack') return j({ ok: false, error_code: 400, description: 'Bad Request: STICKERSET_INVALID' });
    return j({ ok: true, result: { name: 'TestPack', title: 'حزمة تجريبية', stickers: [
      { file_id: 'FILEID_STATIC_0', file_unique_id: 'u0', emoji: '😀', is_animated: false, is_video: false },
      { file_id: 'FILEID_STATIC_1', file_unique_id: 'u1', emoji: '😂', is_animated: false, is_video: false },
      { file_id: 'FILEID_ANIM_2', file_unique_id: 'u2', emoji: '🔥', is_animated: true, is_video: false, thumbnail: { file_id: 'THUMBID_ANIM_2' } },
      { file_id: 'FILEID_VIDEO_3', file_unique_id: 'u3', emoji: '🎬', is_animated: false, is_video: true, thumbnail: { file_id: 'THUMBID_VIDEO_3' } }
    ] } });
  }
  if (u.pathname === '/botTESTTOKEN/getFile') {
    const p = ids[u.searchParams.get('file_id')];
    return p ? j({ ok: true, result: { file_path: p } }) : j({ ok: false, error_code: 400, description: 'Bad Request: invalid file_id' });
  }
  if (u.pathname.startsWith('/file/botTESTTOKEN/')) {
    const f = files[u.pathname.replace('/file/botTESTTOKEN/', '')];
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200); return res.end(f);
  }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => mock.listen(9101, r));
  process.env.BOT_TOKEN = 'TESTTOKEN';
  process.env.TELEGRAM_API_BASE = 'http://127.0.0.1:9101';
  const { createServer } = require('../server');
  const { ZipWriter } = require('../public/zip.js');
  const app = createServer();
  await new Promise((r) => app.listen(3100, r));
  const B = 'http://127.0.0.1:3100';
  let ok = 0; const pass = (m) => { ok++; console.log('✔', m); };

  // الواجهة تُخدَم
  let r = await fetch(B + '/'); let t = await r.text();
  assert(r.status === 200 && t.includes('Sticker'));
  pass('الصفحة الرئيسية تُخدَم');
  assert((await fetch(B + '/app.js')).status === 200 && (await fetch(B + '/zip.js')).status === 200 && (await fetch(B + '/style.css')).status === 200);
  pass('ملفات JS/CSS تُخدَم');
  assert((await fetch(B + '/..%2Fserver.js')).status !== 200);
  pass('حماية من اجتياز المسارات');

  // أخطاء
  r = await fetch(B + '/api/pack?name=' + encodeURIComponent('bad name!'));
  assert.strictEqual(r.status, 400); pass('اسم غير صالح → 400: ' + (await r.json()).error);
  r = await fetch(B + '/api/pack?name=Nope');
  assert.strictEqual(r.status, 404); pass('حزمة غير موجودة → 404: ' + (await r.json()).error);
  r = await fetch(B + '/api/file?id=' + encodeURIComponent('???'));
  assert.strictEqual(r.status, 400); pass('معرّف ملف غير صالح → 400');

  // جلب الحزمة
  r = await fetch(B + '/api/pack?name=TestPack');
  const pack = await r.json();
  assert.strictEqual(pack.count, 4);
  assert.deepStrictEqual(pack.stickers.map((s) => s.type), ['static', 'static', 'animated', 'video']);
  assert(!JSON.stringify(pack).includes('TESTTOKEN'));
  pass('جلب الحزمة: 4 ملصقات بأنواعها الصحيحة، ولا يظهر التوكن في الاستجابة');

  // محاكاة منطق المتصفح: تنزيل الملفات الفعلية وبناء ZIP
  const zip = new ZipWriter();
  const expected = {};
  for (const s of pack.stickers) {
    const res = await fetch(B + '/api/file?id=' + encodeURIComponent(s.id));
    assert.strictEqual(res.status, 200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = s.type === 'static' ? 'webp' : s.type === 'animated' ? 'tgs' : 'webm';
    const name = `TestPack_${String(s.index).padStart(3, '0')}.${ext}`;
    zip.add(name, bytes); expected[name] = Buffer.from(bytes);
  }
  // المعاينة للمتحرك تستخدم الصورة المصغّرة
  const th = await fetch(B + '/api/file?id=' + pack.stickers[2].thumb);
  assert.strictEqual(th.headers.get('content-type'), 'image/webp');
  pass('المعاينة المصغّرة للمتحرك تعمل (image/webp)');

  fs.writeFileSync('/tmp/TestPack.zip', zip.build());
  fs.writeFileSync('/tmp/expected.json', JSON.stringify(Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v.toString('hex')]))));
  pass('تم إنشاء /tmp/TestPack.zip');

  app.close(); mock.close();
  console.log(`\n${ok} اختبارات نجحت`);
})().catch((e) => { console.error('✘ فشل:', e); process.exit(1); });
