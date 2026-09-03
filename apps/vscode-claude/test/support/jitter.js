/**
 * What a reader actually sees move.
 *
 * Direction being wrong for a moment and direction CHANGING under somebody's eyes
 * are different failures, and the second one is worse. A reader who is halfway
 * through a sentence when it jumps to the other side of the panel loses their
 * place; they did not lose it when the sentence merely started out wrong.
 *
 * Every attempt at "decide sooner" this project has made ended in that jump, so
 * sooner is not allowed to be argued for. It has to be measured, on the same page,
 * with the same spinner running, sampling every animation frame - which is the
 * only rate at which a browser can show anybody anything.
 *
 * Two numbers come out of it, and they mean different things:
 *
 *   flips     a block's direction changed. One is the price of the rule: when a
 *             line opens with an English word, the information that RTL is coming
 *             does not exist yet. Two means the reader was corrected twice, and
 *             three means the panel is dancing.
 *
 *   drift     already-written text moved sideways while its own text did not
 *             change. This catches what counting flips cannot: a decision on one
 *             block shoving a different block that the reader had already read.
 */

/** The spinner Claude Code runs while the model is working. See streaming.test.js. */
const WORKING = `<div class="statusLine_x">Working <span class="orbChar_x">·</span></div>
<script>
  var FRAMES = ["\u00b7","\u2722","\u2733","\u2736","\u273b","\u273d","\u273b","\u2736","\u2733","\u2722"];
  var orb = document.querySelector(".orbChar_x"), i = 0;
  window.__stopWorking = function () { clearInterval(window.__spin); window.__spin = null; };
  window.__spin = setInterval(function () { orb.textContent = FRAMES[++i % FRAMES.length]; }, 120);
</script>`;

/**
 * Play a script into a page and watch every frame of it.
 *
 * A step is one of:
 *   ["block", tag, text]   a block appears and its text arrives a few characters
 *                          at a time, the way a streamed answer arrives
 *   ["html", html]         markup dropped in whole - a table, a code fence
 *   ["pause", ms]          nothing is written. A tool is running; the spinner is not
 *   ["rerender"]           every block is replaced by a copy of itself, which is what
 *                          a markdown renderer does when it re-parses a growing answer
 *   ["stop"]               the model finishes and the spinner goes away
 *
 * @returns {Promise<{frames: Array, order: string[]}>} one entry per animation frame
 */
