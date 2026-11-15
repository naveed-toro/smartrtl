// The built script in a real browser page shaped like Codex's panel: every block, the box and a
// sent message carry exactly the shared rule's answer, also while an answer streams in.
// Uses Edge through Playwright (from apps/vscode-claude); skipped where neither is present.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const rule = require("../../../packages/core/src/direction.js");

let chromium = null;
try { ({ chromium } = require(path.join(__dirname, "../../vscode-claude/node_modules/playwright"))); } catch (e) {}

const script = path.join(__dirname, "../dist/smartrtl-codex.js");
const PAGE = `<!DOCTYPE html><html><head></head><body><div id="root">
<nav><p id="nav">پرانی چیٹس</p></nav>
<div class="thread">
  <div data-testid="user-message"><p id="sent">Codex میں RTL کا مسئلہ حل کرو</p></div>
  <div data-testid="assistant-message"><div class="markdown" id="answer">
    <p>یہ ایک اردو جملہ ہے۔</p><p>VS Code میں یہ فیچر موجود ہے۔</p><p>Plain English line.</p>
    <ul><li>npm کی فہرست</li></ul><pre><code>const x = 1; // اردو</code></pre>
  </div></div>
</div>
<div class="composer"><div class="ProseMirror" contenteditable="true" role="textbox" id="box"><p dir="auto"></p></div></div>
</div></body></html>`;

test("Codex's panel, by the formula and only the formula", { skip: !chromium && "playwright not installed" }, async (t) => {
  let browser;
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
  catch (e) { t.skip("Edge could not be started: " + e.message.split("\n")[0]); return; }
  try {
    const p = await browser.newPage();
    await p.setContent(PAGE);
    await p.addScriptTag({ content: fs.readFileSync(script, "utf8") });
    // it starts once the page has loaded, never in the middle of Codex's own start
    await p.waitForFunction(() => window.__smartRtlCodex && window.__smartRtlCodex.status().engine);
    const expect = (text) => rule.openingLetters(text) || null;
    const read = () => p.evaluate(() => ({
      blocks: Array.from(document.querySelectorAll("#answer p, #answer li")).map((e) => [e.textContent, e.getAttribute("data-bidi")]),
      pre: document.querySelector("#answer pre").hasAttribute("data-bidi"),
      sent: [document.getElementById("sent").textContent, document.getElementById("sent").getAttribute("data-bidi-sent") || document.getElementById("sent").getAttribute("data-bidi")],
      nav: document.getElementById("nav").hasAttribute("data-bidi"),
      box: document.getElementById("box").getAttribute("data-bidi-box"),
      // Codex's box draws its paragraphs with dir="auto", the browser's first-strong guess
      boxLine: getComputedStyle(document.querySelector("#box p")).direction,
      dir: getComputedStyle(document.querySelectorAll("#answer p")[1]).direction
    }));

    let seen = await read();
    for (const [text, dir] of seen.blocks) assert.strictEqual(dir, expect(text), text);
    assert.strictEqual(seen.sent[1], expect(seen.sent[0]));
    assert.strictEqual(seen.pre, false, "code is left alone");
    assert.strictEqual(seen.nav, false, "navigation is left alone");
    assert.strictEqual(seen.dir, "rtl", "the attribute becomes a direction");

    // an answer streaming in, and a draft in the box
    await p.evaluate(() => {
      const q = document.createElement("p"); q.textContent = "React"; document.getElementById("answer").appendChild(q);
      q.textContent = "React کا useState ہک";
      document.querySelector("#box p").textContent = "useState کیا ہے";
    });
    await p.waitForTimeout(50);
    seen = await read();
    for (const [text, dir] of seen.blocks) assert.strictEqual(dir, expect(text), text);
    assert.strictEqual(seen.box, "rtl");
    assert.strictEqual(seen.boxLine, "rtl", "dir=\"auto\" alone would have read it left to right");

    const status = await p.evaluate(() => window.__smartRtlCodex.status());
    assert.strictEqual(status.error, null);
    assert.ok(status.engine && status.engine.answerBlocks > 0);
  } finally { await browser.close(); }
});
