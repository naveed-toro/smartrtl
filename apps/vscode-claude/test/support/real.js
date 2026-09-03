/**
 * The same measurements, against Claude Code's OWN stylesheet.
 *
 * test/support/page.js copies the handful of rules that cause the problem into a
 * small page. That copy is how everything here was understood, and it has one
 * weakness no amount of care removes: it is a copy, and a rule nobody thought to
 * copy cannot be measured.
 *
 * So this loads webview/index.css out of the installed extension, finds the real
 * class names in it rather than hard-coding this week's hashes, and builds the page
 * from those. When Claude Code is not installed the tests using it skip: a missing
 * dependency is not a failure, but a wrong model is.
 *
 * Everything it found on its first day was a fault in ITSELF, and that is worth
 * saying plainly, because each one had first been written up as a fault in the fix:
 * a viewport option that was never applied, so every measurement in this project had
 * been taken on a panel 1280 pixels wide; a page that scrolled as a document and
 * changed width while text arrived; a stylesheet pasted into markup that arrived
 * with a fraction of its rules; and an element sharing the id "root" with the
 * application's own React mount point, which is styled, so the blocks inside it laid
 * out in a row. A harness is not a lesser thing than the code. It is the instrument
 * every number comes from, and an instrument nobody checks reads whatever you hoped.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const PAYLOAD = path.resolve(__dirname, "../../dist/payload.js");

/** The newest installed Claude Code that actually has a webview. */
function findWebview() {
  const roots = [
    path.join(os.homedir(), ".vscode", "extensions"),
    path.join(os.homedir(), ".vscode-insiders", "extensions")
  ];
  const found = [];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch (err) { continue; }
    for (const entry of entries) {
      if (!entry.startsWith("anthropic.claude-code")) continue;
      const css = path.join(root, entry, "webview", "index.css");
      if (fs.existsSync(css)) found.push({ name: entry, css });
    }
  }
  found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return found.length ? found[found.length - 1] : null;
}

/**
 * The class names, read out of the stylesheet every run rather than written down.
 * Every one is hashed per build, so a hard-coded hash would turn a Claude Code
 * update into a green test suite measuring a page nobody has.
 */
function classNames(css) {
  const one = (base) => {
    const m = css.match(new RegExp("\\." + base + "[A-Za-z0-9_-]+"));
    return m ? m[0].slice(1) : null;
  };
  // the markdown root is the one the bidi rule is written against - there are others
  const root = (css.match(/\.(root_[A-Za-z0-9_-]+)\s+:is\(p,li,/) || [])[1];
  const expandable = one("expandableContainer_");
  const hash = expandable ? expandable.split("_")[1] : null;

  return {
    root,
    message: one("message_"),
    timelineMessage: one("timelineMessage_"),
    stickyHeader: one("stickyHeader_"),
    messagesContainer: one("messagesContainer_"),
    turn: one("turn_"),
    userMessageContainer: one("userMessageContainer_"),
    userMessage: one("userMessage_"),
    expandable,
    contentWrapper: hash ? "contentWrapper_" + hash : null,
    content: hash ? "content_" + hash : null,
    buttonContainer: hash ? "buttonContainer_" + hash : null
  };
}

const installed = findWebview();
const css = installed ? fs.readFileSync(installed.css, "utf8") : null;
const cls = css ? classNames(css) : null;

/** Claude Code's spinner, at its real 120ms. */
const working = () => `<div class="orbHost_x">Working <span class="orbChar_x">·</span></div>
<script>
  var FRAMES = ["\u00b7","\u2722","\u2733","\u2736","\u273b","\u273d","\u273b","\u2736","\u2733","\u2722"];
  var orb = document.querySelector(".orbChar_x"), i = 0;
  window.__stopWorking = function () { clearInterval(window.__spin); window.__spin = null; };
  window.__spin = setInterval(function () { orb.textContent = FRAMES[++i % FRAMES.length]; }, 120);
</script>`;

/**
 * One assistant message, nested and named the way the extension nests and names it.
 *
 * The id is "md" and not "root", which is not fussiness. Claude Code's stylesheet
 * carries a rule for `#root` - its own React mount point - that sets display: flex.
 * A test element sharing that id inherits an application-level layout by accident,
 * and the blocks inside it then lay out in a ROW. An afternoon went into believing
 * that was the markdown root's real shape; the browser settled it in one question,
 * through CSS.getMatchedStylesForNode, which named the rule outright.
 */
const answer = (id = "md") =>
  `<div class="${cls.message} ${cls.timelineMessage}"><div class="${cls.root}" id="${id}"></div></div>`;

/**
 * The scroll container and one turn, inside a shell that constrains it.
 *
 * The shell is not decoration. The container is a flex child filling the panel, so
 * on a page that does not constrain it, it sizes to its own content instead - and
 * then the whole measurement drifts with the text. That is exactly the false alarm
 * the first version of this file raised: ten pixels of movement, blamed on the app,
 * that only ever existed in the harness. A model that is loose about layout reports
 * layout bugs only the model has.
 */
const conversation = (inner, { height = 420 } = {}) =>
  `<div style="display:flex;flex-direction:column;width:100%;height:${height}px;overflow:hidden">
     <div class="${cls.messagesContainer}" id="scroller">
       <div class="${cls.turn}">${inner}</div>
     </div>
   </div>`;

/**
 * The stylesheet goes in through the DOM, not through the markup.
 *
 * addStyleTag builds the element and sets its text, so 390KB of minified CSS is
 * never parsed as markup on the way in and cannot terminate anything early.
 */
async function open(html, { width = 900, height = 700, fix = true } = {}) {
  const payload = fs.readFileSync(PAYLOAD, "utf8")
    .replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">` +
    // The panel is a fixed box that never scrolls as a page - only the message list
    // inside it does. Left as an ordinary document this page grows, acquires its own
    // scrollbars, and changes width underneath the measurement. Nine pixels of that
    // were briefly mistaken for the fix moving somebody's paragraph.
    `<style>html,body{height:100%;margin:0;overflow:hidden}
       body{display:flex;flex-direction:column;font-family:system-ui,sans-serif;font-size:15px}</style>` +
    html);

  // addStyleTag builds the element and sets its text through the DOM, so the CSS is
  // never parsed as markup on the way in. Pasted into the setContent string instead,
  // this stylesheet arrived with sixty-six rules on it out of thousands.
  await page.addStyleTag({ content: css });
  if (fix) await page.addScriptTag({ content: payload });

  await page.waitForTimeout(600);
  return { browser, page, close: () => browser.close() };
}

