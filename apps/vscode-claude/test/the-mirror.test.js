/**
 * THE MIRROR.
 *
 * The one sentence this project is measured by, with nobody's judgement left in it.
 *
 * Claude Code is not drawing right-to-left text wrongly. It does not KNOW. Its rule is
 * `unicode-bidi: plaintext` - take a line's direction from its FIRST STRONG CHARACTER - so a
 * line that opens with `npm` is drawn left to right however much Urdu follows it. The rule is
 * incomplete, not broken.
 *
 * Our formula supplies exactly the one fact it lacks: which pieces are right-to-left.
 *
 * And then the correct rendering is not ours to invent. The browser has always known how to
 * draw right-to-left. So this file does not compare against a fix somebody here imagined. It
 * compares against CLAUDE CODE'S OWN BUNDLE with the incomplete rule simply not written, and
 * what the formula knows said the plainest way anyone would say it:
 *
 *     the stylesheet   `unicode-bidi: plaintext` DELETED from the markdown root's rule - not
 *                      overridden, deleted, as if it had never been typed
 *     the message      dir="rtl"
 *     its RTL blocks   dir="rtl"
 *     everything else  nothing. What the formula calls left-to-right needs nothing done.
 *
 * No text-align, no !important, no rule of ours. Whatever the browser then does - where the
 * bullets go, which way the columns run, where a quote's bar sits, how the lines break - IS
 * the answer.
 *
 * THREE READINGS, AND THEY SAY THE WHOLE THING BETWEEN THEM
 *
 *   marked by the formula     must be exactly what the browser draws when TOLD
 *   not marked                must be exactly where CLAUDE CODE drew it, untouched
 *   code                      must be exactly what Claude Code drew, untouched
 *
 * There is no allow-list. Every element falls under one of the three, and each of the three
 * is an equality, so nothing can hide in a tolerance.
 *
 * WHY CODE IS ITS OWN LINE, AND WHY IT IS NOT A DEPARTURE. Measured here: told that the
 * message is right-to-left and left to the browser, a code block is CORRUPTED - the `;` at
 * the end of a line is drawn at the FRONT of it, and `if` splits into `i` and `f`. Those are
 * neutral characters resolving to the paragraph's direction, which is exactly right for prose
 * and exactly wrong for code. Keeping a code block left to right is not taste. It is the same
 * rule as the safety rule: never change anybody's text.
 *
 * The dot is not text and is not measured here - everything is read from each page's own
 * CONTENT box, so the dot's gutter cancels. It has rendering.test.js and
 * timeline-survival.test.js to itself.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;

/** VS Code gives the panel its colours; without them nothing is drawn in anything. */
const COLOURS = "*{--app-secondary-foreground:#777!important;--app-primary-border-color:#bbb!important;" +
                "--app-input-border:#bbb!important;--app-code-background:#eee!important}";

/** Everything an answer is made of, and the five headings that killed every other formula. */
const URDU = `# React میں State کا انتظام

## useMemo اور useCallback

### args - اصل arguments

#### children بطور props

##### Debounce بمقابلہ Throttle

###### JavaScript میں Debounce فنکشن

یہ ایک عام پیراگراف ہے جس میں \`useState\` استعمال ہوا ہے، اور یہ اتنا لمبا ہے کہ کم از کم دو لائنوں میں ٹوٹے تاکہ دونوں طرف کا پھیلاؤ صاف نظر آئے۔

ایک سطر جس میں **موٹا**، *ترچھا*، ~~کاٹا ہوا~~ اور [ایک ربط](https://example.com) سب ہیں۔

The build tool comparison is documented upstream and stays in English, and it is long enough to wrap.

- پہلا نکتہ اردو میں
  - اندر والا نکتہ
    - اور اس کے اندر تیسرا
- \`useMemo\` اور \`useCallback\`
- npm install
- 250–400ms
- ایک نکتہ جس کے دو پیراگراف ہیں

  دوسرا پیراگراف اسی نکتے کا۔

1. پہلا قدم: پروجیکٹ بنائیں
2. \`npm install\` کے بعد پروجیکٹ چلائیں
   1. اندر والا پہلا قدم
   2. اندر والا دوسرا قدم

- [ ] کام باقی ہے
- [x] کام ہو گیا

صرف انگریزی فہرست:

- build
- test

> یہ ایک اقتباس ہے جو کسی اور کی بات دہراتا ہے۔
>
> > اور اس کے اندر ایک اور اقتباس۔

| نام | وقت | تفصیل |
|---|---|---|
| سرچ باکس | 250–400ms | ایک لمبی تفصیل جو شاید دو سطروں میں ٹوٹے |
| Auto-save | 1000ms | short |

انگریزی جدول:

| Name | Time |
|---|---|
| debounce | 300ms |

\`\`\`js
// اردو میں تبصرہ
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (a[0] !== b[1]) { run(x, y); }
\`\`\`

---

**نوٹ:** مزید تفصیل کے لیے [دستاویز](https://example.com) دیکھیں۔ تاریخ 2026-09-16 اور 45٪ بھی یہیں ہیں۔

עברית: React מול Vue - שני הכלים טובים.

العربية: الفرق بين debounce و throttle بسيط.

فارسی: سرعت ساخت با Vite بیشتر است.

آخری سطر۔`;

