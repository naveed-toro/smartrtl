/**
 * The box you type into, put to the updates that have not happened yet.
 *
 * Ten months of Claude Code were booted with this fix in them, 2.0.50 to 2.1.268, and
 * the box changed three times underneath it: minified class names became hashed ones, a
 * second layer appeared over it, and 2.1.267 added unicode-bidi:plaintext - which is
 * the one that broke 0.4.x, silently. Each test below is the NEXT change of one of those
 * kinds, made on purpose, to a page that is otherwise the one the rest of the suite uses.
 *
 * What every one of them requires is the same three things:
 *
 *   the box still reads right to left when there is Urdu in it
 *   the caret and the letters it writes stay in the same place - both layers agree
 *   and nothing of ours ever reaches the page as an error
 *
 * or, where the change makes that impossible, that the box is given back exactly as the
 * page had it - whole, never half turned - and the status says why.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, message, directions, lineBoxes, lineReads } = require("./support/page.js");

/** The host standing in for React: whatever is typed is drawn again in the layer over it. */
const echo = (input, mirror, render = "m.textContent = i.textContent;") => `<script>
  (function () {
    var i = document.querySelector(${JSON.stringify(input)});
    i.addEventListener("input", function () {
      var m = document.querySelector(${JSON.stringify(mirror)});
      ${render}
    });
  })();
</script>`;

const ATTRS = 'role="textbox" aria-label="Message input" aria-multiline="true" data-placeholder="Ask anything"';

/** Claude Code's box, in the shape every build since 2.1.90 has rendered it. */
const BOX = `<div class="messageInputContainer_x">
  <div class="messageInput_x" contenteditable="plaintext-only" ${ATTRS}></div>
  <div class="mentionMirror_x" aria-hidden="true"></div>
</div>` + echo(".messageInput_x", ".mentionMirror_x");

/** The same box's styling, for a build that has renamed every class. */
const layerCss = (box, input, over) => `<style>
.${box}{position:relative;display:flex;width:520px;border:1px solid #ddd}
.${input}{unicode-bidi:plaintext;white-space:pre-wrap;color:#0000;caret-color:#c00;flex:1;padding:10px 36px 10px 14px;outline:none;position:relative;z-index:1}
.${over}{unicode-bidi:plaintext;white-space:pre-wrap;position:absolute;inset:0;padding:10px 36px 10px 14px;pointer-events:none}
</style>`;

async function type(page, sel, lines) {
  await page.click(sel);
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(lines[i], { delay: 3 });
  }
  await page.waitForTimeout(200);
}

/** Line by line, the caret's layer and the layer people read put every line in the same place. */
async function agree(page, input, over) {
  const a = await lineBoxes(page, input), b = await lineBoxes(page, over);
  assert.equal(b.length, a.length, "the two layers do not even hold the same lines");
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(a[i].firstChar - b[i].firstChar) <= 1,
      `line ${i}: the caret's layer starts it at ${a[i].firstChar}px and the layer people read at ${b[i].firstChar}px`);
  }
}

const composerStatus = (page) => page.evaluate(() => {
  const s = window.__bidiStatus();
  return { lamp: s.composer, detail: s.engine && s.engine.composerDetail };
});

/* ---------------------------------------------------------------------------- *
 * Claude Code insisting on its own direction.
 *
 * 2.1.267 won by adding one property that the rule did not set. The rule now sets all of
 * them - but a page that adds !important, or moves its styles into cascade layers, would
 * have beaten a rule that merely set them. These are both of those, and the answer to
 * both is where the rules live: in a layer declared before any of the page's, where an
 * !important declaration outranks every later layer and every unlayered rule.
 * ---------------------------------------------------------------------------- */

