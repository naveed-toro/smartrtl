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
