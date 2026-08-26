/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * Text direction for RTL languages in the Claude Code chat webview.
 *
 * The problem it solves
 *   webview/index.css sets  unicode-bidi: plaintext  on p, li, h1..h6, blockquote, td, th.
 *   Each line therefore takes its direction from its FIRST strong character, so a line
 *   that opens with a Latin token renders left-to-right even when the rest is Urdu.
 *
 * Design
 *   1. ONE decision per message, never revised. Taken from the first finished block that
 *      carries an RTL word. Blocks written after that are born correct and cost nothing.
 *   2. The decision is applied by a single attribute + one CSS rule, not by touching
 *      each block from JavaScript. No getComputedStyle anywhere - it forces style
 *      recalculation and this code runs on every frame while an answer streams.
 *   3. Nothing is decided from a half-written block. A block counts only once it is
 *      final: another block follows it, or the stream has gone quiet.
 *   4. Every scope fallback shrinks, never grows. Picking too small a container only
 *      costs one extra decision; picking too large would drag a whole conversation
 *      into one direction.
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
 *
 * The rule itself is not here - it lives in @smartrtl/core, so the browser extension
 * and the desktop patch answer the same question the same way. The build step inlines
 * it, because this file is appended to someone else's bundle and cannot import.
 */
;(function () {
  "use strict";
  try {
    if (window.__bidiDirectionFix) return;
    window.__bidiDirectionFix = 1;

    var BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption";
    var QUIET_MS = 350;     // no changes for this long = the answer has stopped
    var MAX_BOX = 200;      // never claim a container bigger than this many blocks


    var style = document.createElement("style");
    style.id = "smart-rtl-direction";
    /* long user messages: keep the collapse control reachable (see FIX_LONG_MESSAGE below) */
    var FIX_LONG_MESSAGE = true;
    var EXP_BOX = '[class*="expandableContainer_"]';
    var IN_BOX = '[class*="messageInputContainer_"]';
    var IN_TXT = '[class*="messageInput_"]';
    var IN_MIR = '[class*="mentionMirror_"]';
    style.textContent =
      '[data-bidi="rtl"] :is(' + BLOCKS + '){direction:rtl!important;unicode-bidi:isolate!important}' +
      '[data-bidi="rtl"] :is(' + BLOCKS + ')[data-bidi="ltr"]{direction:ltr!important;unicode-bidi:isolate!important}' +
      /* the composer is two stacked layers: an invisible contenteditable you type into
         and a mirror that shows the text. One selector flips BOTH, so the caret can
         never end up on one side while the glyph sits on the other. */
      IN_BOX + '[data-bidi-input="rtl"] ' + IN_TXT + ',' +
      IN_BOX + '[data-bidi-input="rtl"] ' + IN_MIR + '{direction:rtl}' +
      /* A long message expands with no height cap at all, and "Show less" is a plain
         element placed after all of it - on a laptop it lands far below the fold.
         Only the row that is a DIRECT child of the expandable container is the collapse
         row; the expand row sits deeper, inside the content wrapper. */
      (FIX_LONG_MESSAGE
        ? EXP_BOX + ' > [class*="buttonContainer_"]{position:sticky;bottom:8px;z-index:2}'
        : '');
    (document.head || document.documentElement).appendChild(style);

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
    function boxOf(el) {
      var byClass = el.closest('[class*="root"]');
      if (byClass && usable(byClass)) return byClass;
      var x = el.parentElement, hops = 0;
      while (x && hops < 5 && x !== document.body && x !== document.documentElement) {
        if (x.querySelectorAll(BLOCKS).length >= 2 && usable(x)) return x;
        x = x.parentElement; hops++;
      }
      var p = el.parentElement;
      return usable(p) ? p : null;
    }

    function inspect(el) {
      if (!el || settledBlocks.has(el) || !el.isConnected) return;

      if (el.closest('[data-bidi="rtl"]')) {          // message already decided
        if (!isFinal(el)) { pending.add(el); return; }
        var t = el.textContent || "";
        // A block carrying no RTL text at all is left EXACTLY as the extension had it.
        // Forcing rtl on such a block gains nothing and can reorder content that was
        // already fine: "250-400ms" written with an en dash becomes "400ms-250".
        if (!SmartRTL.containsRtl(t)) el.setAttribute("data-bidi", "ltr");
        settledBlocks.add(el); pending.delete(el);
        return;
      }

      var text = el.textContent || "";
      if (!SmartRTL.containsRtlWord(text)) return;               // nothing to decide from yet
      if (!isFinal(el)) { pending.add(el); return; }  // still being written - do not guess

      var box = boxOf(el);
      if (box) {
        box.setAttribute("data-bidi", "rtl");   // <-- the one decision
        mirrorTimeline();                       // measure + install, once (before any row is marked)
        markRow(el);                            // this row's dot belongs on the right
      }
      settledBlocks.add(el); pending.delete(el);
    }

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

    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        push(r.target);
        if (r.addedNodes) for (var j = 0; j < r.addedNodes.length; j++) push(r.addedNodes[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    /* ------------------------------------------------------------------
       OPTIONAL: put each message's timeline dot on the side that message reads from.

       Purely decorative. Set MIRROR_TIMELINE to false and re-apply to drop it;
       nothing else in this file depends on it.

       Two separate decisions, on purpose:

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
    var MIRROR_TIMELINE = true;
    var ROW_SEL = '[class*="timelineMessage_"]';
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

    /* ------------------------------------------------------------------
       OPTIONAL: the box you type in.

       Same rule as everywhere else - an RTL word in the text means RTL - but here
       it is LIVE, not sticky: delete the Urdu and the box goes back to left, because
       an input must follow what is actually in it.

       The flag goes on the shared container, never on one layer, so the typing layer
       and the visible layer are physically unable to drift apart.

       Set MIRROR_INPUT to false and re-apply to drop this on its own.
    ------------------------------------------------------------------ */
    var MIRROR_INPUT = true;
    function syncComposer(node) {
      if (!MIRROR_INPUT) return;
      try {
        var input = node && node.closest ? node.closest(IN_TXT) : null;
        if (!input) return;
        var box = input.closest(IN_BOX) || input.parentElement;
        if (!box) return;
        // ONE letter is enough here, unlike the answer side which waits for a whole word.
        // A wrong guess in a box you are typing in costs one keystroke to undo; a wrong
        // guess in an answer stays until reload. So the box is allowed to be eager.
        if (SmartRTL.containsRtlLetter(input.textContent || "")) box.setAttribute("data-bidi-input", "rtl");
        else box.removeAttribute("data-bidi-input");
      } catch (e) {}
    }
    document.addEventListener("input", function (e) { syncComposer(e.target); }, true);
    document.addEventListener("focusin", function (e) { syncComposer(e.target); }, true);

    /* ------------------------------------------------------------------
       Collapsing a long message used to throw you somewhere else: the block
       shrinks by thousands of pixels while the scroll offset stays where it was.
       Pin the message's own top instead, so collapsing brings you back to it.
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
    document.addEventListener("click", anchorOnCollapse, true);

    window.__bidiFixOff = function () {
      var s = document.getElementById("smart-rtl-direction");
      if (s && s.parentNode) s.parentNode.removeChild(s);
      var t = document.getElementById("smart-rtl-timeline");
      if (t && t.parentNode) t.parentNode.removeChild(t);
      document.documentElement.removeAttribute("data-bidi-timeline");
      var rows = document.querySelectorAll("[data-bidi-row]");
      for (var k = 0; k < rows.length; k++) rows[k].removeAttribute("data-bidi-row");
      var boxes = document.querySelectorAll("[data-bidi-input]");
      for (var q = 0; q < boxes.length; q++) boxes[q].removeAttribute("data-bidi-input");
      var n = document.querySelectorAll("[data-bidi]");
      for (var i = 0; i < n.length; i++) n[i].removeAttribute("data-bidi");
      return "off";
    };

    push(document.body || document.documentElement);
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
