/**
 * Finds the Codex extension, and puts the fix into it. Taking it back out is src/uninstall.js,
 * which VS Code runs after an uninstall; what both change is src/page.js.
 *
 * The folder is not guessed. VS Code is asked where the Codex it is actually running lives, so
 * this stays right through versions, a portable editor, and several copies side by side.
 */
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const page = require("./page.js");

const TARGET_ID = "openai.chatgpt";

/** @returns {{version:string, dir:string}|null} the Codex this window is running */
function findCodex() {
  const ext = vscode.extensions.getExtension(TARGET_ID);
  if (!ext || !page.pageOf(ext.extensionPath)) return null;
  return { version: (ext.packageJSON && ext.packageJSON.version) || "unknown", dir: ext.extensionPath };
}

const versionOf = (s) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || "")); return m ? [+m[1], +m[2], +m[3]] : null; };
const newer = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/**
 * An update of Codex that VS Code has unpacked and not started yet.
 *
 * VS Code does not swap a running extension for its update: it unpacks the new build into a
 * folder beside the one in use and waits for "Restart Extensions" or a reload, and while it
 * waits getExtension() goes on naming the build that is running. So the new folder is read off
 * the disk - the newest Codex beside the running one, if it is newer - and fixed before it
 * starts, which leaves VS Code's own restart as the only one there is.
 *
 * @returns {{version:string, dir:string}|null}
 */
function findWaitingCodex() {
  const ext = vscode.extensions.getExtension(TARGET_ID);
  if (!ext) return null;
  const running = versionOf(ext.packageJSON && ext.packageJSON.version);
  if (!running) return null;

  const parent = path.dirname(ext.extensionPath);
  let names;
  try { names = fs.readdirSync(parent); } catch (e) { return null; }

  let best = null;
  for (const name of names) {
    const m = page.FOLDER.exec(name);
    if (!m) continue;
    const v = [+m[1], +m[2], +m[3]];
    if (newer(v, running) <= 0 || (best && newer(v, best.v) <= 0)) continue;
    const dir = path.join(parent, name);
    if (page.pageOf(dir)) best = { v, install: { version: v.join("."), dir } };
  }
  return best && best.install;
}

function readScript(extensionPath) {
  const p = path.join(extensionPath, "dist", page.SCRIPT_FILE);
  if (!fs.existsSync(p)) throw new Error("dist/" + page.SCRIPT_FILE + " is missing - run `npm run build` in apps/vscode-codex");
  const script = fs.readFileSync(p, "utf8");
  if (!script.startsWith(page.BEGIN)) throw new Error("dist/" + page.SCRIPT_FILE + " has no BEGIN marker; refusing to use it");
  return script;
}

/** @returns {{state:"applied"|"already-current"|"no-target", install?:object}} */
function apply(extensionPath, install = findCodex()) {
  if (!install) return { state: "no-target" };
  return { state: page.apply(install.dir, readScript(extensionPath)), install };
}

/** Is Codex installed at all, whether or not its page is where we look for it? */
function codexInstalled() {
  try { return !!vscode.extensions.getExtension(TARGET_ID); } catch (e) { return false; }
}

module.exports = { TARGET_ID, findCodex, findWaitingCodex, codexInstalled, apply };
