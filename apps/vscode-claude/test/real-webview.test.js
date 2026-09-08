/**
 * The same questions, put to Claude Code's own stylesheet.
 *
 * Everything else here is measured on test/support/page.js - a small page carrying
 * the handful of rules that cause the problem. That page is how the problem was
 * understood and it has been right about every one of them, but it is a copy, and a
 * copy can only ever answer questions somebody thought to copy the rules for.
 *
 * These load webview/index.css out of the installed extension and use the real class
 * names, read out of that stylesheet rather than written down - hashes change every
 * build, and a hard-coded one would turn a Claude Code update into a green suite
 * measuring a page nobody has. With no Claude Code installed they skip.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const real = require("./support/real.js");
const { lineReads, lineBoxes } = require("./support/lines.js");
const { play, flips, drift, settled, scrollJump, lag } = require("./support/jitter.js");

const ANSWER = [
  ["block", "h3", "JavaScript میں Debounce فنکشن"],
  ["block", "p",  "فرض کریں ایک سرچ باکس ہے جو ہر حرف پر کال کرتا ہے اور ہر بار نیٹ ورک پر جاتا ہے۔"],
  ["block", "h3", "Debounce بمقابلہ Throttle"],
  ["block", "li", "args — اصل arguments جو فنکشن کو ملتے ہیں۔"],
  ["block", "p",  "children بطور props بھیجنے سے دوبارہ رینڈر نہیں ہوتا، اور یہی اصل نکتہ ہے۔"]
];

const skip = real.installed ? false : "Claude Code is not installed in this editor";

test("the selectors this fix is built on still find something", { skip }, () => {
  // Every one of these is a [class*="..."] prefix the payload matches on. If an
  // update renames one, the fix quietly stops working on that part of the panel and
  // nothing else in this suite would notice - the copied page would still have it.
  for (const [what, name] of Object.entries(real.cls)) {
    assert.ok(name, `${what} is no longer in ${real.installed.name}'s stylesheet`);
  }
  assert.match(real.cls.root, /^root_/);
  assert.match(real.cls.timelineMessage, /^timelineMessage_/);
  assert.match(real.cls.content, new RegExp("^content_" + real.cls.expandable.split("_")[1] + "$"),
    "the user message body must be the one inside the expandable container");
});

test("an answer read as it arrives, on the real stylesheet", { skip }, async () => {
  const { page, close } = await real.open(real.conversation(real.answer()) + real.working());
  try {
    const trace = await play(page, ANSWER, { scrollerId: "scroller", rootId: "md" });
    const f = flips(trace);

    assert.deepEqual(settled(trace), ["rtl", "rtl", "rtl", "rtl", "rtl"]);
    assert.ok(lag(trace).worst <= 1, `turned ${lag(trace).worst} frames after the evidence`);
    assert.ok(f.worst <= 1, `worst block changed direction ${f.worst}x`);
    assert.deepEqual(f.changedBack, []);
    assert.equal(scrollJump(trace), 0);
    assert.equal(drift(trace, { ignore: [...f.counts.keys()] }).worst, 0);
  } finally { await close(); }
});

test("the edge the reader's eye returns to is moved exactly once", { skip }, async () => {
  // Right to left, every line starts at the RIGHT edge of the panel. Anything that
  // moves that edge mid-answer moves text somebody has already read - so this counts
  // the times it moves at all, with the fix and without it, and requires that the
  // fix add exactly one: the timeline gutter, reserved before there is anything to
  // read. Counting rather than asserting a pixel, because the gutter's width is
  // measured from the panel at runtime and is not ours to predict.
  const measure = async (fix) => {
    const { page, close } = await real.open(real.conversation(real.answer()) + real.working(), { fix });
    try {
      return await page.evaluate(async (blocks) => {
        const root = document.getElementById("md");
        const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
        let moves = 0, last = null;
        const note = () => {
          const now = Math.round(root.getBoundingClientRect().right);
          if (last !== null && now !== last) moves++;
          last = now;
        };
        note();
        for (const [, tag, text] of blocks) {
          const el = document.createElement(tag);
          root.appendChild(el);
          for (let i = 1; i <= text.length; i += 4) { el.textContent = text.slice(0, i); await frame(); note(); }
          el.textContent = text; await frame(); note();
        }
        for (let i = 0; i < 40; i++) { await frame(); note(); }
        return moves;
      }, blocksOf());
    } finally { await close(); }
  };
  function blocksOf() { return ANSWER; }

  const untouched = await measure(false);
  const fixed = await measure(true);
  assert.equal(untouched, 0, "the panel does not move this edge by itself");
  assert.equal(fixed, 1, "and the fix may move it once, to reserve the gutter");
});

test("a user message on the real stylesheet is split line by line", { skip }, async () => {
  const c = real.cls;
  const text = ["npm install کے بعد پروجیکٹ چلائیں", "Run the build and check the output", "یہ آخری سطر ہے"].join("\n");
  const message = `
<div class="${c.message} ${c.stickyHeader} ${c.timelineMessage}"><div class="${c.userMessageContainer}"><div class="${c.userMessage}">
  <div class="${c.expandable}"><div class="${c.contentWrapper}">
    <div class="${c.content}"><span dir="auto">${text}</span></div>
  </div></div>
</div></div></div>`;

  const { page, close } = await real.open(real.conversation(message));
  try {
    const lines = await page.$$eval(".smart-rtl-line", (els) =>
      els.map((el) => [getComputedStyle(el).direction, (el.textContent || "").slice(0, 12)]));
    assert.equal(lines.length, 3, "three lines, three elements");
    assert.equal(lines[0][0], "rtl", lines[0][1]);
    assert.equal(lines[1][0], "ltr", lines[1][1]);
    assert.equal(lines[2][0], "rtl", lines[2][1]);
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * The claim this whole project rests on: it sets a direction, and does nothing
 * else. Not a new rule, not a restyle, not a nudge to somebody's spacing.
 *
 * That is not a claim to make from reading the code. Every computed property of
 * every element is read twice - with the fix loaded and without it, on Claude
 * Code's own stylesheet - and the difference is the whole answer.
 * ------------------------------------------------------------------------- */

