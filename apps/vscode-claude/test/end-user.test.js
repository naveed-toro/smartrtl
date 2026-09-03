/**
 * The things somebody actually does, rather than the things a fix is built for.
 *
 * Teams check a change and find nothing; the problems arrive after release, because
 * a person uses a panel for six hours and does things nobody scripted - copies an
 * answer out, writes a date in the middle of a sentence, keeps twenty messages in
 * one conversation, types while an answer is still arriving. Each of these is a
 * shape that has never been through this suite, chosen for that reason and not
 * because the code looked weak there.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, message, userMessage, directions } = require("./support/page.js");

test("messages in one conversation are decided separately, and never leak", async () => {
  // The failure this guards against was measured once and is in decisions.md: one
  // message's decision escaping onto a container that held the whole conversation.
  const { page, close } = await open(
    message("<h3>JavaScript میں Debounce فنکشن</h3><p>یہ پہلا جواب ہے۔</p>") +
    message("<h3>Debounce versus throttle</h3><p>The second answer is English throughout.</p>") +
    message("<p>children بطور props بھیجنے سے دوبارہ رینڈر نہیں ہوتا۔</p>"));
  try {
    const seen = await directions(page);
    assert.deepEqual(seen.map(([d]) => d), ["rtl", "rtl", "ltr", "ltr", "rtl"],
      "the English answer between two Urdu ones stays English");
  } finally { await close(); }
});

test("copying an answer out gives back exactly what was on the screen", async () => {
  // Nothing in an answer is restructured, but that is a claim about the code. This
  // is the claim about the clipboard, which is what somebody actually pastes into
  // an email an hour later.
  const TEXT = "JavaScript میں Debounce فنکشن\nفرض کریں ایک سرچ باکس ہے۔\nResult: 250-400ms";
  const { page, close } = await open(
    message("<h3>JavaScript میں Debounce فنکشن</h3><p>فرض کریں ایک سرچ باکس ہے۔</p><p>Result: 250-400ms</p>"));
  try {
    const copied = await page.evaluate(() => {
      const root = document.querySelector(".root");
      const range = document.createRange();
      range.selectNodeContents(root);
      const sel = getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      return sel.toString();
    });
    assert.equal(copied.split(/\s*\n\s*/).join("\n").trim(), TEXT,
      "the text comes back in the order it was written");
  } finally { await close(); }
});

test("the shapes people actually write, measured both ways", async () => {
  // Every line here OPENS with something Latin - a date, a command, a filename, an
  // identifier - because that is the actual problem and anything else tests the
  // browser rather than the fix. The first version of this test was written with
  // Urdu-first lines and passed with the payload removed, which is not a test.
  //
  // So it is run twice, and what is asserted is the DIFFERENCE: which lines the fix
  // turns, and which it leaves exactly as the panel had them.
  const CONTENT = `
    <p>12/03/2026 کو یہ کام مکمل ہوا اور اس میں 3 گھنٹے لگے۔</p>
    <p>npm install کے بعد پروجیکٹ چلائیں۔</p>
    <p><code>package.json</code> میں <code>scripts.build</code> دیکھیں۔</p>
    <p>تفصیل <a href="https://example.com/docs?a=1&amp;b=2">اس صفحے</a> پر ہے۔</p>
    <blockquote>useMemo اور useCallback کا فرق یہی ہے۔</blockquote>
    <ul><li>args — اصل arguments جو ملتے ہیں</li><li>یہ نکتہ باقی ہے</li></ul>
    <p>Result: 250-400ms</p>
    <p>The build tool comparison stays in English.</p>`;

  const read = async (fix) => {
    const { page, close } = await open(message(CONTENT), { fix });
    try {
      return {
        dirs: (await directions(page, ".root p, .root li, .root blockquote")).map(([d]) => d),
        href: await page.$eval("a", (el) => el.getAttribute("href")),
        code: await page.$$eval("code", (els) => els.map((c) => c.textContent)),
        text: await page.$eval(".root", (el) => el.textContent)
      };
    } finally { await close(); }
  };

  const off = await read(false), on = await read(true);

  // Two of these were predicted wrong before the run, and both are worth keeping:
  // a line opening `12/03/2026` renders right to left ALREADY, because digits are
  // not strong directional characters - the first strong one in it is Urdu. And the
  // list item opening `args` renders left to right, because that one is Latin. The
  // baseline is what the panel does, not what anybody expects it to do.
  assert.deepEqual(off.dirs,
    ["rtl", "ltr", "ltr", "rtl", "ltr", "ltr", "rtl", "ltr", "ltr"],
    "without the fix, four lines that open in Latin render left to right - the bug");

  assert.deepEqual(on.dirs,
    ["rtl", "rtl", "rtl", "rtl", "rtl", "rtl", "rtl", "ltr", "ltr"],
    "with it, every line that has Urdu in it reads right to left, and the two that do not are untouched");

  assert.equal(on.text, off.text, "not one character of it is rewritten");
  assert.equal(on.href, off.href, "a link is never rewritten");
  assert.deepEqual(on.code, off.code, "and neither is code");
});

