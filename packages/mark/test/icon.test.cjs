const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exeIcon, decode, encode, mainColour, drawMark, compose, ico, writeMarkedIcon } = require('../src/icon.js');

const CLAUDE = [217, 119, 86, 255];
const solid = (size, rgba) => ({
  width: size, height: size, pixels: Buffer.alloc(size * size * 4, Buffer.from(rgba)),
});
const pixel = (image, x, y) => [...image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

// The smallest PE that carries an icon group, one RT_ICON per image, in the shape of an
// Electron build's exe.
function fakeExe(images) {
  const VA = 0x1000, RAW = 0x200, LEAF = 0x80000000;
  const group = Buffer.alloc(6 + images.length * 14);
  group.writeUInt16LE(1, 2); group.writeUInt16LE(images.length, 4);
  images.forEach(({ width }, i) => { group[6 + i * 14] = width % 256; group.writeUInt16LE(i + 1, 6 + i * 14 + 12); });
  const blobs = [...images.map((image) => image.data), group];
  const dir = (count) => { const d = Buffer.alloc(16); d.writeUInt16LE(count, 14); return d; };
  const entry = (id, to) => { const e = Buffer.alloc(8); e.writeUInt32LE(id, 0); e.writeUInt32LE(to, 4); return e; };
  // root(2) | icons(n) | groups(1) | one language dir per blob | one data entry per blob | blobs
  const icons = 32, groups = icons + 16 + 8 * images.length, langs = groups + 24;
  const datas = langs + 24 * blobs.length, start = datas + 16 * blobs.length;
  const parts = [dir(2), entry(3, LEAF + icons), entry(14, LEAF + groups), dir(images.length)];
  images.forEach((_, i) => parts.push(entry(i + 1, LEAF + langs + 24 * i)));
  parts.push(dir(1), entry(1, LEAF + langs + 24 * images.length));
  blobs.forEach((_, i) => parts.push(dir(1), entry(1033, datas + 16 * i)));
  let at = start;
  for (const blob of blobs) {
    const d = Buffer.alloc(16); d.writeUInt32LE(VA + at, 0); d.writeUInt32LE(blob.length, 4);
    parts.push(d); at += blob.length;
  }
  const rsrc = Buffer.concat([...parts, ...blobs]);
  const head = Buffer.alloc(RAW);
  head.writeUInt32LE(64, 0x3c);
  head.write('PE\0\0', 64, 'latin1');
  head.writeUInt16LE(1, 64 + 4 + 2);                 // one section
  head.writeUInt16LE(240, 64 + 4 + 16);              // optional header size (PE32+)
  const opt = 64 + 24;
  head.writeUInt16LE(0x20b, opt);
  head.writeUInt32LE(VA, opt + 112 + 16); head.writeUInt32LE(rsrc.length, opt + 112 + 20);
  const sec = opt + 240;
  head.write('.rsrc', sec, 'latin1');
  head.writeUInt32LE(rsrc.length, sec + 8); head.writeUInt32LE(VA, sec + 12);
  head.writeUInt32LE(rsrc.length, sec + 16); head.writeUInt32LE(RAW, sec + 20);
  return Buffer.concat([head, rsrc]);
}

function inTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartrtl-mark-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('a PNG survives encode and decode unchanged', () => {
  const image = solid(5, [10, 20, 30, 40]);
  image.pixels[7] = 255;
  assert.deepEqual(decode(encode(image)), image);
});

test("the exe's largest PNG is found, past BMP entries and smaller PNGs", () => {
  const big = encode(solid(256, CLAUDE));
  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, 'app.exe'), fakeExe([
      { width: 16, data: Buffer.alloc(40) }, { width: 64, data: encode(solid(64, CLAUDE)) }, { width: 256, data: big },
    ]));
    assert.ok(exeIcon(path.join(dir, 'app.exe')).equals(big));
  });
});

test("the icon's main colour is its most common opaque one", () => {
  const icon = solid(10, CLAUDE);
  icon.pixels.fill(255, 0, 4 * 30);                   // 30 white pixels
  icon.pixels.fill(0, 4 * 30, 4 * 50);                // 20 transparent ones, not counted
  assert.deepEqual(mainColour(icon), [217, 119, 86]);
});

test('the mark is a tile with an ink border and right-aligned ink lines, corners clear', () => {
  const ink = [40, 42, 54];
  const mark = drawMark(128, ink);
  assert.equal(pixel(mark, 0, 0)[3], 0);              // rounded corner
  assert.deepEqual(pixel(mark, 64, 2), [...ink, 255]);          // border
  assert.deepEqual(pixel(mark, 64, 52), [250, 249, 245, 255]);  // paper between lines
  assert.deepEqual(pixel(mark, 95, 40), [...ink, 255]);         // the lines meet the right edge
  assert.deepEqual(pixel(mark, 95, 88), [...ink, 255]);
  assert.deepEqual(pixel(mark, 32, 64), [250, 249, 245, 255]);  // the left edge is ragged
});

test('the mark sits flush in the lower right corner and covers nothing else', () => {
  const out = compose(solid(256, CLAUDE), solid(116, [250, 249, 245, 255]));
  assert.deepEqual(pixel(out, 139, 139), CLAUDE);
  assert.deepEqual(pixel(out, 140, 140), [250, 249, 245, 255]);
  assert.deepEqual(pixel(out, 255, 255), [250, 249, 245, 255]);
});

test('the marked icon is written as a PNG and as an ICO around it, in the icon\'s colour', () => {
  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, 'app.exe'), fakeExe([{ width: 256, data: encode(solid(256, CLAUDE)) }]));
    writeMarkedIcon(path.join(dir, 'app.exe'), path.join(dir, 'marked'));
    const png = fs.readFileSync(path.join(dir, 'marked.png'));
    const marked = decode(png);
    assert.deepEqual(pixel(marked, 0, 0), CLAUDE);
    assert.deepEqual(pixel(marked, 255 - 58, 255 - 114), CLAUDE.slice(0, 3).concat(255));   // the border
    const file = fs.readFileSync(path.join(dir, 'marked.ico'));
    assert.equal(file.readUInt16LE(4), 1);
    assert.equal(file[6], 0);                         // 256
    assert.ok(file.subarray(22).equals(png));
    assert.equal(ico(png, 48)[6], 48);
  });
});
