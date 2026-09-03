/**
 * Jitter while an answer is being written.
 *
 * Direction changing under your eyes mid-sentence is worse than direction being
 * wrong, so this counts what a reader would actually see move. It samples every
 * animation frame while text arrives character by character, exactly the way a
 * streamed answer arrives.
 *
 * Zero is not reachable: when a line opens with an English word, the information
 * that RTL is coming does not exist yet. What must hold is that a block changes
 * at most once, and never changes back and forth.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, directions } = require("./support/page.js");

const BLOCKS = [
  ["h3", "JavaScript میں Debounce فنکشن"],
  ["p",  "فرض کریں ایک سرچ باکس ہے جو ہر حرف پر کال کرتا ہے۔"],
  ["h3", "Debounce بمقابلہ Throttle"],
  ["li", "args — اصل arguments جو فنکشن کو ملتے ہیں۔"],
  ["p",  "children بطور props بھیجنے سے دوبارہ رینڈر نہیں ہوتا۔"],
  ["p",  "The build tool comparison is documented upstream and stays in English."]
];

test("a streaming answer settles, and no block flips twice", async () => {
  const { page, close } = await open(`<div class="message timelineMessage_x"><div class="root" id="root"></div></div>`);
  try {
    const result = await page.evaluate(async (blocks) => {
      const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/, LAT = /[A-Za-z]/;
      const seen = new Map(), changes = new Map();
      const root = document.getElementById("root");

      const read = (el) => {
        if (el.getAttribute("data-bidi") === "ltr") return "ltr";
        if (el.closest('[data-bidi="rtl"]')) return "rtl";
        for (const ch of (el.textContent || "")) {
          if (RTL.test(ch)) return "rtl";
          if (LAT.test(ch)) return "ltr";
        }
        return "ltr";
      };
      const sample = () => {
        for (const el of root.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6")) {
          if (!el.textContent) continue;
          const now = read(el), before = seen.get(el);
          if (before === undefined) seen.set(el, now);
          else if (before !== now) { seen.set(el, now); changes.set(el, (changes.get(el) || 0) + 1); }
        }
      };
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

      for (const [tag, text] of blocks) {
        const el = document.createElement(tag);
        root.appendChild(el);
        for (let i = 1; i <= text.length; i += 3) { el.textContent = text.slice(0, i); await frame(); sample(); }
        el.textContent = text; await frame(); sample();
      }
      for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 10)); sample(); }

      return {
        worstBlock: Math.max(0, ...changes.values()),
        total: [...changes.values()].reduce((a, b) => a + b, 0),
        final: [...root.children].map((el) => [read(el), el.textContent.slice(0, 32)])
      };
    }, BLOCKS);

    // every Urdu block ends up right-to-left, the English one does not
    for (const [dir, text] of result.final.slice(0, 5)) assert.equal(dir, "rtl", text);
    assert.equal(result.final[5][0], "ltr", "the English paragraph stays as it was");

    // and this is the promise the design makes
    assert.ok(result.worstBlock <= 1,
      `no block may change direction more than once (worst was ${result.worstBlock})`);
    assert.ok(result.total <= 2,
      `the whole answer should settle in at most two visible changes (saw ${result.total})`);
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * And the same answer, with the model still working underneath it.
 *
 * This is the case the whole project exists for, and it was missing from the
 * test above: a reader does not wait for a turn to finish. They read the answer
 * as it lands, while the spinner is still going below it.
 *
 * That spinner is not decoration. From Claude Code's own bundle:
 *
 *     d30 = ["·","✢","✳","✶","✻","✽","✻","✶","✳","✢"]
 *     setInterval(() => X(q => (q + 1) % d30.length), 120)
 *
 * - a character rewritten every 120ms, for as long as the model is working. To a
 * MutationObserver watching the document that is a mutation like any other.
 * ------------------------------------------------------------------------- */