const URDU_ANSWER = `<h3>JavaScript میں Debounce فنکشن</h3>
<p>فرض کریں ایک سرچ باکس ہے جو ہر حرف پر کال کرتا ہے اور ہر بار نیٹ ورک پر جاتا ہے۔</p>
<h3>Debounce بمقابلہ Throttle</h3>
<ul><li>args — اصل arguments جو فنکشن کو ملتے ہیں۔</li></ul>
<p>Result: 250-400ms</p>
<pre><code>const wait = (ms) =&gt; new Promise((r) =&gt; setTimeout(r, ms));</code></pre>
<table><tr><th>وقت</th><th>Result</th></tr><tr><td>250-400ms</td><td>ٹھیک</td></tr></table>`;

const ENGLISH_ANSWER = `<h3>Debounce versus throttle</h3>
<p>The build tool comparison is documented upstream and stays in English.</p>
<p>Result: 250-400ms</p>`;

/** Every computed property of every element in the message, plus its box and text. */
const READ_EVERYTHING = () => {
  const out = [];
  for (const el of document.querySelectorAll("#md, #md *, [class*='timelineMessage_']")) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const props = {};
    for (let i = 0; i < cs.length; i++) props[cs[i]] = cs.getPropertyValue(cs[i]);
    out.push({ tag: el.tagName, text: el.textContent, h: Math.round(r.height), props });
  }
  return out;
};

async function bothWays(html) {
  const read = async (fix) => {
    const { page, close } = await real.open(
      real.conversation(real.answer().replace("></div>", ">" + html + "</div>")), { fix });
    try { return await page.evaluate(READ_EVERYTHING); } finally { await close(); }
  };
  const off = await read(false), on = await read(true);
  assert.equal(off.length, on.length, "the fix must not add or remove elements");

  const differing = new Set(), rewritten = [];
  for (let i = 0; i < off.length; i++) {
    if (off[i].text !== on[i].text) rewritten.push(off[i].tag);
    for (const p of Object.keys(off[i].props)) {
      if (off[i].props[p] !== on[i].props[p]) differing.add(p);
    }
  }
  return { differing: [...differing].sort(), rewritten, off, on };
}

