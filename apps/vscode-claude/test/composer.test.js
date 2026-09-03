/**
 * The box you type into, line by line.
 *
 * Until now it decided once for everything in it: paste a command, press shift+enter,
 * write Urdu underneath, and the command was dragged along with the Urdu. Each line
 * now decides for itself, the way each line of a message does once it has been sent.
 *
 * Four things have to survive that, and each is asserted here rather than assumed,
 * because each was broken at some point while it was being built:
 *
 *   the text     the newline characters stay between the lines, so what gets sent is
 *                byte for byte what was typed
 *   the caret    both layers must agree, or the caret sits on one side and the glyph
 *                on the other
 *   the chips    a mention is an element the host attached handlers to; it is moved,
 *                never rebuilt
 *   undo         rewriting the box's insides kills the browser's undo stack, so the
 *                fix keeps its own - and ctrl+z has to still work, and redo with it
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("./support/page.js");

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

const lineDirs = (page, sel) => page.$$eval(sel + " .smart-rtl-input-line",
  (els) => els.map((e) => e.getAttribute("data-bidi-line") || "ltr"));

async function type(page, lines) {
  await page.click(".messageInput_x");
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(lines[i], { delay: 3 });
  }
  await page.waitForTimeout(200);
}

test("each line of a draft decides for itself", async () => {
  const DRAFT = ["npm install کے بعد پروجیکٹ چلائیں",
                 "Run the build and check it.",
                 "اور بتائیں کہ ٹھیک ہے؟"];
  const { page, close } = await open(BOX);
  try {
    await type(page, DRAFT);
    assert.deepEqual(await lineDirs(page, ".messageInput_x"), ["rtl", "ltr", "rtl"],
      "the line that opens in English and turns Urdu is right to left; the English one is not");
    assert.equal(await page.$eval(".messageInput_x", (el) => el.textContent), DRAFT.join("\n"),
      "and what would be sent is exactly what was typed");
  } finally { await close(); }
});

test("the two layers never disagree about a line", async () => {
  const { page, close } = await open(BOX);
  try {
    await type(page, ["یہ کوڈ دیکھیں", "const x = useMemo(a, b);", "اور بتائیں"]);
    const input = await lineDirs(page, ".messageInput_x");
    const mirror = await lineDirs(page, ".mentionMirror_x");
    assert.deepEqual(input, ["rtl", "ltr", "rtl"]);
    assert.deepEqual(mirror, input, "the layer that shows the text agrees with the one holding the caret");
  } finally { await close(); }
});

test("an English-only draft is left alone entirely", async () => {
  const { page, close } = await open(BOX);
  try {
    await type(page, ["Run the build and check it.", "Then open the report."]);
    assert.deepEqual(await lineDirs(page, ".messageInput_x"), ["ltr", "ltr"]);
    assert.equal(await page.$eval(".messageInput_x", (el) => getComputedStyle(el).direction), "ltr");
  } finally { await close(); }
});

test("pasting sets the direction without a frame of the wrong one", async () => {
  const { page, close } = await open(BOX);
  try {
    await page.click(".messageInput_x");
    await page.keyboard.type("یہ کوڈ دیکھیں");
    await page.keyboard.press("Shift+Enter");
    await page.waitForTimeout(200);

    const wrongFrames = await page.evaluate(async () => {
      const mirror = document.querySelector(".mentionMirror_x");
      const read = () => [...mirror.querySelectorAll(".smart-rtl-input-line")]
        .map((s) => s.getAttribute("data-bidi-line") || "ltr").join(",");
      const frames = [];
      let go = true;
      const tick = () => { frames.push(read()); if (go) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise((r) => requestAnimationFrame(() => r()));
      const mark = frames.length;
      document.querySelector(".messageInput_x").focus();
      document.execCommand("insertText", false, "const x = useMemo(a, b);");
      await new Promise((r) => setTimeout(r, 400));
      go = false;
      const settled = frames[frames.length - 1];
      return frames.slice(mark).filter((f) => f !== settled).length;
    });

    assert.equal(wrongFrames, 0, "a paste must never be painted the wrong way round first");
    assert.deepEqual(await lineDirs(page, ".messageInput_x"), ["rtl", "ltr"]);
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

test("a mention chip is moved, not rebuilt", async () => {
  const { page, close } = await open(CHIP_BOX);
  try {
    await type(page, ["@mainfile کو دیکھیں", "Run the build"]);
    const chip = await page.$eval(".mentionMirror_x .inputMentionChip_x",
      (el) => ({ kept: el.getAttribute("data-chip"), text: el.textContent,
                 insideALine: !!el.closest(".smart-rtl-input-line") }));
    assert.equal(chip.kept, "1", "the host's own element, not a copy of it");
    assert.equal(chip.text, "@mainfile");
    assert.ok(chip.insideALine, "and it sits inside the line it belongs to");
  } finally { await close(); }
});

test("ctrl+z still works, and so does redo", async () => {
  const DRAFT = ["npm install کے بعد چلائیں", "Run the build"];
  const { page, close } = await open(BOX);
  try {
    await type(page, DRAFT);
    const typed = await page.$eval(".messageInput_x", (el) => el.textContent);

    for (let i = 0; i < 30; i++) await page.keyboard.press("Control+z");
    const undone = await page.$eval(".messageInput_x", (el) => el.textContent);
    assert.ok(undone.length < typed.length - 10, "ctrl+z did nothing at all");

    for (let i = 0; i < 30; i++) await page.keyboard.press("Control+Shift+z");
    const redone = await page.$eval(".messageInput_x", (el) => el.textContent);
    assert.equal(redone, typed, "redo brings back exactly what was typed");
    assert.deepEqual(await lineDirs(page, ".messageInput_x"), ["rtl", "ltr"],
      "and the lines are still decided");
  } finally { await close(); }
});
