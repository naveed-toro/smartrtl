/**
 * Every direction formula the paper compares, in one file.
 *
 * The lab page (paper/demo) and the measurements (paper/corpus/tools) both run THIS file, so
 * a figure in the paper and what a reader sees in the lab can never be two different rules.
 *
 * Four groups, in the order the paper tells them:
 *   adopted   - what standards and platforms adopted, and the situation each was made for
 *   proposed  - what was put forward and not adopted, and the situation each was made for
 *   ai-today  - what developers are building for AI chats now
 *   ours      - this work: the first formula, and the suggestion the data led to
 * Every formula carries `situation`: what kind of text it was made for, quoted from its source
 * where the source says so. `archived` formulas were steps on the way; the measurements keep
 * them, the lab does not list them.
 *
 * A formula decides one text: decide(text, ctx) -> "rtl" | "ltr" | null.
 * null means "leave it alone" - the text then shows in the page's own direction.
 * settled(text, ctx) -> true once the decision can never change, however the text goes on.
 * A formula without it (the counting ones) is settled only when its text is complete.
 * `native` marks a formula the browser applies itself ("auto" = dir="auto",
 * "plaintext" = unicode-bidi: plaintext); the lab then only records what it decides.
 *
 * ctx, supplied by whoever runs the formulas:
 *   bidiClass(codePoint) -> Unicode Bidi_Class short name (Unicode version pinned by the caller)
 *   prose               -> the same text without inline code and link addresses, when known
 *   closure             -> goog.i18n.bidi from Google Closure Library, run from its own source
 *   smartrtl            -> packages/core/src/direction.js, unmodified
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BidiFormulas = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createFormulas(env) {
    var bidiClass = env.bidiClass;

    // UAX #9 P2: the first L, R or AL, skipping isolates.
    function firstStrong(text) {
      var depth = 0;
      for (var ch of text) {
        var c = bidiClass(ch.codePointAt(0));
        if (c === "LRI" || c === "RLI" || c === "FSI") { depth++; continue; }
        if (c === "PDI") { if (depth) depth--; continue; }
        if (c === "B") depth = 0;
        if (!depth && (c === "L" || c === "R" || c === "AL")) return c;
      }
      return null;
    }
    function isRtl(c) { return c === "R" || c === "AL"; }
    function count(text) {
      var ltr = 0, rtl = 0;
      for (var ch of text) {
        var c = bidiClass(ch.codePointAt(0));
        if (c === "L") ltr++; else if (isRtl(c)) rtl++;
      }
      return { ltr: ltr, rtl: rtl };
    }
    // Words that hold a strong character, in order, each "L" or "R" by its first strong character.
    function strongWords(text) {
      var out = [];
      text.split(/\s+/).forEach(function (w) {
        for (var ch of w) {
          var c = bidiClass(ch.codePointAt(0));
          if (c === "L") { out.push("L"); return; }
          if (isRtl(c)) { out.push("R"); return; }
        }
      });
      return out;
    }
    var URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
    function prose(text, ctx) { return (ctx && typeof ctx.prose === "string" ? ctx.prose : text).replace(URL_RE, " "); }
    function byFirstStrong(text) { var f = firstStrong(text); return f === null ? null : isRtl(f) ? "rtl" : "ltr"; }

    // The opening-words family. Words are the rendered text's words holding a strong letter -
    // inline code included, so code closing mid-stream cannot take words away and reverse an
    // answer. Settled at the first right-to-left word, or once more than n words have come
    // with none; it never changes after that.
    function opening(n, name, what) {
      return {
        id: "opening-words-" + n, group: "ours", name: name, year: 2026, candidate: true, archived: true, window: n,
        who: "This work", situation: "A step on the way, counted in words", what: what, src: null,
        decide: function (t) {
          var w = strongWords(t);
          if (!w.length) return byFirstStrong(t) || "ltr";
          return w.slice(0, n).indexOf("R") >= 0 ? "rtl" : "ltr";
        },
        settled: function (t) {
          var w = strongWords(t);
          return w.slice(0, n).indexOf("R") >= 0 || w.length > n;
        }
      };
    }

    // The proposed formula, counted in letters (Unicode \p{L}) - words are not defined the same
    // way in every language. First letter right-to-left: right-to-left. First letter
    // left-to-right: right-to-left if a right-to-left letter arrives within the first x
    // letters, otherwise left-to-right. Settled at that letter, or after x letters.
    function openingLetters(x, name, what, proposed) {
      function scan(t) {
        var letters = 0;
        for (var ch of t) {
          if (!/\p{L}/u.test(ch)) continue;
          letters++;
          if (isRtl(bidiClass(ch.codePointAt(0)))) return { rtlAt: letters, letters: letters };
          if (letters >= x) break;
        }
        return { rtlAt: null, letters: letters };
      }
      return {
        id: "opening-letters-" + x, group: "ours", name: name, year: 2026, candidate: !proposed, proposed: !!proposed, window: x,
        who: "This work: fantasai's formula for Firefox (Mozilla bug 548206, 2010), with the number measured instead of chosen",
        situation: "Machine-written answers arriving as a stream - Claude and ChatGPT, Urdu, Arabic, Persian, Hebrew", what: what, src: null,
        decide: function (t) {
          var s = scan(t);
          if (!s.letters) return byFirstStrong(t) || "ltr";
          return s.rtlAt !== null ? "rtl" : "ltr";
        },
        settled: function (t) { var s = scan(t); return s.rtlAt !== null || s.letters >= x; }
      };
    }

    var formulas = [
      // ------------------------------------------------------------------ adopted
      {
        id: "first-strong", situation: "A paragraph written in one language, whose first word shows it - plain text, and in HTML text whose direction is unknown; used for search boxes (L2/09-411)", group: "adopted", name: "First strong", year: 1999, native: "auto",
        who: "Unicode (UAX #9 P2-P3); HTML dir=\"auto\"; Android FIRSTSTRONG_LTR",
        what: "The first letter with a strong direction decides.",
        src: "https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute",
        decide: function (t) { return byFirstStrong(t) || "ltr"; },
        settled: function (t) { return firstStrong(t) !== null; }
      },
      {
        id: "plaintext", situation: "Text a person types, line by line - HTML applies it per paragraph in textarea and pre; proposed for AI chat panels too (claude-code #75196, openclaw #147732)", group: "adopted", name: "First strong, per paragraph", year: 2011, native: "plaintext", blockOnly: true,
        who: "CSS Writing Modes 3, unicode-bidi: plaintext; HTML textarea and pre",
        what: "First strong again for every paragraph inside the text.",
        src: "https://www.w3.org/TR/css-writing-modes-3/#unicode-bidi",
        decide: function (t) { return byFirstStrong(t) || "ltr"; },
        settled: function (t) { return firstStrong(t) !== null; }
      },
      {
        id: "word-count-40", situation: "Longer texts like e-mails (L2/09-411: \"word-count for longer texts like e-mails\")", group: "adopted", name: "Word count 40%", year: 2011,
        who: "Google Closure Library, goog.i18n.bidi.estimateDirection (used in Google products; not a standard)",
        what: "Right-to-left when more than 40% of strongly directional words are right-to-left.",
        src: "https://github.com/google/closure-library/blob/0d779e6baca4cf9d650aa28c3146305db3c101ce/closure/goog/i18n/bidi.js",
        decide: function (t, ctx) { var b = ctx.closure; return b.estimateDirection(t, false) === b.Dir.RTL ? "rtl" : "ltr"; }
      },

      // ------------------------------------------------------------------ proposed, not adopted
      {
        id: "first-strong-rtl", situation: "Text entry fields and UI elements on pages whose own language is right-to-left", group: "proposed", name: "First strong, else RTL", year: 2010,
        who: "dir=\"auto-rtl\" proposal to the W3C i18n group; Android FIRSTSTRONG_RTL",
        what: "First strong; text with no strong letter is right-to-left.",
        src: "https://www.macchiato.com/unicode-intl-sw/utc/bidi-dir",
        decide: function (t) { return byFirstStrong(t) || "rtl"; },
        settled: function (t) { return firstStrong(t) !== null; }
      },
      {
        id: "any-rtl", situation: "Advertisements (L2/09-411: \"any-RTL for advertisements\")", group: "proposed", name: "Any RTL", year: 2009,
        who: "Lanin, Allawi, Allouche, Unicode L2/09-411; W3C autodirmethod=\"any-rtl\" (not adopted); Android ANYRTL_LTR",
        what: "One right-to-left letter anywhere makes it right-to-left.",
        src: "https://www.unicode.org/L2/L2009/09411-bidi.html",
        decide: function (t) { return count(t).rtl > 0 ? "rtl" : "ltr"; },
        settled: function (t) { return count(t).rtl > 0; }
      },
      {
        id: "any-rtl-63", situation: "Web content from an unknown source (Mozilla bug 548206: \"like comments in a weblog\")", group: "proposed", name: "Firefox's formula, 63 letters", year: 2010, proposed: true,
        who: "fantasai, for Firefox's dir=auto (Mozilla bug 548206) - proposed in 2010, not adopted; the paper's proposal",
        what: "The paper's proposal. First letter right-to-left: right-to-left. First letter left-to-right: right-to-left only if a right-to-left letter arrives within the first 63 letters, otherwise left-to-right. Of the four formulas that never go back, it leaves the fewest lines in the wrong direction on the lines they disagree on, read one by one (results/README.md). Put forward for Firefox in 2010 and not adopted; measured here, its 63 holds.",
        src: "https://bugzilla.mozilla.org/show_bug.cgi?id=548206",
        decide: function (t) {
          var seen = 0;
          for (var ch of t) {
            if (!/\p{L}/u.test(ch)) continue;
            if (isRtl(bidiClass(ch.codePointAt(0)))) return "rtl";
            if (++seen >= 63) break;
          }
          return "ltr";
        },
        settled: function (t) {
          var seen = 0;
          for (var ch of t) {
            if (!/\p{L}/u.test(ch)) continue;
            if (isRtl(bidiClass(ch.codePointAt(0)))) return true;
            if (++seen >= 63) return true;
          }
          return false;
        }
      },
      {
        id: "char-majority", situation: "Any higher-level protocol that wants a heuristic (UAX #9 HL1's example)", group: "proposed", name: "Character majority", year: 1999,
        who: "UAX #9 HL1's example of a higher-level protocol; hermes-agent #51318 (2026)",
        what: "Right-to-left when it has more right-to-left letters than left-to-right.",
        src: "https://www.unicode.org/reports/tr9/tr9-52.html#HL1",
        decide: function (t) { var c = count(t); return c.rtl > c.ltr ? "rtl" : "ltr"; }
      },
      {
        id: "telegram-2017", situation: "Chat messages that start with a link (Telegram Desktop #3845)", group: "proposed", name: "Majority without links", year: 2017,
        who: "Telegram Desktop issue #3845",
        what: "Remove links, count letters; the larger side wins; a tie falls back to first strong.",
        src: "https://github.com/telegramdesktop/tdesktop/issues/3845",
        decide: function (t) {
          var p = t.replace(URL_RE, " "), c = count(p);
          if (c.rtl > c.ltr) return "rtl";
          if (c.ltr > c.rtl) return "ltr";
          return byFirstStrong(p) || "ltr";
        }
      },
      {
        id: "prose-majority", situation: "AI chat answers with code and links (BidiLens; hermes-agent #51318)", group: "ai-today", name: "Majority of prose", year: 2026,
        who: "The idea in BidiLens and hermes-agent #51318: leave code and links out of the count. This is the lab's own implementation of that idea, not their code.",
        what: "Count letters outside inline code and links; the larger side wins.",
        src: "https://github.com/CodeinScrubs/BidiLens",
        decide: function (t, ctx) { var c = count(prose(t, ctx)); return c.rtl > c.ltr ? "rtl" : c.ltr > c.rtl ? "ltr" : (byFirstStrong(t) || "ltr"); }
      },

      // ------------------------------------------------------------------ ours
      {
        id: "smartrtl", situation: "Claude Code's panel: machine-written answers arriving as a stream, Urdu with technical English", group: "ours", name: "Our first formula", year: 2026,
        who: "This work, before the study (packages/core/src/direction.js, frozen) - Any RTL, needing a right-to-left word",
        what: "Reasoned out before any data: two right-to-left letters in a row make a block right-to-left, otherwise it is left alone. It decides on sight and only ever turns one way. An English sentence carrying an Urdu phrase was given up on purpose.",
        src: null,
        decide: function (t, ctx) { return ctx.smartrtl.directionFor(t) === "rtl" ? "rtl" : null; },
        settled: function (t, ctx) { return ctx.smartrtl.directionFor(t) === "rtl"; }
      },
      openingLetters(45, "Firefox's formula, 45 letters", "An earlier suggestion of this work: Firefox's formula with 45 letters, chosen on a proxy while a hold was still expected, when every letter of waiting was a cost. With no hold, and read line by line, 45 leaves more right-to-left lines left-to-right than 63 does (results/README.md).", false),
      opening(6, "Opening words (6)", "An earlier candidate in words: right-to-left if a right-to-left word arrives within the first six words. Replaced by the letter count, because words differ in length and are not defined the same way in every language."),
      opening(3, "Opening words (3)", "An earlier candidate: the same with three words.")
    ];

    return {
      formulas: formulas,
      helpers: { firstStrong: firstStrong, count: count, strongWords: strongWords }
    };
  }

  return { createFormulas: createFormulas };
});
