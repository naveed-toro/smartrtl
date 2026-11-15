/**
 * What this extension changes in one copy of Codex, and how it takes it back.
 *
 * Codex draws its panel from one page, webview/index.html. Its host reads that page once per
 * window, fills in a <base> pointing at Codex's own webview folder and a CSP whose script-src
 * is that same folder, and hands it to the webview. So a script that sits in that folder, named
 * by one line in that page, is loaded like any of Codex's own - nothing is loosened to let it in.
 *
 * The whole footprint is therefore two things, both in Codex's folder:
 *
 *   webview/smartrtl-codex.js    the shared rule and engine, and the adapter (build/bundle.js)
 *   one line before </head>      <script async src="./smartrtl-codex.js" data-smartrtl="codex">
 *
 * `async`, because Codex's host gives its page 30 seconds to report ready and then gives up on
 * it: a plain script in <head> holds the page's parser, and with it Codex's own scripts, until it
 * has been fetched and run. An async one is fetched beside them and holds nothing.
 *
 * Taking it out deletes that line and that file, and the page is back to the byte - asserted
 * by a test, not hoped for. Applying over an identical fix writes nothing.
 *
 * There is deliberately no `vscode` in here. The uninstall hook runs as a plain node script and
 * has to find exactly what the extension put in; one copy of the fact, used by both.
 */
const fs = require("node:fs");
const path = require("node:path");

const SCRIPT_FILE = "smartrtl-codex.js";
const TAG = '<script async src="./' + SCRIPT_FILE + '" data-smartrtl="codex"></script>';
const BEGIN = "/* ==== smart-rtl-direction patch BEGIN ==== */";
/* Any line this extension has ever written - 0.1.0's had no `async` - so an older one is
   replaced, and taken out, like the current one. */
const ANY = '<script\\b[^>]*\\bdata-smartrtl="codex"[^>]*></script>';
const OWN_LINE = new RegExp("^[ \\t]*" + ANY + "\\r?\\n", "m");
const BARE = new RegExp(ANY, "g");

/* A Codex folder's name: "openai.chatgpt-26.1111.21308", and on most machines a platform
   after it - "-win32-x64". */
const PREFIX = "openai.chatgpt-";
const FOLDER = /^openai\.chatgpt-(\d+)\.(\d+)\.(\d+)(?:-[a-z0-9-]+)?$/i;

function pageOf(dir) {
  const page = path.join(dir, "webview", "index.html");
  try { return fs.statSync(page).isFile() ? page : null; } catch (e) { return null; }
}

const tagged = (html) => new RegExp(ANY).test(html);

/** The page with the line in it, on a line of its own just before </head> when it can be. */
function addTag(html) {
  if (html.includes(TAG) && (html.match(BARE) || []).length === 1) return html;
  html = removeTag(html);
  const at = html.indexOf("</head>");
  if (at < 0) return null;
  const start = html.lastIndexOf("\n", at - 1) + 1;
  if (/^[ \t]*$/.test(html.slice(start, at))) {
    const nl = start >= 2 && html[start - 2] === "\r" ? "\r\n" : "\n";
    return html.slice(0, start) + "    " + TAG + nl + html.slice(start);
  }
  return html.slice(0, at) + TAG + html.slice(at);
}

/** The page without the line - however many times, and in whichever form, it is there. */
function removeTag(html) {
  let out = html;
  while (OWN_LINE.test(out)) out = out.replace(OWN_LINE, "");
  return out.replace(BARE, "");
}

/* Written beside the file and renamed over it, so Codex never reads half a page; if the rename
   is refused (Windows, with the page open), written in place - it is a few kilobytes. */
function writeFile(file, data) {
  const tmp = file + ".smartrtl-tmp";
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (x) {}
    fs.writeFileSync(file, data);
  }
}

const read = (file) => { try { return fs.readFileSync(file, "utf8"); } catch (e) { return null; } };

/**
 * Puts the fix into one copy of Codex.
 * @param {string} dir     a Codex folder
 * @param {string} script  the built dist/smartrtl-codex.js
 * @returns {"applied"|"already-current"|"no-target"}
 */
function apply(dir, script) {
  const page = pageOf(dir);
  if (!page) return "no-target";
  const html = fs.readFileSync(page, "utf8");
  const next = addTag(html);
  if (next === null) return "no-target";

  // the script first, so the line never names a file that is not there yet
  const file = path.join(path.dirname(page), SCRIPT_FILE);
  let changed = false;
  if (read(file) !== script) { writeFile(file, script); changed = true; }
  if (next !== html) { writeFile(page, next); changed = true; }
  return changed ? "applied" : "already-current";
}

/**
 * Takes the fix out of one copy of Codex. Never throws.
 * @returns {boolean} whether there was anything to take out
 */
function remove(dir) {
  let did = false;
  try {
    const page = pageOf(dir);
    if (!page) return false;
    const html = fs.readFileSync(page, "utf8");
    if (tagged(html)) { writeFile(page, removeTag(html)); did = true; }
    const file = path.join(path.dirname(page), SCRIPT_FILE);
    if (fs.existsSync(file)) { fs.unlinkSync(file); did = true; }
  } catch (e) {}
  return did;
}

module.exports = { SCRIPT_FILE, TAG, BEGIN, PREFIX, FOLDER, pageOf, tagged, addTag, removeTag, apply, remove };
