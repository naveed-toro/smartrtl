/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * Text direction for RTL languages in the Claude Code chat webview.
 *
 * The problem it solves
 *   webview/index.css sets  unicode-bidi: plaintext  on p, li, h1..h6, blockquote, td, th.
 *   Each line therefore takes its direction from its FIRST strong character, so a line
 *   that opens with a Latin token renders left-to-right even when the rest is Urdu.
 *
 * What is in this file
 *   Only the parts that are true of Claude Code and of nothing else: its class names,
 *   its timeline dot, its collapse button. The deciding and the watching live in
 *   @smartrtl/dom, and the rule itself in @smartrtl/core, so the browser extension and
 *   the desktop patch answer the same question the same way. The build step inlines
 *   both, because this file is appended to someone else's bundle and cannot import.
 *
 * The rule
 *   starts RTL                      -> RTL   (already true, nothing to do)
 *   starts LTR, no RTL after it     -> LTR   (left alone)
 *   starts LTR, RTL follows         -> RTL
 *
 *   A line that starts LTR, contains RTL, and is still meant to read LTR does exist,
 *   but it is rare, and no local signal separates it reliably - a word-count guard
 *   was tried and its verdict turned on whether the writer typed "," or the Arabic
 *   ",". That case is deliberately given up so every common case is right.
 *
 *   One safety rule survives: a block with NO RTL character at all is never touched.
 *
 * Two things about this webview that no other page has, and that were found by reading
 * its own bundle rather than by guessing:
 *
 *   - an ANSWER is markdown, so its text lands in real p / li / h elements. A USER
 *     MESSAGE is not: it renders through a plainText path as a bare
 *     <span dir="auto"> inside a content div. Nothing there is a block, so the engine
 *     could not see user messages at all, whatever they said.
 *   - the box you type into is TWO layers: a contenteditable that is color:#0000 -
 *     caret only, nothing of it is visible - stacked over a mirror React renders the
 *     text into. The mirror is the only layer anybody reads, and its children belong
 *     to React. Take one of them and the box types blank spaces; draw a copy of it
 *     instead and the box types a keystroke behind. Both were shipped and measured,
 *     and the box now gets ONE direction and nothing of ours inside it.
 *   - a user message is wrapped in an expandable container that collapses at 60px and,
 *     once expanded, carries no height cap at all.
 *   - above every user message sits a visually hidden h3 carrying the same text, for
 *     screen readers. It is a block, and it comes first: until 0.5.2 it had the code
 *     for answers deciding the whole row of a sent message, from text nobody sees. It
 *     is skipped now, and a sent message is decided by a lamp of its own.
 *
 * Never touches code blocks, and never changes any text.
 *
 * Whether any of this is still needed is asked of the PAGE, in three separate places and
 * three separate ways, because Claude Code may fix one of them without touching the others:
 * an off-screen probe for answers, and - since 0.5.3 - the real box and the real sent message,
 * read back before any attribute of ours is on them, with the one text whose direction the
 * browser's rule and this one disagree about. Any of the three that is no longer needed takes
 * itself out of the page and says so. decisions.md, 39.
 *
 * Two things to run in the webview console:
 *   __bidiStatus()   which parts are on, which stood down, and why
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
    var BODY = '[class*="content_"]';        // the text of one user message
    var IN_BOX = '[class*="messageInputContainer_"]';
    var IN_TXT = '[class*="messageInput_"]';
    var IN_MIR = '[class*="mentionMirror_"]';
    var ROW_SEL = '[class*="timelineMessage_"]';

    /* Each of these can be turned off on its own without touching anything else. */
    var STICKY = '[class*="stickyHeader_"]';
    var BTN_ROW = '[class*="buttonContainer_"]';

    var MIRROR_TIMELINE = true;   // put a message's dot on the side it reads from
    var MIRROR_INPUT = true;      // flip the box you type in
    var UNPIN_EXPANDED = true;    // let an expanded message scroll like ordinary content

    /* ------------------------------------------------------------------
       OPTIONAL: put each message's timeline dot on the side that message reads from.

       Purely decorative. Two separate decisions, on purpose:

         per conversation - once any message is RTL, the SAME gutter is reserved on
                            both sides of every row. Content columns therefore stay
                            identical from row to row, so nothing shifts sideways
                            when an English answer sits between two Urdu ones.

         per message      - only a row whose own content is RTL moves its dot and its
                            line into the right hand gutter. An English answer keeps
                            its dot on the left, next to its own text, exactly where
                            it has always been.

       The three offsets are read from the extension at runtime rather than copied,
       so a restyle upstream cannot leave this stale. If any of them is not a plain
       pixel number, nothing is done at all - moving the gutter without moving the
       dot would be worse than leaving it alone.
    ------------------------------------------------------------------ */
    var timelineDone = false;
    function mirrorTimeline() {
      if (!MIRROR_TIMELINE || timelineDone) return;
      try {
        var row = document.querySelector(ROW_SEL + ":not([data-bidi-row])");
        if (!row) return;                       // nothing pristine to measure yet
        var pad  = getComputedStyle(row).paddingLeft;
        var dot  = getComputedStyle(row, "::before").left;
        var line = getComputedStyle(row, "::after").left;
        var px = /^(\d+(?:\.\d+)?)px$/;
        if (!px.test(pad) || !px.test(dot) || !px.test(line)) { timelineDone = true; return; }
        if (parseFloat(pad) <= 0) { timelineDone = true; return; }
        var ts = document.createElement("style");
        ts.id = "smart-rtl-timeline";
        ts.textContent =
          '[data-bidi-timeline="rtl"] ' + ROW_SEL + '{padding-right:' + pad + '!important}' +
          ROW_SEL + '[data-bidi-row="rtl"]::before{left:auto!important;right:' + dot + '!important}' +
          ROW_SEL + '[data-bidi-row="rtl"]::after{left:auto!important;right:' + line + '!important}';
        (document.head || document.documentElement).appendChild(ts);
        document.documentElement.setAttribute("data-bidi-timeline", "rtl");
        timelineDone = true;
      } catch (e) { timelineDone = true; }
    }

    function markRow(el) {
      if (!MIRROR_TIMELINE) return;
      try {
        var row = el.closest(ROW_SEL);
        if (row && !row.hasAttribute("data-bidi-row")) row.setAttribute("data-bidi-row", "rtl");
      } catch (e) {}
    }

    function undoTimeline() {
      var t = document.getElementById("smart-rtl-timeline");
      if (t && t.parentNode) t.parentNode.removeChild(t);
      document.documentElement.removeAttribute("data-bidi-timeline");
      var rows = document.querySelectorAll("[data-bidi-row]");
      for (var k = 0; k < rows.length; k++) rows[k].removeAttribute("data-bidi-row");
      timelineDone = false;
    }

    /* ------------------------------------------------------------------
       A user message that heads a turn is pinned:

         .message.stickyHeader { position: sticky; top: 0 }

       Collapsed, it is 60px of question held above a long answer, which is the
       point. Expanded, it has no height cap at all - and a pinned element taller
       than the window can never show its own bottom, because it does not move.
       The wheel then scrolls the conversation behind it, invisibly, until the
       whole turn has gone past; only then does the message itself begin to move.
       Its "Show less" sits at the end of that pinned block, so it is unreachable
       for as long as the turn lasts.

       That is not an RTL problem. It happens in every language, and it is worse
       the further up you had scrolled before opening the message.

       Capping the height was tried and rejected: how much of a window a message
       may take is not ours to decide, and the right answer differs on a laptop
       and on an external display. The message should open to its full length.

       What is actually wrong is the pinning, and only while expanded - once you
       are reading the message itself, there is nothing left for it to hold above
       anything. So an expanded turn header simply stops being pinned and scrolls
       like ordinary content. Nothing is capped, nothing is moved.

       An expanded message is told apart from a merely short one by the collapse
       row, which exists only when expanded and only as a direct child.

       That is one of two roads to it, and the other is by what the trap IS: a pinned
       row taller than half the panel it is pinned in, showing its whole length. That
       road needs no class name, and it also reaches the second way into the same trap,
       which the first road never could - see startPinned below.
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
       NOT DONE, and this one was nearly done twice.

       Right-to-left text starts at the RIGHT edge of the panel, so anything that
       moves that edge while an answer streams moves text somebody has already read.
       Measured against Claude Code's own stylesheet, the edge appeared to twitch by
       about ten pixels, three times, during one ordinary answer - and two fixes were
       written for it: stretching the markdown root so it stops shrinking to fit, and
       reserving the scrollbar gutter so the scrollbar stops changing anybody's width.

       Neither shipped, because neither was needed. The twitch was in the test page:
       a panel that is a fixed box in the real editor had been modelled as an ordinary
       document, so it grew its own scrollbars and changed width underneath the
       measurement. Constrained the way the panel is constrained, the answer's edge
       does not move at all - zero frames, with the fix and without it.

       The record is here rather than in a commit message because a plausible fix for
       a fault that does not exist is the most expensive kind: it survives review, it
       ships, and every later oddity gets debugged with it in the way.
    ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------
       NOT DONE, on purpose.

       The body shrinks to fit its longest line - measured at 275px inside a 704px
       bubble - and sits against the bubble's left edge, because that is where a
       left-to-right design puts it. Pushing a decided message's box to the other
       edge was written, and the button tests failed instantly: the controls live
       inside that container and moved with it.

       Moving a control the extension placed is the one thing this fix does not do.
       And it is a smaller loss than it looks: the container is exactly as wide as
       its longest line, so right-aligning inside it aligns every line to that
       line's end - the block reads correctly as a block. It simply sits on the
       left of a wider bubble, which is where their own layout puts it in English
       too.
    ------------------------------------------------------------------ */

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
        LAMPS.unpinExpandedMessage = state;
        delete LAMPS.keepTheViewOnTheMessage;
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

    /* ------------------------------------------------------------------
       THE FUSE BOX.

       Everything below is a lamp on its own circuit. Each is asked two questions
       before it is switched on, and both answers are kept where anybody can read
       them back with __bidiStatus():

         is it needed?    if Claude Code no longer has the fault a lamp exists for,
                          that lamp stays OFF. Not out of politeness - two fixes for
                          one fault fight each other, and the fight is invisible to
                          whoever shipped either of them. "Needed" is MEASURED, never
                          assumed or read out of a stylesheet.

         is it possible?  everything it depends on has to be there. If one class name
                          is renamed or one component restyled, that lamp goes off ON
                          ITS OWN and the others do not notice.

       And a lamp that throws at any point is caught here, so it cannot reach another
       lamp or the webview around them.

       What this rules out on purpose: any arrangement where one missing class name
       takes the whole thing down. A fix living inside somebody else's product will
       one day meet a version of it nobody has seen, and the only question that
       matters then is how much goes dark.
    ------------------------------------------------------------------ */
    var LAMPS = {};
    var running = null;

    function lamp(name, fn) {
      var verdict;
      try { verdict = fn(); }
      catch (e) { LAMPS[name] = "off - " + ((e && e.message) || "threw while starting"); return false; }

      if (verdict === true) LAMPS[name] = "on";
      else if (verdict === false) LAMPS[name] = "not needed - Claude Code does this itself now";
      else if (verdict === null) LAMPS[name] = "off - what it needs is not in this build";
      else LAMPS[name] = String(verdict);
      return LAMPS[name].indexOf("on") === 0;
    }

    window.__bidiStatus = function () {
      var out = {};
      for (var k in LAMPS) if (Object.prototype.hasOwnProperty.call(LAMPS, k)) out[k] = LAMPS[k];
      try {
        if (running && running.status) {
          out.engine = running.status();
          // What the engine MEASURED outranks what a lamp was told when it was switched
          // on. A lamp is asked before the thing it lights exists; the engine looks at
          // the page afterwards and sees whether the direction was actually taken. In
          // 2.1.267 the composer's lamp said "on" over a box that no longer turned.
          if (out.composer && out.composer.indexOf("on") === 0 && out.engine.composer) out.composer = out.engine.composer;
          if (out.sentMessages && out.sentMessages.indexOf("on") === 0 && out.engine.sent) out.sentMessages = out.engine.sent;
        }
      } catch (e) {}
      // and the pinned message, which is a circuit of this file's own, not the engine's
      try {
        if (pinnedPart && pinnedPart.status && out.unpinExpandedMessage &&
            out.unpinExpandedMessage.indexOf("on") === 0) {
          out.unpinDetail = pinnedPart.status();
          out.unpinExpandedMessage = out.unpinDetail.state;
        }
      } catch (e) {}
      return out;
    };

    /* ------------------------------------------------------------------
       Does this build still read a mixed line the wrong way round?

       The whole project exists for one behaviour: `unicode-bidi: plaintext` on the
       rendered blocks takes a line's direction from its FIRST strong character, so a
       line that opens with `npm` reads left to right however much Urdu follows it.

       This asks the page rather than reading their stylesheet. A rule can be renamed,
       moved, overridden, or shipped in a second file, and any of those makes a text
       search lie - usually in the expensive direction. What the browser does with the
       sentence cannot lie about what a reader will see.

       A copy of the markdown root, off screen, holding the exact sentence the fault
       is about. Where the browser puts its FIRST character is the answer:

         first character on the left   -> still the old behaviour -> the fault is here
         first character on the right  -> somebody fixed it       -> stand down

       Three things make it trustworthy:
         - it is built outside the app's own root, so nothing of React's is touched
         - it carries no decision of ours, so OUR stylesheet cannot answer our own
           question - the rules we install all sit under [data-bidi], and this has none
         - it is taken out again immediately, whatever happens

       Returns true / false / null, and null means "no markdown root exists yet, ask
       again later" - which at start-up is the usual answer, because the panel has not
       rendered a message when a patch at the end of the bundle runs.
    ------------------------------------------------------------------ */
    function faultIsStillHere() {
      var roots = document.querySelectorAll('[class*="root"]');
      for (var i = 0; i < roots.length && i < 8; i++) {
        var verdict = askOneContainer(roots[i]);
        if (verdict !== null) return verdict;
      }
      return null;                      // nothing to measure yet - ask again later
    }

    /**
     * One container, two paragraphs, and the instrument checks itself first.
     *
     * control   pure Urdu. In a build that decides a line's direction at all - which
     *           is what `unicode-bidi: plaintext` does, and what any replacement for
     *           it would also have to do - this reads right to left. If it does NOT,
     *           then whatever was found is not the container the fault lives in, the
     *           measurement means nothing, and it is thrown away rather than
     *           believed. An instrument nobody checks reads whatever you hoped.
     *
     * subject   the sentence the whole project exists for: opens in English, turns
     *           Urdu. Left to right means the fault is still here. Right to left
     *           means somebody has fixed it, and everything of ours stands down.
     */
    function askOneContainer(root) {
      var probe = document.createElement("div");
      probe.className = root.className;
      probe.setAttribute("data-bidi-probe", "1");
      probe.style.cssText = "position:fixed;top:0;left:0;width:420px;opacity:0;" +
                            "pointer-events:none;z-index:-1";
      var control = document.createElement("p");
      control.textContent = "اسلام علیکم کیسے ہیں";
      var subject = document.createElement("p");
      subject.textContent = "npm install کے بعد پروجیکٹ چلائیں";
      probe.appendChild(control);
      probe.appendChild(subject);
      (document.body || document.documentElement).appendChild(probe);
      try {
        var c = readsRightToLeft(control);
        if (c !== true) return null;    // the instrument is not measuring anything
        return readsRightToLeft(subject) === false;
      } finally {
        if (probe.parentNode) probe.parentNode.removeChild(probe);
      }
    }

    /** Where the FIRST character of a paragraph ended up. null = nothing was laid out. */
    function readsRightToLeft(p) {
      var line = p.getBoundingClientRect();
      if (!line.width || !p.firstChild) return null;
      var r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.setEnd(p.firstChild, 1);
      var first = r.getBoundingClientRect();
      if (!first.width) return null;
      return (first.left - line.left) > line.width / 2;
    }

    /**
     * Ask again the moment there is something to ask about.
     *
     * At start-up the answer is almost always "no markdown root yet", so the lamp is
     * switched on and the question left open. The first time a message appears it is
     * settled once and for all - and if the answer is that somebody has fixed this,
     * the answers' part comes straight back out, and only that part. The box you type
     * in and sent messages are separate questions, and stay on.
     */
    function settleWhetherNeeded() {
      var done = false, asking = false, attempts = 0;

      function ask() {
        // Asking means putting a probe in the page and taking it out again, and this
        // is watching the page - so without these two guards the question asks itself
        // for ever. Not a slow loop: a HANG, and the panel never finishes loading.
        // Found by booting the real 5MB bundle rather than by any test, because the
        // copied page always had a container the probe could measure in and so always
        // got an answer on the first ask.
        if (done || asking || attempts > 40) return;
        asking = true;
        var still = null;
        try { still = faultIsStillHere(); }
        catch (e) { /* a probe that throws is not an answer */ }
        finally {
          attempts++;
          try { watcher.takeRecords(); } catch (e) {}   // our own two mutations, forgotten
          asking = false;
        }
        if (still === null) return;                     // nothing to measure yet
        done = true;
        try { watcher.disconnect(); } catch (e) {}
        clearTimeout(giveUp);
        if (still) return;                              // the fault is here; carry on
        LAMPS.direction = "not needed - Claude Code does this itself now";
        // Only the part that exists for THIS fault stands down. It used to be
        // running.stop(), which took the box you type in and sent messages with it - so
        // Claude Code fixing its answers would have switched off two things it had not
        // touched. One lamp at a time holds in this direction too.
        try {
          if (running && running.standDownBlocks) {
            running.standDownBlocks("Claude Code reads a mixed line correctly by itself now");
          }
        } catch (e) {}
      }

      var watcher = new MutationObserver(ask);
      var giveUp = setTimeout(function () {
        done = true;
        try { watcher.disconnect(); } catch (e) {}
      }, 60000);
      watcher.observe(document.documentElement, { childList: true, subtree: true });
      ask();
    }

    /* ------------------------------------------------------------------
       Hand the surface to the engine.

       Two of the things handed over are described twice, on purpose: by the hashed
       class names this build of Claude Code happens to use, and by what the elements
       ARE. The names come from a stylesheet and change whenever somebody restyles.
       What an element is for does not: the box you type into is contenteditable with
       role=textbox, the layer drawn over it is aria-hidden, and a typed message is
       handed to dir="auto". Either description is enough on its own, so a rename
       leaves the other one standing.

       Checked across five builds, 2.1.247 to 2.1.267, before it was relied on: the
       names never changed, the roles never changed, and dir="auto" occurs exactly
       once in the whole bundle - on the span a typed message's text goes into.

       The box you type into was then put to seventeen builds, booted and typed into,
       from 2.0.50 to 2.1.268 - ten months. Its class names went from minified letters
       to hashed names, a second layer appeared over it, and 2.1.267 added plaintext.
       The five things listed for it below never changed once, in any of them, so each
       one is its own road to it: any single one of them still standing finds it.

       The composer is two stacked layers: an invisible contenteditable you type
       into and a mirror that shows the text. The engine turns both from the element
       they share, so the caret can never end up on one side while the glyph sits on
       the other, and turns nothing at all if it cannot find both. Turning is all
       that is done to them - no element of ours goes into either. It is a lamp of its
       own inside the engine, too: its own observers and its own stylesheet, so nothing
       that happens to answers can reach it. decisions.md, 35.

       A message somebody sent is a lamp of its own too, since 0.5.2. Until then it was
       decided by the code for answers: its body was named as one of their blocks, and
       from 2.1.247 a heading Claude Code hides above every sent message for screen
       readers decided its whole row first - text nobody sees, in somebody else's lamp.
       Seventeen builds were booted and sent a message before this was changed. Now the
       answers' part skips that heading, and the sent message is found by name and by
       the run its text is handed to - dir="auto", the browser's own first-strong guess.
       decisions.md, 36.

       boxSelector names the smallest thing that counts as "one answer": its markdown
       root. The content wrapper named here for sent messages until 0.5.1 had stopped
       existing in 2.1.266 - Claude Code's own component still asks for that class, and
       its stylesheet no longer has one.
    ------------------------------------------------------------------ */
    var needed = lamp("direction", function () {
      var still = faultIsStillHere();
      if (still === false) return false;
      return true;                       // true, or "nothing to measure yet" - carry on
    });

    // A message that heads a turn, pinned and too tall to read past: a circuit of this
    // file's own, started before the engine and inside its own guard, so that nothing that
    // happens to the engine can reach it. Whether it is needed is asked of every message
    // the page pins, not once at start-up - see startPinned.
    var pinnedPart = null;
    var unpin = UNPIN_EXPANDED ? lamp("unpinExpandedMessage", function () {
      pinnedPart = startPinned();
      return pinnedPart.verdict;         // "on - ...", or false: this build does not pin
    }) : false;
    if (unpin) {
      lamp("keepTheViewOnTheMessage", function () {
        return pinnedPart && pinnedPart.listening && pinnedPart.listening() ? true : "off - it is not listening";
      });
    }

    var composer = MIRROR_INPUT ? lamp("composer", function () {
      // The composer is rendered long after this runs, so "not there yet" is not
      // "not there". Both questions are answered later, by the engine, and __bidiStatus()
      // reports what it found instead of this:
      //
      //   is it needed?    asked of the real box, with the first draft that can answer -
      //                    one that opens in Latin and turns right-to-left, which the
      //                    browser's rule reads one way and ours the other. Drawn from the
      //                    right, Claude Code has fixed this and the circuit comes out of
      //                    the page. Until 0.5.3 this said "yes, for ever". decisions.md, 39.
      //   did it work?     read back after the box is turned, every layer at once.
      return true;
    }) : false;

    var sent = lamp("sentMessages", function () {
      // One direction for the whole of a sent message, from what it says. Until 0.5.0
      // it was decided line by line, from a copy of the message built beside Claude
      // Code's own - and in the real panel that copy was never once made: a hidden
      // heading carrying the same text decided the message first. decisions.md, 34.
      // A circuit of its own since 0.5.2; what it measures replaces this. decisions.md, 36.
      // And since 0.5.3 the engine asks this one the same question it asks the box: the
      // first message that can tell the two rules apart is read before anything of ours is
      // on it, and a page that lays it out right-to-left by itself gets this circuit taken
      // out of it - that one, and neither of the others. decisions.md, 39.
      return true;
    });

    // The engine starts whether or not the answers need us. It used to start only when
    // they did - so a Claude Code that had fixed its answers would have started with the
    // box you type in and sent messages switched off as well, parts that were never
    // asked about. Answers that do not need us get `blocks: false`, and nothing else.
    {
      running = SmartRTLDom.start(SmartRTL, {
        blocks: needed ? SmartRTLDom.DEFAULT_BLOCKS : false,
        boxSelector: '[class*="root"]',
        // what the answers' part must never decide from: the heading hidden above every
        // sent message for screen readers, and anything else that is only there for them
        skip: '[class*="screenReaderTurnHeading_"],[class*="visuallyHidden_"]',
        sent: sent ? {
          // by name: the text of a sent message in its expandable container - the same
          // class, same hash, in every build from 2.1.30 to 2.1.268 - and the plain div a
          // slash command with its arguments is shown in
          text: [EXP_BOX + ' ' + BODY, '[class*="slashCommandMessage_"]'],
          // and by what it is: the run the message's text is handed to dir="auto" in,
          // in every build from 2.1.220 on, where it occurs nowhere else in the bundle
          runs: true,
          // and never inside an answer, which has a lamp of its own. Named by the test id
          // every answer has carried since 2.1.59, which no restyle renames: the day
          // Claude Code hands an answer's paragraphs to dir="auto" too, the road above
          // would otherwise take each of them for a sent message
          not: ['[data-testid="assistant-message"]']
        } : null,
        composer: composer ? {
          container: IN_BOX,
          // by name, by role, by the label a screen reader announces, by the multi-line
          // flag that goes with that role, and by the attribute its placeholder is drawn
          // from. The last four are what the box IS, and have read the same in every build
          // from 2.0.50 to 2.1.268 - including the ones whose class names were minified
          // letters, where the first road did not exist at all. data-placeholder occurs
          // on this box and on nothing else in the bundle.
          input: [IN_TXT, '[contenteditable][role="textbox"]', '[aria-label="Message input"]',
                  '[contenteditable][aria-multiline="true"]', '[contenteditable][data-placeholder]'],
          // by name, and by what a copy of the text is: hidden from a screen reader, which
          // already hears the box itself. Several hidden things beside the box are told apart
          // by which of them is drawn over it.
          mirror: [IN_MIR, '[aria-hidden="true"]']
          // One direction for the whole box, and that is a decision rather than a gap.
          // A line of a draft is a newline character inside one text node, so an
          // element per line has to be made - and the only place to put one is inside
          // the mirror, which is React's. Both ways of doing that were built, shipped
          // and typed into:
          //
          //   0.3.0  made the elements in React's mirror. It threw React's own nodes
          //          away, the mirror stopped updating - the box typed blank spaces -
          //          and React's next removeChild took the whole panel down.
          //   0.3.3  left React's mirror alone and drew a clone of it. Safe, and
          //          still wrong: every keystroke reached the screen ONE KEYSTROKE
          //          LATE.
          //
          // Typing is what this box is for. So the composer takes one direction for
          // the whole of it, live, from any RTL letter - and a draft that mixes
          // languages goes right to left as a whole. A sent message does the same.
        } : null,
        // one message ends here, by name - and since 2.1.268 by the attribute Claude Code
        // puts on every message in the transcript, which no restyle renames
        boundary: '[class*="message_"],[data-transcript-message]',
        onDecision: function (block) {
          lamp("timelineDot", function () {
            mirrorTimeline();   // measure + install, once, before any row is marked
            return timelineDone && document.getElementById("smart-rtl-timeline") ? true : null;
          });
          markRow(block);       // this row's dot belongs on the right
        },
        onCleanup: undoTimeline
      });
      if (!running) {
        LAMPS.direction = "off - something is already running";
      } else {
        // the question only means anything while the answers' part is on
        if (needed) settleWhetherNeeded();
      }
    }

    // The escape hatch covers every circuit, whichever of them started, and it is honest
    // about itself: after it has been used, the status must not still claim that anything
    // is on. It used to leave the pinned message's listener behind, still putting the
    // reader back on their line after they had turned all of this off.
    {
      var release = typeof window.__bidiFixOff === "function" ? window.__bidiFixOff : null;
      window.__bidiFixOff = function () {
        for (var k in LAMPS) if (Object.prototype.hasOwnProperty.call(LAMPS, k)) {
          if (LAMPS[k].indexOf("on") === 0) LAMPS[k] = "off - turned off by hand";
        }
        try { if (pinnedPart && pinnedPart.stop) pinnedPart.stop(); } catch (e) {}
        running = null;
        return release ? release() : "off";
      };
    }
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
