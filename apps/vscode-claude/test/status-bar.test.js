/**
 * THE WHOLE OF WHAT THIS EXTENSION SHOWS ANYBODY.
 *
 * One small "RTL on" in the corner, and only while Claude Code is the thing in front of
 * you. That is it. Not a panel, not a badge, not a mark in the corner of every window all
 * day - one item, in one place, at one time.
 *
 * This file is a fence rather than a feature, and it was written the day the fence was
 * climbed. Claude Code also lives in the side bar, which is not a tab, so for somebody who
 * keeps it there the item never appears. That was read as a fault, and a reading of
 * `claudeCode.preferredLocation` was built to answer it - and the cure was worse than the
 * complaint: it put the item in the corner of every window, all day, for somebody editing
 * a file with Claude Code nowhere in sight, because whether a side bar view is OPEN cannot
 * be asked at all.
 *
 * It was taken straight back out. The switch is still in both of the places it has always
 * been for that person - the Command Palette, and the Extensions view right beside
 * Uninstall - and showing more of ourselves was never a way to close a gap.
 *
 * So what is asserted here is an upper bound: the one case where it shows, and every case
 * where it must not. Anything that widens that goes red.
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

/* ---- a stand-in editor, with a tab bar and a settings file ------------------- */
let activeTab = null;          // what the editor says is in front of you
let settings = {};             // what Claude Code has written down about itself
let claudeDir = null;
const noop = () => ({ dispose() {} });

const fake = {
  StatusBarAlignment: { Right: 2 },
  MarkdownString: class { constructor(v) { this.value = v; } },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createStatusBarItem: () => (fake.__bar = { text: "", shown: false, show() { this.shown = true; }, hide() { this.shown = false; }, dispose() {} }),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    registerUriHandler: noop,
    onDidChangeActiveTextEditor: noop,
    tabGroups: {
      get activeTabGroup() { return { activeTab }; },
      onDidChangeTabs: noop, onDidChangeTabGroups: noop
    }
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: () => {} },
  workspace: {
    onDidChangeConfiguration: (fn) => { fake.__configChanged = fn; return { dispose() {} }; },
    getConfiguration: (section) => ({ get: (key) => settings[section + "." + key] })
  },
  extensions: {
    getExtension: (id) => (id === "anthropic.claude-code" && claudeDir)
      ? { extensionPath: claudeDir, packageJSON: { version: "2.1.269" } } : undefined,
    onDidChange: noop
  }
};
const stubPath = require.resolve("vscode");
require("vscode");
require.cache[stubPath].exports = fake;

const ext = require("../src/extension.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "bar-"));
const home = path.join(root, "our-own-folder");
fs.mkdirSync(path.join(home, "dist"), { recursive: true });
fs.copyFileSync(path.join(APP, "dist", "payload.js"), path.join(home, "dist", "payload.js"));

const dir = path.join(root, "anthropic.claude-code-2.1.269");
fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
fs.writeFileSync(path.join(dir, "webview", "index.js"), "//claude code bundle\n", "utf8");

/* activate() winds a clock that keeps the process alive, and this calls activate() once
   per window it models. Dropped on the floor, the timers pile up and the run never ends. */
const disposables = [];
const store = {};
const ctx = {
  extensionPath: home,
  subscriptions: { push(...d) { disposables.push(...d); } },
  globalState: { get: (k, d) => (k in store ? store[k] : d), update: (k, v) => { store[k] = v; } },
  extension: { packageJSON: { version: "0.5.5" } }
};

/** A tab of the kind the editor hands back for a webview panel. */
const aTabOf = (viewType) => ({ input: { viewType } });

/** Put the editor in a state, run activate(), and say whether the item is on the bar. */
function shownWith({ tab = null, where = undefined, claude = true }) {
  activeTab = tab;
  settings = where === undefined ? {} : { "claudeCode.preferredLocation": where };
  claudeDir = claude ? dir : null;
  store["smartrtl.on"] = true;
  ext.forgetState();
  ext.activate(ctx);
  return fake.__bar.shown;
}

test("Claude Code in front of you: shown - and this is the only time it is", () => {
  assert.equal(shownWith({ tab: aTabOf("claudeVSCodePanel") }), true);
});

test("somebody else's tab: hidden", () => {
  assert.equal(shownWith({ tab: aTabOf("markdown.preview") }), false);
});

test("an ordinary file open, no tab of anybody's: hidden", () => {
  assert.equal(shownWith({ tab: null }), false);
});

test("no Claude Code installed at all: hidden", () => {
  assert.equal(shownWith({ tab: null, claude: false }), false);
});

test("and where Claude Code says it prefers to live makes no difference at all", () => {
  // The fence. Whether Claude Code opens in a tab or in the side bar is Claude Code's
  // business, and it is not a reason to put a mark in the corner of a window somebody is
  // using for something else. If this ever starts answering "true", somebody has decided
  // to show more of this extension than one item at one moment.
  for (const where of ["sidebar", "panel", undefined]) {
    assert.equal(shownWith({ tab: null, where }), false,
      "the item appeared with no Claude Code in front of anybody (preferredLocation: " + where + ")");
    assert.equal(shownWith({ tab: aTabOf("markdown.preview"), where }), false,
      "the item appeared over somebody else's tab (preferredLocation: " + where + ")");
  }
});

test("and nothing of ours reads another extension's settings", () => {
  // It did, for one build. Reaching into Claude Code's settings to decide how much of
  // ourselves to show is the shape of the mistake and not only its effect, so the reaching
  // is asserted gone rather than just its result.
  shownWith({ tab: aTabOf("claudeVSCodePanel") });
  assert.equal(fake.__configChanged, undefined, "something is watching another extension's settings");
  const src = fs.readFileSync(path.join(APP, "src", "extension.js"), "utf8");
  assert.equal(src.split("getConfiguration").length - 1, 0,
    "extension.js reads a setting; it has none of its own and needs none of anybody else's");
});

test.after(() => {
  disposables.forEach((d) => d && d.dispose && d.dispose());
  fs.rmSync(root, { recursive: true, force: true });
});
