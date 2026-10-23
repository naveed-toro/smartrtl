/**
 * Claude Code's own webview app, booted in a browser with the payload appended.
 *
 * Nothing here is a copy of Claude Code. Its index.js and index.css are served straight
 * off the disk, under the CSP its extension writes, and the few requests the app makes of
 * VS Code before it will render are answered with the fewest fields that let it. What is
 * typed into it is typed into the box React actually renders.
 *
 * Shared by real-bundle.test.js, which boots the installed build, and history.test.js,
 * which boots every build in a folder - so that a claim about "every build" is made by the
 * same instrument that makes the claim about this one.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { stripPatch } = require("../../src/patch-format.js");

const ORIGIN = "https://claude-code.test";
const PAYLOAD = path.resolve(__dirname, "../../dist/payload.js");

/** The fewest fields of the extension host's init reply that let the panel render. */
const STATE = {
  sweptStaleChannels: false, defaultCwd: "C:/work", openNewInTab: false, showTerminalBanner: false,
  showReviewUpsellBanner: false, isOnboardingEnabled: false, isOnboardingDismissed: true,
  authStatus: { authMethod: "claudeai", email: null, subscriptionType: null }, loginPromptDisabled: true,
  modelSetting: null, thinkingLevel: null, initialPermissionMode: "default", allowDangerouslySkipPermissions: false,
  artifactAutoOpen: false, platform: "windows", speechToTextEnabled: false, speechToTextMicDenied: false,
  marketplaceType: "vscode", useCtrlEnterToSend: false, focusViewEnabled: false, spellcheckEnabled: false,
  spellcheckUserWords: [], chromeMcpState: { status: "disconnected" }, browserIntegrationSupported: false,
  debuggerMcpState: { status: "disconnected" }, jupyterMcpState: { status: "disconnected" },
  remoteControlState: { status: "disconnected" }, settings: {}, claudeSettings: { effective: {}, errors: [] },
  experimentGates: {}, remoteControlAutoEnableDefault: false, remoteControlAvailable: false
};

/** Claude Code's own webview HTML, shaped as its extension writes it (getHtmlForWebview). */
const HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${ORIGIN} 'unsafe-inline'; font-src ${ORIGIN} data:; img-src ${ORIGIN} data:; script-src 'nonce-t'; worker-src ${ORIGIN};">
<link href="${ORIGIN}/index.css" rel="stylesheet"></head>
<body><pre id="claude-error"></pre><div id="root"></div>
<script nonce="t">
  window.IS_SIDEBAR = false; window.IS_FULL_EDITOR = false; window.IS_SESSION_LIST_ONLY = false;
  const STATE = ${JSON.stringify(STATE)};
  const post = (message) => window.postMessage({ type: "from-extension", message }, "*");
  const reply = (requestId, response) => post({ type: "response", requestId, response });
  // An answer, when a test has queued one, streamed back the way the extension host streams
  // one: the session's init, the assistant's message, the result. With nothing queued a sent
  // message gets no answer at all, which is what every test written before this expects.
  let turns = 0;
  window.__answers = [];
  // An answer queued as { text, chunk, every } is STREAMED, the way the extension host streams
  // one when partial messages are on: message_start, a text block, text_delta after text_delta,
  // then the whole assistant message and the result. The panel assembles it through its own
  // processStreamEvent. window.__streamed counts the answers that have finished.
  const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null };
  const init = (io, k) => io({ type: "system", subtype: "init", session_id: "s1", model: "claude-test", tools: [], mcp_servers: [],
                               cwd: "C:/work", permissionMode: "default", apiKeySource: "none", slash_commands: [], uuid: "i" + k });
  const whole = (io, k, text) => {
    io({ type: "assistant", uuid: "a" + k, session_id: "s1", parent_tool_use_id: null,
         message: { id: "msg_" + k, type: "message", role: "assistant", model: "claude-test",
                    content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage } });
    io({ type: "result", subtype: "success", is_error: false, result: text, session_id: "s1", uuid: "r" + k,
         duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage });
  };
  const streamIt = (io, k, text, chunk, every) => {
    const ev = (event) => io({ type: "stream_event", event, parent_tool_use_id: null, session_id: "s1", uuid: "e" + k + "_" + Math.random() });
    init(io, k);
    ev({ type: "message_start", message: { id: "msg_" + k, type: "message", role: "assistant", model: "claude-test", content: [],
                                           stop_reason: null, stop_sequence: null, usage } });
    ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    let at = 0;
    const tick = setInterval(() => {
      if (at < text.length) {
        ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(at, at + chunk) } });
        at += chunk;
        return;
      }
      clearInterval(tick);
      ev({ type: "content_block_stop", index: 0 });
      ev({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage });
      ev({ type: "message_stop" });
      whole(io, k, text);
      window.__streamed = k;
    }, every);
  };
  // From 2.1.299 a sent message is held, unseen, until the host says whether any Claude Code
  // mod may redraw it. The real host says so once the CLI reports its capabilities at the start
  // of the turn - with no mods installed, that none are served.
  const surfaced = new Set();
  const surface = (ch) => {
    if (surfaced.has(ch)) return;
    surfaced.add(ch);
    post({ type: "request", channelId: ch, requestId: "surface-" + ch, request: { type: "engine_surface_state", available: false } });
  };
  window.acquireVsCodeApi = () => ({
    postMessage(m) {
      if (m && m.type === "io_message" && m.message && m.message.type === "user") surface(m.channelId);
      if (m && m.type === "io_message" && m.message && m.message.type === "user" && window.__answers.length) {
        const queued = window.__answers.shift(), ch = m.channelId, k = ++turns;
        const io = (message) => post({ type: "io_message", channelId: ch, message });
        if (typeof queued !== "string") { streamIt(io, k, queued.text, queued.chunk || 4, queued.every || 30); return; }
        const text = queued;
        setTimeout(() => {
          io({ type: "system", subtype: "init", session_id: "s1", model: "claude-test", tools: [], mcp_servers: [],
               cwd: "C:/work", permissionMode: "default", apiKeySource: "none", slash_commands: [], uuid: "i" + k });
          io({ type: "assistant", uuid: "a" + k, session_id: "s1", parent_tool_use_id: null,
               message: { id: "msg_" + k, type: "message", role: "assistant", model: "claude-test",
                          content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
                          usage: { input_tokens: 1, output_tokens: 1 } } });
          io({ type: "result", subtype: "success", is_error: false, result: text, session_id: "s1", uuid: "r" + k,
               duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0,
               usage: { input_tokens: 1, output_tokens: 1 } });
        }, 20);
        return;
      }
      if (!m || m.type !== "request") return;
      const t = m.request && m.request.type;
      setTimeout(() => {
        if (t === "init") reply(m.requestId, { type: "init_response", state: STATE });
        else if (t === "get_claude_state") reply(m.requestId, { type: "get_claude_state_response", config: { commands: [], account: null } });
        else if (t === "list_sessions_request") reply(m.requestId, { type: "list_sessions_response", sessions: [] });
        else reply(m.requestId, { type: t + "_response" });
      }, 5);
    }, getState() {}, setState() {}
  });
