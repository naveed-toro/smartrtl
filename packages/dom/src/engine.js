/**
 * smartrtl / dom
 *
 * The engine. It watches a page, decides once per message which direction that
 * message belongs to, and applies the decision with one attribute and one CSS
 * rule.
 *
 * Everything in here is true of any surface that renders markdown into a page -
 * the Claude Code webview, an AI chat site in the browser, a markdown preview.
 * What is deliberately NOT in here: class names, timeline dots, collapse buttons,
 * anything that belongs to one product. Those arrive as configuration, so a new
 * surface costs an adapter of a few dozen lines instead of a second copy of this
 * file - which is the whole reason this package exists.
 *
 * The rule is not here either. It lives in @smartrtl/core and is passed in, so
 * every surface answers the same question the same way.
 *
 * The design, and the measurements behind each part of it, are in
 * docs/decisions.md. In short:
 *
 *   1. ONE decision per message, never revised. Taken from the first FINISHED
 *      block that carries an RTL word. Blocks written after it are born correct
 *      and cost nothing.
 *   2. Applied by an attribute plus one CSS rule, never by touching each block
 *      from JavaScript.
 *   3. Nothing is decided from a half-written block. A block counts only once
 *      another block follows it, or the stream has gone quiet.
 *   4. No getComputedStyle in the hot path - it forces a style recalculation, and
 *      this code runs on every batch of mutations while an answer streams. The pass
 *      itself happens before the browser paints, so a decision and the text it was
 *      taken from reach the screen together.
 *   5. Every scope fallback shrinks, never grows. Too small a container costs one
 *      extra decision; too large would drag a whole conversation into one
 *      direction.
 *   6. Nothing of ours is ever put inside somebody else's DOM. Attributes and
 *      stylesheets, and that is all. The one place that used to build elements - a
 *      sent message split into a line per element - is gone; see decisions.md
 *      section 34.
 *   7. Three circuits, not one: the box you type into, the message you sent, and the
 *      answer. Each has its own observers, its own stylesheet and its own status, and
 *      each is started inside its own guard. Nothing that goes wrong with one of them
 *      can reach another, and none of them decides anything in another's text.
 *      Sections 35 and 36.
 *   8. Each of the three asks the PAGE whether it is still needed, and takes itself out
 *      of the page if it is not. Two fixes for one fault fight each other, and the fight
 *      is invisible to whoever shipped either of them. Asked with the one text that tells
 *      the browser's rule and this one apart, and never with text that cannot. Section 39.
 *
 * Never changes any text, and never touches a block with no RTL character in it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmartRTLDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption";
  var DEFAULT_QUIET_MS = 350;   // no changes for this long = the answer has stopped
  var DEFAULT_MAX_BOX = 200;    // never claim a container bigger than this many blocks

  // An element that lays text out inline. A dir="auto" run that is one of these has no
  // line of its own, so its direction has to be set on the block it sits in.
  var INLINE = { SPAN: 1, B: 1, I: 1, EM: 1, STRONG: 1, A: 1, BDI: 1, LABEL: 1, SMALL: 1, MARK: 1 };

  /**
   * @param {object} rule  @smartrtl/core - containsRtl / containsRtlWord / containsRtlLetter
   * @param {object} [config]
   *   blocks       {string}   CSS selector for the blocks that carry text
   *   boxSelector  {string}   hint for "one message" - tried first when scoping a decision
   *   boundary     {string}   the ceiling a decision may never climb past, so one message's
   *                           answer cannot reach the message beside it
   *   skip         {string}   blocks the answers' part must never decide from, or decide -
   *                           text nobody can see, or text that has a lamp of its own
   *   sent         {object}   messages somebody sent, each decided as one piece, on a circuit
   *                           of its own - see startSent below:
   *                             text {string[]} the element holding a message's text, by name
   *                             runs {boolean}  every run the page hands to dir="auto" - the
   *                                             browser's first-strong-character guess - is
   *                                             one too. Needs no class name at all.
   *                             not  {string[]} where a sent message is never looked for:
   *                                             text that has a lamp of its own - an answer
   *   quietMs      {number}   silence after which a half-written block is treated as final
   *   maxBox       {number}   largest container, in blocks, a single decision may claim
   *   extraCss     {string}   rules the adapter wants in the same stylesheet
   *   composer     {object}   the box the user types into, or null. Each part is a LIST of
   *                           selectors, tried in order, so that a renamed class leaves the
   *                           next one standing - see startComposer below:
   *                             container {string}   the element the layers share, by name
   *                             input     {string[]} the layer holding the text and the caret
   *                             mirror    {string[]} layers drawn over it, if there are any
   *   onDecision   {function} (block, box) - called once, when a message is decided
   *   onCleanup    {function} () - called by the escape hatch, to undo the adapter's own work
   *
   * Every selector above is checked once, here, and one that the browser refuses switches
   * off only the part that needed it. Nothing in this file may fail in a way that reaches
   * the page it is a guest on.
   *
   * @returns {{stop, standDownBlocks, refresh, status}|null}  null if something is
   *   already running. standDownBlocks() takes back the block decisions and nothing else,
   *   for a page found to decide its own blocks correctly. status() reports what is
   *   watching, what is off, which way each stylesheet got in, and how many faults were
   *   caught and contained - because a fix that has quietly stopped working looks exactly
   *   like one that is working.
   */
  function start(rule, config) {
    var cfg = config || {};
    try {
      if (window.__bidiDirectionFix) return null;
      window.__bidiDirectionFix = 1;
    } catch (e) { return null; }

    /* Three circuits, each started inside its own guard, in the order people meet them:
       the box they type into, the message they sent, and the answer. If one of them
       cannot start on some future page, the others still do. */
    var composerPart = null;
    if (cfg.composer) {
      try { composerPart = startComposer(rule, cfg.composer); }
      catch (e) { composerPart = composerOff("off - " + ((e && e.message) || "it threw while starting")); }
    }
    var sentPart = null;
    if (cfg.sent) {
      // what a block is, even where the answers' part has been stood down: a sent message is
      // told from an answer by shape as well as by name, and shape does not stop being true
      // because one lamp is off
      var blocksAre = cfg.blocks === false ? DEFAULT_BLOCKS : (cfg.blocks || DEFAULT_BLOCKS);
      try { sentPart = startSent(rule, cfg.sent, cfg.onDecision, blocksAre); }
      catch (e) { sentPart = sentOff("off - " + ((e && e.message) || "it threw while starting")); }
    }
    var rest = null, restError = null;
    try { rest = startRest(rule, cfg); }
    catch (e) { rest = null; restError = (e && e.message) || "it threw while starting"; }

    /* Escape hatch. Run __bidiFixOff() in the console to neutralise it live. */
    function stop() {
      if (composerPart) { try { composerPart.stop(); } catch (e) {} }
      if (sentPart) { try { sentPart.stop(); } catch (e) {} }
      if (rest) { try { rest.stop(); } catch (e) {} }
      return "off";
    }
    try { window.__bidiFixOff = stop; } catch (e) {}

    return {
      stop: stop,
      standDownBlocks: function (why) { if (rest) rest.standDownBlocks(why); },
      refresh: function (node) { if (rest) rest.refresh(node); },
      status: function () {
        var s;
        try { s = rest ? rest.status() : null; } catch (e) { s = null; }
        if (!s) {
          var off = "off - " + (restError || "it did not start");
          s = { blocks: off, boxHint: "off", sheet: "off", contained: 0 };
        }
        var c = null;
        try { c = composerPart ? composerPart.status() : null; } catch (e) { c = null; }
        s.composer = c ? c.state : "off";
        if (c) {
          s.composerDetail = c;
          s.contained = (s.contained || 0) + (c.contained || 0);
        }
        var m = null;
        try { m = sentPart ? sentPart.status() : null; } catch (e) { m = null; }
        s.sent = m ? m.state : "off";
        if (m) {
          s.sentDetail = m;
          s.contained = (s.contained || 0) + (m.contained || 0);
        }
        return s;
      }
    };
  }

  /**
   * Is this element part of what a box you type into shows, rather than a message?
   *
   * A box can be drawn twice - an invisible editable layer, and a copy of its text drawn
   * over it - and the copy sits BESIDE the editable one, not inside it, so "never an
   * editor" alone did not keep the sent-message lamp out of it. Found by drawing a run the
   * browser decides by itself into that copy: the sent-message lamp marked it while the
   * draft had one line, left the mark there when a second arrived, and once the draft was
   * English again the copy read right to left over a caret that did not. The box you type
   * into has a lamp of its own; the one for sent messages stays out of it.
   *
   * How far up it looks is not the same for every caller, and getting that wrong is loud.
   * A run handed to dir="auto" is a span nested inside that copy, so it needs room: four.
   * A whole BLOCK is the copy own child and needs one hop. Given four, a block walks up
   * until it reaches a level where the box is a sibling - which on a real page it always
   * eventually is - and then answers yes about every paragraph on the page. Three tests
   * said so within a minute of it being written that way.
   *
   * @param {Element} el
   * @param {number} [within=4] how many levels up to look
   * @returns {boolean}
   */
  function besideAnEditor(el, within) {
    var reach = within || 4;
    for (var n = el, hops = 0; n && n.parentElement && hops < reach; n = n.parentElement, hops++) {
      for (var s = n.parentElement.firstElementChild; s; s = s.nextElementSibling) {
        if (s === n) continue;
        var ce = s.getAttribute("contenteditable");
        if ((ce !== null && ce !== "false") || s.tagName === "TEXTAREA") return true;
        if (s.querySelector(':scope > [contenteditable]:not([contenteditable="false"]), :scope > textarea')) return true;
      }
    }
    return false;
  }

  /**
   * Which side does this element draw the first character of its text on?
   *
   * The one honest way to ask a page whether it still has the fault. Not its stylesheet: a
   * rule can be renamed, moved, overridden or shipped in a second file, and a text search
   * lies in the expensive direction - it says the fault is gone when it is not. Where the
   * browser actually puts the first character cannot lie about what a reader will see.
   *
   * Asked of every layer that shows the same text, and they have to agree. That is the
   * instrument checking itself: the layer holding the caret is updated the instant a key
   * goes down, and the layer drawn over it belongs to the host and is a frame behind, so
   * while they disagree the two are looking at different drafts and neither answer is worth
   * having. A keystroke later they agree.
   *
   * @param {Element[]} layers
   * @returns {"rtl"|"ltr"|null} null means nothing can be told yet - ask again later
   */
  function readsFrom(layers) {
    var seen = null;
    for (var i = 0; i < layers.length; i++) {
      var one = sideOf(layers[i]);
      if (one === null) continue;                 // that layer has nothing laid out
      if (seen === null) seen = one;
      else if (seen !== one) return null;         // they disagree: different drafts
    }
    return seen;
  }

  /** One element, one answer. */
  function sideOf(el) {
    try {
      var box = el.getBoundingClientRect();
      if (!box.width) return null;
      var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      for (var t = walk.nextNode(); t; t = walk.nextNode()) {
        var text = String(t.nodeValue || "");
        var at = text.search(/\S/);              // a space has no side of its own
        if (at < 0) continue;
        var r = document.createRange();
        r.setStart(t, at);
        r.setEnd(t, at + 1);
        var first = r.getBoundingClientRect();
        if (!first.width && !first.height) return null;
        // and the character has to be inside the box it was measured against, or something
        // nobody modelled is going on - a transform, a scrolled overflow - and the answer
        // would be arithmetic rather than a measurement
        if (first.left < box.left - 1 || first.right > box.right + 1) return null;
        return (first.left - box.left) > box.width / 2 ? "rtl" : "ltr";
      }
      return null;
    } catch (e) { return null; }
  }

  /**
   * One of our own stylesheets, first in the page, so that the cascade layer in it is the
   * first one declared - and if the page refuses a style element, a constructed sheet
   * instead. Shared by the parts that live in layers; each part gets its own, so that one
   * part's sheet being refused or removed is that part's business alone.
   *
   * Every road inside it is guarded, and the whole of it is guarded again from out here:
   * this is the one piece of code the box you type into, a sent message and an adapter's own
   * circuit all share, so a fault in it is the one fault that could dim three lamps at once.
   * It cannot. A circuit handed the sheet below goes on running, marks nothing that can be
   * seen, and reports its sheet as off - and its own read-back then says it is not working,
   * which is exactly what it is.
   *
   * @returns {{keep: function, remove: function, road: function, into: function}}
   */
  function layeredSheet(id, css, fault) {
    try { return buildSheet(id, css, fault); }
    catch (e) {
      try { fault(e); } catch (x) {}
      return deadSheet("off - the stylesheet could not be built");
    }
  }

  /** A sheet that is not there, and says so to anything that asks. */
  function deadSheet(why) {
    return {
      road: function () { return why; },
      keep: function () {},
      into: function () {},
      remove: function () {},
      roots: function () { return []; }
    };
  }

  function buildSheet(id, css, fault) {
    var el = null, adopted = null, road = "off - not installed yet", shadows = [];
    function head() { return document.head || document.documentElement; }
    try {
      el = document.createElement("style");
      el.id = id;
      el.textContent = css;
      head().insertBefore(el, head().firstChild);
      var took = false;
      try { took = !!(el.sheet && el.sheet.cssRules && el.sheet.cssRules.length); } catch (e) {}
      if (took) road = "style element, first in the page";
      else { if (el.parentNode) el.parentNode.removeChild(el); el = null; }
    } catch (e) { fault(e); el = null; }
    if (!el) {
      try {
        adopted = new CSSStyleSheet();
        adopted.replaceSync(css);
        document.adoptedStyleSheets = [adopted].concat(Array.prototype.slice.call(document.adoptedStyleSheets));
        road = "adopted - the page refused a style element";
      } catch (e) {
        adopted = null;
        road = "off - the page refused every way of adding a stylesheet";
      }
    }
    return {
      road: function () { return road; },
      /** If the page took it away, it goes back. One property read in the ordinary case. */
      keep: function () {
        if (el) {
          if (!el.isConnected) head().insertBefore(el, head().firstChild);
        } else if (adopted && Array.prototype.indexOf.call(document.adoptedStyleSheets, adopted) < 0) {
          document.adoptedStyleSheets = [adopted].concat(Array.prototype.slice.call(document.adoptedStyleSheets));
        }
      },
      /** A shadow root is out of reach of both; it gets a sheet of its own. */
      into: function (root) {
        for (var i = 0; i < shadows.length; i++) if (shadows[i].root === root) return;
        var s = new CSSStyleSheet();
        s.replaceSync(css);
        root.adoptedStyleSheets = [s].concat(Array.prototype.slice.call(root.adoptedStyleSheets || []));
        shadows.push({ root: root, sheet: s });
      },
      remove: function () {
        for (var i = 0; i < shadows.length; i++) {
          var entry = shadows[i];
          try {
            entry.root.adoptedStyleSheets = Array.prototype.filter.call(entry.root.adoptedStyleSheets,
              function (x) { return x !== entry.sheet; });
          } catch (e) {}
        }
        shadows = [];
        try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
        try {
          if (adopted) {
            document.adoptedStyleSheets = Array.prototype.filter.call(document.adoptedStyleSheets,
              function (x) { return x !== adopted; });
          }
        } catch (e) {}
        el = null; adopted = null;
      },
      roots: function () { return shadows.map(function (s) { return s.root; }); }
    };
  }

  /* =======================================================================
     THE BOX YOU TYPE INTO - a lamp on a circuit of its own.

     ONE direction for the whole box, live, from any RTL letter in it, set by one
     attribute and one CSS rule. Nothing of ours goes inside it, and nothing of ours
     runs between a key going down and the frame being painted except that one
     attribute. That is not a first attempt: it is what is left after three goes at
     doing better. Sections 25 to 28 of decisions.md have what ended each of them -
     the box typed blank spaces, the panel came down, and every keystroke reached the
     screen one keystroke late - and section 34 why it stops there.

     What this part is built around is the NEXT update, and the one after that.

     Ten months of Claude Code were downloaded and booted with this in them, from
     2.0.50 to 2.1.268, and the box changed three times underneath it:

       - the class names went from minified letters to hashed names
       - a second layer appeared, drawn over the box, and the box itself became
         invisible: caret only, every glyph anybody reads is in the layer over it
       - 2.1.267 put unicode-bidi:plaintext on both layers, and a rule that set
         only `direction` went dead without a single error

     Through all three, what the box IS never changed once: role=textbox, the
     label "Message input", aria-multiline, data-placeholder, contenteditable. So:

       FOUND BY WHAT IT IS. Each description the adapter gives is a separate road,
       and the first road that finds the box wins. A rename closes one road; the
       box is still found by what it is for, which a restyle does not change.

       THE RULES NAME NOTHING OF THE HOST'S. JavaScript finds the layers and marks
       each one; the stylesheet speaks only of our own two attributes. Nothing in
       it can go stale when the page is restyled, and nothing in it can be refused.

       NO STYLESHEET CAN OVERRULE IT. The rules live in a cascade layer declared
       before any of the page's, and every declaration is !important. An important
       declaration in an earlier layer beats every later layer AND every unlayered
       rule, whatever its specificity and wherever it sits in the page. 2.1.267 won
       by adding one property; had it added `!important` to it, or moved its styles
       into layers, the rule of 0.5.0 would have lost again. Only an inline
       !important from script could beat this, and that is not how React styles.

       THE CARET AND THE LETTERS CANNOT PART. The layer holding the caret is plain
       text, so inside a turned layer nothing may decide a direction of its own:
       any dir, bdi or plaintext the host might one day put on a span inside the
       layer people read is held to the layer's direction, as the caret's text is.
       Checked against every build above: today it changes nothing at all.

       IT FAILS TO NOTHING. A fault while handling a box takes that box's direction
       back out, so its layers go back to the host's rendering together. And after
       it turns a box it reads the page back: if only some of the layers took the
       direction, it takes it back from all of them and says why.

       IT CANNOT BE REACHED FROM OUTSIDE ITS CIRCUIT. Its own listeners, its own
       observers - one to find boxes as they are added, one on each box it has
       found - its own stylesheet, and its own status.
  ======================================================================= */

  var TURN = "data-bidi-input";   // on the element the layers share: "rtl", or absent
  var LAYER = "data-bidi-layer";  // on every layer that turns with it: "input" or "over"
  var RECHECK_MS = 250;           // how soon a box that could not be turned is looked at again
  var XHTML = "http://www.w3.org/1999/xhtml";

  // Whatever it is labelled, one of these is not a layer of text.
  var NOT_TEXT = { IMG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, BUTTON: 1, INPUT: 1,
                   SELECT: 1, TEXTAREA: 1, OBJECT: 1, EMBED: 1, PICTURE: 1 };

  var COMPOSER_CSS = "@layer smartrtl-composer{" +
    "[" + TURN + '="rtl"] [' + LAYER + "]{direction:rtl!important;unicode-bidi:isolate!important;text-align:start!important}" +
    "[" + TURN + '="rtl"] [' + LAYER + "] *{direction:inherit!important;unicode-bidi:normal!important;text-align:inherit!important}" +
    "}";

  /** A composer part that never started, and says why. */
  function composerOff(why) {
    return {
      stop: function () { return "off"; },
      status: function () { return { state: why, found: "not yet", boxes: 0, sheet: "off", contained: 0, lastFault: "" }; }
    };
  }

  /**
   * @param {object} rule  @smartrtl/core
   * @param {{container: string, input: string[], mirror: string[]}} spec
   * @returns {{stop: function, status: function}}
   */
  function startComposer(rule, spec) {
    var stopped = false, faults = 0, lastFault = "";
    var state = "on - waiting for the box to appear";
    // null = never measured. true = the page still reads a mixed draft the wrong way round.
    // false = it does not, and this circuit takes itself out of the page. See askThePage.
    var needed = null;
    // What the headline is allowed to claim. Not attempts - the commonest attempt of all is
    // an empty draft, which succeeds at doing nothing - but whether a box has ever actually
    // been turned. See status().
    var everTurned = false;
    var unmatched = false;      // something editable was typed into that matched no description
    var recs = [];              // one per box found: { box, input, overs, observer, ... }

    function fault(e) {
      faults++;
      try { lastFault = String((e && e.message) || e).slice(0, 200); } catch (x) {}
    }
    function listOf(x) { return Array.isArray(x) ? x.slice() : x ? [x] : []; }
    function usable(sel) {
      if (!sel || typeof sel !== "string") return false;
      try { document.querySelector(sel); return true; } catch (e) { return false; }
    }

    // Each description is asked once whether the browser accepts it at all. One that it
    // does not is dropped here, rather than throwing on every keystroke for ever.
    var CONTAINER = usable(spec.container) ? spec.container : null;
    var INPUTS = listOf(spec.input).filter(usable);
    var OVERS = listOf(spec.mirror).filter(usable);
    if (!INPUTS.length) return composerOff("off - no description of the box you type into was usable");
    var ANY_INPUT = INPUTS.join(",");

    /* ------------------------------------------------------------------
       The stylesheet: first in the page, so that its layer is the first one
       declared. A page whose style-src refuses a style element added from
       script still accepts a constructed one, so that road is taken if the
       first is shut - and the status says which. A box inside a shadow root
       is out of reach of both, so it is given a sheet of its own. See
       layeredSheet; it is made just before anything is listened to.
    ------------------------------------------------------------------ */
    var sheet = null;

    /* ------------------------------------------------------------------
       Finding the box, by every description at once.
    ------------------------------------------------------------------ */
    function elementOf(node) {
      if (!node) return null;
      if (node.nodeType === 3) return node.parentElement;
      return node.nodeType === 1 ? node : null;
    }

    /** Somewhere text is typed. A label on anything else is not a box you type into. */
    function editable(el) {
      if (!el || el.nodeType !== 1) return false;
      var ce = el.getAttribute("contenteditable");
      if (ce !== null && ce !== "false") return true;
      var tag = el.tagName;
      return tag === "TEXTAREA" || (tag === "INPUT" && /^(text|search)?$/i.test(el.getAttribute("type") || ""));
    }

    /** Which road finds this element, or -1. */
    function roadOf(el) {
      if (!editable(el)) return -1;
      for (var r = 0; r < INPUTS.length; r++) if (el.matches(INPUTS[r])) return r;
      return -1;
    }

    /** The box, if this element is it or is inside it. */
    function inputAbove(el) {
      for (var r = 0; r < INPUTS.length; r++) {
        var hit = el.closest(INPUTS[r]);
        if (hit && editable(hit)) return { el: hit, road: r };
      }
      return null;
    }

    /** The box, if it is this element or somewhere inside it - on the best road there is. */
    function inputUnder(root) {
      if (!root || !root.querySelectorAll) return null;
      for (var r = 0; r < INPUTS.length; r++) {
        if (root.matches && root.matches(INPUTS[r]) && editable(root)) return { el: root, road: r };
        var all = root.querySelectorAll(INPUTS[r]);
        for (var i = 0; i < all.length; i++) if (editable(all[i])) return { el: all[i], road: r };
      }
      return null;
    }

    /** From whatever was touched - the box, the container around it, the layer over it. */
    function inputFrom(node) {
      var el = elementOf(node);
      if (!el || !el.closest) return null;
      var hit = inputAbove(el);
      if (hit) return hit;
      var scope = CONTAINER ? el.closest(CONTAINER) : null;
      if (scope) return inputUnder(scope);
      for (var r = 0; r < OVERS.length; r++) {
        var over = el.closest(OVERS[r]);
        var parent = over && over.parentElement;
        if (!parent) continue;
        for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
          if (c === over) continue;
          var road = roadOf(c);
          if (road >= 0) return { el: c, road: road };
        }
      }
      return null;
    }

    function textLayer(c, input) {
      return c !== input && !c.contains(input) && !input.contains(c) &&
             c.namespaceURI === XHTML && !NOT_TEXT[c.tagName];
    }

    /** Of several candidates, the ones actually drawn over the box: most of its area covered. */
    function drawnOver(list, input) {
      if (!list.length) return [];
      var b = input.getBoundingClientRect(), area = b.width * b.height, out = [];
      if (!area) return [];                       // not laid out: nothing can be told apart yet
      for (var i = 0; i < list.length; i++) {
        var o = list[i].getBoundingClientRect();
        var w = Math.min(b.right, o.right) - Math.max(b.left, o.left);
        var h = Math.min(b.bottom, o.bottom) - Math.max(b.top, o.top);
        if (w > 0 && h > 0 && w * h >= area / 2) out.push(list[i]);
      }
      return out;
    }

    /**
     * The layers drawn over the box, which have to turn with it.
     *
     * Every road is asked, and what they find is put together, so that a layer the host
     * adds one day beside the one it has now turns too. A single candidate beside the box
     * is taken at its word, as it always was. Several beside it, or any deeper inside the
     * container, are taken only if they are drawn over the box: a copy of its text covers
     * the box it copies, and an icon does not.
     */
    function oversFor(box, input) {
      var out = [], firstRoad = -1;
      for (var r = 0; r < OVERS.length; r++) {
        var all = box.querySelectorAll(OVERS[r]), beside = [], deeper = [];
        for (var i = 0; i < all.length; i++) {
          if (!textLayer(all[i], input)) continue;
          (all[i].parentElement === input.parentElement ? beside : deeper).push(all[i]);
        }
        var got = (beside.length === 1 ? beside : drawnOver(beside, input)).concat(drawnOver(deeper, input));
        for (var k = 0; k < got.length; k++) {
          if (out.indexOf(got[k]) < 0) { out.push(got[k]); if (firstRoad < 0) firstRoad = r; }
        }
      }
      return { list: out, road: firstRoad };
    }

    /** With nothing drawn over it, the box itself is what people read - if they can see it. */
    function visible(input) {
      var cs = getComputedStyle(input);
      if (clear(cs.color) || clear(cs.webkitTextFillColor) || cs.visibility === "hidden" || cs.opacity === "0") {
        return "off - the box you type into is invisible, and the layer drawn over it was not found";
      }
      return true;
    }
    /**
     * Is this colour see-through? Only the alpha may be asked. The first version of this
     * read the last number in the string, and in `rgb(0, 0, 0)` that is the blue: black
     * text was taken for invisible, and a box with nothing drawn over it was refused.
     */
    function clear(c) {
      if (!c) return false;
      if (c === "transparent") return true;
      var m = /^rgba\(([^)]*)\)$/.exec(c);
      if (m) { var parts = m[1].split(","); return parts.length === 4 && parseFloat(parts[3]) === 0; }
      return /\/\s*0(\.0*)?%?\s*\)\s*$/.test(c);     // colour(... / 0), oklch(... / 0) and the like
    }

    /* ------------------------------------------------------------------
       One record per box found, watched from the box itself.
    ------------------------------------------------------------------ */
    function recOf(node) {
      var el = elementOf(node);
      if (!el) return null;
      for (var i = 0; i < recs.length; i++) if (recs[i].box === el || recs[i].box.contains(el)) return recs[i];
      return null;
    }

    function adopt(hit) {
      var input = hit.el, parent = input.parentElement;
      if (!parent) return null;
      var box = (CONTAINER && parent.closest(CONTAINER)) || parent;
      var rec = { box: box, input: input, road: hit.road, parent: parent, kids: box.childElementCount,
                  overs: [], overRoad: -1, verdict: null, checkedAt: 0, split: null, dirty: false, observer: null };
      look(rec);
      recs.push(rec);
      watch(rec);
      return rec;
    }

    /** Which layers turn with this box, and whether it can be turned at all. */
    function look(rec) {
      var found = oversFor(rec.box, rec.input);
      for (var i = 0; i < rec.overs.length; i++) if (found.list.indexOf(rec.overs[i]) < 0) unmark(rec.overs[i]);
      rec.overs = found.list;
      rec.overRoad = found.road;
      rec.kids = rec.box.childElementCount;
      rec.verdict = rec.overs.length ? true : visible(rec.input);
      rec.checkedAt = Date.now();
    }

    /* Text reaches the box in more ways than typing - Claude Code empties it itself
       after a send, and puts text in from code for history, completions and forks -
       so the box is watched, not only listened to. From the box itself, so that
       while an answer streams elsewhere on the page none of this is asked anything. */
    function watch(rec) {
      try {
        rec.observer = new MutationObserver(function (records) {
          // An element arriving anywhere in the box except inside the layers already known
          // - a new layer put inside a wrapper, say - means the box has to be looked at
          // again, even though its own children are the same ones they were.
          try {
            for (var i = 0; i < records.length && !rec.dirty; i++) {
              var added = records[i].addedNodes;
              for (var j = 0; j < added.length; j++) {
                if (added[j].nodeType === 1 && !rec.input.contains(added[j]) && !inOvers(rec, added[j])) { rec.dirty = true; break; }
              }
            }
          } catch (e) { fault(e); rec.dirty = true; }
          sync(rec);
        });
        rec.observer.observe(rec.box, { childList: true, characterData: true, subtree: true });
      } catch (e) { fault(e); rec.observer = null; }
      try {
        var root = rec.box.getRootNode ? rec.box.getRootNode() : null;
        if (root && root !== document && root.nodeType === 11 && root.host) sheet.into(root);
      } catch (e) { fault(e); }
    }

    function forget(rec) {
      try { if (rec.observer) rec.observer.disconnect(); } catch (e) {}
      rec.observer = null;
      var i = recs.indexOf(rec);
      if (i >= 0) recs.splice(i, 1);
    }

    function inOvers(rec, n) {
      for (var i = 0; i < rec.overs.length; i++) if (rec.overs[i] === n || rec.overs[i].contains(n)) return true;
      return false;
    }

    /** Is the box still the shape it was found in? If not, it is found again. */
    function intact(rec) {
      if (rec.dirty) return false;
      if (!rec.input.isConnected || rec.input.parentElement !== rec.parent || !rec.box.contains(rec.input)) return false;
      if (rec.box.childElementCount !== rec.kids) return false;
      for (var i = 0; i < rec.overs.length; i++) if (!rec.box.contains(rec.overs[i])) return false;
      return true;
    }

    function textOf(el) {
      return el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? String(el.value || "") : String(el.textContent || "");
    }

    function mark(el, what) { if (el.getAttribute(LAYER) !== what) el.setAttribute(LAYER, what); }
    function unmark(el) { if (el && el.hasAttribute && el.hasAttribute(LAYER)) el.removeAttribute(LAYER); }

    function turn(rec) {
      mark(rec.input, "input");
      for (var i = 0; i < rec.overs.length; i++) mark(rec.overs[i], "over");
      if (rec.box.getAttribute(TURN) !== "rtl") {
        rec.box.setAttribute(TURN, "rtl");       // <-- the one decision, and every layer turns with it
        measureSoon(rec);
      }
    }

    function unturn(rec) {
      if (rec.box.hasAttribute(TURN)) rec.box.removeAttribute(TURN);
      unmark(rec.input);
      for (var i = 0; i < rec.overs.length; i++) unmark(rec.overs[i]);
    }

    /* ------------------------------------------------------------------
       Which way the box reads, right now.

       LIVE rather than sticky: delete the RTL text and it goes back to left,
       because an input must show what is actually in it. And eager rather than
       careful - ONE letter is enough, because a wrong guess here costs a single
       keystroke to undo, while a wrong guess in an answer stays until reload.
    ------------------------------------------------------------------ */
    function sync(rec, again) {
      if (stopped || !rec) return;
      try {
        if (!rec.box.isConnected) { forget(rec); return; }
        if (!intact(rec)) {
          // The host rebuilt part of it. What is there now is found from scratch, in
          // the same pass, so a turned box is never painted half turned.
          var box = rec.box;
          unturn(rec);
          forget(rec);
          var hit = again ? null : inputUnder(box);
          if (hit && !recOf(hit.el)) sync(adopt(hit), true);
          return;
        }
        if (rec.verdict !== true && Date.now() - rec.checkedAt >= RECHECK_MS) look(rec);
        if (rec.split) { unturn(rec); state = rec.split; return; }
        if (rec.verdict !== true) { unturn(rec); state = rec.verdict; return; }
        // A box that can be turned again after it could not, starts again unmeasured. A box
        // that was measured NOT working keeps saying so until it is measured again - which
        // it once was not: the next keystroke reset it, and the one report that mattered
        // was on the status for a single letter.
        if (state.indexOf("off") === 0 || state.indexOf("on - waiting") === 0) state = "on - not measured yet";
        sheet.keep();
        var draft = textOf(rec.input);
        if (!rule.containsRtlLetter(draft)) { unturn(rec); return; }
        if (needed === null && askingLater(rec, draft)) return;
        if (needed === false) { standDown(); return; }
        turn(rec);
        everTurned = true;
      } catch (e) {
        fault(e);
        // A box this could not finish with is given back to the page as it had it - all
        // of its layers together, so the caret and the letters stay in the same place.
        try { unturn(rec); } catch (x) {}
      }
    }

    /* ------------------------------------------------------------------
       Is this box still ours to turn?

       Two fixes for one fault fight each other, and the fight is invisible to whoever
       shipped either of them. The answers' part has been asked this since the beginning -
       it puts a probe in the page and reads it back. The box could not be asked the same
       way: a probe is a copy, and a copy of a box nobody types into says nothing about the
       box people do type into. So the REAL box is asked, with the one draft that can tell
       the two rules apart.

       A draft that opens in Latin and turns right-to-left is the fault, written as a
       string. The browser's own rule - first strong character - reads it left to right;
       this rule reads it right to left. So where the page draws its first character is the
       whole answer, and it is asked before anything of ours is on the box, so that our own
       stylesheet cannot answer our own question.

       A pure Urdu draft is not asked with, and that exclusion is the whole reliability of
       this: the browser reads pure Urdu right to left whether the fault is there or not, so
       measuring with one would report "fixed" on every build ever shipped.
    ------------------------------------------------------------------ */
    var asked = 0, askTimer = null;
    var ASK_AT_MOST = 3;

    /**
     * Asked AFTER the frame, never during a keystroke - and this is the one thing in here
     * that nothing else was allowed to teach us twice.
     *
     * Reading where the page put a character forces style and layout. In the middle of a
     * keystroke that is the most expensive thing this file can do: measured on Claude Code's
     * own panel, the one keystroke it landed on cost 6 to 11ms against 2ms for the keystrokes
     * either side of it - a third of a frame, on the single place in this whole project where
     * no cost at all is acceptable. After the frame the browser has already laid the page out,
     * so the identical read is free.
     *
     * requestAnimationFrame is not the place either: that runs BEFORE the frame's layout, so
     * the read would force it again. A timeout queued from inside a frame callback runs after
     * that frame has been drawn, with nothing left pending, which is what this does.
     *
     * What it costs: on the keystroke where Urdu first follows Latin, and only there, the box
     * turns one frame later than it used to. Once per page. Against a keystroke somebody can
     * feel, that is the right way round.
     *
     * @returns {boolean} true while the answer is still being waited for - nothing is turned
     */
    function askingLater(rec, draft) {
      if (!rule.tellsThemApart(draft)) return false;        // this draft cannot answer it
      if (rec.box.getAttribute(TURN) === "rtl") return false;  // our own doing would be measured
      if (asked >= ASK_AT_MOST) return false;               // asked enough: carry on as needed
      if (askTimer) return true;                            // already waiting for the answer
      askTimer = requestAnimationFrame(function () {
        askTimer = setTimeout(function () {
          askTimer = null;
          if (stopped) return;
          asked++;
          // whichever boxes are there NOW - the one this was scheduled for may have been
          // rebuilt by the host in the meantime, and a question tied to it would go with it
          var boxes = recs.slice();
          for (var i = 0; i < boxes.length && needed === null; i++) {
            try {
              var side = readsFrom([boxes[i].input].concat(boxes[i].overs));
              if (side) needed = side === "ltr";
            } catch (e) { fault(e); }
          }
          for (var j = 0; j < boxes.length; j++) {
            if (recs.indexOf(boxes[j]) >= 0) sync(boxes[j]);   // and act on what it said
          }
        }, 0);
      });
      return true;
    }

    /**
     * Out of the page, and only this circuit.
     *
     * A page that draws a mixed draft correctly has said nothing whatsoever about what it
     * does with a message somebody sent, or with an answer. Those are different questions
     * on different circuits, and each is asked its own.
     */
    function standDown() {
      stop("not needed - the page reads a mixed draft correctly by itself");
    }

    /* ------------------------------------------------------------------
       Did the page take it? Read back once after each turn - not on every
       keystroke - and after the frame, so nothing is forced while typing.
    ------------------------------------------------------------------ */
    var measureTimer = null, measureQueue = [];
    function measureSoon(rec) {
      if (measureQueue.indexOf(rec) < 0) measureQueue.push(rec);
      if (measureTimer) return;
      measureTimer = setTimeout(function () {
        measureTimer = null;
        var list = measureQueue;
        measureQueue = [];
        if (stopped) return;
        for (var i = 0; i < list.length; i++) {
          try { measure(list[i]); }
          catch (e) { fault(e); try { unturn(list[i]); } catch (x) {} }
        }
      }, 0);
    }

    function measure(rec) {
      // Only a box still being looked after is measured. A record the host has rebuilt out
      // from under it still names the old layers, and read back they look like layers that
      // disagree - which once took the direction back from the healthy box that replaced it.
      if (recs.indexOf(rec) < 0 || !intact(rec)) return;
      if (!rec.box.isConnected || rec.box.getAttribute(TURN) !== "rtl") return;
      var layers = [rec.input].concat(rec.overs), seen = [];
      for (var i = 0; i < layers.length; i++) {
        var cs = getComputedStyle(layers[i]);
        seen.push(cs.direction + ", " + cs.unicodeBidi + ", " + cs.textAlign);
      }
      for (var k = 1; k < seen.length; k++) {
        if (seen[k] !== seen[0]) {
          // The layers do not agree. The caret would sit in one place and the letter it
          // is about to write in another - worse than not turning at all. So none of them
          // is turned, until the box changes shape and can be asked again.
          rec.split = "off - the layers of the box did not all take the direction, so none of them is turned (" +
                      seen.join(" / ") + ")";
          unturn(rec);
          state = rec.split;
          return;
        }
      }
      var cs0 = seen[0].split(", ");
      state = cs0[0] === "rtl" && cs0[1] !== "plaintext" && !/^(-webkit-)?left$|^end$/.test(cs0[2])
        ? "on - measured working"
        : "not working - the direction was set and the page did not take it (" + seen[0] + ")";
    }

    /* ------------------------------------------------------------------
       Listening, and watching. All of it delegated or document-wide, so a box
       that has not been rendered yet - and it has not, when this runs - is not
       a problem. Every one of these is wrapped: nothing may reach the page.
    ------------------------------------------------------------------ */
    function touched(e) {
      if (stopped || !e) return;
      try {
        var path = e.composedPath ? e.composedPath() : null;
        var t = (path && path.length ? path[0] : null) || e.target;
        var rec = recOf(t);
        if (!rec) {
          var hit = inputFrom(t);
          if (hit) rec = recOf(hit.el) || adopt(hit);
          else if (!recs.length && editable(elementOf(t))) unmatched = true;
        }
        if (rec) sync(rec);
      } catch (err) { fault(err); }
    }

    /** A box arriving, or arriving again after the host rebuilt it. */
    function scanAdded(n) {
      if (!n || n.nodeType !== 1 || !n.querySelectorAll) return;
      var list = n.matches(ANY_INPUT) ? [n] : [];
      var inner = n.querySelectorAll(ANY_INPUT);
      for (var i = 0; i < inner.length; i++) list.push(inner[i]);
      for (var j = 0; j < list.length; j++) {
        var road = roadOf(list[j]);
        if (road < 0 || recOf(list[j])) continue;
        var rec = adopt({ el: list[j], road: road });
        if (rec) sync(rec);
      }
    }

    var finder = null;
    function found(records) {
      if (stopped) return;
      try {
        // boxes that have left the page are let go, so nothing of theirs is kept alive
        for (var i = recs.length - 1; i >= 0; i--) if (!recs[i].box.isConnected) forget(recs[i]);
        for (var r = 0; r < records.length; r++) {
          var added = records[r].addedNodes;
          for (var j = 0; j < added.length; j++) if (!recOf(added[j])) scanAdded(added[j]);
        }
      } catch (e) { fault(e); }
    }

    sheet = layeredSheet("smart-rtl-composer", COMPOSER_CSS, fault);
    document.addEventListener("input", touched, true);
    document.addEventListener("focusin", touched, true);
    try {
      finder = new MutationObserver(found);
      finder.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { fault(e); finder = null; }
    try { scanAdded(document.body || document.documentElement); } catch (e) { fault(e); }

    function sweep(root) {
      try {
        var n = root.querySelectorAll("[" + TURN + "],[" + LAYER + "]");
        for (var i = 0; i < n.length; i++) { n[i].removeAttribute(TURN); n[i].removeAttribute(LAYER); }
      } catch (e) {}
    }

    function stop(why) {
      if (stopped) return "off";
      stopped = true;
      try { if (finder) finder.disconnect(); } catch (e) {}
      try {
        document.removeEventListener("input", touched, true);
        document.removeEventListener("focusin", touched, true);
      } catch (e) {}
      if (measureTimer) { clearTimeout(measureTimer); measureTimer = null; }
      // a frame id and a timer id are not the same thing, and by the time it is stopped this
      // could be holding either, so both are cancelled
      if (askTimer) { try { clearTimeout(askTimer); } catch (e) {} try { cancelAnimationFrame(askTimer); } catch (e) {} askTimer = null; }
      for (var i = recs.length - 1; i >= 0; i--) {
        try { unturn(recs[i]); } catch (e) {}
        forget(recs[i]);
      }
      sweep(document);
      var roots = sheet.roots();
      for (var s = 0; s < roots.length; s++) sweep(roots[s]);
      sheet.remove();
      state = why || "off - turned off by hand";
      return "off";
    }

    function status() {
      var last = recs[recs.length - 1];
      var s = state;
      if (!recs.length && unmatched && s.indexOf("on - waiting") === 0) {
        s = "on - waiting for the box to appear (something was typed into that matched none of its descriptions)";
      }
      /* Tried, threw, and never once turned a box. Every fault was being contained
         correctly and counted in a field below - and the headline said "on" over a circuit
         that had done nothing but throw, which is the one thing a status must never do. The
         three conditions together are what keeps it from crying wolf: a fault while setting
         something up, on a circuit that goes on turning boxes, says nothing about the
         circuit; neither does a healthy circuit that has only ever been shown English. */
      if (faults && !everTurned && s.indexOf("on") === 0) {
        s = (recs.length ? "not working - it has thrown and never turned a box ("
                         : "not working - it could not take hold of a box at all (")
          + (lastFault || "no message") + ")";
      }
      return {
        state: s,
        found: last
          ? "by " + INPUTS[last.road] + (last.overs.length ? "; the layer over it by " + OVERS[last.overRoad] : "; nothing drawn over it")
          : "not yet",
        boxes: recs.length,
        sheet: sheet ? sheet.road() : "off",
        contained: faults,
        lastFault: lastFault
      };
    }

    return { stop: stop, status: status };
  }

  /* =======================================================================
     A MESSAGE SOMEBODY SENT - a lamp on a circuit of its own.

     ONE direction for the whole of a sent message, from what it says: any RTL word in
     it and it reads right to left, none and it is left exactly as the page had it. It
     used to be decided line by line, from a copy of the message built beside the
     page's own; in the real panel that copy was never once made, and it was the only
     thing here that built elements in somebody else's page. Section 34 of decisions.md.

     Until this part existed, a sent message had no lamp of its own at all. Seventeen
     builds of Claude Code were booted and sent a message, 2.0.50 to 2.1.268, and what
     turned it was found to be three different things in three different eras:

       - the answers' part, treating the message's body as a block by its class name
       - the answers' part again, deciding the WHOLE ROW from a heading hidden above
         the message for screen readers - so a sent message was being decided by the
         code for answers, from text nobody can see
       - and the one road that was the message's own: the run of text the page hands
         to dir="auto", which only exists from 2.1.220

     and in 2.0.50 and 2.1.0 - class names minified, no dir="auto", no heading - by
     nothing at all. The class name one of those roads leaned on for "one message"
     had quietly vanished in 2.1.266.

     So it is taken out of the answers' hands and given its own circuit:

       FOUND TWO WAYS, EACH ENOUGH. By name - the element that holds a sent message's
       text - and by what it is: a run the page hands to dir="auto", which is the
       browser's first-strong-character guess applied to text the page did not want
       to decide, and exactly the rule this project replaces.

       DECIDED WHERE THE TEXT IS, AND NOWHERE ELSE. The direction goes on the element
       that holds the text. Never on the row: the controls beside the message sit in
       flex rows that end at `flex-end`, and a row that turned would carry them to the
       other side. Inside the text, a run the page hands to dir="auto" and the text's
       own direct children are held to the message's direction; anything the page
       nests deeper - a mention chip, say - keeps its own.

       NO STYLESHEET CAN OVERRULE IT. Its rules sit in a cascade layer declared ahead
       of all of the page's, every declaration !important. Claude Code has never set a
       direction on a sent message; 2.1.267 set one on the box you type into, and a
       rule that did not already outrank it would have gone dark the same way.

       IT FAILS TO NOTHING. A message this cannot finish deciding is left as the page
       had it. Its own observers - one that finds messages as they are added, one on
       each message it has found - its own stylesheet and its own status.
  ======================================================================= */

  var SENT = "data-bidi-sent";    // on the element that holds a sent message's text: "rtl", or absent

  var SENT_CSS = "@layer smartrtl-sent{" +
    "[" + SENT + '="rtl"]{direction:rtl!important;unicode-bidi:isolate!important;text-align:start!important}' +
    "[" + SENT + '="rtl"] > *,[' + SENT + '="rtl"] [dir="auto"]{direction:inherit!important;unicode-bidi:isolate!important;text-align:inherit!important}' +
    "}";

  /** A sent-message part that never started, and says why. */
  function sentOff(why) {
    return {
      stop: function () { return "off"; },
      status: function () { return { state: why, found: "not yet", messages: 0, turned: 0, sheet: "off", contained: 0, lastFault: "" }; }
    };
  }

  /**
   * @param {object} rule  @smartrtl/core
   * @param {{text: string[], runs: boolean, not: string[]}} spec
   *   text  the element that holds a sent message's text, by name - a list of roads
   *   runs  every run of text the page hands to dir="auto" is a sent message's text too
   *   not   and none of it is looked for inside these. Today dir="auto" occurs once in
   *         Claude Code's whole bundle, on a sent message; the day it is put on an answer's
   *         paragraphs as well - a likely way for anyone to start fixing right-to-left - the
   *         run road would find every one of them, and the answers' part and this one would
   *         both be deciding the same paragraph, each its own way. The adapter names what
   *         an answer is, and this part never goes inside one.
   * @param {function} [onDecision]  the adapter's hook, told when a message turns - the
   *   same one answers tell, so whatever an adapter hangs on "a message is right to
   *   left now" (Claude Code's timeline gutter) happens as early as it did before
   * @returns {{stop: function, status: function}}
   */
  function startSent(rule, spec, onDecision, blocksAre) {
    var stopped = false, faults = 0, lastFault = "";
    var state = "on - no sent message has been found yet";
    // the same question the box is asked, about the place a message is shown once it is
    // sent, and answered from the first message that can answer it. See askThePage.
    var needed = null;
    var lastRoad = "", turned = 0;
    var everTurned = false;                  // what the headline may claim - see status()
    var known = [];                    // { el, road, observer }, one per message found
    var byEl = new WeakMap();          // element -> its record, so a message is never taken twice

    function fault(e) {
      faults++;
      try { lastFault = String((e && e.message) || e).slice(0, 200); } catch (x) {}
    }
    function listOf(x) { return Array.isArray(x) ? x.slice() : x ? [x] : []; }
    function usable(sel) {
      if (!sel || typeof sel !== "string") return false;
      try { document.querySelector(sel); return true; } catch (e) { return false; }
    }

    var TEXT = listOf(spec.text).filter(usable);
    var RUNS = !!spec.runs;
    var BLOCKS = usable(blocksAre) ? blocksAre : null;   // what an ANSWER's text lands in
    var NOT = listOf(spec.not).filter(usable).join(",") || null;
    if (!TEXT.length && !RUNS) return sentOff("off - no description of a sent message was usable");
    var ANY = TEXT.concat(RUNS ? ['[dir="auto"]'] : []).join(",");

    var sheet = layeredSheet("smart-rtl-sent", SENT_CSS, fault);

    /**
     * From an element one of the roads points at, to the element that holds the text.
     * By name, that is the element itself. A run handed to dir="auto" is its own holder
     * if it is a block, and its parent if it is inline - but only a parent holding that
     * run and no other, so a decision can never spread past the text it was taken from.
     */
    function holderOf(el) {
      if (NOT && el.closest(NOT)) return null;          // somebody else's text, with a lamp of its own
      for (var r = 0; r < TEXT.length; r++) if (el.matches(TEXT[r])) return { el: el, road: "by " + TEXT[r] };
      if (!RUNS || el.getAttribute("dir") !== "auto") return null;
      if (el.closest("pre,code,[contenteditable]") || besideAnEditor(el)) return null;   // never code, never an editor
      if (!INLINE[el.tagName]) return notABlock(el);
      var p = el.parentElement;
      if (!p || p === document.body || p === document.documentElement) return null;
      var runs = 0;
      for (var c = p.firstElementChild; c; c = c.nextElementSibling) if (c.getAttribute("dir") === "auto") runs++;
      return runs === 1 ? notABlock(p) : null;
    }

    /**
     * The holder, unless it is one of the answers' own blocks - in which case this lamp has
     * found somebody else's text and says so by finding nothing. The name for an answer is
     * checked too, above; this is the same thing said by shape, so that a renamed test id
     * cannot quietly leave two lamps deciding one paragraph.
     */
    function notABlock(el) {
      try { if (BLOCKS && el.matches(BLOCKS)) return null; } catch (e) {}
      return { el: el, road: 'by the run handed to dir="auto"' };
    }

    function decide(rec) {
      if (stopped) return;
      try {
        if (!rec.el.isConnected) return;
        sheet.keep();
        var text = rec.el.textContent || "";
        if (rule.containsRtlWord(text)) {
          if (needed === null) askThePage(rec, text);
          if (needed === false) { standDown(); return; }
          if (rec.el.getAttribute(SENT) !== "rtl") {
            rec.el.setAttribute(SENT, "rtl");          // <-- the one decision for this message
            turned++;
            lastRoad = rec.road;
            measureSoon(rec);
            if (onDecision) { try { onDecision(rec.el, rec.el); } catch (e) {} }
          }
          everTurned = true;
        } else if (rec.el.hasAttribute(SENT)) {
          rec.el.removeAttribute(SENT);
        }
      } catch (e) {
        fault(e);
        try { rec.el.removeAttribute(SENT); } catch (x) {}   // left as the page had it
      }
    }

    /**
     * Is a sent message still ours to decide?
     *
     * The same question the box you type into is asked, put to the real message rather than
     * to a copy, and with the one text that can tell the two rules apart: one that opens in
     * Latin and turns right-to-left. Drawn from the left, the fault is here. Drawn from the
     * right, Claude Code has fixed this place itself, and this circuit comes out of the
     * page - that one, and nothing else.
     *
     * Every layer showing the message's text has to agree, the run the page hands to
     * dir="auto" included, so a message caught half rebuilt answers nothing and the next
     * one is asked instead.
     */
    function askThePage(rec, text) {
      if (!rule.tellsThemApart(text)) return;
      if (rec.el.getAttribute(SENT) === "rtl") return;
      var layers = [rec.el];
      try {
        var runs = rec.el.querySelectorAll('[dir="auto"]');
        for (var i = 0; i < runs.length; i++) layers.push(runs[i]);
      } catch (e) {}
      var side = readsFrom(layers);
      if (side) needed = side === "ltr";
    }

    /** Out of the page, and only this circuit. A sent message is not an answer. */
    function standDown() {
      stop("not needed - the page reads a mixed message correctly by itself");
    }

    /* Watched from the message itself, so an answer streaming elsewhere on the page asks
       it nothing - and a message the page rewrites is decided again, either way. */
    function adopt(h) {
      var rec = { el: h.el, road: h.road, observer: null };
      byEl.set(h.el, rec);
      known.push(rec);
      try {
        rec.observer = new MutationObserver(function () { decide(rec); });
        rec.observer.observe(h.el, { childList: true, characterData: true, subtree: true });
      } catch (e) { fault(e); }
      try {
        var root = h.el.getRootNode ? h.el.getRootNode() : null;
        if (root && root !== document && root.nodeType === 11 && root.host) sheet.into(root);
      } catch (e) { fault(e); }
      return rec;
    }

    function forget(rec) {
      try { if (rec.observer) rec.observer.disconnect(); } catch (e) {}
      rec.observer = null;
      byEl.delete(rec.el);
      var i = known.indexOf(rec);
      if (i >= 0) known.splice(i, 1);
    }

    function decideFirst(rec) {
      // a message found, whether or not it needs turning: the status stops saying none was
      if (state.indexOf("on - no sent message") === 0) state = "on - nothing decided yet";
      decide(rec);
    }

    /** Every message in, or at, a node that has just arrived. */
    function scan(n) {
      if (!n || n.nodeType !== 1 || !n.querySelectorAll) return;
      var list = n.matches(ANY) ? [n] : [];
      var inner = n.querySelectorAll(ANY);
      for (var i = 0; i < inner.length; i++) list.push(inner[i]);
      for (var j = 0; j < list.length; j++) {
        try {
          var h = holderOf(list[j]);
          if (!h) continue;
          var rec = byEl.get(h.el);
          if (!rec) rec = adopt(h);
          decideFirst(rec);
        } catch (e) { fault(e); }
      }
    }

    /* ------------------------------------------------------------------
       Did the page take it? Read back after the frame, once per message turned.
    ------------------------------------------------------------------ */
    var measureTimer = null, measureQueue = [];
    function measureSoon(rec) {
      measureQueue.push(rec);
      if (measureTimer) return;
      measureTimer = setTimeout(function () {
        measureTimer = null;
        var list = measureQueue;
        measureQueue = [];
        if (stopped) return;
        for (var i = 0; i < list.length; i++) {
          try { measure(list[i]); } catch (e) { fault(e); }
        }
      }, 0);
    }

    function measure(rec) {
      if (!rec.el.isConnected || rec.el.getAttribute(SENT) !== "rtl") return;
      var cs = getComputedStyle(rec.el);
      var bad = cs.direction !== "rtl" || cs.unicodeBidi === "plaintext" || /^(-webkit-)?left$|^end$/.test(cs.textAlign);
      var runs = rec.el.matches('[dir="auto"]') ? [] : rec.el.querySelectorAll('[dir="auto"]');
      var seen = cs.direction + ", " + cs.unicodeBidi + ", " + cs.textAlign;
      for (var i = 0; i < runs.length && !bad; i++) {
        var rs = getComputedStyle(runs[i]);
        if (rs.direction !== "rtl" || rs.unicodeBidi === "plaintext") { bad = true; seen += "; the run: " + rs.direction + ", " + rs.unicodeBidi; }
      }
      state = bad ? "not working - the direction was set and the page did not take it (" + seen + ")"
                  : "on - measured working";
    }

    /* ------------------------------------------------------------------
       Watching the page for messages as they arrive.
    ------------------------------------------------------------------ */
    var pruneTimer = null;
    function pruneSoon() {
      if (pruneTimer) return;
      pruneTimer = setTimeout(function () {
        pruneTimer = null;
        if (stopped) return;
        for (var i = known.length - 1; i >= 0; i--) if (!known[i].el.isConnected) forget(known[i]);
      }, 1000);
    }

    var finder = null;
    try {
      finder = new MutationObserver(function (records) {
        if (stopped) return;
        try {
          // messages already turned lean on our sheet; if the page has taken it away,
          // it goes back now rather than when the next message happens to arrive
          if (known.length) sheet.keep();
          for (var r = 0; r < records.length; r++) {
            if (records[r].removedNodes && records[r].removedNodes.length) pruneSoon();
            var added = records[r].addedNodes;
            for (var j = 0; j < added.length; j++) scan(added[j]);
          }
        } catch (e) { fault(e); }
      });
      finder.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { fault(e); finder = null; }
    try { scan(document.body || document.documentElement); } catch (e) { fault(e); }

    function stop(why) {
      if (stopped) return "off";
      stopped = true;
      try { if (finder) finder.disconnect(); } catch (e) {}
      if (measureTimer) { clearTimeout(measureTimer); measureTimer = null; }
      if (pruneTimer) { clearTimeout(pruneTimer); pruneTimer = null; }
      for (var i = known.length - 1; i >= 0; i--) forget(known[i]);
      var roots = [document].concat(sheet.roots());
      for (var k = 0; k < roots.length; k++) {
        try {
          var n = roots[k].querySelectorAll("[" + SENT + "]");
          for (var m = 0; m < n.length; m++) n[m].removeAttribute(SENT);
        } catch (e) {}
      }
      sheet.remove();
      state = why || "off - turned off by hand";
      return "off";
    }

    function status() {
      var marked = 0;
      for (var i = 0; i < known.length; i++) if (known[i].el.getAttribute(SENT) === "rtl") marked++;
      // the same honesty the box has: tried, threw every time, never turned a message
      var s = state;
      if (faults && !everTurned && s.indexOf("on") === 0) {
        s = "not working - it has thrown and never turned a message (" + (lastFault || "no message") + ")";
      }
      return {
        state: s,
        found: known.length ? (lastRoad || known[known.length - 1].road) : "not yet",
        messages: known.length,
        turned: marked,
        sheet: sheet.road(),
        contained: faults,
        lastFault: lastFault
      };
    }

    return { stop: stop, status: status };
  }

  /* =======================================================================
     Answers.
  ======================================================================= */
  function startRest(rule, cfg) {
    // blocks: false - no block decisions at all, while everything else here still
    // runs. An adapter passes it when the page already decides its own blocks
    // correctly, so that the other parts do not depend on that one being needed.
    var BLOCKS = cfg.blocks === false ? null : (cfg.blocks || DEFAULT_BLOCKS);
    var QUIET_MS = cfg.quietMs || DEFAULT_QUIET_MS;
    var MAX_BOX = cfg.maxBox || DEFAULT_MAX_BOX;
    var BOX_HINT = cfg.boxSelector || null;

    // A selector that the browser will not accept throws on every single batch, for
    // ever, and silently. Asked once here instead: what cannot be used is not used,
    // and the parts that do not depend on it carry on.
    function usableSelector(sel) {
      if (!sel) return false;
      try { document.querySelector(sel); return true; } catch (e) { return false; }
    }

    var blocksOk = usableSelector(BLOCKS);
    if (BOX_HINT && !usableSelector(BOX_HINT)) BOX_HINT = null;

    // Blocks this part must never take a decision from, and never decide. A heading
    // hidden above every sent message for screen readers is one: it is a block, it came
    // first, and it had this part deciding the whole row of a message somebody sent -
    // from text nobody can see, in the code for answers. A sent message has a lamp of
    // its own now, and this part stays out of its way.
    var SKIP = cfg.skip && usableSelector(cfg.skip) ? cfg.skip : null;

    /* ---------------------------------------------------------------
       One stylesheet, written once.

       :is() is load-bearing here, not decoration. An adapter may name a block
       with a complex selector - "the content div inside an expandable
       container" - and inside :is() that selector is matched against the block
       itself, independently of where the decided box sits. Concatenating the
       two instead would demand that the container be found BELOW the box, and
       it is usually above it: the rule then matches nothing, silently.
    --------------------------------------------------------------- */
    var css = !blocksOk ? "" :
      '[data-bidi="rtl"] :is(' + BLOCKS + '){direction:rtl!important;unicode-bidi:isolate!important}' +
      // the safety rule: a block with no RTL in it keeps what it had
      '[data-bidi="rtl"] :is(' + BLOCKS + ')[data-bidi="ltr"]{direction:ltr!important;unicode-bidi:isolate!important}' +

      // text-align is not optional. A host that writes `text-align: left` on a
      // container - and they do - beats direction entirely: the words come out in the
      // right order and every line still hugs the left edge. `start` is the honest
      // value, because it follows whatever direction was just decided rather than
      // naming a side.
      //
      // th is left out, and finding out why is what this exclusion is for. A table
      // header is centred, and that centring is the BROWSER's - the host writes no
      // text-align on th at all. Overriding it turned every centred header in an Urdu
      // message left-aligned, which is not a direction: centre is centre either way.
      // Setting direction is the job; restyling somebody's table is not.
      '[data-bidi="rtl"] :is(' + BLOCKS + '):not(th){text-align:start!important}' +
      // A page may hand a run of text to the browser's own guess with dir="auto" -
      // the same first-strong-character rule this whole project exists to replace.
      // Inside a block we have already decided, that guess must not get a second
      // vote, so such a run is told to inherit the decision instead.
      '[data-bidi="rtl"] :is(' + BLOCKS + ') [dir="auto"]{direction:inherit!important;unicode-bidi:isolate!important}';

    if (cfg.extraCss) css += cfg.extraCss;

    /* Everything above rides on one stylesheet getting in, so how it gets in is not
       left to one road. A <style> element added from script is what a page with
       'unsafe-inline' in its style-src allows - Claude Code's does, today. Without
       that word the element is refused and every part of this would go dark at once.
       Measured: under such a policy a constructed stylesheet handed to
       document.adoptedStyleSheets still applies. So the element is tried first, and
       if its rules did not arrive, the other road is taken - and the status says
       which. */
    var style = document.createElement("style");
    style.id = "smart-rtl-direction";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    var adopted = null, sheetState = "style element";
    var took = false;
    try { took = !!(style.sheet && style.sheet.cssRules && style.sheet.cssRules.length); } catch (e) {}
    if (!took) {
      try {
        adopted = new CSSStyleSheet();
        adopted.replaceSync(css);
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([adopted]);
        sheetState = "adopted - the page refused a style element";
      } catch (e) {
        adopted = null;
        sheetState = "off - the page refused every way of adding a stylesheet";
      }
    }

    /* ---------------------------------------------------------------
       Deciding
    --------------------------------------------------------------- */
    var failures = 0;                    // contained faults, reported by status()
    var everDecided = false;             // what the headline may claim - see status()
    var stopped = false;                 // stop() has been called; finish nothing more
    var settledBlocks = new WeakSet();   // blocks whose own decision is final
    var pending = new Set();             // blocks skipped because they were still being written
    var quiet = false, quietTimer = null;

    /**
     * Has this block finished being written?
     *
     * Text is appended, so ANYTHING that follows a block inside the same message
     * was written after it, and its arrival is proof the block is done. Checking
     * only the block's own next sibling missed the common shape of that: the last
     * cell of a table row has no sibling, and neither does the last item of a list,
     * so a cell reading "250-400ms" stayed turned round until the quiet timer
     * eventually caught it - half a second of a reader looking at "400ms-250".
     *
     * The walk stops at the message, and that boundary is not decoration: outside
     * it sits the rest of the panel, including the spinner, and treating those as
     * "something followed it" would call every block finished the moment it
     * appeared - which is precisely the guess this whole function exists to avoid.
     */
    function isFinal(el) {
      if (quiet) return true;
      var stop = null;
      if (BOX_HINT) { try { stop = el.closest(BOX_HINT); } catch (e) {} }
      if (!stop) return !!el.nextElementSibling;
      for (var n = el; n && n !== stop; n = n.parentElement) {
        if (n.nextElementSibling) return true;
      }
      return false;
    }

    function usable(node) {
      if (!node || node === document.body || node === document.documentElement) return false;
      if (node.querySelectorAll(BLOCKS).length > MAX_BOX) return false;
      if (node.querySelector('[data-bidi="rtl"]')) return false;   // never swallow a decision already made
      return true;
    }

    /**
     * A decision must never escape the thing it was made for.
     *
     * Without a ceiling, a hint selector as loose as [class*="root"] can match an
     * application-level container, and one message's direction is then applied to
     * everything on the page. That was measured, not imagined: a single Urdu message
     * put its decision on the app root.
     */
    function boxOf(el) {
      var ceiling = cfg.boundary ? el.closest(cfg.boundary) : null;
      var inside = function (n) { return n && (!ceiling || ceiling.contains(n)); };

      if (BOX_HINT) {
        var byHint = el.closest(BOX_HINT);
        if (inside(byHint) && usable(byHint)) return byHint;
      }
      var x = el.parentElement, hops = 0;
      while (x && hops < 5 && x !== document.body && x !== document.documentElement) {
        if (inside(x) && x.querySelectorAll(BLOCKS).length >= 2 && usable(x)) return x;
        x = x.parentElement; hops++;
      }
      var p = el.parentElement;
      return inside(p) && usable(p) ? p : null;
    }

    /** Laid out one pixel square: the shape of text that is there only for a screen reader. */
    function screenReaderOnly(el) {
      var r = el.getBoundingClientRect();
      return r.width <= 1 && r.height <= 1 && (r.width > 0 || r.height > 0);
    }

    function inspect(el) {
      if (!el || !el.isConnected) return;
      if (settledBlocks.has(el)) return;
      // Never inside a box somebody types into - said here as well as in push(), because a
      // block in there reaches this through the querySelectorAll of an ancestor that is not
      // editable, which is what the first pass over document.body is. What is in that box has
      // a lamp of its own, and two lamps on one element is the one thing three circuits exist
      // to prevent. Section 40.
      if (el.isContentEditable) return;
      // ...and not the layer drawn over such a box either, which is not editable and holds the
      // same text. It is marked by the box's own lamp, so this needs no name of Claude Code's.
      if (el.closest("[" + LAYER + "]")) return;
      if (SKIP && el.closest(SKIP)) return;           // not this part's to decide from

      if (el.closest('[data-bidi="rtl"]')) {          // message already decided
        // A block carrying no RTL text at all is left EXACTLY as the page had it.
        // Forcing rtl on such a block gains nothing and can reorder content that
        // was already fine: "250-400ms" written with an en dash becomes "400ms-250".
        if (!rule.containsRtl(el.textContent || "")) {
          if (!isFinal(el)) { pending.add(el); return; }
          // Marked, and deliberately NOT settled.
          //
          // The quiet timer now expires DURING a message - a tool runs, and for a
          // second or two nothing is written - so this mark can land on a paragraph
          // that is only half here. More text may still arrive, and a mark that
          // could not be taken back would leave that text reading left to right for
          // good. Being late is a disappointment; being permanently wrong is not.
          el.setAttribute("data-bidi", "ltr");
          pending.delete(el);
          return;
        }
        // RTL arrived after all, so it reads with the message it is part of. This
        // way round is final: text is appended, never unwritten, so a block that
        // holds an RTL word will hold it for the rest of its life.
        el.removeAttribute("data-bidi");
        settledBlocks.add(el); pending.delete(el);
        return;
      }

      var text = el.textContent || "";
      if (!rule.containsRtlWord(text)) return;         // nothing to decide from yet
      // Never from text nobody can see. Text kept only for screen readers is drawn one
      // pixel square, and a heading like that sits above every sent message - it had
      // this part deciding the row of a message somebody sent, which is not an answer.
      // It is skipped by name as well; this is the same thing said by what it is, so a
      // rename does not bring it back. Asked once per message, never per mutation.
      if (screenReaderOnly(el)) { settledBlocks.add(el); pending.delete(el); return; }
      // And never the layer drawn over a box somebody types into. Not editable itself - so
      // "never inside an editor" does not reach it - but it sits beside one, and it holds a
      // copy of the draft. Decided here, the glyphs would take a direction of their own while
      // the caret took the box's, and this part would WIN: its stylesheet is unlayered, and an
      // unlayered !important outranks the layered one the box's own rules live in. Section 40.
      if (besideAnEditor(el, 2)) { settledBlocks.add(el); pending.delete(el); return; }
      // Not waited on, and that exemption is the whole of the real-time behaviour.
      //
      // Everywhere else this engine refuses to decide from a half-written block.
      // This decision is exempt because nothing arriving later can revise it: text
      // is appended and never unwritten, so a block holding an RTL word will hold
      // one for the rest of its life, and the rule's answer for such a block is RTL
      // whatever else joins it. Waiting protected a decision that was never at risk.
      //
      // What the waiting cost was measured, on a page with Claude Code's own
      // spinner running: 42 frames - two thirds of a second - of somebody reading a
      // short reply backwards, because a reply of one paragraph never grows the
      // second block that would have settled the first. Deciding on sight costs 3
      // frames, with the same single change of direction and no sideways movement.
      // test/jitter.test.js holds both halves of that.
      var box = boxOf(el);
      if (box) {
        box.setAttribute("data-bidi", "rtl");          // <-- the one decision
        everDecided = true;
        if (cfg.onDecision) { try { cfg.onDecision(el, box); } catch (e) {} }
      }
      settledBlocks.add(el); pending.delete(el);
    }


    /* ---------------------------------------------------------------
       Watching. One pass per batch of mutations, never one per mutation - and
       that pass runs BEFORE the browser paints.

       The queue used to be drained from requestAnimationFrame, which is one
       frame too late: a mutation that lands after a frame's rAF has already run
       is not looked at until the next one, so the frame in between is painted
       without the decision on it. Usually nobody could tell. Where it showed was
       a host re-mounting a message - our attribute goes with the old elements,
       and the message was painted the other way round while we waited for a frame
       that had already gone. Measured over twelve runs: six of them flickered.

       A MutationObserver callback is a microtask, so draining from one runs at
       the end of the same task the mutation happened in, before rendering. Same
       batching, same cost - measured at 60fps with and without the fix, with a
       mutation every millisecond - and nothing is ever painted mid-correction.
       Twelve runs of the same re-mount: none flickered.
    --------------------------------------------------------------- */
    /* A SET, not a list, and that is the difference between one pass and ten of them.
       Streaming appends word after word to the SAME paragraph, so one batch of mutations
       names that paragraph over and over - ten times in a batch is ordinary. As a list,
       each of those ten asked the page for its blocks again and read the whole paragraph
       again. Looking at one block twice in a pass can only reach the same verdict twice,
       so nothing about the outcome changes. Measured: section 38 of decisions.md. */
    var queue = new Set(), scheduled = false;
    var watching = blocksOk;

    function drain() {
      scheduled = false;
      // A pass is queued as a microtask, so one can already be in flight when stop()
      // is called - and it would then write a decision into a page that has just
      // been handed back, with nothing left to take it out again. Found by the test
      // that stands the fix down the moment a message arrives.
      if (stopped) { queue.clear(); return; }
      var batch = queue; queue = new Set();

      var blocks = new Set();
      batch.forEach(function (n) {
        if (!n || n.nodeType !== 1 || !n.isConnected) return;
        if (blocksOk) {
          var self = n.closest(BLOCKS);
          if (self) blocks.add(self);
          var list = n.querySelectorAll(BLOCKS);
          for (var j = 0; j < list.length; j++) blocks.add(list[j]);
        }
      });

      // Quiet means the TEXT has stopped, not the page. See armQuiet.
      if (blocks.size) armQuiet();
      // One block at a time, each on its own. A block that throws - a shape nobody
      // anticipated, a host element that has just been detached - used to take the
      // whole batch with it, and then the next batch, and then quietly the whole
      // feature. Blocks are independent of each other and the code should say so.
      blocks.forEach(function (b) {
        try { inspect(b); } catch (e) { failures++; }
      });
    }

    /**
     * Restart the clock on "the writing has stopped".
     *
     * Called only for a mutation that touched a block, and that restriction is
     * the whole point of it. It used to be called for every mutation anywhere in
     * the document, which sounds harmless and is not, because of this - from
     * Claude Code's own bundle:
     *
     *     d30 = ["·","✢","✳","✶","✻","✽", ...]
     *     setInterval(() => X(q => (q + 1) % d30.length), 120)
     *
     * A spinner character, rewritten every 120ms for as long as the model is
     * working. Shorter than QUIET_MS, so the timer was reset before it could ever
     * expire: while the model worked, the page was never "quiet", and a block
     * with nothing after it yet - the last one, the one being read - could not be
     * decided. It came right the moment the spinner stopped, which is why this
     * only ever showed up as "wrong while it streams, right when you scroll back
     * up afterwards".
     *
     * A spinner is not writing. Neither is a clock, a progress bar, or anything
     * else a product may animate next to an answer. Only text in a block counts.
     */
    function armQuiet() {
      quiet = false;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(function () {
        if (stopped) return;
        quiet = true;
        var left = Array.from(pending);
        pending.clear();
        for (var i = 0; i < left.length; i++) {
          try { inspect(left[i]); } catch (e) { failures++; }
        }
      }, QUIET_MS);
    }

    function push(node) {
      if (node && node.nodeType === 3) node = node.parentElement;
      if (!node || node.nodeType !== 1) return;
      /* Never inside something somebody types into.
         Two reasons, and either would be enough on its own.
         It is correct: an answer is never inside an editor, and what IS inside one has a lamp
         of its own, so a block found here would be decided twice over by two parts, each its
         own way - precisely what three separate circuits exist to prevent. The day Claude Code
         gives its composer real paragraphs instead of plain text, that is what would happen.
         And it is the largest single cost in the typing path. This is the only part of the fix
         that listens for characterData at all, so EVERY keystroke anybody types arrives here,
         and then asks the page two selector questions whose answer is always "there is nothing
         here". Measured on Claude Code's own panel, with the fix injected and taken out again
         between blocks of keystrokes so the machine could not be mistaken for the fix: 1.07ms
         of every keystroke, out of the 1.25ms that all four circuits cost together. Taking it
         out leaves 0.18ms. Section 40. */
      if (node.isContentEditable) return;
      queue.add(node);
      // The clock on "the writing has stopped" is NOT restarted here: at this point
      // all we know is that something on the page moved, and most of what moves is
      // not writing. drain restarts it, once it knows a block was involved.
      if (!scheduled) { scheduled = true; queueMicrotask(drain); }
    }

    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        push(r.target);
        if (r.addedNodes) for (var j = 0; j < r.addedNodes.length; j++) push(r.addedNodes[j]);
      }
    });
    if (watching) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }

    /* ---------------------------------------------------------------
       stop() promises the page comes back to what it was, and it can keep that
       promise cheaply because nothing here ever altered the host's DOM: taking
       out one stylesheet and our own attributes is the whole of it.
    --------------------------------------------------------------- */
    function dropAttribute(name) {
      var n = document.querySelectorAll("[" + name + "]");
      for (var i = 0; i < n.length; i++) n[i].removeAttribute(name);
    }

    function stop() {
      stopped = true;
      try { observer.disconnect(); } catch (e) {}
      if (quietTimer) clearTimeout(quietTimer);
      if (style.parentNode) style.parentNode.removeChild(style);
      if (adopted) {
        try {
          document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (s) { return s !== adopted; });
        } catch (e) {}
      }
      dropAttribute("data-bidi");
      if (cfg.onCleanup) { try { cfg.onCleanup(); } catch (e) {} }
      return "off";
    }

    var blocksState = !BLOCKS ? "off - not asked for"
                    : blocksOk ? "watching" : "off: the block selector was refused";

    /**
     * Stand the block decisions down, and nothing else.
     *
     * For a page that turns out to decide its own blocks correctly - measured by the
     * adapter, which is the only one that knows what to measure. Every decision of
     * that kind comes back out and no more are taken, while the box you type into and
     * sent messages carry on untouched: they answer different questions, on circuits
     * of their own, and the host fixing one of them says nothing about the others.
     */
    function standDownBlocks(why) {
      if (!blocksOk) return;
      blocksOk = false;
      pending.clear();
      if (quietTimer) clearTimeout(quietTimer);
      dropAttribute("data-bidi");
      blocksState = "stood down - " + (why || "the page decides its own blocks now");
    }

    if (watching) push(document.body || document.documentElement);

    function status() {
      // and the same for this part: blocks that all threw are not "watching"
      var blocks = blocksState;
      if (failures && !everDecided && blocks === "watching") {
        blocks = "not working - a block threw and nothing has been decided";
      }
      return {
        blocks: blocks,
        boxHint: BOX_HINT ? "on" : "off",
        skip: SKIP ? "on" : "off",
        sheet: sheetState,
        contained: failures            // faults that were caught and did not spread
      };
    }

    return { stop: stop, standDownBlocks: standDownBlocks, refresh: push, status: status };
  }

  return {
    start: start,
    // for an adapter's own circuit - Claude Code's pinned message is one - so that its rules
    // get into the page the same way, and ahead of the page's, as the engine's own do, and
    // so that it keeps out of the box you type into the same way the engine's own parts do
    layeredSheet: layeredSheet,
    besideAnEditor: besideAnEditor,
    DEFAULT_BLOCKS: DEFAULT_BLOCKS,
    DEFAULT_QUIET_MS: DEFAULT_QUIET_MS,
    DEFAULT_MAX_BOX: DEFAULT_MAX_BOX
  };
});