test("an English answer is not touched in any way whatsoever", { skip }, async () => {
  const { differing, rewritten, off, on } = await bothWays(ENGLISH_ANSWER);
  assert.deepEqual(rewritten, [], "no text is ever rewritten");
  assert.deepEqual(differing, [],
    `an answer with no RTL in it must compute identically with the fix and without it`);
  assert.deepEqual(on.map((e) => e.h), off.map((e) => e.h), "and occupy the same space");
});

test("an Urdu answer differs by direction, and by nothing that is not direction", { skip }, async () => {
  const { differing, rewritten } = await bothWays(URDU_ANSWER);
  assert.deepEqual(rewritten, [], "no text is ever rewritten");

  // direction and unicode-bidi ARE the fix. The rest of this list is the timeline
  // dot being moved to the side the message reads from - a 30px gutter on the row,
  // and the width every element inside it then inherits. It is decoration, it is
  // the only thing here that is not direction, and it is behind MIRROR_TIMELINE in
  // the payload: set that to false and this list is exactly two entries long.
  const allowed = [
    "direction", "unicode-bidi",
    "padding-right", "padding-inline-end",             // the gutter itself
    "width", "inline-size",                            // what the gutter takes
    "perspective-origin", "transform-origin"           // both are computed from width
  ];
  const unexpected = differing.filter((p) => !allowed.includes(p));
  assert.deepEqual(unexpected, [],
    `these are neither direction nor the timeline gutter: ${unexpected.join(", ")}`);

  assert.ok(differing.includes("direction"), "and it must actually set a direction");
  // the one that caught a real restyle: <th> is centred by the BROWSER, not by the
  // host, and text-align:start was quietly un-centring every header in an Urdu table
  assert.ok(!differing.includes("text-align"),
    "the fix must not re-align anything the browser or the host aligned");
});

test("the dot goes with its message, in the frame the message turns", { skip }, async () => {
  // The dot is Claude Code's, drawn by its own ::before at left: 9px, and a message
  // that reads from the right belongs beside a dot on the right. This worked once a
  // turn had finished; while the model was still working it did not happen at all -
  // on a one-paragraph reply the dot never moved, because the message it belonged to
  // was never decided. Measured on the old engine: the dot changed on zero frames.
  //
  // So this asserts the two halves together: that it moves, and that it moves WITH
  // the text rather than after it - and that an English answer in the same
  // conversation keeps its own dot exactly where the panel put it.
  const c = real.cls;
  const english = `<div class="${c.message} ${c.timelineMessage}"><div class="${c.root}">
    <p>The build tool comparison is documented upstream and stays in English.</p></div></div>`;

  const { page, close } = await real.open(
    real.conversation(english + real.answer()) + real.working());
  try {
    const seen = await page.evaluate(async (text) => {
      const md = document.getElementById("md");
      const rows = [...document.querySelectorAll('[class*="timelineMessage_"]')];
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const side = (row) => {
        const b = getComputedStyle(row, "::before");
        return b.left === "9px" ? "left" : "right";
      };

      const dots = rows.map((r) => [side(r)]), turned = [];
      const p = document.createElement("p");
      md.appendChild(p);
      for (let i = 1; i <= text.length + 30; i += 3) {
        p.textContent = text.slice(0, i);
        await frame();
        rows.forEach((r, n) => { const s = side(r); if (s !== dots[n][dots[n].length - 1]) dots[n].push(s); });
        turned.push(!!p.closest('[data-bidi="rtl"]'));
      }
      return { english: dots[0], urdu: dots[1], turnedAt: turned.indexOf(true) };
    }, "useMemo اور useCallback کا فرق یہی ہے۔");

    assert.deepEqual(seen.english, ["left"], "an English answer's dot never moves");
    assert.deepEqual(seen.urdu, ["left", "right"],
      "the Urdu message's dot moves once, to the side it reads from, and stays there");
    assert.ok(seen.turnedAt >= 0, "and the message really did turn while the model worked");
  } finally { await close(); }
});

/* ------------------------------------------------------------------------- *
 * Number 2, on the real stylesheet: the message a person sent.
 *
 * Two separate things live here. The direction of each line, which is ours. And a
 * fault that is Claude Code's own and has nothing to do with right-to-left: a
 * message that heads a turn is `position: sticky`, and expanded it has no height
 * cap, so it can never show its own bottom - the "Show less" at the end of it is
 * unreachable for as long as the turn lasts. Both are checked here against the
 * panel's own rules rather than a copy of them.
 * ------------------------------------------------------------------------- */

