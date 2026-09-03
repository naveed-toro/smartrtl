/**
 * Reading an answer while it is still being written.
 *
 * The rest of the tests check what the panel settles on. This file checks the
 * minutes before that, because that is when the panel is actually being read: the
 * answer arrives, the reader is already halfway down it, and underneath, a tool is
 * still running.
 *
 * Every previous attempt at making that moment correct made it jump instead, so
 * both halves are asserted together, always, in every scenario here:
 *
 *   the text reads correctly WHILE it arrives      (wrongFrames)
 *   and it does not move about while doing so      (flips, drift)
 *
 * One without the other is not a pass. A build that waits for the turn to finish
 * scores zero flips and is useless; a build that decides on every keystroke reads
 * correctly and dances.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open, directions } = require("./support/page.js");
const { WORKING, play, flips, drift, settled, wrongFrames, scrollJump, lag } = require("./support/jitter.js");

const PAGE = `<div class="message timelineMessage_x"><div class="root" id="root"></div></div>`;

/** A real answer's shape: headings that open in English, prose, a line of pure English. */
const ANSWER = [
  ["block", "h3", "JavaScript میں Debounce فنکشن"],
  ["block", "p",  "فرض کریں ایک سرچ باکس ہے جو ہر حرف پر کال کرتا ہے۔"],
  ["block", "h3", "Debounce بمقابلہ Throttle"],
  ["block", "li", "args — اصل arguments جو فنکشن کو ملتے ہیں۔"],
  ["block", "p",  "children بطور props بھیجنے سے دوبارہ رینڈر نہیں ہوتا۔"]
];

/** Everything this file demands of a trace, in one place, so no scenario forgets one. */
function assertCalm(trace, { maxFlips = 1, maxWrongFrames = 12, maxDrift = 1 } = {}) {
  const f = flips(trace);
  assert.ok(f.worst <= maxFlips,
    `no block may change direction more than ${maxFlips}x (worst ${f.worst}: ${JSON.stringify(f.worstKey)})`);
  assert.deepEqual(f.changedBack, [], "no block may be corrected and then corrected back");

  const w = wrongFrames(trace);
  assert.ok(w.worst <= maxWrongFrames,
    `a block was shown the wrong way round for ${w.worst} frames (limit ${maxWrongFrames})`);

  const d = drift(trace, { ignore: [...f.counts.keys()] });
  assert.ok(d.worst <= maxDrift,
    `settled text moved sideways by ${d.worst}px: ${JSON.stringify(d.at)}`);
  return { f, w, d };
}

test("an answer read as it arrives, with the model still working", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, [...ANSWER, ["stop"]]);
    assert.deepEqual(settled(trace), ["rtl", "rtl", "rtl", "rtl", "rtl"]);
    assertCalm(trace);
  } finally { await close(); }
});

test("a tool runs in the middle of it, and the answer picks up again", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, [
      ANSWER[0], ANSWER[1],
      ["pause", 1200],                    // a tool. no text at all, and the spinner spinning
      ANSWER[2], ANSWER[3],
      ["stop"]
    ]);
    assert.deepEqual(settled(trace), ["rtl", "rtl", "rtl", "rtl"]);
    assertCalm(trace);
  } finally { await close(); }
});

test("an English answer is never touched, and never twitches", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, [
      ["block", "h3", "Debounce versus throttle"],
      ["block", "p",  "The build tool comparison is documented upstream."],
      ["pause", 600],
      ["block", "p",  "Nothing here is right to left, so nothing here changes."],
      ["stop"]
    ]);
    assert.deepEqual(settled(trace), ["ltr", "ltr", "ltr"]);
    assertCalm(trace, { maxFlips: 0, maxWrongFrames: 0 });
  } finally { await close(); }
});

test("a table and a code block arriving mid-answer", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    const CODE = "const wait = (ms) => new Promise((r) => setTimeout(r, ms));";
    const trace = await play(page, [
      ANSWER[0],
      ["html", `<pre><code>${CODE}</code></pre>`],
      ["html", `<table><tr><th>وقت</th><th>Result</th></tr><tr><td>250-400ms</td><td>ٹھیک</td></tr></table>`],
      ["block", "p", "اوپر والا جدول یہی فرق دکھاتا ہے۔"],
      ["stop"]
    ]);

    // th/td are blocks too: the Urdu cells read right to left, the measurement does not
    assert.deepEqual(settled(trace), ["rtl", "rtl", "ltr", "ltr", "rtl", "rtl"]);
    assertCalm(trace);

    const code = await page.$eval("pre code", (el) => ({
      text: el.textContent, dir: getComputedStyle(el).direction
    }));
    assert.equal(code.text, CODE, "code is never rewritten");
    assert.equal(code.dir, "ltr", "and never turned round");
  } finally { await close(); }
});

