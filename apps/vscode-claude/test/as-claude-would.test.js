/**
 * AS IF CLAUDE CODE HAD FIXED IT ITSELF.
 *
 * The one sentence this project has been measured by from its first day: an Urdu reader should
 * feel that Claude Code fixed right-to-left on its own. Every other test here asks a question
 * somebody thought of - which way a paragraph reads, whether a dot is mirrored - and 0.5.5 passed
 * all of them while no Urdu list had a single visible bullet. The questions were right; the list
 * of them was not complete, and a list of questions can never be.
 *
 * So this one does not ask questions. It builds the answer to the sentence and compares.
 *
 * THE REFERENCE is Claude Code's own bundle and stylesheet with no SmartRTL in it, plus the fix a
 * Claude Code developer would write at the source: the Urdu answer's row is given dir="rtl", the
 * row's own dot rules are mirrored (their values, read from their stylesheet), a block holding
 * RTL stops being `plaintext` - that declaration IS the bug - and code stays left to right.
 * Everything else is the browser's own right-to-left: list markers, numbers, tables, quotes,
 * where lines wrap. Nothing in it is ours.
 *
 * Then the same answer with SmartRTL, and every element's box, side and marker, compared - once
 * the answer has arrived (number 4), and frame by frame while it streams in through Claude
 * Code's own stream assembler (number 3). Run against the installed Claude Code, and by the
 * daily watch against each new release, so the day an update makes this fix look like
 * something other than Claude's own work is the day it goes red.
 *
 * ONE difference is allowed, and it is written down rather than hidden: an English item in an
 * Urdu list. The reference keeps the page's plaintext on it, which lays its words out from the
 * left while its bullet is on the right - "npm install" a whole line away from its own marker.
 * Nobody fixing this at the source would ship that, so the item's text sits beside its marker.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;

/** VS Code gives the panel its colours; without them the dot and the rules are drawn in nothing. */
const COLOURS = "*{--app-secondary-foreground:#777!important;--app-primary-border-color:#bbb!important;" +
                "--app-input-border:#bbb!important;--app-code-background:#eee!important}";

/** Everything an answer is made of, in one Urdu answer - and the English inside it. */
const URDU = `## React میں State کا انتظام

یہ ایک عام پیراگراف ہے جس میں \`useState\` استعمال ہوا ہے، اور یہ اتنا لمبا ہے کہ کم از کم دو لائنوں میں ٹوٹے تاکہ دونوں طرف کا پھیلاؤ صاف نظر آئے۔

useMemo اور useCallback کا فرق یہ ہے کہ ایک قدر یاد رکھتا ہے اور دوسرا فنکشن۔

- پہلا نکتہ اردو میں
  - اندر والا نکتہ
- \`useMemo\` اور \`useCallback\`
- npm install
- 250–400ms

1. پہلا قدم: پروجیکٹ بنائیں
2. \`npm install\` کے بعد پروجیکٹ چلائیں
3. تیسرا قدم

- [ ] کام باقی ہے
- [x] کام ہو گیا

صرف انگریزی فہرست:

- build
- test

> یہ ایک اقتباس ہے جو کسی اور کی بات دہراتا ہے۔

| نام | وقت |
|---|---|
| سرچ باکس | 250–400ms |
| Auto-save | 1000ms |

انگریزی جدول:

| Name | Time |
|---|---|
| debounce | 300ms |

\`\`\`js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
\`\`\`

---

**نوٹ:** مزید تفصیل کے لیے [دستاویز](https://example.com) دیکھیں۔

The build tool comparison is documented upstream and stays in English.

آخری سطر۔`;

const ENGLISH = "Plain English answer, long enough to wrap onto a second line so that its spread can be compared with the one below it.\n\n- first point\n- second point\n\nLast line.";

/** Claude Code's own fix, as its developers would write it. Runs in the page, live. */
const REFERENCE = () => {
  const WORD = /[֐-ࣿיִ-﷿ﹰ-﻿]{2,}/;
  const rules = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } })
    .map((r) => r.cssText).join("\n");
  const gutter = (rules.match(/\.timelineMessage_[\w-]+\s*\{[^}]*padding-left:\s*(\d+)px/) || [])[1];
  const dot = (rules.match(/\.timelineMessage_[\w-]+::?before\s*\{[^}]*left:\s*(\d+)px/) || [])[1];
  const line = (rules.match(/\.timelineMessage_[\w-]+::?after\s*\{[^}]*left:\s*(\d+)px/) || [])[1];
  if (!gutter || !dot || !line) return "the row's dot rules are not in this stylesheet";
  const st = document.createElement("style");
  st.textContent =
    `[dir="rtl"][class*="timelineMessage_"]{padding-left:0;padding-right:${gutter}px}` +
    `[dir="rtl"][class*="timelineMessage_"]::before{left:auto;right:${dot}px}` +
    `[dir="rtl"][class*="timelineMessage_"]::after{left:auto;right:${line}px}` +
    `[dir="rtl"] pre{direction:ltr}[data-ref-rtl]{unicode-bidi:isolate!important}`;
  document.head.appendChild(st);
  const apply = () => {
    for (const msg of document.querySelectorAll('[data-testid="assistant-message"]')) {
      if (!WORD.test(msg.textContent)) continue;
      if (msg.getAttribute("dir") !== "rtl") msg.setAttribute("dir", "rtl");
      for (const b of msg.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th")) {
        if (WORD.test(b.textContent) && !b.hasAttribute("data-ref-rtl")) b.setAttribute("data-ref-rtl", "");
      }
    }
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  return "";
};