const LONG = Array.from({ length: 30 }, (_, i) => `سوال کی سطر نمبر ${i + 1} یہاں لکھی ہے`).join("\n");

test("a sent message is decided line by line, by the formula", { skip }, async () => {
  const lines = [
    "npm install کے بعد پروجیکٹ چلائیں",
    "Run the build and check the output",
    "package.json میں scripts دیکھیں",
    "const x = useMemo(a, b);",
    "یہ آخری سطر ہے۔"
  ];
  const { page, close } = await real.open(
    real.conversation(real.userMessage(lines.join("\n"), { expanded: true })));
  try {
    const seen = await page.$$eval(".smart-rtl-line",
      (els) => els.map((e) => getComputedStyle(e).direction));
    assert.deepEqual(seen, ["rtl", "ltr", "rtl", "ltr", "rtl"],
      "every line with Urdu in it reads right to left; the two without are left alone");

    const copied = await page.evaluate(() => {
      const body = document.querySelector('[class*="content_"]');
      const r = document.createRange(); r.selectNodeContents(body);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    });
    assert.equal(copied, lines.join("\n"), "and copying it gives back exactly what was sent");
  } finally { await close(); }
});

test("opening a long message keeps it under the eye, and lets it scroll", { skip }, async () => {
  const { page, close } = await real.open(
    real.conversation(real.userMessage(LONG) + real.answer(), { height: 420 }) + real.toggling());
  try {
    // fill the answer so there is something to have scrolled past
    await page.evaluate(() => {
      const md = document.getElementById("md");
      for (let i = 0; i < 60; i++) {
        const p = document.createElement("p");
        p.textContent = "جواب کی سطر نمبر " + (i + 1);
        md.appendChild(p);
      }
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.getElementById("scroller").scrollTop = 700; });
    await page.waitForTimeout(200);

    const before = await page.$eval('[class*="stickyHeader_"]',
      (el) => Math.round(el.getBoundingClientRect().top));
    await page.click('[class*="contentWrapper_"]');
    await page.waitForTimeout(400);
    const after = await page.$eval('[class*="stickyHeader_"]',
      (el) => Math.round(el.getBoundingClientRect().top));

    assert.ok(Math.abs(after - before) <= 2,
      `the message jumped ${after - before}px when it was opened`);

    const pinned = await page.$eval('[class*="stickyHeader_"]',
      (el) => getComputedStyle(el).position);
    assert.equal(pinned, "static",
      "an expanded message must stop being pinned, or its own bottom can never be reached");

    // and it really does travel now
    const atTop = await page.$eval('[class*="stickyHeader_"]', (el) => el.getBoundingClientRect().top);
    await page.evaluate(() => { document.getElementById("scroller").scrollTop += 200; });
    await page.waitForTimeout(150);
    const moved = await page.$eval('[class*="stickyHeader_"]', (el) => el.getBoundingClientRect().top);
    assert.ok(atTop - moved > 150, "scrolling moves it, so the end of it can be reached");
  } finally { await close(); }
});

test("closing it gives the reader back the line they were on - on the real stylesheet", { skip }, async () => {
  // Reported after using it: partway down a long answer, open the question above to
  // check something, close it again - and the answer came back from its beginning.
  // Measured here against Claude Code's own CSS, because it is a geometry promise and
  // the copied page cannot settle geometry on its own.
  const { page, close } = await real.open(
    real.conversation(real.userMessage(LONG) + real.answer(), { height: 420 }) + real.toggling());
  try {
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const root = document.getElementById("md");
      for (let i = 0; i < 60; i++) {
        const p = document.createElement("p");
        p.textContent = "جواب کی سطر نمبر " + i + " یہاں لکھی ہے";
        root.appendChild(p);
      }
      document.getElementById("scroller").scrollTop += 700;
    });
    await page.waitForTimeout(300);

    const reading = await page.evaluate(() => {
      const top = document.getElementById("scroller").getBoundingClientRect().top;
      const first = [...document.querySelectorAll("#md p")]
        .find((el) => el.getBoundingClientRect().top >= top);
      return first ? { text: first.textContent, at: Math.round(first.getBoundingClientRect().top - top) } : null;
    });
    assert.ok(reading, "the reader is looking at a line of the answer");

    await page.click('[class*="contentWrapper_"]');       // open the question
    await page.waitForTimeout(400);
    await page.click(".collapseButton");                  // and close it
    await page.waitForTimeout(400);

    const back = await page.evaluate((wanted) => {
      const top = document.getElementById("scroller").getBoundingClientRect().top;
      const same = [...document.querySelectorAll("#md p")].find((el) => el.textContent === wanted);
      return same ? Math.round(same.getBoundingClientRect().top - top) : null;
    }, reading.text);

    assert.ok(back !== null, "the line they were reading is gone");
    assert.ok(Math.abs(back - reading.at) <= 2,
      "the line they were reading moved " + (back - reading.at) + "px");
  } finally { await close(); }
});

