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
 *
 * Never touches code blocks, and never changes any text.
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
    var SPLIT_SENT_MESSAGES = true;  // decide a SENT message line by line. The one thing
                                     // here that restructures somebody else's DOM - one
                                     // line to switch off, and it goes off alone.

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

    function keepUnderTheEye(e) {
      if (!UNPIN_EXPANDED) return;
      try {
        var box = e.target && e.target.closest ? e.target.closest(EXP_BOX) : null;
        if (!box) return;
        var header = box.closest(STICKY) || box;
        var scroller = scrollParent(header);
        if (!scroller) return;

        var wasCollapsed = !!box.querySelector('[class*="collapsed_"]');
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
            var nowCollapsed = !!box.querySelector('[class*="collapsed_"]');
            if (nowCollapsed === wasCollapsed) return;      // nothing toggled, nothing to do

            if (!nowCollapsed) {
              // OPENING. Keep the message under the eye, and keep the place the
              // reader is leaving, so that closing it can be the other half.
              if (anchor && anchorTop !== null) {
                readingPosition.set(box, { at: anchor, top: anchorTop });
              }
              var drift = header.getBoundingClientRect().top - target;
              if (drift) scroller.scrollTop += drift;
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
          });
        });
      } catch (err) {}
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
      try { if (running && running.status) out.engine = running.status(); } catch (e) {}
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
     * everything of ours comes straight back out through the same escape hatch a
     * person would use.
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
        try { if (running && running.stop) running.stop(); } catch (e) {}
      }

      var watcher = new MutationObserver(ask);
      var giveUp = setTimeout(function () {
        done = true;
        try { watcher.disconnect(); } catch (e) {}
      }, 60000);
      watcher.observe(document.documentElement, { childList: true, subtree: true });
      ask();
    }

    /**
     * Is a turn header still pinned?
     *
     * The unpinning rule exists for exactly that. If they stop pinning, or fix the
     * trap themselves, the rule must not stay behind arguing with them about
     * `position` - so it is asked of the live element, not assumed.
     */
    function headersAreStillPinned() {
      var el = document.querySelector(STICKY);
      if (!el) return null;
      return getComputedStyle(el).position === "sticky";
    }

    /* ------------------------------------------------------------------
       Hand the surface to the engine.

       The composer is two stacked layers: an invisible contenteditable you type
       into and a mirror that shows the text. Both are named here, and the engine
       flips them together from the container they share, so the caret can never end
       up on one side while the glyph sits on the other. Flipping is all that is done
       to them - no element of ours goes into either.

       A user message's text is not a block - it is a bare span - so the body div
       that holds it is named as one. Without this the engine cannot see a user
       message at all, however much RTL is in it.

       boxSelector names the smallest thing that counts as "one message". An answer
       has a markdown root; a user message does not, so its content wrapper is named
       too. Both stop short of the buttons, which are siblings, so a decision can
       never reach them.
    ------------------------------------------------------------------ */
    var needed = lamp("direction", function () {
      var still = faultIsStillHere();
      if (still === false) return false;
      return true;                       // true, or "nothing to measure yet" - carry on
    });

    var unpin = UNPIN_EXPANDED ? lamp("unpinExpandedMessage", function () {
      var pinned = headersAreStillPinned();
      if (pinned === null) return "on - no header rendered yet, the rule waits in the sheet";
      return pinned ? true : false;      // not pinned any more = nothing left to undo
    }) : false;

    var composer = MIRROR_INPUT ? lamp("composer", function () {
      // The composer is rendered long after this runs, so "not there yet" is not
      // "not there". Its listeners sit on the document, which is why that is fine.
      return true;
    }) : false;

    var split = SPLIT_SENT_MESSAGES ? lamp("splitSentMessages", function () {
      // The ONE thing here that restructures something somebody else rendered, and
      // named on its own so it can be switched off on its own - and so that anybody
      // reading this list knows which lamp to suspect first.
      return true;
    }) : lamp("splitSentMessages", function () { return "off - switched off in this build"; });

    if (needed) {
      running = SmartRTLDom.start(SmartRTL, {
        blocks: SmartRTLDom.DEFAULT_BLOCKS + ',' + EXP_BOX + ' ' + BODY,
        boxSelector: '[class*="root"],' + WRAP,
        composer: composer ? {
          container: IN_BOX, layers: [IN_TXT, IN_MIR], probe: IN_TXT
          // No per-line here, and that is a decision rather than a gap. A line of a
          // draft is a newline character inside one text node, so an element per line
          // has to be made - and the only place to put one is inside the mirror,
          // which is React's. Both ways of doing that were built, shipped and typed
          // into:
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
          // languages goes right to left as a whole. Per line is kept for the message
          // once it is SENT, where the lines are real elements and nobody is typing.
        } : null,
        boundary: '[class*="message_"]',
        // A user message is one element with newlines in it, so one decision would
        // govern every line of it. Split it: somebody writing Urdu and English a line
        // at a time is the whole reason this exists.
        perLine: split ? EXP_BOX + ' ' + BODY : null,
        extraCss: unpin ? UNPIN_CSS : "",
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
        settleWhetherNeeded();
        // The escape hatch should be honest about itself too: after it has been used,
        // the status must not still be claiming that everything is on.
        var release = window.__bidiFixOff;
        if (typeof release === "function") {
          window.__bidiFixOff = function () {
            for (var k in LAMPS) if (Object.prototype.hasOwnProperty.call(LAMPS, k)) {
              if (LAMPS[k].indexOf("on") === 0) LAMPS[k] = "off - turned off by hand";
            }
            running = null;
            return release();
          };
        }
      }
    }

    if (unpin) {
      lamp("keepTheViewOnTheMessage", function () {
        document.addEventListener("click", keepUnderTheEye, true);
        return true;
      });
    }
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
