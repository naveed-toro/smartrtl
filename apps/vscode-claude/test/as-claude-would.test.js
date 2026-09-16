/**
 * AS IF CLAUDE CODE HAD FIXED IT ITSELF - the box you type into, and the message you sent.
 *
 * Numbers 3 and 4, an answer arriving and an answer that has arrived, used to be measured here
 * too, against a reference somebody here wrote out by hand: mark the row dir="rtl", mirror the
 * dot rules, stop `plaintext`, keep code left to right. That reference carried this project's
 * own judgement inside it, which is the one thing a reference may not do - it was our work
 * being compared with our idea of the right answer.
 *
 * They now live in `the-mirror.test.js`, against a reference with nobody's judgement in it:
 * Claude Code's own bundle with the incomplete rule simply not written, the formula's answer
 * said the plainest way anyone would say it, and whatever the browser then draws taken as the
 * answer. That is strictly the stronger claim, so it is the only one made.
 *
 * What is left here is numbers 1 and 2, which the-mirror does not cover: a draft in the box,
 * and a message somebody sent. Both were held only to "they differ by direction and by nothing
 * that is not direction" - a boundary, which says what we did NOT do and nothing about whether
 * what we did looks like their work. Both halves of that promise are needed: 0.5.5 passed every
 * boundary in this suite while no Urdu list had a visible bullet.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;

/** VS Code gives the panel its colours; without them nothing is drawn in anything. */
const COLOURS = "*{--app-secondary-foreground:#777!important;--app-primary-border-color:#bbb!important;" +
                "--app-input-border:#bbb!important;--app-code-background:#eee!important}";

/* ---------------------------------------------------------------------------------------- *
 * The reference on Claude Code's own bundle, for each of the two: its stylesheet and its running
 * app with nothing of ours in them, plus the fix its developers would write.
 *
 *   the box      the two layers stop being `plaintext` - that declaration IS the bug - and the
 *                element they share is given dir="rtl" while the draft holds RTL.
 *   the message  the row's `text-align: left` becomes a `start`, and the message's own text is
 *                given dir="rtl" instead of being left to dir="auto" to guess at.
 *
 * WHY THE BOX'S REFERENCE IS THE WHOLE BOX AND NOT A LINE AT A TIME. A line of a draft is a
 * newline inside one text node: to give lines their own directions, something has to make an
 * element per line, inside React's own mirror. That was built twice - the box typed blank
 * spaces, then every keystroke arrived one keystroke late - and given up deliberately in
 * decisions.md 25 to 28 and 34. Claude Code's developers own that renderer and could split it
 * where a guest in their DOM cannot, so this reference is the fix they would reach for first
 * rather than the best one they could possibly build. That, and the fact that these two still
 * carry a reference written by hand rather than the-mirror's, are the two claims here that are
 * weaker than the one the-mirror makes - written down rather than left to be discovered.
 * ---------------------------------------------------------------------------------------- */

/** The box's own bug, fixed where it lives. */
const BOX_REFERENCE = () => {
  const LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const st = document.createElement("style");
  st.textContent = '[class*="messageInput_"],[class*="mentionMirror_"]{unicode-bidi:normal}';
  document.head.appendChild(st);
  const apply = () => {
    for (const box of document.querySelectorAll('[class*="messageInputContainer_"]')) {
      if (LETTER.test(box.textContent || "")) box.setAttribute("dir", "rtl");
      else box.removeAttribute("dir");
    }
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  return "";
};

/** A sent message's, the same way. */
const SENT_REFERENCE = () => {
  const WORD = /[֐-ࣿיִ-﷿ﹰ-﻿]{2,}/;
  const st = document.createElement("style");
  st.textContent = '[class*="userMessageContainer_"]{text-align:start}';
  document.head.appendChild(st);
  const apply = () => {
    const bodies = '[class*="expandableContainer_"] [class*="content_"],[class*="slashCommandMessage_"]';
    for (const body of document.querySelectorAll(bodies)) {
      if (!WORD.test(body.textContent || "")) continue;
      if (body.getAttribute("dir") !== "rtl") body.setAttribute("dir", "rtl");
      // and the run the text is actually in. Claude Code hands it to dir="auto" - the
      // browser's first-strong guess, which IS the bug for a line that opens in Latin - so
      // a source fix stops guessing there rather than wrapping the guess in a direction.
      for (const run of body.querySelectorAll('[dir="auto"]')) run.setAttribute("dir", "rtl");
    }
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  return "";
};

/** Every element of one part of the panel: where its box is, and where its ink is. */
const BOXES = (sel) => {
  const out = [];
  const inkOf = (el) => {
    const rg = document.createRange(); rg.selectNodeContents(el);
    const t = [...rg.getClientRects()].filter((x) => x.width > 1);
    return t.length ? [Math.round(Math.min(...t.map((x) => x.left))), Math.round(Math.max(...t.map((x) => x.right)))] : null;
  };
  for (const scope of document.querySelectorAll(sel)) {
    for (const el of [scope, ...scope.querySelectorAll("*")]) {
      if (el.closest("svg")) continue;
      const r = el.getBoundingClientRect();
      out.push({ what: el.tagName.toLowerCase() + " " + (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24),
                 box: [r.left, r.right, r.top, r.bottom].map(Math.round), ink: inkOf(el) });
    }
  }
  return out;
};

/** The two readings, and everything they disagree about by more than a pixel. */
function differences(reference, ours) {
  assert.equal(ours.length, reference.length, "SmartRTL added or removed an element");
  const far = (p, q) => (p || q) && (!p || !q || p.some((v, k) => Math.abs(v - q[k]) > 1));
  const out = [];
  for (let i = 0; i < reference.length; i++) {
    const a = reference[i], b = ours[i], parts = [];
    if (far(a.box, b.box)) parts.push("box " + b.box + ", reference " + a.box);
    if (far(a.ink, b.ink)) parts.push("ink " + b.ink + ", reference " + a.ink);
    if (parts.length) out.push(a.what + ": " + parts.join("; "));
  }
  return out;
}

/** Boots Claude Code's own app, puts either the reference or SmartRTL into it, and acts. */
async function withPanel(fix, reference, act) {
  const run = await app.boot(WEBVIEW, { fix });
  try {
    await run.page.addStyleTag({ content: COLOURS });
    if (!fix) {
      const said = await run.page.evaluate(reference);
      if (said) throw new Error("the reference could not be built: " + said);
    }
    const result = await act(run.page);
    assert.deepEqual(run.errors, [], "something reached the page uncaught");
    assert.equal(await run.pane(), "");
    return result;
  } finally { await run.close(); }
}

const DRAFT = ["npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں", "Run the build", "یہ آخری سطر ہے"];

/** Which side the first character of an element is drawn on - null if nothing is laid out. */
const SIDE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  if (!n || !n.nodeValue.length) return null;
  const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1);
  const a = r.getBoundingClientRect(), b = el.getBoundingClientRect();
  return b.width && a.width ? ((a.left - b.left) > b.width / 2 ? "rtl" : "ltr") : null;
};

