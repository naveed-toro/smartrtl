/**
 * The box you type into, in every build of Claude Code in a folder.
 *
 *   node build/fetch-claude-builds.js <folder> --last 5          (or name the versions)
 *   SMARTRTL_CLAUDE_BUILDS=<folder> node --test test/history.test.js
 *
 * Everything else here is put to one build - the installed one, or the one the daily watch
 * downloads. That is how 2.1.267 broke the box without anything noticing: one build had
 * been measured, and it was not that one. This boots each build in the folder, its own
 * bundle and stylesheet, with the payload appended, types a line that opens in English and
 * turns Urdu, and requires of every one of them what the box promises:
 *
 *   the letter a person sees first is drawn on the right
 *   the caret's layer and every layer drawn over it turned together
 *   the box's own status measured it working
 *   and not one error reached the page
 *
 * First run against seventeen builds, 2.0.50 to 2.1.268 - ten months, through minified
 * class names, a second layer appearing, and 2.1.267's plaintext. All seventeen held.
 *
 * With no folder named it skips: a missing folder is not a failure.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { boot, read, BOX, send, sentBlock, converse, markTurn, readInto, openReadClose, numbered } = require("./support/app.js");
const { lineSides } = require("./support/lines.js");

const FOLDER = process.env.SMARTRTL_CLAUDE_BUILDS;
const builds = FOLDER && fs.existsSync(FOLDER)
  ? fs.readdirSync(FOLDER)
      .filter((v) => fs.existsSync(path.join(FOLDER, v, "extension", "webview", "index.js")))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  : [];
const skip = builds.length ? false : "SMARTRTL_CLAUDE_BUILDS does not name a folder of Claude Code builds";

test("the box you type into, in every build in the folder", { skip }, async (t) => {
  for (const version of builds) {
    await t.test(version, async () => {
      const { page, errors, pane, close } = await boot(path.join(FOLDER, version, "extension", "webview"));
      try {
        await page.click(BOX);
        await page.keyboard.type("Hello ہیلو", { delay: 15 });
        await page.waitForTimeout(250);
        const r = await read(page);
        assert.equal(r.reads, "rtl", version + ": the first letter is not drawn on the right");
        assert.equal(r.input.dir, "rtl", version + ": the caret's layer did not turn");
        if (r.mirror) assert.equal(r.mirror.dir, "rtl", version + ": the layer drawn over it did not turn");
        assert.equal(r.status, "on - measured working", version);
        assert.deepEqual(errors, [], version + ": something reached the page");
        assert.equal(await pane(), "", version + ": Claude Code's own error pane is not empty");
        t.diagnostic(version + " - " + r.layers + " layer" + (r.layers > 1 ? "s" : "") + ", found " + r.found);
      } finally { await close(); }
    });
  }
});

/**
 * And a message sent in each of them.
 *
 * A sent message can only be reached where the build gives it a road: a class name for the
 * container its text is in (2.1.30 onwards), or the run its text is handed to dir="auto"
 * (2.1.220 onwards). 2.0.50 and 2.1.0 minified every class and had no dir="auto", and there
 * a sent message cannot be told from anything else in the panel - so there it is required
 * only that nothing of ours breaks, and the line in the report says why.
 */
const SENT = ["npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں", "Run the build", "یہ آخری سطر ہے"];

