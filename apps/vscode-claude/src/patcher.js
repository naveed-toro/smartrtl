/**
 * Finds the Claude Code extension, and puts the payload into its webview bundle.
 * Taking it back out is src/uninstall.js, which VS Code runs after an uninstall.
 *
 * The folder is not guessed. VS Code is asked where the extension it is actually
 * running lives, so this stays correct when versions change, when the editor is
 * portable, and when several copies exist side by side.
 *
 * WHAT IS LEFT BEHIND, AND WHY IT IS ONLY THIS
 *
 * An earlier version kept a full copy of index.js beside it - five megabytes in
 * somebody else's folder - so that removal could restore from it. That was the
 * wrong shape. The patch is a marked block appended to the end of the file, so
 * the original is simply everything before the marker: removal is a truncation,
 * and needs nothing kept anywhere.
 *
 * So the entire footprint of this extension is one marked block at the end of one
 * file. Anyone can undo it, with or without us, and the round trip is exact to the
 * byte - which is asserted by a test rather than hoped for.
 *
 * Re-applying strips first, so a patch can never stack on a patch, and applying
 * over an identical patch does not touch the file at all.
 */
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const { BEGIN, stripPatch, writeWhole } = require("./patch-format.js");
const { findTarget } = require("./find-target.js");

const TARGET_ID = "anthropic.claude-code";
const LEGACY_BACKUP = ".pristine-backup";

/**
 * The folder is not guessed, and nor - since 0.5.5 - is the file inside it.
 *
 * VS Code is asked where the extension it is actually running lives, which stays right
 * through versions, a portable editor, and several copies side by side. The panel's own
 * file used to be the one thing here written down and nothing else - webview/index.js -
 * which made renaming it the single change that could take this fix down everywhere at
 * once. find-target.js has three roads to it now, and says which one answered.
 *
 * @returns {{id:string, version:string, dir:string, target:string, road:string}|null}
 */
function findClaudeCode() {
  const ext = vscode.extensions.getExtension(TARGET_ID);
  if (!ext) return null;
  const hit = findTarget(ext.extensionPath);
  if (!hit) return null;
  return {
    id: TARGET_ID,
    version: (ext.packageJSON && ext.packageJSON.version) || "unknown",
    dir: ext.extensionPath,
    target: hit.target,
    road: hit.road
  };
}

/* A Claude Code folder's name: "anthropic.claude-code-2.1.308", and on most machines a
   platform after it - "-win32-x64". */
const FOLDER = /^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)(?:-[a-z0-9-]+)?$/i;
const versionOf = (s) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || "")); return m ? [+m[1], +m[2], +m[3]] : null; };
const newer = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/**
 * An update of Claude Code that VS Code has unpacked and not started yet.
 *
 * VS Code does not swap a running extension for its update. It unpacks the new build into
 * a folder of its own beside the one in use and waits for "Restart Extensions" or a reload
 * (abstractExtensionService.ts: an activated extension cannot be removed "safely"). Claude
 * Code starts with the editor, so every one of its updates waits like this - and while it
 * waits, getExtension() goes on naming the build that is running. So the new folder is read
 * off the disk: the newest Claude Code beside the running one, if it is newer.
 *
 * @returns {{id:string, version:string, dir:string, target:string, road:string}|null}
 */
function findWaitingClaudeCode() {
  const ext = vscode.extensions.getExtension(TARGET_ID);
  if (!ext) return null;
  const running = versionOf(ext.packageJSON && ext.packageJSON.version);
  if (!running) return null;

  const parent = path.dirname(ext.extensionPath);
  let names;
  try { names = fs.readdirSync(parent); } catch (e) { return null; }

  let best = null;
  for (const name of names) {
    const m = FOLDER.exec(name);
    if (!m) continue;
    const v = [+m[1], +m[2], +m[3]];
    if (newer(v, running) <= 0 || (best && newer(v, best.v) <= 0)) continue;
    const dir = path.join(parent, name);
    const hit = findTarget(dir);
    if (hit) best = { v, install: { id: TARGET_ID, version: v.join("."), dir, target: hit.target, road: hit.road } };
  }
  return best && best.install;
}

