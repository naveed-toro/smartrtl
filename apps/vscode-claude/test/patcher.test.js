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

test("with no Claude Code installed it reports that, rather than throwing", () => {
  vscode.__setClaudeCode(null);
  assert.equal(patcher.apply(EXT).state, "no-target");
  assert.equal(patcher.remove().state, "no-target");
});
