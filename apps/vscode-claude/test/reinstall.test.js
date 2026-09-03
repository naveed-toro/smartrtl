/**
 * Being asked once, and not being asked again.
 *
 * Off is remembered in global state, and global state OUTLIVES an uninstall. So
 * somebody can turn the fix off, remove the extension, install it again later, and
 * be handed an extension that does nothing and says nothing about why. The prompt
 * that covers that is the only thing this extension ever says unprompted, which
 * makes "how often" the entire question - a prompt at every startup would be worse
 * than the silence it replaces.
 *
 * So the lifecycle is played out here for real: a folder that is deleted and
 * recreated the way the editor deletes and recreates one, against global state that
 * is kept the way the editor keeps it.
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

const vscode = require("vscode");
const { freshInstall, askIfStillOff } = require("../src/extension.js");

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
    /** one activation, start to finish; returns what the person was shown */
    start() {
      vscode.__reset();
      askIfStillOff(ctx, freshInstall(ctx));
      return vscode.__shown.map((s) => s.message);
    },
    turnOff() { store.set("smartrtl.on", false); store.set("smartrtl.offAtVersion", version); }
  };
}

test("a plain restart says nothing, whether the fix is on or off", () => {
  const e = editor();
  assert.deepEqual(e.start(), [], "first ever startup");
  assert.deepEqual(e.start(), [], "second startup");

  e.turnOff();
  assert.deepEqual(e.start(), [], "off is a decision they just made, not news");
  assert.deepEqual(e.start(), [], "and it stays not-news");
});

test("turned off, uninstalled, and the SAME version installed again - it asks", () => {
  const e = editor("0.2.0");
  e.start();
  e.turnOff();
  e.start();

  e.uninstall();
  e.install();                       // same build, months later

  const shown = e.start();
  assert.equal(shown.length, 1, "the reinstall is asked about exactly once");
  assert.match(shown[0], /turned off/, shown[0]);
});

test("and having answered 'Keep it off', it does not ask again", () => {
  const e = editor("0.2.0");
  e.start();
  e.turnOff();
  e.uninstall();
  e.install();

  vscode.__answerWith("Keep it off");
  assert.equal(e.start().length, 1);

  // the stub answers synchronously, but the handler is a .then
  return Promise.resolve().then(() => {
    assert.deepEqual(e.start(), [], "restart after answering");
    assert.deepEqual(e.start(), [], "and again");
  });
});

test("a reinstall while the fix is ON is never mentioned", () => {
  const e = editor();
  e.start();
  e.uninstall();
  e.install();
  assert.deepEqual(e.start(), [], "nothing is wrong, so nothing is said");
});

test("a new version arriving on a fix that is off still asks - as it always did", () => {
  const e = editor("0.2.0");
  e.start();
  e.turnOff();
  e.start();

  e.ctx.extension.packageJSON.version = "0.3.0";   // an update, folder untouched
  assert.equal(e.start().length, 1, "a build they have not answered for");
});

test("a folder that cannot be written to is never called a fresh install", () => {
  const e = editor();
  e.start();
  e.turnOff();
  e.uninstall();                     // and nothing puts it back: writing will throw

  // Better to go quiet than to ask at every single startup. Ten times over.
  for (let i = 0; i < 10; i++) assert.deepEqual(e.start(), [], "startup " + i);
});
