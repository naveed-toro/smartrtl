/**
 * Builds of Claude Code, from the Marketplace, kept down to the four files anything here reads.
 *
 *   node build/fetch-claude-builds.js <folder> 2.1.268 2.1.200 2.0.50 ...
 *   node build/fetch-claude-builds.js <folder> --last 5
 *
 * Each build lands in <folder>/<version>/extension/ as package.json, extension.js,
 * webview/index.js and webview/index.css. The package itself is about a hundred megabytes,
 * nearly all of it a native binary nothing here needs, and it is never written to disk:
 * it is read in memory, the four files are taken out of it, and the rest is dropped.
 *
 * Why it exists: "measured on one build" is how the box you type into broke in 2.1.267 and
 * nothing noticed. Point test/history.test.js at the folder this writes -
 *
 *   SMARTRTL_CLAUDE_BUILDS=<folder> node --test test/history.test.js
 *
 * - and a claim about the box is put to every build in it, booted and typed into.
 *
 * No dependencies. A .vsix is a zip, and the four entries are found through its central
 * directory and inflated with node's own zlib.
 */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const zlib = require("node:zlib");

const PLATFORM = "linux-x64";          // the same bundle ships for every platform; this one is smallest
const WANTED = ["extension/package.json", "extension/extension.js",
                "extension/webview/index.js", "extension/webview/index.css"];

function get(url, body, depth = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: body ? "POST" : "GET", hostname: u.hostname, path: u.pathname + u.search,
      headers: Object.assign({ "Accept-Encoding": "gzip" }, body ? {
        "Content-Type": "application/json", "Accept": "application/json;api-version=3.0-preview.1"
      } : {})
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), null, depth + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + " answered " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        if (/gzip/i.test(res.headers["content-encoding"] || "")) buf = zlib.gunzipSync(buf);
        resolve(buf);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Every version published for the platform, newest first. */
async function versions() {
  const buf = await get("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: "anthropic.claude-code" }], pageSize: 1 }], flags: 1 }));
  const ext = JSON.parse(buf.toString("utf8")).results[0].extensions[0];
  return ext.versions.filter((v) => v.targetPlatform === PLATFORM).map((v) => v.version);
}

/** The named entries of a zip, out of its central directory. */
function unzip(zip, names) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip: no end of central directory");
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("the central directory is damaged");
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28), extraLen = zip.readUInt16LE(at + 30), commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLen);
    if (names.includes(name)) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      out[name] = method === 0 ? Buffer.from(data) : method === 8 ? zlib.inflateRawSync(data) : null;
      if (!out[name]) throw new Error(name + " is packed in a way this does not read (" + method + ")");
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function fetchOne(folder, version) {
  const dest = path.join(folder, version, "extension");
  if (fs.existsSync(path.join(dest, "webview", "index.js"))) return "already there";
  const url = "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/anthropic/vsextensions/claude-code/" +
              version + "/vspackage?targetPlatform=" + PLATFORM;
  let zip;
  for (let attempt = 1; ; attempt++) {
    try { zip = await get(url); break; }
    catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  const files = unzip(zip, WANTED);
  for (const name of WANTED) {
    if (!files[name]) throw new Error(version + " has no " + name);
    const to = path.join(folder, version, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, files[name]);
  }
  return "fetched";
}

async function main() {
  const [folder, ...rest] = process.argv.slice(2);
  if (!folder || !rest.length) {
    console.error("usage: node build/fetch-claude-builds.js <folder> <version>... | --last N");
    process.exit(2);
  }
  let list = rest;
  if (rest[0] === "--last") list = (await versions()).slice(0, Number(rest[1]) || 3);
  for (const v of list) {
    try { console.log(v.padEnd(10), await fetchOne(folder, v)); }
    catch (e) { console.log(v.padEnd(10), "FAILED -", e.message); process.exitCode = 1; }
  }
}

if (require.main === module) main();
module.exports = { unzip, versions, fetchOne };
