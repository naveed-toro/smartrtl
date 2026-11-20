/**
 * The SmartRTL mark drawn into a desktop app's own icon: three right-aligned lines on a small
 * tile in the icon's lower right corner, in the icon's own main colour, so the marked icon
 * still reads as the app's and only says which copy of it is running.
 *
 * Windows 11 draws a taskbar badge in the upper right, where it reads as an unread message; a
 * mark drawn into the icon stays where it is put. No image library: the icon is the largest
 * PNG in the app's exe, or its package's taskbar logo, and the mark is drawn here.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LIGHT_PAPER = [250, 249, 245], DARK_PAPER = [32, 32, 32];
const MARK_SHARE = 116 / 256;     // the tile's side, as a share of the icon's

/** The largest PNG in the exe's first icon group. */
function exeIcon(exe) {
  const fd = fs.openSync(exe, "r");
  try {
    const read = (position, length) => {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, position);
      return buffer;
    };
    const pe = read(0, 64).readUInt32LE(0x3c);
    const coff = read(pe, 24);
    const sectionCount = coff.readUInt16LE(6), optionalSize = coff.readUInt16LE(20);
    const optional = read(pe + 24, optionalSize);
    const directories = optional.readUInt16LE(0) === 0x20b ? 112 : 96;
    const rsrcRva = optional.readUInt32LE(directories + 16), rsrcSize = optional.readUInt32LE(directories + 20);
    const sections = read(pe + 24 + optionalSize, 40 * sectionCount);
    let section;
    for (let i = 0; i < sectionCount; i++) {
      const va = sections.readUInt32LE(i * 40 + 12), raw = sections.readUInt32LE(i * 40 + 20);
      if (rsrcRva >= va && rsrcRva < va + sections.readUInt32LE(i * 40 + 8)) section = { va, raw };
    }
    if (!section) throw new Error("the exe has no resource section");
    const offset = (rva) => section.raw + rva - section.va;
    const rsrc = read(offset(rsrcRva), rsrcSize);

    const entries = (at) => {
      const count = rsrc.readUInt16LE(at + 12) + rsrc.readUInt16LE(at + 14);
      return Array.from({ length: count }, (_, i) =>
        ({ id: rsrc.readUInt32LE(at + 16 + i * 8), to: rsrc.readUInt32LE(at + 20 + i * 8) }));
    };
    const data = (to) => {
      while (to & 0x80000000) to = entries(to & 0x7fffffff)[0].to;
      return read(offset(rsrc.readUInt32LE(to)), rsrc.readUInt32LE(to + 4));
    };
    const ofType = (type) => {
      const entry = entries(0).find((e) => e.id === type);
      if (!entry) throw new Error(`the exe has no resources of type ${type}`);
      return entries(entry.to & 0x7fffffff);
    };

    const group = data(ofType(14)[0].to);             // RT_GROUP_ICON
    const icons = ofType(3);                           // RT_ICON
    let best = null, bestWidth = 0;
    for (let i = 0; i < group.readUInt16LE(4); i++) {
      const at = 6 + i * 14, width = group[at] || 256;   // 0 means 256
      const icon = icons.find((e) => e.id === group.readUInt16LE(at + 12));
      const image = icon && data(icon.to);
      if (image && width > bestWidth && image.subarray(0, 8).equals(PNG_SIGNATURE)) {
        best = image;
        bestWidth = width;
      }
    }
    if (!best) throw new Error("the exe has no PNG icon");
    return best;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The taskbar logo a Windows package declares (Square44x44Logo), at every size the package draws
 * it, in one of its variants: "lightunplated" for a light taskbar, "unplated" for a dark one.
 * These are the images Windows itself puts on the taskbar, each drawn for its own size, so a
 * mark drawn into them keeps the app's own size and weight there. Smallest first.
 */
function packageLogos(root, variant) {
  const manifest = fs.readFileSync(path.join(root, "AppxManifest.xml"), "utf8");
  const logo = /Square44x44Logo="([^"]+)\.png"/i.exec(manifest);
  if (!logo) throw new Error("the package declares no Square44x44Logo");
  const parts = logo[1].split(/[\\/]/), stem = parts.pop().toLowerCase(), dir = path.join(root, ...parts);
  const ours = (name) => name.toLowerCase().startsWith(stem + ".targetsize-") && name.toLowerCase().endsWith(`_altform-${variant}.png`);
  const logos = fs.readdirSync(dir).filter(ours).map((name) => fs.readFileSync(path.join(dir, name)))
    .sort((a, b) => a.readUInt32BE(16) - b.readUInt32BE(16));        // IHDR width
  if (!logos.length || logos[logos.length - 1].readUInt32BE(16) !== 256) throw new Error(`the package has no 256px ${variant} logo`);
  return logos;
}

