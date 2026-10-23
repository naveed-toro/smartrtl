/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * Claude Code's chat webview, from 0.9.1: one thing and nothing else.
 *
 * THE DIRECTION OF TEXT, BY THE FORMULA ALONE
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
 * Until 0.9.0 this also carried a fix for a bug of Claude Code's own, a pinned message nobody
 * could read past. Claude Code fixed it in 2.1.307, and the fix came out. Section 55.
 *
 * In the webview console:
 *   __bidiStatus()   what the formula has tagged
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

    /* ------------------------------------------------------------------
       The direction of text, by the formula alone.
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
      return out;
    };

    {
      var release = typeof window.__bidiFixOff === "function" ? window.__bidiFixOff : null;
      window.__bidiFixOff = function () {
        try { if (direction) direction.stop(); } catch (e) {}
        direction = null;
        return release ? release() : "off";
      };
    }
  } catch (e) { /* never break the webview */ }
})();
/* ==== smart-rtl-direction patch END ==== */
