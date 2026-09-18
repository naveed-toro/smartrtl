/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * Claude Code's chat webview, from 0.7.0: two things and nothing else.
 *
 * 1. THE DIRECTION OF TEXT, BY THE FORMULA ALONE
 *    The box you type into, a message you send, an answer while it streams and once it is
 *    finished - each takes its direction from one rule, openingLetters in @smartrtl/core:
 *
 *      first letter right-to-left                            -> right-to-left
 *      first letter left-to-right, an RTL letter within 63   -> right-to-left
 *      first letter left-to-right, none within 63            -> left-to-right
 *
 *    Claude Code's own guess - unicode-bidi: plaintext on its markdown blocks and on the box,
 *    dir="auto" on a sent message - is switched off on exactly the elements the formula
 *    decides, so that no second rule acts on the same text. Nothing else of ours touches
 *    text. The engine is @smartrtl/dom; the build inlines both packages, because this file is
 *    appended to someone else's bundle and cannot import. docs/decisions.md section 51.
 *
 * 2. CLAUDE CODE'S OWN BUG: A PINNED MESSAGE NOBODY CAN READ PAST
 *    Not about direction, and in every language: an opened message that heads a turn stays
 *    position: sticky and taller than the panel. It is let go of while opened, and the reader
 *    is kept on their line when it opens and closes. Unchanged from 0.5.x.
 *
 * In the webview console:
 *   __bidiStatus()   what each part is doing
 *   __bidiFixOff()   take all of it off, live
 */