test("closing it again leaves it exactly where it was", { skip }, async () => {
  const { page, close } = await real.open(
    real.conversation(real.userMessage(LONG) + real.answer(), { height: 420 }) + real.toggling());
  try {
    await page.waitForTimeout(300);
    await page.click('[class*="contentWrapper_"]');
    await page.waitForTimeout(400);
    const before = await page.$eval('[class*="stickyHeader_"]',
      (el) => Math.round(el.getBoundingClientRect().top));
    await page.click(".collapseButton");
    await page.waitForTimeout(400);
    const after = await page.$eval('[class*="stickyHeader_"]',
      (el) => Math.round(el.getBoundingClientRect().top));
    assert.ok(Math.abs(after - before) <= 2, `it jumped ${after - before}px when it was closed`);
  } finally { await close(); }
});

test("an English draft in their own box is not moved by a pixel", { skip }, async () => {
  const type = async (page) => {
    await page.click("." + real.cls.messageInput);
    await page.keyboard.type("Run the build and check it.", { delay: 3 });
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Then open the report.", { delay: 3 });
    await page.waitForTimeout(200);
  };
  const off = await real.open(real.composer(), { fix: false });
  const on = await real.open(real.composer());
  try {
    await type(off.page); await type(on.page);
    const { lineBoxes } = require("./support/lines.js");
    assert.deepEqual(await lineBoxes(on.page, "." + real.cls.messageInput),
                     await lineBoxes(off.page, "." + real.cls.messageInput));
  } finally { await off.close(); await on.close(); }
});

test("Hello, then Urdu beside it, turns the box - on the real stylesheet", { skip }, async () => {
  // Typed by hand into the real editor first, and it did not turn. This is that
  // keystroke for keystroke, against Claude Code's own CSS and its own class names,
  // so the next person does not have to find out by hand.
  const { page, close } = await real.open(real.composer());
  try {
    await page.click("." + real.cls.messageInput);
    await page.keyboard.type("Hello ", { delay: 3 });
    assert.deepEqual(await lineReads(page, "." + real.cls.messageInput), ["ltr"],
      "English on its own is left exactly as it was");

    await page.keyboard.type("ہیلو", { delay: 3 });
    await page.waitForTimeout(150);
    assert.deepEqual(await lineReads(page, "." + real.cls.messageInput), ["rtl"],
      "and the Urdu beside it turns the line, though the line opens in English");
    assert.deepEqual(await lineReads(page, "." + real.cls.mentionMirror),
                     await lineReads(page, "." + real.cls.messageInput),
      "the layer you read agrees with the one holding the caret");

    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.waitForTimeout(150);
    assert.deepEqual(await lineReads(page, "." + real.cls.messageInput), ["ltr"],
      "and deleting the Urdu puts it back");
  } finally { await close(); }
});

test("their own box, with a mixed draft in it - the limit, on the real stylesheet", { skip }, async () => {
  // What the box does, measured against Claude Code's own CSS rather than a copy of
  // it: one direction for the whole draft. An English line inside an Urdu one goes
  // with it. Written down so that changing it has to change this and say why.
  const { page, close } = await real.open(real.composer());
  const IN = "." + real.cls.messageInput;
  try {
    await page.click(IN);
    await page.keyboard.type("اسلام علیکم", { delay: 3 });
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Run the build", { delay: 3 });
    await page.waitForTimeout(200);

    assert.deepEqual(await lineReads(page, IN), ["rtl", "rtl"]);
    assert.deepEqual(await lineReads(page, "." + real.cls.mentionMirror),
                     await lineReads(page, IN),
      "and whatever it does, both layers do it together");
  } finally { await close(); }
});