</script>
<script nonce="t" src="${ORIGIN}/index.js" type="module"></script></body></html>`;

/**
 * The box you type into, however a build names it. Every build from 2.0.50 onwards has
 * marked it aria-multiline, including the ones whose class names were minified letters.
 */
const BOX = '[contenteditable][aria-multiline="true"], [class*="messageInput_"]';

/**
 * @param {string} webview  a Claude Code build's webview folder
 * @param {object} [opts]
 *   fix  {boolean}          append the payload, or boot the build untouched
 *   js   {(s)=>string}      rewrite the bundle first - the next update, made today
 *   css  {(s)=>string}      and the stylesheet
 * @returns {Promise<{page, errors: string[], pane: () => Promise<string>, close}>}
 *   errors is everything that reached the page uncaught; pane() reads the app's own error
 *   pane, where Claude Code puts anything that stopped it from starting
 */
async function boot(webview, { fix = true, js = (s) => s, css = (s) => s } = {}) {
  const clean = js(stripPatch(fs.readFileSync(path.join(webview, "index.js"), "utf8")));
  const sheet = css(fs.readFileSync(path.join(webview, "index.css"), "utf8"));
  const bundle = !fix ? clean : clean + "\n" +
    fs.readFileSync(PAYLOAD, "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message || e)));
  await page.route(ORIGIN + "/**", (route) => {
    const u = new URL(route.request().url()).pathname;
    if (u === "/" || u === "/index.html") return route.fulfill({ contentType: "text/html", body: HTML });
    if (u === "/index.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    if (u === "/index.css") return route.fulfill({ contentType: "text/css", body: sheet });
    const f = path.join(webview, u);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ contentType: u.endsWith(".css") ? "text/css" : "application/octet-stream", body: fs.readFileSync(f) });
  });
  try {
    await page.goto(ORIGIN + "/index.html");
    await page.waitForSelector(BOX, { timeout: 20000 });
  } catch (e) {
    await browser.close();
    throw e;
  }
  const pane = () => page.$eval("#claude-error", (e) => e.textContent);
  return { page, errors, pane, close: () => browser.close() };
}

/** The box, as the page has it right now - and which side its first letter is drawn on. */
const read = (page) => page.evaluate((sel) => {
  const input = document.querySelector(sel);
  const box = input.parentElement;
  const mirror = [...box.children].find((c) => c !== input && c.getAttribute("aria-hidden") === "true");
  const cs = (e) => ({ dir: getComputedStyle(e).direction, bidi: getComputedStyle(e).unicodeBidi });
  const side = (el) => {
    const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!t || !t.nodeValue.length) return null;
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 1);
    const a = r.getBoundingClientRect(), b = el.getBoundingClientRect();
    return (a.left - b.left) > b.width / 2 ? "rtl" : "ltr";
  };
  return { marked: input.getAttribute("data-bidi-box"), input: cs(input), mirror: mirror ? cs(mirror) : null,
           reads: side(mirror || input), layers: mirror ? 2 : 1 };
}, BOX);

/**
 * Sends a message in the booted app the way a person does - typed, Shift+Enter between
 * lines, Enter to send - and waits for Claude Code to draw it in the transcript.
 */
async function send(page, lines) {
  await page.click(BOX);
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(lines[i], { delay: 3 });
  }
  await page.keyboard.press("Enter");
  await page.waitForFunction((first) => {
    const scope = document.querySelector('[class*="userMessage_"]') || document.body;
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeValue.startsWith(first) && !n.parentElement.closest('[contenteditable],h1,h2,h3,[aria-hidden="true"]')) return true;
    }
    return false;
  }, lines[0], { timeout: 8000 });
  await page.waitForTimeout(200);
}

/**
 * The block a sent message's text is laid out in, found by its text rather than by any
 * name - so it is found the same way in a build that has renamed everything. It is given
 * a test-only attribute so that lines.js can measure it, and what is reported beside it
 * is whether the fix marked it, and whether anything decided the row it sits in.
 */
async function sentBlock(page, first) {
  return page.evaluate((first) => {
    const scopes = [...document.querySelectorAll('[class*="userMessage_"]')];
    for (const scope of scopes.length ? scopes : [document.body]) {
      const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue.startsWith(first) || n.parentElement.closest('[contenteditable],h1,h2,h3,[aria-hidden="true"]')) continue;
        let b = n.parentElement;
        while (b && getComputedStyle(b).display.startsWith("inline")) b = b.parentElement;
        b.setAttribute("data-test-sent", "");
        const row = b.closest("[data-transcript-message]") || b.closest('[class*="message_"]');
        return {
          ours: b.getAttribute("data-bidi-sent"),
          rowDecided: row ? [row, ...row.querySelectorAll("*")].some((e) => e.hasAttribute("data-bidi")) : null
        };
      }
    }
    return null;
  }, first);
}

/**
 * Sends a message and has the extension host answer it - for everything that only happens
 * with an answer under a message: a turn to scroll through, and a message pinned above it.
 *
 * The message is pasted rather than typed: forty lines a key at a time is minutes. A build
 * that does not take the paste gets it typed. A line that opens with "/" brings up Claude
 * Code's command menu, which Escape closes before Enter sends.
 */
async function converse(page, lines, answer) {
  await page.evaluate((a) => window.__answers.push(a), answer);
  await page.click(BOX);
  const text = lines.join("\n");
  await page.evaluate(([sel, t]) => {
    const box = document.querySelector(sel);
    box.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [BOX, text]);
  await page.waitForTimeout(150);
  if (await page.evaluate((sel) => document.querySelector(sel).textContent.length, BOX) < text.length / 2) {
    for (let i = 0; i < lines.length; i++) {
      if (i) await page.keyboard.press("Shift+Enter");
      await page.keyboard.insertText(lines[i]);
    }
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  const last = answer.split("\n").pop().trim();
  await page.waitForFunction((last) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue.trim() === last && !n.parentElement.closest("[contenteditable]")) return true;
    return false;
  }, last, { timeout: 10000 });
  await page.waitForTimeout(300);
}

/**
 * Sends one line and has the host STREAM the answer back, a few characters at a time, through
 * Claude Code's own stream assembler - and returns once the whole of it has arrived. Anything
 * that has to watch the answer being written starts watching before this is called.
 */
async function stream(page, line, text, { chunk = 4, every = 30 } = {}) {
  const before = await page.evaluate(() => window.__streamed || 0);
  await page.evaluate(([t, c, e]) => window.__answers.push({ text: t, chunk: c, every: e }), [text, chunk, every]);
  await page.click(BOX);
  await page.keyboard.type(line, { delay: 2 });
  await page.keyboard.press("Enter");
  await page.waitForFunction((b) => (window.__streamed || 0) > b, before, { timeout: 120000 });
  await page.waitForTimeout(800);
}

module.exports = { ORIGIN, STATE, HTML, BOX, boot, read, send, sentBlock, converse, stream };
