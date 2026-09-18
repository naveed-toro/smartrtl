/**
 * ONLY THE FORMULA.
 *
 * From 0.7.0 the one thing this extension does to text is give it the direction the formula
 * says - openingLetters, 45 letters, in packages/core - in the four places: the box you type
 * into, a message you send, an answer while it streams, and the finished answer. Claude Code's
 * own guess is switched off on those elements, and nothing else of ours acts on text.
 *
 * So every test here asks the same question of Claude Code's own running app (its real bundle
 * and stylesheet, support/app.js): is the direction a reader sees, element by element and
 * frame by frame, exactly what the formula says - and is nothing else of ours on the page?
 * docs/decisions.md section 51.
 *
 * With no Claude Code installed it skips.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");
const { openingLetters } = require("../../../packages/core/src/direction.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;

/** The formula, in the page - the same function, from the same file. */
const FORMULA = require("node:fs").readFileSync(path.resolve(__dirname, "../../../packages/core/src/direction.js"), "utf8");

const ANSWER = [
  "## useMemo اور useCallback",
  "",
  "React ایک لائبریری ہے جو صارف کا انٹرفیس بناتی ہے۔",
  "",
  "یہ جملہ شروع سے اردو ہے اور اس میں React بھی آتا ہے۔",
  "",
  "In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical.",
  "",
  "Check the native RTL claim yourself, two minutes and no risk, and only then look for ایک ٹکڑا.",
  "",
  "This paragraph is plain English from start to end.",
  "",
  "- `useMemo` جب حساب مہنگا ہو",
  "- The call stack runs first.",
  "- جواب عموماً 250–400ms میں آ جاتا ہے",
  "",
  "| Hook | کیا یاد رکھتا ہے |",
  "|---|---|",
  "| useMemo | نتیجہ |",
  "",
  "```js",
  "const total = useMemo(() => sum(items), [items]);",
  "```"
].join("\n");

/** Every block of every answer, and what is on it - read in the page. */
const READ_ANSWERS = () => [...document.querySelectorAll('[class^="root_"] :is(p,li,h1,h2,h3,h4,h5,h6,td,th),[class*=" root_"] :is(p,li,h1,h2,h3,h4,h5,h6,td,th)')]
  .filter((b) => !b.closest("pre") && !b.closest('[class*="screenReaderTurnHeading_"],[class*="visuallyHidden_"]'))
  .map((b) => {
    let own = "";
    const walk = (el) => { for (const n of el.childNodes) { if (n.nodeType === 3) own += n.nodeValue; else if (n.nodeType === 1 && !/^(UL|OL|PRE)$/.test(n.tagName)) walk(n); } };
    walk(b);
    const cs = getComputedStyle(b);
    return { tag: b.tagName, text: own, direction: cs.direction, bidi: cs.unicodeBidi, attr: b.getAttribute("data-bidi") };
  });

test("a streamed answer: in every frame, every block's direction is exactly the formula's", { skip }, async () => {
  const run = await app.boot(WEBVIEW, { fix: true });
  try {
    // watch every painted frame from before the answer starts
    await run.page.evaluate((src) => {
      const module = { exports: {} };
      new Function("module", src)(module);
      window.__formula = module.exports.openingLetters;
      window.__frames = [];
      const read = () => [...document.querySelectorAll('[class^="root_"] :is(p,li,h1,h2,h3,h4,h5,h6,td,th),[class*=" root_"] :is(p,li,h1,h2,h3,h4,h5,h6,td,th)')]
        .filter((b) => !b.closest("pre") && !b.closest('[class*="screenReaderTurnHeading_"],[class*="visuallyHidden_"]'))
        .map((b) => {
          let own = "";
          const walk = (el) => { for (const n of el.childNodes) { if (n.nodeType === 3) own += n.nodeValue; else if (n.nodeType === 1 && !/^(UL|OL|PRE)$/.test(n.tagName)) walk(n); } };
          walk(b);
          return { text: own, direction: getComputedStyle(b).direction };
        });
      const tick = () => { window.__frames.push(read()); if (window.__frames.length < 4000) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, FORMULA);
    await app.stream(run.page, "test", ANSWER, { chunk: 3, every: 25 });

    const frames = await run.page.evaluate(() => window.__frames);
    let checked = 0;
    const wrong = [];
    for (const blocks of frames) {
      for (const b of blocks) {
        const want = openingLetters(b.text);
        if (want === null) continue;                 // no letter yet: nothing to decide
        checked++;
        if (b.direction !== want) wrong.push(`${want} wanted, ${b.direction} seen: ${b.text.slice(0, 50)}`);
      }
    }
    assert.ok(checked > 200, "the answer was not watched arriving (" + checked + " block-frames)");
    assert.deepEqual([...new Set(wrong)], [], "a block showed a direction the formula did not give");

    const final = await run.page.evaluate(READ_ANSWERS);
    const texts = final.map((b) => b.text);
    for (const must of ["useMemo اور useCallback", "React ایک لائبریری", "In Urdu this idea", "Check the native RTL", "plain English from start", "The call stack", "250–400ms"]) {
      assert.ok(texts.some((t) => t.includes(must)), "the answer's block was not found: " + must);
    }
    for (const b of final) {
      const want = openingLetters(b.text);
      if (want === null) continue;
      assert.equal(b.direction, want, b.text);
      assert.equal(b.attr, want, "tagged with the formula's answer: " + b.text);
      assert.notEqual(b.bidi, "plaintext", "Claude Code's own guess is still on: " + b.text);
    }
    // the two cases the formula is about, read from the page
    const find = (s) => final.find((b) => b.text.includes(s));
    assert.equal(find("React ایک لائبریری").direction, "rtl");
    assert.equal(find("Check the native RTL").direction, "ltr", "an Urdu phrase past 45 letters leaves the block left to right");
    assert.equal(find("In Urdu this idea").direction, "rtl", "an Urdu phrase within 45 letters turns it - the known limit");
    assert.equal(find("The call stack").direction, "ltr", "a list item is decided by its own text, not its list's");

    assert.deepEqual(run.errors, [], "something reached the page uncaught");
    assert.equal(await run.pane(), "", "Claude Code's own error pane is not empty");
  } finally { await run.close(); }
});

test("nothing of ours is anywhere but on the elements the formula decides", { skip }, async () => {
  const run = await app.boot(WEBVIEW, { fix: true });
  try {
    await app.stream(run.page, "test", ANSWER, { chunk: 40, every: 10 });
    // the stream is sent as a message first, so a sent message is on the page too
    const found = await run.page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        for (const a of el.getAttributeNames()) {
          if (!a.startsWith("data-bidi")) continue;
          out.push({ attr: a, tag: el.tagName, inCode: !!el.closest("pre") });
        }
      }
      return out;
    });
    const kinds = new Set(found.map((f) => f.attr));
    for (const k of kinds) assert.ok(["data-bidi", "data-bidi-box", "data-bidi-sent"].includes(k), "an attribute of ours that is not a direction: " + k);
    assert.ok(found.every((f) => !f.inCode), "code was tagged");
    assert.ok(found.filter((f) => f.attr === "data-bidi").every((f) => /^(P|LI|H[1-6]|TD|TH)$/.test(f.tag)), "an answer's tag on something that is not a block");
  } finally { await run.close(); }
});

