/**
 * Everything that knows about an installed Qoder IDE - used by patch.js and uninstall.js from
 * the command line, and by the extension each time Qoder opens.
 *
 * Two pages load the chat: the workbench and the agents window. Each gets one line - a plain
 * script tag before its <body> - so the script runs before the page's own module code. The
 * script itself sits beside the workbench page; nothing else of Qoder's is changed.
 *
 * Qoder, like VS Code, checks its own files at startup against product.json "checksums" and
 * calls a changed file a corrupt installation. So the checksum of each changed page is
 * rewritten to match - the same formula Qoder uses (sha256, base64, no trailing "=").
 *
 * A Qoder update puts a whole fresh copy of Qoder in place (Inno Setup, as VS Code), and with
 * it pages without the line. apply() is safe to call at any time: when the line is there it
 * changes nothing, when it is gone it puts it back.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCRIPT = "smartrtl-qoder.js";
const EXTENSION_ID = "smartrtl.smartrtl-qoder";
const PAGES = [
  {
    file: "out/vs/code/electron-browser/workbench/workbench.html",
    key: "vs/code/electron-browser/workbench/workbench.html",
    src: "./" + SCRIPT
  },
  {
    file: "out/lingma/agents-window/electron-browser/agents-window.html",
    key: "lingma/agents-window/electron-browser/agents-window.html",
    src: "../../../vs/code/electron-browser/workbench/" + SCRIPT
  }
];
const SCRIPT_FILE = "out/vs/code/electron-browser/workbench/" + SCRIPT;
const TAG = /[ \t]*<script src="[^"]*smartrtl-qoder\.js"><\/script>\r?\n/;

function appRoot() {
  if (process.env.SMARTRTL_QODER_APP) return path.resolve(process.env.SMARTRTL_QODER_APP);
  return path.join(process.env.LOCALAPPDATA || "", "Programs", "Qoder IDE", "resources", "app");
}

function smartHome() {
  return process.env.SMARTRTL_HOME || path.join(process.env.LOCALAPPDATA || "", "SmartRTL");
}

/** Qoder's own formula for product.json "checksums". */
function checksum(buf) {
  return crypto.createHash("sha256").update(buf).digest("base64").replace(/=+$/, "");
}

function isPatched(html) { return TAG.test(html); }

/** The page with our one line before its <body>, in the page's own line ending and indent. */
function addTag(html, src) {
  if (isPatched(html)) return html;
  const m = /(\r?\n)([ \t]*)<body[\s>]/.exec(html);
  if (!m) throw new Error("the page has no <body> line to put the script before");
  const at = m.index + m[1].length;
  return html.slice(0, at) + m[2] + '<script src="' + src + '"></script>' + m[1] + html.slice(at);
}

/** The page exactly as it was before addTag. */
function removeTag(html) { return html.replace(TAG, ""); }

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"); }

function readChecksum(product, key) {
  const m = new RegExp('"' + escapeRe(key) + '"\\s*:\\s*"([^"]*)"').exec(product);
  return m ? m[1] : null;
}

/** product.json text with one checksum changed and every other byte left as it was. */
function writeChecksum(product, key, value) {
  const re = new RegExp('("' + escapeRe(key) + '"\\s*:\\s*")([^"]*)(")');
  if (!re.test(product)) throw new Error("product.json has no checksum for " + key);
  return product.replace(re, function (_, a, __, c) { return a + value + c; });
}

function requireWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Refusing a filesystem operation outside its directory");
  }
}

function version(app) {
  try { return JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8")).version || "unknown"; }
  catch (e) { return "unknown"; }
}

/** One at a time: every open Qoder window may call apply() at the same moment. */
function locked(home, fn) {
  fs.mkdirSync(home, { recursive: true });
  const lock = path.join(home, "qoder.lock");
  for (let tries = 0; ; tries++) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 60000) { fs.rmdirSync(lock); continue; } } catch (x) {}
      if (tries >= 50) throw new Error("another Qoder window is putting the fix in place");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch (e) {} }
}

/**
 * Puts the fix in place, or leaves it as it is when it already is.
 * @returns {{version: string, pages: string[], script: boolean}} the pages that got the line, and
 *   whether the script file was written
 */
