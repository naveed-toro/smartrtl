/**
 * THE LINE.
 *
 * This project does one thing: it decides which direction a piece of text belongs to,
 * and sets it. A line that opens in Latin and turns Urdu reads right to left. That is
 * the whole of it.
 *
 * Everything else about Claude Code's panel is somebody else's decision and stays theirs.
 * Not the width of a bubble, not which edge a message sits against, not where a control
 * is - none of it, however much better it might look. A fix that starts improving the
 * product it is a guest in has stopped being a fix.
 *
 * THE ONE CROSSING, AND WHY IT IS THE ONLY ONE
 *
 * A message that heads a turn is pinned, and expanded it has no height cap - so it can be
 * taller than the window, and a pinned element taller than the window can never show its
 * own bottom. The answer under it is unreachable for the length of the turn. That is
 * Claude Code's own fault, it has nothing to do with language, it costs an English-only
 * reader exactly as much, and it has not been fixed upstream. It was crossed for
 * deliberately, once, and it is written up on its own terms in docs/claude-code-bug.md.
 *
 * WHAT THIS FILE IS FOR
 *
 * The line was in one person's head and in prose. Prose does not fail. So here it is as a
 * measurement: every computed property of every element, with the fix and without it, on
 * Claude Code's own stylesheet - and a list of what is allowed to differ. Anything new
 * that appears in that list is somebody stepping over the line, and this goes red the same
 * morning instead of in a review months later.
 *
 * Two of the four places already carry this promise, and are not repeated here:
 *
 *   answers          real-webview.test.js - "an Urdu answer differs by direction, and by
 *                    nothing that is not direction"
 *   the composer     real-webview.test.js - "the box you type in differs by direction, and
 *                    by nothing that is not direction"
 *
 * What was never measured this way is a message somebody SENT, and the pinned row - the
 * crossing itself, which is precisely the thing that most needs a boundary drawn round it.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const real = require("./support/real.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";

/** Every computed property of every element, plus its box and its text. */
const READ = (sel) => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const props = {};
    for (let i = 0; i < cs.length; i++) props[cs[i]] = cs.getPropertyValue(cs[i]);
    out.push({ tag: el.tagName, text: el.textContent, h: Math.round(r.height), w: Math.round(r.width), props });
  }
  return out;
};

/**
 * The same page twice - once with the fix in it and once without - and everything the two
 * disagree about.
 *
 * The comparison is the point. A test that only looks at the page WITH the fix can say
 * that the direction is right; only this can say that nothing else moved.
 */
async function bothWays(html, sel, settle = 600) {
  const read = async (fix) => {
    const { page, close } = await real.open(html, { fix });
    try {
      await page.waitForTimeout(settle);
      return await page.evaluate(READ, sel);
    } finally { await close(); }
  };
  const off = await read(false), on = await read(true);
  assert.equal(on.length, off.length, "the fix added or removed an element");

  const differing = new Set(), rewritten = [], moved = [];
  for (let i = 0; i < off.length; i++) {
    if (off[i].text !== on[i].text) rewritten.push(off[i].tag);
    if (off[i].h !== on[i].h || off[i].w !== on[i].w) moved.push(off[i].tag);
    for (const p of Object.keys(off[i].props)) {
      if (off[i].props[p] !== on[i].props[p]) differing.add(p);
    }
  }
  assert.deepEqual(rewritten, [], "text was rewritten, and no text is ever ours to rewrite");
  return { differing: [...differing].sort(), moved };
}

const SENT_ROW = '[class*="userMessageContainer_"], [class*="userMessageContainer_"] *';

/* A message as it normally sits in the transcript: collapsed, which is what Claude Code
   draws until somebody opens it. Opened, the pinned row's own circuit is also at work, and
   that is the crossing - measured on its own, further down, and deliberately kept out of
   this one. */
const urduMessage = () => real.conversation(
  real.userMessage("یہ ایک اردو پیغام ہے جو بھیجا جا چکا ہے اور کافی لمبا ہے تاکہ سمیٹا جائے") +
  real.answer());

test("a sent Urdu message differs by direction, and by nothing that is not direction", { skip }, async () => {
  const { differing, moved } = await bothWays(urduMessage(), SENT_ROW);

  // direction IS the fix. text-align goes with it and cannot be left out: Claude Code
  // writes `text-align: left` on the row that holds a sent message, and a left that is
  // named beats a direction that is set - the words come out in the right order and every
  // line still hugs the wrong edge. `start` is the honest value, because it follows
  // whatever direction was decided rather than naming a side.
  assert.deepEqual(differing, ["direction", "text-align"],
    "something other than direction changed about a sent message: " + differing.join(", "));

  assert.deepEqual(moved, [], "nothing may change size: the message occupies exactly the space it did");
});

test("a sent English message is not touched in any way whatsoever", { skip }, async () => {
  // The promise to everybody who does not write right-to-left at all: installing this
  // costs them nothing, and "nothing" is measured rather than believed.
  const { differing, moved } = await bothWays(
    real.conversation(real.userMessage("an ordinary English message that was sent") + real.answer()),
    SENT_ROW);
  assert.deepEqual(differing, [], "an English message must compute identically with the fix and without it");
  assert.deepEqual(moved, []);
});

/* ------------------------------------------------------------------
   THE CROSSING, AND ITS FENCE

   Measured in ENGLISH on purpose. A message with no right-to-left text in it cannot be
   touched by any part of this project except the one that exists for Claude Code's own
   bug - so whatever differs here IS the crossing, with nothing of ours mixed into it.
------------------------------------------------------------------ */

/** Forty lines of English, pinned, showing their whole length: the trap, exactly. */
const longMessage = () => real.conversation(
  real.userMessage(
    Array.from({ length: 40 }, (_, i) => "This is line " + (i + 1) + " of a message nobody can read past.").join("\n"),
    { expanded: true }) + real.answer(), { height: 420 }) + real.toggling();

test("the one crossing is one property, and it is not a direction", { skip }, async () => {
  const { differing } = await bothWays(longMessage(), '[class*="stickyHeader_"]', 800);

  // `position`, and that is the whole of it: a row the page pins, showing its whole
  // length, taller than half the panel it is pinned in, stops being pinned and scrolls
  // like ordinary content. Nothing is capped, nothing is moved, nothing is re-styled.
  assert.deepEqual(differing, ["position"],
    "the fix for Claude Code's own bug now changes more than the pinning: " + differing.join(", "));
});

test("and it is not reached by anything to do with language", { skip }, async () => {
  // Said plainly because it is the argument for having crossed at all: this half of the
  // extension is not a right-to-left fix and never was. It is measured here in a message
  // with no right-to-left character anywhere in it, and it still works - which is the only
  // honest way to claim that an English-only reader gets the same thing out of it.
  const { page, close } = await real.open(longMessage());
  try {
    await page.waitForTimeout(800);
    const seen = await page.evaluate(() => {
      const row = document.querySelector('[class*="stickyHeader_"]');
      const status = window.__bidiStatus ? window.__bidiStatus() : {};
      return {
        position: getComputedStyle(row).position,
        unpin: status.unpinExpandedMessage || "",
        // and nothing of the language half may have marked anything in an English page
        marked: document.querySelectorAll('[data-bidi],[data-bidi-sent],[data-bidi-input]').length
      };
    });
    assert.equal(seen.position, "static", "the message is still pinned over its own answer");
    assert.match(seen.unpin, /^on/, "the circuit says it is not working: " + seen.unpin);
    assert.equal(seen.marked, 0, "the language half marked something in a page with no RTL in it");
  } finally { await close(); }
});
