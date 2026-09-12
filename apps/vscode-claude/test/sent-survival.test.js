/**
 * A message somebody sent, put to the updates that have not happened yet.
 *
 * Seventeen builds of Claude Code were booted and sent a message before a line of this
 * lamp was written, and the sent message turned out to have changed more than the box
 * you type in ever did: dir="auto" arrived in 2.1.220, a heading hidden for screen readers
 * in 2.1.247, a class this fix leaned on vanished in 2.1.266, and what actually turned a
 * sent message, in the builds that had that heading, was the code for answers - deciding
 * the message's whole row from text nobody can see. Each test below is a next change of
 * one of those kinds, made on purpose to the page the rest of the suite uses.
 *
 * What every one of them requires:
 *
 *   the message reads right to left when there is an Urdu word in it, and is left
 *   exactly as the page had it when there is not
 *   nothing about it reaches an answer beside it - not a direction, not a decision
 *   and nothing of ours reaches the page as an error
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, message, userMessage, lineSides: reads, payload } = require("./support/page.js");

// The English line is kept shorter than the first on purpose. A sent message's bubble is as
// wide as its longest line, and the longest line fills it edge to edge - so it hugs both
// sides and says nothing about direction. Every other line says it by the side it hugs.
const MIXED = ["npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں", "Run the build", "یہ آخری سطر ہے"].join("\n");

const sentStatus = (page) => page.evaluate(() => {
  const s = window.__bidiStatus();
  return { lamp: s.sentMessages, detail: s.engine && s.engine.sentDetail, blocks: s.engine && s.engine.blocks };
});

/** The heading Claude Code hides above a sent message - kept one pixel square, whatever it is called. */
const SR_ONLY = "position:absolute;overflow:hidden;clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;margin:-1px;padding:0;border:0";

/* ---------------------------------------------------------------------------- *
 * Claude Code setting a direction on a sent message itself.
 *
 * It has never done so. It did it to the box you type in, in 2.1.267, and a rule that did
 * not already outrank it went dark that day. A sent message's rules now live where the
 * box's do: in a cascade layer declared before any of the page's, every one !important.
 * ---------------------------------------------------------------------------- */

