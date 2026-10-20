'use strict';
// منطق التواصل مع Telegram Bot API (مشترك بين الخادم المحلي ودوال Vercel)

const API = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const NAME_RE = /^[A-Za-z0-9_]{1,64}$/;
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function token() {
  const t = process.env.BOT_TOKEN;
  if (!t) throw httpError(500, 'NO_TOKEN', 'الخادم غير مهيّأ: لم يتم ضبط BOT_TOKEN.');
  return t;
}

async function tg(method, params) {
  const url = `${API}/bot${token()}/${method}?${new URLSearchParams(params)}`;
  let res, json;
  try {
    res = await fetch(url);
    json = await res.json();
  } catch {
    throw httpError(502, 'UPSTREAM', 'تعذر الاتصال بتيليجرام. حاول مجددًا لاحقًا.');
  }
  if (!json.ok) {
    const d = String(json.description || '');
    if (/STICKERSET_INVALID|sticker set.*(not found|invalid)/i.test(d)) {
      throw httpError(404, 'NOT_FOUND', 'لم يتم العثور على حزمة بهذا الاسم. تأكد من الرابط.');
    }
    if (json.error_code === 401) {
      throw httpError(500, 'BAD_TOKEN', 'توكن البوت غير صحيح. راجع إعدادات الخادم.');
    }
    if (json.error_code === 429) {
      throw httpError(429, 'RATE', 'طلبات كثيرة، انتظر قليلًا ثم حاول مجددًا.');
    }
    throw httpError(502, 'TELEGRAM', 'رفض تيليجرام الطلب: ' + d);
  }
  return json.result;
}

function stickerType(s) {
  if (s.is_video) return 'video';
  if (s.is_animated) return 'animated';
  return 'static';
}

async function getPack(name) {
  if (!NAME_RE.test(name || '')) throw httpError(400, 'BAD_NAME', 'اسم الحزمة غير صالح.');
  const set = await tg('getStickerSet', { name });
  return {
    name: set.name,
    title: set.title,
    count: set.stickers.length,
    stickers: set.stickers.map((s, i) => ({
      index: i + 1,
      id: s.file_id,
      uid: s.file_unique_id,
      emoji: s.emoji || '',
      type: stickerType(s),
      thumb: s.thumbnail ? s.thumbnail.file_id : (s.thumb ? s.thumb.file_id : null)
    }))
  };
}

const MIME = { webp: 'image/webp', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', tgs: 'application/octet-stream' };

async function getFile(fileId) {
  if (!FILE_ID_RE.test(fileId || '')) throw httpError(400, 'BAD_ID', 'معرّف الملف غير صالح.');
  const info = await tg('getFile', { file_id: fileId });
  if (!info.file_path) throw httpError(404, 'NO_FILE', 'الملف غير متاح.');
  let res;
  try {
    res = await fetch(`${API}/file/bot${token()}/${info.file_path}`);
  } catch {
    throw httpError(502, 'UPSTREAM', 'تعذر تنزيل الملف من تيليجرام.');
  }
  if (!res.ok) throw httpError(502, 'UPSTREAM', 'تعذر تنزيل الملف من تيليجرام.');
  const ext = info.file_path.split('.').pop().toLowerCase();
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: MIME[ext] || 'application/octet-stream',
    ext
  };
}

module.exports = { getPack, getFile, httpError };
