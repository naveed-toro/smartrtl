/**
 * What a reader actually sees.
 *
 * Every case here is a line that came out of a real answer. Several are the exact
 * lines that broke an earlier version, kept so they cannot break again quietly.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, message, directions } = require("./support/page.js");

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

test("the timeline dot follows its own message, and content columns stay aligned", async () => {
  const urdu = message("<p>یہ اردو کا جواب ہے اور اس کی سمت دائیں سے بائیں ہے۔</p>");
  const eng  = message("<p>This answer is in English and reads left to right.</p>");
  const { page, close } = await open(urdu + eng + urdu);
  try {
    const rows = await page.$$eval(".timelineMessage_x", (els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const dot = getComputedStyle(el, "::before");
        const x = dot.left === "auto"
          ? box.right - parseFloat(dot.right) - parseFloat(dot.width)
          : box.left + parseFloat(dot.left);
        const content = el.firstElementChild.getBoundingClientRect();
        return { rtl: el.getAttribute("data-bidi-row") === "rtl", dotX: Math.round(x),
                 left: Math.round(content.left), width: Math.round(content.width) };
      }));
    assert.equal(rows.length, 3);
    assert.ok(rows[0].rtl && rows[2].rtl, "the Urdu rows should be marked");
    assert.ok(!rows[1].rtl, "the English row should not be");
    assert.ok(rows[0].dotX > rows[1].dotX, "an Urdu row's dot belongs on the right of an English row's");
    const columns = new Set(rows.map((r) => `${r.left}:${r.width}`));
    assert.equal(columns.size, 1, "every row must keep the same content column");
  } finally { await close(); }
});

test("the composer's two layers can never drift apart", async () => {
  // You type into an invisible layer and read a mirror behind it. If direction were
  // set on one and not the other, the caret would sit on the opposite side to the text.
  const { page, close } = await open(`
    <div class="messageInputContainer_x">
      <div class="mentionMirror_x"></div>
      <div class="messageInput_x" contenteditable="plaintext-only"></div>
    </div>`);
  try {
    await page.click(".messageInput_x");
    await page.keyboard.type("npm install ");
    await page.keyboard.type("کے بعد پروجیکٹ چلائیں");
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const i = document.querySelector(".messageInput_x"), m = document.querySelector(".mentionMirror_x");
      m.textContent = i.textContent;
      const last = (el) => {
        const t = el.firstChild, n = t.nodeValue.length, range = document.createRange();
        range.setStart(t, n - 1); range.setEnd(t, n);
        const b = range.getBoundingClientRect();
        return { x: Math.round(b.left), y: Math.round(b.top) };
      };
      return { dirs: [getComputedStyle(i).direction, getComputedStyle(m).direction], a: last(i), b: last(m) };
    });
    assert.equal(r.dirs[0], "rtl", "the box should turn once Urdu is typed");
    assert.equal(r.dirs[1], r.dirs[0], "both layers must always agree");
    assert.equal(r.a.x, r.b.x, "caret and glyph must sit at the same place");
    assert.equal(r.a.y, r.b.y);
  } finally { await close(); }
});

test("the composer follows what is in it right now, and goes back", async () => {
  const { page, close } = await open(`
    <div class="messageInputContainer_x">
      <div class="mentionMirror_x"></div>
      <div class="messageInput_x" contenteditable="plaintext-only"></div>
    </div>`);
  try {
    const dir = () => page.$eval(".messageInput_x", (el) => getComputedStyle(el).direction);
    await page.click(".messageInput_x");
    await page.keyboard.type("npm");
    assert.equal(await dir(), "ltr");
    await page.keyboard.type("ا");                       // one letter is enough
    assert.equal(await dir(), "rtl", "one RTL letter should turn the box");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(100);
    assert.equal(await dir(), "ltr", "deleting it should turn the box back");
  } finally { await close(); }
});
