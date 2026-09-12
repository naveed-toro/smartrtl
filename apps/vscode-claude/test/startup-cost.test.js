/**
 * WHAT A PERSON WAITS FOR WHEN THEY OPEN VS CODE.
 *
 * An extension that makes the editor feel slow gets uninstalled, and then none of the rest
 * of this matters. So this is a user-experience test, not a performance one - it is here
 * for the same reason the tests about direction are here.
 *
 * Measured against the real Claude Code on 2.1.269, with its real 5.4MB bundle:
 *
 *   every day, the fix already in place     activate()    10ms
 *   switching tabs afterwards                              8ms
 *   once, after a Claude Code update        activate()    the write itself is ~50ms
 *
 * Nobody waits for us. What made the last number look frightening at first was not this
 * code at all: on Windows, ANY change to that file - even thirteen bytes written in place -
 * makes the virus scanner read all five megabytes before it will hand the file to whoever
 * opens it next. Measured: 1825ms for the first read after a whole-file write, 0.6ms for
 * the same read a moment later, and 1932ms after writing thirteen bytes. Writing less does
 * not help; only writing LESS OFTEN does, and how often is set by the block's expiry, which
 * is a promise made in the README rather than a number to tune.
 *
 * WHY THIS IS COUNTED IN READS AND WRITES RATHER THAN IN MILLISECONDS
 *
 * A millisecond ceiling measures the machine it runs on - a loaded CI box fails a test that
 * has found nothing. What can be held exactly is the WORK: on an ordinary start, with the
 * block already in place, this must not write to Claude Code's bundle at all, and must not
 * read the whole of it. That is the thing that was true when the numbers above were taken,
 * and if it stops being true the numbers stop being true with it.
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

let activeTab = { input: { viewType: "claudeVSCodePanel" } };
const noop = () => ({ dispose() {} });
const fake = {
  StatusBarAlignment: { Right: 2 },
  MarkdownString: class { constructor(v) { this.value = v; } },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createStatusBarItem: () => ({ text: "", show() {}, hide() {}, dispose() {} }),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    registerUriHandler: noop,
    onDidChangeActiveTextEditor: noop,
    tabGroups: {
      get activeTabGroup() { return { activeTab }; },
      onDidChangeTabs: (fn) => { fake.__tabChanged = fn; return { dispose() {} }; },
      onDidChangeTabGroups: noop
    }
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: () => {} },
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
const patcher = require("../src/patcher.js");

/* A stand-in Claude Code with a bundle big enough that reading all of it would show up
   here as plainly as it does on a real machine. */
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cost-"));
let claudeDir = path.join(root, "anthropic.claude-code-2.1.269");
fs.mkdirSync(path.join(claudeDir, "webview"), { recursive: true });
const target = path.join(claudeDir, "webview", "index.js");
const BUNDLE = ("//claude code bundle\n" + "x".repeat(4096) + "\n").repeat(1200);   // about 5MB
fs.writeFileSync(target, BUNDLE, "utf8");

const home = path.join(root, "our-own-folder");
fs.mkdirSync(path.join(home, "dist"), { recursive: true });
fs.copyFileSync(path.join(APP, "dist", "payload.js"), path.join(home, "dist", "payload.js"));

const disposables = [];
const store = {};
const ctx = {
  extensionPath: home,
  subscriptions: { push(...d) { disposables.push(...d); } },
  globalState: { get: (k, d) => (k in store ? store[k] : d), update: (k, v) => { store[k] = v; } },
  extension: { packageJSON: { version: "0.5.5" } }
};

/**
 * Every byte this code reads from, or writes to, somebody else's folder while fn() runs.
 *
 * fs is patched rather than injected because that is what the code under test actually
 * uses - a counter it was handed would measure a path nobody takes.
 */