test("the page forcing left to right with !important, from its most specific selector, does not win", async () => {
  const FORCED = `<style>
    #app .messageInputContainer_x .messageInput_x,
    #app .messageInputContainer_x .mentionMirror_x { direction: ltr !important; unicode-bidi: plaintext !important; text-align: left !important }
  </style>`;
  const { page, errors, close } = await open(FORCED + `<div id="app">${BOX}</div>`);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو", "Run the build"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl", "rtl"], "the layer people read");
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.equal((await composerStatus(page)).lamp, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("nor does the same thing from inside a cascade layer of its own", async () => {
  const LAYERED = `<style>@layer app {
    .messageInput_x, .mentionMirror_x { direction: ltr !important; unicode-bidi: plaintext !important; text-align: left !important }
  }</style>`;
  const { page, errors, close } = await open(LAYERED + BOX);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.equal((await composerStatus(page)).lamp, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a dir attribute on both layers - the browser's own guess - does not win either", async () => {
  const AUTO = BOX.replace('contenteditable="plaintext-only"', 'contenteditable="plaintext-only" dir="auto"')
                  .replace('aria-hidden="true"', 'aria-hidden="true" dir="auto"');
  const { page, errors, close } = await open(AUTO);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("what the host draws inside the layer people read cannot decide a direction of its own", async () => {
  // The caret's layer is plain text. If the layer over it drew each run in a span that
  // decides its own direction - dir="auto", the browser's guess - the letters would be
  // laid out by a different rule from the caret, and the caret would land away from the
  // letter it is about to write. Inside a turned layer nothing gets a vote of its own.
  const RUNS = BOX.replace(echo(".messageInput_x", ".mentionMirror_x"), echo(".messageInput_x", ".mentionMirror_x",
    `m.innerHTML = i.textContent.split("\\n").map(function (l) {
       return '<span dir="auto">' + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</span>';
     }).join("\\n");`));
  const { page, errors, close } = await open(RUNS);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو", "npm install کے بعد"]);
    assert.equal(await page.$$eval(".mentionMirror_x span[dir=auto]", (s) => s.length), 2, "the host really did draw runs");
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl", "rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the lamp for sent messages never reaches into the box you type into", async () => {
  // Found while proving the test above: a sent message's text is a run handed to
  // dir="auto", and so would a run the host drew inside the layer over the box - which
  // sits beside the editable box, not inside it. The sent-message lamp marked that layer
  // while the draft had one line, and left the mark there when a second line arrived.
  // Emptied back to English, the layer people read stayed right to left over a caret
  // that was not: two lamps, one box, and the caret parted from its letters.
  const RUNS = BOX.replace(echo(".messageInput_x", ".mentionMirror_x"), echo(".messageInput_x", ".mentionMirror_x",
    `m.innerHTML = i.textContent.split("\\n").map(function (l) {
       return '<span dir="auto">' + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</span>';
     }).join("\\n");`));
  const { page, errors, close } = await open(RUNS);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second line", { delay: 3 });
    // replaced in one step, never passing through a single line - the way the host puts a
    // draft back from history: the text set from code, and its own listener told
    await page.evaluate(() => {
      const i = document.querySelector(".messageInput_x");
      i.textContent = "Run the build\nThen open the report";
      i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    assert.equal(await page.$$eval(".messageInputContainer_x [data-bidi-sent]", (e) => e.length), 0,
      "nothing of the sent-message lamp's belongs inside the box");
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["ltr", "ltr"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Claude Code changing what is beside the box, and around it.
 * ---------------------------------------------------------------------------- */

test("an icon the host puts beside the box is not turned with it", async () => {
  const DECOR = BOX.replace('<div class="mentionMirror_x"',
    '<div class="decor_x" aria-hidden="true" style="position:absolute;right:4px;top:4px;width:18px;height:18px;display:flex">' +
    '<span>a</span><span>b</span></div><div class="mentionMirror_x"');
  const { page, errors, close } = await open(DECOR);
  try {
    await type(page, ".messageInput_x", ["اسلام علیکم"]);
    const decor = await page.$eval(".decor_x", (el) => ({
      dir: getComputedStyle(el).direction, ours: el.hasAttribute("data-bidi-layer")
    }));
    assert.deepEqual(decor, { dir: "ltr", ours: false }, "hidden from screen readers is not the same thing as a copy of the text");
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"], "while the layer that is a copy turns");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a second layer the host draws over the box - whatever it is called - turns with it", async () => {
  // A plausible next feature: inline suggestions, drawn as one more copy of the text with
  // the suggestion after it. Left behind, it would sit left to right over a box that reads
  // right to left, and every letter of it would be in the wrong place.
  const GHOST = BOX.replace('<div class="mentionMirror_x"',
    '<div class="ghost_x" aria-hidden="true" style="position:absolute;inset:0;padding:10px 36px 10px 14px;white-space:pre-wrap;unicode-bidi:plaintext;color:#aaa"></div>' +
    '<div class="mentionMirror_x"') +
    `<script>document.querySelector(".messageInput_x").addEventListener("input", function (e) {
       document.querySelector(".ghost_x").textContent = e.target.textContent;
     });</script>`;
  const { page, errors, close } = await open(GHOST);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.equal(await page.$eval(".ghost_x", (el) => el.getAttribute("data-bidi-layer")), "over");
    assert.deepEqual(await lineReads(page, ".ghost_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".ghost_x");
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the box wrapped in something new is still found, and still turns whole", async () => {
  const WRAPPED = `<div class="messageInputContainer_x">
    <div class="scroll_y" style="flex:1;display:flex"><div class="messageInput_x" contenteditable="plaintext-only" ${ATTRS}></div></div>
    <div class="mentionMirror_x" aria-hidden="true"></div>
  </div>` + echo(".messageInput_x", ".mentionMirror_x");
  const { page, errors, close } = await open(WRAPPED);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and so is the layer over it, wrapped in something new", async () => {
  const WRAPPED = `<div class="messageInputContainer_x">
    <div class="messageInput_x" contenteditable="plaintext-only" ${ATTRS}></div>
    <div class="overlay_y" style="position:absolute;inset:0;pointer-events:none"><div class="mentionMirror_x" aria-hidden="true"></div></div>
  </div>` + echo(".messageInput_x", ".mentionMirror_x");
  const { page, errors, close } = await open(WRAPPED);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a layer added later inside a wrapper the box already has turns with it", async () => {
  // The box's own children stay the same ones, so nothing about its shape looks different
  // from the outside. What arrived is found by looking at what arrived.
  const WRAPPED = `<div class="messageInputContainer_x">
    <div class="messageInput_x" contenteditable="plaintext-only" ${ATTRS}></div>
    <div class="overlay_y" style="position:absolute;inset:0;pointer-events:none"><div class="mentionMirror_x" aria-hidden="true"></div></div>
  </div>` + echo(".messageInput_x", ".mentionMirror_x");
  const { page, errors, close } = await open(WRAPPED);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    await page.evaluate(() => {
      const ghost = document.createElement("div");
      ghost.className = "ghost_x";
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = "position:absolute;inset:0;padding:10px 36px 10px 14px;white-space:pre-wrap;unicode-bidi:plaintext;color:#aaa";
      ghost.textContent = document.querySelector(".messageInput_x").textContent;
      document.querySelector(".overlay_y").appendChild(ghost);
    });
    await page.waitForTimeout(100);
    assert.deepEqual(await lineReads(page, ".ghost_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".ghost_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the host rebuilding a layer in the moment after the box turns does not turn it back", async () => {
  // The box turns, and its reading-back is due a moment later. In that moment the host
  // replaces the layer over it with a fresh copy. The record the reading-back was queued
  // for still names the old layer - gone from the page - and read back, a layer that is
  // gone looks like a layer that disagrees. It once took the direction back from the new,
  // healthy box because of it.
  const { page, errors, close } = await open(BOX);
  try {
    const after = await page.evaluate(async () => {
      const i = document.querySelector(".messageInput_x"), box = i.parentElement;
      i.textContent = "Hello ہیلو";
      document.querySelector(".mentionMirror_x").textContent = "Hello ہیلو";
      await Promise.resolve();                                    // the box turns
      const m = document.querySelector(".mentionMirror_x");
      m.replaceWith(m.cloneNode(true));                           // and the host rebuilds the layer
      await new Promise((r) => setTimeout(r, 80));                // past the reading-back
      return { turned: box.getAttribute("data-bidi-input"), status: window.__bidiStatus().composer };
    });
    assert.deepEqual(after, { turned: "rtl", status: "on - measured working" });
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("every class renamed, the role and the label gone: found by what is left of what it is", async () => {
  // Two builds of this shape, each missing more than the one before. The first still says
  // it is multi-line; the second has nothing but the attribute its placeholder is drawn
  // from. Neither has a single name or role anything here was written against.
  for (const [what, attrs] of [
    ["aria-multiline", 'aria-multiline="true"'],
    ["data-placeholder", 'data-placeholder="Ask anything"']
  ]) {
    const HTML = layerCss("shell_q", "field_q", "echo_q") + `<div class="shell_q">
      <div class="field_q" contenteditable="plaintext-only" ${attrs}></div>
      <div class="echo_q" aria-hidden="true"></div>
    </div>` + echo(".field_q", ".echo_q");
    const { page, errors, close } = await open(HTML);
    try {
      await type(page, ".field_q", ["Hello ہیلو"]);
      assert.deepEqual(await lineReads(page, ".echo_q"), ["rtl"], what);
      await agree(page, ".field_q", ".echo_q");
      const s = await composerStatus(page);
      assert.equal(s.lamp, "on - measured working", what);
      assert.match(s.detail.found, new RegExp(what), "and the status says which road found it");
      assert.deepEqual(errors, [], what);
    } finally { await close(); }
  }
});

test("a layer over the box that the host only draws once there is text is found when it arrives", async () => {
  const LAZY = `<div class="messageInputContainer_x">
    <div class="messageInput_x" contenteditable="plaintext-only" ${ATTRS}></div>
  </div>
  <script>
    (function () {
      var box = document.querySelector(".messageInputContainer_x"), i = document.querySelector(".messageInput_x");
      i.addEventListener("input", function () {
        var m = box.querySelector(".mentionMirror_x");
        if (!i.textContent) { if (m) m.remove(); return; }
        if (!m) { m = document.createElement("div"); m.className = "mentionMirror_x"; m.setAttribute("aria-hidden", "true"); box.appendChild(m); }
        m.textContent = i.textContent;
      });
    })();
  </script>`;
  const { page, errors, close } = await open(LAZY);
  try {
    // Opening in English on purpose: an all-Urdu line reads right to left under the host's
    // own plaintext, so it would pass with nothing of ours running at all.
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Claude Code rebuilding the box.
 * ---------------------------------------------------------------------------- */

test("a box built again from scratch with Urdu already in it turns, with nobody typing", async () => {
  // Switching sessions, restoring a draft, a fork: the host throws the whole box away and
  // builds a new one with the text already in it. No key is pressed and nothing is focused.
  const { page, errors, close } = await open(BOX);
  try {
    await type(page, ".messageInput_x", ["hello"]);
    await page.evaluate(() => {
      const old = document.querySelector(".messageInputContainer_x");
      const fresh = document.createElement("div");
      fresh.className = "messageInputContainer_x";
      fresh.innerHTML = '<div class="messageInput_x" contenteditable="plaintext-only" role="textbox">اسلام علیکم</div>' +
                        '<div class="mentionMirror_x" aria-hidden="true">اسلام علیکم</div>';
      old.replaceWith(fresh);
    });
    await page.waitForTimeout(100);
    assert.equal(await page.$eval(".messageInputContainer_x", (el) => el.getAttribute("data-bidi-input")), "rtl");
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    const s = await composerStatus(page);
    assert.equal(s.detail.boxes, 1, "the box that left the page was let go, not kept alive beside the new one");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("two boxes on one page are each decided by what is in them, including text put in from code", async () => {
  const TWO = ["a", "b"].map((k) => `<div class="messageInputContainer_x" id="${k}">
    <div class="messageInput_x" contenteditable="plaintext-only" ${ATTRS}></div>
    <div class="mentionMirror_x" aria-hidden="true"></div></div>`).join("") +
    `<script>document.querySelectorAll(".messageInput_x").forEach(function (i) {
       i.addEventListener("input", function () { i.parentElement.querySelector(".mentionMirror_x").textContent = i.textContent; });
     });</script>`;
  const { page, errors, close } = await open(TWO);
  try {
    await type(page, "#a .messageInput_x", ["اسلام علیکم"]);
    await type(page, "#b .messageInput_x", ["Run the build"]);
    const turned = () => page.$$eval(".messageInputContainer_x", (els) => els.map((e) => e.getAttribute("data-bidi-input")));
    assert.deepEqual(await turned(), ["rtl", null]);

    // Now each is changed from code while the OTHER one is the box last typed into: the
    // first is emptied, the way a box is after a send, and the second is given Urdu.
    await page.evaluate(() => {
      const set = (id, text) => {
        const b = document.querySelector(id);
        b.querySelector(".messageInput_x").textContent = text;
        b.querySelector(".mentionMirror_x").textContent = text;
      };
      set("#a", "");
      set("#b", "یہ دوسرا ہے");
    });
    await page.waitForTimeout(60);
    assert.deepEqual(await turned(), [null, "rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Faults, and the independence of the lamps.
 * ---------------------------------------------------------------------------- */

test("a fault inside the box's own handling reaches nothing, and leaves the box as the page had it", async () => {
  const { page, errors, close } = await open(message("<p>npm install کے بعد پروجیکٹ چلائیں</p>") + BOX);
  try {
    await page.evaluate(() => {
      // a box that throws the moment anything of ours asks it a question
      document.querySelector(".messageInput_x").getAttribute = function () { throw new Error("this box is broken"); };
    });
    await type(page, ".messageInput_x", ["اسلام علیکم"]);
    assert.deepEqual(errors, [], "a fault of ours reached the page");
    assert.equal(await page.$eval(".messageInputContainer_x", (el) => el.hasAttribute("data-bidi-input")), false,
      "a box that could not be finished with is not left half turned");
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    const s = await composerStatus(page);
    assert.ok(s.detail.contained >= 1, "and the fault was counted, not swallowed");
    assert.deepEqual((await directions(page, ".root p")).map((d) => d[0]), ["rtl"],
      "while the answer beside it is decided exactly as before");
  } finally { await close(); }
});

test("and the answers' part failing to start at all does not dim the box", async () => {
  // Only the answers' own observer is refused - picked out by what its callback does -
  // and nothing else. Before this there was one engine, and it went down whole.
  const BREAK_ANSWERS = `<script>
    (function () {
      var Real = MutationObserver;
      window.MutationObserver = function (cb) {
        if (/push\\(r\\.target\\)/.test(String(cb))) throw new Error("no observer for the answers");
        return new Real(cb);
      };
      window.MutationObserver.prototype = Real.prototype;
    })();
  </script>`;
  const { page, errors, close } = await open(BREAK_ANSWERS + BOX);
  try {
    const s = await page.evaluate(() => window.__bidiStatus().engine);
    assert.match(s.blocks, /^off/, "the answers' part really did fail to start");
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"], "and the box is on regardless");
    assert.equal((await composerStatus(page)).lamp, "on - measured working");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("if Claude Code only lets one of the layers turn, neither is turned, and the status says so", async () => {
  // An inline !important is the one thing a stylesheet cannot outrank. Put on one layer
  // only, turning the box would put the caret on one side of the panel and the letters on
  // the other. Measured after the turn, and given back whole.
  const { page, errors, close } = await open(BOX);
  try {
    await page.evaluate(() => {
      const m = document.querySelector(".mentionMirror_x");
      m.style.setProperty("direction", "ltr", "important");
      m.style.setProperty("unicode-bidi", "plaintext", "important");
    });
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.equal(await page.$eval(".messageInputContainer_x", (el) => el.hasAttribute("data-bidi-input")), false);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.match((await composerStatus(page)).lamp, /^off - the layers of the box did not all take the direction/);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a box the page will not let turn at all is reported as not working - and stays reported", async () => {
  // Both layers held left to right from script, so the two still agree and nothing is
  // split: the fix is simply not taking. That has to stay on the status for as long as it
  // is true, not be forgotten at the next keystroke.
  const { page, errors, close } = await open(BOX);
  try {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(".messageInput_x, .mentionMirror_x")) {
        el.style.setProperty("direction", "ltr", "important");
        el.style.setProperty("unicode-bidi", "plaintext", "important");
      }
    });
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.match((await composerStatus(page)).lamp, /^not working - /);
    await page.keyboard.type(" اور یہ بھی", { delay: 3 });
    await page.waitForTimeout(100);
    assert.match((await composerStatus(page)).lamp, /^not working - /, "forgotten at the next keystroke");
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("if the page takes our stylesheet away, it goes back", async () => {
  const { page, errors, close } = await open(BOX);
  try {
    await page.evaluate(() => document.getElementById("smart-rtl-composer").remove());
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    assert.equal(await page.$$eval("#smart-rtl-composer", (e) => e.length), 1);
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a page that refuses style elements still gets the box turned, another way", async () => {
  const { chromium } = require("playwright");
  const { payload } = require("./support/page.js");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setContent(`<!doctype html><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'unsafe-inline'">
      <div class="box_c"><div class="field_c" contenteditable="plaintext-only" role="textbox"></div></div>
      <script>${payload().replace(/var EXPIRES_AT = \d+;/, `var EXPIRES_AT = ${Date.now() + 864e5};`)}</script>`);
    await page.click(".field_c");
    await page.keyboard.type("Hello ہیلو", { delay: 3 });
    await page.waitForTimeout(150);
    const seen = await page.evaluate(() => ({
      dir: getComputedStyle(document.querySelector(".field_c")).direction,
      sheet: window.__bidiStatus().engine.composerDetail.sheet
    }));
    assert.equal(seen.dir, "rtl");
    assert.match(seen.sheet, /^adopted/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("a box inside a shadow root is reached, and turned, from inside it", async () => {
  const SHADOW = `<div id="host"></div><script>
    (function () {
      var root = document.getElementById("host").attachShadow({ mode: "open" });
      root.innerHTML = '<style>' +
        '.b{position:relative;display:flex;width:520px}' +
        '.i{unicode-bidi:plaintext;white-space:pre-wrap;color:#0000;caret-color:#c00;flex:1;padding:10px;outline:none;position:relative;z-index:1}' +
        '.m{unicode-bidi:plaintext;white-space:pre-wrap;position:absolute;inset:0;padding:10px;pointer-events:none}</style>' +
        '<div class="b"><div class="i" contenteditable="plaintext-only" role="textbox"></div><div class="m" aria-hidden="true"></div></div>';
      var i = root.querySelector(".i"), m = root.querySelector(".m");
      i.addEventListener("input", function () { m.textContent = i.textContent; });
    })();
  </script>`;
  const { page, errors, close } = await open(SHADOW);
  try {
    await page.click(".i");      // playwright reaches into an open shadow root
    await page.keyboard.type("Hello ہیلو", { delay: 3 });
    await page.waitForTimeout(150);
    const seen = await page.evaluate(() => {
      const root = document.getElementById("host").shadowRoot;
      const side = (el) => {
        const t = el.firstChild, r = document.createRange();
        r.setStart(t, 0); r.setEnd(t, 1);
        const a = r.getBoundingClientRect(), b = el.getBoundingClientRect();
        return { side: (a.left - b.left) > b.width / 2 ? "rtl" : "ltr", x: Math.round(a.left) };
      };
      return { input: side(root.querySelector(".i")), over: side(root.querySelector(".m")) };
    });
    assert.equal(seen.over.side, "rtl");
    assert.equal(seen.input.x, seen.over.x, "the caret's layer and the layer people read agree");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * And what must stay true however the page changes.
 * ---------------------------------------------------------------------------- */

test("an English draft leaves not one attribute of ours anywhere on the page", async () => {
  const { page, errors, close } = await open(BOX);
  try {
    await type(page, ".messageInput_x", ["Run the build and check it.", "Then open the report."]);
    assert.equal(await page.$$eval("[data-bidi-input],[data-bidi-layer]", (e) => e.length), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the escape hatch takes the box's sheet, its attributes and its listeners with it", async () => {
  const { page, errors, close } = await open(BOX);
  try {
    await type(page, ".messageInput_x", ["Hello ہیلو"]);
    await page.evaluate(() => window.__bidiFixOff());
    assert.equal(await page.$$eval("#smart-rtl-composer,[data-bidi-input],[data-bidi-layer]", (e) => e.length), 0);
    await page.keyboard.type(" اور", { delay: 3 });
    await page.waitForTimeout(100);
    assert.equal(await page.$$eval("[data-bidi-input],[data-bidi-layer]", (e) => e.length), 0,
      "and nothing comes back afterwards: it is off, not paused");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

/* ---------------------------------------------------------------------------- *
 * Claude Code fixing the box itself.
 *
 * The likeliest update of all, and until 0.5.3 the only one nothing here covered. Two
 * fixes for one fault fight each other, and the fight is invisible to whoever shipped
 * either of them - so the box is asked, of the page and not of its stylesheet, whether it
 * still needs us. A page that lays a mixed draft out right to left by itself does not, and
 * this lamp comes out of it.
 *
 * What makes the question trustworthy is which draft it is asked with. A draft that opens
 * in Latin and turns Urdu is the fault written as a string: the browser's own rule reads
 * it left to right and this rule reads it right to left. A draft of pure Urdu reads right
 * to left on every build ever shipped, so it proves nothing, and asking with one would
 * report "fixed" everywhere. Both are below.
 * ---------------------------------------------------------------------------- */

/** A Claude Code that has fixed the box, written the way such a fix would be written. */
const FIXED_BOX = `<style>
  .messageInput_x, .mentionMirror_x {
    direction: rtl !important; unicode-bidi: isolate !important; text-align: start !important;
  }</style>`;

const MIXED_DRAFT = "npm install کے بعد پروجیکٹ چلائیں";

const marksOf = (page) => page.evaluate(() =>
  document.querySelectorAll("[data-bidi-input],[data-bidi-layer]").length);

test("today the page still reads a mixed draft the wrong way round, so nothing stands down", async () => {
  const { page, errors, close } = await open(BOX);
  try {
    await type(page, ".messageInput_x", [MIXED_DRAFT]);
    const s = await composerStatus(page);
    assert.equal(s.lamp, "on - measured working", "the fault is here; this lamp has to stay on");
    assert.ok(await marksOf(page) >= 2, "and the box is turned");
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a build that reads a mixed draft correctly takes this lamp out of the page", async () => {
  const { page, errors, close } = await open(BOX + FIXED_BOX);
  try {
    await type(page, ".messageInput_x", [MIXED_DRAFT]);
    const s = await composerStatus(page);
    assert.match(s.lamp, /^not needed/, "the page does this itself now: " + s.lamp);
    assert.equal(await marksOf(page), 0, "and nothing of ours is left on the box");
    // and the reader is no worse off - their fix is doing what ours did
    assert.deepEqual(await lineReads(page, ".mentionMirror_x"), ["rtl"]);
    await agree(page, ".messageInput_x", ".mentionMirror_x");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and a draft of pure Urdu never answers that question - it cannot", async () => {
  // The trap this is guarding: on a fixed page pure Urdu reads right to left, and so it
  // does on every build that ever had the fault. Measuring with one would take the lamp
  // out of every build ever shipped.
  const { page, errors, close } = await open(BOX + FIXED_BOX);
  try {
    await type(page, ".messageInput_x", ["اسلام علیکم کیسے ہیں"]);
    const s = await composerStatus(page);
    assert.equal(s.lamp, "on - measured working",
      "a draft that proves nothing took the lamp out of the page: " + s.lamp);
    assert.ok(await marksOf(page) >= 2, "and the box is still turned");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a box the page has fixed is asked once, and what it answered is not re-asked every keystroke", async () => {
  const { page, errors, close } = await open(BOX + FIXED_BOX);
  try {
    await type(page, ".messageInput_x", [MIXED_DRAFT]);
    assert.match((await composerStatus(page)).lamp, /^not needed/);
    // everything that came out of the page stays out of it, however much more is typed
    await type(page, ".messageInput_x", [" اور مزید متن"]);
    assert.equal(await marksOf(page), 0, "it came back after standing down");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
