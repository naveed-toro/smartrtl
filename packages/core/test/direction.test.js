/**
 * These cases are not invented. Every one of them is a line that came out of a real
 * answer, and several of them are the exact lines that killed an earlier formula.
 * Keeping them here means a future change to the rule has to face them again.
 *
 * Run with:  node --test test/
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { directionFor, containsRtl, containsRtlWord, containsRtlLetter } = require("../src/direction.js");

const rtl = (t, mode) => assert.equal(directionFor(t, mode), "rtl", `expected rtl: ${t}`);
const untouched = (t, mode) => assert.equal(directionFor(t, mode), null, `expected untouched: ${t}`);

test("the five headings the character-ratio formula got wrong", () => {
  // Each is an Urdu heading whose Latin nouns outweigh it by character count.
  rtl("useMemo اور useCallback");
  rtl("args - اصل arguments");
  rtl("children بطور props");
  rtl("Debounce بمقابلہ Throttle");
  rtl("JavaScript میں Debounce فنکشن");
});

test("a line already starting in RTL is still rtl", () => {
  rtl("یہ سب ایک ہی اردو جواب کی سطریں ہیں۔");
  rtl("فرض کریں ایک سرچ باکس ہے جو ہر حرف پر کال کرتا ہے۔");
});

test("text with no RTL in it is never touched", () => {
  // The safety rule. Forcing rtl here gains nothing and can reorder things that
  // were already fine - "250-400ms" with an en dash came out reversed.
  untouched("The build tool comparison is documented upstream.");
  untouched("npm install --save-dev vite");
  untouched("250–400ms");
  untouched("Auto-save");
  untouched("API rate limiting");
  untouched("window.resize");
  untouched("");
});

test("every right-to-left script is covered, not just Arabic", () => {
  rtl("React מול Vue");            // Hebrew
  rtl("Webpack در برابر Vite");    // Persian
  rtl("Debounce مقابل Throttle");  // Arabic
  rtl("npm، yarn اور pnpm");       // Urdu
});

test("punctuation and vowel marks alone do not decide a direction", () => {
  // An Arabic comma inside an English sentence must not flip it.
  untouched("hello، world", "eager");
  untouched("aَ b", "eager");          // lone fatha
  assert.equal(containsRtlLetter("،"), false);
  assert.equal(containsRtlLetter("َ"), false);
});

test("careful mode waits for a word, eager mode acts on one letter", () => {
  // The composer flips on the first letter; rendered output waits for a word,
  // because there the decision sticks until a reload.
  untouched("ا", "careful");
  rtl("ا", "eager");
  rtl("اب", "careful");
  rtl("ש", "eager");
});

test("the case we deliberately gave up on", () => {
  // An English sentence carrying one RTL phrase reads left to right, but no local
  // signal separates it from a heading like "Debounce بمقابلہ Throttle".
  // A word-count guard was tried and its verdict turned on whether the writer typed
  // "," or "،" - see docs/decisions.md section 5. This is the accepted cost.
  rtl("In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical.");
});

test("the predicates behave independently", () => {
  assert.equal(containsRtl("abc"), false);
  assert.equal(containsRtl("a،b"), false);   // Arabic comma is script=Common
  assert.equal(containsRtlWord("ا"), false);
  assert.equal(containsRtlWord("اب"), true);
  assert.equal(containsRtlLetter("ا"), true);
});

test("no input crashes it", () => {
  for (const v of [undefined, null, 0, false, {}, []]) {
    assert.doesNotThrow(() => directionFor(v));
  }
});

test("from 0.6.0, an answer's block: an RTL letter within its first 45 letters (section 50)", () => {
  const { openingLetters, openingSettled, OPENING_LETTERS } = require("../src/direction.js");
  assert.equal(OPENING_LETTERS, 45);
  // the five headings still read right to left
  for (const h of ["useMemo اور useCallback", "args - اصل arguments", "children بطور props",
    "Debounce بمقابلہ Throttle", "JavaScript میں Debounce فنکشن"]) {
    assert.equal(openingLetters(h), "rtl", h);
  }
  assert.equal(openingLetters("یہ سب ایک ہی اردو جواب کی سطریں ہیں۔"), "rtl");
  assert.equal(openingLetters("2024 کا سال"), "rtl", "digits are not letters");
  // English with no RTL, or with RTL only after 45 letters, reads left to right
  assert.equal(openingLetters("The build tool comparison is documented upstream."), "ltr");
  assert.equal(openingLetters("Check the native RTL claim yourself, two minutes and no risk, and then look for ایک"), "ltr");
  // the case section 5 gave up is still given up: the Urdu phrase is letter 23
  assert.equal(openingLetters("In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical."), "rtl");
  assert.equal(openingLetters("250–400ms"), "ltr");
  assert.equal(openingLetters("— 42 —"), null, "no letter, nothing to decide");
  // one way only, and settled for good
  assert.equal(openingSettled("React is a"), false);
  assert.equal(openingSettled("React ایک"), true);
  assert.equal(openingSettled("a".repeat(45)), true);
  const grow = "React is a JavaScript library for building user interfaces and then اردو";
  let last = null;
  for (let i = 1; i <= grow.length; i++) {
    const d = openingLetters(grow.slice(0, i));
    if (last === "rtl") assert.equal(d, "rtl", "never back from rtl");
    if (last === "ltr" && openingSettled(grow.slice(0, i - 1))) assert.equal(d, "ltr", "never changes once settled");
    if (d) last = d;
  }
});
