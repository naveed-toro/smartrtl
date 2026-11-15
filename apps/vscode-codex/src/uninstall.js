/**
 * The uninstall hook.
 *
 * VS Code runs this as a plain node script the first time it starts after this extension has
 * been uninstalled - `vscode:uninstall` in package.json (docs/decisions.md 57). There is no
 * `vscode` module here, so Codex cannot be asked where it lives, and it does not have to be:
 * this file sits in src/ inside our own folder, our folder sits in the extensions directory -
 * two levels up - and every copy of Codex in it can be found by name, old ones included.
 *
 * What to take out is src/page.js, the same file that put it in.
 *
 * Nothing here may throw. A cleanup that crashes on the way out is worse than one that quietly
 * does nothing.
 */
const fs = require("node:fs");
const path = require("node:path");
const page = require("./page.js");

/**
 * @param {string} extensionsDir the folder every installed extension sits in
 * @returns {{restored: string[]}}
 */
function cleanUp(extensionsDir) {
  const restored = [];
  let entries = [];
  try { entries = fs.readdirSync(extensionsDir); } catch (e) { return { restored }; }
  for (const entry of entries) {
    if (!entry.toLowerCase().startsWith(page.PREFIX)) continue;
    if (page.remove(path.join(extensionsDir, entry))) restored.push(entry);
  }
  return { restored };
}

if (require.main === module) {
  try { cleanUp(path.resolve(__dirname, "..", "..")); } catch (e) { /* on the way out; stay quiet */ }
}

module.exports = { cleanUp };
