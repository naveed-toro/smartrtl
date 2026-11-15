/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * Qoder IDE: the AI chat, wherever it is drawn.
 *
 * Qoder draws its chat with React in the workbench page itself, not in a webview, and has no
 * direction handling of its own: every line inherits left-to-right. This hands the chat to the
 * shared engine, which hands every decision to the shared rule. Nothing here decides a direction.
 *
 *   an answer       .streaming-prose blocks (p, li, h*, td, th), and the thinking text
 *   the box         .chat-input-contenteditable that can be typed into
 *   a sent message  the same input component, drawn disabled (contenteditable="false") - the
 *                   engine's sent path leaves anything under [contenteditable] alone, so it is
 *                   given to the answer path as one more block
 *
 * A chat moved into its own window ("Move into New Window") is an about:blank window that the
 * workbench drives from here. window.open is wrapped so that each such window gets this same
 * function evaluated in its own realm; if the window swaps its document, the copy there is
 * restarted. Every step fails to "nothing happens".
 *
 * window.__smartRtlQoder.status() / .stop() in the developer tools.
 */
if (window.__smartRtlQoder) return;

var SENT = ".user-send-message-input .chat-input-contenteditable";
var config = {
  answers: {
    within: ".chat-message,.streaming-prose,.chat-thinking-item",
    blocks: SmartRTLDom.DEFAULT_BLOCKS + "," + SENT,
    skip: ".monaco-editor"
  },
  composer: {
    input: [
      '.chat-input-contenteditable[contenteditable="true"]:not(.user-send-message-input *)',
      '.chat-input-contenteditable[contenteditable="true"]'
    ],
    mirror: []
  }
};

var state = { engine: null, error: null };
function begin() {
  try {
    state.engine = SmartRTLDom.start(SmartRTL, config);
    if (!state.engine) state.error = "the shared engine did not start";
  } catch (e) { state.error = String((e && e.message) || e); }
}

/* ---------------- chats moved into their own window ---------------- */
var whole = smartRtlQoder; // the bundle's own function: rule, engine and this adapter
var children = [];
var nativeOpen = null;

function reach(child) {
  try {
    if (child.win.closed) return false;
    var doc = child.win.document;
    if (child.doc === doc && child.win.__smartRtlQoder) return true;
    // a new document in the same window: the old copy watches a page that is gone
    if (child.win.__smartRtlQoder) { try { child.win.__smartRtlQoder.stop(); } catch (e) {} }
    try { delete child.win.__smartRtlQoder; } catch (e) { child.win.__smartRtlQoder = undefined; }
    child.win.eval("(" + whole + ")()");
    child.doc = doc;
  } catch (e) {}
  return true;
}

function adopt(win) {
  try {
    if (!win || win === window) return;
    if (win.location.href !== "about:blank") return; // only the workbench's own windows
    for (var i = 0; i < children.length; i++) if (children[i].win === win) return;
    var child = { win: win, doc: null, timers: [] };
    children.push(child);
    var again = function () { reach(child); };
    again();
    [0, 50, 250, 1000, 3000].forEach(function (ms) { child.timers.push(setTimeout(again, ms)); });
    child.timers.push(setInterval(function () {
      if (!reach(child)) forget(child);
    }, 2000));
    try { win.addEventListener("DOMContentLoaded", again); win.addEventListener("load", again); } catch (e) {}
  } catch (e) {}
}

function forget(child) {
  child.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
  child.timers = [];
  var at = children.indexOf(child);
  if (at >= 0) children.splice(at, 1);
}

// Only the workbench and agents windows (vscode-file:) open chat windows; a copy inside one
// of those windows (about:) leaves window.open alone.
if (location.protocol === "vscode-file:") {
  try {
    nativeOpen = window.open;
    window.open = function () {
      var win = nativeOpen.apply(this, arguments);
      adopt(win);
      return win;
    };
  } catch (e) { nativeOpen = null; }
}

window.__smartRtlQoder = {
  status: function () {
    return {
      rule: "openingLetters, " + SmartRTL.OPENING_LETTERS + " letters",
      engine: state.engine ? state.engine.status() : null,
      error: state.error,
      page: location.protocol + (location.pathname.split("/").pop() || ""),
      chatWindows: children.map(function (c) {
        try { return c.win.__smartRtlQoder ? c.win.__smartRtlQoder.status() : "not reached"; }
        catch (e) { return "not reachable"; }
      })
    };
  },
  stop: function () {
    children.slice().forEach(function (c) {
      try { if (c.win.__smartRtlQoder) c.win.__smartRtlQoder.stop(); } catch (e) {}
      forget(c);
    });
    if (nativeOpen) { try { window.open = nativeOpen; } catch (e) {} nativeOpen = null; }
    if (state.engine) { try { state.engine.stop(); } catch (e) {} }
    state.engine = null;
    state.error = "stopped by hand";
  }
};

begin();
/* ==== smart-rtl-direction patch END ==== */
