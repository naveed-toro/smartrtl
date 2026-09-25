/* ==== smart-rtl-direction patch BEGIN ==== */
/*
 * The adapter for claude.ai inside the Claude desktop app: only what is true of this page.
 * Which direction any text belongs to is the rule's (@smartrtl/core); when to ask and what
 * to do with the answer is the engine's (@smartrtl/dom). This file says where on the page
 * the answers, the box and the sent messages are - nothing else.
 *
 * Runs in the page, put there by hook.js in the app's main process. Built into
 * dist/payload.js by build/bundle-payload.js, which supplies SmartRTL and SmartRTLDom.
 */
  var direction = null;
  try {
    direction = SmartRTLDom.start(SmartRTL, {
      // an answer: every block of Claude's markdown - never the heading claude.ai hides
      // above a message for screen readers
      answers: {
        within: ".font-claude-response",
        skip: ".sr-only"
      },
      // the box, by what it is
      composer: {
        input: ['.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]'],
        mirror: ['[aria-hidden="true"]']
      },
      // a sent message: each of its lines, never inside an answer
      sent: {
        runs: '[data-testid="user-message"] p,[data-testid="user-message"] [dir="auto"]',
        not: ".font-claude-response"
      }
    });
  } catch (e) { direction = null; }

  window.__bidiStatus = function () {
    var out = { url: location.href };
    try { out.direction = direction ? direction.status() : "off - the engine did not start"; } catch (e) { out.direction = "off - " + e.message; }
    // what the page holds, so a report can say whether the adapter's places still exist
    try {
      var count = function (sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } };
      out.found = {
        answers: count(".font-claude-response"),
        userMessages: count('[data-testid="user-message"]'),
        composer: count('.ProseMirror[contenteditable="true"]') + count('[contenteditable="true"][role="textbox"]'),
        tagged: count("[data-bidi]"), taggedSent: count("[data-bidi-sent]"), taggedBox: count("[data-bidi-box]"),
        dirAuto: count('[dir="auto"]')
      };
    } catch (e) {}
    // Which element carries the page's own direction guess, for each list and paragraph in
    // an answer. The engine only adds data-bidi attributes and a stylesheet; the page's own
    // dir attributes are left as the page wrote them, so they can be read here. (Seen in
    // the original app, 2026-09-25: a whole list follows its FIRST item's first letter.)
    try {
      var ownDir = function (el) { return el.getAttribute("dir") || "-"; };
      var nearestDir = function (el) {
        for (var x = el.parentElement; x; x = x.parentElement) if (x.getAttribute("dir")) return x.tagName.toLowerCase() + "[dir=" + x.getAttribute("dir") + "]";
        return "none";
      };
      out.units = [];
      var units = document.querySelectorAll(".font-claude-response ul,.font-claude-response ol,.font-claude-response p");
      for (var u = 0; u < units.length && out.units.length < 12; u++) {
        var n = units[u], tag = n.tagName.toLowerCase();
        if (tag === "p" && n.closest("li")) continue;
        var entry = { tag: tag, dir: ownDir(n), inherits: nearestDir(n), text: (n.textContent || "").slice(0, 30) };
        if (tag !== "p") {
          var items = n.querySelectorAll(":scope > li");
          entry.items = items.length;
          entry.itemDirs = Array.prototype.map.call(items, ownDir).join(",");
        }
        out.units.push(entry);
      }
    } catch (e) { out.unitsError = String(e && e.message); }
    // where the page's Urdu actually sits: a few blocks holding right-to-left letters, each
    // with its ancestors' tags, classes and data-testids - so a view the adapter does not
    // know yet (the Code tab) can be learned from a report instead of guessed
    try {
      var rtl = /[؀-ۿ]/, seen = 0;
      out.samples = [];
      var all = document.querySelectorAll("p,li,h1,h2,h3,h4,td,th,div,span");
      for (var i = 0; i < all.length && seen < 8; i++) {
        var el = all[i], own = "";
        for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
        if (!rtl.test(own)) continue;
        seen++;
        var chain = [];
        for (var x = el, h = 0; x && x !== document.body && h < 9; x = x.parentElement, h++) {
          var d = x.tagName.toLowerCase();
          if (x.getAttribute("data-testid")) d += "[data-testid=" + x.getAttribute("data-testid") + "]";
          if (x.getAttribute("dir")) d += "[dir=" + x.getAttribute("dir") + "]";
          var cls = typeof x.className === "string" ? x.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
          if (cls) d += "." + cls;
          chain.push(d);
        }
        var cs = getComputedStyle(el);
        out.samples.push({ text: (el.textContent || "").slice(0, 40), style: cs.direction + " " + cs.unicodeBidi + " " + cs.textAlign, chain: chain });
      }
    } catch (e) { out.samplesError = String(e && e.message); }
    return out;
  };
/* ==== smart-rtl-direction patch END ==== */
