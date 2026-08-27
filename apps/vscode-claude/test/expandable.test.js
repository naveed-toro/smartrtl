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
const { open, userMessage } = require("./support/page.js");

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

test("an expanded long message is bounded, and scrolls inside itself", async () => {
  const { page, close } = await open(userMessage(LONG), { height: 600 });
  try {
    const r = await page.$eval(".content_x", (el) => ({
      client: el.clientHeight, scroll: el.scrollHeight, overflow: getComputedStyle(el).overflowY
    }));
    assert.equal(r.overflow, "auto", "the message should carry its own scrollbar");
    assert.ok(r.scroll > r.client, "and there should be something to scroll");
    assert.ok(r.client <= 600, `it must not be taller than the panel (was ${r.client})`);

    // the point of all of it: its own control stays on screen
    const btn = await boxOf(page, ".collapseButton_x");
    assert.ok(btn.y < 600, `"Show less" should stay in view (was at y=${btn.y})`);
  } finally { await close(); }
});

test("a short expanded message is not capped at all", async () => {
  const { page, close } = await open(userMessage(MIXED), { height: 600 });
  try {
    const r = await page.$eval(".content_x", (el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    assert.equal(r.client, r.scroll, "a message that fits should have nothing to scroll");
  } finally { await close(); }
});

test("an unbounded message is what the fix is measured against", async () => {
  // Without the fix the same message is thousands of pixels tall and its button is
  // far below the fold. If this ever stops being true, the fix is no longer needed.
  const { page, close } = await open(userMessage(LONG), { height: 600, fix: false });
  try {
    const btn = await boxOf(page, ".collapseButton_x");
    assert.ok(btn.y > 600, `unpatched, "Show less" should be below the fold (was y=${btn.y})`);
  } finally { await close(); }
});
