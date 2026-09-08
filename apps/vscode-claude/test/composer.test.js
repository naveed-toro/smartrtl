/**
 * The box you type into.
 *
 * It takes ONE direction, live, from any RTL letter in it, through one attribute and
 * one CSS rule. Nothing of ours goes inside it, nothing is observed, and no code of
 * ours runs while somebody types.
 *
 * That is the end of three attempts at doing better, not the first one, and the two
 * things that ended them are the reason this file is short:
 *
 *   0.3.0  an element per line, made inside the mirror. The mirror is React's; the
 *          spans threw React's own nodes away, it stopped updating - the box typed
 *          BLANK SPACES - and React's next removeChild took the whole panel down.
 *          test/host-owned-dom.test.js is that fault, stated as a rule.
 *
 *   0.3.3  the same elements, but React's mirror left untouched and a CLONE of it
 *          drawn instead. Safe, and still wrong: measured, every keystroke reached
 *          the screen one keystroke late - type a letter and see nothing, type the
 *          next and the first appears. The clone is painted in a capture-phase input
 *          handler, before the host has redrawn its own mirror, and the observer
 *          meant to correct that had nothing to attach to: the composer does not
 *          exist yet when the payload runs.
 *
 * A box that types a letter behind is worse than a box that reads the wrong way
 * round. The per-line rule is kept where it costs nothing and cannot be felt - the
 * message once it is SENT, in perline.test.js, where the lines are real elements in
 * a page nobody is typing into.
 *
 * What that leaves, said plainly: a draft mixing Urdu and English goes right to left
 * as a whole. That is the platform's limit, accepted rather than fought.
 *
 * Every test here measures where the text actually sits, not what an attribute says.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, lineBoxes, lineReads } = require("./support/page.js");

const BOX = [
  '<div class="messageInputContainer_x">',
  '  <div class="mentionMirror_x"></div>',
  '  <div class="messageInput_x" contenteditable="plaintext-only"></div>',
  '</div>',
  '<script>',
  '  document.querySelector(".messageInput_x").addEventListener("input", function () {',
  '    document.querySelector(".mentionMirror_x").textContent =',
  '      document.querySelector(".messageInput_x").textContent;',
  '  });',
  '</script>'
].join("\n");

async function type(page, lines) {
  await page.click(".messageInput_x");
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(lines[i], { delay: 3 });
  }
  await page.waitForTimeout(200);
}

test("a draft that opens in English and turns Urdu reads right to left", async () => {
  // The project's rule rather than the browser's: any RTL letter wins, against the
  // first strong character. Type "Hello", then "ہیلو" beside it, and the box turns.
  const { page, close } = await open(BOX);
  try {
    await type(page, ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".messageInput_x"), ["rtl"]);
    assert.equal(await page.$eval(".messageInputContainer_x",
      (el) => el.getAttribute("data-bidi-input")), "rtl");
  } finally { await close(); }
});

test("and it goes back the moment the Urdu does", async () => {
  // Live rather than sticky. An input has to show what is in it right now, unlike an
  // answer, where a decision is taken once and kept because a wrong guess there stays
  // on the screen until a reload and here it costs one backspace.
  const { page, close } = await open(BOX);
  try {
    await type(page, ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".messageInput_x"), ["rtl"]);
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.waitForTimeout(100);
    assert.deepEqual(await lineReads(page, ".messageInput_x"), ["ltr"]);
    assert.equal(await page.$eval(".messageInputContainer_x",
      (el) => el.hasAttribute("data-bidi-input")), false);
  } finally { await close(); }
});

test("a mixed draft turns as a whole - the limit, written down", async () => {
  // Not a wish list and not a bug report: this is what the box does, and it is here
  // so that a change to it has to change this test and say why. An English line in an
  // Urdu draft is carried along with it, because one box has one direction and there
  // is nowhere to put a second one that does not cost a keystroke of lag.
  const { page, close } = await open(BOX);
  try {
    await type(page, ["اسلام علیکم", "Run the build and check it."]);
    assert.deepEqual(await lineReads(page, ".messageInput_x"), ["rtl", "rtl"]);
  } finally { await close(); }
});

test("the two layers never disagree", async () => {
  // The caret is in one layer and every glyph you can see is in the other - the box
  // itself is color:#0000. One attribute on the container they share flips both, so
  // the caret cannot end up on one side of the panel with the letter it is about to
  // insert on the other. Not by discipline: there is only one thing being set.
  const { page, close } = await open(BOX);
  try {
    await type(page, ["یہ کوڈ دیکھیں", "const x = useMemo(a, b);"]);
    const input = await lineBoxes(page, ".messageInput_x");
    const mirror = await lineBoxes(page, ".mentionMirror_x");
    assert.equal(mirror.length, input.length);
    for (let i = 0; i < input.length; i++) {
      assert.equal(mirror[i].firstChar, input[i].firstChar,
        "line " + i + " starts in a different place in each layer");
      assert.equal(mirror[i].leftGap, input[i].leftGap,
        "line " + i + " is not aligned the same way in each layer");
    }
  } finally { await close(); }
});

test("an English-only draft is left alone entirely", async () => {
  const DRAFT = ["Run the build and check it.", "Then open the report."];
  const plain = await open(BOX, { fix: false });
  const fixed = await open(BOX);
  try {
    await type(plain.page, DRAFT);
    await type(fixed.page, DRAFT);
    assert.deepEqual(await lineBoxes(fixed.page, ".messageInput_x"),
                     await lineBoxes(plain.page, ".messageInput_x"),
      "not one pixel of an English draft moves");
    assert.equal(await fixed.page.$eval(".messageInputContainer_x",
      (el) => el.hasAttribute("data-bidi-input")), false);
  } finally { await plain.close(); await fixed.close(); }
});

test("nothing of ours is ever inside the box, or beside it", async () => {
  // The whole of what went wrong twice, asserted as a shape rather than a behaviour:
  // the box holds one run of text, exactly as the browser left it, and the container
  // holds the two layers the host rendered and nothing else.
  const { page, close } = await open(BOX);
  try {
    await type(page, ["Hello ہیلو", "دوسری سطر"]);
    const shape = await page.evaluate(() => {
      const input = document.querySelector(".messageInput_x");
      const box = document.querySelector(".messageInputContainer_x");
      return {
        elementsInside: input.querySelectorAll("*").length,
        childrenOfBox: box.children.length,
        classes: [...box.children].map((n) => n.className),
        text: input.textContent
      };
    });
    assert.equal(shape.elementsInside, 0, "the box holds text, and no element of ours");
    assert.equal(shape.childrenOfBox, 2, "no layer of ours has been added beside theirs");
    assert.deepEqual(shape.classes, ["mentionMirror_x", "messageInput_x"]);
    assert.equal(shape.text, "Hello ہیلو\nدوسری سطر");
  } finally { await close(); }
});

test("a keystroke is on the screen in the frame it was typed", async () => {
  // 0.3.3 failed exactly here, and no test caught it: what a person sees was one
  // keystroke behind. Read at the first paint after each key, so a layer that is
  // repainted a task later cannot pass.
  const { page, close } = await open(BOX);
  try {
    await page.click(".messageInput_x");
    const behind = [];
    for (const ch of ["ہ", "ی", "ل", "و"]) {
      await page.keyboard.type(ch);
      const seen = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r({
        typed: document.querySelector(".messageInput_x").textContent,
        shown: document.querySelector(".mentionMirror_x").textContent
      }))));
      if (seen.typed !== seen.shown) behind.push(seen);
    }
    assert.deepEqual(behind, [], "the layer you read was behind the box");
  } finally { await close(); }
});

const CHIP_BOX = [
  '<div class="messageInputContainer_x">',
  '  <div class="mentionMirror_x"></div>',
  '  <div class="messageInput_x" contenteditable="plaintext-only"></div>',
  '</div>',
  '<script>',
  '  document.querySelector(".messageInput_x").addEventListener("input", function () {',
  '    var m = document.querySelector(".mentionMirror_x");',
  '    m.textContent = "";',
  '    var text = document.querySelector(".messageInput_x").textContent;',
  '    text.split(/(@[A-Za-z0-9_.]+)/).forEach(function (piece) {',
  '      if (piece.charAt(0) === "@") {',
  '        var chip = document.createElement("span");',
  '        chip.className = "inputMentionChip_x";',
  '        chip.setAttribute("data-chip", "1");',
  '        chip.textContent = piece;',
  '        m.appendChild(chip);',
  '      } else if (piece) m.appendChild(document.createTextNode(piece));',
  '    });',
  '  });',
  '</script>'
].join("\n");

test("a mention chip is not moved, copied or hidden - it is not touched", async () => {
  const { page, close } = await open(CHIP_BOX);
  try {
    await type(page, ["@mainfile کو دیکھیں"]);
    const chip = await page.$eval(".mentionMirror_x .inputMentionChip_x", (el) => ({
      kept: el.getAttribute("data-chip"),
      text: el.textContent,
      visible: getComputedStyle(el).visibility,
      parentIsTheMirror: el.parentElement.className === "mentionMirror_x"
    }));
    assert.equal(chip.kept, "1", "the host's own element, not a copy of it");
    assert.equal(chip.text, "@mainfile");
    assert.equal(chip.visible, "visible");
    assert.ok(chip.parentIsTheMirror, "exactly where the host left it");
  } finally { await close(); }
});

test("ctrl+z is the browser's, and still works", async () => {
  // 0.3.0 and 0.3.3 both had to carry an undo stack of their own, because rewriting a
  // box's insides destroys the browser's. Nothing rewrites anything now, so undo -
  // and IME, dictation, autocorrect and spellcheck with it - is somebody else's job
  // again, and nothing here is capable of breaking it.
  const DRAFT = ["Hello ہیلو دنیا"];
  const { page, close } = await open(BOX);
  try {
    await type(page, DRAFT);
    const typed = await page.$eval(".messageInput_x", (el) => el.textContent);

    for (let i = 0; i < 30; i++) await page.keyboard.press("Control+z");
    const undone = await page.$eval(".messageInput_x", (el) => el.textContent);
    assert.ok(undone.length < typed.length - 5, "ctrl+z did nothing at all");

    for (let i = 0; i < 30; i++) await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.$eval(".messageInput_x", (el) => el.textContent), typed,
      "redo brings back exactly what was typed");
  } finally { await close(); }
});

test("copying a draft out gives back exactly what was typed", async () => {
  const DRAFT = ["Hello ہیلو", "", "Run the build", "شکریہ"];
  const { page, close } = await open(BOX);
  try {
    await type(page, DRAFT);
    const copied = await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector(".messageInput_x"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    });
    assert.equal(copied, DRAFT.join("\n"));
  } finally { await close(); }
});

test("the escape hatch leaves the box exactly as it found it", async () => {
  const { page, close } = await open(BOX);
  try {
    await type(page, ["Hello ہیلو"]);
    const after = await page.evaluate(() => {
      window.__bidiFixOff();
      const input = document.querySelector(".messageInput_x");
      return {
        text: input.textContent,
        attr: document.querySelector(".messageInputContainer_x").hasAttribute("data-bidi-input"),
        direction: getComputedStyle(input).direction
      };
    });
    assert.equal(after.text, "Hello ہیلو");
    assert.equal(after.attr, false);
    assert.equal(after.direction, "ltr");
  } finally { await close(); }
});

/**
 * The same box, but built AFTER the payload has run - which is what the real webview
 * does, because React has not rendered the composer when a patch at the end of its own
 * bundle executes.
 *
 * This is the gap that hid the keystroke of lag in 0.3.3, and it is the third time the
 * same shape of gap has hidden a fault: the harness modelled as already-there a page
 * that is built at runtime. Anything that attaches to the composer element instead of
 * delegating from the document is dead on the real page and alive here, and only this
 * can tell the two apart.
 */