test("plaintext on a sent message, !important, from Claude Code's most specific selector, does not win", async () => {
  const FORCED = `<style>
    #app .userMessage_x .content_x, #app .userMessage_x .content_x span
      { unicode-bidi: plaintext !important; direction: ltr !important; text-align: left !important }
  </style>`;
  const { page, errors, close } = await open(FORCED + `<div id="app">${userMessage(MIXED)}</div>`);
  try {
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"]);
    assert.equal((await sentStatus(page)).lamp, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("nor does the same from a cascade layer of its own", async () => {
  const LAYERED = `<style>@layer claude {
    .content_x, .content_x span { unicode-bidi: plaintext !important; direction: ltr !important; text-align: left !important }
  }</style>`;
  const { page, errors, close } = await open(LAYERED + userMessage(MIXED));
  try {
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"]);
    assert.equal((await sentStatus(page)).lamp, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the day an answer's paragraphs are handed to dir=\"auto\" too, they are still not taken for sent messages", async () => {
  // dir="auto" occurs once in Claude Code's bundle today, on a sent message's text, and that is
  // one of the two roads to a sent message. Handing an answer's paragraphs to it as well is an
  // obvious way for anyone to start fixing right-to-left - and on that day the road would find
  // every paragraph of every answer, and two lamps would be deciding the same paragraph, each
  // its own way. An answer is named by the test id every answer has carried since 2.1.59, and
  // the sent-message lamp never goes inside one.
  const ANSWER = `<div class="message timelineMessage_x" data-testid="assistant-message"><div class="root">
    <p dir="auto">Run the build first, then check the output - یہ</p>
    <p dir="auto">npm install کے بعد پروجیکٹ چلائیں</p></div></div>`;
  const { page, errors, close } = await open(userMessage(MIXED) + ANSWER);
  try {
    assert.equal(await page.$$eval('[data-testid="assistant-message"] [data-bidi-sent]', (n) => n.length), 0,
      "a paragraph of an answer was taken for a sent message");
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"], "and the sent message itself still turns");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and on the same day with the test id renamed, they are still not taken for sent messages", async () => {
  // The guard above is a name, and a renamed name does not fail loudly: the selector is still
  // valid, it just stops matching, so the guard would go quiet and nothing would say so. The
  // shape says it without a name. An answer is markdown - its text lands in real blocks - and
  // a sent message is not: its text is a bare run in a plain container. A run whose holder IS
  // one of the answers' blocks is not this lamp's, whatever the row it sits in is called.
  const ANSWER = `<div class="message timelineMessage_x" data-testid="model-turn"><div class="root">
    <p dir="auto">Run the build first, then check the output - یہ</p>
    <p dir="auto">npm install کے بعد پروجیکٹ چلائیں</p></div></div>`;
  const { page, errors, close } = await open(userMessage(MIXED) + ANSWER);
  try {
    assert.equal(await page.evaluate(() =>
      document.querySelectorAll(".root [data-bidi-sent], .root[data-bidi-sent]").length), 0,
      "a paragraph of an answer was taken for a sent message");
    // and the answers' part decides them, which is whose job it is - both of them, because
    // both carry Urdu, and a line that opens in English and turns Urdu is the whole formula
    assert.deepEqual(await directionsIn(page), ["rtl", "rtl"],
      "the answers' part did not decide the answer it is responsible for");
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"], "and the sent message still turns");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/** What a reader sees for each paragraph of the answer. */
const directionsIn = (page) => page.evaluate(() =>
  [...document.querySelectorAll(".root p")].map((p) =>
    p.getAttribute("data-bidi") === "ltr" ? "ltr" : (p.closest('[data-bidi="rtl"]') ? "rtl" : "-")));

test("the run the text sits in, given plaintext by a class and no longer handed to dir=\"auto\"", async () => {
  // What a build that swapped the browser's guess for its own stylesheet's would look like:
  // the same span, a class instead of the attribute. Held to the message's direction - it
  // is the text's own child, and nothing inside the text decides for itself.
  const HTML = `<style>.run_x{unicode-bidi:plaintext}</style>` +
               userMessage(MIXED).replace('<span dir="auto">', '<span class="run_x">');
  const { page, errors, close } = await open(HTML);
  try {
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Claude Code changing how a sent message is built.
 * ---------------------------------------------------------------------------- */

test("every class renamed, the heading's too, and the message's own row no longer named", async () => {
  // Nothing any selector here was written against, apart from what the elements are: the
  // run the text is handed to dir="auto" in, and a heading one pixel square. The message
  // must still turn - and the answer under it must not be decided from its heading. That
  // is the leak the boundary exists to stop, and the boundary is a name that is gone here.
  const RENAMED = `<div class="scroll_q" id="scroller" style="height:600px;overflow:auto"><div class="turn_q">
    <div class="row_q"><h3 class="hid_q" style="${SR_ONLY}">You: npm install کے بعد پروجیکٹ چلائیں</h3>
      <div class="bubble_q"><div class="box_q"><div class="body_q" style="white-space:pre-wrap"><span dir="auto">${MIXED}</span></div></div></div>
    </div>
    <div class="answer_q"><div class="root" id="ans"></div></div>
  </div></div>`;
  const { page, errors, close } = await open(RENAMED);
  try {
    assert.deepEqual(await reads(page, ".body_q"), ["rtl", "rtl", "rtl"], "the message turns, found by what it is");
    // and an English answer streams in underneath, watched every frame
    const seen = await page.evaluate(async () => {
      const root = document.getElementById("ans");
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const read = (el) => getComputedStyle(el).direction;
      const seen = new Set();
      for (const text of ["The build tool comparison is documented upstream.", "Nothing here is right to left."]) {
        const p = document.createElement("p");
        root.appendChild(p);
        for (let i = 1; i <= text.length; i += 4) { p.textContent = text.slice(0, i); await frame(); seen.add(read(p)); }
      }
      for (let i = 0; i < 30; i++) { await frame(); root.querySelectorAll("p").forEach((p) => seen.add(read(p))); }
      return { seen: [...seen], decided: !!root.closest('[data-bidi="rtl"]'), rowDecided: !!document.querySelector(".row_q[data-bidi]") };
    });
    assert.deepEqual(seen.seen, ["ltr"], "the English answer read right to left for a moment - the sent message reached it");
    assert.equal(seen.decided, false, "a decision sits above the answer that was never its own");
    assert.equal(seen.rowDecided, false, "and the sent message's row was decided by the code for answers");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a slash command sent with Urdu in it reads right to left", async () => {
  // Shown by Claude Code in a plain div - no expandable, no dir="auto" - so until now no
  // road reached it at all. It is named, and decided like any other sent message.
  const CMD = `<div class="message_x"><div class="userMessageContainer_x">
    <div class="userMessage_x slashCommandMessage_x" style="white-space:pre-wrap">/review اس فائل کو اردو میں دیکھیں</div></div></div>`;
  const off = await open(CMD, { fix: false });
  const on = await open(CMD);
  try {
    assert.deepEqual(await reads(off.page, ".slashCommandMessage_x"), ["ltr"], "the bug, untouched");
    assert.deepEqual(await reads(on.page, ".slashCommandMessage_x"), ["rtl"]);
    assert.deepEqual(on.errors, []);
  } finally { await off.close(); await on.close(); }
});

test("lines the host draws as elements of their own, each handed to dir=\"auto\", read with their message", async () => {
  const LINES = userMessage("").replace('<span dir="auto"></span>',
    MIXED.split("\n").map((l) => `<div dir="auto">${l}</div>`).join(""));
  const { page, errors, close } = await open(LINES);
  try {
    const dirs = await page.$$eval(".content_x > div", (els) => els.map((e) => getComputedStyle(e).direction));
    assert.deepEqual(dirs, ["rtl", "rtl", "rtl"], "one direction for the message, the limit written down");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("dir=\"auto\" moved onto the message's own block is decided there", async () => {
  const ON_BLOCK = `<div class="row_q"><div class="bubble_q"><div class="body_q" dir="auto" style="white-space:pre-wrap">${MIXED}</div></div></div>`;
  const { page, errors, close } = await open(ON_BLOCK);
  try {
    assert.deepEqual(await reads(page, ".body_q"), ["rtl", "rtl", "rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a mention the host marks left to right keeps its own direction inside a turned message", async () => {
  // Only the text's own children, and a run handed to the browser's guess, are held to the
  // message's direction. Anything deeper that the host has given a direction on purpose is
  // the host's decision, and it stays.
  const CHIP = userMessage("").replace('<span dir="auto"></span>',
    '<span dir="auto">دیکھیں <span class="chip_x" dir="ltr">@src/engine.js</span> والی فائل</span>');
  const { page, errors, close } = await open(CHIP);
  try {
    const seen = await page.evaluate(() => ({
      message: getComputedStyle(document.querySelector(".content_x")).direction,
      chip: getComputedStyle(document.querySelector(".chip_x")).direction
    }));
    assert.deepEqual(seen, { message: "rtl", chip: "ltr" });
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a message rewritten from Urdu to English goes back - and from English to Urdu, turns", async () => {
  // Decided by what it says now, not by what it said: a message the host rewrites - an
  // edit, a re-render - is decided again. The heading above it still says the old text,
  // which is one more reason it must never be what decides the message.
  const { page, errors, close } = await open(userMessage("npm install کے بعد پروجیکٹ چلائیں"));
  try {
    assert.deepEqual(await reads(page, ".content_x"), ["rtl"]);
    await page.evaluate(() => { document.querySelector(".content_x span").textContent = "npm install and then run it"; });
    await page.waitForTimeout(60);
    assert.deepEqual(await reads(page, ".content_x"), ["ltr"]);
    assert.equal(await page.$$eval("[data-bidi-sent]", (e) => e.length), 0, "and nothing of ours is left on it");
    await page.evaluate(() => { document.querySelector(".content_x span").textContent = "npm install کے بعد دوبارہ"; });
    await page.waitForTimeout(60);
    assert.deepEqual(await reads(page, ".content_x"), ["rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a message built again from scratch is decided again at once, and the old one let go", async () => {
  const { page, errors, close } = await open(`<div id="t">${userMessage("npm install کے بعد پروجیکٹ چلائیں")}</div>`);
  try {
    await page.evaluate((html) => { document.getElementById("t").innerHTML = html; },
      userMessage("npm install کے بعد دوبارہ چلائیں"));
    await page.waitForTimeout(1200);                   // past the pass that lets go of what left the page
    assert.deepEqual(await reads(page, ".content_x"), ["rtl"]);
    assert.equal((await sentStatus(page)).detail.messages, 1, "the message that left the page is not kept alive");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Faults, and the lamps staying apart.
 * ---------------------------------------------------------------------------- */

test("the answers' part failing to start does not dim a sent message", async () => {
  const BREAK_ANSWERS = `<script>
    (function () {
      var Real = MutationObserver;
      window.MutationObserver = function (cb) {
        if (/push\\(r\\.target\\)/.test(String(cb))) throw new Error("no observer for the answers");
        return new Real(cb);
      };
      window.MutationObserver.prototype = Real.prototype;
    })();
  </script>`;
  const { page, errors, close } = await open(BREAK_ANSWERS + userMessage(MIXED));
  try {
    const s = await sentStatus(page);
    assert.match(s.blocks, /^off/, "the answers' part really did fail to start");
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"]);
    assert.equal(s.lamp, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a message that throws when it is read is left as the page had it, and the one beside it is still decided", async () => {
  const { page, errors, close } = await open(`<div id="t"></div>`);
  try {
    await page.evaluate(([a, b]) => {
      const t = document.getElementById("t");
      t.insertAdjacentHTML("beforeend", a);
      const bad = t.querySelector(".content_x");
      Object.defineProperty(bad, "textContent", { configurable: true, get() { throw new Error("this message is broken"); } });
      t.insertAdjacentHTML("beforeend", b);
    }, [userMessage("npm install کے بعد پہلا"), userMessage("npm install کے بعد دوسرا")]);
    await page.waitForTimeout(100);
    const seen = await page.$$eval(".content_x", (els) => els.map((e) => e.getAttribute("data-bidi-sent")));
    assert.deepEqual(seen, [null, "rtl"]);
    assert.ok((await sentStatus(page)).detail.contained >= 1, "and the fault was counted");
    assert.deepEqual(errors, [], "nothing reached the page");
  } finally { await close(); }
});

test("if the page takes our stylesheet away, it goes back without waiting for a new message", async () => {
  const { page, errors, close } = await open(userMessage(MIXED) + `<div id="elsewhere"></div>`);
  try {
    await page.evaluate(() => document.getElementById("smart-rtl-sent").remove());
    await page.evaluate(() => document.getElementById("elsewhere").appendChild(document.createElement("span")));
    await page.waitForTimeout(60);
    assert.equal(await page.$$eval("#smart-rtl-sent", (e) => e.length), 1);
    assert.deepEqual(await reads(page, ".content_x"), ["rtl", "rtl", "rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a page that refuses style elements still gets a sent message turned", async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setContent(`<!doctype html><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'unsafe-inline'">
      <div class="row_q"><div id="body" style="white-space:pre-wrap"><span dir="auto">npm install کے بعد پروجیکٹ چلائیں</span></div></div>
      <script>${payload().replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`)}</script>`);
    await page.waitForTimeout(200);
    const seen = await page.evaluate(() => ({
      dir: getComputedStyle(document.getElementById("body")).direction,
      sheet: window.__bidiStatus().engine.sentDetail.sheet
    }));
    assert.equal(seen.dir, "rtl");
    assert.match(seen.sheet, /^adopted/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("if Claude Code holds the text left to right from script, the status says it is not working", async () => {
  const { page, errors, close } = await open(`<div id="t"></div>`);
  try {
    await page.evaluate((html) => {
      document.getElementById("t").innerHTML = html;
      const span = document.querySelector(".content_x span");
      span.style.setProperty("direction", "ltr", "important");
      span.style.setProperty("unicode-bidi", "plaintext", "important");
    }, userMessage(MIXED));
    await page.waitForTimeout(100);
    assert.match((await sentStatus(page)).lamp, /^not working - /);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * What must stay true however the page changes.
 * ---------------------------------------------------------------------------- */

test("the status says which road found the message, and that it was measured", async () => {
  const byName = await open(userMessage(MIXED).replace('<span dir="auto">', "<span>"));
  const byRun = await open(`<div class="row_q"><div class="body_q"><span dir="auto">${MIXED}</span></div></div>`);
  try {
    const a = await sentStatus(byName.page), b = await sentStatus(byRun.page);
    assert.match(a.detail.found, /expandableContainer/);
    assert.match(b.detail.found, /dir="auto"/);
    assert.equal(a.lamp, "on - measured working");
    assert.equal(b.lamp, "on - measured working");
  } finally { await byName.close(); await byRun.close(); }
});

test("an English message leaves not one attribute of ours on the page", async () => {
  const { page, errors, close } = await open(userMessage("Run the build\nThen open the report") +
    message("<p>The answer is English too.</p>"));
  try {
    assert.equal(await page.$$eval("[data-bidi],[data-bidi-sent]", (e) => e.length), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the escape hatch takes the sent-message lamp with it, and nothing comes back", async () => {
  const { page, errors, close } = await open(`<div id="t">${userMessage(MIXED)}</div>`);
  try {
    await page.evaluate(() => window.__bidiFixOff());
    assert.equal(await page.$$eval("#smart-rtl-sent,[data-bidi-sent]", (e) => e.length), 0);
    await page.evaluate((html) => document.getElementById("t").insertAdjacentHTML("beforeend", html),
      userMessage("npm install کے بعد ایک اور"));
    await page.waitForTimeout(100);
    assert.equal(await page.$$eval("[data-bidi-sent]", (e) => e.length), 0, "it is off, not paused");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Claude Code fixing a sent message itself.
 *
 * The same question the box is asked, for the same reason, and kept honest the same way:
 * asked of the real message, with the one text that can tell the browser's rule and this
 * one apart, and never with a message of pure Urdu - which reads right to left whether the
 * fault is there or not.
 * ---------------------------------------------------------------------------- */

/** A Claude Code that has fixed a sent message, written the way such a fix would be. */
const FIXED_SENT = `<style>
  .content_x, .content_x [dir="auto"] {
    direction: rtl !important; unicode-bidi: isolate !important; text-align: start !important;
  }</style>`;

const marked = (page) => page.evaluate(() => document.querySelectorAll("[data-bidi-sent]").length);
const reallyReads = (page) => page.$eval(".content_x", (el) => getComputedStyle(el).direction);

test("today nothing stands down: the page still reads a mixed message the wrong way round", async () => {
  const { page, errors, close } = await open(userMessage(MIXED));
  try {
    assert.equal((await sentStatus(page)).lamp, "on - measured working");
    assert.equal(await marked(page), 1);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a build that reads a mixed message correctly takes this lamp out of the page", async () => {
  const { page, errors, close } = await open(userMessage(MIXED) + FIXED_SENT);
  try {
    const s = await sentStatus(page);
    assert.match(s.lamp, /^not needed/, "the page does this itself now: " + s.lamp);
    assert.equal(await marked(page), 0, "and no mark of ours is left on the message");
    assert.equal(await reallyReads(page), "rtl", "their own fix is doing what ours did");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and a message of pure Urdu answers nothing, so the lamp stays on", async () => {
  const { page, errors, close } = await open(userMessage("اسلام علیکم یہ سارا پیغام اردو میں ہے") + FIXED_SENT);
  try {
    assert.equal((await sentStatus(page)).lamp, "on - measured working",
      "a message that proves nothing took the lamp out of the page");
    assert.equal(await marked(page), 1);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a fixed build leaves the answers' part exactly where it was", async () => {
  // Three questions, three circuits. Claude Code fixing the place a message is shown has
  // said nothing whatsoever about what its answers do.
  const { page, errors, close } = await open(
    userMessage(MIXED) + message("<p>npm install کے بعد پروجیکٹ چلائیں</p>") + FIXED_SENT);
  try {
    const s = await sentStatus(page);
    assert.match(s.lamp, /^not needed/);
    assert.equal(s.blocks, "watching", "the answers' part went with it");
    assert.deepEqual(await reads(page, ".root p"), ["rtl"], "and the answer is still decided");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
