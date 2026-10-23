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
 *   - that message sits in a container with its own buttons, which belong to the
 *     extension and must never move.
 *
 * The buttons are measured against a page with the fix switched off, so these
 * tests fail if we ever move a control that belongs to the extension. The tests of
 * the long-message fix went with it in 0.9.1: Claude Code fixed that in 2.1.307.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, userMessage } = require("./support/page.js");

const MIXED = "npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں";

const dirOf = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).direction);
const boxOf = (page, sel) => page.$eval(sel, (el) => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
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

test("a sent message with Urdu in it is turned, so the page under these tests is fixed", async () => {
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
