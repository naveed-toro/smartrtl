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

  /**
   * The first LETTER in a string, whichever script it belongs to.
   *
   * Letters only, on purpose. The browser's own rule calls a digit weak and punctuation
   * neutral, so "2024 کا سال" is decided by the kaf, not by the 2 - and a rule that
   * disagreed with the browser about which character is the deciding one would answer the
   * wrong question below.
   */
  // Built the same way as the three above, and for the same reason: on an engine without
  // Unicode property escapes this falls back to ranges. That fallback was reached once by
  // accident, through a single missing backslash, and it is broader than the real thing -
  // it holds these scripts' DIGITS as well as their letters, so it answered that "2024 کا
  // سال" begins right-to-left. The fallback is letters only now, and usingScriptProperties
  // says from outside which road was taken.
  var FIRST_LETTER;
  try { FIRST_LETTER = new RegExp("\\p{L}", "u"); }
  catch (e) { FIRST_LETTER = /[A-Za-z\u00C0-\u024F\u05D0-\u05EA\u0620-\u064A\u066E-\u06D3\u0712-\u072F\u0780-\u07A5\u07CA-\u07EA\u0840-\u0858\u08A0-\u08BD\uFB1D-\uFDFB\uFE70-\uFEFC]/; }

  /** Any right-to-left character at all, punctuation included. */
  function containsRtl(text) { return ANY.test(String(text || "")); }

  /** Two or more right-to-left characters in a row - a word, not a stray mark. */
  function containsRtlWord(text) { return WORD.test(String(text || "")); }

  /** A single right-to-left letter. Commas and vowel marks do not count. */
  function containsRtlLetter(text) { return LETTER.test(String(text || "")); }

  /**
   * Which direction the browser would take this text to be, by its own rule.
   *
   * `dir="auto"` and `unicode-bidi: plaintext` both take a run's direction from its
   * FIRST STRONG character, and that is the behaviour this whole project exists to
   * replace. Naming it here, in the same file as the rule that replaces it, is what
   * lets anything ask whether the two still disagree.
   *
   * @returns {"rtl"|"ltr"|null} null when there is no letter to decide from
   */
  function firstStrong(text) {
    var m = FIRST_LETTER.exec(String(text || ""));
    if (!m) return null;
    return ANY.test(m[0]) ? "rtl" : "ltr";
  }

  /**
   * Is this the text that tells the two rules apart?
   *
   * True only for text where the browser's guess says left-to-right and this rule says
   * right-to-left: a line that opens with a Latin word and turns Urdu. That text is the
   * fault, stated as a string - which makes it the only text worth measuring a page with.
   * A page that lays THIS out right-to-left by itself has the fault fixed and does not
   * need us; one that lays it out left-to-right still has it.
   *
   * Pure Urdu is useless for that question, and quietly so: the browser reads it
   * right-to-left whether the fault is there or not, so measuring with it would say
   * "fixed" on every build ever shipped.
   */
  function tellsThemApart(text) {
    var t = String(text || "");
    return firstStrong(t) === "ltr" && containsRtlLetter(t);
  }

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
    firstStrong: firstStrong,
    tellsThemApart: tellsThemApart,
    directionFor: directionFor,
    SCRIPTS: SCRIPTS.slice(),
    usingScriptProperties: usingScriptProperties
  };
});