/**
 * Which of Claude Code's own rules the browser is applying to an element.
 *
 * document.styleSheets was tried for this and does not answer it: a big stylesheet
 * can be live and styling the page while its cssRules read back as almost nothing,
 * which sends you looking for a fault in the fix. Asking the engine what it matched
 * cannot be wrong in that way, and it names the selector.
 */
async function matchedRules(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const m = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
    return (m.matchedCSSRules || [])
      .filter((e) => e.rule.origin === "regular")
      .map((e) => e.rule.selectorList.text);
  } finally { await cdp.detach(); }
}

module.exports = { installed, cls, open, answer, conversation, working, matchedRules };

/**
 * One user message, nested and named the way the extension nests and names it, with
 * the toggling its own component does. A message that heads a turn is pinned, and
 * collapses at 60px until somebody opens it.
 */
const userMessage = (text, { expanded = false } = {}) => `
<div class="${cls.message} ${cls.stickyHeader} ${cls.timelineMessage}">
  <div class="${cls.userMessageContainer}"><div class="${cls.userMessage}">
    <div class="${cls.expandable}">
      <div class="${cls.contentWrapper}">
        <div class="${cls.content}${expanded ? "" : " " + cls.expandable.replace("expandableContainer_", "collapsed_")}"
             ${expanded ? "" : 'style="max-height:60px"'}><span dir="auto">${text}</span></div>
        ${expanded ? "" : `<div class="${cls.buttonContainer}"><button class="expandButton">Show more</button></div>`}
      </div>
      ${expanded ? `<div class="${cls.buttonContainer}"><button class="collapseButton">Show less</button></div>` : ""}
    </div>
  </div></div>
</div>`;

/** The component's own open/close, mimicked so that toggling can be measured. */
const toggling = () => `<script>
  var COLLAPSED = "${cls.expandable.replace("expandableContainer_", "collapsed_")}";
  var BTNS = "${cls.buttonContainer}";
  document.addEventListener("click", function (e) {
    var box = e.target.closest('[class*="expandableContainer_"]');
    if (!box) return;
    var body = box.querySelector('[class*="content_"]');
    var collapsed = body.classList.contains(COLLAPSED);
    if (collapsed && !e.target.closest('[class*="contentWrapper_"]')) return;
    if (!collapsed && !e.target.closest(".collapseButton")) return;
    body.classList.toggle(COLLAPSED);
    body.style.maxHeight = collapsed ? "" : "60px";
    box.querySelectorAll('[class*="buttonContainer_"]').forEach(function (n) { n.remove(); });
    if (collapsed) {
      box.insertAdjacentHTML("beforeend",
        '<div class="' + BTNS + '"><button class="collapseButton">Show less</button></div>');
    } else {
      box.querySelector('[class*="contentWrapper_"]').insertAdjacentHTML("beforeend",
        '<div class="' + BTNS + '"><button class="expandButton">Show more</button></div>');
    }
  });
</script>`;

module.exports.userMessage = userMessage;
module.exports.toggling = toggling;