test("a message sent in every build in the folder", { skip }, async (t) => {
  for (const version of builds) {
    await t.test(version, async () => {
      const webview = path.join(FOLDER, version, "extension", "webview");
      const js = fs.readFileSync(path.join(webview, "index.js"), "utf8");
      const road = /[{,]expandableContainer:"expandableContainer_/.test(js) || js.includes('dir:"auto"');
      const { page, errors, pane, close } = await boot(webview);
      try {
        await send(page, SENT);
        const b = await sentBlock(page, SENT[0]);
        assert.ok(b, version + ": the sent message was not drawn");
        if (road) {
          assert.deepEqual(await lineSides(page, "[data-test-sent]"), ["rtl", "rtl", "rtl"], version + ": the message did not turn");
          assert.equal(b.status, "on - measured working", version);
          assert.equal(b.rowDecided, false, version + ": the code for answers decided something in the message's row");
          t.diagnostic(version + " - found " + b.found);
        } else {
          t.diagnostic(version + " - no road to a sent message in this build: minified classes and no dir=\"auto\"");
        }
        assert.deepEqual(errors, [], version + ": something reached the page");
        assert.equal(await pane(), "", version + ": Claude Code's own error pane is not empty");
      } finally { await close(); }
    });
  }
});

/**
 * And the long message nobody can read past - Claude Code's own bug - in each of them.
 *
 * A message that heads a turn became position: sticky in 2.1.90; the builds before it pin
 * nothing, and there nothing of this may do anything at all. In every build that pins, a
 * forty-line message is sent with a hundred and fifty lines of answer under it, then a long
 * message that opens with a path - which Claude Code takes for a command and draws with no
 * collapsed state - and then more conversation. Each is read from inside its answer:
 *
 *   the command-shaped one does not stay pinned over its answer, and the answer is seen
 *   the collapsed one is still pinned, as Claude Code designed it
 *   opened, the long one scrolls, its Show less comes into reach within five turns of the
 *   wheel, and closing it puts the reader back on their line
 *   and the status measured it working
 */
const LONG = Array.from({ length: 40 }, (_, i) => "line " + String(i + 1).padStart(2, "0") + " of a long message");
const PATHED = ["/Users/me/notes/handoff.md",
  ...Array.from({ length: 40 }, (_, i) => "path line " + String(i + 1).padStart(2, "0") + " of a message that opens with a path")];

test("a long message, pinned, in every build in the folder", { skip }, async (t) => {
  for (const version of builds) {
    await t.test(version, async () => {
      const webview = path.join(FOLDER, version, "extension", "webview");
      const pins = /[{,]stickyHeader:"stickyHeader_/.test(fs.readFileSync(path.join(webview, "index.js"), "utf8"));
      const { page, errors, pane, close } = await boot(webview);
      try {
        await converse(page, LONG, numbered("a"));
        await converse(page, PATHED, numbered("b"));
        await converse(page, ["and a last one"], "ok");
        if (pins) {
          assert.ok(await markTurn(page, "/Users/me/notes"), version + ": the command-shaped message is not in the transcript");
          const cmd = await readInto(page, 400, "b");
          assert.equal(cmd.pinned, false, version + ": a message taken for a command stayed pinned over its answer");
          assert.ok(cmd.answerInView, version + ": and its answer cannot be seen");

          await markTurn(page, "line 01");
          const collapsed = await readInto(page, 400, "a");
          assert.ok(collapsed.pinned, version + ": a collapsed message is no longer pinned - that is Claude Code's design, not ours to change");
          const r = await openReadClose(page);
          assert.equal(r.opened.position, "static", version + ": an opened message stayed pinned");
          assert.ok(r.notches !== null && r.notches <= 5, version + ": Show less took " + r.notches + " turns of the wheel");
          assert.equal(r.back, 0, version + ": closing did not put the reader back on their line");
          const s = await page.evaluate(() => window.__bidiStatus());
          assert.equal(s.unpinExpandedMessage, "on - measured working", version);
          t.diagnostic(version + " - pins; found " + s.unpinDetail.found);
        } else {
          assert.equal(await page.$$eval("[data-bidi-unpin]", (n) => n.length), 0, version + ": a build that pins nothing had something let go of");
          t.diagnostic(version + " - pins nothing: messages only became sticky in 2.1.90");
        }
        assert.deepEqual(errors, [], version + ": something reached the page");
        assert.equal(await pane(), "", version + ": Claude Code's own error pane is not empty");
      } finally { await close(); }
    });
  }
});

/**
 * And a message's own dot, in each of them.
 *
 * The box and a sent message are put to every build here because 2.1.267 changed the box
 * underneath a fix that had been measured on one build. The dot was never put to any build but
 * the installed one - and it is the one part of this a reader sees as a shape rather than as
 * text, so it is the one part whose failure looks like a design decision somebody made.
 *
 * Rows are found here the way road three finds them, by SHAPE and by no name at all: an element
 * that reserves a gutter and draws something absolutely positioned inside it. That is what makes
 * this runnable against a build from before the class or the test id existed - and it is a
 * second opinion on the road the payload takes, rather than the same selector asked twice.
 *
 * The claim is not "the dot is on the right". It is section 41's: the same three distances from
 * each row's own reading edge, an Urdu row against an English one in the same conversation, and
 * every row keeping the width it had.
 */
const DOT_ROWS = () => {
  const px = /^(\d+(?:\.\d+)?)px$/;
  const out = [];
  for (const el of document.querySelectorAll("div")) {
    const d = getComputedStyle(el, "::before");
    if (d.content === "none" || d.position !== "absolute" || !px.test(d.width)) continue;
    const cs = getComputedStyle(el), row = el.getBoundingClientRect();
    const rtl = el.getAttribute("data-bidi-row") === "rtl";
    const near = rtl ? d.right : d.left, pad = rtl ? cs.paddingRight : cs.paddingLeft;
    if (!px.test(near) || !px.test(pad) || parseFloat(pad) <= 0) continue;
    const kid = el.firstElementChild;
    const t = kid && kid.getBoundingClientRect();
    if (!t || !t.width || !row.width) continue;
    const w = parseFloat(d.width);
    const dotL = rtl ? row.right - parseFloat(near) - w : row.left + parseFloat(near);
    out.push({
      rtl,
      edgeToDot: Math.round(rtl ? row.right - (dotL + w) : dotL - row.left),
      dotToText: Math.round(rtl ? dotL - t.right : t.left - (dotL + w)),
      edgeToText: Math.round(rtl ? row.right - t.right : t.left - row.left),
      width: Math.round(t.width)
    });
  }
  return out;
};

test("a message's dot, mirrored exactly, in every build in the folder", { skip }, async (t) => {
  for (const version of builds) {
    await t.test(version, async () => {
      const { page, errors, pane, close } = await boot(path.join(FOLDER, version, "extension", "webview"));
      try {
        await converse(page, ["English please"], "Plain English answer, and a second line under it.");
        await converse(page, ["اردو میں"], "یہ ایک اردو جواب ہے اور اس کی سمت دائیں سے بائیں ہے۔");
        await page.waitForTimeout(400);
        const rows = await page.evaluate(DOT_ROWS);
        const lamp = await page.evaluate(() => window.__bidiStatus().timelineDot);
        const urdu = rows.filter((r) => r.rtl), english = rows.filter((r) => !r.rtl);

        if (!rows.length) {
          // A build that draws no dot at all is not a failure - there is then no direction in a
          // gutter to mirror. What would be a failure is claiming to have moved one.
          assert.ok(!lamp || lamp.indexOf("on") !== 0, version + ": the dot's lamp says " + lamp + " on a build that draws no dot");
          assert.equal(await page.$$eval("[data-bidi-row]", (n) => n.length), 0,
            version + ": a row was turned round although there is no dot in it to turn");
          t.diagnostic(version + " - draws no dot; lamp " + lamp);
          return;
        }

        assert.ok(urdu.length, version + ": no row turned right to left");
        assert.ok(english.length, version + ": no English row left to compare it with");
        for (const key of ["edgeToDot", "dotToText", "edgeToText"]) {
          assert.equal(urdu[0][key], english[0][key],
            version + ": " + key + " is " + urdu[0][key] + " for an Urdu row and " + english[0][key] +
            " for an English one - that is two designs, not one mirrored");
        }
        assert.equal(new Set(rows.map((r) => r.width)).size, 1,
          version + ": a row lost width to another row's dot - " + rows.map((r) => r.width).join(", "));
        assert.equal(lamp, "on", version + ": the dot's own lamp says " + lamp);
        assert.deepEqual(errors, [], version + ": something reached the page");
        assert.equal(await pane(), "", version + ": Claude Code's own error pane is not empty");
        t.diagnostic(version + " - " + urdu[0].edgeToDot + " / " + urdu[0].dotToText + " / " + urdu[0].edgeToText);
      } finally { await close(); }
    });
  }
});
