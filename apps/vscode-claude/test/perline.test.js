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

test("the host's own chip is not moved - and clicking the copy still opens the file", async () => {
  // The promise this replaced was "the chip is MOVED, not rebuilt, so it keeps whatever
  // the host attached to it". That was true and it was the wrong promise: moving it is
  // exactly what the host cannot survive. Nothing of theirs is touched now, and what a
  // reader sees is a copy - so the copy has to hand its click back to the original.
  const { page, close } = await open(
    userMessageWithChip("دیکھیں ", "@src/engine.js", " والی فائل\nsecond line"));
  try {
    const state = await page.evaluate(() => {
      const host = document.querySelector('[dir="auto"]:not(.smart-rtl-copy)');
      const original = host.querySelector(".mentionChip_x");
      window.__opened = 0;
      original.addEventListener("click", () => { window.__opened++; });   // what the host attached
      const copy = document.querySelector(".smart-rtl-copy .mentionChip_x");
      return {
        theirsUntouched: original.parentNode === host,
        theirsHidden: getComputedStyle(host).display === "none",
        copyExists: !!copy,
        copyIsNotTheirs: copy !== original,
        copyInALine: !!(copy && copy.closest(".smart-rtl-line"))
      };
    });
    assert.ok(state.theirsUntouched, "the host's chip was moved out of the host's own span");
    assert.ok(state.theirsHidden, "the host's span is still on the screen beside our copy");
    assert.ok(state.copyExists && state.copyIsNotTheirs, "no copy of the chip was made");
    assert.ok(state.copyInALine, "the copy is not inside a line of its own");

    await page.click(".smart-rtl-copy .mentionChip_x");
    assert.equal(await page.evaluate(() => window.__opened), 1,
      "clicking the copy did not reach the element the host attached its handler to");
  } finally { await close(); }
});

test("the host can update or remove a message afterwards, and nothing throws", async () => {
  // The whole reason the split stopped moving anything. React holds a pointer to every
  // node it created and removes them through the parent it put them in; if that parent
  // is no longer the one holding them, removeChild throws inside its commit phase and
  // the panel unmounts. Demonstrated before this change, and asserted against here.
  const { page, close } = await open(
    userMessageWithChip("دیکھیں ", "@src/engine.js", " والی فائل\nsecond line"));
  try {
    const result = await page.evaluate(() => {
      const host = document.querySelector('[dir="auto"]:not(.smart-rtl-copy)');
      const kids = [...host.childNodes];               // what React would be holding
      const stillItsOwn = kids.every((n) => n.parentNode === host);
      let threw = null;
      try {
        // exactly what react-dom does when a message's content changes: remove the
        // children it knows about, then put new ones in
        for (const n of kids) host.removeChild(n);
        host.appendChild(document.createTextNode("edited\nand re-rendered"));
      } catch (e) { threw = String(e).split("\n")[0]; }
      return { stillItsOwn, threw };
    });
    assert.ok(result.stillItsOwn,
      "a node the host created is no longer one of its own children");
    assert.equal(result.threw, null,
      "the host could not update its own message: " + result.threw);
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

/* ---------------------------------------------------------------------------- *
 * Editing a message that has already been sent.
 *
 * Claude Code has no such button today. The browser does - Gemini puts a pencil
 * beside every message you have sent - and the browser is the next surface this
 * engine has to carry, so these are written against the thing that exists rather
 * than the thing that is convenient.
 *
 * Two separate promises, and the second is the one that is easy to forget:
 *
 *   1. it must not CRASH   - the host has to be able to rewrite its own message
 *   2. it must still WORK  - and what a reader sees has to be the new text,
 *                            decided again, not the old text kept politely alive
 * ---------------------------------------------------------------------------- */

/** What the host does when somebody edits a message: its own span, rewritten. */
const rewrite = (page, text) => page.evaluate((next) => {
  const host = document.querySelector('[dir="auto"]:not(.smart-rtl-copy)');
  const kids = [...host.childNodes];
  for (const n of kids) host.removeChild(n);          // React removes what it owns
  host.appendChild(document.createTextNode(next));    // and puts the new content in
}, text);

const shown = (page) => page.evaluate(() =>
  [...document.querySelectorAll(".smart-rtl-copy .smart-rtl-line")].map((el) => ({
    text: el.textContent,
    dir: getComputedStyle(el).direction
  })));

test("the host can rewrite a sent message, and what you read becomes the new text", async () => {
  const { page, close } = await open(userMessage("پہلی سطر\nدوسری سطر\nthird line"));
  try {
    assert.deepEqual((await shown(page)).map((l) => l.text),
      ["پہلی سطر", "دوسری سطر", "third line"], "the copy did not start out right");

    await rewrite(page, "npm install کے بعد چلائیں\nRun the build\nشکریہ");
    await page.waitForTimeout(300);

    const after = await shown(page);
    assert.deepEqual(after.map((l) => l.text),
      ["npm install کے بعد چلائیں", "Run the build", "شکریہ"],
      "the edited message is not what is on the screen");
    assert.deepEqual(after.map((l) => l.dir), ["rtl", "ltr", "rtl"],
      "the new lines were not decided again by the formula");
  } finally { await close(); }
});

test("editing it down to a single line takes our lines away entirely", async () => {
  const { page, close } = await open(userMessage("پہلی سطر\ndوسری سطر"));
  try {
    assert.ok((await shown(page)).length > 1);
    await rewrite(page, "اب صرف ایک سطر");
    await page.waitForTimeout(300);
    assert.equal(await page.$$eval(".smart-rtl-copy", (n) => n.length), 0,
      "a message that is no longer several lines still carries a copy");
    assert.notEqual(await page.$eval('[dir="auto"]', (el) => getComputedStyle(el).display), "none",
      "the host's own span was left hidden with nothing standing in for it");
  } finally { await close(); }
});

test("the host removing a message throws nothing, and takes ours with it", async () => {
  const { page, close } = await open(userMessage("پہلی سطر\nدوسری سطر"));
  try {
    const result = await page.evaluate(() => {
      const row = document.querySelector('[class*="message_"]');
      let threw = null;
      try { row.parentNode.removeChild(row); } catch (e) { threw = String(e); }
      return { threw, copiesLeft: document.querySelectorAll(".smart-rtl-copy").length };
    });
    assert.equal(result.threw, null);
    assert.equal(result.copiesLeft, 0, "our copy outlived the message it belonged to");
  } finally { await close(); }
});