/** Where every element of every answer is drawn, which side each marker is on, and the dot. */
const READ = () => {
  const out = [];
  const inkOf = (el) => {
    const rg = document.createRange(); rg.selectNodeContents(el);
    const t = [...rg.getClientRects()].filter((x) => x.width > 1);
    return t.length ? [Math.round(Math.min(...t.map((x) => x.left))), Math.round(Math.max(...t.map((x) => x.right)))] : null;
  };
  for (const msg of document.querySelectorAll('[data-testid="assistant-message"]')) {
    const d = getComputedStyle(msg, "::before"), mb = msg.getBoundingClientRect();
    const dotX = d.left !== "auto" && parseFloat(d.left) < mb.width / 2 ? mb.left + parseFloat(d.left) : mb.right - parseFloat(d.right) - parseFloat(d.width);
    out.push({ what: "the message's dot", dot: Math.round(dotX) });
    for (const el of [msg, ...msg.querySelectorAll("*")]) {
      if (el.closest("svg")) continue;
      const r = el.getBoundingClientRect();
      const item = { what: el.tagName.toLowerCase() + " " + (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24),
                     tag: el.tagName, rtlText: /[؀-ۿ]{2,}/.test(el.textContent || ""),
                     box: [r.left, r.right, r.top, r.bottom].map(Math.round) };
      if (el.tagName === "LI") {
        const ub = el.parentElement.getBoundingClientRect(), rtl = getComputedStyle(el).direction === "rtl";
        item.marker = rtl ? "right, " + Math.round(ub.right - r.right) + "px" : "left, " + Math.round(r.left - ub.left) + "px";
      }
      if (/^(P|LI|H\d|TD|TH|BLOCKQUOTE)$/.test(el.tagName)) item.text = inkOf(el);
      out.push(item);
    }
  }
  return out;
};

