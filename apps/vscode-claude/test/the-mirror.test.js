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
