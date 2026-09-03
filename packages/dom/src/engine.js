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

      // Lines we made ourselves, in a block that holds a whole message at once.
      // NOTE: display:block is set on the element as well, inline, and that is not
      // duplication - see decidePerLine.
      css += ".smart-rtl-line{display:block;white-space:pre-wrap}" +
             '.smart-rtl-line[data-bidi-line="rtl"]{direction:rtl;text-align:start;unicode-bidi:isolate}' +
             ".smart-rtl-line:not([data-bidi-line]){direction:ltr;text-align:start;unicode-bidi:isolate}";

      // Lines inside the box being typed into. Inline isolates, not blocks: a block
      // would need the newline characters taken out of the DOM to avoid breaking
      // twice, and those characters are the text that gets sent.
      if (composer && composer.perLine) {
        css += ".smart-rtl-input-line{unicode-bidi:isolate}" +
               '.smart-rtl-input-line[data-bidi-line="rtl"]{direction:rtl}' +
               ".smart-rtl-input-line:not([data-bidi-line]){direction:ltr}";
      }

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

      /**
       * One block, many lines.
       *
       * The rule was built for markdown, where every line is already its own
       * element and one decision per block IS one decision per line. A message
       * typed by a person is not markdown: it arrives as a single element with
       * newlines inside it, so twenty lines share one direction. That is wrong for
       * exactly the person this exists for - somebody writing Urdu and English
       * turn about, a line of each.
       *
       * So a block named by `perLine` is split into one element per line and each
       * line is decided on its own. This is the only place anything here changes a
       * page's structure rather than its style, and two things make that safe to
       * do:
       *
       *   - element children are MOVED, never copied, so a mention chip keeps the
       *     handlers that make it clickable
       *   - the newline characters are dropped and the lines become blocks, so
       *     selecting and copying gives back the original text exactly rather than
       *     doubling every line break. A test asserts that, because "nearly the
       *     same text" in somebody's clipboard is not a small bug.
       *
       * Only ever done to text that has already arrived. Nothing streamed is split
       * per line - see docs/decisions.md section 7 for why that would flicker.
       *
       * @returns {boolean} true if this block was handled here
       */
      function decidePerLine(block) {
        if (block.getAttribute("data-bidi-lines") === "1") return true;

        // Only ever a message somebody TYPED, and the test for that is exact rather
        // than structural. Splitting is the one place anything here changes a page's
        // structure instead of its style, so what it may change has to be named
        // precisely - "the content div inside an expandable" describes a container the
        // host is free to reuse for something else, and the day it does, this would
        // quietly rewrite that component's DOM into spans.
        //
        // dir="auto" is the plainText renderer's own signature, and it appears exactly
        // once in the whole bundle: on the span a typed message's text goes into. No
        // span, no split - whatever else ends up in an expandable is left alone.
        var host = block.querySelector('[dir="auto"]');
        if (!host) return false;
        if ((host.textContent || "").indexOf("\n") === -1) return false;   // one line

        var lines = [[]], kids = Array.prototype.slice.call(host.childNodes);
        for (var i = 0; i < kids.length; i++) {
          var n = kids[i];
          if (n.nodeType === 3) {
            var parts = String(n.nodeValue).split("\n");
            for (var j = 0; j < parts.length; j++) {
              if (j > 0) lines.push([]);
              if (parts[j] !== "") lines[lines.length - 1].push(document.createTextNode(parts[j]));
            }
          } else {
            lines[lines.length - 1].push(n);
          }
        }

        var frag = document.createDocumentFragment();
        for (var k = 0; k < lines.length; k++) {
          var row = document.createElement("span");
          row.className = "smart-rtl-line";
          // The newline characters are gone once the text is split, so from here on
          // the line breaks are made by these elements being blocks - which means the
          // breaks must not depend on our stylesheet still being present. Somebody
          // running the escape hatch, or anything that drops the sheet, would
          // otherwise collapse a typed message into one unreadable run and take its
          // line breaks out of the clipboard with it. Measured, before it was set
          // here: three lines became one and the message lost 40px of height.
          row.style.display = "block";
          for (var m = 0; m < lines[k].length; m++) row.appendChild(lines[k][m]);
          if (rule.containsRtlWord(row.textContent || "")) row.setAttribute("data-bidi-line", "rtl");
          // An empty block is skipped when a selection is serialised, so a blank line
          // would vanish from anything the reader copied. A <br> keeps it - measured
          // against a zero-width space, which survives the copy as an invisible
          // character in somebody else's paste.
          if (!lines[k].length) row.appendChild(document.createElement("br"));
          frag.appendChild(row);
        }

        while (host.firstChild) host.removeChild(host.firstChild);
        host.appendChild(frag);
        block.setAttribute("data-bidi-lines", "1");
        return true;
      }

      function inspect(el) {
        if (!el || settledBlocks.has(el) || !el.isConnected) return;

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

        // a block that holds a whole message decides line by line instead
        if (cfg.perLine && el.matches(cfg.perLine) && decidePerLine(el)) {
          // Decided line by line, but it is still an RTL message, and the adapter is
          // told so. It has to be: this is what moves the row's timeline dot to the
          // side the row reads from, and what reserves the gutter every row in the
          // conversation then shares. Reserving that gutter narrows every row by its
          // width, so WHEN it happens matters - here, as somebody's own message
          // appears, rather than in the middle of the first answer they are reading.
          if (cfg.onDecision) { try { cfg.onDecision(el, el); } catch (e) {} }
          settledBlocks.add(el); pending.delete(el);
          return;
        }

        var box = boxOf(el);
        if (box) {
          box.setAttribute("data-bidi", "rtl");          // <-- the one decision
          if (cfg.onDecision) { try { cfg.onDecision(el, box); } catch (e) {} }
        }
        settledBlocks.add(el); pending.delete(el);
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

      function drain() {
        scheduled = false;
        var batch = queue; queue = [];

        var blocks = [];
        for (var i = 0; i < batch.length; i++) {
          var n = batch[i];
          if (!n || n.nodeType !== 1 || !n.isConnected) continue;
          var self = n.closest(BLOCKS);
          if (self) blocks.push(self);
          var list = n.querySelectorAll(BLOCKS);
          for (var j = 0; j < list.length; j++) blocks.push(list[j]);
        }

        // Quiet means the TEXT has stopped, not the page. See armQuiet.
        if (blocks.length) armQuiet();
        for (var k = 0; k < blocks.length; k++) inspect(blocks[k]);
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
        // The clock on "the writing has stopped" is NOT restarted here: at this point
        // all we know is that something on the page moved, and most of what moves is
        // not writing. drain restarts it, once it knows a block was involved.
        if (!scheduled) { scheduled = true; queueMicrotask(drain); }
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
      /* ---------------------------------------------------------------
         One decision per LINE of what is being typed.

         The box above decides once for everything in it, which is right for a box
         holding one thought and wrong for a box holding several: paste a command,
         press shift+enter, write Urdu underneath, and the command is dragged along
         with the Urdu. In a browser chat box this costs nothing, because those
         editors already keep one element per line and a line's direction is an
         attribute on an element that exists. Here a line is a `\n` inside one text
         node - which is exactly why the text that gets sent comes out right - so the
         elements have to be made.

         Making them has to leave four things untouched, and each one was measured
         rather than assumed:

           the text        the newline characters stay in the DOM between the lines,
                           so textContent - which is what gets sent - is identical
           the caret       taken as a character offset before, put back after
           anything else   element children are MOVED, never recreated, so a mention
                           chip keeps whatever the host attached to it
           undo            rewriting the box's insides destroys the browser's undo
                           stack, so this keeps its own: for a plain text box the whole
                           state is (text, caret), which is why that is possible at all

         Off by default. `composer.perLine` turns it on.
      --------------------------------------------------------------- */
      var LINE_CLASS = "smart-rtl-input-line";
      var composing = false, wrapping = false, layerWatch = null;

      /**
       * Swallow the mutations we just made.
       *
       * A MutationObserver callback is a microtask, so a flag set around our own
       * writing is already false again by the time the callback runs: we would see
       * our own work, do it again, and queue another callback. That is not a slow
       * loop, it is a hang - the page stops responding entirely, which is how this
       * was found. takeRecords() empties the queue of everything up to now, so what
       * we did is never handed back to us.
       */
      function forgetOurOwn() {
        if (layerWatch) { try { layerWatch.takeRecords(); } catch (e) {} }
      }
      var undoStack = [{ text: "", caret: 0, at: 0, base: 0 }], undoAt = 0, restoring = false;
      var UNDO_COALESCE_MS = 600, UNDO_STEP_MAX = 12;

      function caretIn(el) {
        try {
          var sel = getSelection();
          if (!sel || !sel.rangeCount) return null;
          var live = sel.getRangeAt(0);
          if (!el.contains(live.endContainer)) return null;
          var r = document.createRange();
          r.selectNodeContents(el);
          r.setEnd(live.endContainer, live.endOffset);
          return r.toString().length;
        } catch (e) { return null; }
      }

      function caretTo(el, offset) {
        try {
          var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), seen = 0, n, last = null;
          while ((n = w.nextNode())) {
            last = n;
            if (seen + n.nodeValue.length >= offset) {
              var r = document.createRange();
              r.setStart(n, Math.max(0, offset - seen));
              r.collapse(true);
              var s = getSelection(); s.removeAllRanges(); s.addRange(r);
              return;
            }
            seen += n.nodeValue.length;
          }
          if (last) {
            var r2 = document.createRange();
            r2.setStart(last, last.nodeValue.length); r2.collapse(true);
            var s2 = getSelection(); s2.removeAllRanges(); s2.addRange(r2);
          }
        } catch (e) {}
      }

      /**
       * One isolate per line, built from the nodes already there.
       *
       * Everything of ours is undone first and the lines worked out from scratch.
       * Taking a previous line element's children out WITHOUT re-splitting them was
       * the first version's bug: the browser puts a new line break inside one of our
       * spans, that span then holds three lines while the other layer correctly has
       * three elements, the two disagree - and the caret and the glyph part company.
       */
      function wrapLines(el, keepCaret) {
        var at = keepCaret ? caretIn(el) : null;

        var flat = [];
        (function collect(node) {
          var kids = Array.prototype.slice.call(node.childNodes);
          for (var i = 0; i < kids.length; i++) {
            var n = kids[i];
            if (n.nodeType === 1 && n.className === LINE_CLASS) collect(n);
            else flat.push(n);
          }
        })(el);

        var lines = [[]];
        for (var i = 0; i < flat.length; i++) {
          var n = flat[i];
          if (n.nodeType === 1 && n.tagName === "BR") { lines.push([]); continue; }
          if (n.nodeType === 3) {
            var parts = String(n.nodeValue).split("\n");
            for (var j = 0; j < parts.length; j++) {
              if (j > 0) lines.push([]);
              if (parts[j] !== "") lines[lines.length - 1].push(document.createTextNode(parts[j]));
            }
          } else {
            lines[lines.length - 1].push(n);
          }
        }

        var frag = document.createDocumentFragment();
        for (var m = 0; m < lines.length; m++) {
          if (m) frag.appendChild(document.createTextNode("\n"));
          var row = document.createElement("span");
          row.className = LINE_CLASS;
          for (var q = 0; q < lines[m].length; q++) row.appendChild(lines[m][q]);
          if (rule.containsRtlLetter(row.textContent || "")) row.setAttribute("data-bidi-line", "rtl");
          frag.appendChild(row);
        }

        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(frag);
        if (at !== null) caretTo(el, at);
      }

      /** What the box looks like now - its text and the direction of each line. */
      function lineShape(el) {
        var rows = el.querySelectorAll("." + LINE_CLASS), out = [];
        for (var i = 0; i < rows.length; i++) out.push(rows[i].getAttribute("data-bidi-line") || "l");
        return out.join("") + "|" + el.textContent;
      }

      function rememberForUndo(el) {
        if (restoring) return;
        var text = el.textContent, caret = caretIn(el) || 0, now = Date.now();
        var top = undoStack[undoAt];
        if (top && top.text === text) { top.caret = caret; return; }
        undoStack.length = undoAt + 1;                 // anything undone is dropped
        // A run of typing is one step, broken where a person expects a break: at a
        // space, at a line, and never letting one step swallow more than a phrase.
        var grew = top && text.length > top.text.length && text.slice(0, top.text.length) === top.text;
        var typed = grew ? text.slice(top.text.length) : "";
        var stepLen = top ? text.length - top.base : text.length;
        if (grew && (now - top.at) < UNDO_COALESCE_MS && !/\s/.test(typed) && stepLen < UNDO_STEP_MAX) {
          top.text = text; top.caret = caret; top.at = now;
          return;
        }
        undoStack.push({ text: text, caret: caret, at: now, base: top ? top.text.length : 0 });
        undoAt = undoStack.length - 1;
      }

      function undoTo(el, step) {
        restoring = true;
        try {
          el.textContent = step.text;
          wrapLines(el, false);
          caretTo(el, step.caret);
          syncComposer(el);
          mirrorLines(el);
          forgetOurOwn();
        } catch (e) {}
        restoring = false;
      }

      /** Every other layer shows the same text, so it gets the same lines. */
      function mirrorLines(input) {
        if (!composer || !composer.layers) return;
        var box = input.closest(composer.container);
        if (!box) return;
        for (var i = 0; i < composer.layers.length; i++) {
          var layer = box.querySelector(composer.layers[i]);
          if (!layer || layer === input) continue;
          if (lineShape(layer) !== lineShape(input)) wrapLines(layer, false);
        }
      }

      function syncLines(node) {
        if (!composer || !composer.perLine || composing || wrapping) return;
        var probe = composer.probe || (composer.layers && composer.layers[0]);
        var input = node && node.closest ? node.closest(probe) : null;
        if (!input) {
          // the host rewrote a layer that is not the one being typed into
          var box = node && node.closest ? node.closest(composer.container) : null;
          if (!box) return;
          input = box.querySelector(probe);
          if (!input) return;
          wrapping = true;
          try { mirrorLines(input); } catch (e) {}
          forgetOurOwn();
          wrapping = false;
          return;
        }
        wrapping = true;
        try {
          rememberForUndo(input);
          if (lineShape(input) !== lastShape) { wrapLines(input, true); lastShape = lineShape(input); }
          mirrorLines(input);
        } catch (e) {}
        forgetOurOwn();
        wrapping = false;
      }
      var lastShape = null;

      if (composer) {
        document.addEventListener("input", function (e) { syncComposer(e.target); }, true);
        document.addEventListener("focusin", function (e) { syncComposer(e.target); }, true);
      }
      if (composer && composer.perLine) {
        // The host rebuilds the layer it draws the text on from its own state, on
        // every keystroke, and that wipes the lines off it. Putting them back from a
        // MutationObserver means it happens in the same task the host wrote in,
        // before the browser paints - the same arrangement an answer streaming in
        // already relies on, and measured the same way: not one frame of the host's
        // plain text ever reached the screen.
        var boxes = document.querySelectorAll(composer.container);
        layerWatch = new MutationObserver(function (records) {
          if (composing || wrapping) return;
          for (var i = 0; i < records.length; i++) syncLines(records[i].target);
        });
        for (var b = 0; b < boxes.length; b++) {
          layerWatch.observe(boxes[b], { childList: true, characterData: true, subtree: true });
        }

        document.addEventListener("input", function (e) { syncLines(e.target); }, true);
        document.addEventListener("compositionstart", function () { composing = true; }, true);
        document.addEventListener("compositionend", function (e) { composing = false; syncLines(e.target); }, true);
        document.addEventListener("keydown", function (e) {
          if (!(e.ctrlKey || e.metaKey)) return;
          var z = e.key === "z" || e.key === "Z", y = e.key === "y" || e.key === "Y";
          if (!z && !y) return;
          var probe = composer.probe || (composer.layers && composer.layers[0]);
          var input = e.target && e.target.closest ? e.target.closest(probe) : null;
          if (!input) return;
          e.preventDefault();
          if (y || e.shiftKey) { if (undoAt < undoStack.length - 1) undoTo(input, undoStack[++undoAt]); }
          else if (undoAt > 0) { undoTo(input, undoStack[--undoAt]); }
          lastShape = lineShape(input);
        }, true);
      }

      /* ---------------------------------------------------------------
         Escape hatch. Run __bidiFixOff() in the console to neutralise it live.
      --------------------------------------------------------------- */
      function dropAttribute(name) {
        var n = document.querySelectorAll("[" + name + "]");
        for (var i = 0; i < n.length; i++) n[i].removeAttribute(name);
      }

      /**
       * Put a split message back together.
       *
       * stop() promises the page comes back to what it was, and for an answer it
       * always did - nothing there is ever restructured. A typed message is, and
       * until this existed the escape hatch left it in pieces: our spans still in the
       * DOM, the newline characters gone with them, and the text somebody copied
       * missing every line break. The one path a person has when something goes wrong
       * has to be the one path that cannot make things worse.
       */
      function undoPerLine() {
        var split = document.querySelectorAll('[data-bidi-lines="1"]');
        for (var i = 0; i < split.length; i++) {
          var block = split[i];
          block.removeAttribute("data-bidi-lines");
          var host = block.querySelector('[dir="auto"]');
          if (!host) continue;
          var rows = host.querySelectorAll(".smart-rtl-line");
          if (!rows.length) continue;

          var frag = document.createDocumentFragment();
          for (var k = 0; k < rows.length; k++) {
            if (k > 0) frag.appendChild(document.createTextNode("\n"));
            while (rows[k].firstChild) {
              var n = rows[k].firstChild;
              rows[k].removeChild(n);
              // the <br> holding a blank line open is ours, and goes back with us
              if (n.nodeType === 1 && n.tagName === "BR") continue;
              frag.appendChild(n);
            }
          }
          while (host.firstChild) host.removeChild(host.firstChild);
          host.appendChild(frag);
          host.normalize();          // one text node again, exactly as it arrived
        }
      }

      function stop() {
        try { observer.disconnect(); } catch (e) {}
        try { undoPerLine(); } catch (e) {}
        if (quietTimer) clearTimeout(quietTimer);
        if (style.parentNode) style.parentNode.removeChild(style);
        dropAttribute("data-bidi");
        dropAttribute("data-bidi-input");
        dropAttribute("data-bidi-line");
        dropAttribute("data-bidi-lines");
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
