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
 *   - a user message is wrapped in an expandable container that collapses at 60px and,
 *     once expanded, carries no height cap at all.
 *
 * Never touches code blocks, and never changes any text. Escape hatch:
 * run  __bidiFixOff()  in the webview console to neutralise it live.
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
    var WRAP = '[class*="contentWrapper_"]';
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
       like ordinary content. Nothing is capped, nothing is moved, no script runs.

       An expanded message is told apart from a merely short one by the collapse
       row, which exists only when expanded and only as a direct child.
    ------------------------------------------------------------------ */
    var UNPIN_CSS = STICKY + ":has(" + EXP_BOX + " > " + BTN_ROW + "){position:static}";

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

    function keepUnderTheEye(e) {
      if (!UNPIN_EXPANDED) return;
      try {
        var box = e.target && e.target.closest ? e.target.closest(EXP_BOX) : null;
        if (!box) return;
        var header = box.closest(STICKY) || box;
        var scroller = scrollParent(header);
        if (!scroller) return;

        var wasCollapsed = !!box.querySelector('[class*="collapsed_"]');
        var wasAt = header.getBoundingClientRect().top;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (!!box.querySelector('[class*="collapsed_"]') === wasCollapsed) return;
            // back to the exact pixel it occupied before the click. Not "the top
            // of the panel" - that would assume where the pin puts it, and the
            // container's own padding already makes that a guess.
            var drift = header.getBoundingClientRect().top - wasAt;
            if (drift) scroller.scrollTop += drift;
          });
        });
      } catch (err) {}
    }

    /* ------------------------------------------------------------------
       Hand the surface to the engine.

       The composer is two stacked layers: an invisible contenteditable you type
       into and a mirror that shows the text. Both are named here, and the engine
       flips them from the container they share, so the caret can never end up on
       one side while the glyph sits on the other.

       A user message's text is not a block - it is a bare span - so the body div
       that holds it is named as one. Without this the engine cannot see a user
       message at all, however much RTL is in it.

       boxSelector names the smallest thing that counts as "one message". An answer
       has a markdown root; a user message does not, so its content wrapper is named
       too. Both stop short of the buttons, which are siblings, so a decision can
       never reach them.
    ------------------------------------------------------------------ */
    SmartRTLDom.start(SmartRTL, {
      blocks: SmartRTLDom.DEFAULT_BLOCKS + ',' + EXP_BOX + ' ' + BODY,
      boxSelector: '[class*="root"],' + WRAP,
      composer: MIRROR_INPUT ? { container: IN_BOX, layers: [IN_TXT, IN_MIR], probe: IN_TXT } : null,
      extraCss: UNPIN_EXPANDED ? UNPIN_CSS : "",
      onDecision: function (block) {
        mirrorTimeline();   // measure + install, once, before any row is marked
        markRow(block);     // this row's dot belongs on the right
      },
      onCleanup: undoTimeline
    });

    if (UNPIN_EXPANDED) document.addEventListener("click", keepUnderTheEye, true);
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