const LATE_BOX = [
  '<script>',
  '  setTimeout(function () {',
  '    document.body.insertAdjacentHTML("beforeend", ' + JSON.stringify(
       '<div class="messageInputContainer_x">' +
       '<div class="mentionMirror_x"></div>' +
       '<div class="messageInput_x" contenteditable="plaintext-only"></div>' +
       '</div>') + ');',
  '    document.querySelector(".messageInput_x").addEventListener("input", function () {',
  '      document.querySelector(".mentionMirror_x").textContent =',
  '        document.querySelector(".messageInput_x").textContent;',
  '    });',
  '  }, 50);',
  '</script>'
].join("\n");

test("a composer that arrives after the payload behaves the same in every way", async () => {
  const { page, close } = await open(LATE_BOX);
  try {
    await page.waitForSelector(".messageInput_x");
    await page.click(".messageInput_x");

    // no keystroke may be late
    const behind = [];
    for (const ch of ["ہ", "ی", "ل", "و"]) {
      await page.keyboard.type(ch);
      const seen = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r({
        typed: document.querySelector(".messageInput_x").textContent,
        shown: document.querySelector(".mentionMirror_x").textContent
      }))));
      if (seen.typed !== seen.shown) behind.push(seen);
    }
    assert.deepEqual(behind, [], "the layer you read was behind the box");

    // and the direction is still decided, from a listener that was attached to the
    // document long before this box existed
    assert.deepEqual(await lineReads(page, ".messageInput_x"), ["rtl"]);
    assert.equal(await page.$eval(".messageInputContainer_x",
      (el) => el.getAttribute("data-bidi-input")), "rtl");
  } finally { await close(); }
});