test("the renderer re-parsing what it has so far does not undo the decision", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, [
      ANSWER[0], ANSWER[1],
      ["rerender"],                       // every element replaced by a copy of itself
      ANSWER[2],
      ["rerender"],
      ["stop"]
    ]);
    assert.deepEqual(settled(trace), ["rtl", "rtl", "rtl"]);
    assertCalm(trace);
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * And the two things a reader does that no test above does: sit partway down a
 * long answer while it is still arriving, and go back over it afterwards.
 * ------------------------------------------------------------------------- */

const SCROLLED = `
<div class="messagesContainer_x" id="scroller" style="height:320px">
  <div class="turn_x">
    <div class="message timelineMessage_x"><div class="root" id="root">${
      Array.from({ length: 40 }, (_, i) => `<p>پہلے سے موجود سطر نمبر ${i + 1}</p>`).join("")
    }</div></div>
  </div>
</div>`;

test("the panel never scrolls itself while an answer is arriving", async () => {
  const { page, close } = await open(SCROLLED + WORKING);
  try {
    await page.evaluate(() => { document.getElementById("scroller").scrollTop = 400; });
    const trace = await play(page, [...ANSWER, ["stop"]], { scrollerId: "scroller" });

    assert.equal(scrollJump(trace), 0,
      "a reader who stopped to read a paragraph must still be looking at it");
    assertCalm(trace);
  } finally { await close(); }
});

test("when it is over, going back up finds every line as it was read", async () => {
  const { page, close } = await open(SCROLLED + WORKING);
  try {
    const trace = await play(page, [...ANSWER, ["stop"]], { scrollerId: "scroller" });
    const whileStreaming = settled(trace);

    // read it all again, from the top, the way somebody re-reads an answer
    await page.evaluate(() => { document.getElementById("scroller").scrollTop = 0; });
    await page.waitForTimeout(500);
    const afterwards = await directions(page, "#root p, #root h3, #root li");

    assert.deepEqual(afterwards.map(([d]) => d), whileStreaming,
      "nothing may settle differently once the reader stops watching");
    assert.equal(afterwards.length, 45);
    for (const [dir, text] of afterwards.slice(40)) assert.equal(dir, "rtl", text);
  } finally { await close(); }
});

test("the first Urdu answer in a conversation does not shove what is above it", async () => {
  // A gutter is reserved on both sides of every row the moment any message turns
  // out to be right to left - see mirrorTimeline in the payload. It is reserved
  // once and for the whole conversation, so rows stay aligned with each other
  // afterwards. This is about the once: the reader is partway through an English
  // answer when the reservation happens.
  const { page, close } = await open(`
<div class="messagesContainer_x" id="scroller" style="height:320px">
  <div class="turn_x">
    <div class="message timelineMessage_x"><div class="root">${
      Array.from({ length: 12 }, (_, i) => `<p>An English answer, line ${i + 1}, already read.</p>`).join("")
    }</div></div>
    <div class="message timelineMessage_x"><div class="root" id="root"></div></div>
  </div>
</div>` + WORKING);
  try {
    const before = await page.$eval(".turn_x > div:first-child p", (el) => Math.round(el.getBoundingClientRect().left));
    const wideBefore = await page.$eval(".turn_x > div:first-child p", (el) => Math.round(el.getBoundingClientRect().width));
    const trace = await play(page, [...ANSWER, ["stop"]], { scrollerId: "scroller" });
    const after = await page.$eval(".turn_x > div:first-child p", (el) => Math.round(el.getBoundingClientRect().left));
    const wideAfter = await page.$eval(".turn_x > div:first-child p", (el) => Math.round(el.getBoundingClientRect().width));
    assert.equal(scrollJump(trace), 0, "and it must not scroll either");
    assert.equal(after, before,
      `the answer above moved sideways by ${after - before}px when the Urdu one arrived`);
    // Its right edge does come in, by exactly the gutter that is now reserved on
    // both sides of every row. Left-to-right text starts at the left, so nothing a
    // reader is looking at moves - but a paragraph long enough to wrap will rewrap,
    // so the size of it is pinned here rather than left to drift.
    assert.ok(wideBefore - wideAfter <= 30,
      `rows narrowed by ${wideBefore - wideAfter}px, more than the gutter`);
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * The two halves of "real time", held together.
 *
 * Either one alone is easy and useless. Waiting for the turn to finish scores a
 * perfect zero on flips; deciding on every keystroke reads correctly and dances.
 * These fix the numbers where they were measured, so that a later change which
 * trades one for the other fails here rather than in somebody's panel.
 * ------------------------------------------------------------------------- */

test("a short reply reads the right way almost at once, and turns only once", async () => {
  // Nothing calls ["stop"]: the model is still working the entire time, which is
  // when a reply of one paragraph is read. There is no second block coming to
  // settle the first, so this is the case that used to stay backwards until the
  // whole turn ended - and the case a reader meets several times an hour.
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, [
      ["block", "p", "useMemo اور useCallback کا فرق یہی ہے کہ ایک قدر یاد رکھتا ہے۔"]
    ]);
    assert.deepEqual(settled(trace), ["rtl"], "and it must not need the turn to end");
    assertCalm(trace, { maxWrongFrames: 10 });
  } finally { await close(); }
});

test("a whole answer is still one decision, not one per paragraph", async () => {
  // Deciding sooner must not mean deciding more often. Five blocks, one change of
  // direction between them: the first block decides, and the four written after it
  // are born pointing the right way and never move.
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, ANSWER);
    const f = flips(trace);
    assert.equal(f.total, 1, `the whole answer should cost one change (saw ${f.total})`);
    assertCalm(trace, { maxWrongFrames: 10 });
  } finally { await close(); }
});