test("the box you type into: after every keystroke, both layers take the formula's direction", { skip }, async () => {
  const run = await app.boot(WEBVIEW, { fix: true });
  try {
    await run.page.click(app.BOX);
    const draft = "React is a JavaScript library ایک لائبریری";
    const wrong = [];
    for (let i = 0; i < draft.length; i++) {
      await run.page.keyboard.type(draft[i]);
      await run.page.waitForTimeout(30);
      const seen = await app.read(run.page);
      const want = openingLetters(draft.slice(0, i + 1));
      if (want === null) continue;
      if (seen.input.dir !== want) wrong.push(`input ${seen.input.dir} after "${draft.slice(0, i + 1)}"`);
      if (seen.mirror && seen.mirror.dir !== want) wrong.push(`layer ${seen.mirror.dir} after "${draft.slice(0, i + 1)}"`);
    }
    assert.deepEqual(wrong, []);
    const done = await app.read(run.page);
    assert.equal(done.input.dir, "rtl", "the Urdu word arrives within 45 letters");
    assert.equal(done.reads, "rtl", "and a reader sees its first letter on the right");
    assert.deepEqual(run.errors, []);
  } finally { await run.close(); }
});

test("a sent message: its direction is the formula's, not dir=\"auto\"'s", { skip }, async () => {
  const run = await app.boot(WEBVIEW, { fix: true });
  try {
    const lines = ["React ایک لائبریری ہے جو انٹرفیس بناتی ہے"];
    await app.send(run.page, lines);
    const seen = await run.page.evaluate((first) => {
      for (const r of document.querySelectorAll('[dir="auto"]')) {
        if (!(r.textContent || "").startsWith(first) || r.closest("[contenteditable]")) continue;
        return { direction: getComputedStyle(r).direction, tagged: !!r.closest("[data-bidi-sent]") };
      }
      return null;
    }, lines[0].slice(0, 5));
    assert.ok(seen, "the sent message was not found");
    assert.equal(openingLetters(lines[0]), "rtl");
    assert.equal(seen.direction, "rtl", "dir=\"auto\" alone would have read it left to right");
    assert.ok(seen.tagged);
  } finally { await run.close(); }
});

test("turned off by hand, nothing of it is left on the page", { skip }, async () => {
  const run = await app.boot(WEBVIEW, { fix: true });
  try {
    await app.stream(run.page, "test", ANSWER, { chunk: 40, every: 10 });
    const left = await run.page.evaluate(() => {
      window.__bidiFixOff();
      return {
        attrs: document.querySelectorAll("[data-bidi],[data-bidi-box],[data-bidi-sent],[data-bidi-unpin]").length,
        sheets: document.querySelectorAll("#smart-rtl-direction,#smart-rtl-unpin").length
      };
    });
    assert.deepEqual(left, { attrs: 0, sheets: 0 });
  } finally { await run.close(); }
});
