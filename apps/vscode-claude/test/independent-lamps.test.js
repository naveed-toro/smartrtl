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
    for (const name of ["direction", "composer", "sentMessages",
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

test("and it stands down later too, when the first message finally arrives - that part alone", async () => {
  // At start-up there is no message to measure - the panel has not rendered one when
  // a patch at the end of its bundle runs - so the question is left open and asked
  // again the moment there is something to ask about.
  //
  // Only the answers' part stands down. It used to take everything with it - the box you
  // type in and sent messages as well - so Claude Code fixing its answers would have
  // switched off two things it had never touched.
  const { page, close } = await open(`<div id="later"></div>` + userMessage("npm install کے بعد یہ میرا پیغام ہے"));
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
      "every answer decision of ours came back out again");
    assert.equal(await page.$eval(".content_x", (el) => getComputedStyle(el).direction), "rtl",
      "and a sent message still reads right to left - that lamp did not go out with this one");
    assert.equal(s.sentMessages, "on - measured working");
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

test("the long-message fix never takes the box you type into for a message, even a pinned one", async () => {
  // It finds a pinned row three ways, one of them upward from a run of text handed to
  // dir="auto". Nothing of Claude Code's but a message is sticky today - but a box pinned to
  // the bottom of the panel, with a draft long enough to pass half of it and its text drawn in
  // a layer beside it, is exactly what that road would find, and it must never be let go of.
  const DRAFT = Array.from({ length: 40 }, (_, i) => "draft line " + (i + 1)).join("\n");
  const { page, errors, close } = await open(
    `<div id="scroller" style="height:500px;overflow-y:auto"><div style="height:1200px">the conversation</div>
       <div class="messageInputContainer_x" style="position:sticky;bottom:0;background:#fff">
         <div class="messageInput_x" contenteditable="plaintext-only" role="textbox" aria-multiline="true">${DRAFT}</div>
         <div class="mentionMirror_x" aria-hidden="true"><span dir="auto">${DRAFT}</span></div>
       </div></div>`);
  try {
    const seen = await page.$eval(".messageInputContainer_x", (el) => ({
      tall: el.getBoundingClientRect().height > 250,
      position: getComputedStyle(el).position,
      marked: el.hasAttribute("data-bidi-unpin")
    }));
    assert.ok(seen.tall, "the box has to be taller than half the panel, or this proves nothing");
    assert.equal(seen.marked, false, "the box you type into was taken for a message to let go of");
    assert.equal(seen.position, "sticky");
    assert.deepEqual(errors, []);
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

test("a page that refuses our style element still gets the rules, another way", async () => {
  // Claude Code's webview allows a style element added from script today - its
  // style-src carries 'unsafe-inline'. Every part of this rides on that one word, all at
  // once. Measured: under a style-src without it, a <style> added from script is
  // refused, while a constructed stylesheet handed to document.adoptedStyleSheets is
  // not. So the engine checks that its stylesheet actually took, and if it did not,
  // uses the other way - and says which one it used.
  const { chromium } = require("playwright");
  const fs = require("node:fs"), path = require("node:path");
  const payload = fs.readFileSync(path.resolve(__dirname, "../dist/payload.js"), "utf8")
    .replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'unsafe-inline'">
      ${userMessage("npm install کے بعد یہ میرا پیغام ہے")}
      <script>${payload}</script>`);
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => ({
      dir: getComputedStyle(document.querySelector(".content_x")).direction,
      sheet: window.__bidiStatus().engine.sheet
    }));
    assert.equal(seen.dir, "rtl", "the message was not turned on a page that refuses style elements");
    assert.match(seen.sheet, /^adopted/, "and the status says which way the rules got in");
  } finally { await browser.close(); }
});

/* ---------------------------------------------------------------------------- *
 * Stand down, do not fight - one place at a time.
 *
 * Promise 2 at the top of this file used to hold for one of the three places text
 * appears: answers. The box you type into and a sent message were simply assumed to be
 * needed, for as long as either existed. So the likeliest update of all - Claude Code
 * fixing one of them, which is what people keep asking it to do - would have left two
 * fixes on one fault, ours invisible underneath theirs.
 *
 * Each of the three asks now, of the page, with the one text that can answer: a line that
 * opens in Latin and turns Urdu, which the browser's own rule reads one way and this rule
 * the other. Below: one place fixed, and the other two carrying on untouched.
 * ---------------------------------------------------------------------------- */

const COMPOSER = `<div class="messageInputContainer_x">
  <div class="messageInput_x" contenteditable="plaintext-only" role="textbox"
       aria-label="Message input" aria-multiline="true" data-placeholder="Ask anything"></div>
  <div class="mentionMirror_x" aria-hidden="true"></div>
</div>
<script>
  document.querySelector(".messageInput_x").addEventListener("input", function () {
    document.querySelector(".mentionMirror_x").textContent =
      document.querySelector(".messageInput_x").textContent;
  });
</script>`;

const FIXED_BOX = `<style>.messageInput_x,.mentionMirror_x{
  direction:rtl!important;unicode-bidi:isolate!important;text-align:start!important}</style>`;
const FIXED_SENT = `<style>.content_x,.content_x [dir="auto"]{
  direction:rtl!important;unicode-bidi:isolate!important;text-align:start!important}</style>`;

const everything = (html) => message(`<p>${URDU}</p>`) + userMessage(URDU) + COMPOSER + html;

async function draft(page, text) {
  await page.click(".messageInput_x");
  await page.keyboard.type(text, { delay: 3 });
  await page.waitForTimeout(250);
}

test("Claude Code fixing the box you type into dims that lamp and no other", async () => {
  const { page, errors, close } = await open(everything(FIXED_BOX));
  try {
    await draft(page, URDU);
    const s = await status(page);
    assert.match(s.composer, /^not needed/, "the box: " + s.composer);
    assert.equal(s.sentMessages, "on - measured working", "a sent message went with it");
    assert.equal(s.engine.blocks, "watching", "the answers' part went with it");
    assert.equal(await page.$eval(".content_x", (el) => el.getAttribute("data-bidi-sent")), "rtl");
    assert.deepEqual((await directions(page, ".root p")).map((d) => d[0]), ["rtl"]);
    assert.equal(await page.evaluate(() =>
      document.querySelectorAll("[data-bidi-input],[data-bidi-layer]").length), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("Claude Code fixing a sent message dims that lamp and no other", async () => {
  const { page, errors, close } = await open(everything(FIXED_SENT));
  try {
    await draft(page, URDU);
    const s = await status(page);
    assert.match(s.sentMessages, /^not needed/, "a sent message: " + s.sentMessages);
    assert.equal(s.composer, "on - measured working", "the box went with it");
    assert.equal(s.engine.blocks, "watching", "the answers' part went with it");
    assert.equal(await page.evaluate(() => document.querySelectorAll("[data-bidi-sent]").length), 0);
    assert.ok(await page.evaluate(() =>
      document.querySelectorAll("[data-bidi-input],[data-bidi-layer]").length >= 2),
      "the box is no longer turned");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and a build that has fixed all three leaves nothing of ours on the page at all", async () => {
  const FIXED_ANSWERS = `<style>.root :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th){
    unicode-bidi:isolate!important;direction:rtl!important}</style>`;
  const { page, errors, close } = await open(everything(FIXED_BOX + FIXED_SENT + FIXED_ANSWERS));
  try {
    await draft(page, URDU);
    await page.waitForTimeout(400);
    const s = await status(page);
    assert.match(s.composer, /^not needed/);
    assert.match(s.sentMessages, /^not needed/);
    assert.match(s.direction, /^not needed/, "the answers' part: " + s.direction);
    assert.equal(await page.evaluate(() => document.querySelectorAll(
      "[data-bidi],[data-bidi-sent],[data-bidi-input],[data-bidi-layer],[data-bidi-row]").length), 0,
      "something of ours is still on a page that needs none of it");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * A lamp that has stopped working must stop saying it is on.
 *
 * Both of these were found by breaking this fix on purpose, inside Claude Code's own
 * running app, one circuit at a time - which is how the two things every circuit shares
 * came to be tested at all. Each was contained exactly as intended; what neither did was
 * say so. A fix that has quietly stopped working looks exactly like one that is working,
 * and `__bidiStatus()` is the only thing standing between that and somebody's afternoon.
 * ---------------------------------------------------------------------------- */

test("a circuit whose every attempt throws stops calling itself on", async () => {
  // The rule cannot be reached from the page at all - the build keeps the rule, the engine
  // and the adapter inside one closure, and puts nothing of ours among the page's globals.
  // So this breaks what a page CAN break: the one element the circuit has to read. One
  // message, and it throws, so there is no second message quietly carrying the lamp.
  const { page, errors, close } = await open(`<div id="only"></div>` + COMPOSER);
  try {
    await page.evaluate((html) => {
      const only = document.getElementById("only");
      only.insertAdjacentHTML("beforeend", html);
      const body = only.querySelector(".content_x");
      Object.defineProperty(body, "textContent", {
        configurable: true,
        get() { throw new Error("this message cannot be read"); }
      });
      body.setAttribute("data-poke", "1");      // something for the observer to notice
    }, userMessage(URDU));
    await page.waitForTimeout(300);
    const s = await status(page);
    assert.match(s.sentMessages, /^not working/, "it went on claiming to be on: " + s.sentMessages);
    assert.match(s.sentMessages, /cannot be read/, "and it does not say WHAT threw");
    assert.ok(s.engine.sentDetail.contained >= 1, "the fault was counted");
    assert.equal(await page.evaluate(() =>
      document.querySelectorAll("[data-bidi-sent]").length), 0,
      "a message it could not read is left exactly as the page had it");
    assert.deepEqual(errors, [], "and none of it reached the page");
  } finally { await close(); }
});

test("and the box does the same: one box, broken, and the lamp over it stops saying on", async () => {
  const { page, errors, close } = await open(COMPOSER);
  try {
    await page.evaluate(() => {
      // a box that throws the moment anything of ours asks it a question
      document.querySelector(".messageInput_x").getAttribute = function () {
        throw new Error("this box cannot be asked");
      };
    });
    await draft(page, URDU);
    const s = await status(page);
    assert.match(s.composer, /^not working/, "it went on claiming to be on: " + s.composer);
    assert.match(s.composer, /cannot be asked/, "and it does not say WHAT threw");
    assert.ok(s.engine.composerDetail.contained >= 1, "the fault was counted");
    assert.equal(await page.evaluate(() =>
      document.querySelectorAll("[data-bidi-input]").length), 0,
      "and the box is not left half turned");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and a page that refuses every way of adding a stylesheet says what it measured, not that it is on", async () => {
  // The one piece of code the box, a sent message and an adapter's own circuit all share is
  // the thing that gets a stylesheet into the page. Break it and three lamps could have
  // gone dark together with nothing but "off" to show for it. They do not: each carries on,
  // reads the page back, and reports that the direction it set was not taken.
  const NO_SHEETS = `<script>
    (function () {
      var make = Document.prototype.createElement;
      Document.prototype.createElement = function (tag) {
        var el = make.apply(this, arguments);
        if (String(tag).toLowerCase() === "style") {
          try { Object.defineProperty(el, "sheet", { get: function () { return null; } }); } catch (e) {}
        }
        return el;
      };
      window.CSSStyleSheet = function () { throw new Error("no constructed sheets here"); };
    })();
  </script>`;
  const { page, errors, close } = await open(NO_SHEETS + userMessage(URDU) + COMPOSER);
  try {
    await draft(page, URDU);
    const s = await status(page);
    assert.match(s.composer, /^not working/, "the box: " + s.composer);
    assert.match(s.sentMessages, /^not working/, "a sent message: " + s.sentMessages);
    assert.match(s.engine.sheet, /^off/, "and the answers' part says its sheet never got in");
    assert.deepEqual(errors, [], "nothing reached the page");
  } finally { await close(); }
});

test("the day the box you type into has real paragraphs, the answers' part still stays out of it", async () => {
  // Claude Code's composer is plain text today, so nothing in it is a block and the question
  // never came up. A rich-text composer is an ordinary thing to ship - and on that day every
  // paragraph of somebody's draft would be a block the answers' part could decide, while the
  // box's own lamp is deciding the whole box. Two lamps, one element, each its own way.
  //
  // An answer is never inside an editor. That is the rule, and it is said in both places the
  // answers' part can reach a block from: the queue, and the pass over what is already there.
  const RICH = `<div class="messageInputContainer_x">
    <div class="messageInput_x" contenteditable="true" role="textbox"
         aria-label="Message input" aria-multiline="true" data-placeholder="Ask anything"
      ><p>npm install کے بعد</p><p>and a second line</p></div>
    <div class="mentionMirror_x" aria-hidden="true"><p>npm install کے بعد</p><p>and a second line</p></div>
  </div>`;
  const { page, errors, close } = await open(message(`<p>${URDU}</p>`) + RICH);
  try {
    await page.click(".messageInput_x");
    await page.keyboard.type(" مزید", { delay: 5 });
    await page.waitForTimeout(250);
    const seen = await page.evaluate(() => ({
      insideTheBox: document.querySelectorAll('.messageInputContainer_x [data-bidi]').length,
      theBoxTurned: document.querySelector(".messageInputContainer_x").getAttribute("data-bidi-input"),
      theAnswer: document.querySelector(".root p").closest('[data-bidi="rtl"]') ? "rtl" : "-"
    }));
    assert.equal(seen.insideTheBox, 0,
      "the answers' part decided a block inside the box you type into - the caret's layer or the one over it");
    assert.equal(seen.theBoxTurned, "rtl", "and the box's own lamp still turns it whole");
    assert.equal(seen.theAnswer, "rtl", "while the answer beside it is decided exactly as before");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
