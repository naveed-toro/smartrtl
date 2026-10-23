/**
 * The patcher, run for real against a throwaway Claude Code.
 *
 * This is the only file in the extension that writes to somebody else's disk, and
 * for a while it was the only file with no test - because it imports `vscode` and
 * so could not be loaded outside the editor. A build then shipped that could not
 * even be loaded: a require line had gone missing and nothing noticed. A stub in
 * test/stub is a small price for that never happening twice.
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
const patcher = require("../src/patcher.js");
const { BEGIN } = require("../src/patch-format.js");

const ORIGINAL = "//claude code bundle\nconsole.log('hello');\n";
const EXT = path.resolve(__dirname, "..");     // our own folder, where dist/payload.js lives

function fakeClaudeCode() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-"));
  fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
  fs.writeFileSync(path.join(dir, "webview", "index.js"), ORIGINAL, "utf8");
  vscode.__setClaudeCode(dir);
  return path.join(dir, "webview", "index.js");
}
const read = (t) => fs.readFileSync(t, "utf8");

test("it loads at all - the check that was missing", () => {
  assert.equal(typeof patcher.apply, "function");
  assert.equal(typeof patcher.remove, "function");
});

test("apply puts the block in, remove takes it back out exactly", () => {
  const target = fakeClaudeCode();
  assert.equal(patcher.apply(EXT).state, "applied");
  assert.ok(read(target).includes(BEGIN));
  assert.equal(patcher.remove().state, "removed");
  assert.equal(read(target), ORIGINAL, "byte for byte");
});

test("applying twice does not stack, and does not rewrite for nothing", () => {
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  const after = read(target);
  assert.equal(patcher.apply(EXT).state, "already-current");
  assert.equal(read(target), after, "an in-date block is left untouched");
  assert.equal((read(target).match(/patch BEGIN/g) || []).length, 1);
});

test("a stale block is re-stamped, and that must not ask anyone to reload", () => {
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  // wind its clock back to just inside the refresh threshold
  fs.writeFileSync(target, read(target).replace(/var EXPIRES_AT = \d+;/, "var EXPIRES_AT = " + (Date.now() + 1000) + ";"), "utf8");
  assert.equal(patcher.apply(EXT).state, "restamped");
  assert.equal((read(target).match(/patch BEGIN/g) || []).length, 1);
});

test("an older build's patch and its 5MB copy are both taken over cleanly", () => {
  // what happens when someone installs a new build without removing the old one
  const target = fakeClaudeCode();
  fs.writeFileSync(target, ORIGINAL.trimEnd() + "\n" + BEGIN + "\n/* an older block */\n", "utf8");
  fs.writeFileSync(target + ".pristine-backup", ORIGINAL, "utf8");

  assert.equal(patcher.apply(EXT).state, "applied");
  assert.equal((read(target).match(/patch BEGIN/g) || []).length, 1, "one block, never two");
  assert.equal(fs.existsSync(target + ".pristine-backup"), false, "the old copy is cleared up");
  assert.equal(patcher.remove().state, "removed");
  assert.equal(read(target), ORIGINAL, "and the original still comes back exactly");
});

test("the bundle is replaced whole, and nothing is left beside it", () => {
  // Written in place, a five-megabyte file is half-written for a moment, and a panel that
  // loads in that moment gets a broken Claude Code. So it is written beside itself and
  // renamed over the original, which a reader sees as one step - and the file beside it
  // must never be left behind in somebody else's folder.
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  patcher.remove();
  patcher.apply(EXT);
  const litter = fs.readdirSync(path.dirname(target)).filter((f) => f !== "index.js");
  assert.deepEqual(litter, [], "something of ours was left in Claude Code's folder");
  assert.equal((read(target).match(/patch BEGIN/g) || []).length, 1);
});

test("with no Claude Code installed it reports that, rather than throwing", () => {
  vscode.__setClaudeCode(null);
  assert.equal(patcher.apply(EXT).state, "no-target");
  assert.equal(patcher.remove().state, "no-target");
});

test("a bundle held open is reported as busy, not as applied", () => {
  // The one answer that means NOTHING was done. Said out loud because the alternative is
  // an extension telling somebody the fix is in place when the file was never touched.
  const target = fakeClaudeCode();
  const reader = fs.openSync(target, "r");
  try {
    assert.equal(patcher.apply(EXT).state, "busy");
    assert.equal(read(target), ORIGINAL, "it wrote underneath a reader");
  } finally { fs.closeSync(reader); }
  assert.equal(patcher.apply(EXT).state, "applied", "and it works again the moment the reader lets go");
});

test("and turning it off over a held bundle is busy too, never 'removed'", () => {
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  const reader = fs.openSync(target, "r");
  try {
    assert.equal(patcher.remove().state, "busy");
    assert.ok(read(target).includes(BEGIN), "the block went out from under a reader");
  } finally { fs.closeSync(reader); }
  assert.equal(patcher.remove().state, "removed");
  assert.equal(read(target), ORIGINAL);
});

/* An update of Claude Code waits, unpacked into a folder of its own, until VS Code restarts
   its extensions - and all that while, the editor names only the build that is running. */
function extensionsFolder() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exts-"));
  const install = (name, withBundle = true) => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
    if (withBundle) fs.writeFileSync(path.join(dir, "webview", "index.js"), ORIGINAL, "utf8");
    return dir;
  };
  vscode.__setClaudeCode(install("anthropic.claude-code-2.1.247-win32-x64"));   // the stub runs 2.1.247
  return { root, install };
}

test("an update waiting to be started is found beside the build that is running", () => {
  const { root, install } = extensionsFolder();
  install("anthropic.claude-code-2.1.240-win32-x64");          // older: left behind by an earlier update
  install("anthropic.claude-code-2.1.249-win32-x64");
  install("anthropic.claude-code-2.1.250-win32-x64");          // the newest
  install("anthropic.claude-code-2.1.251-win32-x64", false);   // no panel file in it
  install(".2c6e9f1a-unpacking");                               // VS Code's own, before the rename
  install("anthropic.claude-code-moved");
  const waiting = patcher.findWaitingClaudeCode();
  assert.ok(waiting, "the update was not found");
  assert.equal(waiting.version, "2.1.250");
  assert.equal(waiting.dir, path.join(root, "anthropic.claude-code-2.1.250-win32-x64"));
});

test("and it is fixed without touching the build that is running", () => {
  const { root, install } = extensionsFolder();
  const running = path.join(root, "anthropic.claude-code-2.1.247-win32-x64", "webview", "index.js");
  const next = path.join(install("anthropic.claude-code-2.1.250-win32-x64"), "webview", "index.js");
  const waiting = patcher.findWaitingClaudeCode();
  assert.equal(patcher.apply(EXT, waiting).state, "applied");
  assert.ok(read(next).includes(BEGIN), "the waiting build has no block");
  assert.equal(read(running), ORIGINAL, "the running build was touched");
  assert.equal(patcher.apply(EXT, waiting).state, "already-current");
  assert.equal(patcher.remove(waiting).state, "removed");
  assert.equal(read(next), ORIGINAL, "and it comes back out byte for byte");
});

test("with nothing newer beside it, there is no update waiting", () => {
  const { install } = extensionsFolder();
  install("anthropic.claude-code-2.1.240-win32-x64");
  assert.equal(patcher.findWaitingClaudeCode(), null);
  vscode.__setClaudeCode(null);
  assert.equal(patcher.findWaitingClaudeCode(), null);
});
