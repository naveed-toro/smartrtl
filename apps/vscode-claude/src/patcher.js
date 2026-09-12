/**
 * Finds the Claude Code extension, and puts the payload into its webview bundle -
 * or takes it back out.
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

const fmt = require("./patch-format.js");
const { BEGIN, stripPatch, readExpiry, stampExpiry, writeWhole } = fmt;

const TARGET_ID = "anthropic.claude-code";
const REL_TARGET = path.join("webview", "index.js");
const LEGACY_BACKUP = ".pristine-backup";

/** @returns {{id:string, version:string, dir:string, target:string}|null} */
function findClaudeCode() {
  const ext = vscode.extensions.getExtension(TARGET_ID);
  if (!ext) return null;
  const target = path.join(ext.extensionPath, REL_TARGET);
  if (!fs.existsSync(target)) return null;
  return {
    id: TARGET_ID,
    version: (ext.packageJSON && ext.packageJSON.version) || "unknown",
    dir: ext.extensionPath,
    target
  };
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

/** The block with its timestamp blanked, so two of them can be compared for sameness. */
function withoutStamp(text) {
  return text.replace(/var EXPIRES_AT = \d+;/, "var EXPIRES_AT = 0;");
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
 * @returns {"applied"|"restamped"|"already-current"|"no-target"}
 *
 * "restamped" is its own answer on purpose. Refreshing the expiry changes the file
 * but not a single thing the reader would see, so it must not ask anybody to
 * reload - which is what "applied" means.
 */
/**
 * The end of the bundle, and only the end.
 *
 * Everything this extension writes is appended, so "is it there, and is it still
 * alive" is always answered by the last few kilobytes. This used to read the whole
 * file - five megabytes - and it is asked on every tab change, which was five
 * megabytes of reading to look at the end of a file.
 *
 * A byte window can cut a UTF-8 character in half where it starts. That is harmless
 * here: what is searched for is ASCII, it sits well inside the window, and nothing
 * read this way is ever written back.
 */
const TAIL_BYTES = 512 * 1024;

function apply(extensionPath) {
  const install = findClaudeCode();
  if (!install) return { state: "no-target" };

  const kept = consumeLegacyBackup(install);
  const payload = readPayload(extensionPath);
  const now = Date.now();

  /* The end of the file first, because the ordinary question is "is there anything to do at
     all?" and the ordinary answer is no: the block is already there and its clock is not due
     for winding. This runs on every activation - every time somebody opens VS Code - and
     reading five megabytes to find out that nothing needs doing was measured at 198ms of
     every startup, against 13ms for the end of the file. Everything else here still reads
     the whole of it, because everything else is about to write it.

     A tail too short to hold the whole block cannot match one, so it falls through to the
     full read and is merely slow, never wrong. patch-format.js keeps the window well clear
     of the payload, and a test holds it there. */
  if (!kept) {
    let tail = null;
    try { tail = readTail(install.target); } catch (e) { tail = null; }
    if (tail && tail.includes(BEGIN)) {
      const here = tail.slice(tail.indexOf(BEGIN)).trimEnd();
      if (withoutStamp(here) === withoutStamp(payload) &&
          readExpiry(tail) - now > fmt.REFRESH_BELOW_MS) {
        return { state: "already-current", install };
      }
    }
  }

  const current = fs.readFileSync(install.target, "utf8");

  if (!kept && current.includes(BEGIN)) {
    const here = current.slice(current.indexOf(BEGIN)).trimEnd();
    if (withoutStamp(here) === withoutStamp(payload)) {
      // same block; the only question left is whether its clock needs winding
      if (readExpiry(current) - now > fmt.REFRESH_BELOW_MS) {
        return { state: "already-current", install };
      }
      writeWhole(fs, install.target, stripPatch(current) + "\n" + stampExpiry(payload, now) + "\n");
      return { state: "restamped", install };
    }
  }

  const clean = kept || stripPatch(current);
  writeWhole(fs, install.target, clean + "\n" + stampExpiry(payload, now) + "\n");
  return { state: "applied", install };
}

/**
 * @returns {"removed"|"already-clean"|"no-target"}
 */
function remove() {
  const install = findClaudeCode();
  if (!install) return { state: "no-target" };

  const current = fs.readFileSync(install.target, "utf8");
  const kept = consumeLegacyBackup(install);
  if (!current.includes(BEGIN)) return { state: "already-clean", install };

  writeWhole(fs, install.target, kept || stripPatch(current));
  return { state: "removed", install };
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
 * What the editor has to show, cheaply and without lying.
 *
 * Two facts, and they are not the same fact:
 *
 *   present - the block is in the file. This is what Turn Off acts on.
 *   live    - it is in the file AND its stamp has not run out, which is the only
 *             thing that means right-to-left text is actually being fixed.
 *
 * They disagree exactly when it matters. An expired block is still sitting in the
 * file and does nothing whatsoever - the payload checks its date once, on the way in,
 * and returns. For as long as only the marker was looked for, that was reported as
 * the fix being on, which is the one claim this extension exists to keep honest.
 *
 * A block with no stamp at all counts as live, because that is what the payload does
 * with it.
 *
 * @returns {{installed:boolean, present:boolean, live:boolean, expiresAt:number}}
 */
function state() {
  const install = findClaudeCode();
  // Not found can mean two different things, and they are told apart here: Claude Code
  // is not installed, or it is and the file its panel loads from is not where it was.
  if (!install) return { installed: claudeCodeInstalled(), recognized: false, present: false, live: false, expiresAt: 0 };

  let tail;
  try { tail = readTail(install.target); }
  catch (e) { return { installed: true, recognized: true, present: false, live: false, expiresAt: 0 }; }

  const present = tail.includes(BEGIN);
  const expiresAt = present ? readExpiry(tail) : 0;
  return { installed: true, recognized: true, present, expiresAt,
           live: present && (!expiresAt || Date.now() < expiresAt) };
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

/** Cheap enough to call on every activation. Says nothing about whether it still runs. */
function isPatched() {
  return state().present;
}

/* TAIL_BYTES is exported for one test, and it is the right thing to test: every startup
   now answers from that window instead of reading five megabytes, and the day the payload
   outgrows it the answer quietly stops being available. */
module.exports = { findClaudeCode, claudeCodeInstalled, apply, remove, isPatched, state, stripPatch, TARGET_ID, BEGIN, TAIL_BYTES };
