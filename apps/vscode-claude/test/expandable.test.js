/**
 * User messages, and the container they live in.
 *
 * Both were found by reading the extension's own bundle after the first live run,
 * not by guessing at a screenshot:
 *
 *   - an answer is markdown, so it lands in real p / li / h elements. A user
 *     message goes through a plainText path and comes out as a bare
 *     <span dir="auto"> - the very first-strong-character rule this project
 *     exists to replace, applied by the extension itself.
 *   - that message sits in a container which collapses at 60px and, expanded,
 *     has no height cap at all.
 *
 * The buttons are measured against a page with the fix switched off, so these
 * tests fail if we ever move a control that belongs to the extension.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, userMessage, turn } = require("./support/page.js");

const MIXED = "npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں";
const LONG = Array.from({ length: 60 }, (_, i) => `یہ لمبے پیغام کی سطر نمبر ${i + 1} ہے۔`).join("\n");

const dirOf = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).direction);
const boxOf = (page, sel) => page.$eval(sel, (el) => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
});

test("a user message is fixed even though its text is a span, not a paragraph", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    assert.equal(await dirOf(page, ".content_x"), "rtl", "the body should read right-to-left");
    assert.equal(await dirOf(page, "span[dir=auto]"), "rtl",
      'dir="auto" must not get a second vote inside a block we already decided');
  } finally { await close(); }
});

test("an English user message is left exactly as it was", async () => {
  const { page, close } = await open(userMessage("Run npm install and then start the dev server."));
  try {
    assert.equal(await page.$$eval("[data-bidi]", (e) => e.length), 0, "nothing should be marked");
    assert.equal(await dirOf(page, ".content_x"), "ltr");
  } finally { await close(); }
});

test("the collapse button is not moved - not by a pixel", async () => {
  // The extension puts "Show less" at the end of a flex row on purpose. Whatever we
  // do to the text, that button must land where it lands with the fix switched off.
  for (const [label, text] of [["urdu", MIXED], ["english", "Just an English message."]]) {
    const off = await open(userMessage(text), { fix: false });
    const on = await open(userMessage(text));
    try {
      const a = await boxOf(off.page, ".collapseButton_x");
      const b = await boxOf(on.page, ".collapseButton_x");
      assert.deepEqual(b, a, `${label}: the collapse button moved`);
    } finally { await off.close(); await on.close(); }
  }
});

test("the expand button on a collapsed message is not moved either", async () => {
  const off = await open(userMessage(MIXED, { expanded: false }), { fix: false });
  const on = await open(userMessage(MIXED, { expanded: false }));
  try {
    assert.deepEqual(await boxOf(on.page, ".expandButton_x"), await boxOf(off.page, ".expandButton_x"));
  } finally { await off.close(); await on.close(); }
});

/* ------------------------------------------------------------------------
   The pinning.

   A turn header is position:sticky, top:0. Collapsed that is 60px of question
   held above a long answer, which is the point. Expanded it has no height cap,
   and a pinned element taller than the window can never show its own bottom -
   so "Show less" is unreachable and the wheel scrolls the conversation behind
   it instead. Every one of these measures the fix against the same page with
   the fix switched off, so none of them can pass by accident.
------------------------------------------------------------------------- */

const scrollBy = (page, y) => page.$eval("#scroller", (el, y) => { el.scrollTop = y; }, y);
const topOf = (page, sel) => page.$eval(sel, (el) =>
  Math.round(el.getBoundingClientRect().top - document.getElementById("scroller").getBoundingClientRect().top));

test("unpatched, a pinned expanded message never moves and its button never arrives", async () => {
  const { page, close } = await open(turn(userMessage(LONG)), { height: 700, fix: false });
  try {
    await scrollBy(page, 400);
    assert.ok(await topOf(page, ".message_x.stickyHeader_x") >= -1,
      "the pinned message should still be stuck to the top");
    assert.ok(await topOf(page, ".collapseButton_x") > 600,
      '"Show less" should still be below the fold');
  } finally { await close(); }
});