test("nothing of ours is in their box, and no keystroke is late", { skip }, async () => {
  // The two faults that ended the per-line attempts, on their own stylesheet: an
  // element of ours inside a layer somebody else owns, and a layer that is repainted
  // a task later than the box. Neither can happen now, and neither is left to be
  // remembered - it is asserted.
  const { page, close } = await real.open(real.composer());
  const IN = "." + real.cls.messageInput;
  try {
    await page.click(IN);
    const behind = [];
    const word = ["ہ", "ی", "ل", "و"];
    for (let i = 0; i < word.length; i++) {
      await page.keyboard.type(word[i]);
      await page.waitForFunction(
        ([sel, n]) => document.querySelector(sel).textContent.length === n, [IN, i + 1]);
      const seen = await page.evaluate((sel) => new Promise((r) => requestAnimationFrame(() => r({
        typed: document.querySelector(sel).textContent,
        shown: document.querySelector(sel.replace("messageInput_", "mentionMirror_")).textContent
      }))), IN);
      if (seen.typed !== seen.shown) behind.push(seen);
    }
    assert.deepEqual(behind, [], "the layer you read was behind the box");

    const shape = await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      return { inside: input.querySelectorAll("*").length, kids: input.parentElement.children.length };
    }, IN);
    assert.equal(shape.inside, 0, "the box holds text, and no element of ours");
    assert.equal(shape.kids, 2, "and no layer of ours has been added beside theirs");
  } finally { await close(); }
});

test("the real box is given back exactly as it was found", { skip }, async () => {
  const { page, close } = await real.open(real.composer());
  const IN = "." + real.cls.messageInput;
  try {
    await page.click(IN);
    await page.keyboard.type("Hello ہیلو", { delay: 3 });
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Run the build", { delay: 3 });
    await page.waitForTimeout(200);

    const after = await page.evaluate((sel) => {
      window.__bidiFixOff();
      const input = document.querySelector(sel);
      return {
        text: input.textContent,
        direction: getComputedStyle(input).direction,
        kinds: [...input.childNodes].map((n) => n.nodeType)
      };
    }, IN);
    assert.equal(after.text, "Hello ہیلو\nRun the build");
    assert.equal(after.direction, "ltr");
    // every child a text node - the browser splits its own on shift+enter, and that
    // splitting is the browser's. What matters is that not one of them is an element.
    assert.deepEqual([...new Set(after.kinds)], [3]);
  } finally { await close(); }
});

test("on the real build the fault is found, so nothing stands down by mistake", { skip }, async () => {
  // The stand-down check is the one thing here that can switch EVERYTHING off, so a
  // false positive on a build that still has the fault would be the most expensive
  // possible bug: silent, total, and looking exactly like success.
  //
  // Against Claude Code's own stylesheet and its own class names: the instrument must
  // find a container it can actually measure in, and it must report the fault present.
  const { page, close } = await real.open(
    real.conversation(real.answer("md")));
  try {
    await page.evaluate(([id, blocks]) => {
      const root = document.getElementById(id);
      for (const [tag, text] of blocks) {
        const el = document.createElement(tag);
        el.textContent = text;
        root.appendChild(el);
      }
    }, ["md", [["p", "npm install کے بعد پروجیکٹ چلائیں"], ["p", "Second paragraph here"]]]);
    await page.waitForTimeout(600);

    const s = await page.evaluate(() => window.__bidiStatus());
    assert.equal(s.direction, "on",
      "the fix stood down on a build that still has the fault: " + JSON.stringify(s));
    assert.equal(s.engine.blocks, "watching");
    assert.equal(s.engine.contained, 0, "something threw on their own stylesheet");

    assert.equal(await page.$$eval("[data-bidi-probe]", (n) => n.length), 0,
      "the probe was left behind in the page");
  } finally { await close(); }
});