test("the host throwing the message away and building it again", async () => {
  // The decision lives in an attribute on the host's own element. A re-render that
  // replaces that element takes the attribute with it, and every block becomes an
  // element nothing has ever looked at. Nothing can stop a host doing that; what is
  // ours is how fast it comes back.
  const { page, close } = await open(PAGE + WORKING);
  try {
    const trace = await play(page, [ANSWER[0], ANSWER[1], ["remount"], ANSWER[2]]);
    assert.deepEqual(settled(trace), ["rtl", "rtl", "rtl"]);

    // Measured: it comes back inside the same frame the re-mount lands in, so the
    // reader is never shown the message pointing the other way - the budget below is
    // the ordinary one, not a relaxed one.
    assertCalm(trace);
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * Number 4: what the panel does once the turn is over.
 *
 * The old symptom was "wrong while it streams, right when you scroll back up",
 * which means something used to change at the end. A reader who goes back over an
 * answer must find the answer they read - not a corrected one, because a corrected
 * one tells them the first reading was wrong.
 * ------------------------------------------------------------------------- */

test("nothing changes after the model stops working", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    // The tail matters and is the point: the model is STILL working through it. If the
    // fix has anything left to do, it has to do it here, while somebody is reading -
    // not at the end, where the reader has already formed their impression.
    await play(page, [...ANSWER, ["block", "p", "Result: 250-400ms"]], { tailMs: 900 });
    const read = await directions(page, "#root p, #root h3, #root li");

    await page.evaluate(() => window.__stopWorking());
    await page.waitForTimeout(1500);                 // long past every timer in the fix
    const later = await directions(page, "#root p, #root h3, #root li");

    assert.deepEqual(later, read,
      "the end of a turn must not be when anything is put right");
  } finally { await close(); }
});

test("resizing the panel afterwards does not disturb a line of it", async () => {
  const { page, close } = await open(PAGE + WORKING);
  try {
    await play(page, [...ANSWER, ["stop"]], { tailMs: 0 });
    const read = await directions(page, "#root p, #root h3, #root li");

    await page.setViewportSize({ width: 520, height: 700 });
    await page.waitForTimeout(600);
    assert.deepEqual(await directions(page, "#root p, #root h3, #root li"), read, "narrower");

    await page.setViewportSize({ width: 1200, height: 700 });
    await page.waitForTimeout(600);
    assert.deepEqual(await directions(page, "#root p, #root h3, #root li"), read, "wider again");
  } finally { await close(); }
});

test("an answer is put right in the same frame the evidence arrives", async () => {
  // The number "real time" has to mean: not how long after the turn ended, and not
  // how long the block existed - how long AFTER the first Urdu word was on screen.
  // Anything before that is not a delay, it is a line that genuinely could not be
  // known yet. One frame is the floor a MutationObserver can reach.
  const { page, close } = await open(PAGE + WORKING);
  try {
    for (const script of [
      [["block", "p", "useMemo اور useCallback کا فرق یہی ہے۔"]],
      [["block", "h3", "JavaScript میں Debounce فنکشن"]],
      ANSWER
    ]) {
      const trace = await play(page, script, { tailMs: 200 });
      assert.ok(lag(trace).worst <= 1,
        `turned ${lag(trace).worst} frames after the evidence arrived`);
      await page.evaluate(() => { document.getElementById("root").replaceChildren(); });
    }
  } finally { await close(); }
});