test("an expanded message stops being pinned, so you can scroll to its end", async () => {
  const { page, close } = await open(turn(userMessage(LONG)), { height: 700 });
  try {
    await scrollBy(page, 400);
    assert.ok(await topOf(page, ".message_x.stickyHeader_x") < -300,
      "the message should scroll away like ordinary content, not stay pinned");

    // and its own control can therefore be reached, which is the whole point
    const target = await page.$eval(".collapseButton_x", (el) => {
      const sc = document.getElementById("scroller");
      return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 200;
    });
    await scrollBy(page, target);
    const seen = await topOf(page, ".collapseButton_x");
    assert.ok(seen >= 0 && seen < 600, `"Show less" should be in view (was at ${seen})`);
  } finally { await close(); }
});

test("a collapsed message is still pinned - that part was never broken", async () => {
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false })), { height: 700 });
  try {
    await scrollBy(page, 400);
    assert.ok(await topOf(page, ".message_x.stickyHeader_x") >= -1,
      "collapsed, the question must keep hanging above its answer");
  } finally { await close(); }
});

test("a short message is still pinned, expanded or not", async () => {
  // It has no collapse row, so it is not an expanded message and must not be unpinned.
  const { page, close } = await open(turn(userMessage(MIXED, { expanded: true })), { height: 700 });
  try {
    await page.$eval(".expandableContainer_x [class*=buttonContainer]", (el) => el.remove());
    await scrollBy(page, 400);
    assert.ok(await topOf(page, ".message_x.stickyHeader_x") >= -1,
      "a short question must keep hanging above its answer");
  } finally { await close(); }
});

test("nothing is capped - the message opens to its full length", async () => {
  // How much of a window a message may take is not ours to decide; it differs on
  // a laptop and on an external display. Height must match the unpatched page.
  const off = await open(turn(userMessage(LONG)), { height: 700, fix: false });
  const on = await open(turn(userMessage(LONG)), { height: 700 });
  try {
    const h = (p) => p.$eval(".content_x", (el) => Math.round(el.getBoundingClientRect().height));
    // Identical to the pixel. This was loosened once, because splitting a message into
    // per-line elements changed its height by a hair; nothing is built now, so there is
    // no reason for a single pixel of difference, and a loose bound hides real ones.
    assert.equal(await h(on.page), await h(off.page), "the expanded body must be exactly its own height");
  } finally { await off.close(); await on.close(); }
});

/* ------------------------------------------------------------------------
   Toggling from somewhere other than the top.

   Unpinning alone is half a fix. A collapsed message is pinned, so you can see
   it wherever you have scrolled to - open it and it falls back to where it
   really lives, which may be thousands of pixels above your eye. These measure
   the message's top against the panel's top across a real toggle.
------------------------------------------------------------------------- */

const STICKY_SEL = ".message_x.stickyHeader_x";

test("opening a message from halfway down does not throw it off the screen", async () => {
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false }), { live: true }), { height: 700 });
  try {
    await scrollBy(page, 800);
    const before = await topOf(page, STICKY_SEL);

    await page.click(".content_x");
    await page.waitForTimeout(200);

    const after = await topOf(page, STICKY_SEL);
    assert.ok(Math.abs(after - before) <= 2,
      `the message must stay on the pixel it was on (${before} -> ${after})`);
  } finally { await close(); }
});

test("and once open it really does scroll, rather than being pinned again", async () => {
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false }), { live: true }), { height: 700 });
  try {
    await scrollBy(page, 800);
    await page.click(".content_x");
    await page.waitForTimeout(200);

    const at = await page.$eval("#scroller", (el) => el.scrollTop);
    await scrollBy(page, at + 400);
    assert.ok(await topOf(page, STICKY_SEL) < -300, "it should scroll away like ordinary content");
  } finally { await close(); }
});

