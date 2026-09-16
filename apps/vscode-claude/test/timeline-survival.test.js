/**
 * A MESSAGE'S OWN DOT, AFTER THE NEXT UPDATE.
 *
 * The dot is the one part of this fix that a reader sees as a SHAPE rather than as text, and
 * it is the one part that had a single road to it until 0.5.8: the row's class name, hashed
 * per build. Lose that name and every word of an Urdu answer turns while its dot stays on the
 * left - a message reading one way with its own marker on the other side, which is precisely
 * the "somebody bolted this on" look the whole project exists to avoid. Everything else here
 * has had two roads or more for exactly this reason; this had one.
 *
 * So the same three questions the box you type into is put to, put to the row:
 *
 *   the class renamed          -> found by the test id every answer has carried since 2.1.59
 *   the test id renamed too    -> found by what a row IS: a gutter with a dot inside it
 *   no gutter left at all      -> nothing is marked and nothing is padded
 *
 * And in each case the mirror has to be EXACT, measured the way rendering.test.js measures it:
 * the same three distances from each row's own reading edge. "The dot is now on the right" is
 * not the claim. The claim is that an Urdu reader is looking at their own design, not a second
 * one - so an Urdu row and an English row in the same conversation have to agree, to the pixel,
 * about edge-to-dot, dot-to-text and edge-to-text.
 *
 * Run against Claude Code's own bundle and stylesheet, rewritten before they are served - the
 * next update, made today - and by the daily watch against each new release.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const real = require("./support/real.js");
const app = require("./support/app.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;
const C = real.cls || {};

/** VS Code gives the panel its colours; without them the dot is drawn in nothing. */
const COLOURS = "*{--app-secondary-foreground:#777!important;--app-primary-border-color:#bbb!important;" +
                "--app-input-border:#bbb!important;--app-code-background:#eee!important}";

const URDU = "یہ ایک اردو جواب ہے اور اس کی سمت دائیں سے بائیں ہے۔";
const ENGLISH = "This answer is in English and reads from the left.";

/** The name this test gives the row's class when it takes Claude Code's own name away. */
const ROW_Q = "rowline_q9";
const swap = (s, from, to) => (from ? s.split(from).join(to) : s);

/**
 * Every row of the transcript that draws a dot, and the three distances that say whether it
 * is mirrored or merely moved. Measured from each row's OWN reading edge, so an Urdu row and
 * an English row are comparable numbers rather than opposite ones.
 */
const DOTS = (sel) => [...document.querySelectorAll(sel)].map((el) => {
  const row = el.getBoundingClientRect();
  const d = getComputedStyle(el, "::before");
  const w = parseFloat(d.width) || 0;
  const dotL = d.left === "auto" ? row.right - parseFloat(d.right) - w : row.left + parseFloat(d.left);
  const rtl = el.getAttribute("data-bidi-row") === "rtl";
  const t = el.firstElementChild.getBoundingClientRect();
  return {
    marked: el.getAttribute("data-bidi-row"),
    rtl,
    edgeToDot: Math.round(rtl ? row.right - (dotL + w) : dotL - row.left),
    dotToText: Math.round(rtl ? dotL - t.right : t.left - (dotL + w)),
    edgeToText: Math.round(rtl ? row.right - t.right : t.left - row.left),
    width: Math.round(t.width)
  };
});

/**
 * One English answer and one Urdu answer in Claude Code's own app, and what their dots did.
 * @param {object} [rewrite]  a bundle and stylesheet rewrite, as app.boot takes them
 */
async function converse(rewrite) {
  const run = await app.boot(WEBVIEW, Object.assign({ fix: true }, rewrite));
  try {
    await run.page.addStyleTag({ content: COLOURS });
    await app.converse(run.page, ["English please"], ENGLISH);
    await app.converse(run.page, ["اردو میں"], URDU);
    await run.page.waitForTimeout(400);
    const rows = await run.page.evaluate(DOTS, rewrite ? "[class*='" + ROW_Q + "']" : "[class*='" + C.timelineMessage + "']");
    const lamp = await run.page.evaluate(() => (window.__bidiStatus ? window.__bidiStatus().timelineDot : "no status"));
    assert.deepEqual(run.errors, [], "something reached the page uncaught");
    assert.equal(await run.pane(), "");
    return { rows, lamp };
  } finally { await run.close(); }
}

