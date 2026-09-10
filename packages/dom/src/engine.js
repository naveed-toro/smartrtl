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
 *      this code runs on every batch of mutations while an answer streams. The pass
 *      itself happens before the browser paints, so a decision and the text it was
 *      taken from reach the screen together.
 *   5. Every scope fallback shrinks, never grows. Too small a container costs one
 *      extra decision; too large would drag a whole conversation into one
 *      direction.
 *   6. Nothing of ours is ever put inside somebody else's DOM. Attributes and one
 *      stylesheet, and that is all. The one place that used to build elements - a
 *      sent message split into a line per element - is gone; see decisions.md
 *      section 34.
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

  // An element that lays text out inline. A dir="auto" run that is one of these has no
  // line of its own, so its direction has to be set on the block it sits in.
  var INLINE = { SPAN: 1, B: 1, I: 1, EM: 1, STRONG: 1, A: 1, BDI: 1, LABEL: 1, SMALL: 1, MARK: 1 };

  /**
   * @param {object} rule  @smartrtl/core - containsRtl / containsRtlWord / containsRtlLetter
   * @param {object} [config]
   *   blocks       {string}   CSS selector for the blocks that carry text
   *   boxSelector  {string}   hint for "one message" - tried first when scoping a decision
   *   boundary     {string}   the ceiling a decision may never climb past, so one message's
   *                           answer cannot reach the message beside it
   *   ownDirAuto   {boolean}  every run of text the page hands to dir="auto" - the browser's
   *                           first-strong-character guess - is decided by the rule instead,
   *                           as one piece. Needs no class name at all.
   *   quietMs      {number}   silence after which a half-written block is treated as final
   *   maxBox       {number}   largest container, in blocks, a single decision may claim
   *   extraCss     {string}   rules the adapter wants in the same stylesheet
   *   composer     {object}   the box the user types into, or null. Each part is a LIST of
   *                           selectors, tried in order, so that a renamed class leaves the
   *                           next one standing:
   *                             container {string}   the element both layers share, by name
   *                             input     {string[]} the layer holding the text and the caret
   *                             mirror    {string[]} a layer drawn over it, if there is one
   *                           Both layers must be direct children of the same element.
   *   onDecision   {function} (block, box) - called once, when a message is decided
   *   onCleanup    {function} () - called by the escape hatch, to undo the adapter's own work
   *
   * Every selector above is checked once, here, and one that the browser refuses switches
   * off only the part that needed it. Nothing in this file may fail in a way that reaches
   * the page it is a guest on.
   *
   * @returns {{stop, standDownBlocks, refresh, status}|null}  null if something is
   *   already running. standDownBlocks() takes back the block decisions and nothing else,
   *   for a page found to decide its own blocks correctly. status() reports what is
   *   watching, what is off, which way the stylesheet got in, and how many faults were
   *   caught and contained - because a fix that has quietly stopped working looks exactly
   *   like one that is working.
   */
  function start(rule, config) {
    var cfg = config || {};
    try {
      if (window.__bidiDirectionFix) return null;
      window.__bidiDirectionFix = 1;

      // blocks: false - no block decisions at all, while everything else here still
      // runs. An adapter passes it when the page already decides its own blocks
      // correctly, so that the other parts do not depend on that one being needed.
      var BLOCKS = cfg.blocks === false ? null : (cfg.blocks || DEFAULT_BLOCKS);
      var QUIET_MS = cfg.quietMs || DEFAULT_QUIET_MS;
      var MAX_BOX = cfg.maxBox || DEFAULT_MAX_BOX;
      var BOX_HINT = cfg.boxSelector || null;
      var OWN_DIR_AUTO = !!cfg.ownDirAuto;
      var composer = cfg.composer || null;

      // A selector that the browser will not accept throws on every single batch, for
      // ever, and silently. Asked once here instead: what cannot be used is not used,
      // and the parts that do not depend on it carry on.
      function usableSelector(sel) {
        if (!sel) return false;
        try { document.querySelector(sel); return true; } catch (e) { return false; }
      }
      function listOf(x) { return Array.isArray(x) ? x.slice() : x ? [x] : []; }

      var blocksOk = usableSelector(BLOCKS);
      if (BOX_HINT && !usableSelector(BOX_HINT)) BOX_HINT = null;

      // The composer's selectors, each one kept only if the browser accepts it in the
      // shape it will be used in - as a direct child of the element we mark.
      var COMPOSER_BOX = null, INPUTS = [], MIRRORS = [];
      if (composer) {
        var childOk = function (s) { return usableSelector('[data-bidi-input] > ' + s); };
        COMPOSER_BOX = usableSelector(composer.container) ? composer.container : null;
        INPUTS = listOf(composer.input).filter(childOk);
        MIRRORS = listOf(composer.mirror).filter(childOk);
        if (!INPUTS.length) composer = null;
      }

      /* ---------------------------------------------------------------
         One stylesheet, written once.

         :is() is load-bearing here, not decoration. An adapter may name a block
         with a complex selector - "the content div inside an expandable
         container" - and inside :is() that selector is matched against the block
         itself, independently of where the decided box sits. Concatenating the
         two instead would demand that the container be found BELOW the box, and
         it is usually above it: the rule then matches nothing, silently.
      --------------------------------------------------------------- */
      var css = !blocksOk ? "" :
        '[data-bidi="rtl"] :is(' + BLOCKS + '){direction:rtl!important;unicode-bidi:isolate!important}' +
        // the safety rule: a block with no RTL in it keeps what it had
        '[data-bidi="rtl"] :is(' + BLOCKS + ')[data-bidi="ltr"]{direction:ltr!important;unicode-bidi:isolate!important}' +

        // text-align is not optional. A host that writes `text-align: left` on a
        // container - and they do - beats direction entirely: the words come out in the
        // right order and every line still hugs the left edge. `start` is the honest
        // value, because it follows whatever direction was just decided rather than
        // naming a side.
        //
        // th is left out, and finding out why is what this exclusion is for. A table
        // header is centred, and that centring is the BROWSER's - the host writes no
        // text-align on th at all. Overriding it turned every centred header in an Urdu
        // message left-aligned, which is not a direction: centre is centre either way.
        // Setting direction is the job; restyling somebody's table is not.
        '[data-bidi="rtl"] :is(' + BLOCKS + '):not(th){text-align:start!important}' +
        // A page may hand a run of text to the browser's own guess with dir="auto" -
        // the same first-strong-character rule this whole project exists to replace.
        // Inside a block we have already decided, that guess must not get a second
        // vote, so such a run is told to inherit the decision instead.
        '[data-bidi="rtl"] :is(' + BLOCKS + ') [dir="auto"]{direction:inherit!important;unicode-bidi:isolate!important}';

      /* A run of text handed to dir="auto", decided by the rule instead.
         ------------------------------------------------------------------
         dir="auto" IS the first-strong-character guess, applied explicitly by the page
         to text it did not want to decide itself - typically text a person typed. So a
         run like that is decided here, as one piece, the way the rule decides anything:
         any RTL word in it and it reads right to left; none, and it is left exactly as
         the page had it.

         This path names no class at all. It rests on an HTML attribute, which a page
         uses because the browser gives it meaning - not on a stylesheet's hashed
         names, which change whenever somebody restyles. Where an adapter also names
         the same text by class, the two arrive at the same answer independently, and
         either one is enough.

         Every property this depends on is set here, with !important, rather than
         trusting the page not to set it. That is exactly how the composer broke in
         Claude Code 2.1.267: the page added unicode-bidi:plaintext, and a rule that
         had only ever set `direction` stopped doing anything. */
      if (OWN_DIR_AUTO) {
        css += '[data-bidi-run="rtl"]{direction:rtl!important;unicode-bidi:isolate!important;text-align:start!important}' +
               '[data-bidi-run="rtl"] > [dir="auto"]{direction:inherit!important;unicode-bidi:isolate!important}';
      }

      /* The box you type into.
         ------------------------------------------------------------------
         ONE direction for the whole box, from one attribute and one rule. Nothing
         of ours goes into it. That is not a first attempt: it is what is left after
         three goes at doing better, and the two things that ended them are worth
         carrying here.

         What is actually there, read out of Claude Code's own bundle:

           messageInput   contentEditable="plaintext-only", color:#0000 - you type
                          into it and see none of it. Caret only.
           mentionMirror  absolutely positioned over it. React's, children and all.
                          Every glyph anybody reads comes from here.

         A line is a \n inside one text node, so per-line direction needs an element
         per line, and the only place to put one is inside that mirror.

           0.3.0 put them there. React's own nodes were thrown away making them, the
           mirror stopped updating - the box typed BLANK SPACES - and its next
           removeChild threw inside React's commit phase and took the panel down.

           0.3.3 kept React's mirror untouched and drew a clone of it instead. Safe,
           and still wrong: measured, every keystroke reached the screen one
           keystroke late.

         A box that types a letter behind is worse than a box that reads the wrong
         way round, so the composer takes ONE direction, live, from any RTL letter in
         it. A draft that mixes languages goes right to left as a whole. That is the
         platform's limit, accepted rather than fought.

         Three things make the one direction hold up when the page changes:

           - all three properties are set, with !important. 2.1.267 added
             unicode-bidi:plaintext to both layers, and `direction` on a plaintext
             element does nothing at all - the old rule, which set only direction,
             went dead on that update without a single error.
           - each layer is found by name AND by what it is: the box you type into
             is contenteditable with role=textbox, the layer over it is aria-hidden.
             A restyle renames classes; it does not usually change what an element
             is for. Either is enough.
           - the rule selects only direct children of the element we mark, so it can
             never reach anything else the page keeps nearby.

         text-align is not decoration: measured, a host that writes text-align:left
         above the box beats direction outright - the words come out in the right
         order and every line still hugs the left edge. */
      if (composer) {
        var layerSel = [];
        INPUTS.concat(MIRRORS).forEach(function (s) { layerSel.push('[data-bidi-input="rtl"] > ' + s); });
        css += layerSel.join(",") + "{direction:rtl!important;unicode-bidi:isolate!important;text-align:start!important}";
      }

      if (cfg.extraCss) css += cfg.extraCss;

      /* Everything above rides on one stylesheet getting in, so how it gets in is not
         left to one road. A <style> element added from script is what a page with
         'unsafe-inline' in its style-src allows - Claude Code's does, today. Without
         that word the element is refused and every part of this would go dark at once.
         Measured: under such a policy a constructed stylesheet handed to
         document.adoptedStyleSheets still applies. So the element is tried first, and
         if its rules did not arrive, the other road is taken - and the status says
         which. */
      var style = document.createElement("style");
      style.id = "smart-rtl-direction";
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
      var adopted = null, sheetState = "style element";
      var took = false;
      try { took = !!(style.sheet && style.sheet.cssRules && style.sheet.cssRules.length); } catch (e) {}
      if (!took) {
        try {
          adopted = new CSSStyleSheet();
          adopted.replaceSync(css);
          document.adoptedStyleSheets = document.adoptedStyleSheets.concat([adopted]);
          sheetState = "adopted - the page refused a style element";
        } catch (e) {
          adopted = null;
          sheetState = "off - the page refused every way of adding a stylesheet";
        }
      }

      /* ---------------------------------------------------------------
         Deciding
      --------------------------------------------------------------- */
      var failures = 0;                    // contained faults, reported by status()
      var stopped = false;                 // stop() has been called; finish nothing more
      var settledBlocks = new WeakSet();   // blocks whose own decision is final
      var pending = new Set();             // blocks skipped because they were still being written
      var quiet = false, quietTimer = null;

      /**
       * Has this block finished being written?
       *
       * Text is appended, so ANYTHING that follows a block inside the same message
       * was written after it, and its arrival is proof the block is done. Checking
       * only the block's own next sibling missed the common shape of that: the last
       * cell of a table row has no sibling, and neither does the last item of a list,
       * so a cell reading "250-400ms" stayed turned round until the quiet timer
       * eventually caught it - half a second of a reader looking at "400ms-250".
       *
       * The walk stops at the message, and that boundary is not decoration: outside
       * it sits the rest of the panel, including the spinner, and treating those as
       * "something followed it" would call every block finished the moment it
       * appeared - which is precisely the guess this whole function exists to avoid.
       */
      function isFinal(el) {
        if (quiet) return true;
        var stop = null;
        if (BOX_HINT) { try { stop = el.closest(BOX_HINT); } catch (e) {} }
        if (!stop) return !!el.nextElementSibling;
        for (var n = el; n && n !== stop; n = n.parentElement) {
          if (n.nextElementSibling) return true;
        }
        return false;
      }

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
        if (!el || !el.isConnected) return;
        if (settledBlocks.has(el)) return;

        if (el.closest('[data-bidi="rtl"]')) {          // message already decided
          // A block carrying no RTL text at all is left EXACTLY as the page had it.
          // Forcing rtl on such a block gains nothing and can reorder content that
          // was already fine: "250-400ms" written with an en dash becomes "400ms-250".
          if (!rule.containsRtl(el.textContent || "")) {
            if (!isFinal(el)) { pending.add(el); return; }
            // Marked, and deliberately NOT settled.
            //
            // The quiet timer now expires DURING a message - a tool runs, and for a
            // second or two nothing is written - so this mark can land on a paragraph
            // that is only half here. More text may still arrive, and a mark that
            // could not be taken back would leave that text reading left to right for
            // good. Being late is a disappointment; being permanently wrong is not.
            el.setAttribute("data-bidi", "ltr");
            pending.delete(el);
            return;
          }
          // RTL arrived after all, so it reads with the message it is part of. This
          // way round is final: text is appended, never unwritten, so a block that
          // holds an RTL word will hold it for the rest of its life.
          el.removeAttribute("data-bidi");
          settledBlocks.add(el); pending.delete(el);
          return;
        }

        var text = el.textContent || "";
        if (!rule.containsRtlWord(text)) return;         // nothing to decide from yet
        // Not waited on, and that exemption is the whole of the real-time behaviour.
        //
        // Everywhere else this engine refuses to decide from a half-written block.
        // This decision is exempt because nothing arriving later can revise it: text
        // is appended and never unwritten, so a block holding an RTL word will hold
        // one for the rest of its life, and the rule's answer for such a block is RTL
        // whatever else joins it. Waiting protected a decision that was never at risk.
        //
        // What the waiting cost was measured, on a page with Claude Code's own
        // spinner running: 42 frames - two thirds of a second - of somebody reading a
        // short reply backwards, because a reply of one paragraph never grows the
        // second block that would have settled the first. Deciding on sight costs 3
        // frames, with the same single change of direction and no sideways movement.
        // test/jitter.test.js holds both halves of that.
        var box = boxOf(el);
        if (box) {
          box.setAttribute("data-bidi", "rtl");          // <-- the one decision
          if (cfg.onDecision) { try { cfg.onDecision(el, box); } catch (e) {} }
        }
        settledBlocks.add(el); pending.delete(el);
      }

      /**
       * A dir="auto" run, decided by the rule rather than by the browser.
       *
       * Where the decision is written depends on what the run IS. An inline run - the
       * usual shape, a <span> holding what somebody typed - has no line of its own, so
       * the block around it carries the direction; and only when that block holds this
       * one run and no other, so a decision can never spread past the text it was taken
       * from. A run that is itself a block carries its own.
       *
       * Unlike an answer's decision this one can be taken back: the page can rewrite a
       * run (an edited message), and a run that no longer holds any RTL goes back to
       * exactly what the page had. For text that only ever grows, that never happens.
       */
      var runState = OWN_DIR_AUTO ? "on - nothing decided yet" : "off";
      var runMeasured = false;

      function decideRun(run) {
        if (!run || !run.isConnected || !run.parentElement) return;
        if (run.closest("pre,code,[contenteditable]")) return;   // never code, never an editor
        var target = run;
        if (INLINE[run.tagName]) {
          target = run.parentElement;
          if (target === document.body || target === document.documentElement) return;
          var runs = 0;
          for (var c = target.firstElementChild; c; c = c.nextElementSibling) {
            if (c.getAttribute("dir") === "auto") runs++;
          }
          if (runs !== 1) return;                       // not ours to speak for
        }
        if (rule.containsRtlWord(run.textContent || "")) {
          if (target.getAttribute("data-bidi-run") === "rtl") return;
          target.setAttribute("data-bidi-run", "rtl");
          if (cfg.onDecision) { try { cfg.onDecision(run, target); } catch (e) {} }
          measureRunOnce(target);
        } else if (target.hasAttribute("data-bidi-run")) {
          target.removeAttribute("data-bidi-run");
        }
      }

      /** Once, and after the frame - so a decision that the page refuses is reported. */
      function measureRunOnce(target) {
        if (runMeasured) return;
        runMeasured = true;
        setTimeout(function () {
          if (stopped) return;
          try {
            if (!target.isConnected || target.getAttribute("data-bidi-run") !== "rtl") { runMeasured = false; return; }
            var cs = getComputedStyle(target);
            runState = cs.direction === "rtl"
              ? "on - measured working"
              : "not working - the direction was set and the page did not take it (" + cs.direction + ")";
          } catch (e) { failures++; }
        }, 0);
      }

      /* ---------------------------------------------------------------
         Watching. One pass per batch of mutations, never one per mutation - and
         that pass runs BEFORE the browser paints.

         The queue used to be drained from requestAnimationFrame, which is one
         frame too late: a mutation that lands after a frame's rAF has already run
         is not looked at until the next one, so the frame in between is painted
         without the decision on it. Usually nobody could tell. Where it showed was
         a host re-mounting a message - our attribute goes with the old elements,
         and the message was painted the other way round while we waited for a frame
         that had already gone. Measured over twelve runs: six of them flickered.

         A MutationObserver callback is a microtask, so draining from one runs at
         the end of the same task the mutation happened in, before rendering. Same
         batching, same cost - measured at 60fps with and without the fix, with a
         mutation every millisecond - and nothing is ever painted mid-correction.
         Twelve runs of the same re-mount: none flickered.
      --------------------------------------------------------------- */
      var queue = [], scheduled = false;
      var watching = blocksOk || OWN_DIR_AUTO;

      function drain() {
        scheduled = false;
        // A pass is queued as a microtask, so one can already be in flight when stop()
        // is called - and it would then write a decision into a page that has just
        // been handed back, with nothing left to take it out again. Found by the test
        // that stands the fix down the moment a message arrives.
        if (stopped) { queue = []; return; }
        var batch = queue; queue = [];

        var blocks = [], runs = [];
        for (var i = 0; i < batch.length; i++) {
          var n = batch[i];
          if (!n || n.nodeType !== 1 || !n.isConnected) continue;
          if (blocksOk) {
            var self = n.closest(BLOCKS);
            if (self) blocks.push(self);
            var list = n.querySelectorAll(BLOCKS);
            for (var j = 0; j < list.length; j++) blocks.push(list[j]);
          }
          if (OWN_DIR_AUTO) {
            var run = n.closest('[dir="auto"]');
            if (run) runs.push(run);
            var inner = n.querySelectorAll('[dir="auto"]');
            for (var q = 0; q < inner.length; q++) runs.push(inner[q]);
          }
        }

        // Quiet means the TEXT has stopped, not the page. See armQuiet.
        if (blocks.length) armQuiet();
        // One block at a time, each on its own. A block that throws - a shape nobody
        // anticipated, a host element that has just been detached - used to take the
        // whole batch with it, and then the next batch, and then quietly the whole
        // feature. Blocks are independent of each other and the code should say so.
        for (var k = 0; k < blocks.length; k++) {
          try { inspect(blocks[k]); } catch (e) { failures++; }
        }
        for (var m = 0; m < runs.length; m++) {
          try { decideRun(runs[m]); } catch (e) { failures++; }
        }
      }

      /**
       * Restart the clock on "the writing has stopped".
       *
       * Called only for a mutation that touched a block, and that restriction is
       * the whole point of it. It used to be called for every mutation anywhere in
       * the document, which sounds harmless and is not, because of this - from
       * Claude Code's own bundle:
       *
       *     d30 = ["·","✢","✳","✶","✻","✽", ...]
       *     setInterval(() => X(q => (q + 1) % d30.length), 120)
       *
       * A spinner character, rewritten every 120ms for as long as the model is
       * working. Shorter than QUIET_MS, so the timer was reset before it could ever
       * expire: while the model worked, the page was never "quiet", and a block
       * with nothing after it yet - the last one, the one being read - could not be
       * decided. It came right the moment the spinner stopped, which is why this
       * only ever showed up as "wrong while it streams, right when you scroll back
       * up afterwards".
       *
       * A spinner is not writing. Neither is a clock, a progress bar, or anything
       * else a product may animate next to an answer. Only text in a block counts.
       */
      function armQuiet() {
        quiet = false;
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(function () {
          if (stopped) return;
          quiet = true;
          var left = Array.from(pending);
          pending.clear();
          for (var i = 0; i < left.length; i++) {
            try { inspect(left[i]); } catch (e) { failures++; }
          }
        }, QUIET_MS);
      }

      function push(node) {
        if (node && node.nodeType === 3) node = node.parentElement;
        if (!node || node.nodeType !== 1) return;
        queue.push(node);
        // The clock on "the writing has stopped" is NOT restarted here: at this point
        // all we know is that something on the page moved, and most of what moves is
        // not writing. drain restarts it, once it knows a block was involved.
        if (!scheduled) { scheduled = true; queueMicrotask(drain); }
      }

      /* ---------------------------------------------------------------
         Which direction the box is in, right now.

         LIVE rather than sticky: delete the RTL text and it goes back to left,
         because an input must show what is actually in it. And eager rather than
         careful - ONE letter is enough, because a wrong guess here costs a single
         keystroke to undo, while a wrong guess in an answer stays until reload.

         One attribute on an element the host rendered, and nothing else. React does
         not enumerate attributes it never set, so this cannot collide with it. That
         is the line the removed per-line machinery crossed twice: an attribute is
         ours to set; somebody else's child node is not ours to move, or to mirror.

         Asked on typing AND on any change to the box, because typing is not the only
         way text gets there. Measured in Claude Code's own bundle: it empties the box
         itself after a message is sent, and puts text in from code for history,
         completions and forks - none of which is an input event. Listening only to
         typing left the box turned right to left and empty after every Urdu message,
         and left recalled Urdu reading left to right until the next key.
      --------------------------------------------------------------- */
      var composerState = composer ? "on - waiting for the box to appear" : "off";
      var shapes = new WeakMap();      // box -> true, or why it is not one we can turn
      var measuredBoxes = new WeakSet();

      function closestOf(el, list) {
        for (var i = 0; i < list.length; i++) { var m = el.closest(list[i]); if (m) return m; }
        return null;
      }
      function childOf(parent, list) {
        for (var i = 0; i < list.length; i++) {
          for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
            if (c.matches(list[i])) return c;
          }
        }
        return null;
      }

      /** The box, and the layer that holds the text - by name first, then by what they are. */
      function findComposer(node) {
        var el = node && node.nodeType === 3 ? node.parentElement : node;
        if (!el || el.nodeType !== 1 || !el.closest) return null;
        var box = COMPOSER_BOX ? el.closest(COMPOSER_BOX) : null;
        var input = box ? childOf(box, INPUTS) : null;
        if (!input) {
          var hit = closestOf(el, INPUTS);
          if (hit && hit.parentElement) { box = hit.parentElement; input = hit; }
          else if (MIRRORS.length) {
            // the change was in the layer drawn over the box: its sibling is the box
            var layer = closestOf(el, MIRRORS);
            var parent = layer && layer.parentElement;
            var sib = parent ? childOf(parent, INPUTS) : null;
            if (sib) { box = parent; input = sib; }
          }
        }
        return input && box && input.parentElement === box ? { box: box, input: input } : null;
      }

      /**
       * Can this box be turned without the caret and the text parting company?
       *
       * Asked once per box. With a layer drawn over the box you type into, one mark
       * turns both. With no such layer the box itself must be what people read - if it
       * is invisible, turning it alone would move the caret and leave the text where it
       * was, which is worse than doing nothing, so nothing is done.
       */
      function shapeOf(box, input) {
        var known = shapes.get(box);
        if (known !== undefined) return known;
        var verdict = true;
        var over = MIRRORS.length ? childOf(box, MIRRORS) : null;
        if (!over || over === input) {
          var c = getComputedStyle(input).color;
          if (c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c)) {
            verdict = "off - the box you type into is invisible, and the layer drawn over it was not found";
          }
        }
        shapes.set(box, verdict);
        return verdict;
      }

      /** Once per box, and after the frame: did the page actually take the direction? */
      function measureComposerOnce(box, input) {
        if (measuredBoxes.has(box)) return;
        measuredBoxes.add(box);
        setTimeout(function () {
          if (stopped) return;
          try {
            if (!box.isConnected || box.getAttribute("data-bidi-input") !== "rtl") { measuredBoxes.delete(box); return; }
            var read = (MIRRORS.length && childOf(box, MIRRORS)) || input;
            var cs = getComputedStyle(read);
            composerState = cs.direction === "rtl" && cs.unicodeBidi !== "plaintext"
              ? "on - measured working"
              : "not working - the direction was set and the page did not take it (" +
                cs.direction + ", " + cs.unicodeBidi + ")";
          } catch (e) { failures++; }
        }, 0);
      }

      /** A textarea's text is its value; any other box's is its content. */
      function textOf(input) {
        return input.tagName === "TEXTAREA" ? (input.value || "") : (input.textContent || "");
      }

      /* The box is asked about on every change to the page - but cheaply. Once a box has
         been found, only a change INSIDE it is looked at, and that costs one native
         contains(). The full search, by name and by what the elements are, runs only
         while no box is known or after the one we knew has left the page. While an
         answer streams, every change is in the answer, so each one costs a single
         contains() and nothing more - the reader must never be the one who pays for
         this being thorough. */
      var lastBox = null;
      function composerChange(target) {
        if (lastBox && lastBox.isConnected) {
          var el = target && target.nodeType === 3 ? target.parentNode : target;
          return el && lastBox.contains(el) ? syncComposer(el) : false;
        }
        lastBox = null;
        return syncComposer(target);
      }

      /** @returns {boolean} whether the node was inside a composer at all */
      function syncComposer(node) {
        if (!composer || stopped) return false;
        try {
          var found = findComposer(node);
          if (!found) return false;
          lastBox = found.box;
          var shape = shapeOf(found.box, found.input);
          if (shape !== true) { composerState = shape; return true; }
          if (composerState.indexOf("on - waiting") === 0) composerState = "on - not measured yet";
          if (rule.containsRtlLetter(textOf(found.input))) {
            if (found.box.getAttribute("data-bidi-input") !== "rtl") found.box.setAttribute("data-bidi-input", "rtl");
            measureComposerOnce(found.box, found.input);
          } else if (found.box.hasAttribute("data-bidi-input")) {
            found.box.removeAttribute("data-bidi-input");
          }
          return true;
        } catch (e) { failures++; return true; }
      }

      if (composer) {
        // Both are delegated from the document, so a composer that has not been
        // rendered yet - and it has not, when this runs - is not a problem the way it
        // is for anything that has to attach to the element itself.
        document.addEventListener("input", function (e) { syncComposer(e.target); }, true);
        document.addEventListener("focusin", function (e) { syncComposer(e.target); }, true);
      }

      var observer = new MutationObserver(function (records) {
        var composerSeen = false;
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (watching) {
            push(r.target);
            if (r.addedNodes) for (var j = 0; j < r.addedNodes.length; j++) push(r.addedNodes[j]);
          }
          // The box is asked once per batch, after every change in it has landed, so it
          // answers for the text as it now is. Same microtask, so before the paint.
          if (composer && !composerSeen) composerSeen = composerChange(r.target);
        }
      });
      if (watching || composer) {
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      }

      /* ---------------------------------------------------------------
         Escape hatch. Run __bidiFixOff() in the console to neutralise it live.

         stop() promises the page comes back to what it was, and it can keep that
         promise cheaply because nothing here ever altered the host's DOM: taking
         out one stylesheet and our own attributes is the whole of it.
      --------------------------------------------------------------- */
      function dropAttribute(name) {
        var n = document.querySelectorAll("[" + name + "]");
        for (var i = 0; i < n.length; i++) n[i].removeAttribute(name);
      }

      function stop() {
        stopped = true;
        try { observer.disconnect(); } catch (e) {}
        if (quietTimer) clearTimeout(quietTimer);
        if (style.parentNode) style.parentNode.removeChild(style);
        if (adopted) {
          try {
            document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (s) { return s !== adopted; });
          } catch (e) {}
        }
        dropAttribute("data-bidi");
        dropAttribute("data-bidi-input");
        dropAttribute("data-bidi-run");
        if (cfg.onCleanup) { try { cfg.onCleanup(); } catch (e) {} }
        return "off";
      }
      window.__bidiFixOff = stop;

      var blocksState = !BLOCKS ? "off - not asked for"
                      : blocksOk ? "watching" : "off: the block selector was refused";

      /**
       * Stand the block decisions down, and nothing else.
       *
       * For a page that turns out to decide its own blocks correctly - measured by the
       * adapter, which is the only one that knows what to measure. Every decision of
       * that kind comes back out and no more are taken, while the box you type into and
       * the dir="auto" runs carry on untouched: they answer different questions, and
       * the host fixing one of them says nothing about the others.
       */
      function standDownBlocks(why) {
        if (!blocksOk) return;
        blocksOk = false;
        pending.clear();
        if (quietTimer) clearTimeout(quietTimer);
        dropAttribute("data-bidi");
        blocksState = "stood down - " + (why || "the page decides its own blocks now");
      }

      if (watching) push(document.body || document.documentElement);

      function status() {
        return {
          blocks: blocksState,
          boxHint: BOX_HINT ? "on" : "off",
          dirAuto: runState,
          composer: composerState,
          sheet: sheetState,
          contained: failures            // faults that were caught and did not spread
        };
      }

      return { stop: stop, standDownBlocks: standDownBlocks, refresh: push, status: status };
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