test("closing it again leaves it on the same pixel too", async () => {
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false }), { live: true }), { height: 700 });
  try {
    await scrollBy(page, 800);
    await page.click(".content_x");
    await page.waitForTimeout(200);

    const before = await topOf(page, STICKY_SEL);
    await page.click(".collapseButton_x");
    await page.waitForTimeout(200);

    const after = await topOf(page, STICKY_SEL);
    assert.ok(Math.abs(after - before) <= 2, `closing must not move it either (${before} -> ${after})`);
  } finally { await close(); }
});

/* ------------------------------------------------------------------------
   What a block left behind becomes.

   VS Code has no working way to let an extension clean up after itself when it
   is uninstalled. So the block does not depend on anyone coming back for it:
   once nobody re-stamps its expiry, it stops doing anything at all.
------------------------------------------------------------------------- */

test("an expired block does nothing whatsoever", async () => {
  const { page, close } = await open(userMessage(MIXED), { expired: true });
  try {
    assert.equal(await page.$$eval("[data-bidi]", (e) => e.length), 0, "nothing should be marked");
    assert.equal(await page.$$eval("#smart-rtl-direction", (e) => e.length), 0,
      "not even a stylesheet should be installed");
    assert.equal(await dirOf(page, ".content_x"), "ltr", "the page must be exactly as it was");
  } finally { await close(); }
});

test("and an in-date block still does its job, so the guard is not just always off", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    assert.equal(await dirOf(page, ".content_x"), "rtl");
  } finally { await close(); }
});

/* ------------------------------------------------------------------------
   Alignment, and staying inside the message.

   Measured in the real panel: the body computed `direction: rtl` and
   `text-align: left` at the same time, because the host writes text-align on a
   container and direction cannot beat it. And one Urdu message put its decision
   on an application-level container, far outside itself.
------------------------------------------------------------------------- */

test("the text is actually aligned, not merely reordered", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    const s = await page.$eval(".content_x", (el) => {
      const c = getComputedStyle(el);
      return { dir: c.direction, align: c.textAlign };
    });
    assert.equal(s.dir, "rtl");
    assert.notEqual(s.align, "left",
      "the host's own text-align must not survive the decision - this is the bug");
  } finally { await close(); }
});

test("a decision never escapes the message it was made for", async () => {
  const { page, close } = await open(turn(userMessage(MIXED)), { height: 700 });
  try {
    const outside = await page.$$eval("#scroller[data-bidi], .turn_x[data-bidi]", (e) => e.length);
    assert.equal(outside, 0, "the scroller and the turn must never be claimed");
    const marked = await page.$$eval('[data-bidi="rtl"]', (els) =>
      els.every((e) => !!e.closest('[class*="message_"]')));
    assert.ok(marked, "every decision must sit inside a message");
  } finally { await close(); }
});

test("the message box is NOT moved - that was tried and it took the buttons with it", async () => {
  // Pushing the container to the bubble's right edge aligns the text where an RTL
  // reader expects it, and moves the controls that live inside that container. The
  // buttons win. This used to be a note written as `assert.ok(true)`; it is measured
  // now, both ways, so a change that moves the box fails here instead of in the panel.
  for (const [label, text] of [["urdu", MIXED], ["english", "Just an English message."]]) {
    const off = await open(userMessage(text), { fix: false });
    const on = await open(userMessage(text));
    try {
      assert.deepEqual(await boxOf(on.page, ".expandableContainer_x"),
                       await boxOf(off.page, ".expandableContainer_x"), `${label}: the message box moved`);
    } finally { await off.close(); await on.close(); }
  }
});

