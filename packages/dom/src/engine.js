/**
 * smartrtl / dom
 *
 * The engine, from 0.7.0: nothing but the formula, applied as a direction tag.
 *
 * Three places, each decided by the one rule in @smartrtl/core - openingLetters, 63 letters:
 *
 *   an answer       every block (paragraph, heading, list item, table cell) by its own text
 *   the box         the box you type into, by the draft in it
 *   a sent message  by its own text
 *
 * The rule's answer is written as one attribute; one stylesheet turns the attribute into a
 * direction. That stylesheet also switches off, on exactly those elements, the page's own
 * first-strong guess (unicode-bidi: plaintext, dir="auto", text-align: left) - otherwise two
 * formulas would act on the same text and nobody could tell which one a reader saw.
 *
 * Nothing else acts on text. No decision per message, no special rule for lists, no rule that
 * keeps numbers or code in order, no check of whether the page has fixed itself: each was
 * taken out on purpose so that what a reader sees is the formula and only the formula.
 * docs/decisions.md section 51.
 *
 * Decided on sight: a mutation observer's callback runs before the browser paints, so the
 * text and its direction reach the screen together. Nothing is held back.
 *
 * Also exported, for an adapter's own circuit (Claude Code's pinned message): layeredSheet
 * and besideAnEditor.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmartRTLDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,td,th";
  var ANSWER = "data-bidi";
  var BOX = "data-bidi-box";
  var SENT = "data-bidi-sent";

  function direction(attr, dir) {
    return "[" + attr + '="' + dir + '"]{direction:' + dir + "!important;unicode-bidi:isolate!important;text-align:start!important}";
  }

  // One layer, declared first in the page: its !important declarations outrank the page's,
  // layered or not.
  var CSS = "@layer smartrtl-direction{" +
    direction(ANSWER, "rtl") + direction(ANSWER, "ltr") +
    direction(BOX, "rtl") + direction(BOX, "ltr") +
    direction(SENT, "rtl") + direction(SENT, "ltr") +
    // a sent message's text is handed to dir="auto" - the browser's own first-strong guess -
    // inside the element that is tagged; it takes the tag's direction instead
    "[" + SENT + '] [dir="auto"]{direction:inherit!important;unicode-bidi:isolate!important;text-align:inherit!important}' +
    "}";

  /**
   * Is this element beside a box somebody types into - the layer drawn over it, which holds a
   * copy of the draft? Looks at siblings, a few levels up.
   */
  function besideAnEditor(el, within) {
    var reach = within || 4;
    for (var n = el, hops = 0; n && n.parentElement && hops < reach; n = n.parentElement, hops++) {
      for (var s = n.parentElement.firstElementChild; s; s = s.nextElementSibling) {
        if (s === n) continue;
        var ce = s.getAttribute("contenteditable");
        if ((ce !== null && ce !== "false") || s.tagName === "TEXTAREA") return true;
        if (s.querySelector(':scope > [contenteditable]:not([contenteditable="false"]), :scope > textarea')) return true;
      }
    }
    return false;
  }

  /**
   * A stylesheet first in the page, so its cascade layer is the first one declared; a
   * constructed sheet if the page refuses a style element.
   * @returns {{keep: function, remove: function, road: function, into: function, roots: function}}
   */
  function layeredSheet(id, css, fault) {
    try { return buildSheet(id, css, fault); }
    catch (e) {
      try { fault(e); } catch (x) {}
      return deadSheet("off - the stylesheet could not be built");
    }
  }

  function deadSheet(why) {
    return {
      road: function () { return why; },
      keep: function () {},
      into: function () {},
      remove: function () {},
      roots: function () { return []; }
    };
  }

  function buildSheet(id, css, fault) {
    var el = null, adopted = null, road = "off - not installed yet", shadows = [];
    function head() { return document.head || document.documentElement; }
    try {
      el = document.createElement("style");
      el.id = id;
      el.textContent = css;
      head().insertBefore(el, head().firstChild);
      var took = false;
      try { took = !!(el.sheet && el.sheet.cssRules && el.sheet.cssRules.length); } catch (e) {}
      if (took) road = "style element, first in the page";
      else { if (el.parentNode) el.parentNode.removeChild(el); el = null; }
    } catch (e) { fault(e); el = null; }
    if (!el) {
      try {
        adopted = new CSSStyleSheet();
        adopted.replaceSync(css);
        document.adoptedStyleSheets = [adopted].concat(Array.prototype.slice.call(document.adoptedStyleSheets));
        road = "adopted - the page refused a style element";
      } catch (e) {
        adopted = null;
        road = "off - the page refused every way of adding a stylesheet";
      }
    }
    return {
      road: function () { return road; },
      keep: function () {
        if (el) {
          if (!el.isConnected) head().insertBefore(el, head().firstChild);
        } else if (adopted && Array.prototype.indexOf.call(document.adoptedStyleSheets, adopted) < 0) {
          document.adoptedStyleSheets = [adopted].concat(Array.prototype.slice.call(document.adoptedStyleSheets));
        }
      },
      into: function (root) {
        for (var i = 0; i < shadows.length; i++) if (shadows[i].root === root) return;
        var s = new CSSStyleSheet();
        s.replaceSync(css);
        root.adoptedStyleSheets = [s].concat(Array.prototype.slice.call(root.adoptedStyleSheets || []));
        shadows.push({ root: root, sheet: s });
      },
      remove: function () {
        for (var i = 0; i < shadows.length; i++) {
          var entry = shadows[i];
          try {
            entry.root.adoptedStyleSheets = Array.prototype.filter.call(entry.root.adoptedStyleSheets,
              function (x) { return x !== entry.sheet; });
          } catch (e) {}
        }
        shadows = [];
        try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
        try {
          if (adopted) {
            document.adoptedStyleSheets = Array.prototype.filter.call(document.adoptedStyleSheets,
              function (x) { return x !== adopted; });
          }
        } catch (e) {}
        el = null; adopted = null;
      },
      roots: function () { return shadows.map(function (s) { return s.root; }); }
    };
  }

  /** A block's own text: a list item's nested lists and code are their own business. */
  function ownText(el) {
    var s = "";
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1 && !/^(UL|OL|PRE)$/.test(n.tagName)) s += ownText(n);
    }
    return s;
  }

  /** Write the rule's answer as the attribute, or take the attribute away when there is none. */
  function tag(el, attr, dir) {
    if (dir === "rtl" || dir === "ltr") {
      if (el.getAttribute(attr) !== dir) el.setAttribute(attr, dir);
    } else if (el.hasAttribute(attr)) {
      el.removeAttribute(attr);
    }
  }

  function matches(el, sel) { try { return !!sel && el.matches(sel); } catch (e) { return false; } }
  function closest(el, sel) { try { return sel ? el.closest(sel) : null; } catch (e) { return null; } }
  function first(sels, within) {
    for (var i = 0; i < sels.length; i++) {
      try { var f = (within || document).querySelector(sels[i]); if (f) return f; } catch (e) {}
    }
    return null;
  }

  /**
   * @param {object} rule  @smartrtl/core - openingLetters
   * @param {object} config
   *   answers  {within: string, blocks?: string, skip?: string}   where the page's markdown is
   *   composer {input: string[], mirror: string[]}                the box, and the layer over it
   *   sent     {runs: string, not?: string}                       a sent message's text runs
   * @returns {{stop: function, status: function} | null}
   */
  function start(rule, config) {
    if (typeof window === "undefined" || !window.MutationObserver) return null;
    if (window.__smartRtlEngine) return null;
    window.__smartRtlEngine = 1;

    var cfg = config || {};
    var answers = cfg.answers || null;
    var composer = cfg.composer || null;
    var sent = cfg.sent || null;
    var BLOCKS = answers ? (answers.blocks || DEFAULT_BLOCKS) : null;
    var faults = 0, lastFault = "";
    function fault(e) { faults++; try { lastFault = String((e && e.message) || e).slice(0, 200); } catch (x) {} }

    var sheet = layeredSheet("smart-rtl-direction", CSS, fault);

    // 0.7.1 to 0.7.3 kept a record of streaming in the panel's storage. It answered its question
    // (section 52) and was taken out in 0.8.0; what it left behind goes with it.
    try { window.localStorage.removeItem("smartrtl.turns.v1"); } catch (e) {}

    var decide = function (text) { return rule.openingLetters(text); };

    /* ---------------- an answer: every block by its own text ---------------- */
    function answerBlock(el) {
      if (!answers || el.nodeType !== 1 || !matches(el, BLOCKS)) return;
      if (!closest(el, answers.within)) return;
      if (el.isContentEditable || closest(el, "pre") || closest(el, answers.skip)) return;
      if (besideAnEditor(el, 2)) return;
      tag(el, ANSWER, decide(ownText(el)));
    }
    function answersIn(node) {
      if (!answers || !node || node.nodeType !== 1) return;
      answerBlock(node);
      var list;
      try { list = node.querySelectorAll(BLOCKS); } catch (e) { return; }
      for (var i = 0; i < list.length; i++) answerBlock(list[i]);
    }
    function answerAround(node) {
      if (!answers) return;
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      for (var x = el, hops = 0; x && hops < 8; x = x.parentElement, hops++) {
        if (matches(x, BLOCKS)) { answerBlock(x); return; }
      }
    }

    /* ---------------- the box you type into: both layers by the draft ---------------- */
    var box = { input: null, mirror: null, watch: null };
    function findBox() {
      if (!composer) return;
      var input = first(composer.input);
      if (input && input === box.input && input.isConnected) return;
      if (box.watch) { try { box.watch.disconnect(); } catch (e) {} }
      box = { input: null, mirror: null, watch: null };
      if (!input) return;
      var mirror = null, parent = input.parentElement;
      for (var s = parent ? parent.firstElementChild : null; s && !mirror; s = s.nextElementSibling) {
        if (s === input) continue;
        for (var k = 0; k < composer.mirror.length; k++) if (matches(s, composer.mirror[k])) { mirror = s; break; }
      }
      box.input = input;
      box.mirror = mirror;
      box.watch = new MutationObserver(decideBox);
      box.watch.observe(input, { childList: true, subtree: true, characterData: true });
      decideBox();
    }
    function decideBox() {
      try {
        if (!box.input) return;
        var draft = box.input.textContent || "", dir = decide(draft);
        tag(box.input, BOX, dir);
        if (box.mirror) tag(box.mirror, BOX, dir);
      } catch (e) { fault(e); }
    }

    /* ---------------- a sent message: by its own text ---------------- */
    function sentRun(run) {
      if (!sent || run.nodeType !== 1 || !matches(run, sent.runs)) return;
      if (closest(run, sent.not) || closest(run, "[contenteditable]") || besideAnEditor(run)) return;
      // the tag goes on the block that lays out the run's lines
      var holder = run;
      try {
        for (var hops = 0; holder.parentElement && hops < 3 && getComputedStyle(holder).display.indexOf("inline") === 0; hops++) {
          holder = holder.parentElement;
        }
      } catch (e) {}
      tag(holder, SENT, decide(run.textContent || ""));
    }
    function sentIn(node) {
      if (!sent || !node || node.nodeType !== 1) return;
      sentRun(node);
      var list;
      try { list = node.querySelectorAll(sent.runs); } catch (e) { return; }
      for (var i = 0; i < list.length; i++) sentRun(list[i]);
    }
    function sentAround(node) {
      if (!sent) return;
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      var run = el ? closest(el, sent.runs) : null;
      if (run) sentRun(run);
    }

    /* ---------------- one observer for the page ---------------- */
    function pass(records) {
      try {
        sheet.keep();
        var added = false;
        for (var r = 0; r < records.length; r++) {
          var rec = records[r];
          answerAround(rec.target);
          sentAround(rec.target);
          if (rec.type !== "childList") continue;
          for (var i = 0; i < rec.addedNodes.length; i++) {
            var n = rec.addedNodes[i];
            if (n.nodeType !== 1) continue;
            added = true;
            answersIn(n);
            sentIn(n);
          }
        }
        if (composer && (added || !box.input || !box.input.isConnected)) findBox();
      } catch (e) { fault(e); }
    }

    var watch = new MutationObserver(pass);
    watch.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    try {
      answersIn(document.body || document.documentElement);
      sentIn(document.body || document.documentElement);
      findBox();
    } catch (e) { fault(e); }

    function stop() {
      try { watch.disconnect(); } catch (e) {}
      try { if (box.watch) box.watch.disconnect(); } catch (e) {}
      try {
        var marked = document.querySelectorAll("[" + ANSWER + "],[" + BOX + "],[" + SENT + "]");
        for (var i = 0; i < marked.length; i++) {
          marked[i].removeAttribute(ANSWER);
          marked[i].removeAttribute(BOX);
          marked[i].removeAttribute(SENT);
        }
      } catch (e) {}
      sheet.remove();
      try { delete window.__smartRtlEngine; } catch (e) { window.__smartRtlEngine = 0; }
    }

    function status() {
      var count = function (attr) { try { return document.querySelectorAll("[" + attr + "]").length; } catch (e) { return -1; } };
      return {
        rule: "openingLetters, " + rule.OPENING_LETTERS + " letters",
        answerBlocks: count(ANSWER),
        box: box.input ? (box.input.getAttribute(BOX) || "untagged") + (box.mirror ? ", both layers" : ", one layer") : "not found",
        sentMessages: count(SENT),
        sheet: sheet.road(),
        contained: faults,
        lastFault: lastFault
      };
    }

    return { stop: stop, status: status };
  }

  return {
    start: start,
    layeredSheet: layeredSheet,
    besideAnEditor: besideAnEditor,
    DEFAULT_BLOCKS: DEFAULT_BLOCKS,
    ATTRIBUTES: { answer: ANSWER, box: BOX, sent: SENT }
  };
});