function accounting(fn) {
  const real = {
    readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync,
    readSync: fs.readSync, renameSync: fs.renameSync
  };
  const tally = { read: 0, wrote: 0, writes: 0, wholeReads: 0 };
  const theirs = (p) => String(p).indexOf(claudeDir) === 0;
  fs.readFileSync = function (p, ...rest) {
    const out = real.readFileSync.call(fs, p, ...rest);
    if (theirs(p)) { tally.read += out.length; tally.wholeReads++; }
    return out;
  };
  fs.readSync = function (fd, buf, off, len, pos) {
    const n = real.readSync.call(fs, fd, buf, off, len, pos);
    tally.read += n;                        // the tail read, which has no path to check
    return n;
  };
  fs.writeFileSync = function (p, data, ...rest) {
    if (theirs(p)) { tally.wrote += Buffer.byteLength(data); tally.writes++; }
    return real.writeFileSync.call(fs, p, data, ...rest);
  };
  try { fn(); } finally { Object.assign(fs, real); }
  return tally;
}

test("an ordinary start, with the fix already in place, writes nothing at all", () => {
  patcher.apply(home);                       // the state every start after the first is in
  ext.forgetState();
  const t = accounting(() => ext.activate(ctx));
  assert.equal(t.writes, 0,
    "activate() wrote " + t.wrote + " bytes to Claude Code's folder on an ordinary start");
});

test("...and never reads the whole five megabytes to find that out", () => {
  patcher.apply(home);
  ext.forgetState();
  const t = accounting(() => ext.activate(ctx));
  // Reading all of it to learn that nothing needs doing was 198ms of every single start
  // before 0.5.0. It is the end of the file now, and the end is enough: everything this
  // extension writes is appended, so "is it there, and is it still alive" lives in the
  // last few kilobytes.
  assert.equal(t.wholeReads, 0, "something read the whole bundle on an ordinary start");
  assert.ok(t.read < BUNDLE.length / 2,
    "activate() read " + Math.round(t.read / 1024) + "KB of a " +
    Math.round(BUNDLE.length / 1024) + "KB bundle - that is not the end of it any more");
});

test("switching tabs costs nothing on the disk at all", () => {
  // What the editor actually calls when somebody moves between files - not activate(),
  // which happens once a window. This used to read the end of the bundle on every one of
  // them, 13ms each, so switching between two files paid it twice.
  patcher.apply(home);
  ext.forgetState();
  ext.activate(ctx);                         // the reading this does is the test above
  assert.ok(fake.__tabChanged, "nothing is listening for a tab change");
  const t = accounting(() => { for (let i = 0; i < 20; i++) fake.__tabChanged(); });
  assert.equal(t.writes, 0, "a tab change wrote to Claude Code's bundle");
  assert.equal(t.read, 0,
    "twenty tab changes read " + Math.round(t.read / 1024) + "KB; the answer is remembered for 30s");
});

test("after a Claude Code update it writes once, and only once", () => {
  // The one time it has to do real work. It must not turn into two writes, because every
  // write to that file costs whoever reads it next a virus scan of the whole thing -
  // measured at 1.8s on Windows, whether we changed five megabytes or thirteen bytes.
  fs.writeFileSync(target, BUNDLE, "utf8");   // Claude Code has just replaced its bundle
  ext.forgetState();
  const t = accounting(() => ext.activate(ctx));
  assert.equal(t.writes, 1, "the bundle was written " + t.writes + " times for one update");
  assert.ok(t.wrote > BUNDLE.length, "and what it wrote is the bundle plus the block");

  // and the start after that one goes back to writing nothing
  ext.forgetState();
  assert.equal(accounting(() => ext.activate(ctx)).writes, 0);
});

test("and it is one write, not a copy of the bundle left beside it", () => {
  // 0.0.1 to 0.0.6 kept a five-megabyte copy in Claude Code's folder so that removal could
  // restore from it. Nothing is kept now: the block is appended and removal is a truncation.
  fs.writeFileSync(target, BUNDLE, "utf8");
  ext.forgetState();
  ext.activate(ctx);
  const left = fs.readdirSync(path.dirname(target)).filter((n) => n !== "index.js");
  assert.deepEqual(left, [], "something of ours is sitting in Claude Code's folder");
});

test.after(() => {
  disposables.forEach((d) => d && d.dispose && d.dispose());
  fs.rmSync(root, { recursive: true, force: true });
});