test("closing from deep inside a long message brings it back into view", async () => {
  // The case that "put it back on the exact pixel" got wrong: read to the end of an
  // expanded message and its head is far above the panel. Restoring that pixel is
  // faithful and useless - the message you were reading leaves the screen.
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false }), { live: true }), { height: 700 });
  try {
    await scrollBy(page, 200);
    await page.click(".content_x");
    await page.waitForTimeout(200);

    // read down to the end of it, where "Show less" is
    const end = await page.$eval(".collapseButton_x", (el) => {
      const sc = document.getElementById("scroller");
      return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 300;
    });
    await scrollBy(page, end);
    assert.ok(await topOf(page, STICKY_SEL) < -100, "its head should now be above the panel");

    await page.click(".collapseButton_x");
    await page.waitForTimeout(200);

    const after = await topOf(page, STICKY_SEL);
    assert.ok(after >= -2 && after < 600,
      `the message must come back into view, not stay above it (landed at ${after})`);
  } finally { await close(); }
});

test("closing it gives the reader back the line they were on", async () => {
  // The half that was still missing, and the one a reader notices most: they were
  // partway down a long answer, opened the question above it to check something, and
  // closed it again - and the answer came back from its beginning.
  //
  // The cause was the pinning. A collapsed message is sticky, so the moment it closes
  // its top IS the panel's top whatever the scroll position; the drift measured
  // against it is zero, nothing is scrolled, and the view stays wherever reading the
  // message left it. Opening and closing has to be a round trip.
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false }), { live: true }), { height: 700 });
  try {
    await scrollBy(page, 900);
    const readingLine = await page.$$eval(".root p", (els) => {
      const top = document.getElementById("scroller").getBoundingClientRect().top;
      const first = els.find((el) => el.getBoundingClientRect().top >= top);
      return first ? { text: first.textContent, at: Math.round(first.getBoundingClientRect().top - top) } : null;
    });
    assert.ok(readingLine, "the reader is looking at a line of the answer");

    await page.click(".content_x");                 // open the question above
    await page.waitForTimeout(250);
    await page.click(".collapseButton_x");          // and close it again
    await page.waitForTimeout(250);

    const back = await page.$$eval(".root p", (els, wanted) => {
      const top = document.getElementById("scroller").getBoundingClientRect().top;
      const same = els.find((el) => el.textContent === wanted);
      return same ? Math.round(same.getBoundingClientRect().top - top) : null;
    }, readingLine.text);

    assert.ok(back !== null, "the line they were reading is gone");
    assert.ok(Math.abs(back - readingLine.at) <= 2,
      `the line they were reading moved ${back - readingLine.at}px (was at ${readingLine.at}, came back at ${back})`);
  } finally { await close(); }
});

test("and it is a round trip even when they read to the end of the message first", async () => {
  // The same promise from the other end: open it, read all the way down inside it,
  // close it - and still land on the line of the answer they had been reading. The
  // older behaviour brought the message's own head back into view, which was right
  // as far as it went and left the reader somewhere they had never been.
  const { page, close } = await open(turn(userMessage(LONG, { expanded: false }), { live: true }), { height: 700 });
  try {
    await scrollBy(page, 900);
    const readingLine = await page.$$eval(".root p", (els) => {
      const top = document.getElementById("scroller").getBoundingClientRect().top;
      const first = els.find((el) => el.getBoundingClientRect().top >= top);
      return { text: first.textContent, at: Math.round(first.getBoundingClientRect().top - top) };
    });

    await page.click(".content_x");
    await page.waitForTimeout(250);
    const end = await page.$eval(".collapseButton_x", (el) => {
      const sc = document.getElementById("scroller");
      return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 300;
    });
    await scrollBy(page, end);
    await page.click(".collapseButton_x");
    await page.waitForTimeout(250);

    const back = await page.$$eval(".root p", (els, wanted) => {
      const top = document.getElementById("scroller").getBoundingClientRect().top;
      const same = els.find((el) => el.textContent === wanted);
      return same ? Math.round(same.getBoundingClientRect().top - top) : null;
    }, readingLine.text);

    assert.ok(back !== null && Math.abs(back - readingLine.at) <= 2,
      `they were put down ${back === null ? "nowhere near it" : (back - readingLine.at) + "px"} from where they were reading`);
  } finally { await close(); }
});
