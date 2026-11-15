/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * Codex in VS Code: the panel's chat.
 *
 * Codex's panel is its own web app, the same one the Codex desktop app draws (see
 * apps/desktop-codex/src/codex-rtl-adapter.js, whose places this keeps). This hands it to the
 * shared engine, which hands every decision to the shared rule. Nothing here decides a direction.
 *
 *   an answer       every block (p, li, h*, td, th) in the app, by its own text - a block with no
 *                   RTL letter in it is left alone by the rule, so the app's own lists, menus and
 *                   labels in English are never touched
 *   the box         the ProseMirror box that can be typed into
 *   a sent message  the user's message, where Codex marks it as one
 *
 * Loaded by one async line in Codex's webview/index.html (src/page.js). It starts once the page
 * has loaded - Codex's own scripts first, while its host waits for them to report ready - and the
 * engine reads what is there by then and watches the page from then on.
 *
 * window.__smartRtlCodex.status() / .stop() in the webview's developer tools.
 */
if (window.__smartRtlCodex) return;

var USER = '[data-message-author-role="user"],[data-testid="user-message"]';
var config = {
  answers: {
    within: "#root",
    skip: 'nav,[role="navigation"],[role="dialog"],[role="menu"],[aria-hidden="true"],.sr-only'
  },
  composer: {
    input: ['.ProseMirror[contenteditable="true"][role="textbox"]', '.ProseMirror[contenteditable="true"]'],
    mirror: []
  },
  sent: {
    runs: '[data-message-author-role="user"] p,[data-message-author-role="user"] [dir="auto"],' +
      '[data-testid="user-message"] p,[data-testid="user-message"] [dir="auto"]',
    not: 'pre,code,[contenteditable="true"],[data-message-author-role="assistant"],[data-testid="assistant-message"]'
  }
};

var state = { engine: null, error: null };
function begin() {
  try {
    state.engine = SmartRTLDom.start(SmartRTL, config);
    if (!state.engine) state.error = "the shared engine did not start";
  } catch (e) { state.error = String((e && e.message) || e); }
}

window.__smartRtlCodex = {
  // Structure only: no message text, no draft, no account details.
  status: function () {
    var count = function (sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } };
    return {
      rule: "openingLetters, " + SmartRTL.OPENING_LETTERS + " letters",
      engine: state.engine ? state.engine.status() : null,
      error: state.error,
      page: location.protocol,
      found: {
        root: count("#root"),
        blocks: count("#root " + SmartRTLDom.DEFAULT_BLOCKS.split(",").join(",#root ")),
        box: count(config.composer.input[1]),
        userMessages: count(USER)
      }
    };
  },
  stop: function () {
    if (state.engine) { try { state.engine.stop(); } catch (e) {} }
    state.engine = null;
    state.error = "stopped by hand";
  }
};

if (document.readyState === "complete") setTimeout(begin, 0);
else window.addEventListener("load", function () { setTimeout(begin, 0); }, { once: true });
/* ==== smart-rtl-direction patch END ==== */
