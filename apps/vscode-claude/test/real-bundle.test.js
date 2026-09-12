/**
 * Claude Code's own app, running, with this payload in it.
 *
 * Every other file here builds a page that looks like Claude Code's: its CSS, its class
 * names, markup copied out of its bundle. That is how everything was understood, and it
 * has a weakness nothing removes - it is a copy. Four times the copy was simpler than the
 * thing and hid a fault: a mirror that was not React's, a composer that existed before
 * the payload ran, a probe that always had something to measure, and a sent message with
 * no hidden heading above it.
 *
 * So this does not copy anything. It serves the installed Claude Code's own webview -
 * index.js and index.css, straight off the disk - under its own CSP, with the payload
 * from dist/ appended the way the patcher appends it, and answers the requests the app
 * makes of VS Code with the fewest fields that let it render. Then it types into the
 * composer React actually renders, and reads the page back.
 *
 * With no Claude Code installed it skips.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");
const { BOX, read } = app;

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;

/** Claude Code's own app, this build of it - see support/app.js. */
const boot = (opts) => app.boot(WEBVIEW, opts);

test("inside Claude Code's own running app, the box you type in turns", { skip }, async () => {
  const { page, errors, pane, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("Hello ہیلو", { delay: 20 });
    await page.waitForTimeout(300);
    const r = await read(page);
    assert.equal(r.marked, "rtl", "the box was not marked");
    assert.equal(r.input.dir, "rtl", "the box holding the caret");
    assert.ok(r.mirror, "the layer drawn over the box was not found");
    assert.equal(r.mirror.dir, "rtl", "and the layer that is read");
    assert.notEqual(r.mirror.bidi, "plaintext", "Claude Code's own plaintext must not win");
    assert.equal(r.reads, "rtl", "and a person sees it: the first letter is drawn on the right");
    assert.equal(r.status, "on - measured working");
    assert.deepEqual(errors, [], "nothing reached the page uncaught");
    assert.equal(await pane(), "", "and Claude Code's own error pane is empty");
  } finally { await close(); }
});

