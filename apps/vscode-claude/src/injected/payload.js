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
 * Never touches code blocks, and never changes any text. Escape hatch:
 * run  __bidiFixOff()  in the webview console to neutralise it live.
 */
;(function () {
  "use strict";
  try {
    var EXP_BOX = '[class*="expandableContainer_"]';
    var IN_BOX = '[class*="messageInputContainer_"]';
    var IN_TXT = '[class*="messageInput_"]';
    var IN_MIR = '[class*="mentionMirror_"]';
    var ROW_SEL = '[class*="timelineMessage_"]';

    /* Each of these can be turned off on its own without touching anything else. */
    var MIRROR_TIMELINE = true;   // put a message's dot on the side it reads from
    var MIRROR_INPUT = true;      // flip the box you type in
    var FIX_LONG_MESSAGE = true;  // keep "Show less" reachable on a long message

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
       Collapsing a long message used to throw you somewhere else: the block
       shrinks by thousands of pixels while the scroll offset stays where it was.
       Pin the message's own top instead, so collapsing brings you back to it.

       The sticky rule that keeps "Show less" on screen is handed to the engine as
       extraCss below; this is the other half, the part that needs an event.
    ------------------------------------------------------------------ */
    function anchorOnCollapse(e) {
      if (!FIX_LONG_MESSAGE) return;
      try {
        var btn = e.target && e.target.closest ? e.target.closest('[class*="collapseButton_"]') : null;
        if (!btn) return;
        var box = btn.closest(EXP_BOX);
        if (!box) return;
        var sc = box.parentElement;
        while (sc && sc !== document.body) {
          var oy = getComputedStyle(sc).overflowY;
          if ((oy === "auto" || oy === "scroll") && sc.scrollHeight > sc.clientHeight) break;
          sc = sc.parentElement;
        }
        if (!sc || sc === document.body) return;
        var scTop = sc.getBoundingClientRect().top;
        var before = box.getBoundingClientRect().top - scTop;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var after = box.getBoundingClientRect().top - sc.getBoundingClientRect().top;
            var target = before < 8 ? 8 : before;   // was it above the fold? bring it just into view
            sc.scrollTop += (after - target);
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

       Only a DIRECT child of the expandable container is the collapse row; the
       expand row sits deeper, inside the content wrapper.
    ------------------------------------------------------------------ */
    var engine = SmartRTLDom.start(SmartRTL, {
      boxSelector: '[class*="root"]',
      composer: MIRROR_INPUT ? { container: IN_BOX, layers: [IN_TXT, IN_MIR], probe: IN_TXT } : null,
      extraCss: FIX_LONG_MESSAGE
        ? EXP_BOX + ' > [class*="buttonContainer_"]{position:sticky;bottom:8px;z-index:2}'
        : "",
      onDecision: function (block) {
        mirrorTimeline();   // measure + install, once, before any row is marked
        markRow(block);     // this row's dot belongs on the right
      },
      onCleanup: undoTimeline
    });

    // start() answers null if a copy is already running, so a second injection
    // cannot stack a second listener on top of the first.
    if (engine && FIX_LONG_MESSAGE) document.addEventListener("click", anchorOnCollapse, true);
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
