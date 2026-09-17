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
const fs = require("node:fs");
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
  // Right to left, every line starts at the RIGHT edge of the panel, so anything that
  // moves that edge mid-answer moves text somebody has already read. This counts the times
  // it moves at all, with the fix and without it.
  //
  // None is required. It used to be one - the message's dot and its gutter were moved to the
  // right when the message was decided - and that was a thing moved by hand, not a direction
  // the browser draws when it is told. Given only the tag, nothing moves this edge at all.
  // decisions.md, 49.
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
  assert.equal(fixed, 0, "and neither does the fix: the tag moves no edge anybody reads from");
});

test("a sent message on the real stylesheet takes one direction, and nothing is built", { skip }, async () => {
  // Shaped the way the bundle renders it, hidden heading and all - the heading is what
  // a hand-drawn model left out for weeks, and with it left out the model could not
  // show that the heading decided every message first.
  const text = ["npm install کے بعد پروجیکٹ چلائیں", "Run the build and check the output", "یہ آخری سطر ہے"].join("\n");
  const html = real.conversation(real.userMessage(text, { expanded: true }));
  const off = await real.open(html, { fix: false });
  const on = await real.open(html);
  try {
    const look = (p) => p.$eval("." + real.cls.content, (el) => ({
      dir: getComputedStyle(el).direction, html: el.innerHTML
    }));
    const a = await look(off.page), b = await look(on.page);
    assert.equal(a.dir, "ltr", "untouched, the message is one left-to-right run - the bug");
    assert.equal(b.dir, "rtl", "with the fix it reads right to left");
    assert.equal(b.html, a.html, "and not one element of ours is inside it");
  } finally { await off.close(); await on.close(); }
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

  // direction and unicode-bidi ARE the tag. The two paddings are a list's room for its
  // bullets and numbers, and the margin is an Urdu table going to the edge its reader starts
  // from - and the browser moves all three by itself the moment it is told the direction, with
  // no rule of ours about any of them. The test below says what each must look like; this one
  // says nothing ELSE moved.
  //
  // The paddings used to be allowed for a second reason: the message's dot and its 30px gutter
  // were moved to the right by hand. That was a wish, not the work - told the direction, the
  // browser leaves a dot drawn at `left: 9px` exactly where it is - and it is gone. Section 49.
  const allowed = ["direction", "unicode-bidi",
                   "padding-left", "padding-inline-start",     // a list's room for its markers,
                   "padding-right", "padding-inline-end",      // moved by the browser when told
                   "margin-left", "margin-inline-end"];        // a table, to its reader's edge
  const unexpected = differing.filter((p) => !allowed.includes(p));
  assert.deepEqual(unexpected, [],
    `these are not what the browser does when it is told a direction: ${unexpected.join(", ")}`);
  assert.ok(differing.includes("direction"), "and it must actually set a direction");
  // the one that caught a real restyle: <th> is centred by the BROWSER, not by the host,
  // and text-align:start was quietly un-centring every header in an Urdu table
  assert.ok(!differing.includes("text-align"),
    "the fix must not re-align anything the browser or the host aligned");
});