/** An 8-bit RGBA, non-interlaced PNG to { width, height, pixels }. */
function decode(png) {
  let width, height;
  const idat = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at), type = png.toString("latin1", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("not an 8-bit RGBA, non-interlaced PNG");
    } else if (type === "IDAT") idat.push(body);
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

function encode({ width, height, pixels }) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** The icon's main colour: the most common colour among its opaque pixels, roughly. */
function mainColour(icon) {
  const buckets = new Map();
  for (let i = 0; i < icon.pixels.length; i += 4) {
    if (icon.pixels[i + 3] < 200) continue;
    const r = icon.pixels[i], g = icon.pixels[i + 1], b = icon.pixels[i + 2];
    const key = (r >> 5) << 6 | (g >> 5) << 3 | b >> 5;
    const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
  }
  let top = null;
  for (const bucket of buckets.values()) if (!top || bucket.n > top.n) top = bucket;
  if (!top) throw new Error("the icon has no opaque pixels");
  return [top.r, top.g, top.b].map((sum) => Math.round(sum / top.n));
}

/**
 * The mark, size x size pixels: a tile with an ink border and three right-aligned ink lines, the
 * ragged edge on the left. The tile is light under a dark ink and dark under a light one, so the
 * lines always show. Drawn on a 128-unit grid, its edges antialiased.
 */
function drawMark(size, ink) {
  const paper = (0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2]) / 255 > 0.6 ? DARK_PAPER : LIGHT_PAPER;
  const box = (x0, y0, x1, y1, r) => (px, py) => {
    const qx = Math.abs(px - (x0 + x1) / 2) - ((x1 - x0) / 2 - r);
    const qy = Math.abs(py - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const outer = box(0, 0, 128, 128, 30), inner = box(8, 8, 120, 120, 22);
  const lines = [box(28, 32, 100, 48, 8), box(52, 56, 100, 72, 8), box(38, 80, 100, 96, 8)];
  const unit = 128 / size;
  const cover = (distance) => Math.min(1, Math.max(0, 0.5 - distance / unit));
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * unit, py = (y + 0.5) * unit;
      const tile = cover(outer(px, py));
      if (tile === 0) continue;
      const inked = Math.min(1, Math.max(tile - cover(inner(px, py)), ...lines.map((line) => cover(line(px, py)))) / tile);
      const at = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) pixels[at + c] = Math.round(ink[c] * inked + paper[c] * (1 - inked));
      pixels[at + 3] = Math.round(tile * 255);
    }
  }
  return { width: size, height: size, pixels };
}

/** The mark drawn over the icon, flush with its lower right corner. */
function compose(icon, mark) {
  const out = Buffer.from(icon.pixels);
  const left = icon.width - mark.width, top = icon.height - mark.height;
  for (let y = 0; y < mark.height; y++) {
    for (let x = 0; x < mark.width; x++) {
      const m = (y * mark.width + x) * 4, o = ((top + y) * icon.width + left + x) * 4;
      const ma = mark.pixels[m + 3] / 255, oa = out[o + 3] / 255;
      const a = ma + oa * (1 - ma);
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round((mark.pixels[m + c] * ma + out[o + c] * oa * (1 - ma)) / a);
      }
      out[o + 3] = Math.round(a * 255);
    }
  }
  return { width: icon.width, height: icon.height, pixels: out };
}

/** An ICO of PNG images of up to 256px each, which Windows has read since Vista. */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);                          // type: icon
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((png, i) => {
    const at = 6 + 16 * i;
    head[at] = head[at + 1] = png.readUInt32BE(16) % 256;   // IHDR width; 0 means 256
    head.writeUInt16LE(1, at + 4);                   // planes
    head.writeUInt16LE(32, at + 6);                  // bits per pixel
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs]);
}

/**
 * Writes <base>.png (the largest) and <base>.ico (every size): the icon with the mark drawn in,
 * at each size on its own. `source` is the path of an exe to take the icon from, or the icon as
 * PNGs, smallest first; the mark's colour comes from the largest.
 */
function writeMarkedIcon(source, base) {
  const icons = (typeof source === "string" ? [exeIcon(source)] : source).map(decode);
  if (icons.some((icon) => icon.width !== icon.height)) throw new Error("an icon is not square");
  const ink = mainColour(icons[icons.length - 1]);
  const pngs = icons.map((icon) => encode(compose(icon, drawMark(Math.round(icon.width * MARK_SHARE), ink))));
  fs.writeFileSync(base + ".png", pngs[pngs.length - 1]);
  fs.writeFileSync(base + ".ico", ico(pngs));
}

module.exports = { writeMarkedIcon, exeIcon, packageLogos, decode, encode, mainColour, drawMark, compose, ico };
