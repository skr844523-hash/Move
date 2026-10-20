// كاتب ZIP صغير بدون مكتبات (تخزين بدون ضغط؛ ملفات WebP/WebM/TGS مضغوطة أصلًا)
(function (root) {
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  class ZipWriter {
    constructor() { this.entries = []; }
    add(name, data) {
      this.entries.push({ name, data: data instanceof Uint8Array ? data : new Uint8Array(data) });
    }
    build() {
      const enc = new TextEncoder();
      const d = new Date();
      const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const parts = [];
      const central = [];
      let offset = 0;

      for (const e of this.entries) {
        const nameBytes = enc.encode(e.name);
        const crc = crc32(e.data);
        const size = e.data.length;

        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true);
        lh.setUint16(4, 20, true);
        lh.setUint16(6, 0x0800, true); // UTF-8
        lh.setUint16(8, 0, true);      // stored
        lh.setUint16(10, time, true);
        lh.setUint16(12, date, true);
        lh.setUint32(14, crc, true);
        lh.setUint32(18, size, true);
        lh.setUint32(22, size, true);
        lh.setUint16(26, nameBytes.length, true);
        lh.setUint16(28, 0, true);
        parts.push(new Uint8Array(lh.buffer), nameBytes, e.data);

        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true);
        ch.setUint16(4, 20, true);
        ch.setUint16(6, 20, true);
        ch.setUint16(8, 0x0800, true);
        ch.setUint16(10, 0, true);
        ch.setUint16(12, time, true);
        ch.setUint16(14, date, true);
        ch.setUint32(16, crc, true);
        ch.setUint32(20, size, true);
        ch.setUint32(24, size, true);
        ch.setUint16(28, nameBytes.length, true);
        ch.setUint32(42, offset, true);
        central.push(new Uint8Array(ch.buffer), nameBytes);

        offset += 30 + nameBytes.length + size;
      }

      let cdSize = 0;
      for (const p of central) cdSize += p.length;

      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, this.entries.length, true);
      end.setUint16(10, this.entries.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);

      const all = [...parts, ...central, new Uint8Array(end.buffer)];
      const total = all.reduce((n, p) => n + p.length, 0);
      const out = new Uint8Array(total);
      let pos = 0;
      for (const p of all) { out.set(p, pos); pos += p.length; }
      return out;
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { ZipWriter, crc32 };
  else root.ZipWriter = ZipWriter;
})(typeof window !== 'undefined' ? window : globalThis);
