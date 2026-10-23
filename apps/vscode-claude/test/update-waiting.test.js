/**
 * A Claude Code update, the way VS Code actually delivers one - and how many reloads it costs.
 *
 * VS Code does not swap a running extension for its update. It unpacks the new build into
 * a folder of its own beside the old one and waits for "Restart Extensions"; until then the
 * editor goes on naming the build that is running, and extensions.onDidChange says nothing.
 * Up to 0.9.1 the fix went into the new build only after that restart, so the panel came up
 * without it and this extension asked for a second reload - with every update.
 *
 * The answer is one restart, VS Code's own, and nothing from us. So this unpacks an update
 * the way VS Code does - a hidden folder, renamed into place - into a folder the extension is
 * watching, and then starts it the way the restart does.
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "waiting-"));
const extensions = path.join(root, "extensions");
fs.mkdirSync(extensions);
const home = path.join(root, "our-own-folder");
fs.mkdirSync(path.join(home, "dist"), { recursive: true });
fs.copyFileSync(path.join(APP, "dist", "payload.js"), path.join(home, "dist", "payload.js"));

const disposables = [];
const store = { "smartrtl.hasRun": true };
const ctx = {
  extensionPath: home,
  subscriptions: { push(...d) { disposables.push(...d); } },
  globalState: { get: (k, d) => (k in store ? store[k] : d), update: (k, v) => { store[k] = v; } },
  extension: { packageJSON: { version: "0.9.2" } }
};
fs.writeFileSync(path.join(home, ".smartrtl-installed"), "");   // an ordinary start, not an install

const BUNDLE = "//claude code bundle\n";
const bundleOf = (version) => path.join(extensions, "anthropic.claude-code-" + version + "-win32-x64", "webview", "index.js");

/** What VS Code does: unpack into a hidden folder, then rename it into place. */
function unpack(version) {
  const hidden = path.join(extensions, ".unpacking-" + version);
  fs.mkdirSync(path.join(hidden, "webview"), { recursive: true });
  fs.writeFileSync(path.join(hidden, "webview", "index.js"), BUNDLE, "utf8");
  fs.renameSync(hidden, path.dirname(path.dirname(bundleOf(version))));
}

/** What "Restart Extensions" does: the new build runs, and every extension starts again. */
function restartExtensions(version) {
  running = { dir: path.dirname(path.dirname(bundleOf(version))), version };
  shown = [];
  ext.activate(ctx);
}

const fixed = (version) => fs.readFileSync(bundleOf(version), "utf8").includes(patcher.BEGIN);
const settle = () => new Promise((r) => setTimeout(r, 3000));
const reloads = () => shown.filter((m) => /Reload/.test(m));

test("an update unpacked while the editor is open is fixed before VS Code starts it", async () => {
  unpack("2.1.308");
  restartExtensions("2.1.308");
  assert.ok(fixed("2.1.308"), "the running build has no fix");

  shown = [];
  unpack("2.1.309");
  await settle();
  assert.ok(fixed("2.1.309"), "the update was unpacked and nothing put the fix into it");
  assert.deepEqual(shown, [], "fixing a build nobody is running yet said something");
  assert.equal(fs.readFileSync(bundleOf("2.1.309"), "utf8").split(patcher.BEGIN).length, 2, "one block");
});

test("and the restart VS Code asks for is the only one: nothing asks for another", () => {
  restartExtensions("2.1.309");
  assert.deepEqual(reloads(), [], "a second reload was asked for after an update");
  assert.ok(fixed("2.1.309"));
});

test("an update found waiting at startup is fixed too, without a word", () => {
  // the watcher was not running when it was unpacked - every window was closed, say
  fs.mkdirSync(path.join(extensions, "anthropic.claude-code-2.1.310-win32-x64", "webview"), { recursive: true });
  fs.writeFileSync(bundleOf("2.1.310"), BUNDLE, "utf8");
  restartExtensions("2.1.309");
  assert.ok(fixed("2.1.310"), "an update sitting beside the running build was left without the fix");
  assert.deepEqual(shown, []);
});

test("Claude Code arriving in the window does not ask for a reload", () => {
  // onDidChange fires for a first install, or Claude Code switched back on - never for an
  // update of a running one. Either way, no panel of it has read anything yet.
  unpack("2.1.311");
  running = { dir: path.dirname(path.dirname(bundleOf("2.1.311"))), version: "2.1.311" };
  shown = [];
  onExtensionsChanged();
  assert.ok(fixed("2.1.311"));
  assert.deepEqual(reloads(), [], "Claude Code had only just arrived, and a reload was asked for");
});

test.after(() => {
  disposables.forEach((d) => d && d.dispose && d.dispose());
  fs.rmSync(root, { recursive: true, force: true });
});
