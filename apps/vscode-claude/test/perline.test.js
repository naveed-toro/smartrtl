/**
 * One block, many lines.
 *
 * A person writing Urdu writes English in the middle of it, a line at a time. The
 * rule was built for markdown, where each line is already its own element; a typed
 * message is one element with newlines in it, so a single decision governed all of
 * it. These hold the split that fixes that - and, just as hard, hold the two things
 * the split must not break.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, userMessage, userMessageWithChip } = require("./support/page.js");

const MIXED = [
  "npm install کے بعد پروجیکٹ چلائیں",
  "Run the build and check the output",
  "یہ آخری سطر ہے",
].join("\n");

const dirsOf = (page) => page.$$eval(".smart-rtl-line", (els) =>
  els.map((el) => [getComputedStyle(el).direction, (el.textContent || "").slice(0, 14)]));

test("each line is decided on its own, not the whole message at once", async () => {
  const { page, close } = await open(userMessage(MIXED));
  try {
    const seen = await dirsOf(page);
    assert.equal(seen.length, 3, "three lines, three elements");
    assert.equal(seen[0][0], "rtl", "starts English, contains Urdu -> rtl");
    assert.equal(seen[1][0], "ltr", "no RTL in it at all -> left alone");
    assert.equal(seen[2][0], "rtl", "Urdu -> rtl");
  } finally { await close(); }
});

test("copying it back gives the original text, exactly", async () => {
  // Blocks and the newline characters would both produce a line break, so the
  // characters are dropped when the blocks are made. "Nearly the same text" in
  // somebody's clipboard is not a small bug.
  const { page, close } = await open(userMessage(MIXED));
  try {
    const copied = await page.evaluate(() => {
      const body = document.querySelector(".content_x");
      const r = document.createRange(); r.selectNodeContents(body);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    });
    assert.equal(copied, MIXED);
  } finally { await close(); }
});

test("blank lines survive, and keep their height", async () => {
  const withBlank = "پہلی سطر\n\nتیسری سطر";
  const { page, close } = await open(userMessage(withBlank));
  try {
    const rows = await page.$$eval(".smart-rtl-line", (els) =>
      els.map((el) => ({ text: el.textContent, h: Math.round(el.getBoundingClientRect().height) })));
    assert.equal(rows.length, 3);
    assert.equal(rows[1].text, "", "the empty line carries no text of its own");
    assert.ok(rows[1].h > 0, "and it still takes up room");
    const copied = await page.evaluate(() => {
      const r = document.createRange(); r.selectNodeContents(document.querySelector(".content_x"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    });
    assert.equal(copied, withBlank);
  } finally { await close(); }
});

test("a mention chip is moved, not copied, so it is still the same element", async () => {
  // Rebuilding the text would turn @file into plain words and quietly take away
  // the click that opens it.
  const { page, close } = await open(
    userMessageWithChip("دیکھیں ", "@src/engine.js", " والی فائل\nsecond line"));
  try {
    const chip = await page.$$eval(".mentionChip_x", (els) => els.length);
    assert.equal(chip, 1, "the chip is still there, exactly once");
    const insideLine = await page.$eval(".mentionChip_x", (el) => !!el.closest(".smart-rtl-line"));
    assert.ok(insideLine, "and it now lives inside its own line");
  } finally { await close(); }
});

test("a single-line message is left as one piece", async () => {
  const { page, close } = await open(userMessage("npm install کے بعد چلائیں"));
  try {
    assert.equal(await page.$$eval(".smart-rtl-line", (e) => e.length), 0,
      "nothing to split, so nothing is touched");
    assert.equal(await page.$eval(".content_x", (el) => getComputedStyle(el).direction), "rtl");
  } finally { await close(); }
});

test("an English-only message is not split and not touched", async () => {
  const { page, close } = await open(userMessage("first line\nsecond line"));
  try {
    assert.equal(await page.$$eval(".smart-rtl-line", (e) => e.length), 0);
    assert.equal(await page.$$eval("[data-bidi]", (e) => e.length), 0);
  } finally { await close(); }
});

test("a message decided line by line still marks the row it is in", async () => {
  // The per-line path returns before the box decision, and with it the adapter used
  // to lose its one notification - so a user's own Urdu message kept its timeline
  // dot on the left, and the gutter every row shares was not reserved until the
  // first Urdu ANSWER arrived. That reservation narrows every row by the width of
  // the gutter, and doing it during the first answer does it while somebody is
  // reading that answer. Their own message is the earlier, quieter moment.
  const { page, close } = await open(userMessage(MIXED));
  try {
    const seen = await page.evaluate(() => ({
      conversation: document.documentElement.getAttribute("data-bidi-timeline"),
      row: document.querySelector('[class*="timelineMessage_"]')
        ? document.querySelector('[class*="timelineMessage_"]').getAttribute("data-bidi-row")
        : "no row"
    }));
    // The gutter itself is measured from a pristine row's own padding, which this
    // harness only gives an ANSWER row - rendering.test.js covers that measurement.
    // What is under test here is that the notification happens at all.
    assert.equal(seen.row, "rtl", "this row's dot belongs on the side it reads from");
  } finally { await close(); }
});

test("an English-only message marks nothing at all", async () => {
  const { page, close } = await open(userMessage("Run the build and check the output"));
  try {
    const seen = await page.evaluate(() => ({
      conversation: document.documentElement.getAttribute("data-bidi-timeline"),
      row: document.querySelector('[class*="timelineMessage_"]').getAttribute("data-bidi-row")
    }));
    assert.equal(seen.conversation, null);
    assert.equal(seen.row, null);
  } finally { await close(); }
});

test("anything else in an expandable container is left completely alone", async () => {
  // The expandable is a general component. Today the app uses it in exactly one
  // place - a typed message, maxHeight 60 - but a container is not a promise, and
  // the day something else is put in one, this must not rewrite that component's
  // DOM into spans. So the split is bound to the plainText renderer's own signature
  // instead: a dir="auto" span, which occurs exactly once in the whole bundle.
  const other = userMessage("").replace(
    '<span dir="auto"></span>',
    '<div class="toolOutput_x">first line\nsecond line\nthird line</div>');

  const { page, close } = await open(other);
  try {
    const seen = await page.evaluate(() => ({
      lines: document.querySelectorAll(".smart-rtl-line").length,
      html: document.querySelector(".toolOutput_x").innerHTML,
      text: document.querySelector(".toolOutput_x").textContent
    }));
    assert.equal(seen.lines, 0, "nothing was split");
    assert.equal(seen.html, "first line\nsecond line\nthird line", "and nothing was rewritten");
    assert.equal(seen.text, "first line\nsecond line\nthird line");
  } finally { await close(); }
});

test("the direction of each line is the formula's, not the browser's", async () => {
  // Measured both ways, because a test that passes with the payload removed is not a
  // test. Three of these lines are ones the browser gets wrong on its own, and they
  // are the reason this project exists: a line that opens with a Latin token and is
  // Urdu after it.
  const LINES = [
    "npm install کے بعد پروجیکٹ چلائیں",     // opens Latin, turns Urdu   -> the bug
    "Run the build and check the output",     // no RTL at all
    "12/03/2026 تک یہ کام مکمل کرنا ہے",      // opens with digits, which are not strong
    "package.json میں scripts دیکھیں",        // opens Latin, turns Urdu   -> the bug
    "const x = useMemo(a, b);",               // pure code
    "یہ آخری سطر ہے۔"                         // opens Urdu
  ];

  const untouched = await (async () => {
    const { page, close } = await open(userMessage(LINES.join("\n")), { fix: false });
    try {
      return await page.evaluate(() => ({
        split: document.querySelectorAll(".smart-rtl-line").length,
        boxDirection: getComputedStyle(document.querySelector(".content_x")).direction
      }));
    } finally { await close(); }
  })();

  assert.equal(untouched.split, 0, "without the fix nothing is split at all");
  assert.equal(untouched.boxDirection, "ltr",
    "and the whole message is one left-to-right run - which is the bug");

  const { page, close } = await open(userMessage(LINES.join("\n")));
  try {
    const seen = await page.$$eval(".smart-rtl-line",
      (els) => els.map((e) => getComputedStyle(e).direction));
    assert.deepEqual(seen, ["rtl", "ltr", "rtl", "rtl", "ltr", "rtl"],
      "with it, every line that holds an Urdu word reads right to left and no other does");

    const copied = await page.evaluate(() => {
      const body = document.querySelector(".content_x");
      const r = document.createRange(); r.selectNodeContents(body);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    });
    assert.equal(copied, LINES.join("\n"), "and not one character of it was changed");
  } finally { await close(); }
});
