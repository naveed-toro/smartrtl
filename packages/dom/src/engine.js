/**
 * smartrtl / dom
 *
 * The engine. It watches a page, decides once per message which direction that
 * message belongs to, and applies the decision with one attribute and one CSS
 * rule.
 *
 * Everything in here is true of any surface that renders markdown into a page -
 * the Claude Code webview, an AI chat site in the browser, a markdown preview.
 * What is deliberately NOT in here: class names, timeline dots, collapse buttons,
 * anything that belongs to one product. Those arrive as configuration, so a new
 * surface costs an adapter of a few dozen lines instead of a second copy of this
 * file - which is the whole reason this package exists.
 *
 * The rule is not here either. It lives in @smartrtl/core and is passed in, so
 * every surface answers the same question the same way.
 *
 * The design, and the measurements behind each part of it, are in
 * docs/decisions.md. In short:
 *
 *   1. ONE decision per message, never revised. Taken from the first FINISHED
 *      block that carries an RTL word. Blocks written after it are born correct
 *      and cost nothing.
 *   2. Applied by an attribute plus one CSS rule, never by touching each block
 *      from JavaScript.
 *   3. Nothing is decided from a half-written block. A block counts only once
 *      another block follows it, or the stream has gone quiet.
 *   4. No getComputedStyle in the hot path - it forces a style recalculation, and
 *      this code runs on every frame while an answer streams.
 *   5. Every scope fallback shrinks, never grows. Too small a container costs one
 *      extra decision; too large would drag a whole conversation into one
 *      direction.
 *
 * Never changes any text, and never touches a block with no RTL character in it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmartRTLDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption";
  var DEFAULT_QUIET_MS = 350;   // no changes for this long = the answer has stopped
  var DEFAULT_MAX_BOX = 200;    // never claim a container bigger than this many blocks

  /**
   * @param {object} rule  @smartrtl/core - containsRtl / containsRtlWord / containsRtlLetter
   * @param {object} [config]
   *   blocks       {string}   CSS selector for the blocks that carry text
   *   boxSelector  {string}   hint for "one message" - tried first when scoping a decision
   *   quietMs      {number}   silence after which a half-written block is treated as final
   *   maxBox       {number}   largest container, in blocks, a single decision may claim
   *   extraCss     {string}   rules the adapter wants in the same stylesheet
   *   composer     {object}   the box the user types into, or null:
   *                             container {string}  the element both layers share
   *                             layers    {string[]} every layer that must flip together
   *                             probe     {string}  the layer that actually holds the text
   *   onDecision   {function} (block, box) - called once, when a message is decided
   *   onCleanup    {function} () - called by the escape hatch, to undo the adapter's own work
   *
   * @returns {{stop: function, refresh: function}|null}  null if something is already running
   */
  function start(rule, config) {
    var cfg = config || {};
    try {
      if (window.__bidiDirectionFix) return null;
      window.__bidiDirectionFix = 1;

      var BLOCKS = cfg.blocks || DEFAULT_BLOCKS;
      var QUIET_MS = cfg.quietMs || DEFAULT_QUIET_MS;
      var MAX_BOX = cfg.maxBox || DEFAULT_MAX_BOX;
      var BOX_HINT = cfg.boxSelector || null;
      var composer = cfg.composer || null;

      /* ---------------------------------------------------------------
         One stylesheet, written once.

         :is() is load-bearing here, not decoration. An adapter may name a block
         with a complex selector - "the content div inside an expandable
         container" - and inside :is() that selector is matched against the block
         itself, independently of where the decided box sits. Concatenating the
         two instead would demand that the container be found BELOW the box, and
         it is usually above it: the rule then matches nothing, silently.
      --------------------------------------------------------------- */
      var css =
        // text-align is not optional here. A host that writes `text-align: left` on a
        // container - and they do - beats direction entirely: the words come out in the
        // right order and every line still hugs the left edge. `start` is the honest
        // value, because it follows whatever direction we just decided rather than
        // naming a side.
        '[data-bidi="rtl"] :is(' + BLOCKS + '){direction:rtl!important;text-align:start!important;unicode-bidi:isolate!important}' +
        // the safety rule: a block with no RTL in it keeps what it had
        '[data-bidi="rtl"] :is(' + BLOCKS + ')[data-bidi="ltr"]{direction:ltr!important;text-align:start!important;unicode-bidi:isolate!important}' +
        // A page may hand a run of text to the browser's own guess with dir="auto" -
        // the same first-strong-character rule this whole project exists to replace.
        // Inside a block we have already decided, that guess must not get a second
        // vote, so such a run is told to inherit the decision instead.
        '[data-bidi="rtl"] :is(' + BLOCKS + ') [dir="auto"]{direction:inherit!important;unicode-bidi:isolate!important}';

      if (composer && composer.layers && composer.layers.length) {
        // The flag goes on the container the layers share, so one rule flips all of
        // them. A caret on one side while the glyph sits on the other becomes
        // structurally impossible rather than merely unlikely.
        var sel = [];
        for (var s = 0; s < composer.layers.length; s++) {
          sel.push(composer.container + '[data-bidi-input="rtl"] ' + composer.layers[s]);
        }
        css += sel.join(",") + "{direction:rtl}";
      }
      if (cfg.extraCss) css += cfg.extraCss;

      var style = document.createElement("style");
      style.id = "smart-rtl-direction";
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);

      /* ---------------------------------------------------------------
         Deciding
      --------------------------------------------------------------- */
      var settledBlocks = new WeakSet();   // blocks whose own decision is final
      var pending = new Set();             // blocks skipped because they were still being written
      var quiet = false, quietTimer = null;

      function isFinal(el) { return quiet || !!el.nextElementSibling; }

      function usable(node) {
        if (!node || node === document.body || node === document.documentElement) return false;
        if (node.querySelectorAll(BLOCKS).length > MAX_BOX) return false;
        if (node.querySelector('[data-bidi="rtl"]')) return false;   // never swallow a decision already made
        return true;
      }

      /**
       * A decision must never escape the thing it was made for.
       *
       * Without a ceiling, a hint selector as loose as [class*="root"] can match an
       * application-level container, and one message's direction is then applied to
       * everything on the page. That was measured, not imagined: a single Urdu message
       * put its decision on the app root.
       */
      function boxOf(el) {
        var ceiling = cfg.boundary ? el.closest(cfg.boundary) : null;
        var inside = function (n) { return n && (!ceiling || ceiling.contains(n)); };

        if (BOX_HINT) {
          var byHint = el.closest(BOX_HINT);
          if (inside(byHint) && usable(byHint)) return byHint;
        }
        var x = el.parentElement, hops = 0;
        while (x && hops < 5 && x !== document.body && x !== document.documentElement) {
          if (inside(x) && x.querySelectorAll(BLOCKS).length >= 2 && usable(x)) return x;
          x = x.parentElement; hops++;
        }
        var p = el.parentElement;
        return inside(p) && usable(p) ? p : null;
      }

      function inspect(el) {
        if (!el || settledBlocks.has(el) || !el.isConnected) return;

        if (el.closest('[data-bidi="rtl"]')) {          // message already decided
          if (!isFinal(el)) { pending.add(el); return; }
          // A block carrying no RTL text at all is left EXACTLY as the page had it.
          // Forcing rtl on such a block gains nothing and can reorder content that
          // was already fine: "250-400ms" written with an en dash becomes "400ms-250".
          if (!rule.containsRtl(el.textContent || "")) el.setAttribute("data-bidi", "ltr");
          settledBlocks.add(el); pending.delete(el);
          return;
        }

        var text = el.textContent || "";
        if (!rule.containsRtlWord(text)) return;         // nothing to decide from yet
        if (!isFinal(el)) { pending.add(el); return; }   // still being written - do not guess

        var box = boxOf(el);
        if (box) {
          box.setAttribute("data-bidi", "rtl");          // <-- the one decision
          if (cfg.onDecision) { try { cfg.onDecision(el, box); } catch (e) {} }
        }
        settledBlocks.add(el); pending.delete(el);
      }

      /* ---------------------------------------------------------------
         Watching. One pass per animation frame, never one per mutation.
      --------------------------------------------------------------- */
      var queue = [], scheduled = false;

      function drain() {
        scheduled = false;
        var batch = queue; queue = [];
        for (var i = 0; i < batch.length; i++) {
          var n = batch[i];
          if (!n || n.nodeType !== 1 || !n.isConnected) continue;
          var self = n.closest(BLOCKS);
          if (self) inspect(self);
          var list = n.querySelectorAll(BLOCKS);
          for (var j = 0; j < list.length; j++) inspect(list[j]);
        }
      }

      function armQuiet() {
        quiet = false;
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(function () {
          quiet = true;
          var left = Array.from(pending);
          pending.clear();
          for (var i = 0; i < left.length; i++) inspect(left[i]);
        }, QUIET_MS);
      }

      function push(node) {
        if (node && node.nodeType === 3) node = node.parentElement;
        if (!node || node.nodeType !== 1) return;
        queue.push(node);
        armQuiet();
        if (!scheduled) { scheduled = true; requestAnimationFrame(drain); }
      }

      var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          push(r.target);
          if (r.addedNodes) for (var j = 0; j < r.addedNodes.length; j++) push(r.addedNodes[j]);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

      /* ---------------------------------------------------------------
         The box you type in.

         Same rule as everywhere else, but LIVE rather than sticky: delete the RTL
         text and it goes back to left, because an input must show what is actually
         in it. And eager rather than careful - ONE letter is enough here, because a
         wrong guess costs a single keystroke to undo, while a wrong guess in an
         answer stays until reload.
      --------------------------------------------------------------- */
      function syncComposer(node) {
        if (!composer) return;
        try {
          var probe = composer.probe || (composer.layers && composer.layers[0]);
          var input = node && node.closest ? node.closest(probe) : null;
          if (!input) return;
          var box = input.closest(composer.container) || input.parentElement;
          if (!box) return;
          if (rule.containsRtlLetter(input.textContent || "")) box.setAttribute("data-bidi-input", "rtl");
          else box.removeAttribute("data-bidi-input");
        } catch (e) {}
      }
      if (composer) {
        document.addEventListener("input", function (e) { syncComposer(e.target); }, true);
        document.addEventListener("focusin", function (e) { syncComposer(e.target); }, true);
      }

      /* ---------------------------------------------------------------
         Escape hatch. Run __bidiFixOff() in the console to neutralise it live.
      --------------------------------------------------------------- */
      function dropAttribute(name) {
        var n = document.querySelectorAll("[" + name + "]");
        for (var i = 0; i < n.length; i++) n[i].removeAttribute(name);
      }

      function stop() {
        try { observer.disconnect(); } catch (e) {}
        if (quietTimer) clearTimeout(quietTimer);
        if (style.parentNode) style.parentNode.removeChild(style);
        dropAttribute("data-bidi");
        dropAttribute("data-bidi-input");
        if (cfg.onCleanup) { try { cfg.onCleanup(); } catch (e) {} }
        return "off";
      }
      window.__bidiFixOff = stop;

      push(document.body || document.documentElement);

      return { stop: stop, refresh: push };
    } catch (e) {
      return null;   // never break the page we are a guest on
    }
  }

  return {
    start: start,
    DEFAULT_BLOCKS: DEFAULT_BLOCKS,
    DEFAULT_QUIET_MS: DEFAULT_QUIET_MS,
    DEFAULT_MAX_BOX: DEFAULT_MAX_BOX
  };
});
