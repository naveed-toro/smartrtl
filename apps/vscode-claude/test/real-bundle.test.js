/**
 * Claude Code's own app, running, with this payload in it.
 *
 * Every other file here builds a page that looks like Claude Code's: its CSS, its class
 * names, markup copied out of its bundle. That is how everything was understood, and it
 * has a weakness nothing removes - it is a copy. Four times the copy was simpler than the
 * thing and hid a fault: a mirror that was not React's, a composer that existed before
 * the payload ran, a probe that always had something to measure, and a sent message with
 * no hidden heading above it.
 *
 * So this does not copy anything. It serves the installed Claude Code's own webview -
 * index.js and index.css, straight off the disk - under its own CSP, with the payload
 * from dist/ appended the way the patcher appends it, and answers the requests the app
 * makes of VS Code with the fewest fields that let it render. Then it types into the
 * composer React actually renders, and reads the page back.
 *
 * With no Claude Code installed it skips.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const real = require("./support/real.js");
const { stripPatch } = require("../src/patch-format.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;
const ORIGIN = "https://claude-code.test";

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
  const reply = (requestId, response) => window.postMessage({ type: "from-extension",
    message: { type: "response", requestId, response } }, "*");
  window.acquireVsCodeApi = () => ({
    postMessage(m) {
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

async function boot({ fix = true } = {}) {
  const clean = stripPatch(fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8"));
  const bundle = !fix ? clean : clean + "\n" +
    fs.readFileSync(path.resolve(__dirname, "../dist/payload.js"), "utf8")
      .replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await page.route(ORIGIN + "/**", (route) => {
    const u = new URL(route.request().url()).pathname;
    if (u === "/" || u === "/index.html") return route.fulfill({ contentType: "text/html", body: HTML });
    if (u === "/index.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    const f = path.join(WEBVIEW, u);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ contentType: u.endsWith(".css") ? "text/css" : "application/octet-stream", body: fs.readFileSync(f) });
  });
  await page.goto(ORIGIN + "/index.html");
  await page.waitForSelector('[class*="messageInput_"]', { timeout: 20000 });
  return { page, close: () => browser.close() };
}

/** The box, as the page has it right now. */
const read = (page) => page.evaluate(() => {
  const input = document.querySelector('[class*="messageInput_"]');
  const box = input.parentElement;
  const mirror = [...box.children].find((c) => c !== input && c.getAttribute("aria-hidden") === "true");
  const cs = (e) => ({ dir: getComputedStyle(e).direction, bidi: getComputedStyle(e).unicodeBidi });
  return { marked: box.getAttribute("data-bidi-input"), input: cs(input), mirror: mirror ? cs(mirror) : null,
           status: window.__bidiStatus ? window.__bidiStatus().composer : "the payload did not run" };
});

test("inside Claude Code's own running app, the box you type in turns", { skip }, async () => {
  const { page, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("Hello ہیلو", { delay: 20 });
    await page.waitForTimeout(300);
    const r = await read(page);
    assert.equal(r.marked, "rtl", "the box was not marked");
    assert.equal(r.input.dir, "rtl", "the box holding the caret");
    assert.ok(r.mirror, "the layer drawn over the box was not found");
    assert.equal(r.mirror.dir, "rtl", "and the layer that is read");
    assert.notEqual(r.mirror.bidi, "plaintext", "Claude Code's own plaintext must not win");
    assert.equal(r.status, "on - measured working");
  } finally { await close(); }
});

test("and when Claude Code empties the box itself, it goes back", { skip }, async () => {
  // Claude Code clears the box from code - `b1.current.textContent = ""` - when a message
  // is sent. No input event fires. Only the app itself can do this for real, so this is
  // the one place it can be tested for real.
  const { page, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("اسلام علیکم", { delay: 20 });
    await page.waitForTimeout(200);
    assert.equal((await read(page)).marked, "rtl");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[class*="messageInput_"]').textContent === "",
      null, { timeout: 5000 });
    await page.waitForTimeout(200);
    assert.equal((await read(page)).marked, null, "an emptied box must not stay turned for the next message");
  } finally { await close(); }
});

test("typing in Claude Code's own app is exactly as quick with this in it", { skip }, async () => {
  // The whole point is that nobody can tell this is not Claude Code's own work - and a box
  // that answers a beat late is the one thing anybody would notice at once. So the same
  // sentence is typed into the same app with the fix and without it, and the time until
  // every letter is on the screen is compared. Generous on purpose: the harness sends
  // keys one round trip at a time, so what this can catch is a real cost per keystroke,
  // not a microsecond - and that is the kind that matters.
  const TEXT = "یہ ایک لمبا اردو جملہ ہے جو ٹائپ ہو رہا ہے اور Hello بھی ساتھ ہے";
  const time = async (fix) => {
    const { page, close } = await boot({ fix });
    try {
      await page.click('[class*="messageInput_"]');
      const t0 = Date.now();
      await page.keyboard.type(TEXT, { delay: 0 });
      await page.waitForFunction((n) => {
        const i = document.querySelector('[class*="messageInput_"]');
        const m = [...i.parentElement.children].find((c) => c !== i && c.getAttribute("aria-hidden") === "true");
        return !!m && m.textContent.length >= n;
      }, TEXT.length, { timeout: 15000 });
      return Date.now() - t0;
    } finally { await close(); }
  };
  // Taken in turns, three of each, and compared by median. Measured one after the other,
  // a busy machine landed on the second run alone and read as the fix tripling the time -
  // 839ms against 283ms - while the same two, measured quietly, were 144ms and 131ms:
  // about a fifth of a millisecond a keystroke. In turns, a busy moment falls on both.
  const withRuns = [], withoutRuns = [];
  for (let i = 0; i < 3; i++) { withoutRuns.push(await time(false)); withRuns.push(await time(true)); }
  const median = (a) => a.slice().sort((x, y) => x - y)[1];
  const without = median(withoutRuns), withFix = median(withRuns);
  assert.ok(withFix <= without * 1.5 + 200,
    `typing took ${withFix}ms with the fix and ${without}ms without it (runs ${JSON.stringify(withRuns)} / ${JSON.stringify(withoutRuns)})`);
});

test("an English draft in Claude Code's own app is left exactly as it was", { skip }, async () => {
  const { page, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("Run the build and check it", { delay: 10 });
    await page.waitForTimeout(200);
    const r = await read(page);
    assert.equal(r.marked, null);
    assert.equal(r.input.dir, "ltr");
  } finally { await close(); }
});