async function play(page, script, { rootId = "root", scrollerId = null, step = 3, tailMs = 900 } = {}) {
  return page.evaluate(async ([script, rootId, scrollerId, step, tailMs]) => {
    const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote";
    const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/, LAT = /[A-Za-z]/;
    // The same evidence the rule asks for: two RTL letters in a row, not a stray mark.
    // Written as the same character ranges @smartrtl/core falls back to, deliberately -
    // a harness that shares a regex with the thing it is testing can only ever agree
    // with it, and the first version of this line was silently matching plain English.
    const WORD = /[֐-ࣿיִ-﷿ﹰ-﻿]{2,}/;
    const root = document.getElementById(rootId);
    let nextId = 0;

    /** exactly what the reader sees, not what we hope we set */
    const dirOf = (el) => {
      if (el.getAttribute("data-bidi") === "ltr") return "ltr";
      if (el.closest('[data-bidi="rtl"]')) return "rtl";
      for (const ch of (el.textContent || "")) {
        if (RTL.test(ch)) return "rtl";
        if (LAT.test(ch)) return "ltr";
      }
      return "ltr";
    };

    const scroller = scrollerId ? document.getElementById(scrollerId) : null;
    const frames = [], order = [], scroll = [];
    const label = (el) => {
      if (!el.hasAttribute("data-t")) {
        el.setAttribute("data-t", "b" + nextId++);
        order.push(el.getAttribute("data-t"));
      }
      return el.getAttribute("data-t");
    };

    const sample = () => {
      const frame = {};
      for (const el of root.querySelectorAll(BLOCKS)) {
        const box = el.getBoundingClientRect();
        // the x a line STARTS at, which is the edge a reader's eye returns to
        const startX = dirOf(el) === "rtl" ? Math.round(box.right) : Math.round(box.left);
        const text = el.textContent || "";
        frame[label(el)] = { dir: dirOf(el), len: text.length, x: startX, ev: WORD.test(text) };
      }
      frames.push(frame);
      scroll.push(scroller ? Math.round(scroller.scrollTop) : 0);
    };

    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    sample();
    for (const [kind, a, b] of script) {
      if (kind === "block") {
        const el = document.createElement(a);
        root.appendChild(el);
        for (let i = 1; i <= b.length; i += step) { el.textContent = b.slice(0, i); await frame(); sample(); }
        el.textContent = b; await frame(); sample();
      } else if (kind === "html") {
        root.insertAdjacentHTML("beforeend", a);
        await frame(); sample();
      } else if (kind === "pause") {
        for (let t = 0; t < a; t += 16) { await frame(); sample(); }
      } else if (kind === "remount") {
        // The harsher thing a host can do: throw the message away and build it again
        // from scratch. Our attribute goes with it, and every block is a new element
        // that has never been looked at.
        root.removeAttribute("data-bidi");
        const fresh = [...root.children].map((el) => {
          const n = document.createElement(el.tagName);
          n.setAttribute("data-t", el.getAttribute("data-t"));
          n.textContent = el.textContent;
          return n;
        });
        root.replaceChildren(...fresh);
        await frame(); sample();
      } else if (kind === "rerender") {
        // A markdown renderer re-parsing what it has so far: same text, new elements.
        for (const el of [...root.querySelectorAll(BLOCKS)]) {
          const copy = el.cloneNode(true);
          el.replaceWith(copy);
        }
        await frame(); sample();
      } else if (kind === "stop") {
        if (window.__stopWorking) window.__stopWorking();
        await frame(); sample();
      }
    }
    for (let t = 0; t < tailMs; t += 16) { await frame(); sample(); }

    return { frames, order, scroll };
  }, [script, rootId, scrollerId, step, tailMs]);
}

/**
 * How many times each block changed direction, and whether it ever changed back.
 *
 * A block is only compared with itself: it is followed by the label it was given
 * when it first appeared, so a re-render that replaces the element does not read as
 * a new block, and text arriving does not read as a change.
 */
function flips({ frames, order }) {
  const seen = new Map(), counts = new Map(), path = new Map();
  for (const frame of frames) {
    for (const key of Object.keys(frame)) {
      const now = frame[key].dir, before = seen.get(key);
      if (before === undefined) { seen.set(key, now); path.set(key, [now]); continue; }
      if (before === now) continue;
      seen.set(key, now);
      counts.set(key, (counts.get(key) || 0) + 1);
      path.get(key).push(now);
    }
  }
  const worst = Math.max(0, ...counts.values());
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    worst, total, counts, path,
    worstKey: [...counts.entries()].sort((a, b) => b[1] - a[1])[0],
    /** a block that went one way and came back - the reader was told twice */
    changedBack: [...path.entries()].filter(([, p]) => p.length > 2 && p.includes(p[0], 1)).map(([k]) => k)
  };
}

/**
 * The largest sideways jump of a block whose own text did not change in that frame.
 *
 * Text still arriving explains movement; text sitting still does not. This is the
 * measurement that catches one message's decision shoving a paragraph the reader
 * had already finished.
 */