/**
 * The copy button on a code block fades in on hover and blinks while an answer
 * streams. Asked because it was seen happening with the fix installed, and "it
 * started after I installed something" is the only evidence anybody ever has.
 *
 * Their own stylesheet decides it, and nothing else can:
 *
 *   .copyButton_CEmTFw                                { opacity: 0; transition: opacity .15s }
 *   .codeBlockWrapper_-a7MRw:hover .copyButton_-a7MRw { opacity: 1 }
 *
 * so it is pure CSS :hover - no JavaScript shows or hides it. It can only blink if
 * the hover state is lost, and hover is lost when the element under the pointer is
 * REPLACED. Their renderer replaces it as it re-parses what has arrived so far.
 *
 * Measured both ways, same page, same mouse position, same stream.
 */
const blinkRun = async ({ fix, rerender }) => {
  const { page, close } = await real.open(real.conversation(
    `<div class="${real.cls.message} ${real.cls.timelineMessage}">
       <div class="root_-a7MRw" id="md">
         <p id="text">جواب یہاں سے شروع ہوتا ہے اور یہ اردو ہے</p>
         <div class="codeBlockWrapper_-a7MRw" id="wrap">
           <pre><code>npm install</code></pre>
           <button class="copyButton_CEmTFw copyButton_-a7MRw" id="copy">c</button>
         </div>
       </div>
     </div>`), { fix });
  try {
    const at = await page.$eval("#wrap", (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(400);
    return await page.evaluate(async (rerender) => {
      const seen = [];
      let go = true;
      const tick = () => {
        const b = document.getElementById("copy");
        if (b) seen.push(parseFloat(getComputedStyle(b).opacity));
        if (go) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let i = 0; i < 10; i++) {
        document.getElementById("text").textContent += " اور یہ اگلا حصہ " + i;
        if (rerender) {
          const wrap = document.getElementById("wrap");
          wrap.replaceWith(wrap.cloneNode(true));
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 300));
      go = false;
      let flips = 0, was = seen[0] > 0.5;
      for (const o of seen) { const now = o > 0.5; if (now !== was) { flips++; was = now; } }
      return { flips, decided: document.querySelectorAll('[data-bidi="rtl"]').length };
    }, rerender);
  } finally { await close(); }
};

test("the copy button blinking while an answer streams is not ours", { skip }, async () => {
  const withFix = await blinkRun({ fix: true, rerender: true });
  const without = await blinkRun({ fix: false, rerender: true });

  assert.ok(withFix.decided > 0,
    "the message was never decided, so this comparison would prove nothing");
  assert.ok(without.flips > 0,
    "the blinking did not reproduce without the fix either - the model is wrong");
  assert.ok(Math.abs(withFix.flips - without.flips) <= 2,
    "the fix changed how much it blinks: " + without.flips + " -> " + withFix.flips);
});

test("and nothing of ours goes anywhere near that button", { skip }, async () => {
  // The stronger form of the same answer, and the one that keeps being true: not
  // "it did not blink more", but "no rule of ours can reach it at all".
  const { page, close } = await real.open(real.conversation(
    `<div class="${real.cls.message} ${real.cls.timelineMessage}">
       <div class="root_-a7MRw" id="md">
         <p>جواب یہاں سے شروع ہوتا ہے اور یہ اردو ہے</p>
         <div class="codeBlockWrapper_-a7MRw" id="wrap">
           <pre><code>npm install</code></pre>
           <button class="copyButton_CEmTFw copyButton_-a7MRw" id="copy">c</button>
         </div>
       </div>
     </div>`));
  try {
    const hits = await page.evaluate(() => {
      const targets = [document.getElementById("copy"), document.getElementById("wrap")];
      const ours = [...document.styleSheets].filter(
        (s) => s.ownerNode && s.ownerNode.id && s.ownerNode.id.indexOf("smart-rtl") === 0);
      const matched = [];
      for (const sheet of ours) {
        for (const rule of sheet.cssRules) {
          if (!rule.selectorText) continue;
          for (const t of targets) {
            try { if (t.matches(rule.selectorText)) matched.push(rule.selectorText); } catch (e) {}
          }
        }
      }
      return { matched, sheets: ours.length };
    });
    assert.ok(hits.sheets > 0, "our stylesheet is not even installed - nothing was tested");
    assert.deepEqual(hits.matched, [],
      "a rule of ours matches the copy button or its wrapper");
  } finally { await close(); }
});
