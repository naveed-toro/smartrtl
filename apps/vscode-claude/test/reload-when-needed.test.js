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
let onExtensionsChanged = null, onTabsChanged = null;
const CMD = {};
const noop = () => ({ dispose() {} });
const fake = {
  StatusBarAlignment: { Right: 2 },
  MarkdownString: class { constructor(v) { this.value = v; } },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createStatusBarItem: () => ({ text: "", show() {}, hide() {}, dispose() {} }),
    showInformationMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
    registerUriHandler: noop,
    onDidChangeActiveTextEditor: noop,
    tabGroups: {
      get activeTabGroup() { return { activeTab: { input: { viewType: "mainThreadWebview-claudeVSCodePanel" } } }; },
      onDidChangeTabs: (fn) => { onTabsChanged = fn; return { dispose() {} }; },
      onDidChangeTabGroups: noop
    }
  },
  commands: {
    registerCommand: (id, fn) => { CMD[id] = fn; return { dispose() {} }; },
    executeCommand: () => {}
  },
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
const setStamp = (dir, when) => fs.writeFileSync(bundle(dir),
  read(dir).replace(/var EXPIRES_AT = \d+;/, "var EXPIRES_AT = " + when + ";"), "utf8");

/** A window opening, as the person left it: SmartRTL has run here before and is switched on. */
function fresh() {
  n++;
  store = { "smartrtl.hasRun": true };
  fs.writeFileSync(MARKER, "");
  disposables.splice(0).forEach((d) => d && d.dispose && d.dispose());
}
function open(dir, version) {
  running = { dir, version };
  ext.forgetState();
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

test("needed: the editor was closed for more than a day, and the fix ran out", () => {
  fresh();
  const dir = claudeCode("2.1.309");
  patcher.apply(home, { id: "anthropic.claude-code", version: "2.1.309", dir, target: bundle(dir), road: "webview/index.js" });
  setStamp(dir, Date.now() - 1000);
  const said = open(dir, "2.1.309");
  assert.ok(asksForReload(said), "the panel came up with a dead block: " + JSON.stringify(said));
});

test("needed: the computer slept for a day with the editor open, and the fix ran out", () => {
  fresh();
  const dir = claudeCode("2.1.309");
  open(dir, "2.1.309");
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 30 * 3600 * 1000;    // woken thirty hours later
    setStamp(dir, Date.now() - 1000);
    ext.forgetState();
    shown = [];
    onTabsChanged();                                   // the first thing done after waking
    assert.ok(asksForReload(shown), "a panel opened after the block ran out, and nobody was asked: " + JSON.stringify(shown));
  } finally { Date.now = realNow; }
});

test("needed: a Claude Code update that arrived while the fix was switched off", () => {
  fresh();
  const old = claudeCode("2.1.308");
  open(old, "2.1.308");
  CMD["smartrtl.turnOff"]();
  const next = claudeCode("2.1.309");                  // unpacked while off: nothing put the fix in
  store["smartrtl.on"] = true;                         // switched back on before the restart
  const said = open(next, "2.1.309");                  // VS Code's restart starts the update
  assert.ok(asksForReload(said), "the update's panel came up without the fix: " + JSON.stringify(said));
});

test("needed: turning the fix on, and turning it off", () => {
  fresh();
  const dir = claudeCode("2.1.309");
  open(dir, "2.1.309");
  shown = [];
  CMD["smartrtl.turnOff"]();
  assert.ok(asksForReload(shown), "turned off, and the panel still runs the fix: " + JSON.stringify(shown));
  shown = [];
  CMD["smartrtl.turnOn"]();
  assert.ok(asksForReload(shown), "turned on, and the panel still runs without it: " + JSON.stringify(shown));
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