const WORKING = `<div class="statusLine_x">Working <span class="orbChar_x">·</span></div>
<script>
  var FRAMES = ["\u00b7","\u2722","\u2733","\u2736","\u273b","\u273d","\u273b","\u2736","\u2733","\u2722"];
  var orb = document.querySelector(".orbChar_x"), i = 0;
  window.__stopWorking = function () { clearInterval(window.__spin); };
  window.__spin = setInterval(function () { orb.textContent = FRAMES[++i % FRAMES.length]; }, 120);
</script>`;

test("a block is decided while the model is still working underneath it", async () => {
  const { page, close } = await open(
    `<div class="message timelineMessage_x"><div class="root" id="root"></div></div>` + WORKING);
  try {
    await page.evaluate(() => {
      const p = document.createElement("p");
      p.textContent = "useMemo اور useCallback کا فرق یہی ہے۔";
      document.getElementById("root").appendChild(p);
    });
    await page.waitForTimeout(1500);        // four times the quiet window, and then some

    const [[dir]] = await directions(page, "#root p");
    assert.equal(dir, "rtl",
      "a paragraph that has stopped changing is finished, whatever else on the page has not");
  } finally { await close(); }
});

test("the last block - the one being read - does not wait for the spinner to stop", async () => {
  const { page, close } = await open(
    `<div class="message timelineMessage_x"><div class="root" id="root"></div></div>` + WORKING, { fix: true });
  try {
    const whileWorking = await page.evaluate(async (blocks) => {
      const root = document.getElementById("root");
      for (const [tag, text] of blocks) {
        const el = document.createElement(tag);
        root.appendChild(el);
        for (let i = 1; i <= text.length; i += 4) {
          el.textContent = text.slice(0, i);
          await new Promise((r) => setTimeout(r, 4));
        }
        el.textContent = text;
        await new Promise((r) => setTimeout(r, 500));   // a pause between blocks
      }
      await new Promise((r) => setTimeout(r, 800));     // the answer is done; the tool is not
      return [...root.children].map((el) => !!el.closest('[data-bidi="rtl"]'));
    }, BLOCKS.slice(0, 3));

    assert.deepEqual(whileWorking, [true, true, true],
      "every block that has arrived should already read correctly, last one included");
  } finally { await close(); }
});

/**
 * The cost of deciding sooner, measured rather than assumed.
 *
 * Waiting for the whole page to go still was slow, but it was also SAFE: nothing
 * was ever decided from a paragraph that was still being written. Deciding as soon
 * as one paragraph stops changing buys the reader a correct line while they are
 * reading it, and it buys this: a message pauses in the middle - a tool runs, and
 * for a second or two no text arrives at all - and whatever was half-written when
 * it paused now looks finished.
 *
 * That is the trade this test exists to hold honest.
 */
test("a pause in the middle of a message does not freeze a half-written block", async () => {
  const { page, close } = await open(
    `<div class="message timelineMessage_x"><div class="root" id="root"></div></div>` + WORKING);
  try {
    const read = await page.evaluate(async () => {
      const root = document.getElementById("root");
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const rtl = (el) => !!el.closest('[data-bidi="rtl"]') && el.getAttribute("data-bidi") !== "ltr";

      const a = document.createElement("p");
      a.textContent = "یہ پہلا پیراگراف ہے اور پورا اردو میں ہے۔";
      root.appendChild(a);
      await wait(120);

      // a second block follows, so the message is decided from the first
      const b = document.createElement("p");
      b.textContent = "Result: 250-400ms";
      root.appendChild(b);
      await wait(900);                            // a tool runs. nothing is written. the spinner spins.

      const duringThePause = rtl(b);
      b.textContent += " اور یہی وہ فرق ہے جو ناپا گیا۔";   // and then the answer goes on
      await wait(600);

      return { a: rtl(a), duringThePause, b: rtl(b) };
    });

    assert.equal(read.a, true, "the first paragraph");
    assert.equal(read.duringThePause, false,
      "while it holds no RTL at all, it must be left exactly as the page had it");
    assert.equal(read.b, true,
      "and when the answer continues into it, that must not be ignored");
  } finally { await close(); }
});