const ENGLISH = "Plain English answer, long enough to wrap onto a second line so that its spread can be compared.\n\n- first point\n- second point\n\nLast line.";

/**
 * The incomplete rule, unwritten. It ships three times, once per engine prefix, and all
 * three have to go or the one that is left goes on deciding.
 */
const UNWRITE = (s) =>
  s.replace(/(\.root_[A-Za-z0-9_-]+\s+:(?:is|-webkit-any|-moz-any)\([^)]*\)\{)unicode-bidi:plaintext(\})/g, "$1$2");

/** And what the formula knows, said at the source. Runs in the page, live. */
const TOLD = () => {
  const WORD = /[֐-ࣿיִ-﷿ﹰ-﻿]{2,}/;
  const apply = () => {
    for (const msg of document.querySelectorAll('[data-testid="assistant-message"]')) {
      if (!WORD.test(msg.textContent || "")) continue;
      if (msg.getAttribute("dir") !== "rtl") msg.setAttribute("dir", "rtl");
      for (const b of msg.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th")) {
        if (WORD.test(b.textContent || "") && b.getAttribute("dir") !== "rtl") b.setAttribute("dir", "rtl");
      }
    }
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
};

/**
 * Every element of every answer: where its box is and where its ink falls, both measured
 * from the message's own CONTENT box so that the dot's gutter cannot show up as a
 * difference in the text. Plus, for a block, whether our formula marked it.
 */
const READ = () => {
  const WORD = /[֐-ࣿיִ-﷿ﹰ-﻿]{2,}/;
  const out = [];
  const inkOf = (el) => {
    const rg = document.createRange(); rg.selectNodeContents(el);
    const t = [...rg.getClientRects()].filter((x) => x.width > 1);
    return t.length ? [Math.min(...t.map((x) => x.left)), Math.max(...t.map((x) => x.right))] : null;
  };
  for (const msg of document.querySelectorAll('[data-testid="assistant-message"]')) {
    const cs = getComputedStyle(msg), mb = msg.getBoundingClientRect();
    const x0 = mb.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    for (const el of msg.querySelectorAll("*")) {
      if (el.closest("svg")) continue;
      const r = el.getBoundingClientRect();
      const ink = /^(P|LI|H\d|TD|TH|BLOCKQUOTE|PRE|CODE|A|STRONG|EM|DEL)$/.test(el.tagName) ? inkOf(el) : null;
      /* The block this piece is laid out in, and what the formula says about THAT. An inline
         <code> inside an Urdu heading holds no Urdu itself and still moves, because it is
         part of a line that does; asking the piece is asking the wrong thing. */
      const block = el.closest("p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,pre") || el;
      out.push({
        key: el.tagName + "|" + (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 44),
        inUrduAnswer: WORD.test(msg.textContent || ""),
        blockHasRtl: WORD.test(block.textContent || ""),
        inList: block.tagName === "LI" || !!block.closest("li"),
        code: el.tagName === "PRE" || !!el.closest("pre"),
        box: [r.left - x0, r.right - x0, r.top - mb.top, r.bottom - mb.top].map(Math.round),
        ink: ink ? [Math.round(ink[0] - x0), Math.round(ink[1] - x0)] : null
      });
    }
  }
  return out;
};

/** One conversation - an English answer and an Urdu one - in a panel of the given width. */
async function panel(how, width) {
  const run = await app.boot(WEBVIEW, how === "ours" ? { fix: true } : { fix: false, css: how === "told" ? UNWRITE : undefined });
  try {
    await run.page.setViewportSize({ width, height: 2400 });
    await run.page.addStyleTag({ content: COLOURS });
    if (how === "told") await run.page.evaluate(TOLD);
    await app.converse(run.page, ["English please"], ENGLISH);
    await app.converse(run.page, ["اردو میں"], URDU);
    await run.page.waitForTimeout(800);
    const read = await run.page.evaluate(READ);
    assert.deepEqual(run.errors, [], "something reached the page uncaught");
    assert.equal(await run.pane(), "", "Claude Code's own error pane is not empty");
    return read;
  } finally { await run.close(); }
}

const far = (p, q) => (p || q) && (!p || !q || p.some((v, i) => Math.abs(v - q[i]) > 1));

/**
 * THE ONE DECISION THIS FILE CANNOT MAKE FOR ITSELF, so it is written as a switch rather
 * than hidden in a tolerance.
 *
 * A block inside an Urdu answer that holds no right-to-left character at all - an English
 * paragraph, an English table cell. Two readings, both defensible, and they differ by which
 * edge that paragraph starts from:
 *
 *   true   it keeps the side Claude Code drew it on - the left. "What is left to right needs
 *          nothing done", taken literally. What ships today.
 *   false  it starts from the right, like every other paragraph of an Urdu answer, with its
 *          words still in their own order. What the browser does when told, and what an
 *          Urdu newspaper does with an English paragraph.
 *
 * Flip it and this test says, element by element, exactly what the panel would look like.
 */
const KEEPS_ITS_OWN_SIDE = true;

for (const width of [700, 420]) {
  test(`number 4, at ${width}px: every piece is either what the browser draws when told, or untouched`, { skip }, async (t) => {
    const untouched = await panel("untouched", width);
    const told = await panel("told", width);
    const ours = await panel("ours", width);

    assert.equal(ours.length, told.length, "SmartRTL added or removed an element");
    assert.equal(ours.length, untouched.length, "the reference itself added or removed an element");

    const wrong = [];
    let mirrored = 0, left = 0, code = 0;
    for (let i = 0; i < ours.length; i++) {
      const u = untouched[i], d = told[i], b = ours[i];
      if (u.key !== b.key || d.key !== b.key) { wrong.push(`the three readings stop lining up at ${i}: ${b.key}`); break; }
      /* WHERE THE BOX GOES is never in question. In a turned answer it is what the browser
         draws when told - which is how a table's columns come to run from the right and a
         list keeps the room for its markers on the right. In an untouched answer, and for a
         code block, it is exactly where Claude Code put it. */
      const wantBox = b.code || !b.inUrduAnswer ? u : d;

      /* WHICH SIDE OF THAT BOX THE WORDS START FROM is the one place a decision is made, and
         it is named here rather than tolerated in a margin. A block holding NO right-to-left
         character keeps the side Claude Code drew it on, because the formula calls it left to
         right and what is left to right needs nothing done. A list ITEM is the exception to
         that exception: it is drawn from its marker's side, so that "npm install" is not a
         whole line away from its own bullet. */
      const ownSide = b.inUrduAnswer && !b.code && !b.blockHasRtl && !b.inList && KEEPS_ITS_OWN_SIDE;
      const label = b.code ? "code, and must be exactly as Claude Code drew it"
                  : !b.inUrduAnswer ? "in an English answer, and must not have been touched at all"
                  : ownSide ? "holds no right-to-left text, so its words start from the side Claude Code drew them on"
                  : "in a turned answer, and must be exactly what the browser draws when told";
      const parts = [];
      if (far(wantBox.box, b.box)) parts.push(`box ${b.box}, wanted ${wantBox.box}`);
      if (ownSide) {
        // the same distance in from its own box's left edge as Claude Code drew it
        const gap = (x) => (x.ink ? [Math.round(x.ink[0] - x.box[0]), Math.round(x.ink[1] - x.box[0])] : null);
        if (far(gap(u), gap(b))) parts.push(`words start ${gap(b)} into their box, Claude Code drew them at ${gap(u)}`);
      } else if (far(wantBox.ink, b.ink)) parts.push(`ink ${b.ink}, wanted ${wantBox.ink}`);
      if (parts.length) wrong.push(`${b.key}\n      ${label}\n      ${parts.join("\n      ")}`);
      else if (b.code) code++; else if (ownSide) left++; else if (b.inUrduAnswer) mirrored++; else left++;
    }
    t.diagnostic(`${ours.length} elements: ${mirrored} mirrored, ${left} left alone, ${code} code`);
    assert.deepEqual(wrong, [], "these are not the mirror");

    // and the instrument is held to being able to see the fault at all
    const moved = ours.filter((b, i) => b.blockHasRtl && !b.code && far(untouched[i].ink, b.ink)).length;
    assert.ok(moved > 10, `only ${moved} marked pieces moved at all - the fix, or this test, is not running`);
  });
}

test("and the code in a code block is not touched by any of it", { skip }, async () => {
  // The measurement behind the third line of the rule above. Read as the eye reads it: the
  // characters of each line of the code block, in the order they are drawn, left to right.
  const CODE = () => {
    const pre = document.querySelector('[data-testid="assistant-message"] pre');
    if (!pre) return null;
    const chars = [];
    const walk = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const v = n.nodeValue || "";
      for (let i = 0; i < v.length; i++) {
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
        const q = rg.getBoundingClientRect();
        if (!q.width && !q.height) continue;
        chars.push({ ch: v[i], x: q.left, y: Math.round(q.top) });
      }
    }
    const lines = new Map();
    for (const c of chars) { if (!lines.has(c.y)) lines.set(c.y, []); lines.get(c.y).push(c); }
    return [...lines.values()].map((l) => l.slice().sort((a, b) => a.x - b.x).map((c) => c.ch).join("").trim()).filter(Boolean);
  };
  const code = async (how) => {
    const run = await app.boot(WEBVIEW, how === "ours" ? { fix: true } : { fix: false, css: how === "told" ? UNWRITE : undefined });
    try {
      await run.page.setViewportSize({ width: 900, height: 1400 });
      if (how === "told") await run.page.evaluate(TOLD);
      await app.converse(run.page, ["اردو میں"], URDU);
      await run.page.waitForTimeout(500);
      return await run.page.evaluate(CODE);
    } finally { await run.close(); }
  };
  const untouched = await code("untouched"), told = await code("told"), ours = await code("ours");
  assert.deepEqual(ours, untouched, "the code block does not read the way Claude Code drew it");
  // and the reason this rule exists, stated as a measurement rather than as a belief
  assert.notDeepEqual(told, untouched,
    "left to the browser inside a turned message, the code came out unchanged - then the rule that keeps it " +
    "left to right is no longer earning its place, and should be looked at");
});