;(function () {
  "use strict";
  try {
    /* The extension re-stamps this on every activation. If it stops - because it was
       uninstalled, and VS Code offers no working hook to clean up with - the block
       stops doing anything by itself. See src/patch-format.js. */
    var EXPIRES_AT = 0;
    if (EXPIRES_AT && Date.now() > EXPIRES_AT) return;

    var EXP_BOX = '[class*="expandableContainer_"]';
    var STICKY = '[class*="stickyHeader_"]';
    var BTN_ROW = '[class*="buttonContainer_"]';
    var UNPIN_EXPANDED = true;

    /* ------------------------------------------------------------------
       2. The pinned message - a circuit of its own.
    ------------------------------------------------------------------ */
    var UNPIN = "data-bidi-unpin";                              // on a pinned row we let go of
    var OPENED = STICKY + ":has(" + EXP_BOX + " > " + BTN_ROW + ")";
    // A pinned row, by name - and by what it is, a message in the transcript (2.1.268 on)
    // that the page makes position: sticky - and, failing both, the sticky ancestor of the
    // run a sent message's text is handed to (2.1.220 on). Never inside an editor or an answer.
    var PIN_ROWS = STICKY + ",[data-transcript-message]";
    var RUN = '[dir="auto"]';
    var NOT_A_ROW = '[contenteditable],[data-testid="assistant-message"]';
    // In a cascade layer declared ahead of all of the page's, every declaration
    // !important, the same as the box you type into and a sent message: until 0.5.3 this
    // rule was plain, unlayered, and in the answers' stylesheet, winning by specificity
    // alone - one rule of Claude Code's as specific as it, later in the page, and it
    // would have lost without a word. Each rule stands alone, so a browser that refuses
    // :has() still takes the one that needs no name.
    var UNPIN_CSS = "@layer smartrtl-unpin{" +
      OPENED + "{position:static!important}" +
      "[" + UNPIN + "]{position:static!important}" +
      "}";
    // A pinned row may cover at most this much of the panel it is pinned in, while it is
    // showing its whole length. Pinning is there so that the question stays in view while
    // its answer is read; past half, it covers more of the answer than it leaves.
    var ROOM = 0.5;

    /* ------------------------------------------------------------------
       Unpinning alone is half a fix, and the other half only shows up when you
       are NOT at the top of the conversation.

       A collapsed message is pinned, so you can see it wherever you have
       scrolled to. Click it open and it stops being pinned - and immediately
       falls back to where it really lives in the document, which may be
       thousands of pixels above your eye. The message you just opened vanishes
       upwards and has to be chased.

       So when a message toggles, the view follows it: its top goes back to the
       exact pixel it occupied before the click. Nothing appears to move at all -
       which is the point, because as far as the reader is concerned nothing
       should have.

       Measured after layout has settled rather than predicted, and only when the
       collapsed state actually changed, so a click that toggles nothing moves
       nothing.
    ------------------------------------------------------------------ */
    function scrollParent(el) {
      var x = el.parentElement;
      while (x && x !== document.body && x !== document.documentElement) {
        var oy = getComputedStyle(x).overflowY;
        if ((oy === "auto" || oy === "scroll") && x.scrollHeight > x.clientHeight) return x;
        x = x.parentElement;
      }
      return null;
    }

    /* ------------------------------------------------------------------
       And the half of it that was still missing.

       Opening a message and closing it again ought to be a round trip. Opening one
       already worked: the message you clicked stays under your eye rather than
       vanishing upwards. Closing it did not.

       The reason is the pinning itself. The moment a message collapses it is sticky
       again, so its top IS the panel's top whatever the scroll position - the drift
       measured against it is zero, nothing is scrolled, and the view is left wherever
       reading the message happened to leave it. Somebody who was halfway down a long
       answer, opened the question above it, read it and closed it again got the
       answer back from its beginning and had to find their place by hand.

       So the place a reader was in when they OPENED it is remembered, and closing it
       puts them back there. Not as a scrollTop: text can arrive above while the
       message is open, and a number of pixels would by then mean somewhere else. As
       an element, and where its top was.

       WHICH element decides whether this works, and the first choice was wrong. The
       turn the message heads seemed right - it is not the sticky one, so its top is a
       real position, and a message grows downward, so opening one does not move it.
       Measured, its top came back to the pixel and the reader still landed 20px out,
       because the message's own collapsed height was not quite what it had been.
       Anchoring anywhere INSIDE something that changes height inherits the change.

       So the anchor is the thing immediately BELOW the message - the answer itself.
       Everything under a message moves rigidly when that message grows or shrinks, so
       putting that one element back where it was puts the whole of what the reader
       was reading back where it was, whatever the message above it did in between.

       If it is gone by the time the message closes - the host rebuilt the conversation
       while it was open - the older behaviour is used instead, which is still better
       than nothing.
    ------------------------------------------------------------------ */
    var readingPosition = new WeakMap();

    /* Handed to keepUnderTheEye by the circuit it belongs to, startPinned below: which
       pinned row an element is in, whether a message is collapsed, and where to report
       what was measured. Null until that circuit is on, and again once it is off. */
    var pinning = null;

    function keepUnderTheEye(e) {
      var pin = pinning;
      if (!UNPIN_EXPANDED || !pin) return;
      try {
        var t = e.target && e.target.closest ? e.target : null;
        if (!t) return;
        // the message, by name - or, if the name has gone, the pinned row the click was in
        var box = t.closest(EXP_BOX) || pin.rowOf(t);
        if (!box) return;
        var header = box.closest(STICKY) || pin.rowOf(box) || box;
        // only a row the page pins is ours to follow: in a build that does not pin, or a
        // row it does not pin, opening a message moves nothing and there is nothing to undo
        if (!pin.isPinned(header)) return;
        var scroller = scrollParent(header);
        if (!scroller) return;

        var wasCollapsed = pin.folded(box);
        var panel = scroller.getBoundingClientRect();
        var wasAt = header.getBoundingClientRect().top;

        // "Put it back where it was" is only right while it WAS somewhere you could
        // see. Read to the end of an expanded message and its head is far above the
        // panel; restoring that pixel faithfully puts the message you were reading
        // back off the top of the screen, which is what it did. So the target is
        // clamped to the visible band: seen, it does not move; unseen, it comes to
        // the edge you were about to look at.
        var target = Math.min(Math.max(wasAt, panel.top), panel.bottom - 40);

        // Where the reader is right now, measured while it is still true - before the
        // click has changed anything, and before we have moved anything ourselves.
        // Below the message, never inside it: see above.
        var anchor = header.nextElementSibling || header.parentElement;
        var anchorTop = anchor ? anchor.getBoundingClientRect().top : null;

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            // Two frames later is outside the guard above - so it has one of its own. A
            // fault here once had nothing between it and the page.
            try {
              if (pinning !== pin) return;                  // turned off in between
              var nowCollapsed = pin.folded(box);
              if (nowCollapsed === wasCollapsed) return;    // nothing toggled, nothing to do

              if (!nowCollapsed) {
                // OPENING. Keep the message under the eye, and keep the place the
                // reader is leaving, so that closing it can be the other half.
                if (anchor && anchorTop !== null) {
                  readingPosition.set(box, { at: anchor, top: anchorTop });
                }
                var drift = header.getBoundingClientRect().top - target;
                if (drift) scroller.scrollTop += drift;
                // and whether it was let go of at all is read back, now that it has had
                // every chance to be: the status reports this, not what was switched on
                pin.opened(header, scroller);
                return;
              }

              // CLOSING. Back to the line they were on before they opened it.
              var saved = readingPosition.get(box);
              readingPosition.delete(box);
              if (saved && saved.at && saved.at.isConnected) {
                var back = saved.at.getBoundingClientRect().top - saved.top;
                if (back) scroller.scrollTop += back;
                return;
              }
              var fallback = header.getBoundingClientRect().top - target;
              if (fallback) scroller.scrollTop += fallback;
            } catch (err) { pin.fault(err); }
          });
        });
      } catch (err) { pin.fault(err); }
    }

    /* ------------------------------------------------------------------
       A PINNED MESSAGE NOBODY CAN READ PAST - a lamp on a circuit of its own.

       Everything above about the pinning is Claude Code's, and it is the same in every
       build that pins. Thirteen of them, from 2.1.90 - when a message that heads a turn
       first became sticky - to 2.1.268, were booted and put through it with a real answer
       streamed under a forty-line message and conversation below it. In every one of the
       thirteen, to the pixel: opened, the message stays pinned, 856px tall in a 560px
       panel; not one line of the answer under it is ever seen; "Show less" arrives after
       twenty-two turns of the wheel, at the very end of the turn; and closing it leaves
       the reader 2,640px from the line they had been reading.

       With this in, the same thirteen: "Show less" after three turns of the wheel, and
       closing it puts the reader back on their line exactly. That part was right in
       0.5.2. What was not right was everything around it:

         - it rode in the answers' stylesheet, so if that part could not start, this
           went with it: two lamps on one circuit
         - it was plain CSS, unlayered and winning by specificity alone
         - it was found by class names and nothing else
         - it asked whether it was needed once, at start-up, before any message
           existed - so it never really asked - and said "on" for ever, whether or
           not anything it did took
         - and it did not know about the second way into the same trap. A message
           Claude Code takes for a command - a skill run with long arguments, or any
           message that opens with "/", a pasted path included - is drawn with no
           collapsed state at all: no "Show more", no "Show less", no height cap, and
           pinned like any other. 755px of it in a 560px panel, and forty turns of the
           wheel went by without one line of the answer under it appearing - with 0.5.2
           installed, because the rule looked for a "Show less" that is never there.
           Reported to Claude Code by at least five different people since June 2026.

       So it is a circuit of its own now, built the way the other three are:

         FOUND TWO WAYS, EACH ENOUGH. A pinned row by name, and by what it is: a message
         in the transcript that the page makes position: sticky. An opened message by
         name - the collapse row that only an opened message has - and by what it is: a
         pinned row, showing its whole length, taller than half the panel it is pinned
         in. The second road is the one that reaches the command-shaped message, and the
         one that still finds an opened message if the names are ever changed.

         IT NEVER TOUCHES WHAT CLAUDE CODE DESIGNED. A collapsed message - collapsed by
         name, or held under an inline height cap that clips its text - stays pinned,
         however small the panel. Only a message showing its whole length is let go of.

         NO STYLESHEET CAN OVERRULE IT. A cascade layer declared ahead of all of the
         page's, every declaration !important.

         IT STANDS DOWN ROW BY ROW, AND ALTOGETHER. A row the page does not pin is never
         touched, and a pinned one short enough to read past is left pinned. If Claude
         Code stops pinning messages, the first one it draws says so, and every part of
         this comes back out of the page.

         IT SAYS WHAT IT MEASURED. Each message it lets go of is read back afterwards,
         and one the page kept pinned anyway, taller than the panel, is reported as not
         working rather than as on.

       Two things of Claude Code's that sit beside this and were checked against it, in
       its own code: from 2.1.257 a click on a pinned message's TEXT scrolls to the start
       of its turn, 300ms later - buttons are left out of that, so "Show more" and "Show
       less" are ours alone. And from 2.1.268 moving focus to a message allows for the
       height of its turn's pinned header, as if it were still pinned; while one of those
       is let go of, that allowance is a header's height too generous. Nothing breaks.
    ------------------------------------------------------------------ */
    function startPinned() {
      if (window.__bidiUnpin) return { verdict: "off - something is already running", stop: function () {}, status: null };
      window.__bidiUnpin = 1;

      var stopped = false, faults = 0, lastFault = "";
      var state = "on - no message has been pinned yet";
      var road = "";                  // how the last message let go of was found
      var rows = [];                  // { el, scroller }, one per row the page pins
      var byEl = new WeakMap();       // row -> its record
      var looked = new WeakSet();     // every candidate is asked once whether it is pinned
      var sheet = null, finder = null, sizes = null, listening = false;

      function fault(e) {
        faults++;
        try { lastFault = String((e && e.message) || e).slice(0, 200); } catch (x) {}
      }
      function matches(el, sel) { try { return !!el.matches && el.matches(sel); } catch (e) { return false; } }

      /** The box it scrolls in: the nearest ancestor that scrolls, whether or not it has yet. */
      function scrollerOf(el) {
        for (var x = el.parentElement; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
          var oy = getComputedStyle(x).overflowY;
          if (oy === "auto" || oy === "scroll" || oy === "overlay") return x;
        }
        return null;
      }

      /**
       * Is this message collapsed - is Claude Code holding text back that a reader cannot see?
       *
       * By name first, because while the name lasts it is exact and costs one query. Then by
       * what being collapsed IS: an element inside the message whose content is taller than
       * the element, that does not let it out. That needs no name and no knowledge of HOW the
       * cap is written - an inline max-height today, a class tomorrow, a custom property the
       * day after - which matters because this is the one question that decides whether a
       * message is left exactly as Claude Code designed it.
       *
       * It has to be the message's own text, though, and not something small inside it: a code
       * block with a scrollbar clips its content too, and reading that as "collapsed" would
       * leave a message pinned over its own answer - the trap, kept open by the fix for it. So
       * only an element tall enough to BE the message's text counts.
       */
      function folded(el) {
        if (el.querySelector('[class*="collapsed_"]')) return true;
        try {
          var room = el.getBoundingClientRect().height;
          var all = el.querySelectorAll("*");
          for (var i = 0; i < all.length && i < 300; i++) {
            var n = all[i];
            if (n.scrollHeight <= n.clientHeight + 1) continue;   // nothing is being held back
            if (n.clientHeight * 2 < room) continue;              // too small to be the message's text
            if (getComputedStyle(n).overflowY !== "visible") return true;
          }
        } catch (e) { fault(e); }
        return false;
      }

      /** The pinned row an element is in, if any. */
      function rowOf(el) {
        for (var x = el; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
          if (byEl.has(x)) return x;
        }
        return el.closest ? el.closest(STICKY) : null;
      }

      /**
       * Does the page pin this row? Asked of the page, never of our own rules: a row we let
       * go of was pinned, and once our rule for opened messages is in, an opened row reads
       * static because of us, so its name is taken for what the page meant.
       */
      function pinnedByPage(el) {
        if (el.hasAttribute(UNPIN)) return true;
        if (getComputedStyle(el).position === "sticky") return true;
        return !!sheet && matches(el, OPENED);
      }

      /** A row named as pinned, that nothing of ours holds static, and that the page does not pin. */
      function pageStoppedPinning(el) {
        return matches(el, STICKY) && !el.hasAttribute(UNPIN) && !(sheet && matches(el, OPENED)) &&
               getComputedStyle(el).position !== "sticky";
      }

      /**
       * Every row a node brings with it, by all three roads: the name, the attribute every
       * message in the transcript carries, and - for a build that has dropped both - the run a
       * sent message's text is handed to dir="auto" in, from which the row it sits in is the
       * nearest ancestor the page pins. Never from inside an editor, or an answer: an answer
       * is never a pinned row.
       */
      function candidatesIn(n) {
        var out = [];
        if (!n || n.nodeType !== 1 || !n.querySelectorAll) return out;
        if (matches(n, PIN_ROWS)) out.push(n);
        var inner = n.querySelectorAll(PIN_ROWS);
        for (var i = 0; i < inner.length; i++) out.push(inner[i]);
        var runs = matches(n, RUN) ? [n] : [];
        var more = n.querySelectorAll(RUN);
        for (var r = 0; r < more.length; r++) runs.push(more[r]);
        for (var k = 0; k < runs.length; k++) {
          if (looked.has(runs[k])) continue;
          looked.add(runs[k]);
          // Not from the box you type into either - not inside it, and not beside it, where
          // the layer that shows its text lives. Nothing of Claude Code's but a message is
          // sticky today; a box that one day is would grow past half the panel with a long
          // draft, and must never be taken for a message to let go of.
          if (runs[k].closest(NOT_A_ROW) || SmartRTLDom.besideAnEditor(runs[k])) continue;
          var row = pinnedAbove(runs[k]);
          if (row) out.push(row);
        }
        return out;
      }

      function pinnedAbove(el) {
        for (var x = el.parentElement, hops = 0; x && x !== document.body && hops < 12; x = x.parentElement, hops++) {
          if (x.hasAttribute(UNPIN) || getComputedStyle(x).position === "sticky") return x;
        }
        return null;
      }

      var stoodDown = false;
      function consider(el) {
        if (stopped || stoodDown || looked.has(el) || byEl.has(el)) return;
        looked.add(el);
        // The first row named as pinned says whether this build pins at all. Only while
        // nothing pinned has been seen: once one has, the build pins, and a row that does
        // not is simply a row that is not ours.
        if (!rows.length && pageStoppedPinning(el)) { standDown(); return; }
        if (!pinnedByPage(el)) return;
        var rec = { el: el, scroller: scrollerOf(el) };
        byEl.set(el, rec);
        rows.push(rec);
        if (state.indexOf("on - no message has been pinned") === 0) state = "on - nothing has needed letting go of yet";
        if (sizes) {
          sizes.observe(el);
          if (rec.scroller) sizes.observe(rec.scroller);
        }
      }

      function forget(rec) {
        try { if (sizes) sizes.unobserve(rec.el); } catch (e) {}
        byEl.delete(rec.el);
        var i = rows.indexOf(rec);
        if (i >= 0) rows.splice(i, 1);
      }

      /** How it was let go of, for the status. */
      function roadOf(el) {
        if (matches(el, OPENED)) return "by name - an opened message has a collapse row";
        if (el.hasAttribute(UNPIN)) return "by what it is - pinned, showing its whole length, taller than half the panel";
        return "";
      }

      /** Read back, after the frame: is a row we let go of really not pinned any more? */
      function verify(el, scroller) {
        if (stopped || !el.isConnected) return;
        var how = roadOf(el);
        var pos = getComputedStyle(el).position;
        if (pos !== "sticky") {
          if (how) { state = "on - measured working"; road = how; }
          return;
        }
        // Still pinned. Short enough to read past is not the trap, and not a failure; taller
        // than the panel is exactly the trap, and it is said so.
        var room = scroller ? scroller.clientHeight : (window.innerHeight || 0);
        if (room && el.getBoundingClientRect().height > room) {
          state = "not working - an opened message is still pinned, and taller than the panel (position: sticky)";
        }
      }

      /**
       * Every pinned row, measured: read everything first, then write, so one layout does
       * for however many rows there are.
       */
      function judge() {
        if (stopped) return;
        try {
          for (var i = rows.length - 1; i >= 0; i--) if (!rows[i].el.isConnected) forget(rows[i]);
          var want = [];
          for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            var room = r.scroller ? r.scroller.clientHeight : (window.innerHeight || 0);
            var h = r.el.getBoundingClientRect().height;
            want.push(room > 0 && h > room * ROOM && !folded(r.el));
          }
          var changed = [];
          for (var k = 0; k < rows.length; k++) {
            var el = rows[k].el;
            if (want[k] && !el.hasAttribute(UNPIN)) { el.setAttribute(UNPIN, ""); changed.push(rows[k]); }
            else if (!want[k] && el.hasAttribute(UNPIN)) el.removeAttribute(UNPIN);
          }
          if (changed.length) {
            requestAnimationFrame(function () {
              for (var c = 0; c < changed.length; c++) {
                try { verify(changed[c].el, changed[c].scroller); } catch (e) { fault(e); }
              }
            });
          }
        } catch (e) { fault(e); }
      }

      function standDown() {
        stoodDown = true;
        teardown();
        state = "not needed - Claude Code does this itself now";
      }

      function teardown() {
        pinning = null;
        try { if (finder) finder.disconnect(); } catch (e) {}
        try { if (sizes) sizes.disconnect(); } catch (e) {}
        if (listening) {
          try { document.removeEventListener("click", keepUnderTheEye, true); } catch (e) {}
          listening = false;
        }
        try {
          var marked = document.querySelectorAll("[" + UNPIN + "]");
          for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(UNPIN);
        } catch (e) {}
        if (sheet) { try { sheet.remove(); } catch (e) {} }
        rows = [];
        try { delete window.__bidiUnpin; } catch (e) { window.__bidiUnpin = 0; }
      }

      // Rows already on the page are asked before anything of ours is in it, so that what
      // they say is the page's own answer. At start-up there are normally none - the panel
      // has not drawn a message when a patch at the end of its bundle runs.
      var already = candidatesIn(document.body || document.documentElement);
      for (var a = 0; a < already.length && !stoodDown; a++) {
        try { consider(already[a]); } catch (e) { fault(e); }
      }
      if (stoodDown) return { verdict: false, stop: function () {}, status: null };

      sheet = SmartRTLDom.layeredSheet("smart-rtl-unpin", UNPIN_CSS, fault);

      try {
        sizes = new ResizeObserver(function () { judge(); });
        for (var s = 0; s < rows.length; s++) {
          sizes.observe(rows[s].el);
          if (rows[s].scroller) sizes.observe(rows[s].scroller);
        }
      } catch (e) { fault(e); sizes = null; }

      var pruneTimer = null;
      try {
        finder = new MutationObserver(function (records) {
          if (stopped || stoodDown) return;
          try {
            if (rows.length) sheet.keep();   // taken out by the page, put back now
            for (var r = 0; r < records.length; r++) {
              if (records[r].removedNodes && records[r].removedNodes.length && !pruneTimer) {
                pruneTimer = setTimeout(function () { pruneTimer = null; judge(); }, 1000);
              }
              var added = records[r].addedNodes;
              for (var j = 0; j < added.length; j++) {
                var list = candidatesIn(added[j]);
                for (var k = 0; k < list.length && !stoodDown; k++) consider(list[k]);
              }
            }
          } catch (e) { fault(e); }
        });
        finder.observe(document.documentElement, { childList: true, subtree: true });
      } catch (e) { fault(e); finder = null; }

      pinning = {
        rowOf: rowOf,
        isPinned: function (el) { return byEl.has(el) || matches(el, STICKY); },
        folded: folded,
        opened: function (el, scroller) { try { verify(el, scroller); } catch (e) { fault(e); } },
        fault: fault
      };
      document.addEventListener("click", keepUnderTheEye, true);
      listening = true;

      return {
        verdict: state,
        listening: function () { return listening; },
        stop: function () {
          if (stopped) return;
          stopped = true;
          if (pruneTimer) { clearTimeout(pruneTimer); pruneTimer = null; }
          teardown();
          state = "off - turned off by hand";
        },
        status: function () {
          var letGo = 0;
          for (var i = 0; i < rows.length; i++) if (rows[i].el.hasAttribute(UNPIN) || matches(rows[i].el, OPENED)) letGo++;
          return {
            state: state,
            found: road || "not yet",
            pinned: rows.length,
            letGo: letGo,
            sheet: sheet ? sheet.road() : "off",
            contained: faults,
            lastFault: lastFault
          };
        }
      };
    }

    var pinnedPart = null;
    try { if (UNPIN_EXPANDED) pinnedPart = startPinned(); } catch (e) { pinnedPart = null; }

    /* ------------------------------------------------------------------
       1. The direction of text, by the formula alone.
    ------------------------------------------------------------------ */
    var direction = null;
    try {
      direction = SmartRTLDom.start(SmartRTL, {
        // an answer: every block of Claude Code's markdown, the elements its plaintext rule
        // was written for - never the heading it hides above a sent message for screen readers
        answers: {
          within: '[class^="root_"],[class*=" root_"]',
          skip: '[class*="screenReaderTurnHeading_"],[class*="visuallyHidden_"]'
        },
        // the box, by name and by what it is, and the layer drawn over it that people read
        composer: {
          input: ['[class*="messageInput_"]', '[contenteditable][role="textbox"]'],
          mirror: ['[class*="mentionMirror_"]', '[aria-hidden="true"]']
        },
        // a sent message: the run its text is handed to dir="auto" in - never inside an answer
        sent: {
          runs: '[dir="auto"]',
          not: '[data-testid="assistant-message"]'
        }
      });
    } catch (e) { direction = null; }

    window.__bidiStatus = function () {
      var out = {};
      try { out.direction = direction ? direction.status() : "off - the engine did not start"; } catch (e) { out.direction = "off - " + e.message; }
      try {
        out.pinnedMessage = pinnedPart && pinnedPart.status ? pinnedPart.status()
          : { state: pinnedPart && pinnedPart.verdict === false ? "not needed - Claude Code does this itself now" : "off" };
      } catch (e) {}
      return out;
    };

    {
      var release = typeof window.__bidiFixOff === "function" ? window.__bidiFixOff : null;
      window.__bidiFixOff = function () {
        try { if (direction) direction.stop(); } catch (e) {}
        try { if (pinnedPart && pinnedPart.stop) pinnedPart.stop(); } catch (e) {}
        direction = null;
        return release ? release() : "off";
      };
    }
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
