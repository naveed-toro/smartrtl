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
const { BEGIN, stripPatch, readExpiry, stampExpiry } = fmt;

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
function apply(extensionPath) {
  const install = findClaudeCode();
  if (!install) return { state: "no-target" };

  const current = fs.readFileSync(install.target, "utf8");
  const kept = consumeLegacyBackup(install);
  const payload = readPayload(extensionPath);
  const now = Date.now();

  if (!kept && current.includes(BEGIN)) {
    const here = current.slice(current.indexOf(BEGIN)).trimEnd();
    if (withoutStamp(here) === withoutStamp(payload)) {
      // same block; the only question left is whether its clock needs winding
      if (readExpiry(current) - now > fmt.REFRESH_BELOW_MS) {
        return { state: "already-current", install };
      }
      fs.writeFileSync(install.target, stripPatch(current) + "\n" + stampExpiry(payload, now) + "\n", "utf8");
      return { state: "restamped", install };
    }
  }

  const clean = kept || stripPatch(current);
  fs.writeFileSync(install.target, clean + "\n" + stampExpiry(payload, now) + "\n", "utf8");
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

  fs.writeFileSync(install.target, kept || stripPatch(current), "utf8");
  return { state: "removed", install };
}

/** Cheap enough to call on every activation. */
function isPatched() {
  const install = findClaudeCode();
  if (!install) return false;
  return fs.readFileSync(install.target, "utf8").includes(BEGIN);
}

module.exports = { findClaudeCode, apply, remove, isPatched, stripPatch, TARGET_ID, BEGIN };
