/**
 * AS IF CLAUDE CODE HAD FIXED IT ITSELF - a message you sent.
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
 * Number 1, the box you type into, has gone the same way and for the same reason.
 *
 * What is left here is number 2, a message somebody sent. It was held only to "it differs by
 * direction and by nothing that is not direction" - a boundary, which says what we did NOT do
 * and nothing about whether what we did looks like their work. Both halves of that promise are
 * needed: 0.5.5 passed every boundary in this suite while no Urdu list had a visible bullet.
 *
 * This is the last place still resting on a reference written by hand, and it is the next one
 * to put right.
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
 * The reference, on Claude Code's own bundle: its stylesheet and its running app with nothing
 * of ours in them, plus the fix its developers would write - the row's `text-align: left`
 * becomes a `start`, and the message's own text is given dir="rtl" instead of being left to
 * dir="auto" to guess at.
 *
 * The second half of that is a declaration stopped, which is honest. The first half is a
 * declaration CHANGED, which is a decision made here - so this is a weaker claim than the one
 * the-mirror makes, and putting it right is the next piece of work.
 * --------------------------------------------------------------------------------------- */

/** A sent message's own bug, fixed where it lives. */
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

test("and untouched, a sent message is the bug: its first line is drawn from the left", { skip }, async () => {
  // The instrument proves it can see the fault before it is trusted to say the fault is gone.
  const sent = await withPanel(false, () => "", async (page) => {
    await app.send(page, DRAFT);
    await page.waitForTimeout(300);
    return await page.evaluate(SIDE, '[class*="expandableContainer_"] [class*="content_"]');
  });
  assert.equal(sent, "ltr", "without the fix a message whose line opens with npm should be drawn from the left");
});
