/**
 * Finds the Claude Code extension, and puts the payload into its webview bundle -
 * or takes it back out.
 *
 * The folder is not guessed. VS Code is asked where the extension it is actually
 * running lives, so this stays correct when versions change, when the editor is
 * portable, and when several copies exist side by side.
 *
 * Two rules make repeated runs safe:
 *   - the first run keeps a pristine copy of index.js, and every run after that
 *     rebuilds from that copy, so a patch can never be stacked on a patch
 *   - if the file already matches what we would write, it is not touched at all
 */
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const TARGET_ID = "anthropic.claude-code";
const BEGIN = "/* ==== smart-rtl-direction patch BEGIN ==== */";
const REL_TARGET = path.join("webview", "index.js");

/** @returns {{id:string, version:string, dir:string, target:string, backup:string}|null} */
function findClaudeCode() {
  const ext = vscode.extensions.getExtension(TARGET_ID);
  if (!ext) return null;
  const target = path.join(ext.extensionPath, REL_TARGET);
  if (!fs.existsSync(target)) return null;
  return {
    id: TARGET_ID,
    version: (ext.packageJSON && ext.packageJSON.version) || "unknown",
    dir: ext.extensionPath,
    target,
    backup: target + ".pristine-backup"
  };
}

function readPayload(extensionPath) {
  const p = path.join(extensionPath, "dist", "payload.js");
  if (!fs.existsSync(p)) {
    throw new Error("dist/payload.js is missing - run `npm run build` in packages/vscode-claude");
  }
  const payload = fs.readFileSync(p, "utf8").trimEnd();
  if (!payload.includes(BEGIN)) throw new Error("dist/payload.js has no BEGIN marker; refusing to use it");
  return payload;
}

/** The exact bytes the target should hold once patched. */
function wantedContent(install, payload) {
  const clean = fs.readFileSync(install.backup, "utf8").trimEnd();
  if (clean.includes(BEGIN)) throw new Error("the pristine copy is itself patched; refusing to continue");
  return clean + "\n" + payload + "\n";
}

/**
 * @returns {"applied"|"already-current"|"no-target"|"no-pristine-copy"}
 */
function apply(extensionPath) {
  const install = findClaudeCode();
  if (!install) return { state: "no-target" };

  const current = fs.readFileSync(install.target, "utf8");
  if (!fs.existsSync(install.backup)) {
    // Patched by something else, with no clean copy to rebuild from - leave it alone
    // rather than guess what the original looked like.
    if (current.includes(BEGIN)) return { state: "no-pristine-copy", install };
    fs.writeFileSync(install.backup, current, "utf8");
  }

  const wanted = wantedContent(install, readPayload(extensionPath));
  if (current === wanted) return { state: "already-current", install };

  fs.writeFileSync(install.target, wanted, "utf8");
  return { state: "applied", install };
}

/**
 * @returns {"removed"|"already-clean"|"no-target"|"no-pristine-copy"}
 */
function remove() {
  const install = findClaudeCode();
  if (!install) return { state: "no-target" };

  const current = fs.readFileSync(install.target, "utf8");
  if (!current.includes(BEGIN)) return { state: "already-clean", install };
  if (!fs.existsSync(install.backup)) return { state: "no-pristine-copy", install };

  fs.writeFileSync(install.target, fs.readFileSync(install.backup, "utf8"), "utf8");
  return { state: "removed", install };
}

/** Cheap enough to call on every activation. */
function isPatched() {
  const install = findClaudeCode();
  if (!install) return false;
  return fs.readFileSync(install.target, "utf8").includes(BEGIN);
}

module.exports = { findClaudeCode, apply, remove, isPatched, TARGET_ID };
