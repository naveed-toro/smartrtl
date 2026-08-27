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

/* ---- copied from the extension's webview/index.css: the expandable wrapper
        every USER message is rendered inside (it collapses at 60px) ---- */
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
 */
async function open(html, { width = 900, height = 700, fix = true } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewportSize: { width, height } });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${html}` +
    (fix ? `<script>${payload()}</script>` : "")
  );
  await page.waitForTimeout(600);   // past the payload's quiet timer
  return { browser, page, close: () => browser.close() };
}

/**
 * One USER message, as the extension nests it: the text is a bare span carrying
 * the browser's own dir="auto" guess - not a paragraph, not any block.
 */
const userMessage = (text, { expanded = true } = {}) => `
<div class="message timelineMessage_x"><div class="expandableContainer_x">
  <div class="contentWrapper_x">
    <div class="content_x${expanded ? "" : " collapsed_x"}"${expanded ? "" : ' style="max-height:60px"'}>
      <span dir="auto">${text}</span>
    </div>
    ${expanded ? "" : '<div class="buttonContainer_x"><button class="expandButton_x">Show more</button></div>'}
  </div>
  ${expanded ? '<div class="buttonContainer_x"><button class="collapseButton_x">Show less</button></div>' : ""}
</div></div>`;

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

module.exports = { open, message, userMessage, directions, CSS };