test("typing a reply while an answer is still arriving", async () => {
  // Two independent paths - the composer flips live, an answer decides once - and
  // they share one MutationObserver. Nobody had ever run them at the same time.
  const { page, close } = await open(
    message('<div id="live"></div>') + `
    <div class="messageInputContainer_x">
      <div class="mentionMirror_x"></div>
      <div class="messageInput_x" contenteditable="plaintext-only"></div>
    </div>`);
  try {
    await page.evaluate(() => {
      const root = document.querySelector(".root");
      let n = 0;
      window.__streaming = setInterval(() => {
        const p = document.createElement("p");
        p.textContent = "جواب کی سطر نمبر " + (++n) + " یہاں آ رہی ہے۔";
        root.appendChild(p);
      }, 60);
    });

    await page.click(".messageInput_x");
    await page.keyboard.type("npm install ");
    const afterLatin = await page.$eval(".messageInput_x", (el) => getComputedStyle(el).direction);
    await page.keyboard.type("کے بعد چلائیں");
    await page.waitForTimeout(300);
    const afterUrdu = await page.$eval(".messageInput_x", (el) => getComputedStyle(el).direction);

    await page.evaluate(() => clearInterval(window.__streaming));
    await page.waitForTimeout(400);

    assert.equal(afterLatin, "ltr", "the box follows what is in it, not what the answer is doing");
    assert.equal(afterUrdu, "rtl");

    const answer = await directions(page, ".root p");
    assert.ok(answer.length > 3, "the answer really did keep arriving");
    for (const [dir, text] of answer) assert.equal(dir, "rtl", text);
  } finally { await close(); }
});

test("a user message and an answer in the same turn do not interfere", async () => {
  const { page, close } = await open(
    userMessage("npm install کے بعد کیا کرنا ہے؟\nAnd what about the build step?") +
    message("<p>پہلے dependencies انسٹال ہوں گی۔</p><p>Then run the build.</p>"));
  try {
    const lines = await page.$$eval(".smart-rtl-line", (els) =>
      els.map((el) => getComputedStyle(el).direction));
    assert.deepEqual(lines, ["rtl", "ltr"], "the question is split line by line");

    const answer = await directions(page, ".root p");
    assert.deepEqual(answer.map(([d]) => d), ["rtl", "ltr"],
      "and the answer decides on its own, block by block");
  } finally { await close(); }
});

test("the escape hatch puts the page back exactly as it found it", async () => {
  // __bidiFixOff() is the one thing a person has when something goes wrong, so it is
  // the one thing that must never make things worse. It did: an answer came back
  // perfectly, but a typed message stayed in the pieces the split had made of it -
  // our spans still in the DOM, the newline characters gone with them, and every
  // line break missing from anything they copied afterwards. Three lines became one
  // and the message lost 40px of height.
  //
  // Measured against a page that never had the fix on it at all, which is the only
  // definition of "back" worth asserting.
  const MULTILINE = ["npm install کے بعد پروجیکٹ چلائیں",
                     "Run the build and check the output",
                     "",
                     "یہ آخری سطر ہے"].join("\n");

  const look = () => {
    const el = document.querySelector(".userMessage_x") || document.querySelector(".root");
    return {
      html: el.innerHTML,
      text: el.textContent,
      height: Math.round(el.getBoundingClientRect().height),
      ours: document.querySelectorAll(
        "[data-bidi],[data-bidi-row],[data-bidi-line],[data-bidi-lines],.smart-rtl-line," +
        "#smart-rtl-direction,#smart-rtl-timeline").length
    };
  };

  for (const [what, html] of [
    ["a typed message", userMessage(MULTILINE)],
    ["an answer", message("<h3>JavaScript میں Debounce فنکشن</h3><p>یہ جواب ہے۔</p>")]
  ]) {
    const untouched = await (async () => {
      const { page, close } = await open(html, { fix: false });
      try { return await page.evaluate(look); } finally { await close(); }
    })();

    const { page, close } = await open(html);
    try {
      const during = await page.evaluate(look);
      assert.ok(during.ours > 0, `${what}: the fix was actually on`);

      await page.evaluate(() => window.__bidiFixOff());
      await page.waitForTimeout(300);
      const after = await page.evaluate(look);

      assert.equal(after.ours, 0, `${what}: nothing of ours may be left behind`);
      assert.equal(after.html, untouched.html, `${what}: the markup comes back`);
      assert.equal(after.text, untouched.text, `${what}: every line break comes back`);
      assert.equal(after.height, untouched.height, `${what}: and it occupies the same space`);
    } finally { await close(); }
  }
});
