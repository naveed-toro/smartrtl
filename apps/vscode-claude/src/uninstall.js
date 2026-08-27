/**
 * The uninstall hook.
 *
 * VS Code runs this as a plain node script the first time it restarts after this
 * extension has been uninstalled - `vscode:uninstall` in package.json. It is the
 * only hook the editor gives that means "we are leaving" and nothing else.
 *
 * `deactivate()` was tried for this and was a mistake: it also fires on every
 * reload, so the patch went missing exactly when the webview needed it. The
 * write-up is docs/decisions.md, section 14.
 *
 * The hook is best effort, not a guarantee - it has been reported to miss. That
 * is survivable only because the patch is shaped to be undone by anyone: a marked
 * block appended to the end of one file, removable by truncation, with nothing
 * kept anywhere else. This script is the convenience, not the safety net.
 *
 * There is no `vscode` module here, so Claude Code cannot be asked where it lives.
 * It does not have to be: this file sits inside our own folder in the extensions
 * directory, so `path.dirname(__dirname)` is that directory, and every copy of
 * Claude Code in it can be found by name. Old versions left behind by earlier
 * updates get cleaned up too, which asking the editor would not have done.
 *
 * Nothing here may throw. A cleanup that crashes on the way out is worse than one
 * that quietly does nothing.
 */
const fs = require("node:fs");
const path = require("node:path");

const { BEGIN, stripPatch } = require("./patch-format.js");

const TARGET_PREFIX = "anthropic.claude-code";
const REL_TARGET = path.join("webview", "index.js");
const LEGACY_BACKUP = ".pristine-backup";

/**
 * @param {string} extensionsDir the folder every installed extension sits in
 * @returns {{restored: string[], legacyRemoved: string[], skipped: string[]}}
 */
function cleanUp(extensionsDir) {
  const restored = [], legacyRemoved = [], skipped = [];
  let entries = [];
  try { entries = fs.readdirSync(extensionsDir); } catch (e) { return { restored, legacyRemoved, skipped }; }

  for (const entry of entries) {
    if (!entry.startsWith(TARGET_PREFIX)) continue;
    const target = path.join(extensionsDir, entry, REL_TARGET);
    try {
      if (!fs.existsSync(target)) continue;

      const current = fs.readFileSync(target, "utf8");

      // Versions before 0.0.7 kept a full copy beside the bundle; for a patch
      // they wrote, that copy is the only exact original there is.
      let kept = null;
      const legacy = target + LEGACY_BACKUP;
      if (fs.existsSync(legacy)) {
        const copy = fs.readFileSync(legacy, "utf8");
        if (!copy.includes(BEGIN)) kept = copy;
        fs.unlinkSync(legacy);
        legacyRemoved.push(entry);
      }

      if (current.includes(BEGIN)) {
        fs.writeFileSync(target, kept || stripPatch(current), "utf8");
        restored.push(entry);
      }
    } catch (e) { skipped.push(entry); }
  }
  return { restored, legacyRemoved, skipped };
}

if (require.main === module) {
  try { cleanUp(path.dirname(__dirname)); } catch (e) { /* on the way out; stay quiet */ }
}

module.exports = { cleanUp, stripPatch, TARGET_PREFIX, BEGIN };
