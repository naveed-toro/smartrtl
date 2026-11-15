// The built script in a real browser page shaped like Qoder's chat: every answer block, the
// box and a sent message carry exactly the shared rule's answer, also while an answer streams.
// Uses Edge through Playwright (from apps/vscode-claude); skipped where neither is present.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const rule = require("../../../packages/core/src/direction.js");

let chromium = null;
try { ({ chromium } = require(path.join(__dirname, "../../vscode-claude/node_modules/playwright"))); } catch (e) {}

const script = path.join(__dirname, "../dist/smartrtl-qoder.js");
const PAGE = `<!DOCTYPE html><html><head></head><body>
<div class="agentchat-container"><div class="chat-panel"><div class="chat-messages chat-messages--conversation">
  <div class="chat-message chat-message-user scroll-container"><div class="message-content"><div class="user-message-content">
    <div class="chat-mixed-input-container user-send-message-input"><div class="chat-input-wrapper">
      <div class="chat-input-contenteditable" contenteditable="false" id="sent">Qoder میں RTL کا مسئلہ حل کرو</div>
    </div><div class="monaco-action-bar agentchat-primary-actions"></div></div>
  </div></div></div>
  <div class="chat-message chat-message-assistant"><div class="streaming-prose" id="answer">
    <p>یہ ایک اردو جملہ ہے۔</p><p>VS Code میں یہ فیچر موجود ہے۔</p><p>Plain English line.</p>
    <ul><li>Qoder کی فہرست</li></ul><pre><code>const x = 1;</code></pre>
  </div></div>
</div>
<div class="chat-mixed-input-container"><div class="chat-input-wrapper">
  <div class="chat-input-contenteditable" contenteditable="true" id="box"></div>
</div><div class="monaco-action-bar agentchat-primary-actions"></div></div>
</div></div>
<div class="editor"><p id="editor">یہ ایڈیٹر ہے، چیٹ نہیں</p></div>
</body></html>`;

test("Qoder's chat, by the formula and only the formula", { skip: !chromium && "playwright not installed" }, async (t) => {
  let browser;
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
  catch (e) { t.skip("Edge could not be started: " + e.message.split("\n")[0]); return; }
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE);
    await page.addScriptTag({ content: fs.readFileSync(script, "utf8") });
    const expect = (text) => rule.openingLetters(text) || null;
    const read = () => page.evaluate(() => ({
      blocks: Array.from(document.querySelectorAll("#answer p, #answer li")).map((e) => [e.textContent, e.getAttribute("data-bidi")]),
      pre: document.querySelector("#answer pre").hasAttribute("data-bidi"),
      sent: [document.getElementById("sent").textContent, document.getElementById("sent").getAttribute("data-bidi")],
      box: document.getElementById("box").getAttribute("data-bidi-box"),
      editor: document.getElementById("editor").hasAttribute("data-bidi"),
      sheet: !!document.getElementById("smart-rtl-direction")
    }));

    let seen = await read();
    for (const [text, dir] of seen.blocks) assert.strictEqual(dir, expect(text), text);
    assert.strictEqual(seen.sent[1], expect(seen.sent[0]), "the sent message");
    assert.strictEqual(seen.pre, false, "code is left alone");
    assert.strictEqual(seen.editor, false, "outside the chat is left alone");
    assert.strictEqual(seen.sheet, true);

    // an answer streaming in, and a draft being typed
    await page.evaluate(() => {
      const p = document.createElement("p");
      document.getElementById("answer").appendChild(p);
      p.textContent = "Stream";
      p.textContent = "اب streaming والا جملہ";
      document.getElementById("box").textContent = "میں لکھ رہا ہوں";
    });
    seen = await read();
    for (const [text, dir] of seen.blocks) assert.strictEqual(dir, expect(text), text);
    assert.strictEqual(seen.box, expect("میں لکھ رہا ہوں"), "the box");

    const status = await page.evaluate(() => window.__smartRtlQoder.status());
    assert.strictEqual(status.error, null);
    assert.match(status.engine.box, /rtl|ltr/);

    // stop takes every mark and the stylesheet away
    await page.evaluate(() => window.__smartRtlQoder.stop());
    const left = await page.evaluate(() => document.querySelectorAll("[data-bidi],[data-bidi-box],[data-bidi-sent],#smart-rtl-direction").length);
    assert.strictEqual(left, 0);
  } finally { await browser.close(); }
});