test("an Urdu list keeps its bullets and numbers, and an Urdu table its column order", { skip }, async () => {
  // What somebody installing the builds one after another saw, and fifty-two builds of this
  // suite did not: every item of an Urdu list turned, and the list itself did not. A list
  // keeps the room for its markers on its start side and each item draws its marker outside
  // itself, on the ITEM's start side - so every bullet and every number went out past the
  // right-hand edge of the answer, which clips, and the room kept for them sat empty on the
  // left. Measured on Claude Code's own stylesheet, where that room is padding-inline-start.
  const html = `<p>یہ ایک فہرست ہے۔</p>
<ul id="u"><li>پہلا نکتہ اردو میں</li><li>npm install</li><li>250–400ms</li></ul>
<ol id="o"><li>پہلا قدم</li><li><code>npm install</code> کے بعد چلائیں</li></ol>
<ul id="e"><li>build</li><li>test</li></ul>
<table id="t"><tr><th>نام</th><th>وقت</th></tr><tr><td>سرچ باکس</td><td>250–400ms</td></tr></table>
<table id="et"><tr><th>Name</th><th>Time</th></tr><tr><td>Auto-save</td><td>1000ms</td></tr></table>`;
  const { page, close } = await real.open(real.conversation(real.answer().replace("></div>", ">" + html + "</div>")));
  try {
    const seen = await page.evaluate(() => {
      const md = document.getElementById("md").getBoundingClientRect();
      const box = (el) => el.getBoundingClientRect();
      const list = (id) => {
        const ul = document.getElementById(id), cs = getComputedStyle(ul);
        return {
          dir: cs.direction,
          roomLeft: parseFloat(cs.paddingLeft), roomRight: parseFloat(cs.paddingRight),
          insideAnswer: box(ul).left >= md.left - 1 && box(ul).right <= md.right + 1,
          items: [...ul.children].map((li) => {
            const r = document.createRange();
            r.selectNodeContents(li);
            return { dir: getComputedStyle(li).direction, text: li.textContent,
                     textToMarkerSide: Math.round(getComputedStyle(li).direction === "rtl"
                       ? box(li).right - r.getBoundingClientRect().right
                       : r.getBoundingClientRect().left - box(li).left) };
          })
        };
      };
      // where one character of a text node is drawn, to tell 250–400ms from 400ms–250
      const at = (li, ch) => {
        const t = li.firstChild, i = t.nodeValue.indexOf(ch), r = document.createRange();
        r.setStart(t, i); r.setEnd(t, i + 1);
        return r.getBoundingClientRect().left;
      };
      const numbers = document.querySelector("#u li:last-child");
      const heads = (id) => [...document.querySelectorAll("#" + id + " th")].map((th) => Math.round(box(th).left));
      return {
        u: list("u"), o: list("o"), e: list("e"),
        numbersInOrder: at(numbers, "2") < at(numbers, "m"),
        table: { heads: heads("t"), rightGap: Math.round(md.right - box(document.getElementById("t")).right) },
        englishTable: { heads: heads("et"), leftGap: Math.round(box(document.getElementById("et")).left - md.left) }
      };
    });

    // "e" is a list of nothing but English, in the same Urdu answer. 0.5.6 left it on the left,
    // and that was a rule of ours: had Claude Code fixed this itself - the answer marked
    // dir="rtl" - everything laid out in the answer would read from the right, that list
    // included, while its words kept their own order. Measured against exactly that reference.
    for (const id of ["u", "o", "e"]) {
      const l = seen[id];
      assert.equal(l.dir, "rtl", `${id}: a list in an Urdu answer reads from the right`);
      assert.ok(l.roomRight > 0 && l.roomLeft === 0,
        `${id}: the room for its markers has to be on the right, where they are drawn (left ${l.roomLeft}, right ${l.roomRight})`);
      assert.ok(l.insideAnswer, `${id}: and inside the answer, which clips anything past its edge`);
      for (const item of l.items) {
        assert.equal(item.dir, "rtl", `${id}: "${item.text}" draws its marker on the other side from its siblings`);
        assert.ok(Math.abs(item.textToMarkerSide) <= 1,
          `${id}: "${item.text}" sits ${item.textToMarkerSide}px away from its own marker`);
      }
    }
    assert.ok(seen.numbersInOrder, "an English item in an Urdu list must still read 250–400ms, not 400ms–250");

    assert.ok(seen.table.heads[0] > seen.table.heads[1], "an Urdu table's first column is its rightmost");
    assert.ok(Math.abs(seen.table.rightGap) <= 1, `and it starts at the answer's right edge, not ${seen.table.rightGap}px from it`);
    // and an English table in an Urdu answer, the same way the reference lays it out
    assert.ok(seen.englishTable.heads[0] > seen.englishTable.heads[1], "a table in an Urdu answer orders its columns from the right");
    assert.ok(seen.englishTable.leftGap > 1, "and starts from the right, not against the left edge");
  } finally { await close(); }
});

