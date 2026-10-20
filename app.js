(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = {
    url: $('url'), fetchBtn: $('fetchBtn'), msg: $('msg'), result: $('result'),
    title: $('packTitle'), meta: $('packMeta'), grid: $('grid'), fmt: $('fmt'),
    extra: $('extra'), extraOpt: $('extraOpt'), zipBtn: $('zipBtn'), prog: $('prog'),
    fill: $('barFill'), progText: $('progText'), done: $('done'), theme: $('themeBtn')
  };
  let pack = null;
  let busy = false;

  /* ---------- الوضع الداكن ---------- */
  el.theme.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ---------- أدوات ---------- */
  function showError(text) { el.msg.textContent = text; el.msg.hidden = false; }
  function clearError() { el.msg.hidden = true; el.msg.textContent = ''; }

  function parsePackName(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    let m = s.match(/(?:t\.me|telegram\.me|telegram\.dog)\/(?:addstickers|addemoji)\/([A-Za-z0-9_]{1,64})/i);
    if (m) return m[1];
    m = s.match(/^tg:\/\/(?:addstickers|addemoji)\?set=([A-Za-z0-9_]{1,64})/i);
    if (m) return m[1];
    if (/^[A-Za-z0-9_]{1,64}$/.test(s)) return s;
    return null;
  }

  async function api(path) {
    let res;
    try { res = await fetch(path); }
    catch { throw new Error('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.'); }
    if (!res.ok) {
      let msg = 'حدث خطأ غير متوقع (' + res.status + ').';
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return res;
  }

  const TYPE_LABEL = { static: 'WebP', animated: 'TGS', video: 'WEBM' };

  /* ---------- جلب الحزمة ---------- */
  async function loadPack() {
    if (busy) return;
    clearError();
    el.done.hidden = true;
    const name = parsePackName(el.url.value);
    if (!name) {
      showError('الرابط غير صالح. استخدم رابطًا مثل: https://t.me/addstickers/PackName');
      return;
    }
    busy = true;
    el.fetchBtn.disabled = true;
    el.fetchBtn.textContent = 'جارٍ الجلب…';
    try {
      const res = await api('/api/pack?name=' + encodeURIComponent(name));
      pack = await res.json();
      renderPack();
    } catch (e) {
      pack = null;
      el.result.hidden = true;
      showError(e.message);
    } finally {
      busy = false;
      el.fetchBtn.disabled = false;
      el.fetchBtn.textContent = 'جلب الملصقات';
    }
  }

  function renderPack() {
    el.title.textContent = pack.title;
    const counts = { static: 0, animated: 0, video: 0 };
    pack.stickers.forEach((s) => counts[s.type]++);
    const parts = [];
    if (counts.static) parts.push(counts.static + ' ثابت');
    if (counts.animated) parts.push(counts.animated + ' متحرك (TGS)');
    if (counts.video) parts.push(counts.video + ' فيديو (WEBM)');
    el.meta.textContent = pack.count + ' ملصق — ' + parts.join('، ');
    el.extraOpt.hidden = !(counts.animated || counts.video);
    el.fmt.parentElement.hidden = !counts.static;

    el.grid.textContent = '';
    for (const s of pack.stickers) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const previewId = s.type === 'static' ? s.id : s.thumb;
      const placeholder = () => {
        cell.textContent = '';
        const ph = document.createElement('span');
        ph.className = 'ph';
        ph.textContent = s.emoji || '🖼️';
        cell.appendChild(ph);
      };
      if (previewId) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = s.emoji || 'ملصق';
        img.src = '/api/file?id=' + encodeURIComponent(previewId);
        img.onerror = () => { placeholder(); appendTag(); };
        cell.appendChild(img);
      } else {
        placeholder();
      }
      function appendTag() {
        if (s.type === 'static') return;
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = TYPE_LABEL[s.type];
        cell.appendChild(tag);
      }
      appendTag();
      el.grid.appendChild(cell);
    }
    el.prog.hidden = true;
    el.done.hidden = true;
    el.zipBtn.disabled = false;
    el.result.hidden = false;
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- التنزيل وبناء ZIP ---------- */
  async function toPng(bytes) {
    const blob = new Blob([bytes], { type: 'image/webp' });
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    const out = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!out) throw new Error('فشل تحويل الصورة إلى PNG.');
    return new Uint8Array(await out.arrayBuffer());
  }

  async function fetchBytes(id) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await api('/api/file?id=' + encodeURIComponent(id));
        return new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  function setProgress(pct, text) {
    el.fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    el.progText.textContent = text;
  }

  async function makeZip() {
    if (!pack || busy) return;
    busy = true;
    clearError();
    el.done.hidden = true;
    el.zipBtn.disabled = true;
    el.fetchBtn.disabled = true;
    el.prog.hidden = false;

    const wantPng = el.fmt.value === 'png';
    const wantExtra = el.extra.checked;
    const list = pack.stickers.filter((s) => s.type === 'static' || wantExtra);
    const skipped = pack.count - list.length;

    try {
      if (!list.length) throw new Error('لا توجد ملصقات مطابقة للخيارات المحددة.');
      const pad = String(list.length).length < 3 ? 3 : String(list.length).length;
      const zip = new ZipWriter();
      let done = 0;
      let next = 0;
      setProgress(0, 'جارٍ التحميل… 0 / ' + list.length);

      async function worker() {
        while (true) {
          const i = next++;
          if (i >= list.length) return;
          const s = list[i];
          let bytes = await fetchBytes(s.id);
          let ext = s.type === 'static' ? 'webp' : s.type === 'animated' ? 'tgs' : 'webm';
          if (s.type === 'static' && wantPng) {
            bytes = await toPng(bytes);
            ext = 'png';
          }
          s._file = { name: pack.name + '_' + String(i + 1).padStart(pad, '0') + '.' + ext, bytes };
          done++;
          setProgress((done / list.length) * 90, 'جارٍ التحميل… ' + done + ' / ' + list.length);
        }
      }
      await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));

      setProgress(92, 'جارٍ تجهيز ملف ZIP…');
      await new Promise((r) => setTimeout(r, 30)); // السماح للواجهة بالتحديث
      for (const s of list) { zip.add(s._file.name, s._file.bytes); s._file = null; }
      const data = zip.build();
      const blob = new Blob([data], { type: 'application/zip' });
      setProgress(100, 'اكتمل!');

      const fileName = pack.name + '.zip';
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      el.done.textContent = 'تم تجهيز ' + fileName + ' (' + list.length + ' ملف، ' +
        (data.length / 1048576).toFixed(2) + ' MB).' +
        (skipped ? ' تم استثناء ' + skipped + ' ملصق متحرك/فيديو.' : '') +
        ' إن لم يبدأ التنزيل تلقائيًا فاضغط الزر مرة أخرى.';
      el.done.hidden = false;
    } catch (e) {
      el.prog.hidden = true;
      showError(e.message || 'حدث خطأ أثناء تجهيز الملف.');
    } finally {
      busy = false;
      el.zipBtn.disabled = false;
      el.fetchBtn.disabled = false;
    }
  }

  el.fetchBtn.addEventListener('click', loadPack);
  el.url.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadPack(); });
  el.zipBtn.addEventListener('click', makeZip);
})();
