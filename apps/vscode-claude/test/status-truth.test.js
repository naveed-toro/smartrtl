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
const { whyItSays, statusReport } = require("../src/extension.js");

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

test("the block fits in the window that is read, with room to spare", () => {
  // Every startup now asks the END of Claude Code's bundle whether there is anything to do,
  // instead of reading five megabytes to find out that there is not: 198ms became 14ms. That
  // answer is only available while the whole of our block fits in the window being read. It
  // fits today with three quarters of the window to spare - and a payload that outgrew it
  // would not break anything, it would quietly stop answering and go back to reading the
  // whole file, which is the expensive thing this exists to avoid. So it is held here.
  const payload = fs.statSync(path.resolve(__dirname, "../dist/payload.js")).size;
  assert.ok(payload * 2 < patcher.TAIL_BYTES,
    "the payload is " + Math.round(payload / 1024) + "KB and the window read is " +
    Math.round(patcher.TAIL_BYTES / 1024) + "KB - too close, and the cheap answer stops being available");
});

test("a bundle whose block is already current is not rewritten, and says so", () => {
  // "already-current" is what every ordinary startup should get, and it is what makes the
  // cheap read worth having. A rewrite here would put a new mtime on somebody else's file
  // every time the editor opened.
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  const first = fs.statSync(target).mtimeMs;
  const again = patcher.apply(EXT);
  assert.equal(again.state, "already-current");
  assert.equal(fs.statSync(target).mtimeMs, first, "the file was written again for nothing");
});

test("the winding cannot be slower than the running out", () => {
  // several winds can be missed outright - a laptop asleep is the ordinary way - and
  // the block still has to be re-stamped with time in hand.
  assert.ok(fmt.STAMP_EVERY_MS < fmt.REFRESH_BELOW_MS,
    "winding has to happen while there is still enough left to trigger a re-stamp");
  assert.ok(fmt.WINDOW_MS - fmt.REFRESH_BELOW_MS >= fmt.STAMP_EVERY_MS,
    "and a missed wind must not be able to reach the expiry");
});

test("Claude Code there but changed is told as that - not 'not installed', not 'off'", () => {
  // An update can move the file Claude Code's panel loads from. Until 0.5.0 that read as
  // "Claude Code is not installed", to somebody looking straight at it.
  const moved = whyItSays({ installed: true, recognized: false, present: false, live: false });
  const noClaude = whyItSays({ installed: false, present: false, live: false });
  const off = whyItSays({ installed: true, recognized: true, present: false, live: false });
  assert.notEqual(moved, noClaude);
  assert.notEqual(moved, off);
  assert.doesNotMatch(moved, /not installed/);
  assert.doesNotMatch(moved, /Turn/, "there is no switch that would help, so none is offered");
  for (const line of moved.split(String.fromCharCode(10)).filter((l) => l.trim())) {
    assert.ok(line.length <= 40 && !/[.!,]/.test(line), "a label, not a sentence: " + line);
  }
});

test("the tooltip is labels, one idea to a line", () => {
  // A tooltip is read by somebody whose hand is already on the mouse. Anything that has
  // to be parsed as a sentence has missed its moment - so this holds every line to a
  // label, and holds the number of lines down to what an eye takes in at once.
  const on = whyItSays({ installed: true, present: true, live: true });
  const off = whyItSays({ installed: true, present: false, live: false });
  const expired = whyItSays({ installed: true, present: true, live: false });
  const noClaude = whyItSays({ installed: false, present: false, live: false });

  assert.equal(expired, off, "an expired block is put right by the same click as any other off");
  assert.equal(new Set([on, off, noClaude]).size, 3);

  for (const tip of [on, off, noClaude]) {
    const lines = tip.split(String.fromCharCode(10)).filter((l) => l.trim() !== "");
    assert.ok(lines.length <= 2, "more than two lines is a paragraph: " + tip);
    for (const line of lines) {
      // A number was the wrong guard. Every time a line grew an explanation the bound
      // was raised to let it through - 32, then 50, then 60 - which is a rule doing as
      // it is told. What actually separates a label from prose is structure: one idea,
      // no joining, nothing that ends a sentence. The width is only a backstop now.
      assert.ok(line.length <= 40, "too long to take in at a glance: " + line);
      assert.ok(!/[.!,]/.test(line),
        "a full stop or a comma means more than one idea: " + line);
      assert.ok(!/ [-—–] /.test(line),
        "a dash joins two things that wanted their own lines: " + line);
    }
  }

  assert.match(on.split(String.fromCharCode(10))[0], /^Turn off/);   // the click, first
  // one thing, so one line: what to do, and what happens if you do not
  assert.match(on, /Uninstalling does not turn it off/);
  assert.match(off, /^Turn on/);
  assert.ok(!off.includes("Uninstall"), "there is nothing left running to warn about");
  assert.doesNotMatch(noClaude, /Turn/);                             // nothing to turn
});

/* ------------------------------------------------------------------
   AND THE COMMAND, WHICH WAS STILL ASKING THE OLD QUESTION

   The status bar was taught the difference between "there is a block" and "it is doing
   something" - that is what everything above is about. Show status was not. It went on
   calling patcher.isPatched(), which is state().present, so on the one day the two part
   company the bar said off and the command said on, three inches apart, about the same
   file. isPatched is gone now rather than corrected: a second name for a question this
   already answers is how the two came to disagree in the first place.
------------------------------------------------------------------ */

test("live: the fix is on, and the answer names the build", () => {
  const said = statusReport({ live: true, present: true }, "2.1.269");
  assert.equal(said.kind, "info");
  assert.match(said.message, /is on in Claude Code 2.1.269/);
  assert.equal(said.action, undefined, "nothing to offer: it is already working");
});

test("present but run out: it does not say on, and it offers the way out", () => {
  const said = statusReport({ live: false, present: true }, "2.1.269");
  assert.doesNotMatch(said.message, /is on/, "this is the sentence that used to be a lie");
  assert.match(said.message, /not being fixed/);
  assert.equal(said.kind, "warning", "a fix that has stopped is not an informational notice");
  assert.equal(said.action, "Turn it on", "a fact with no way out of it is half an answer");
});

test("no block at all: off, and Claude Code is untouched", () => {
  const said = statusReport({ live: false, present: false }, "2.1.269");
  assert.equal(said.kind, "info");
  assert.match(said.message, /is off/);
  assert.match(said.message, /untouched/);
});

test("the question that used to be asked is no longer there to ask", () => {
  assert.equal(patcher.isPatched, undefined,
    "isPatched is back: something can ask 'is there a block' and report it as 'the fix is on'");
});

test("and the three answers really are three, on a real expired block", () => {
  // the whole path, through the disk rather than through a made-up object
  const target = fakeClaudeCode();
  patcher.apply(EXT);
  assert.match(statusReport(patcher.state(), "x").message, /is on/);

  ageTo(target, Date.now() - 1000);            // the laptop was asleep for a day and a half
  const said = statusReport(patcher.state(), "x");
  assert.equal(said.kind, "warning");
  assert.match(said.message, /has run out/);

  patcher.remove();
  assert.match(statusReport(patcher.state(), "x").message, /untouched/);
});
