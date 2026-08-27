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
const { open } = require("./support/page.js");

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
