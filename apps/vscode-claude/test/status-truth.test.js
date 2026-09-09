/**
 * Whether the editor is telling the truth about itself.
 *
 * The status bar makes one claim - the right-to-left fix is on - and that claim is
 * the whole reason this extension has a status bar at all, because VS Code's own
 * Enable, Disable and Uninstall buttons cannot be believed about it.
 *
 * For a long time the claim was made by looking for a marker in a file. That is not
 * the same question. The block carries a date; past that date it returns immediately
 * and does nothing, and it is still very much in the file. So a window left open for
 * a day and a half showed a tick over a fix that had stopped - which is worse than
 * showing nothing, because it is confident.
 *
 * These are the cases where "there is a block" and "it is doing something" part
 * company, plus the arithmetic that is supposed to stop them ever parting.
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
const fmt = require("../src/patch-format.js");
const { whyItSays } = require("../src/extension.js");

const EXT = path.resolve(__dirname, "..");
const ORIGINAL = "//claude code bundle\nconsole.log('hello');\n";

function fakeClaudeCode(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-"));
  fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
  const target = path.join(dir, "webview", "index.js");
  fs.writeFileSync(target, body === undefined ? ORIGINAL : body, "utf8");
  vscode.__setClaudeCode(dir);
  return target;
}
/** Move the block's clock, so an expiry can be reached without waiting for one. */
function ageTo(target, when) {
  fs.writeFileSync(target,
    fs.readFileSync(target, "utf8").replace(/var EXPIRES_AT = \d+;/, "var EXPIRES_AT = " + when + ";"),
    "utf8");
}

test("an untouched bundle: Claude Code is there, the fix is not", () => {
  fakeClaudeCode();
  const st = patcher.state();
  assert.equal(st.installed, true);
  assert.equal(st.present, false);
  assert.equal(st.live, false);
});

test("freshly applied: present, live, and stamped a day ahead", () => {
  fakeClaudeCode();
  patcher.apply(EXT);
  const st = patcher.state();
  assert.equal(st.present, true);
  assert.equal(st.live, true);
  const ahead = st.expiresAt - Date.now();
  assert.ok(Math.abs(ahead - fmt.WINDOW_MS) < 60_000,
    "expected roughly a full window ahead, got " + Math.round(ahead / 3600e3) + "h");
});

test("an expired block is still in the file and is NOT the fix being on", () => {
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  ageTo(target, Date.now() - 1000);          // it ran out a second ago

  const st = patcher.state();
  assert.equal(st.present, true, "the block has not gone anywhere");
  assert.equal(st.live, false, "and it is doing nothing, which is what the bar must say");
});

test("a block with no stamp counts as live, because that is what the payload does", () => {
  // payload.js: `if (EXPIRES_AT && Date.now() > EXPIRES_AT) return;` - a zero never expires
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  ageTo(target, 0);
  const st = patcher.state();
  assert.equal(st.present, true);
  assert.equal(st.live, true);
});

test("no Claude Code at all is not the same as the fix being off", () => {
  vscode.__setClaudeCode(null);
  const st = patcher.state();
  assert.equal(st.installed, false);
  assert.equal(st.present, false);
});

test("the end of the bundle is read, not five megabytes of it", () => {
  // the block is appended, always, so the answer is always at the end. Proving that
  // is only really proving one thing: something planted at the FRONT of a big file is
  // not seen, which is what makes the cheap read honest rather than lucky.
  const filler = "x".repeat(3 * 1024 * 1024) + "\n";
  const target = fakeClaudeCode(fmt.BEGIN + "\n" + filler);
  assert.equal(patcher.state().present, false,
    "a marker at the front of a 3MB file is not our block and must not be reported as one");

  fs.appendFileSync(target, fmt.MARK + "\nvar EXPIRES_AT = " + (Date.now() + 60_000) + ";\n", "utf8");
  const st = patcher.state();
  assert.equal(st.present, true, "and the real one, at the end, is found");
  assert.equal(st.live, true);
});

test("the winding cannot be slower than the running out", () => {
  // several winds can be missed outright - a laptop asleep is the ordinary way - and
  // the block still has to be re-stamped with time in hand.
  assert.ok(fmt.STAMP_EVERY_MS < fmt.REFRESH_BELOW_MS,
    "winding has to happen while there is still enough left to trigger a re-stamp");
  assert.ok(fmt.WINDOW_MS - fmt.REFRESH_BELOW_MS >= fmt.STAMP_EVERY_MS,
    "and a missed wind must not be able to reach the expiry");
});

test('"off" says which of the five it is, because they are not the same thing', () => {
  const ctxOn = { globalState: { get: (k, d) => d } };            // nothing remembered: on
  const ctxOff = { globalState: { get: () => false } };           // turned off by hand

  const said = {
    live: whyItSays(ctxOn, { installed: true, present: true, live: true }),
    expired: whyItSays(ctxOn, { installed: true, present: true, live: false }),
    noClaude: whyItSays(ctxOn, { installed: false, present: false, live: false }),
    turnedOff: whyItSays(ctxOff, { installed: true, present: false, live: false }),
    notPutBack: whyItSays(ctxOn, { installed: true, present: false, live: false })
  };

  assert.equal(new Set(Object.values(said)).size, 5, "five situations, five sentences");
  assert.match(said.live, /does NOT turn it off/);      // the one thing nobody guesses
  assert.match(said.expired, /run out/);
  assert.match(said.noClaude, /not installed/);         // and NOT "click to turn it on"
  assert.doesNotMatch(said.noClaude, /turn it on/);
  assert.match(said.turnedOff, /Click to turn it on/);
  assert.match(said.notPutBack, /put it back/);
});
