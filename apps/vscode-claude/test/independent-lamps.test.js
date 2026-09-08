/**
 * A string of lamps, not a circuit in series.
 *
 * This fix lives inside somebody else's product, and one day it will meet a version
 * of that product nobody has seen. The question that matters then is not whether
 * everything still works - it is how much goes dark, and whether anything of ours
 * argues with a fix of theirs.
 *
 * Two promises, and both are measured here rather than asserted in a comment:
 *
 *   1. ONE LAMP AT A TIME. A class name that has been renamed, a component that has
 *      been restyled, a block that throws for a reason nobody anticipated - each of
 *      those switches off exactly the thing that depended on it. Nothing else
 *      notices, and the webview never notices at all.
 *
 *   2. STAND DOWN, DO NOT FIGHT. If Claude Code fixes something itself, the part of
 *      this that existed for it must go quiet. Two fixes for one fault fight each
 *      other, and the fight is invisible to whoever shipped either of them.
 *
 * "Needed" is measured, never assumed: the page is asked to lay out the exact
 * sentence the fault is about, and where the browser puts its first character is the
 * answer. A stylesheet can be renamed, moved or overridden; a measurement cannot lie
 * about what a reader will see.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, message, userMessage, directions, CSS } = require("./support/page.js");

const URDU = "npm install کے بعد پروجیکٹ چلائیں";
const status = (page) => page.evaluate(() => window.__bidiStatus());

test("it says which parts are on, and every part is named", async () => {
  const { page, close } = await open(message(`<p>${URDU}</p>`));
  try {
    const s = await status(page);
    for (const name of ["direction", "composer", "splitSentMessages",
                        "unpinExpandedMessage", "keepTheViewOnTheMessage"]) {
      assert.ok(name in s, `${name} is not reported at all`);
    }
    assert.equal(s.direction, "on");
    assert.equal(s.engine.blocks, "watching");
    assert.equal(s.engine.contained, 0, "nothing should have gone wrong on a plain page");
  } finally { await close(); }
});

test("one block that throws does not take the rest of the batch with it", async () => {
  // The failure this is written against is quiet and total: the blocks are decided in
  // one loop, so before this the FIRST block to throw ended the pass, and every block
  // behind it in the same batch went undecided - and then the next batch, and then
  // the feature, without a word.
  const { page, close } = await open(message(
    `<p id="bad">${URDU}</p><p id="a">${URDU}</p><p id="b">${URDU}</p>`
  ), { fix: false });
  try {
    // break one block before the fix ever looks at it
    await page.evaluate(() => {
      Object.defineProperty(document.getElementById("bad"), "textContent", {
        configurable: true,
        get() { throw new Error("this block is broken"); }
      });
    });
    await page.addScriptTag({
      content: require("node:fs").readFileSync(
        require("node:path").resolve(__dirname, "../dist/payload.js"), "utf8")
        .replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`)
    });
    await page.waitForTimeout(600);

    const seen = await page.$$eval("#a,#b", (els) =>
      els.map((el) => (el.closest('[data-bidi="rtl"]') ? "rtl" : "ltr")));
    assert.deepEqual(seen, ["rtl", "rtl"],
      "the blocks behind the broken one were never decided");

    const s = await status(page);
    assert.ok(s.engine.contained >= 1, "the fault was not counted, so it was not contained");
    assert.equal(s.direction, "on", "and the feature itself is still on");
  } finally { await close(); }
});

test("if Claude Code already reads it the right way, nothing of ours is installed", async () => {
  // What a build that has fixed this itself looks like: the blocks carry their own
  // direction, so the sentence the fault is about already reads right to left.
  const FIXED = `<style>.root p{direction:rtl;unicode-bidi:isolate;text-align:start}</style>`;
  const { page, close } = await open(FIXED + message(`<p>${URDU}</p><p>Second line here</p>`));
  try {
    const s = await status(page);
    assert.equal(s.direction, "not needed - Claude Code does this itself now");
    assert.equal(await page.$$eval("[data-bidi]", (n) => n.length), 0,
      "not one decision of ours was written into the page");
    assert.equal(await page.$$eval("[data-bidi-probe]", (n) => n.length), 0,
      "and the thing used to ask the question was taken back out");
  } finally { await close(); }
});

test("and it stands down later too, when the first message finally arrives", async () => {
  // At start-up there is no message to measure - the panel has not rendered one when
  // a patch at the end of its bundle runs - so the question is left open and asked
  // again the moment there is something to ask about.
  const { page, close } = await open(`<div id="later"></div>`);
  try {
    assert.equal((await status(page)).direction, "on", "it starts on, with the question open");

    await page.evaluate((html) => {
      document.head.insertAdjacentHTML("beforeend",
        "<style>.root p{direction:rtl;unicode-bidi:isolate;text-align:start}</style>");
      document.getElementById("later").innerHTML = html;
    }, message(`<p>${URDU}</p>`));
    await page.waitForTimeout(400);

    const s = await status(page);
    assert.equal(s.direction, "not needed - Claude Code does this itself now");
    assert.equal(await page.$$eval("[data-bidi]", (n) => n.length), 0,
      "everything of ours came back out again");
    assert.equal(await page.$("#smart-rtl-direction") === null, true,
      "including the stylesheet");
  } finally { await close(); }
});

test("the unpinning rule stands down if a turn header is no longer pinned", async () => {
  const NOT_PINNED = `<style>.message_x.stickyHeader_x{position:static}</style>`;
  const { page, close } = await open(NOT_PINNED + userMessage("اسلام علیکم", { expanded: true }));
  try {
    const s = await status(page);
    assert.equal(s.unpinExpandedMessage, "not needed - Claude Code does this itself now");
    assert.equal(s.direction, "on", "and the lamp beside it is unaffected");
    assert.ok(!("keepTheViewOnTheMessage" in s),
      "the half of it that only matters while pinned is not switched on either");
  } finally { await close(); }
});

test("a message still reads right to left while its neighbours' lamps are off", async () => {
  // The point of all of it: the parts do not hold each other up.
  const NOT_PINNED = `<style>.message_x.stickyHeader_x{position:static}</style>`;
  const { page, close } = await open(
    NOT_PINNED + message(`<p>${URDU}</p>`) + userMessage("یہ میرا پیغام ہے", { expanded: true }));
  try {
    const s = await status(page);
    assert.equal(s.unpinExpandedMessage, "not needed - Claude Code does this itself now");
    const seen = await directions(page, ".root p");
    assert.deepEqual(seen.map((d) => d[0]), ["rtl"], "the answer still reads right to left");
  } finally { await close(); }
});

test("the escape hatch stops claiming that everything is on", async () => {
  const { page, close } = await open(message(`<p>${URDU}</p>`));
  try {
    assert.equal((await status(page)).direction, "on");
    const after = await page.evaluate(() => { window.__bidiFixOff(); return window.__bidiStatus(); });
    for (const [name, state] of Object.entries(after)) {
      if (name === "engine") continue;
      assert.ok(String(state).indexOf("on") !== 0, `${name} still says "${state}"`);
    }
    assert.equal(await page.$$eval("[data-bidi]", (n) => n.length), 0);
  } finally { await close(); }
});

test("asking whether it is still needed must not ask itself for ever", async () => {
  // Booting the real 5MB bundle found this and no test had: asking the question means
  // putting a probe in the page and taking it out again, and the thing that decides
  // WHEN to ask is watching the page. On a page where the question cannot be answered
  // yet - a container that matches the selector but styles nothing - each ask caused
  // the next one. Not a slow loop: the panel never finished loading.
  //
  // The copied page never saw it, because it always had a container the probe could
  // measure in, so the first ask always got an answer and stopped.
  const CANNOT_ANSWER = '<div class="rootish-but-not-the-root"><p>nothing styles this</p></div>';
  const t0 = Date.now();
  const { page, close } = await open(CANNOT_ANSWER);
  try {
    // Generous on purpose. The fault this is written against is a page that NEVER
    // finishes loading, and the whole suite runs a browser per file at once - so a
    // tight bound here measures how busy the machine is, not whether the loop is back.
    // A threshold that goes red under load is worse than no threshold: it teaches
    // whoever reads the suite that red is normal.
    const loaded = Date.now() - t0;
    assert.ok(loaded < 60000, "the page took " + loaded + "ms to load");

    // and it is still answering, after a while of mutations going past
    await page.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        document.body.appendChild(document.createElement("span"));
        await new Promise((r) => setTimeout(r, 5));
      }
    });
    assert.equal(await page.evaluate(() => 1 + 1), 2, "the page stopped responding");
    assert.equal((await status(page)).direction, "on",
      "and with no answer available it stays on, which is the safe way round");
    assert.equal(await page.$$eval("[data-bidi-probe]", (n) => n.length), 0,
      "no probe was left behind");
  } finally { await close(); }
});
