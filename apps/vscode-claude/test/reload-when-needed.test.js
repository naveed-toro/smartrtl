/**
 * A reload when one is needed, and never when one is not.
 *
 * Needed means one thing: a Claude Code panel may be on screen, running what the file held
 * before this extension last wrote it - a panel reads the file once, as it opens. 0.9.2 took
 * away the reload after every Claude Code update, and the danger in taking a prompt away is
 * taking a needed one with it. So every situation is listed here on one side or the other,
 * and the real extension is driven through each in a stand-in editor.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.paths.unshift(path.join(__dirname, "stub", "node_modules"));
require("module").Module._initPaths();
process.env.NODE_PATH = path.join(__dirname, "stub", "node_modules");
require("module")._initPaths();

const APP = path.resolve(__dirname, "..");

let running = null;                    // { dir, version } - the build VS Code is running
let shown = [];
let onExtensionsChanged = null;
const fake = {
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showInformationMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { shown.push(m); return Promise.resolve(undefined); }
  },
  commands: { executeCommand: () => {} },
  extensions: {
    getExtension: (id) => (id === "anthropic.claude-code" && running)
      ? { extensionPath: running.dir, packageJSON: { version: running.version } } : undefined,
    onDidChange: (fn) => { onExtensionsChanged = fn; return { dispose() {} }; }
  }
};
const stubPath = require.resolve("vscode");
require("vscode");
require.cache[stubPath].exports = fake;

const ext = require("../src/extension.js");
const patcher = require("../src/patcher.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "reload-"));
const home = path.join(root, "our-own-folder");
fs.mkdirSync(path.join(home, "dist"), { recursive: true });
fs.copyFileSync(path.join(APP, "dist", "payload.js"), path.join(home, "dist", "payload.js"));
const MARKER = path.join(home, ".smartrtl-installed");

const disposables = [];
let store = {};
const ctx = {
  extensionPath: home,
  subscriptions: { push(...d) { disposables.push(...d); } },
  globalState: { get: (k, d) => (k in store ? store[k] : d), update: (k, v) => { store[k] = v; } },
  extension: { packageJSON: { version: "0.9.2" } }
};

/* Each situation gets an extensions folder of its own, so nothing one of them leaves - a
   watcher, a waiting update - reaches the next. */
let n = 0;
function claudeCode(version, content = "//claude code bundle\n") {
  const extensions = path.join(root, "extensions-" + n);
  const dir = path.join(extensions, "anthropic.claude-code-" + version + "-win32-x64");
  fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
  fs.writeFileSync(path.join(dir, "webview", "index.js"), content, "utf8");
  return dir;
}
const bundle = (dir) => path.join(dir, "webview", "index.js");
const read = (dir) => fs.readFileSync(bundle(dir), "utf8");

/** A window opening, as the person left it: SmartRTL has run here before and is switched on. */
function fresh() {
  n++;
  store = { "smartrtl.hasRun": true };
  fs.writeFileSync(MARKER, "");
  closeEditor();
}
/** Every window closed: nothing of ours is running, so nothing is watching. */
function closeEditor() { disposables.splice(0).forEach((d) => d && d.dispose && d.dispose()); }
function open(dir, version) {
  running = { dir, version };
  shown = [];
  ext.activate(ctx);
  return shown;
}
const asksForReload = (said) => said.some((m) => /Reload to see it\.$/.test(m));

/* ------------------------------------------------------------------
   A reload is needed - something on screen is running the wrong thing
   ------------------------------------------------------------------ */

test("needed: SmartRTL installed for the first time", () => {
  fresh();
  store = {};                                          // never run here before
  fs.rmSync(MARKER, { force: true });
  const said = open(claudeCode("2.1.309"), "2.1.309");
  assert.ok(asksForReload(said), "the panel opened before the fix existed, and nobody was asked: " + JSON.stringify(said));
});

test("needed: SmartRTL upgraded, and the fix itself changed", () => {
  fresh();
  const dir = claudeCode("2.1.309", "//claude code bundle\n" + patcher.BEGIN +
    "\n/* an older build's block */ var EXPIRES_AT = " + (Date.now() + 864e5) + ";\n");
  fs.rmSync(MARKER, { force: true });                  // an upgrade lands in a new folder
  const said = open(dir, "2.1.309");
  assert.ok(asksForReload(said), "the panel is running the older block: " + JSON.stringify(said));
});

test("needed: a Claude Code update unpacked while no window was open", () => {
  fresh();
  open(claudeCode("2.1.308"), "2.1.308");
  closeEditor();
  const next = claudeCode("2.1.309");                  // nothing was watching when it arrived
  const said = open(next, "2.1.309");                  // VS Code's next start brings it up
  assert.ok(asksForReload(said), "the update's panel came up without the fix: " + JSON.stringify(said));
});

/* ------------------------------------------------------------------
   No reload is needed - what is on screen is already right
   ------------------------------------------------------------------ */

test("not needed: an ordinary start, with the fix in place", () => {
  fresh();
  const dir = claudeCode("2.1.309");
  open(dir, "2.1.309");
  const said = open(dir, "2.1.309");
  assert.deepEqual(said, []);
});

test("not needed: a Claude Code update, fixed while it waited for VS Code's restart", async () => {
  fresh();
  const old = claudeCode("2.1.308");
  open(old, "2.1.308");
  const next = claudeCode("2.1.309");
  await new Promise((r) => setTimeout(r, 3000));      // the watcher's settling time
  const said = open(next, "2.1.309");
  assert.ok(!asksForReload(said), "a second reload after an update: " + JSON.stringify(said));
});

test("not needed: Claude Code installed, or switched back on, while the editor is open", () => {
  fresh();
  const dir = claudeCode("2.1.309");
  open(dir, "2.1.309");
  running = { dir: claudeCode("2.1.310"), version: "2.1.310" };
  shown = [];
  onExtensionsChanged();
  assert.ok(!asksForReload(shown), "nothing of it had loaded yet: " + JSON.stringify(shown));
});

test("not needed: SmartRTL reinstalled, the same fix already running - told so, without a reload", () => {
  fresh();
  const dir = claudeCode("2.1.309");
  open(dir, "2.1.309");
  fs.rmSync(MARKER, { force: true });
  const said = open(dir, "2.1.309");
  assert.ok(!asksForReload(said), JSON.stringify(said));
  assert.ok(said.some((m) => /is fixed\.$/.test(m)), "somebody who installed something is owed an answer: " + JSON.stringify(said));
});

test.after(() => {
  disposables.forEach((d) => d && d.dispose && d.dispose());
  fs.rmSync(root, { recursive: true, force: true });
});