test("the dot stays exactly where Claude Code draws it, on every row, in every language", { skip }, async () => {
  // The dot is not text. It is drawn by the row's own ::before at `left: 9px` in a gutter
  // reserved by `padding-left: 30px` - physical sides, which the browser does not turn when it
  // is told a direction - and its connector joins one row to the next, and its colour reports
  // what a tool did. Given only the tag, the browser leaves it where it is, and so does this.
  //
  // Until 0.5.9 it was moved to the right on a row whose message read right to left, by reading
  // the panel's pixels at runtime and writing them back on the other side. That was a wish
  // forced by hand, not the work, and on a row whose lines were ragged - a narration summary -
  // it left a gap beside the dot that changed from one line to the next. decisions.md, 49.
  const c = real.cls;
  const md = (html) => `<div class="${c.message} ${c.timelineMessage}"><div class="${c.root}">${html}</div></div>`;
  const html = real.conversation(
    md("<p>The build tool comparison is documented upstream and stays in English.</p>") +
    md("<p>npm install کے بعد پروجیکٹ چلائیں اور نتیجہ دیکھیں</p>") +
    md("<p>Another English answer, after the Urdu one.</p>"));

  const look = async (fix) => {
    const { page, close } = await real.open(html, { fix });
    try {
      await page.waitForTimeout(700);
      return await page.evaluate(() => [...document.querySelectorAll('[class*="timelineMessage_"]')].map((el) => {
        const box = el.getBoundingClientRect(), p = el.querySelector("p").getBoundingClientRect();
        const d = getComputedStyle(el, "::before"), a = getComputedStyle(el, "::after");
        return {
          dot: [d.left, d.right, d.top].join(" "), line: [a.left, a.right].join(" "),
          padding: [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight].join(" "),
          box: [p.left, p.right, p.width].map(Math.round)
        };
      }));
    } finally { await close(); }
  };

  const off = await look(false), on = await look(true);
  assert.equal(on.length, 3);
  assert.deepEqual(on, off, "a row's dot, its connector, its gutter or its text box moved - and none of them is text");
  // and the Urdu row really was turned, so this is not a page on which nothing happened
  const turned = await (async () => {
    const { page, close } = await real.open(html, { fix: true });
    try { await page.waitForTimeout(700); return await page.$$eval('[data-bidi="rtl"]', (n) => n.length); }
    finally { await close(); }
  })();
  assert.ok(turned > 0, "nothing was turned - the fix, or this test, is not running");
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

test("a sent message is decided as one, by the formula, and copies back exactly", { skip }, async () => {
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
    const dir = await page.$eval("." + real.cls.content, (el) => getComputedStyle(el).direction);
    assert.equal(dir, "rtl", "a message with Urdu in it reads right to left, the whole of it");

    const copied = await page.evaluate((sel) => {
      const r = document.createRange(); r.selectNodeContents(document.querySelector(sel));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return s.toString();
    }, "." + real.cls.content);
    assert.equal(copied, lines.join("\n"), "and copying it gives back exactly what was sent");

    const s = await page.evaluate(() => window.__bidiStatus());
    assert.equal(s.sentMessages, "on - measured working",
      "and the status reports what was measured, not what was switched on");
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

test("the box you type in differs by direction, and by nothing that is not direction", { skip }, async () => {
  // The same promise section 19 of decisions.md holds answers to, held to the box: every
  // computed property of every element in it, with the fix and without it, on Claude Code's
  // own stylesheet. Including a mention chip inside the layer people read - the kind of
  // element the rule that holds that layer's insides to its direction applies to, and which
  // it must not change in any other way.
  const chipClass = (fs.readFileSync(real.installed.css, "utf8").match(/\.(inputMentionChip_[A-Za-z0-9_-]+)/) || [])[1];
  const read = async (fix) => {
    const { page, close } = await real.open(real.composer(), { fix });
    try {
      return await page.evaluate(([inputCls, mirrorCls, chip]) => {
        const input = document.querySelector("." + inputCls), mirror = document.querySelector("." + mirrorCls);
        // what Claude Code itself does when a mention is typed: the text in the box, and
        // the same text over it with the mention drawn as a chip
        input.textContent = "دیکھیں @src/engine.js کو";
        mirror.innerHTML = 'دیکھیں <span class="' + chip + '">@src/engine.js</span> کو';
        return new Promise((done) => setTimeout(() => {
          const out = [];
          for (const el of [input.parentElement, input, mirror, ...mirror.querySelectorAll("*")]) {
            const cs = getComputedStyle(el), props = {};
            for (let i = 0; i < cs.length; i++) props[cs[i]] = cs.getPropertyValue(cs[i]);
            const r = el.getBoundingClientRect();
            out.push({ cls: el.className, props, box: [r.width, r.height].map(Math.round) });
          }
          done(out);
        }, 100));
      }, [real.cls.messageInput, real.cls.mentionMirror, chipClass || "chip_x"]);
    } finally { await close(); }
  };
  const off = await read(false), on = await read(true);
  assert.equal(on.length, off.length, "the fix must not add or remove elements");
  const differing = new Set();
  for (let i = 0; i < off.length; i++) {
    for (const p of Object.keys(off[i].props)) if (off[i].props[p] !== on[i].props[p]) differing.add(p);
    assert.deepEqual(on[i].box, off[i].box, off[i].cls + " changed size");
  }
  // A logical property - padding-inline-start and the like - is only a name for a physical
  // one, chosen by direction. Claude Code writes the box's padding physically, 14px left and
  // 36px right for the microphone, so turning the box swaps which of the two is called the
  // start: the name moves, the pixels do not. That is allowed only while the physical
  // properties behind it stay exactly as they were, which is asserted too.
  const logical = (p) => /-inline-(start|end)(-|$)/.test(p);
  const unexpected = [...differing].filter((p) => !["direction", "unicode-bidi"].includes(p) && !logical(p));
  assert.deepEqual(unexpected, [], "these are not direction: " + unexpected.join(", "));
  for (const p of ["padding-left", "padding-right", "margin-left", "margin-right", "left", "right"]) {
    assert.ok(!differing.has(p), p + " moved - that is a real restyle, not a logical name for an unchanged one");
  }
  assert.ok(differing.has("direction"), "and it must actually turn the box");
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