/** Every frame of the answer being written: its markers, its dot, every block's side, and the growing line. */
const RECORD = () => {
  window.__frames = [];
  const loop = () => {
    const msg = [...document.querySelectorAll('[data-testid="assistant-message"]')].pop();
    if (msg) {
      const f = { stray: [], blocks: {} };
      const d = getComputedStyle(msg, "::before"), mb = msg.getBoundingClientRect();
      f.dot = d.left !== "auto" && parseFloat(d.left) < mb.width / 2 ? "left" : "right";
      for (const list of msg.querySelectorAll("ul,ol")) {
        const ld = getComputedStyle(list).direction;
        for (const li of list.children) {
          if (li.tagName === "LI" && getComputedStyle(li).direction !== ld) f.stray.push(li.textContent.trim().slice(0, 16));
        }
      }
      let i = 0;
      for (const b of msg.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,td,th")) {
        if (b.querySelector("p")) { i++; continue; }
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
        f.blocks[b.tagName + (i++)] = { side, len: (b.textContent || "").length, x: Math.round(side === "rtl" ? first.right : first.left),
                                        text: (b.textContent || "").trim().slice(0, 20), urdu: /[؀-ۿ]{2,}/.test(b.textContent || "") };
      }
      window.__frames.push(f);
    }
    if (!window.__stopRecording) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** What a reader went through while it was written. */
function judge(frames) {
  const stray = new Set(), dots = [], paths = new Map(), jumps = [], urduFromTheLeft = [];
  frames.forEach((f, i) => {
    f.stray.forEach((s) => stray.add(s));
    if (!dots.length || dots[dots.length - 1] !== f.dot) dots.push(f.dot);
    for (const [k, b] of Object.entries(f.blocks)) {
      if (b.urdu && b.side === "ltr") urduFromTheLeft.push(`frame ${i}: ${b.text}`);
      const p = i ? frames[i - 1].blocks[k] : null;
      if (!paths.has(k)) paths.set(k, { text: b.text, sides: [b.side], turnedWith: [] });
      if (!p) continue;
      const path = paths.get(k);
      path.text = b.text;
      if (p.side !== b.side) { path.sides.push(b.side); path.turnedWith.push(p.len); }
      else if (p.len === b.len && Math.abs(p.x - b.x) > 1) jumps.push(`${b.text}: ${p.x} -> ${b.x}`);
    }
  });
  return { frames: frames.length, stray: [...stray], dots, paths: [...paths.values()], jumps: [...new Set(jumps)], urduFromTheLeft };
}

async function withAnswer(fix, width, act) {
  const run = await app.boot(WEBVIEW, { fix });
  try {
    await run.page.setViewportSize({ width, height: 1400 });
    await run.page.addStyleTag({ content: COLOURS });
    if (!fix) {
      const said = await run.page.evaluate(REFERENCE);
      if (said) throw new Error("the reference could not be built: " + said);
    }
    const result = await act(run.page);
    assert.deepEqual(run.errors, [], "something reached the page uncaught");
    return result;
  } finally { await run.close(); }
}

for (const width of [700, 420]) {
  test(`number 4, at ${width}px: an answer that has arrived is laid out as Claude Code's own fix lays it out`, { skip }, async () => {
    const read = (fix) => withAnswer(fix, width, async (page) => {
      await app.converse(page, ["English please"], ENGLISH);
      await app.converse(page, ["اردو میں"], URDU);
      await page.waitForTimeout(700);
      return page.evaluate(READ);
    });
    const reference = await read(false), ours = await read(true);
    assert.equal(ours.length, reference.length, "SmartRTL added or removed an element");

    const differ = [];
    for (let i = 0; i < reference.length; i++) {
      const a = reference[i], b = ours[i];
      const far = (p, q) => (p || q) && (!p || !q || p.some((v, k) => Math.abs(v - q[k]) > 1));
      const parts = [];
      if ("dot" in a && Math.abs(a.dot - b.dot) > 1) parts.push(`the dot at ${b.dot}, Claude's own fix puts it at ${a.dot}`);
      if (far(a.box, b.box)) parts.push(`box ${b.box}, reference ${a.box}`);
      if (far(a.text, b.text)) parts.push(`text ${b.text}, reference ${a.text}`);
      if (a.marker !== b.marker) parts.push(`marker ${b.marker}, reference ${a.marker}`);
      if (!parts.length) continue;
      // the one written-down difference: an English item in an Urdu list, its text beside its marker
      const besideItsMarker = a.tag === "LI" && !a.rtlText && parts.length === 1 && far(a.text, b.text) &&
                              b.text && Math.abs(b.text[1] - b.box[1]) <= 1 && String(b.marker).startsWith("right");
      if (!besideItsMarker) differ.push(`${a.what}: ${parts.join("; ")}`);
    }
    assert.deepEqual(differ, [], "these do not look the way they would had Claude Code fixed this itself");
  });
}

test("number 3: an answer streamed in reads as Claude Code's own fix would, frame by frame, with nothing thrown about", { skip }, async () => {
  const watch = (fix) => withAnswer(fix, 700, async (page) => {
    await page.evaluate(RECORD);
    await app.stream(page, "اردو میں بتائیں", URDU);
    await page.evaluate(() => { window.__stopRecording = true; });
    return judge(await page.evaluate(() => window.__frames));
  });
  const reference = await watch(false), ours = await watch(true);
  const turns = (j) => j.paths.filter((p) => p.sides.length > 1);

  assert.ok(ours.frames > 100, `only ${ours.frames} frames were seen - the answer did not stream`);
  assert.deepEqual(ours.stray, [], "a bullet or a number was drawn on the other side from its list - off the edge of the answer");
  assert.deepEqual(ours.urduFromTheLeft, [], "a line holding Urdu was drawn from the left");
  assert.deepEqual(ours.jumps, [], "text that had already arrived moved sideways while nothing in it changed");
  assert.ok(ours.dots.length <= 2, "the dot moved more than once: " + ours.dots.join(" -> "));
  for (const p of turns(ours)) {
    assert.deepEqual(p.sides, ["ltr", "rtl"], `"${p.text}" went ${p.sides.join(" -> ")}`);
    assert.ok(p.turnedWith[0] <= 24, `"${p.text}" turned with ${p.turnedWith[0]} characters on screen - more than a word`);
  }
  assert.ok(turns(ours).length <= turns(reference).length + 1,
    `${turns(ours).length} lines turned while being written, and ${turns(reference).length} in Claude Code's own fix: ` +
    turns(ours).map((p) => p.text).join(", "));
  // the reference itself is held to the same, so that a rewrite of the harness cannot make it vacuous
  assert.deepEqual(reference.jumps, [], "the reference itself threw text about - the instrument is wrong, not the fix");
});