function apply(opts) {
  const app = opts.app || appRoot();
  const home = opts.home || smartHome();
  const productFile = path.join(app, "product.json");
  if (!fs.existsSync(productFile)) throw new Error("Qoder IDE is not installed at " + app);
  return locked(home, function () {
    const ver = version(app);
    let product = fs.readFileSync(productFile, "utf8");
    const pages = PAGES.map((p) => ({ ...p, path: path.join(app, p.file) }));
    const bare = pages.filter((p) => !isPatched(fs.readFileSync(p.path, "utf8")));

    // a page without the line must be the one Qoder shipped, or the checksum formula is not Qoder's
    for (const p of bare) {
      if (readChecksum(product, p.key) !== checksum(fs.readFileSync(p.path))) {
        throw new Error(p.file + " is not the file Qoder shipped (its checksum differs); nothing was changed");
      }
    }

    // the untouched files, kept once per Qoder version
    const backup = path.join(home, "qoder", ver);
    requireWithin(home, backup);
    if (bare.length === pages.length && !fs.existsSync(path.join(backup, "smartrtl-backup.json"))) {
      fs.mkdirSync(backup, { recursive: true });
      fs.copyFileSync(productFile, path.join(backup, "product.json"));
      for (const p of pages) fs.copyFileSync(p.path, path.join(backup, path.basename(p.path)));
      fs.writeFileSync(path.join(backup, "smartrtl-backup.json"), JSON.stringify({
        version: ver, app, keptAt: new Date().toISOString(),
        checksums: Object.fromEntries(pages.map((p) => [p.key, readChecksum(product, p.key)]))
      }, null, 1));
    }

    // the script beside the workbench page, written only when it differs
    const fresh = fs.readFileSync(opts.script);
    const target = path.join(app, SCRIPT_FILE);
    const script = !fs.existsSync(target) || !fresh.equals(fs.readFileSync(target));
    if (script) fs.writeFileSync(target, fresh);

    // one line in each page that lacks it, and that page's checksum
    for (const p of bare) {
      fs.writeFileSync(p.path, addTag(fs.readFileSync(p.path, "utf8"), p.src), "utf8");
      product = writeChecksum(product, p.key, checksum(fs.readFileSync(p.path)));
    }
    if (bare.length) fs.writeFileSync(productFile, product, "utf8");

    // read back: every page loads the script, and every checksum matches its page
    const after = fs.readFileSync(productFile, "utf8");
    for (const p of pages) {
      const buf = fs.readFileSync(p.path);
      if (!isPatched(buf.toString("utf8"))) throw new Error(p.file + " does not load the script");
      if (readChecksum(after, p.key) !== checksum(buf)) throw new Error(p.file + "'s checksum does not match");
    }
    return { version: ver, pages: bare.map((p) => p.file), script };
  });
}

/**
 * Takes the fix away: the line out of both pages, each checksum back to match, the script file,
 * and the kept copies. The line is taken out rather than an old copy put back, so a Qoder that
 * has updated since is never handed an older page.
 * @returns {string[]} what was done, one line each
 */
function remove(opts) {
  const app = (opts && opts.app) || appRoot();
  const home = (opts && opts.home) || smartHome();
  const productFile = path.join(app, "product.json");
  if (!fs.existsSync(productFile)) throw new Error("Qoder IDE is not installed at " + app);
  return locked(home, function () {
    const done = [];
    const keptFile = path.join(home, "qoder", version(app), "smartrtl-backup.json");
    const kept = fs.existsSync(keptFile) ? JSON.parse(fs.readFileSync(keptFile, "utf8")) : null;
    let product = fs.readFileSync(productFile, "utf8");
    let changed = false;
    for (const p of PAGES) {
      const file = path.join(app, p.file);
      const html = fs.readFileSync(file, "utf8");
      if (!isPatched(html)) { done.push("clean    " + p.file); continue; }
      fs.writeFileSync(file, removeTag(html), "utf8");
      const sum = checksum(fs.readFileSync(file));
      product = writeChecksum(product, p.key, sum);
      changed = true;
      const shipped = kept && kept.checksums && kept.checksums[p.key];
      done.push("restored " + p.file + (shipped ? (shipped === sum ? " (as shipped)" : " (differs from the kept copy - Qoder has changed it)") : ""));
    }
    if (changed) fs.writeFileSync(productFile, product, "utf8");
    const script = path.join(app, SCRIPT_FILE);
    if (fs.existsSync(script)) { fs.rmSync(script); done.push("removed  " + SCRIPT_FILE); }
    const copies = path.join(home, "qoder");
    if (fs.existsSync(copies)) {
      requireWithin(home, copies);
      fs.rmSync(copies, { recursive: true, force: true });
      done.push("removed  " + copies);
    }
    return done;
  });
}

module.exports = {
  SCRIPT, SCRIPT_FILE, EXTENSION_ID, PAGES, appRoot, smartHome, checksum, isPatched, addTag,
  removeTag, readChecksum, writeChecksum, requireWithin, version, apply, remove
};