/* ---------------------------------------------------------------------------------------- *
 * NUMBER 3: while it is being written.
 *
 * Number 4 is insurance. The whole value of this project is in number 3 - the eye must meet
 * the line already the right way round, the first time, and nothing it has read may move
 * afterwards. If number 4 ever has work to do, a reader has already seen the wrong thing.
 *
 * Said as a measurement, and it needs no reference at all, because it is about what a reader
 * went through rather than about where anything ended up:
 *
 *   no line holding right-to-left text is ever drawn from the left  - not for one frame
 *   nothing already on screen moves sideways, and nothing re-wraps
 *   no bullet or number is ever on the other side from its own list
 *   a line turns at most once, and it turns with a word on screen, not a sentence
 *
 * At five rhythms, because a real stream is not one rhythm: a character at a time, the
 * four-at-a-time the rest of this suite uses, bursty, whole paragraphs at once, and bursty in
 * a narrow panel. The rhythm matters - a burst can carry a line's first Urdu word in with its
 * first Latin one, and then nothing turns at all.
 * ---------------------------------------------------------------------------------------- */

/** Every frame: each block's side, where its text starts, and how tall it is. */
const RECORD = () => {
  window.__frames = [];
  const loop = () => {
    const msg = [...document.querySelectorAll('[data-testid="assistant-message"]')].pop();
    if (msg) {
      const d = getComputedStyle(msg, "::before"), mb = msg.getBoundingClientRect();
      const f = { stray: [], blocks: {},
                  dot: d.left !== "auto" && parseFloat(d.left) < mb.width / 2 ? "left" : "right" };
      for (const list of msg.querySelectorAll("ul,ol")) {
        const ld = getComputedStyle(list).direction;
        for (const li of list.children) {
          if (li.tagName === "LI" && getComputedStyle(li).direction !== ld) f.stray.push(li.textContent.trim().slice(0, 16));
        }
      }
      let i = 0;
      for (const b of msg.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,td,th")) {
        if (b.querySelector("p") || b.closest("pre")) { i++; continue; }
        const box = b.getBoundingClientRect();
        const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let first = null;
        for (let n = walk.nextNode(); n && !first; n = walk.nextNode()) {
          const at = n.nodeValue.search(/\S/);
          if (at < 0) continue;
          const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + 1);
          const q = r.getBoundingClientRect();
          if (q.width || q.height) first = q;
        }
        if (!first || !box.width) { i++; continue; }
        const side = (first.left + first.right) / 2 - box.left > box.width / 2 ? "rtl" : "ltr";
        f.blocks[b.tagName + (i++)] = {
          side, len: (b.textContent || "").length,
          x: Math.round(side === "rtl" ? first.right : first.left), h: Math.round(box.height),
          text: (b.textContent || "").trim().slice(0, 20),
          rtl: /[֐-ࣿיִ-﷿ﹰ-﻿]{2,}/.test(b.textContent || "")
        };
      }
      window.__frames.push(f);
    }
    if (!window.__stopRecording) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** What a reader went through, out of the frames. */
function judge(frames) {
  const stray = new Set(), paths = new Map(), moved = [], rewrapped = [], fromTheLeft = [], dots = [];
  frames.forEach((f, i) => {
    f.stray.forEach((s) => stray.add(s));
    if (f.dot && dots[dots.length - 1] !== f.dot) dots.push(f.dot);
    for (const [k, b] of Object.entries(f.blocks)) {
      if (b.rtl && b.side === "ltr") fromTheLeft.push("frame " + i + ": " + b.text);
      const p = i ? frames[i - 1].blocks[k] : null;
      if (!paths.has(k)) paths.set(k, { text: b.text, sides: [b.side], turnedWith: [] });
      if (!p) continue;
      const q = paths.get(k);
      q.text = b.text;
      if (p.side !== b.side) { q.sides.push(b.side); q.turnedWith.push(p.len); }
      else if (p.len === b.len) {
        if (Math.abs(p.x - b.x) > 1) moved.push(b.text + ": " + p.x + " -> " + b.x);
        if (Math.abs(p.h - b.h) > 1) rewrapped.push(b.text + ": " + p.h + " -> " + b.h + " tall");
      }
    }
  });
  return { frames: frames.length, stray: [...stray], fromTheLeft: fromTheLeft.slice(0, 6), fromTheLeftFrames: fromTheLeft.length,
           moved: [...new Set(moved)], rewrapped: [...new Set(rewrapped)], dots: dots,
           turns: [...paths.values()].filter((p) => p.sides.length > 1) };
}

const RHYTHMS = [
  { what: "a character at a time", chunk: 1, every: 16, width: 700 },
  { what: "four at a time", chunk: 4, every: 30, width: 700 },
  { what: "bursty", chunk: 60, every: 120, width: 700 },
  { what: "whole paragraphs at once", chunk: 200, every: 400, width: 700 },
  { what: "bursty, in a narrow panel", chunk: 60, every: 120, width: 420 }
];

for (const r of RHYTHMS) {
  test("number 3, " + r.what + ": the eye meets every line the right way round, the first time", { skip }, async (t) => {
    const run = await app.boot(WEBVIEW, { fix: true });
    try {
      await run.page.setViewportSize({ width: r.width, height: 1400 });
      await run.page.addStyleTag({ content: COLOURS });
      await run.page.evaluate(RECORD);
      await app.stream(run.page, "اردو میں بتائیں", URDU, { chunk: r.chunk, every: r.every });
      await run.page.evaluate(() => { window.__stopRecording = true; });
      const j = judge(await run.page.evaluate(() => window.__frames));

      assert.ok(j.frames > 60, "only " + j.frames + " frames were seen - the answer did not stream");
      assert.deepEqual(j.fromTheLeft, [], "a line holding Urdu was drawn from the left, in " + j.fromTheLeftFrames + " frames");
      assert.deepEqual(j.stray, [], "a bullet or a number was drawn on the other side from its own list");
      assert.deepEqual(j.moved, [], "text that had already arrived moved sideways while nothing in it changed");
      assert.deepEqual(j.rewrapped, [], "text that had already arrived re-wrapped while nothing in it changed");
      for (const p of j.turns) {
        assert.deepEqual(p.sides, ["ltr", "rtl"], '"' + p.text + '" went ' + p.sides.join(" -> ") + " - the answer may only ever move one way");
        assert.ok(p.turnedWith[0] <= 24, '"' + p.text + '" turned with ' + p.turnedWith[0] + " characters on screen - more than a word");
      }
      assert.ok(j.turns.length <= 1, j.turns.length + " lines turned while being written: " + j.turns.map((p) => p.text).join(", "));
      // and the message's own dot, which turns with it: it may arrive on the left and go to the
      // right once, and never come back. A dot that flickers is a fix somebody bolted on.
      assert.ok(j.dots.length <= 2, "the dot moved more than once: " + j.dots.join(" -> "));
      assert.deepEqual(run.errors, [], "something reached the page uncaught");
      t.diagnostic(j.frames + " frames, " + j.turns.length + " line turned" +
                   (j.turns.length ? ' ("' + j.turns[0].text + '" with ' + j.turns[0].turnedWith[0] + " characters on screen)" : ""));
    } finally { await run.close(); }
  });
}

test("and without the fix, that same stream is the fault, in frame after frame", { skip }, async (t) => {
  // The instrument has to be able to see the thing before it is believed when it says the
  // thing is gone. Four-at-a-time, the same answer, Claude Code untouched.
  const run = await app.boot(WEBVIEW, { fix: false });
  try {
    await run.page.setViewportSize({ width: 700, height: 1400 });
    await run.page.addStyleTag({ content: COLOURS });
    await run.page.evaluate(RECORD);
    await app.stream(run.page, "اردو میں بتائیں", URDU, { chunk: 4, every: 30 });
    await run.page.evaluate(() => { window.__stopRecording = true; });
    const j = judge(await run.page.evaluate(() => window.__frames));
    assert.ok(j.fromTheLeftFrames > 50,
      "only " + j.fromTheLeftFrames + " frames drew Urdu from the left without the fix - this test is no longer measuring the fault");
    t.diagnostic(j.fromTheLeftFrames + " frames drew a line holding Urdu from the left");
  } finally { await run.close(); }
});

/* ---------------------------------------------------------------------------------------- *
 * NUMBER 1: the box you type into.
 *
 * Same standard, same method. The reference is Claude Code's own bundle with the incomplete
 * rule DELETED from the box's own two layers - not overridden, deleted - and the element those
 * layers share given dir="rtl". Nothing else.
 *
 * WHAT THERE IS TO POINT AT, AND WHAT THERE IS NOT
 *
 * In an answer a line is an element - a <p>, an <li> - so a line can be told its direction. In
 * this box it is not. Measured: the box is `contenteditable="plaintext-only"`, which tells the
 * browser never to make an element, so Shift+Enter inserts a `\n` CHARACTER; and the layer
 * people actually read is a second one, into which React writes the whole draft as a single
 * text node. Three lines, three text nodes in the caret's layer and one in the layer over it,
 * and not an element among them.
 *
 * So the only thing there is to point at is the box, and the box is what is told. Per line here
 * would mean BUILDING the thing to point at - an element per line inside React's own mirror -
 * and that is not this project's job and has twice been proved not to be possible from outside:
 * 0.3.0 took React's nodes away and the panel came down, 0.3.3 drew a copy and every keystroke
 * arrived one keystroke late. decisions.md 25 to 28, 34, and 47.
 *
 * THE BOX IS TWO LAYERS AND BOTH ARE TOLD. The caret is in one and every glyph anybody reads is
 * in the other. Telling one is telling half, and the reader then types on one side and watches
 * letters appear on the other.
 *
 * ONE DIFFERENCE FROM THE REFERENCE, AND IT IS A NARROWING. The reference puts dir="rtl" on the
 * element the layers share - which also turns anything else that element ever holds. This turns
 * the two layers of TEXT and nothing else. Today the element holds nothing but those two layers,
 * so nothing drawn differs; the day it holds an icon, the icon is not text and is not ours.
 * ---------------------------------------------------------------------------------------- */

/** The incomplete rule, unwritten, on the box's own two layers. */
const UNWRITE_BOX = (s) => s
  .replace(/(\.messageInput_[A-Za-z0-9_-]+\{[^}]*?)unicode-bidi:plaintext;/g, "$1")
  .replace(/(\.mentionMirror_[A-Za-z0-9_-]+\{)unicode-bidi:plaintext;/g, "$1");

/** And what the formula says about the box: one answer, for the whole of it, live. */
const TOLD_BOX = () => {
  const LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const apply = () => {
    const input = document.querySelector('[class*="messageInput_"]');
    if (!input || !input.parentElement) return;
    const shared = input.parentElement;
    if (LETTER.test(shared.textContent || "")) shared.setAttribute("dir", "rtl");
    else shared.removeAttribute("dir");
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
};

/** A chip the host marks itself, the way a file path wants to be marked. */
const PUT_A_CHIP = () => {
  const mirror = document.querySelector('[class*="mentionMirror_"]');
  if (!mirror) return false;
  const span = document.createElement("span");
  span.setAttribute("dir", "ltr");
  span.setAttribute("data-test-chip", "");
  span.textContent = "src/app/main.ts";
  mirror.appendChild(span);
  return true;
};

/** Every element of the box: where it is, where its ink falls, and which way it reads. */
const READ_BOX = () => {
  const out = [];
  const inkOf = (el) => {
    const rg = document.createRange(); rg.selectNodeContents(el);
    const t = [...rg.getClientRects()].filter((x) => x.width > 1);
    return t.length ? [Math.min(...t.map((x) => x.left)), Math.max(...t.map((x) => x.right))] : null;
  };
  const input = document.querySelector('[class*="messageInput_"]');
  const box = document.querySelector('[class*="messageInputContainer_"]') || input.parentElement;
  const b0 = box.getBoundingClientRect();
  for (const el of [box, ...box.querySelectorAll("*")]) {
    if (el.closest("svg")) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), ink = inkOf(el);
    out.push({
      key: el.tagName + "|" + String(el.className || "").split(" ")[0].replace(/_[A-Za-z0-9]+$/, "") +
           "|" + (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24),
      isBox: el === box,
      chip: el.hasAttribute("data-test-chip"),
      box: [r.left - b0.left, r.right - b0.left, r.top - b0.top, r.bottom - b0.top].map(Math.round),
      ink: ink ? [Math.round(ink[0] - b0.left), Math.round(ink[1] - b0.left)] : null,
      dir: cs.direction
    });
  }
  return out;
};

/** Where the caret sits, and where the last glyph anybody can see is drawn. */
const CARET = () => {
  const input = document.querySelector('[class*="messageInput_"]');
  const mirror = document.querySelector('[class*="mentionMirror_"]') || input;
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(false);
  const c = r.getClientRects()[0] || r.getBoundingClientRect();
  const walk = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const v = n.nodeValue || "";
    for (let i = 0; i < v.length; i++) {
      if (!/\S/.test(v[i])) continue;
      const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
      const q = rg.getBoundingClientRect();
      if (q.width || q.height) last = q;
    }
  }
  const b = mirror.getBoundingClientRect();
  return { caret: Math.round(c.left - b.left),
           lastGlyph: last ? [Math.round(last.left - b.left), Math.round(last.right - b.left)] : null };
};

const MIXED = ["npm install کے بعد پروجیکٹ چلائیں", "Run the build", "یہ آخری سطر ہے"];
const PLAIN = ["Run the build and check the output", "second line, still English"];

async function box(how, lines, width, { chip = false } = {}) {
  const run = await app.boot(WEBVIEW, how === "ours" ? { fix: true } : { fix: false, css: how === "told" ? UNWRITE_BOX : undefined });
  try {
    await run.page.setViewportSize({ width, height: 700 });
    if (how === "told") await run.page.evaluate(TOLD_BOX);
    await run.page.click(app.BOX);
    for (let i = 0; i < lines.length; i++) {
      if (i) await run.page.keyboard.press("Shift+Enter");
      await run.page.keyboard.type(lines[i], { delay: 3 });
    }
    await run.page.waitForTimeout(350);
    if (chip) {
      assert.ok(await run.page.evaluate(PUT_A_CHIP), "the layer people read was not found");
      await run.page.waitForTimeout(250);
    }
    const out = { read: await run.page.evaluate(READ_BOX), caret: await run.page.evaluate(CARET) };
    assert.deepEqual(run.errors, [], "something reached the page uncaught");
    assert.equal(await run.pane(), "", "Claude Code's own error pane is not empty");
    return out;
  } finally { await run.close(); }
}

/** Everything the two readings disagree about, except the box's own direction - see above. */
function boxDiff(want, got) {
  const out = [];
  if (want.read.length !== got.read.length) return ["elements " + got.read.length + " vs " + want.read.length];
  for (let i = 0; i < want.read.length; i++) {
    const a = want.read[i], b = got.read[i], parts = [];
    if (a.key !== b.key) { out.push("the readings stop lining up at " + i + ": " + b.key); break; }
    if (far(a.box, b.box)) parts.push("box " + b.box + ", wanted " + a.box);
    if (far(a.ink, b.ink)) parts.push("ink " + b.ink + ", wanted " + a.ink);
    if (!b.isBox && a.dir !== b.dir) parts.push("reads " + b.dir + ", wanted " + a.dir);
    if (parts.length) out.push(b.key + "\n        " + parts.join("\n        "));
  }
  return out;
}

for (const width of [700, 420]) {
  test("number 1, at " + width + "px: a draft that holds Urdu is what the browser draws when it is told", { skip }, async (t) => {
    const told = await box("told", MIXED, width), ours = await box("ours", MIXED, width);
    assert.deepEqual(boxDiff(told, ours), [], "the box is not what the browser draws when it is told");
    assert.deepEqual(ours.caret, told.caret, "the caret is not where it would be");
    // the narrowing, asserted rather than assumed: the text layers turn, the box itself does not
    assert.equal(ours.read.find((x) => x.isBox).dir, "ltr", "the box itself was turned, and it is not text");
    assert.ok(ours.read.filter((x) => !x.isBox && x.dir === "rtl").length >= 2, "both layers of text must turn");
    t.diagnostic(ours.read.length + " elements, caret at " + ours.caret.caret + ", last glyph " + ours.caret.lastGlyph);
  });

  test("number 1, at " + width + "px: a draft with no Urdu in it is left exactly as Claude Code drew it", { skip }, async () => {
    const untouched = await box("untouched", PLAIN, width), ours = await box("ours", PLAIN, width);
    assert.deepEqual(boxDiff(untouched, ours), [], "an English draft was touched");
    assert.deepEqual(ours.caret, untouched.caret, "the caret moved in an English draft");
    assert.equal(ours.read.every((x) => x.dir === "ltr"), true, "something in an English draft was turned");
  });
}

test("a run the host marks itself keeps its own direction inside a turned box", { skip }, async () => {
  // This is the one that was wrong. The rule used to flatten EVERY descendant of a turned
  // layer, so a span the host had marked dir="ltr" - which is exactly what a file path in a
  // mention chip wants - came out right to left. Silencing a guess is our job; overruling
  // somebody who knows is not.
  const told = await box("told", MIXED, 700, { chip: true });
  const ours = await box("ours", MIXED, 700, { chip: true });
  const chipOf = (r) => r.read.find((x) => x.chip);
  assert.ok(chipOf(told) && chipOf(ours), "the chip was not drawn");
  assert.equal(chipOf(told).dir, "ltr", "the reference did not keep the chip's own direction - the instrument is wrong");
  assert.equal(chipOf(ours).dir, "ltr", "SmartRTL overruled a direction the host wrote itself");
  assert.deepEqual(boxDiff(told, ours), [], "the box with a marked chip in it is not what the browser draws when told");
});

test("and untouched, the box is the fault: a line that opens in English is drawn from the left", { skip }, async () => {
  // The instrument proves it can see the fault before it is trusted to say the fault is gone.
  const run = await app.boot(WEBVIEW, { fix: false });
  try {
    await run.page.setViewportSize({ width: 700, height: 700 });
    await run.page.click(app.BOX);
    await run.page.keyboard.type(MIXED[0], { delay: 3 });
    await run.page.waitForTimeout(300);
    const side = await run.page.evaluate(() => {
      const m = document.querySelector('[class*="mentionMirror_"]') || document.querySelector('[class*="messageInput_"]');
      const n = document.createTreeWalker(m, NodeFilter.SHOW_TEXT).nextNode();
      const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1);
      const a = r.getBoundingClientRect(), b = m.getBoundingClientRect();
      return (a.left - b.left) > b.width / 2 ? "rtl" : "ltr";
    });
    assert.equal(side, "ltr", "without the fix a draft opening with npm should be drawn from the left");
  } finally { await run.close(); }
});