/** The mirror itself: an Urdu row and an English row are one design seen from two sides. */
function mirrored(rows) {
  const urdu = rows.filter((r) => r.rtl), english = rows.filter((r) => !r.rtl);
  assert.ok(urdu.length, "no row turned right to left at all");
  assert.ok(english.length, "no English row was left to compare it with");
  for (const key of ["edgeToDot", "dotToText", "edgeToText"]) {
    assert.equal(urdu[0][key], english[0][key],
      `${key} is ${urdu[0][key]} for an Urdu row and ${english[0][key]} for an English one - that is two designs, not one mirrored`);
  }
  assert.equal(new Set(rows.map((r) => r.width)).size, 1,
    "a row lost width to another row's dot: " + rows.map((r) => r.width).join(", "));
}

test("in Claude Code's own app, an Urdu answer's dot is mirrored exactly - and found by name", { skip }, async (t) => {
  if (!C.timelineMessage) return t.skip("this build's stylesheet has no timelineMessage_ class");
  const { rows, lamp } = await converse(null);
  mirrored(rows);
  assert.equal(lamp, "on", "the dot's own lamp: " + lamp);
  t.diagnostic("rows " + JSON.stringify(rows));
});

test("the row's class renamed: the dot is still mirrored, found by the test id an answer carries", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  if (!C.timelineMessage || !js.includes(C.timelineMessage)) return t.skip("this build has no timelineMessage_ class left to rename");
  const rename = (s) => swap(s, C.timelineMessage, ROW_Q);
  const { rows, lamp } = await converse({ js: rename, css: rename });
  mirrored(rows);
  assert.equal(lamp, "on", "the dot's own lamp: " + lamp);
});

test("...and the test id renamed too: found by what a row is, with no name left at all", { skip }, async (t) => {
  const js = fs.readFileSync(path.join(WEBVIEW, "index.js"), "utf8");
  const ID = '"data-testid":"assistant-message"';
  if (!C.timelineMessage || !js.includes(C.timelineMessage)) return t.skip("this build has no timelineMessage_ class left to rename");
  if (!js.includes(ID)) return t.skip("this build no longer writes the assistant-message test id in the form this rewrites");
  // data-transcript-message goes with it: it is on a SENT message too, so it was never a road
  // to a row, and leaving it here would not prove anything about the one that is.
  const rename = (s) => swap(swap(s, C.timelineMessage, ROW_Q), ID, '"data-testid":"model-turn"');
  const { rows, lamp } = await converse({ js: rename, css: (s) => swap(s, C.timelineMessage, ROW_Q) });
  mirrored(rows);
  assert.equal(lamp, "on", "the dot's own lamp: " + lamp);
});

test("Claude Code drawing no dot at all: nothing is marked, and no row is given a gutter", { skip }, async (t) => {
  // The day the timeline goes. There is then no direction in that gutter to mirror, and the
  // wrong answer here is not "the dot is on the wrong side" - it is 30px of padding appearing
  // on the far side of somebody's message for no reason anybody could see.
  if (!C.timelineMessage) return t.skip("this build's stylesheet has no timelineMessage_ class");
  const flat = (s) => s + `\n.${C.timelineMessage}{padding-left:0!important}` +
                          `\n.${C.timelineMessage}:before,.${C.timelineMessage}:after{content:none!important}`;
  const run = await app.boot(WEBVIEW, { fix: true, css: flat });
  try {
    await run.page.addStyleTag({ content: COLOURS });
    await app.converse(run.page, ["اردو میں"], URDU);
    await run.page.waitForTimeout(400);
    const seen = await run.page.evaluate((sel) => ({
      marked: document.querySelectorAll("[data-bidi-row]").length,
      padded: [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).paddingRight),
      lamp: window.__bidiStatus ? window.__bidiStatus().timelineDot : "no status"
    }), "[class*='" + C.timelineMessage + "']");
    assert.equal(seen.marked, 0, "a row was turned round although there is no dot in it to turn");
    assert.deepEqual([...new Set(seen.padded)], ["0px"], "a row was given a gutter it never had: " + seen.padded.join(", "));
    assert.match(String(seen.lamp), /^off/, "the lamp claims a dot it never moved: " + seen.lamp);
    assert.deepEqual(run.errors, []);
    t.diagnostic("lamp " + seen.lamp);
  } finally { await run.close(); }
});