/**
 * Versions before 0.0.7 kept a full copy of the bundle beside it and trimmed the
 * original's trailing whitespace when patching - so for a patch they wrote, that
 * copy is the only exact original there is. Use it while it is there, then clear
 * it up: from now on nothing needs keeping.
 *
 * @returns {string|null} the exact original, if the old copy can supply it
 */
function consumeLegacyBackup(install) {
  const old = install.target + LEGACY_BACKUP;
  let clean = null;
  try {
    if (fs.existsSync(old)) {
      const kept = fs.readFileSync(old, "utf8");
      if (!kept.includes(BEGIN)) clean = kept;   // a copy of a patch is no use to anybody
      fs.unlinkSync(old);
    }
  } catch (e) { /* it is litter, not load-bearing */ }
  return clean;
}

function readPayload(extensionPath) {
  const p = path.join(extensionPath, "dist", "payload.js");
  if (!fs.existsSync(p)) {
    throw new Error("dist/payload.js is missing - run `npm run build` in apps/vscode-claude");
  }
  const payload = fs.readFileSync(p, "utf8").trimEnd();
  if (!payload.startsWith(BEGIN)) throw new Error("dist/payload.js has no BEGIN marker; refusing to use it");
  return payload;
}

/**
 * The end of the bundle, and only the end.
 *
 * Everything this extension writes is appended, so "is it there" is always answered by
 * the last few kilobytes. Reading all five megabytes to find out that nothing needs doing
 * was measured at 198ms of every startup, against 13ms for the end of the file.
 *
 * A byte window can cut a UTF-8 character in half where it starts. That is harmless
 * here: what is searched for is ASCII, it sits well inside the window, and nothing
 * read this way is ever written back.
 */
const TAIL_BYTES = 512 * 1024;

/**
 * @returns {"applied"|"already-current"|"busy"|"no-target"}
 *
 * "busy" means NOTHING was done. Something has Claude Code's bundle open - a panel
 * loading it is the ordinary way - and rather than write five megabytes underneath a
 * reader, this leaves the file exactly as it is so the caller can come back later.
 */
function apply(extensionPath, install = findClaudeCode()) {
  if (!install) return { state: "no-target" };

  const kept = consumeLegacyBackup(install);
  const payload = readPayload(extensionPath);

  /* The end of the file first: on every start but the first, the block is already there,
     and only the whole file is read when it is about to be written. A tail too short to
     hold the whole block cannot match one, so it falls through to the full read and is
     merely slow, never wrong. */
  if (!kept) {
    let tail = null;
    try { tail = readTail(install.target); } catch (e) { tail = null; }
    if (tail && tail.includes(BEGIN) && tail.slice(tail.indexOf(BEGIN)).trimEnd() === payload) {
      return { state: "already-current", install };
    }
  }

  const current = fs.readFileSync(install.target, "utf8");
  if (!kept && current.includes(BEGIN) && current.slice(current.indexOf(BEGIN)).trimEnd() === payload) {
    return { state: "already-current", install };
  }

  // a different block - an older build's - is replaced, never stacked on
  const clean = kept || stripPatch(current);
  if (!writeWhole(fs, install.target, clean + "\n" + payload + "\n")) {
    return { state: "busy", install };
  }
  return { state: "applied", install };
}

function readTail(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const want = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(want);
    fs.readSync(fd, buf, 0, want, size - want);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Is Claude Code installed at all, whether or not its panel is where we look for it?
 *
 * findClaudeCode() needs both and answers null for either, which put "Claude Code is
 * not installed" in front of somebody looking straight at it on the day an update moved
 * its panel's file. An update changing something this build does not know about is the
 * true answer, and a different one.
 */
function claudeCodeInstalled() {
  try { return !!vscode.extensions.getExtension(TARGET_ID); } catch (e) { return false; }
}

/* TAIL_BYTES is exported for one test, and it is the right thing to test: every startup
   answers from that window instead of reading five megabytes, and the day the payload
   outgrows it the answer quietly stops being available. */
module.exports = { findClaudeCode, findWaitingClaudeCode, claudeCodeInstalled, apply, stripPatch, TARGET_ID, BEGIN, TAIL_BYTES };