test("and when Claude Code empties the box itself, it goes back", { skip }, async () => {
  // Claude Code clears the box from code - `b1.current.textContent = ""` - when a message
  // is sent. No input event fires. Only the app itself can do this for real, so this is
  // the one place it can be tested for real.
  const { page, errors, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("اسلام علیکم", { delay: 20 });
    await page.waitForTimeout(200);
    assert.equal((await read(page)).marked, "rtl");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[class*="messageInput_"]').textContent === "",
      null, { timeout: 5000 });
    await page.waitForTimeout(200);
    assert.equal((await read(page)).marked, null, "an emptied box must not stay turned for the next message");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("and a message brought back from history turns it again, with nobody typing it", { skip }, async () => {
  // Up-arrow in an empty box puts the last message back - from code, as a whole string,
  // with no input event. Only the real app does this, so only the real app can show it.
  const { page, errors, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("اسلام علیکم", { delay: 20 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[class*="messageInput_"]').textContent === "",
      null, { timeout: 5000 });
    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(() => document.querySelector('[class*="messageInput_"]').textContent.length > 0,
      null, { timeout: 5000 });
    await page.waitForTimeout(150);
    const r = await read(page);
    assert.equal(r.marked, "rtl");
    assert.equal(r.reads, "rtl");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("typing in Claude Code's own app is exactly as quick with this in it", { skip }, async () => {
  // The whole point is that nobody can tell this is not Claude Code's own work - and a box
  // that answers a beat late is the one thing anybody would notice at once. So the same
  // sentence is typed into the same app with the fix and without it, and the time until
  // every letter is on the screen is compared. Generous on purpose: the harness sends
  // keys one round trip at a time, so what this can catch is a real cost per keystroke,
  // not a microsecond - and that is the kind that matters.
  const TEXT = "یہ ایک لمبا اردو جملہ ہے جو ٹائپ ہو رہا ہے اور Hello بھی ساتھ ہے";
  const time = async (fix) => {
    const { page, close } = await boot({ fix });
    try {
      await page.click('[class*="messageInput_"]');
      const t0 = Date.now();
      await page.keyboard.type(TEXT, { delay: 0 });
      await page.waitForFunction((n) => {
        const i = document.querySelector('[class*="messageInput_"]');
        const m = [...i.parentElement.children].find((c) => c !== i && c.getAttribute("aria-hidden") === "true");
        return !!m && m.textContent.length >= n;
      }, TEXT.length, { timeout: 15000 });
      return Date.now() - t0;
    } finally { await close(); }
  };
  // Taken in turns, three of each, and compared by median. Measured one after the other,
  // a busy machine landed on the second run alone and read as the fix tripling the time -
  // 839ms against 283ms - while the same two, measured quietly, were 144ms and 131ms:
  // about a fifth of a millisecond a keystroke. In turns, a busy moment falls on both.
  const withRuns = [], withoutRuns = [];
  for (let i = 0; i < 3; i++) { withoutRuns.push(await time(false)); withRuns.push(await time(true)); }
  const median = (a) => a.slice().sort((x, y) => x - y)[1];
  const without = median(withoutRuns), withFix = median(withRuns);
  assert.ok(withFix <= without * 1.5 + 200,
    `typing took ${withFix}ms with the fix and ${without}ms without it (runs ${JSON.stringify(withRuns)} / ${JSON.stringify(withoutRuns)})`);
});

test("an English draft in Claude Code's own app is left exactly as it was", { skip }, async () => {
  const { page, close } = await boot();
  try {
    await page.click('[class*="messageInput_"]');
    await page.keyboard.type("Run the build and check it", { delay: 10 });
    await page.waitForTimeout(200);
    const r = await read(page);
    assert.equal(r.marked, null);
    assert.equal(r.input.dir, "ltr");
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * The next update, made today.
 *
 * Claude Code's own bundle and stylesheet, rewritten before they are served, in the ways
 * its box has already changed once and could change again: every class it is known by
 * renamed, what it is for taken away one description at a time, and its own direction
 * forced over ours with !important and from a cascade layer. The payload is appended to
 * each rewritten bundle the way the patcher would append it.
 *
 * A rewrite that finds nothing to rewrite - because a later build has already changed the
 * thing it looks for - is reported and skipped rather than passed, so that a test can never
 * claim to have survived a change it did not make.
 * ------------------------------------------------------------------------- */

const C = real.cls || {};
const swap = (s, from, to) => (from ? s.split(from).join(to) : s);
const RENAME = [[C.messageInputContainer, "promptShell_q9"], [C.messageInput, "promptField_q9"], [C.mentionMirror, "promptEcho_q9"]];
const renamed = (s) => RENAME.reduce((acc, [from, to]) => swap(acc, from, to), s);

/** Types into the rewritten app, and requires the box to turn, both layers with it, and no error. */
async function survives(t, rewrite, { found } = {}) {
  const { page, errors, pane, close } = await boot(rewrite);
  try {
    await page.click(BOX);
    await page.keyboard.type("Hello ہیلو", { delay: 20 });
    await page.waitForTimeout(300);
    const r = await read(page);
    assert.equal(r.reads, "rtl", "the first letter a person sees is not on the right: " + JSON.stringify(r));
    assert.equal(r.input.dir, "rtl", "the layer holding the caret");
    if (r.mirror) assert.equal(r.mirror.dir, "rtl", "and the layer drawn over it");
    assert.equal(r.status, "on - measured working");
    if (found) assert.match(r.found, found, "found by the road expected");
    assert.deepEqual(errors, []);
    assert.equal(await pane(), "");
    t.diagnostic("found " + r.found);
  } finally { await close(); }
}

test("every class the box is known by renamed: Claude Code's own app still turns", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  if (!C.messageInput || !js.includes(C.messageInput)) return t.skip("this build has no class named messageInput_ left to rename");
  await survives(t, { js: renamed, css: renamed }, { found: /role="textbox"/ });
});

test("...and its role and its label taken away too: found by what is still left", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  const ROLE = 'role:"textbox",', LABEL = '"aria-label":"Message input",';
  if (!js.includes(ROLE) || !js.includes(LABEL)) return t.skip("this build no longer writes the role or the label in the form this rewrites");
  await survives(t, { js: (s) => swap(swap(renamed(s), ROLE, ""), LABEL, ""), css: renamed }, { found: /aria-multiline/ });
});

test("Claude Code forcing its own direction with !important, from its most specific selector", { skip }, async (t) => {
  if (!C.messageInput || !C.mentionMirror || !C.messageInputContainer) return t.skip("the box's class names are not in this build's stylesheet");
  const forced = (s) => s + `#root .${C.messageInputContainer} .${C.messageInput},#root .${C.messageInputContainer} .${C.mentionMirror}` +
    "{direction:ltr!important;unicode-bidi:plaintext!important;text-align:left!important}";
  await survives(t, { css: forced });
});

test("...and the same from inside a cascade layer of its own", { skip }, async (t) => {
  if (!C.messageInput || !C.mentionMirror) return t.skip("the box's class names are not in this build's stylesheet");
  const layered = (s) => s + `@layer claude{.${C.messageInput},.${C.mentionMirror}` +
    "{direction:ltr!important;unicode-bidi:plaintext!important;text-align:left!important}}";
  await survives(t, { css: layered });
});

test("...and handing the box to the browser's own guess, dir=\"auto\"", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  const ROLE = 'role:"textbox",';
  if (!js.includes(ROLE)) return t.skip("this build no longer writes the role in the form this rewrites");
  await survives(t, { js: (s) => swap(s, ROLE, ROLE + 'dir:"auto",') });
});

/* ------------------------------------------------------------------------- *
 * Number 2, in Claude Code's own app: a message somebody sent.
 *
 * The stubbed app draws a sent message in its transcript exactly as the real panel does -
 * its row, the heading hidden above it for screen readers, its expandable container, the
 * run its text is handed to dir="auto" in. So the message's own lamp is put to it here,
 * and so are the next updates made to its real bundle and stylesheet.
 * ------------------------------------------------------------------------- */

const { lineSides } = require("./support/lines.js");
const SENT = ["npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں", "Run the build", "یہ آخری سطر ہے"];

/** Sends the message into a (possibly rewritten) app and requires its lamp to have turned it, alone. */
async function sentSurvives(t, rewrite, { found } = {}) {
  const { page, errors, pane, close } = await boot(rewrite);
  try {
    await app.send(page, SENT);
    const b = await app.sentBlock(page, SENT[0]);
    assert.ok(b, "the sent message was not found in the transcript");
    assert.deepEqual(await lineSides(page, "[data-test-sent]"), ["rtl", "rtl", "rtl"], "every line reads with its message");
    assert.equal(b.ours, "rtl", "turned by the sent message's own lamp");
    assert.equal(b.rowDecided, false, "and nothing in its row was decided by the code for answers");
    assert.equal(b.status, "on - measured working");
    if (found) assert.match(b.found, found, "found by the road expected");
    assert.deepEqual(errors, []);
    assert.equal(await pane(), "");
    t.diagnostic("found " + b.found);
  } finally { await close(); }
}

test("a message sent in Claude Code's own app reads right to left, turned by a lamp of its own", { skip }, async (t) => {
  await sentSurvives(t, undefined);
});

test("and untouched, the same message is the bug: every line that opens in English reads left to right", { skip }, async () => {
  const { page, close } = await boot({ fix: false });
  try {
    await app.send(page, SENT);
    await app.sentBlock(page, SENT[0]);
    const sides = await lineSides(page, "[data-test-sent]");
    assert.equal(sides[0], "ltr", "the first line opens with npm and is Urdu after it - without the fix it reads left to right");
  } finally { await close(); }
});

const EXP = [[C.expandable, "fold_q9"], [C.content, "text_q9"]];
const expRenamed = (s) => EXP.reduce((acc, [from, to]) => swap(acc, from, to), s);

test("the sent message's classes renamed: found by the run its text is handed to dir=\"auto\"", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  if (!C.expandable || !js.includes(C.expandable) || !js.includes('dir:"auto"')) return t.skip("this build has nothing of that shape to rename");
  await sentSurvives(t, { js: expRenamed, css: expRenamed }, { found: /dir="auto"/ });
});

test("...and dir=\"auto\" taken away instead: found by its name", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  if (!js.includes('dir:"auto",')) return t.skip("this build no longer hands a sent message to dir=\"auto\"");
  await sentSurvives(t, { js: (s) => swap(s, 'dir:"auto",', "") }, { found: /expandableContainer/ });
});

test("Claude Code forcing plaintext on a sent message with !important, from its most specific selector", { skip }, async (t) => {
  if (!C.content || !C.userMessage) return t.skip("the sent message's class names are not in this build's stylesheet");
  const forced = (s) => s + `#root .${C.userMessage} .${C.content},#root .${C.userMessage} .${C.content} span` +
    "{unicode-bidi:plaintext!important;direction:ltr!important;text-align:left!important}";
  await sentSurvives(t, { css: forced });
});

test("...and the same from a cascade layer of its own", { skip }, async (t) => {
  if (!C.content) return t.skip("the sent message's class names are not in this build's stylesheet");
  const layered = (s) => s + `@layer claude{.${C.content},.${C.content} span` +
    "{unicode-bidi:plaintext!important;direction:ltr!important;text-align:left!important}}";
  await sentSurvives(t, { css: layered });
});

test("the heading hidden above it renamed, classes and all: the answers' part still leaves the row alone", { skip }, async (t) => {
  // The heading is skipped by name, and, separately, because it is drawn one pixel square -
  // text nobody can see is never what a decision is taken from. With both of its names
  // gone, the second is all that is left, and it has to be enough.
  if (!C.screenReaderTurnHeading || !C.visuallyHidden) return t.skip("this build has no heading of that name above a sent message");
  const HEADING = [[C.screenReaderTurnHeading, "announce_q9"], [C.visuallyHidden, "unseen_q9"]];
  const renamedHeading = (s) => HEADING.reduce((acc, [from, to]) => swap(acc, from, to), s);
  await sentSurvives(t, { js: renamedHeading, css: renamedHeading });
});
