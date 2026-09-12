/**
 * What a reader actually sees.
 *
 * Every case here is a line that came out of a real answer. Several are the exact
 * lines that broke an earlier version, kept so they cannot break again quietly.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, message, directions, lineReads } = require("./support/page.js");

test("an Urdu answer: the five headings that used to render left-to-right", async () => {
  const { page, close } = await open(message(`
    <h3><code>useMemo</code> اور <code>useCallback</code></h3>
    <h3><b>children</b> بطور <b>props</b></h3>
    <h3>JavaScript میں Debounce فنکشن</h3>
    <h3>Debounce بمقابلہ Throttle</h3>
    <ul><li><code>args</code> — اصل arguments.</li></ul>
    <p>یہ سب ایک ہی اردو جواب کی سطریں ہیں۔</p>`));
  try {
    for (const [dir, text] of await directions(page)) {
      assert.equal(dir, "rtl", `should read right-to-left: ${text}`);
    }
  } finally { await close(); }
});

test("inside an Urdu answer, text with no RTL in it is left exactly as it was", async () => {
  // The safety rule. "250-400ms" with an en dash came out reversed when this was
  // missing, because the dash resolves to whatever direction the paragraph has.
  const { page, close } = await open(message(`
    <p>یہ اردو کی سطر ہے۔</p>
    <p>The build tool comparison is documented upstream and stays in English.</p>
    <table><tr><td>سرچ باکس</td><td>250–400ms</td></tr>
           <tr><td>Auto-save</td><td>1000–2000ms</td></tr></table>
    <pre>npm install --save-dev vite</pre>`));
  try {
    const seen = Object.fromEntries((await directions(page)).map(([d, t]) => [t, d]));
    assert.equal(seen["یہ اردو کی سطر ہے۔"], "rtl");
    assert.equal(seen["The build tool comparison is documented upstream a"] ?? seen[Object.keys(seen).find(k => k.startsWith("The build"))], "ltr");
    assert.equal(seen["250–400ms"], "ltr", "a numeric range must not be dragged into rtl");
    assert.equal(seen["Auto-save"], "ltr");
    const code = await page.$eval("pre", (el) => getComputedStyle(el).direction);
    assert.equal(code, "ltr", "code blocks are never touched");
  } finally { await close(); }
});

test("an English answer is not touched at all", async () => {
  const { page, close } = await open(message(`
    <h3>Event loop basics</h3>
    <p>The call stack runs synchronously and the microtask queue drains first.</p>
    <p><code>process.nextTick</code> runs before promise microtasks.</p>`));
  try {
    const marked = await page.$$eval("[data-bidi]", (els) => els.length);
    assert.equal(marked, 0, "nothing in a purely English answer should be marked");
  } finally { await close(); }
});

test("every right-to-left language, not just Arabic script", async () => {
  for (const [label, html] of [
    ["Hebrew",  "<h3>React מול Vue</h3><p>שני הכלים טובים, אבל React נפוץ יותר.</p>"],
    ["Persian", "<h3>Webpack در برابر Vite</h3><p>سرعت ساخت با Vite بیشتر است.</p>"],
    ["Arabic",  "<h3>Debounce مقابل Throttle</h3><p>الفرق بينهما بسيط لكنه مهم.</p>"]
  ]) {
    const { page, close } = await open(message(html));
    try {
      for (const [dir, text] of await directions(page)) {
        assert.equal(dir, "rtl", `${label}: ${text}`);
      }
    } finally { await close(); }
  }
});

test("a message's dot is mirrored exactly, not merely moved", async () => {
  // The whole test, in one sentence: the two sides have to be the SAME behaviour.
  //
  //   english   [row edge] --9-- (dot) --14-- text starts...
  //   urdu      ...text ends --14-- (dot) --9-- [row edge]
  //
  // If those numbers ever stop matching, a reader in Urdu is looking at a second design
  // rather than at their own one, and the whole point of this project - that it should
  // feel like Claude Code always did this - is gone. It is not enough for the dot to be
  // "on the right"; it has to sit where its own reader expects it, at the same distances.
  const urdu = message("<p>یہ اردو کا جواب ہے اور اس کی سمت دائیں سے بائیں ہے۔</p>");
  const eng  = message("<p>This answer is in English and reads left to right.</p>");
  const { page, close } = await open(urdu + eng + urdu);
  try {
    const rows = await page.$$eval(".timelineMessage_x", (els) =>
      els.map((el) => {
        const row = el.getBoundingClientRect();
        const t = el.firstElementChild.getBoundingClientRect();
        const d = getComputedStyle(el, "::before");
        const w = parseFloat(d.width) || 0;
        const dotL = d.left === "auto" ? row.right - parseFloat(d.right) - w : row.left + parseFloat(d.left);
        const rtl = el.getAttribute("data-bidi-row") === "rtl";
        return {
          rtl,
          edgeToDot: Math.round(rtl ? row.right - (dotL + w) : dotL - row.left),
          dotToText: Math.round(rtl ? dotL - t.right : t.left - (dotL + w)),
          edgeToText: Math.round(rtl ? row.right - t.right : t.left - row.left),
          width: Math.round(t.width)
        };
      }));
    assert.equal(rows.length, 3);
    assert.ok(rows[0].rtl && rows[2].rtl, "the Urdu rows should be marked");
    assert.ok(!rows[1].rtl, "the English row should not be");

    // the mirror, measured from each row's own reading edge
    for (const key of ["edgeToDot", "dotToText", "edgeToText"]) {
      assert.equal(rows[0][key], rows[1][key],
        `${key} is ${rows[0][key]} for an Urdu row and ${rows[1][key]} for an English one - that is two designs, not one mirrored`);
    }

    // and nobody pays for anybody else's gutter: every row keeps the width it had
    assert.equal(new Set(rows.map((r) => r.width)).size, 1,
      "a row lost width to another row's dot: " + rows.map((r) => r.width).join(", "));
  } finally { await close(); }
});

test("the composer's two layers can never drift apart", async () => {
  // You type into an invisible layer and read a mirror behind it. If a line were laid
  // out differently in one than in the other, the caret would sit on the opposite side
  // of the panel to the letter it is about to insert.
  //
  // One attribute on the container they share flips both, from one rule, so the
  // question is settled by construction rather than by keeping two sets of elements
  // in step - which is what two earlier versions tried: one took the panel down with
  // it, the other put every keystroke on the screen a keystroke late.
  const { page, close } = await open(`
    <div class="messageInputContainer_x">
      <div class="mentionMirror_x"></div>
      <div class="messageInput_x" contenteditable="plaintext-only"></div>
    </div>`);
  try {
    await page.click(".messageInput_x");
    await page.keyboard.type("npm install");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("کے بعد پروجیکٹ چلائیں");
    await page.waitForTimeout(200);
    const r = await page.evaluate(async () => {
      const i = document.querySelector(".messageInput_x"), m = document.querySelector(".mentionMirror_x");
      // this page has no host drawing the mirror, so stand in for one, and let the
      // fix react to that before anything is measured
      m.textContent = i.textContent;
      await new Promise((res) => requestAnimationFrame(() => res()));
      // Where the last character of a layer is drawn. Found by walking to the last
      // text node rather than assuming the layer's first child IS the text - since
      // each line became its own element, it is not, and a test that knows the shape
      // of the DOM stops testing what it was written to test.
      const last = (el) => {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node, t = null;
        while ((node = w.nextNode())) if (node.nodeValue.length) t = node;
        const n = t.nodeValue.length, range = document.createRange();
        range.setStart(t, n - 1); range.setEnd(t, n);
        const b = range.getBoundingClientRect();
        return { x: Math.round(b.left), y: Math.round(b.top) };
      };
      return { a: last(i), b: last(m) };
    });
    assert.equal(r.a.x, r.b.x, "caret and glyph must sit at the same place");
    assert.equal(r.a.y, r.b.y);
    assert.deepEqual(await lineReads(page, ".messageInput_x"), ["rtl", "rtl"],
      "one direction for the box, so the command goes with the Urdu under it");
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"),
                     await lineReads(page, ".messageInput_x"),
      "and the layer you read says the same as the one holding the caret");
  } finally { await close(); }
});

test("the composer follows what is in it right now, and goes back", async () => {
  // A box that shows a draft has to show what is in it AT THIS KEYSTROKE - unlike an
  // answer, where a decision is taken once and kept, because there a wrong guess
  // stays on the screen until a reload and here it costs one backspace.
  const { page, close } = await open(`
    <div class="messageInputContainer_x">
      <div class="mentionMirror_x"></div>
      <div class="messageInput_x" contenteditable="plaintext-only"></div>
    </div>`);
  try {
    const line = async () => (await lineReads(page, ".messageInput_x"))[0];
    await page.click(".messageInput_x");
    await page.keyboard.type("ا");                       // one letter is enough
    assert.equal(await line(), "rtl", "one RTL letter should turn the line");
    await page.keyboard.type("سلام");
    assert.equal(await line(), "rtl");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("npm");
    await page.waitForTimeout(100);
    assert.equal(await line(), "ltr", "deleting it should turn the line back");
  } finally { await close(); }
});
