/**
 * Telling an install from a restart.
 *
 * Somebody who has just installed this is owed an answer - "it is fixed" - and somebody
 * who has only opened VS Code is owed silence. Nothing in the API tells the two apart, so
 * freshInstall() reads it from the one asymmetry the editor leaves: global state OUTLIVES
 * an uninstall, and the extension's own folder does not.
 *
 * So the lifecycle is played out here for real: a folder that is deleted and recreated
 * the way the editor deletes and recreates one, against global state that is kept the
 * way the editor keeps it.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// make `require("vscode")` resolve to the stub
module.paths.unshift(path.join(__dirname, "stub", "node_modules"));
require("module").Module._initPaths();
process.env.NODE_PATH = path.join(__dirname, "stub", "node_modules");
require("module")._initPaths();

const { freshInstall } = require("../src/extension.js");

/**
 * One editor: an extension folder on disk, and a global state that survives it.
 * `install` and `uninstall` do to the folder exactly what the editor does.
 */
function editor(version = "0.2.0") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-"));
  const store = new Map();
  const ctx = {
    extensionPath: path.join(root, "smartrtl.claude-code-rtl-" + version),
    extension: { packageJSON: { version } },
    globalState: {
      get: (k, d) => (store.has(k) ? store.get(k) : d),
      update: (k, v) => { if (v === undefined) store.delete(k); else store.set(k, v); }
    }
  };
  const install = () => fs.mkdirSync(ctx.extensionPath, { recursive: true });
  install();
  return {
    ctx, store, install,
    uninstall: () => fs.rmSync(ctx.extensionPath, { recursive: true, force: true }),
    /** one activation: is it greeted as an install? */
    start: () => freshInstall(ctx)
  };
}

test("a plain restart is not an install", () => {
  const e = editor();
  assert.equal(e.start(), false, "first ever startup: nothing ran here before, so nothing to tell apart");
  assert.equal(e.start(), false, "second startup");
});

test("uninstalled and installed again - the same version too - is an install, once", () => {
  const e = editor("0.2.0");
  e.start();
  e.uninstall();
  e.install();                       // same build, months later
  assert.equal(e.start(), true, "the reinstall is greeted");
  assert.equal(e.start(), false, "and the restart after it is not");
});

test("a folder that cannot be written to is never called a fresh install", () => {
  const e = editor();
  e.start();
  e.uninstall();                     // and nothing puts it back: writing will throw
  // Better to go quiet than to greet at every single startup. Ten times over.
  for (let i = 0; i < 10; i++) assert.equal(e.start(), false, "startup " + i);
});
