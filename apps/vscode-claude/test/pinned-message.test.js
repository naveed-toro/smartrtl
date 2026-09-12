/**
 * The long message nobody can read past - Claude Code's own bug, in Claude Code's own app.
 *
 * Not a right-to-left fault: a message that heads a turn is position: sticky, and once it is
 * opened it has no height cap, so a pinned element taller than the panel can never show its
 * own bottom. Everything the rest of this suite said about it was said on a copy of the page,
 * with a stand-in for the component that opens and closes a message. This boots the real app,
 * sends it a forty-line message, has the extension host stream a hundred and fifty lines of
 * answer under it and more conversation below, and then does what a person does.
 *
 * Measured this way on every build that pins, 2.1.90 to 2.1.268, with nothing of ours in the
 * page: the opened message stays pinned at 856px in a 560px panel, the answer under it is
 * never seen, "Show less" arrives after twenty-two turns of the wheel, and closing it leaves
 * the reader 2,640px from their line. The first test below is that, so this file fails if
 * the harness ever stops reproducing the fault it exists to test.
 *
 * And the second way into the same trap, which nothing here covered until 0.5.3: a message
 * Claude Code takes for a command - anything that opens with "/", a pasted path included -
 * is drawn with no collapsed state, no "Show more" and no "Show less", and pinned all the
 * same. Reported to Claude Code by at least five people.
 *
 * With no Claude Code installed it skips.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");
const { converse, markTurn, readInto, openReadClose, numbered } = app;

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;
const boot = (opts = {}) => app.boot(WEBVIEW, opts);

const LONG = Array.from({ length: 40 }, (_, i) => "line " + String(i + 1).padStart(2, "0") + " of a long message");
const PATHED = ["/Users/me/notes/handoff.md",
  ...Array.from({ length: 40 }, (_, i) => "path line " + String(i + 1).padStart(2, "0") + " of a message that opens with a path")];

/** A long message, a long answer under it, and conversation below: the conditions it needs. */
async function conversation(page, first, firstAnswer = numbered("a")) {
  await converse(page, first, firstAnswer);
  await converse(page, ["and a second message"], "second answer");
  await converse(page, ["and a third"], "third answer");
}

/** The next update, made today: every name the fix relies on, renamed - hashes kept. */
const RENAME = (s) => s
  .replace(/stickyHeader_/g, "pinnedRow_")
  .replace(/expandableContainer_/g, "expander_")
  .replace(/buttonContainer_/g, "buttonsRow_")
  .replace(/collapsed_/g, "shut_");

const status = (page) => page.evaluate(() => {
  const s = window.__bidiStatus();
  return { unpin: s.unpinExpandedMessage, keep: s.keepTheViewOnTheMessage, detail: s.unpinDetail || null };
});

test("the trap, as Claude Code draws it: opened, a long message is pinned and its Show less is out of reach", { skip }, async () => {
  const { page, close } = await boot({ fix: false });
  try {
    await conversation(page, LONG);
    assert.ok(await markTurn(page, "line 01"), "the first message is not in the transcript");
    const reading = await readInto(page, 400, "a");
    assert.ok(reading.pinned, "collapsed, the message should be pinned above its answer - that is Claude Code's design");
    const r = await openReadClose(page);
    assert.equal(r.opened.position, "sticky", "opened, Claude Code keeps it pinned");
    assert.ok(r.opened.rowH > r.opened.panelH, "and it is taller than the panel: " + r.opened.rowH + "px in " + r.opened.panelH);
    assert.ok(r.notches === null || r.notches > 10,
      "Show less came into reach after " + r.notches + " turns of the wheel - if Claude Code has fixed this, the rest of this file should be asked whether it is still needed");
  } finally { await close(); }
});

test("opened, it scrolls; its Show less is in reach; closing puts the reader back on their line", { skip }, async () => {
  const { page, errors, pane, close } = await boot();
  try {
    await conversation(page, LONG);
    await markTurn(page, "line 01");
    await readInto(page, 400, "a");
    const r = await openReadClose(page);
    assert.equal(r.opened.position, "static", "an opened message must stop being pinned");
    assert.ok(Math.abs(r.opened.topInPanel) <= 2, "and it stays on the pixel it was on (" + r.opened.topInPanel + ")");
    assert.ok(r.notches !== null && r.notches <= 5, "Show less took " + r.notches + " turns of the wheel to reach");
    assert.equal(r.back, 0, "closing it must put the reader back on the line they were reading");
    const s = await status(page);
    assert.equal(s.unpin, "on - measured working", "the status reports what was measured");
    assert.deepEqual(errors, []);
    assert.equal(await pane(), "");
  } finally { await close(); }
});