test("a conversation of nothing but sent messages says nothing about a dot", { skip }, async (t) => {
  // A sent message has no dot of its own - its row is drawn without one. Until 0.5.8 its
  // decision still went through the dot's lamp, which then reported on a dot that is not
  // there. A lamp that answers about something it never looked at is the thing the fuse box
  // exists to prevent.
  const run = await app.boot(WEBVIEW, { fix: true });
  try {
    await app.send(run.page, ["npm install کے بعد پروجیکٹ چلائیں"]);
    const b = await app.sentBlock(run.page, "npm install");
    assert.ok(b && b.ours === "rtl", "the sent message did not turn");
    const lamp = await run.page.evaluate(() => {
      const s = window.__bidiStatus();
      return "timelineDot" in s ? s.timelineDot : "not asked";
    });
    assert.equal(lamp, "not asked", "the dot's lamp answered for a message that has no dot: " + lamp);
    assert.equal(await run.page.evaluate(() => document.querySelectorAll("[data-bidi-row]").length), 0);
    assert.deepEqual(run.errors, []);
  } finally { await run.close(); }
});

/* ---------------------------------------------------------------------------------------- *
 * A page where the rows are not all drawn alike.
 *
 * The three offsets are read from ONE row and applied to every row that turns. That is right
 * while Claude Code draws them all from one class, which it has in every build from 2.0.50 to
 * 2.1.270 - and the day it stops, handing one row another row's numbers would be the exact
 * mistake section 41 is about: different distances on the two sides is two designs, not one
 * mirrored. So a row drawn some other way is left exactly as the page had it.
 *
 * Which leaves that row's text turned with its dot where it was, and THAT must not read as
 * "on". A fix that has quietly stopped working looks precisely like one that is working, and
 * the whole fuse box exists so that it does not have to.
 *
 * Built by hand rather than found in a build, because no build has ever done this. It is
 * defensive code, and defensive code nobody has ever run is a guess.
 * ---------------------------------------------------------------------------------------- */
const { open: openStub, message: stubMessage } = require("./support/page.js");

test("a row drawn with a different gutter is left alone, and the lamp stops saying it is on", async () => {
  const urdu = stubMessage("<p>یہ اردو کا جواب ہے اور اس کی سمت دائیں سے بائیں ہے۔</p>");
  const { page, close } = await openStub(
    '<style>.message.timelineMessage_x:nth-of-type(2){padding-left:50px}</style>' + urdu + urdu);
  try {
    const seen = await page.evaluate(() => ({
      marked: [...document.querySelectorAll(".timelineMessage_x")].map((el) => el.getAttribute("data-bidi-row")),
      padded: [...document.querySelectorAll(".timelineMessage_x")].map((el) => getComputedStyle(el).paddingRight),
      lamp: window.__bidiStatus().timelineDot
    }));
    assert.deepEqual(seen.marked, ["rtl", null],
      "the row drawn with a gutter of its own was given the other row's numbers: " + seen.marked.join(", "));
    assert.equal(seen.padded[1], "0px", "and it was padded on the far side with a gutter that is not its own");
    assert.match(seen.lamp, /^not working/, "the lamp says the dot is fine while one row's is not: " + seen.lamp);
    assert.match(seen.lamp, /different gutter/);
  } finally { await close(); }
});

test("and with every row drawn alike, the same page says on", async () => {
  // The other half, so the test above cannot pass because the lamp is always unhappy.
  const urdu = stubMessage("<p>یہ اردو کا جواب ہے اور اس کی سمت دائیں سے بائیں ہے۔</p>");
  const { page, close } = await openStub(urdu + urdu);
  try {
    const seen = await page.evaluate(() => ({
      marked: [...document.querySelectorAll(".timelineMessage_x")].map((el) => el.getAttribute("data-bidi-row")),
      lamp: window.__bidiStatus().timelineDot
    }));
    assert.deepEqual(seen.marked, ["rtl", "rtl"]);
    assert.equal(seen.lamp, "on", "the lamp: " + seen.lamp);
  } finally { await close(); }
});
