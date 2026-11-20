const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exeIcon, decode, encode, compose, ico, writeMarkedIcon } = require('../src/icon.js');

const solid = (size, rgba) => ({
  width: size, height: size, pixels: Buffer.alloc(size * size * 4, Buffer.from(rgba)),
});
const pixel = (image, x, y) => [...image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

// The smallest PE that carries an icon group: a 16px BMP entry the reader must skip, and the
// 256px PNG it must find - the shape of every Electron build's claude.exe.
function fakeExe(png) {
  const VA = 0x1000, RAW = 0x200;
  const bmp = Buffer.alloc(40);
  const group = Buffer.alloc(6 + 2 * 14);
  group.writeUInt16LE(1, 2); group.writeUInt16LE(2, 4);
  group[6] = 16; group[7] = 16; group.writeUInt16LE(1, 6 + 12);                  // id 1: 16px
  group.writeUInt16LE(2, 20 + 12);                                                // id 2: 256px
  const dir = (count) => { const d = Buffer.alloc(16); d.writeUInt16LE(count, 14); return d; };
  const entry = (id, to) => { const e = Buffer.alloc(8); e.writeUInt32LE(id, 0); e.writeUInt32LE(to, 4); return e; };
  // layout: root(2) | icons(2) | groups(1) | 3 language dirs | 3 data entries | data
  const LEAF = 0x80000000, icons = 32, groups = 64, langs = 88, datas = langs + 3 * 24, blobs = datas + 3 * 16;
  const parts = [dir(2), entry(3, LEAF + icons), entry(14, LEAF + groups),
    dir(2), entry(1, LEAF + langs), entry(2, LEAF + langs + 24),
    dir(1), entry(1, LEAF + langs + 48)];
  for (let i = 0; i < 3; i++) parts.push(dir(1), entry(1033, datas + i * 16));
  let at = blobs;
  for (const blob of [bmp, png, group]) {
    const d = Buffer.alloc(16); d.writeUInt32LE(VA + at, 0); d.writeUInt32LE(blob.length, 4);
    parts.push(d); at += blob.length;
  }
  const rsrc = Buffer.concat([...parts, bmp, png, group]);
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

test('a PNG survives encode and decode unchanged', () => {
  const image = solid(5, [10, 20, 30, 40]);
  image.pixels[7] = 255;
  assert.deepEqual(decode(encode(image)), image);
});

test("the exe's 256px PNG is found, past its smaller entries", () => {
  const png = encode(solid(256, [217, 119, 86, 255]));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartrtl-icon-'));
  try {
    fs.writeFileSync(path.join(dir, 'claude.exe'), fakeExe(png));
    assert.ok(exeIcon(path.join(dir, 'claude.exe')).equals(png));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the mark sits flush in the lower right corner and covers nothing else', () => {
  const icon = solid(256, [217, 119, 86, 255]);
  const mark = solid(116, [250, 249, 245, 255]);
  mark.pixels.fill(0, 0, 4);                          // one transparent pixel: the icon shows
  const out = compose(icon, mark);
  assert.deepEqual(pixel(out, 0, 0), [217, 119, 86, 255]);
  assert.deepEqual(pixel(out, 139, 139), [217, 119, 86, 255]);
  assert.deepEqual(pixel(out, 140, 140), [217, 119, 86, 255]);
  assert.deepEqual(pixel(out, 141, 141), [250, 249, 245, 255]);
  assert.deepEqual(pixel(out, 255, 255), [250, 249, 245, 255]);
});

test('an icon that is not 256px is refused rather than marked in the wrong place', () => {
  assert.throws(() => compose(solid(128, [0, 0, 0, 255]), solid(116, [0, 0, 0, 255])));
});

test('the ICO is one 256px entry around the PNG, and both files are written', () => {
  const png = encode(solid(256, [217, 119, 86, 255]));
  const file = ico(png);
  assert.equal(file.readUInt16LE(2), 1);
  assert.equal(file.readUInt16LE(4), 1);
  assert.equal(file[6], 0);
  assert.equal(file.readUInt32LE(14), png.length);
  assert.ok(file.subarray(22).equals(png));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartrtl-icon-'));
  try {
    fs.writeFileSync(path.join(dir, 'claude.exe'), fakeExe(png));
    writeMarkedIcon(path.join(dir, 'claude.exe'), path.join(__dirname, '../src/badge.png'), path.join(dir, 'marked'));
    const marked = decode(fs.readFileSync(path.join(dir, 'marked.png')));
    assert.deepEqual(pixel(marked, 0, 0), [217, 119, 86, 255]);
    assert.notDeepEqual(pixel(marked, 200, 200), [217, 119, 86, 255]);
    assert.ok(fs.readFileSync(path.join(dir, 'marked.ico')).subarray(22).equals(fs.readFileSync(path.join(dir, 'marked.png'))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
