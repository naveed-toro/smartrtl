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
   *   boundary     {string}   the ceiling a decision may never climb past, so one message's
   *                           answer cannot reach the message beside it
   *   perLine      {string}   blocks that hold a WHOLE message, newlines and all, and must
   *                           be split into an element per line before being decided
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
   * Every selector above is checked once, here, and one that the browser refuses switches
   * off only the part that needed it. Nothing in this file may fail in a way that reaches
   * the page it is a guest on.
   *
   * @returns {{stop, refresh, status}|null}  null if something is already running.
   *   status() reports what is watching, what is off, and how many faults were caught and
   *   contained - because a fix that has quietly stopped working looks exactly like one
   *   that is working.
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

      // The copy of a sent message, and the host's own span it stands in for. Only
      // while the copy is actually there - anything that stops us building it leaves
      // the host's own text on the screen, never a hidden one and no replacement.
      var COPY_CLASS = "smart-rtl-copy";
      css += '[data-bidi-lines="1"] [dir="auto"]:not(.' + COPY_CLASS + '){display:none}';

      // Lines we made ourselves, in a block that holds a whole message at once.
      // NOTE: display:block is set on the element as well, inline, and that is not
      // duplication - see decidePerLine.
      css += ".smart-rtl-line{display:block;white-space:pre-wrap}" +
             '.smart-rtl-line[data-bidi-line="rtl"]{direction:rtl;text-align:start;unicode-bidi:isolate}' +
             ".smart-rtl-line:not([data-bidi-line]){direction:ltr;text-align:start;unicode-bidi:isolate}";


      /* The box you type into.
         ------------------------------------------------------------------
         ONE direction for the whole box, from one attribute and one rule. Nothing
         of ours goes into it, nothing is observed, nothing runs while somebody
         types. That is not a first attempt: it is what is left after three goes at
         doing better, and the two things that ended them are worth carrying here.

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
           keystroke late. Type a letter, see nothing; type the next, see the first.
           The clone is painted from the host's mirror in a capture-phase input
           handler, which runs BEFORE the host has redrawn it, and the observer meant
           to correct that had nothing to attach to - the composer does not exist yet
           when this code runs.

         A box that types a letter behind is worse than a box that reads the wrong
         way round, and no amount of care makes an editor somebody else owns behave
         like an editor. So this is deliberate, and it is the end of that line of
         attempts, not a step on the way: the composer takes ONE direction, live,
         from any RTL letter in it. A draft that mixes languages goes right to left
         as a whole. That is the platform's limit, accepted rather than fought.

         Where the rule still applies in full is the message once it is SENT, where
         the lines are real elements in a page nobody is typing into.

         text-align is not decoration: measured, a host that writes text-align:left
         above the box beats direction outright - the words come out in the right
         order and every line still hugs the left edge. */
      if (composer && composer.layers && composer.layers.length) {
        var sel = [];
        for (var s = 0; s < composer.layers.length; s++) {
          sel.push(composer.container + '[data-bidi-input="rtl"] ' + composer.layers[s]);
        }
        css += sel.join(",") + "{direction:rtl;text-align:start}";
      }

      if (cfg.extraCss) css += cfg.extraCss;

      // A selector that the browser will not accept throws on every single batch, for
      // ever, and silently. Asked once here instead: what cannot be used is not used,
      // and the parts that do not depend on it carry on.
      function usableSelector(sel) {
        if (!sel) return false;
        try { document.querySelector(sel); return true; } catch (e) { return false; }
      }
      var blocksOk = usableSelector(BLOCKS);
      if (BOX_HINT && !usableSelector(BOX_HINT)) BOX_HINT = null;
      if (cfg.perLine && !usableSelector(cfg.perLine)) cfg.perLine = null;
      if (composer && !usableSelector(composer.container)) composer = null;

      var style = document.createElement("style");
      style.id = "smart-rtl-direction";
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);

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
      /**
       * A sent message, decided line by line - WITHOUT moving anything of the host's.
       *
       * A typed message is one element with newlines in it, so one decision would
       * govern every line of it: paste a command, press shift+enter, write Urdu
       * underneath, and the command is dragged round with the Urdu. The lines have to
       * become elements before they can each be decided.
       *
       * Until now they were made out of the host's own nodes, taken out of the span
       * React rendered them into and put back inside spans of ours. That worked, and
       * shipped from 0.2.0, and it was the last place in this project standing on a
       * promise it could not keep: React holds a pointer to every node it created and
       * removes them through the parent it put them in. Ours is not that parent any
       * more. The day React updates a sent message - the day Claude Code grows "edit
       * your message", say - it calls removeChild on a node that is no longer there,
       * throws inside its own commit phase, and the panel unmounts. Demonstrated, not
       * feared: the same NotFoundError that took the panel down in 0.3.0.
       *
       * So: nothing is moved, removed or replaced. A COPY is built beside the host's
       * span and the host's span is hidden by a CSS rule. React's own tree is exactly
       * as React left it, and it can update or unmount it whenever it likes.
       *
       * The copy is a sibling of the span rather than a child of it, so it inherits
       * the font and colour from the same place the original does, and so that adding
       * it is the weakest thing that can be done to somebody else's DOM: an append,
       * never an insert between two of their nodes.
       *
       * @mention chips are elements the host attached handlers to, and a clone has
       * none. Each clone therefore forwards its own activation to the original, which
       * is hidden but still in the page and still React's - so clicking a mention in a
       * message still opens the file.
       */
      /** Has the host rewritten the message since the copy was made? */
      function staleCopy(block) {
        var host = null, copy = null, all = block.querySelectorAll('[dir="auto"]');
        for (var i = 0; i < all.length; i++) {
          if (all[i].classList.contains(COPY_CLASS)) copy = all[i];
          else if (!host) host = all[i];
        }
        if (!host || !copy) return false;
        // the copy carries the same characters, minus the newlines the line elements
        // stand in for - so compare with those taken out of both
        return (host.textContent || "").replace(/\n/g, "") !== (copy.textContent || "");
      }

      function decidePerLine(block, again) {
        if (!again && block.getAttribute("data-bidi-lines") === "1") return true;

        // Only ever a message somebody TYPED, and the test for that is exact rather
        // than structural. This is the one place anything here adds to a page instead
        // of styling it, so what it may add to has to be named precisely - "the content
        // div inside an expandable" describes a container the host is free to reuse for
        // something else.
        //
        // dir="auto" is the plainText renderer's own signature, and it appears exactly
        // once in the whole bundle: on the span a typed message's text goes into. No
        // span, no copy - whatever else ends up in an expandable is left alone.
        var host = block.querySelector('[dir="auto"]');
        if (!host || host.classList.contains(COPY_CLASS)) return false;
        if (again) {
          // ours, and only ever ours - the host's span is never removed
          var old = block.querySelectorAll("." + COPY_CLASS);
          for (var o = 0; o < old.length; o++) {
            if (old[o].parentNode) old[o].parentNode.removeChild(old[o]);
          }
        }
        if ((host.textContent || "").indexOf("\n") === -1) {
          // it was several lines and is now one - nothing of ours belongs here
          block.removeAttribute("data-bidi-lines");
          return false;
        }
        if (!host.parentNode) return false;

        var pairs = [];          // [clone, original] for anything that can be activated
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
            var copy = n.cloneNode(true);
            if (n.nodeType === 1) pairs.push([copy, n]);
            lines[lines.length - 1].push(copy);
          }
        }

        var holder = document.createElement("span");
        holder.className = COPY_CLASS;
        holder.setAttribute("dir", "auto");
        for (var k = 0; k < lines.length; k++) {
          var row = document.createElement("span");
          row.className = "smart-rtl-line";
          // The line breaks are made by these elements being blocks, so they must not
          // depend on our stylesheet still being present - somebody running the escape
          // hatch would otherwise see the message collapse into one unreadable run.
          row.style.display = "block";
          for (var m = 0; m < lines[k].length; m++) row.appendChild(lines[k][m]);
          if (rule.containsRtlWord(row.textContent || "")) row.setAttribute("data-bidi-line", "rtl");
          // An empty block is skipped when a selection is serialised, so a blank line
          // would vanish from anything the reader copied. A <br> keeps it - measured
          // against a zero-width space, which survives the copy as an invisible
          // character in somebody else's paste.
          if (!lines[k].length) row.appendChild(document.createElement("br"));
          holder.appendChild(row);
        }

        // A clone has no handlers. Hand its activation back to the element the host
        // rendered, which is hidden but still in the page and still theirs.
        for (var q = 0; q < pairs.length; q++) forwardTo(pairs[q][0], pairs[q][1]);

        // AFTER the host's span, never between two of its nodes. React inserts before
        // its own next sibling and appends at the end, so a node of ours sitting last
        // is something it never has to reason about.
        host.parentNode.appendChild(holder);
        block.setAttribute("data-bidi-lines", "1");
        return true;
      }

      /** Clicking or pressing enter on the copy does what it would have done on theirs. */
      function forwardTo(copy, original) {
        try {
          copy.addEventListener("click", function (e) {
            e.preventDefault();
            try { original.click(); } catch (err) {}
          });
          copy.addEventListener("keydown", function (e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            try { original.click(); } catch (err) {}
          });
        } catch (e) {}
      }

      function inspect(el) {
        if (!el || !el.isConnected) return;

        // A message that has been split is normally finished with - a sent message does
        // not change. "Normally" is not good enough here: a surface where somebody can
        // EDIT a message they already sent exists today in the browser, and the copy
        // would go on showing what they wrote before.
        //
        // This is the only thing that looks at a settled block again, and it is cheap
        // where it matters: it runs for blocks that turn up in a batch of mutations,
        // and while an answer streams the mutations are all inside that answer, so no
        // sent message is ever in the batch.
        if (el.getAttribute && el.getAttribute("data-bidi-lines") === "1") {
          try { if (staleCopy(el)) decidePerLine(el, true); } catch (e) { failures++; }
          return;
        }
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

        // a block that holds a whole message decides line by line instead
        // Splitting is the one thing here that restructures anything, so it is also
        // the one thing allowed to fail on its own: if it throws, the block still gets
        // the ordinary whole-block decision below rather than no decision at all.
        var split = false;
        if (cfg.perLine) {
          try { split = el.matches(cfg.perLine) && decidePerLine(el); } catch (e) { failures++; }
        }
        if (split) {
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
        // A pass is queued as a microtask, so one can already be in flight when stop()
        // is called - and it would then write a decision into a page that has just
        // been handed back, with nothing left to take it out again. Found by the test
        // that stands the fix down the moment a message arrives.
        if (stopped) { queue = []; return; }
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
        // One block at a time, each on its own. A block that throws - a shape nobody
        // anticipated, a host element that has just been detached - used to take the
        // whole batch with it, and then the next batch, and then quietly the whole
        // feature. Blocks are independent of each other and the code should say so.
        for (var k = 0; k < blocks.length; k++) {
          try { inspect(blocks[k]); } catch (e) { failures++; }
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

      var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          push(r.target);
          if (r.addedNodes) for (var j = 0; j < r.addedNodes.length; j++) push(r.addedNodes[j]);
        }
      });
      if (blocksOk) {
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
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
        // Both are delegated from the document, so a composer that has not been
        // rendered yet - and it has not, when this runs - is not a problem the way it
        // is for anything that has to attach to the element itself.
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
      /**
       * Take the copy away and let the host's own span be seen again.
       *
       * stop() promises the page comes back to what it was, and now that is nearly
       * nothing to do: the host's DOM was never altered, so putting it back is
       * removing one element of ours and one attribute.
       */
      function undoPerLine() {
        var split = document.querySelectorAll('[data-bidi-lines="1"]');
        for (var i = 0; i < split.length; i++) {
          split[i].removeAttribute("data-bidi-lines");
          var copies = split[i].querySelectorAll("." + COPY_CLASS);
          for (var k = 0; k < copies.length; k++) {
            if (copies[k].parentNode) copies[k].parentNode.removeChild(copies[k]);
          }
        }
      }

      function stop() {
        stopped = true;
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

      if (blocksOk) push(document.body || document.documentElement);

      function status() {
        return {
          blocks: blocksOk ? "watching" : "off: the block selector was refused",
          boxHint: BOX_HINT ? "on" : "off",
          perLine: cfg.perLine ? "on" : "off",
          composer: composer ? "on" : "off",
          contained: failures            // faults that were caught and did not spread
        };
      }

      return { stop: stop, refresh: push, status: status };
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