/**
 * Two identical readings prove nothing if neither of them turned anything. So the reference
 * is put to the same question the fix is: does the first character a person sees sit on the
 * right? A reference that quietly stopped working would otherwise make every comparison below
 * pass by agreeing with an unfixed page.
 */
function bothTurned(reference, ours, what) {
  assert.equal(reference.side, "rtl", "the reference did not turn " + what + " - the instrument is wrong, not the fix");
  assert.equal(ours.side, "rtl", "SmartRTL did not turn " + what);
}

for (const width of [700, 420]) {
  test("number 1, at " + width + "px: a draft in the box is laid out as Claude Code's own fix lays it out", { skip }, async () => {
    const read = (fix) => withPanel(fix, BOX_REFERENCE, async (page) => {
      await page.setViewportSize({ width, height: 900 });
      await page.click(app.BOX);
      for (let i = 0; i < DRAFT.length; i++) {
        if (i) await page.keyboard.press("Shift+Enter");
        await page.keyboard.type(DRAFT[i], { delay: 2 });
      }
      await page.waitForTimeout(400);
      return { list: await page.evaluate(BOXES, '[class*="messageInputContainer_"]'),
               side: await page.evaluate(SIDE, '[class*="mentionMirror_"]') };
    });
    const reference = await read(false), ours = await read(true);
    assert.ok(ours.list.length > 2, "the box was not found to measure");
    bothTurned(reference, ours, "the box you type into");
    assert.deepEqual(differences(reference.list, ours.list), [],
      "the box does not look the way it would had Claude Code fixed this itself");
  });

  test("number 2, at " + width + "px: a sent message is laid out as Claude Code's own fix lays it out", { skip }, async () => {
    const read = (fix) => withPanel(fix, SENT_REFERENCE, async (page) => {
      await page.setViewportSize({ width, height: 900 });
      await app.send(page, DRAFT);
      await page.waitForTimeout(400);
      return { list: await page.evaluate(BOXES, '[class*="userMessageContainer_"]'),
               side: await page.evaluate(SIDE, '[class*="expandableContainer_"] [class*="content_"]') };
    });
    const reference = await read(false), ours = await read(true);
    assert.ok(ours.list.length > 2, "the sent message was not found to measure");
    bothTurned(reference, ours, "a sent message");
    assert.deepEqual(differences(reference.list, ours.list), [],
      "a sent message does not look the way it would had Claude Code fixed this itself");
  });
}

test("and untouched, both of them are the bug: the first line is drawn from the left", { skip }, async () => {
  // The instrument proves it can see the fault before it is trusted to say the fault is gone.
  const sides = await withPanel(false, () => "", async (page) => {
    await page.click(app.BOX);
    await page.keyboard.type(DRAFT[0], { delay: 2 });
    await page.waitForTimeout(300);
    const drafted = await page.evaluate((sel) => {
      const el = document.querySelector(sel.replace("messageInput_", "mentionMirror_")) || document.querySelector(sel);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const n = w.nextNode();
      if (!n) return null;
      const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1);
      const a = r.getBoundingClientRect(), b = el.getBoundingClientRect();
      return b.width && a.width ? ((a.left - b.left) > b.width / 2 ? "rtl" : "ltr") : null;
    }, '[class*="messageInput_"]');
    await app.send(page, DRAFT);
    await page.waitForTimeout(300);
    const sent = await page.evaluate(() => {
      const el = document.querySelector('[class*="expandableContainer_"] [class*="content_"]');
      if (!el) return null;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const n = w.nextNode();
      if (!n) return null;
      const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1);
      const a = r.getBoundingClientRect(), b = el.getBoundingClientRect();
      return b.width && a.width ? ((a.left - b.left) > b.width / 2 ? "rtl" : "ltr") : null;
    });
    return { drafted, sent };
  });
  assert.equal(sides.drafted, "ltr", "without the fix a draft that opens with npm should be drawn from the left");
  assert.equal(sides.sent, "ltr", "and so should the message it is sent as");
});
