/**
 * A message somebody has sent: one direction for the whole of it, from what it says.
 *
 * It used to be decided line by line, from a copy of the message built beside Claude
 * Code's own. In the real panel that copy was never once made - Claude Code puts a
 * hidden heading carrying the same text above every message, the heading is an h3, and
 * it decided the message first. The line-by-line machinery was the only thing in this
 * project that built elements in somebody else's page, it had never run where it
 * mattered, and it is gone. decisions.md section 34.
 *
 * What replaced it is described twice, so that one description surviving is enough:
 *
 *   by name    the content div inside the expandable container, as before
 *   by what    the run of text Claude Code hands to dir="auto" - the browser's own
 *              first-strong-character guess. Checked across five builds: it occurs
 *              exactly once in the bundle, on the span a typed message's text goes into
 *
 * The two tests near the end take each one away in turn and require the other to carry
 * the message alone.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, userMessage, userMessageWithChip } = require("./support/page.js");

const MIXED = [
  "npm install کے بعد پروجیکٹ چلائیں",
  "Run the build and check the output",
  "یہ آخری سطر ہے"
].join("\n");

const read = (page) => page.$eval(".content_x", (el) => {
  const c = getComputedStyle(el), s = getComputedStyle(el.querySelector('[dir="auto"]') || el);
  return { dir: c.direction, align: c.textAlign, span: s.direction };
});

test("a sent message takes one direction, from what it says", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    const r = await read(page);
    assert.equal(r.dir, "rtl", "a message with Urdu in it reads right to left");
    assert.equal(r.span, "rtl", "and dir=\"auto\" does not get a second vote");
    assert.notEqual(r.align, "left", "the host's text-align:left must not survive the decision");
  } finally { await close(); }
});

test("a single line is decided exactly the same way", async () => {
  const { page, close } = await open(userMessage("npm install کے بعد چلائیں"));
  try {
    assert.equal((await read(page)).dir, "rtl");
  } finally { await close(); }
});

test("an English message is left exactly as the page had it", async () => {
  const off = await open(userMessage("first line\nsecond line"), { fix: false });
  const on = await open(userMessage("first line\nsecond line"));
  try {
    assert.equal(await on.page.$$eval("[data-bidi],[data-bidi-sent]", (e) => e.length), 0, "nothing is marked");
    assert.deepEqual(await read(on.page), await read(off.page), "and nothing computes differently");
  } finally { await off.close(); await on.close(); }
});

test("nothing of ours is ever put inside the message", async () => {
  const off = await open(userMessage(MIXED), { fix: false });
  const on = await open(userMessage(MIXED));
  try {
    const html = (p) => p.$eval(".content_x", (el) => el.innerHTML);
    assert.equal(await html(on.page), await html(off.page),
      "the message's own markup is exactly what the page rendered");
    assert.equal(await on.page.$$eval(".smart-rtl-line,.smart-rtl-copy", (e) => e.length), 0);
  } finally { await off.close(); await on.close(); }
});

test("copying it gives back exactly what was sent", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    const copied = await page.evaluate(() => {
      const r = document.createRange(); r.selectNodeContents(document.querySelector(".content_x"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    });
    assert.equal(copied, MIXED);
  } finally { await close(); }
});

test("a mention chip stays the host's own, where the host put it, and still works", async () => {
  const { page, close } = await open(
    userMessageWithChip("دیکھیں ", "@src/engine.js", " والی فائل\nsecond line"));
  try {
    const state = await page.evaluate(() => {
      const host = document.querySelector('[dir="auto"]');
      const chip = host.querySelector(".mentionChip_x");
      window.__opened = 0;
      chip.addEventListener("click", () => { window.__opened++; });
      return { inHost: chip.parentNode === host, chips: document.querySelectorAll(".mentionChip_x").length };
    });
    assert.ok(state.inHost, "the chip was moved out of the host's own span");
    assert.equal(state.chips, 1, "and no copy of it exists anywhere");
    await page.click(".mentionChip_x");
    assert.equal(await page.evaluate(() => window.__opened), 1, "clicking it reaches the host's handler");
  } finally { await close(); }
});

test("the host can update or remove its own message, and nothing throws", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    const threw = await page.evaluate(() => {
      try {
        const host = document.querySelector('[dir="auto"]');
        for (const n of [...host.childNodes]) host.removeChild(n);
        host.appendChild(document.createTextNode("اب نیا متن"));
        const row = document.querySelector('[class*="message_"]');
        row.parentNode.removeChild(row);
        return null;
      } catch (e) { return String(e); }
    });
    assert.equal(threw, null);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Each description of the message, taken away in turn.
 * ---------------------------------------------------------------------------- */

test("if Claude Code renames every class, dir=\"auto\" alone still turns it", async () => {
  // no expandable, no content, no message_ row, no heading: nothing any selector in the
  // adapter names. Only the span the text is handed to the browser's guess in.
  const renamed = `<div class="row_y"><div class="bubble_y"><div class="body_y">` +
                  `<span dir="auto">${MIXED}</span></div></div></div>`;
  const { page, close } = await open(renamed);
  try {
    const r = await page.$eval(".body_y", (el) => ({
      dir: getComputedStyle(el).direction, run: el.getAttribute("data-bidi-sent")
    }));
    assert.equal(r.run, "rtl", "the run was not decided");
    assert.equal(r.dir, "rtl", "and the block it sits in does not read right to left");
  } finally { await close(); }
});

test("if Claude Code drops dir=\"auto\", the class names alone still turn it", async () => {
  const noAuto = userMessage(MIXED).replace('<span dir="auto">', "<span>");
  const { page, close } = await open(noAuto);
  try {
    assert.equal((await read(page)).dir, "rtl");
    const found = await page.evaluate(() => window.__bidiStatus().engine.sentDetail.found);
    assert.match(found, /expandableContainer/, "found by name - the run handed to dir=\"auto\" had nothing to go on: " + found);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * The dir="auto" path is generic, so it must be careful where it speaks.
 * ---------------------------------------------------------------------------- */

test("a block holding two runs is not spoken for by either", async () => {
  const { page, close } = await open(
    `<div id="two"><span dir="auto">یہ اردو ہے</span> <span dir="auto">and this is not</span></div>`);
  try {
    assert.equal(await page.$eval("#two", (el) => el.hasAttribute("data-bidi-sent")), false);
  } finally { await close(); }
});

test("code is never turned, whatever it contains", async () => {
  const { page, close } = await open(`<pre id="c"><code dir="auto">const s = "اردو";</code></pre>`);
  try {
    assert.equal(await page.$$eval("[data-bidi-sent]", (e) => e.length), 0);
  } finally { await close(); }
});

test("a run that is itself a block carries its own decision, and English beside it keeps its own", async () => {
  const { page, close } = await open(
    `<div><p id="u" dir="auto">npm install کے بعد چلائیں</p><p id="e" dir="auto">Run the build</p></div>`);
  try {
    const seen = await page.evaluate(() => ({
      u: getComputedStyle(document.getElementById("u")).direction,
      e: getComputedStyle(document.getElementById("e")).direction,
      parent: document.getElementById("u").parentElement.hasAttribute("data-bidi-sent")
    }));
    assert.equal(seen.u, "rtl");
    assert.equal(seen.e, "ltr", "an English run is left to the page");
    assert.equal(seen.parent, false, "and the decision did not spread to what holds them both");
  } finally { await close(); }
});

test("the status says it was measured working, not merely switched on", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    await page.waitForTimeout(100);
    assert.equal((await page.evaluate(() => window.__bidiStatus())).sentMessages, "on - measured working");
  } finally { await close(); }
});