test("a long message taken for a command is not pinned over its own answer", { skip }, async () => {
  // No collapsed state, no Show more, no Show less - and pinned. With 0.5.2 in, forty turns of
  // the wheel went by in this conversation without one line of the answer appearing.
  const { page, errors, close } = await boot();
  try {
    await conversation(page, PATHED, numbered("b"));
    const m = await markTurn(page, "/Users/me/notes");
    assert.ok(m, "the message is not in the transcript");
    assert.equal(m.hasBox, false, "Claude Code draws it with no collapsible box - which is the point of this test");
    const r = await readInto(page, 400, "b");
    assert.equal(r.pinned, false, "a message taller than half the panel, showing its whole length, must not stay pinned");
    assert.ok(r.answerInView, "and the answer under it can be read");
    assert.equal((await status(page)).unpin, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and what Claude Code designed is left alone: collapsed, short, and a short command stay pinned", { skip }, async () => {
  const { page, errors, close } = await boot();
  try {
    await converse(page, LONG, numbered("a"));
    await converse(page, ["/Users/me/short.md"], numbered("c"));
    await converse(page, ["a short question"], numbered("d"));
    await converse(page, ["and a last one"], "ok");
    for (const [first, tag, what] of [["line 01", "a", "a collapsed long message"],
                                      ["/Users/me/short", "c", "a short command"],
                                      ["a short question", "d", "a short message"]]) {
      assert.ok(await markTurn(page, first), what + " is not in the transcript");
      const r = await readInto(page, 400, tag);
      assert.ok(r.pinned, what + " must stay pinned above its answer, as Claude Code has it");
      assert.equal(await page.$$eval("[data-t-row][data-bidi-unpin]", (n) => n.length), 0, what + " was marked");
    }
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the next update, made today: every name it relies on renamed, and it still works", { skip }, async () => {
  // stickyHeader, expandableContainer, buttonContainer and collapsed, all four renamed in the
  // bundle and the stylesheet together. 0.5.2 found the opened message by those names alone.
  const { page, errors, pane, close } = await boot({ js: RENAME, css: RENAME });
  try {
    await conversation(page, LONG);
    await markTurn(page, "line 01");
    await readInto(page, 400, "a");
    const r = await openReadClose(page);
    assert.equal(r.opened.position, "static", "found by what it is: pinned, whole, taller than half the panel");
    assert.ok(r.notches !== null && r.notches <= 5, "Show less took " + r.notches + " turns of the wheel");
    assert.equal(r.back, 0, "and closing still puts the reader back - collapsed is told by the cap that clips it");
    const s = await status(page);
    assert.equal(s.unpin, "on - measured working");
    assert.match(s.detail.found, /^by what it is/, "and the status says which road found it");
    assert.deepEqual(errors, []);
    assert.equal(await pane(), "");
  } finally { await close(); }
});

test("a build that has stopped pinning: nothing of this stays in the page", { skip }, async () => {
  const NOT_PINNED = (s) => s.replace(/(\.message_[A-Za-z0-9]+\.stickyHeader_[A-Za-z0-9]+\{[^}]*?)position:sticky/, "$1position:relative");
  const { page, errors, close } = await boot({ css: NOT_PINNED });
  try {
    await converse(page, LONG, numbered("a"));
    const s = await status(page);
    assert.equal(s.unpin, "not needed - Claude Code does this itself now");
    assert.equal(s.keep, undefined, "the half that only matters while pinned is not left on either");
    assert.equal(await page.$$eval("#smart-rtl-unpin", (n) => n.length), 0, "its stylesheet came back out");
    assert.equal(await page.$$eval("[data-bidi-unpin]", (n) => n.length), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("turned off by hand, nothing of it is left - not even the listener", { skip }, async () => {
  // 0.5.2's escape hatch took the rule out and left the click listener in, still putting the
  // reader back on their line after they had turned all of this off.
  const { page, errors, close } = await boot();
  try {
    await conversation(page, LONG);
    await page.evaluate(() => window.__bidiFixOff());
    await markTurn(page, "line 01");
    await readInto(page, 400, "a");
    const r = await openReadClose(page);
    assert.equal(r.opened.position, "sticky", "turned off, an opened message is Claude Code's again - pinned");
    assert.notEqual(r.back, 0, "and closing it is Claude Code's again too: nothing of ours moved the view");
    const s = await status(page);
    assert.ok(!String(s.unpin).startsWith("on") && !String(s.keep).startsWith("on"), "and nothing claims to be on");
    assert.equal(await page.$$eval("#smart-rtl-unpin,[data-bidi-unpin]", (n) => n.length), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
