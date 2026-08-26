/**
 * smartrtl / core
 *
 * One question, answered in one place: which direction does this text belong to?
 *
 * There is deliberately no DOM here, and nothing about any particular product. The
 * VS Code extension, the browser extension and the desktop patch all ask the same
 * question, and they must all get the same answer - otherwise they drift apart and
 * the same bug has to be fixed three times.
 *
 * The rule, and the four formulas that were tried and rejected before it, are
 * written up in docs/decisions.md.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmartRTL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Every living right-to-left script, by Unicode script property rather than by
  // hand written ranges - so no language can be left out by accident.
  var SCRIPTS = [
    "Arabic",    // Urdu, Persian, Pashto, Sindhi, Kurdish, Uyghur, Arabic
    "Hebrew",
    "Syriac",
    "Thaana",    // Divehi
    "Nko",
    "Samaritan",
    "Mandaic",
    "Adlam"
  ];

  var ANY, WORD, LETTER, usingScriptProperties;
  try {
    var S = SCRIPTS.map(function (s) { return "\\p{Script=" + s + "}"; }).join("");
    ANY    = new RegExp("[" + S + "]", "u");
    WORD   = new RegExp("[" + S + "]{2,}", "u");
    // a letter, so that a lone comma or vowel mark never decides a direction
    LETTER = new RegExp("(?=\\p{L})[" + S + "]", "u");
    usingScriptProperties = true;
  } catch (e) {
    // Very old engine with no Unicode property escapes. Broader than the script
    // properties - it also catches shared punctuation - but better than nothing.
    var F = "֐-ࣿיִ-﷿ﹰ-﻿";
    ANY = new RegExp("[" + F + "]");
    WORD = new RegExp("[" + F + "]{2,}");
    LETTER = ANY;
    usingScriptProperties = false;
  }

  /** Any right-to-left character at all, punctuation included. */
  function containsRtl(text) { return ANY.test(String(text || "")); }

  /** Two or more right-to-left characters in a row - a word, not a stray mark. */
  function containsRtlWord(text) { return WORD.test(String(text || "")); }

  /** A single right-to-left letter. Commas and vowel marks do not count. */
  function containsRtlLetter(text) { return LETTER.test(String(text || "")); }

  /**
   * The rule.
   *
   *   starts with RTL                 -> RTL   (already correct, nothing to do)
   *   starts with LTR, no RTL after   -> LTR   (left alone)
   *   starts with LTR, RTL follows    -> RTL
   *
   * Expressed over the whole string, those three collapse into one question:
   * is there right-to-left text in here at all?
   *
   * @param {string} text
   * @param {"careful"|"eager"} [mode="careful"]
   *   careful - needs a whole RTL word. For rendered output, where the decision
   *             sticks until a reload, so a wrong guess is expensive.
   *   eager   - one RTL letter is enough. For an input box, where a wrong guess
   *             costs a single keystroke to undo.
   * @returns {"rtl"|null} null means: leave this text exactly as it was.
   */
  function directionFor(text, mode) {
    var t = String(text || "");
    if (!containsRtl(t)) return null;                     // never touch pure LTR text
    var enough = mode === "eager" ? containsRtlLetter(t) : containsRtlWord(t);
    return enough ? "rtl" : null;
  }

  return {
    containsRtl: containsRtl,
    containsRtlWord: containsRtlWord,
    containsRtlLetter: containsRtlLetter,
    directionFor: directionFor,
    SCRIPTS: SCRIPTS.slice(),
    usingScriptProperties: usingScriptProperties
  };
});