function drift({ frames }, { ignore = [] } = {}) {
  let worst = 0, at = null;
  for (let i = 1; i < frames.length; i++) {
    // A frame in which something was corrected is the correction being applied, and
    // applying it moves the message: a list's indent changes sides, the timeline
    // gutter is reserved. Charging those pixels here would count the one change of
    // direction a second time under another name. Frames with no correction in them
    // are the ones where nothing has any business moving.
    const corrected = Object.keys(frames[i]).some(
      (k) => frames[i - 1][k] && frames[i - 1][k].dir !== frames[i][k].dir);
    if (corrected) continue;

    for (const key of Object.keys(frames[i])) {
      if (ignore.includes(key)) continue;
      const now = frames[i][key], before = frames[i - 1][key];
      if (!before || before.len !== now.len) continue;   // it is being written; of course it moves
      const moved = Math.abs(now.x - before.x);
      if (moved > worst) { worst = moved; at = { key, frame: i, from: before.x, to: now.x }; }
    }
  }
  return { worst, at };
}

/** The direction every block ended on, in the order they appeared. */
function settled({ frames, order }) {
  const last = frames[frames.length - 1];
  return order.filter((k) => last[k]).map((k) => last[k].dir);
}

/**
 * How many frames each block spent showing a direction it did not end up in.
 *
 * This is the number the whole "decide sooner" argument is about. Flips measure the
 * cost of correcting somebody; this measures how long they were reading the wrong
 * thing before the correction came. Waiting for the turn to end scores perfectly on
 * flips and catastrophically here, which is exactly how a fix can pass every test it
 * has and still be useless to the person it was written for.
 *
 * At 60 frames a second, 60 frames is a second.
 */
function wrongFrames({ frames }) {
  const final = new Map(), wrong = new Map();
  for (const frame of frames) for (const key of Object.keys(frame)) final.set(key, frame[key].dir);
  for (const frame of frames) {
    for (const key of Object.keys(frame)) {
      if (frame[key].dir !== final.get(key)) wrong.set(key, (wrong.get(key) || 0) + 1);
    }
  }
  return { worst: Math.max(0, ...wrong.values()), per: wrong };
}

/**
 * The furthest the panel scrolled by itself.
 *
 * Nothing in this harness scrolls, and neither does anything the page does on its
 * own, so every pixel here was moved by the fix. A reader who is halfway down a
 * long answer notices this one before they notice any direction at all.
 */
function scrollJump({ scroll }) {
  let worst = 0;
  for (let i = 1; i < scroll.length; i++) worst = Math.max(worst, Math.abs(scroll[i] - scroll[i - 1]));
  return worst;
}

/**
 * The honest real-time number, and the honest jitter number.
 *
 * wrongFrames counts every frame a block did not point the way it ended up, and that
 * includes the frames before there was anything to know - a heading that has so far
 * produced only "JavaScript" is not being got wrong, it is being read correctly.
 * Counting those against the fix flatters nobody, but it does hide the two numbers a
 * reader actually experiences:
 *
 *   lag    frames between the first RTL WORD existing in a block and that block
 *          pointing right to left. This is the only latency anyone could have
 *          avoided, and it is what "real time" has to mean here.
 *
 *   moved  how many characters were already on screen at the moment it turned. A
 *          correction after thirteen characters is one word twitching; the same
 *          correction after four hundred is a paragraph thrown across the panel.
 */
function lag({ frames }) {
  const firstEvidence = new Map(), turned = new Map(), moved = new Map();
  frames.forEach((frame, i) => {
    for (const key of Object.keys(frame)) {
      const f = frame[key];
      if (f.ev && !firstEvidence.has(key)) firstEvidence.set(key, i);
      if (f.dir === "rtl" && !turned.has(key)) { turned.set(key, i); moved.set(key, f.len); }
    }
  });

  const per = new Map(), watched = new Map();
  for (const [key, ev] of firstEvidence) {
    const got = turned.get(key);
    per.set(key, got === undefined ? Infinity : Math.max(0, got - ev));
    // a block that was already right to left when it appeared moved nothing
    if (got !== undefined && got > 0) watched.set(key, moved.get(key));
  }
  return {
    worst: Math.max(0, ...per.values()),
    worstMoved: Math.max(0, ...watched.values()),
    per, watched
  };
}

module.exports = { WORKING, play, flips, drift, settled, wrongFrames, scrollJump, lag };
