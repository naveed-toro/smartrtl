/**
 * A page that renders like the Claude Code webview does.
 *
 * The CSS here is copied from the extension's own webview/index.css - the two rules
 * that cause the problem, and enough layout around them for the results to mean
 * something. Tests then load the built payload into that page and measure what a
 * reader would actually see, rather than what the code claims it does.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const PAYLOAD = path.resolve(__dirname, "../../dist/payload.js");

const CSS = `
body{margin:0;padding:16px;background:#faf9f7;font-family:system-ui,sans-serif;font-size:15px}

/* ---- copied from the extension's webview/index.css ---- */
.root :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th){unicode-bidi:plaintext}
.root p{white-space:pre-wrap}
.message.timelineMessage_x{padding-left:30px;position:relative}
.message.timelineMessage_x:before{content:"";position:absolute;left:9px;top:15px;width:7px;height:7px;border-radius:50%;background:#888}
.message.timelineMessage_x:after{content:"";position:absolute;left:12px;top:0;bottom:0;width:1px;background:#ddd}
/* ------------------------------------------------------- */

.root pre{direction:ltr}

/* ---- copied from the extension's webview/index.css: the scroll container, the
        turn, and the pinned header every USER message is rendered as ---- */
.messagesContainer_x{overflow-y:auto;overflow-x:hidden;display:flex;position:relative;flex-direction:column;flex:1;gap:0;min-width:0;padding:20px 20px 40px}
.turn_x{display:flex;flex-direction:column}
.message_x{display:flex;position:relative;flex-direction:column;align-items:flex-start;gap:0;padding:8px 0}
.message_x.stickyHeader_x{position:sticky;z-index:2;background:#faf9f7;align-items:stretch;padding-top:14px;padding-bottom:12px;top:0}
/* text-align:left is theirs, and it is what beat direction for a whole day */
.userMessageContainer_x{display:block;width:100%;position:relative;margin:4px 0;text-align:left}
.userMessage_x{white-space:pre-wrap;word-break:break-word;border:1px solid #ddd;border-radius:6px;background:#f2f1ee;display:block;overflow-x:hidden;overflow-y:hidden;max-width:none;padding:4px 6px}

/* ---- the expandable wrapper every USER message is rendered inside ---- */
.expandableContainer_x{display:flex;position:relative;flex-direction:column;gap:4px;max-width:fit-content}
.content_x{white-space:pre-wrap;word-break:break-word;overflow-x:hidden;overflow-y:hidden;transition:max-height .3s ease-in-out}
.content_x.collapsed_x{position:relative}
.expandButton_x{position:absolute;display:flex;border:none;border-radius:4px;align-items:center;margin:4px;padding:8px;font-size:.85em;bottom:0;right:0}
.buttonContainer_x{display:flex;opacity:.9;justify-content:flex-end;align-items:flex-end}
.collapseButton_x{display:flex;cursor:pointer;border:none;border-radius:4px;align-items:center;margin:4px;padding:8px;font-size:.85em}
/* ------------------------------------------------------------------------- */
.root table{border-collapse:collapse}
.messageInputContainer_x{position:relative;display:flex;width:520px;border:1px solid #ddd}
.messageInput_x{white-space:pre-wrap;color:#0000;caret-color:#c00;flex:1;padding:10px 36px 10px 14px;outline:none;position:relative;z-index:1}
.mentionMirror_x{white-space:pre-wrap;position:absolute;inset:0;padding:10px 36px 10px 14px;pointer-events:none}
`;

function payload() {
  if (!fs.existsSync(PAYLOAD)) {
    throw new Error("dist/payload.js is missing - run `npm run build` first");
  }
  return fs.readFileSync(PAYLOAD, "utf8");
}

/**
 * Opens a page with `html` inside it and the payload running.
 *
 * `fix: false` loads the same page WITHOUT the payload. That is how a test can
 * assert that something is unchanged: measure it both ways and compare, rather
 * than hard-coding a number that a restyle upstream would silently invalidate.
 *
 * `expired: true` loads the real payload with its expiry set in the past - what a
 * block left behind by an uninstalled extension becomes once nobody re-stamps it.
 */
async function open(html, { width = 900, height = 700, fix = true, expired = false } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${html}` +
    (fix ? `<script>${expired
        ? payload().replace(/var EXPIRES_AT = \d+;/, "var EXPIRES_AT = 1;")
        : payload().replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`)
      }</script>` : "")
  );
  await page.waitForTimeout(600);   // past the payload's quiet timer
  return { browser, page, close: () => browser.close() };
}

/**
 * One USER message, as the extension nests it: the text is a bare span carrying
 * the browser's own dir="auto" guess - not a paragraph, not any block - and the
 * whole row is pinned to the top of its turn with position: sticky.
 */
const userMessage = (text, { expanded = true, sticky = true } = {}) => `
<div class="message_x${sticky ? " stickyHeader_x" : ""} timelineMessage_x"><div class="userMessageContainer_x"><div class="userMessage_x">
  <div class="expandableContainer_x">
    <div class="contentWrapper_x">
      <div class="content_x${expanded ? "" : " collapsed_x"}"${expanded ? "" : ' style="max-height:60px"'}><span dir="auto">${text}</span></div>
      ${expanded ? "" : '<div class="buttonContainer_x"><button class="expandButton_x">Show more</button></div>'}
    </div>
    ${expanded ? '<div class="buttonContainer_x"><button class="collapseButton_x">Show less</button></div>' : ""}
  </div>
</div></div></div>`;

/**
 * A whole turn inside the scroll container the extension uses: a pinned user
 * message, then an answer long enough that there is something to scroll past.
 *
 * `live` adds the toggling the extension's own component does - clicking a
 * collapsed body opens it, clicking "Show less" closes it - so that behaviour
 * which only appears WHILE a message toggles can be measured. It mimics the
 * component, it is not the component: what is under test is our reaction to it.
 */
const turn = (userHtml, { answerLines = 80, live = false } = {}) => `
<div class="messagesContainer_x" id="scroller" style="height:600px">
  <div class="turn_x">
    ${userHtml}
    <div class="message_x"><div class="root">${
      Array.from({ length: answerLines }, (_, i) => `<p>answer line ${i + 1}</p>`).join("")
    }</div></div>
  </div>
</div>${live ? `<script>
document.addEventListener("click", (e) => {
  const box = e.target.closest(".expandableContainer_x");
  if (!box) return;
  const body = box.querySelector(".content_x");
  const collapsed = body.classList.contains("collapsed_x");
  if (collapsed && !e.target.closest(".contentWrapper_x")) return;
  if (!collapsed && !e.target.closest(".collapseButton_x")) return;
  body.classList.toggle("collapsed_x");
  body.style.maxHeight = collapsed ? "" : "60px";
  box.querySelectorAll(".buttonContainer_x").forEach((n) => n.remove());
  if (collapsed) {
    box.insertAdjacentHTML("beforeend",
      '<div class="buttonContainer_x"><button class="collapseButton_x">Show less</button></div>');
  } else {
    box.querySelector(".contentWrapper_x").insertAdjacentHTML("beforeend",
      '<div class="buttonContainer_x"><button class="expandButton_x">Show more</button></div>');
  }
});
</script>` : ""}`;

/** One assistant message, as the extension nests it. */
const message = (inner) => `<div class="message timelineMessage_x"><div class="root">${inner}</div></div>`;

/**
 * What a reader sees for one block: "rtl", "ltr", or the direction the browser
 * would pick on its own if the payload left it alone.
 */
const READ_DIRECTION = `(el) => {
  if (el.getAttribute('data-bidi') === 'ltr') return 'ltr';
  if (el.closest('[data-bidi="rtl"]')) return 'rtl';
  const RTL = /[\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF]/, LAT = /[A-Za-z]/;
  for (const ch of (el.textContent || '')) {
    if (RTL.test(ch)) return 'rtl';
    if (LAT.test(ch)) return 'ltr';
  }
  return 'ltr';
}`;

/** Direction of every block in the page, in order, as [direction, text] pairs. */
async function directions(page, selector = "p,li,h1,h2,h3,h4,h5,h6,td,th") {
  return page.evaluate(([sel, readSrc]) => {
    const read = eval(readSrc);
    return [...document.querySelectorAll(sel)].map((el) => [read(el), (el.textContent || "").trim().slice(0, 46)]);
  }, [selector, READ_DIRECTION]);
}

/** A user message whose text carries a mention chip, as the extension renders one. */
const userMessageWithChip = (before, chip, after) => userMessage("").replace(
  '<span dir="auto"></span>',
  `<span dir="auto">${before}<span class="mentionChip_x" data-chip="1">${chip}</span>${after}</span>`);

module.exports = { open, message, userMessage, userMessageWithChip, turn, directions, CSS };
