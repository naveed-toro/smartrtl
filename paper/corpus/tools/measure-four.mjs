// The four candidates, on the chat data - the test that decides between them, not texts written
// to make one of them fail.
//
//   Any RTL              one right-to-left letter anywhere
//   Our first formula    two right-to-left characters in a row anywhere (packages/core, frozen)
//   Firefox's formula    a right-to-left letter within the first 63 letters
//   Firefox's formula    ... within the first 45 letters (the proposal)
//
// All four agree on every text that is one language, and on every text that opens right-to-left.
// They differ only on mixed texts that open left-to-right, so that is where they are measured:
//
//   1. wrong at the end  - the direction left on the screen once the answer has arrived.
//      Proxy until labels exist, the same as measure-x.mjs: a text with >= 50% right-to-left
//      words should read right-to-left, one with <= 20% left-to-right; in between is not counted.
//   2. went back         - none of the four can: each only ever turns left-to-right -> right-to-left.
//      Checked here, not assumed, by deciding every prefix of every mixed text.
//   3. turned, and how late - every block of every answer: how many turn at all, and the letter at
//      which they turn. A late turn is a line read left-to-right for a long time that then moves.
//
//   node measure-four.mjs  ->  paper/results/four.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildQueue } from "./label/queue.mjs";
import { HELPERS } from "./rules.mjs";
import { bidiClass } from "./bidi.mjs";

const require = createRequire(import.meta.url);
const core = require("../../../packages/core/src/direction.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "..", "results", "four.json");
const SOURCES = { A: path.join(HERE, "..", "private", "transcripts.units.jsonl"), B: path.join(HERE, "..", "public", "wildchat.units.jsonl") };

const isLetter = (ch) => /\p{L}/u.test(ch);
const isRtlLetter = (ch) => { const c = bidiClass(ch.codePointAt(0)); return c === "R" || c === "AL"; };

// For one text, the letter at which each candidate turns right-to-left (null: it never does).
// Our first formula turns when core.directionFor first says "rtl", which is found character by
// character and cross-checked against the frozen file on the whole text below.
function turns(text) {
  let letters = 0, firstRtl = null, firstLetterRtl = null, pair = null, prevRtl = false;
  for (const ch of text) {
    const letter = isLetter(ch);
    if (letter) letters++;
    const rtlChar = core.containsRtl(ch);
    if (rtlChar && prevRtl && pair === null) pair = letters;
    prevRtl = rtlChar;
    if (!letter) continue;
    const r = isRtlLetter(ch);
    if (firstLetterRtl === null) firstLetterRtl = r;
    if (r && firstRtl === null) firstRtl = letters;
  }
  const first = core.directionFor(text) === "rtl" ? (pair === null ? -1 : pair) : null;
  if (first === -1) throw new Error("our first formula says rtl but no pair was found: " + text.slice(0, 80));
  if (first === null && pair !== null) throw new Error("a pair was found but our first formula says no: " + text.slice(0, 80));
  return {
    letters, firstLetterRtl,
    "any-rtl": firstRtl,
    "first-formula": first,
    "firefox-63": firstRtl !== null && firstRtl <= 63 ? firstRtl : null,
    "firefox-45": firstRtl !== null && firstRtl <= 45 ? firstRtl : null
  };
}
const CANDIDATES = [["any-rtl", "Any RTL"], ["first-formula", "Our first formula"], ["firefox-63", "Firefox's formula, 63 letters"], ["firefox-45", "Firefox's formula, 45 letters"]];

// went back, checked: decide every prefix and look for a return to left-to-right
function wentBack(text, id) {
  const cps = [...text];
  let seenRtl = false;
  for (let i = 1; i <= cps.length; i++) {
    const t = turns(cps.slice(0, i).join(""));
    const rtl = t.firstLetterRtl === true || t[id] !== null;
    if (rtl) seenRtl = true; else if (seenRtl) return true;
  }
  return false;
}

const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const result = { what: "The four candidates on the chat data: wrong at the end (proxy), went back, and how late they turn", generated: new Date().toISOString(), proxy: ">= 50% RTL words should read RTL, <= 20% LTR, between not counted", sources: {} };

for (const [name, file] of Object.entries(SOURCES)) {
  const records = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));

  // 1 and 2: distinct mixed texts that open left-to-right
  const mixed = [];
  for (const item of buildQueue(records)) {
    const t = turns(item.text);
    if (t.firstLetterRtl !== false || t["any-rtl"] === null) continue;
    const w = HELPERS.strongWords(item.text);
    const share = w.filter((x) => x === "R").length / (w.length || 1);
    mixed.push({ text: item.text, t, should: share >= 0.5 ? "rtl" : share <= 0.2 ? "ltr" : null });
  }
  const judged = mixed.filter((m) => m.should);
  const wrong = {}, back = {};
  for (const [id] of CANDIDATES) {
    const w = judged.filter((m) => (m.t[id] !== null ? "rtl" : "ltr") !== m.should);
    wrong[id] = {
      total: w.length,
      rtlShownLtr: w.filter((m) => m.should === "rtl").length,
      ltrShownRtl: w.filter((m) => m.should === "ltr").length
    };
    back[id] = mixed.filter((m) => m.text.length <= 2000 && wentBack(m.text, id)).length;
  }

  // 3: every block of every answer
  const blocks = [];
  for (const a of records) for (const u of a.units) {
    if (u.text == null) continue;
    const t = turns(u.text);
    if (t.letters) blocks.push(t);
  }
  const late = {};
  for (const [id] of CANDIDATES) {
    const at = blocks.filter((b) => b.firstLetterRtl === false && b[id] !== null).map((b) => b[id]).sort((x, y) => x - y);
    late[id] = {
      blocksTurned: at.length, ofBlocks: blocks.length,
      turnLetter: { median: q(at, 0.5), p90: q(at, 0.9), p99: q(at, 0.99), max: at.length ? at[at.length - 1] : null },
      turnedAfterLetter45: at.filter((x) => x > 45).length,
      turnedAfterLetter100: at.filter((x) => x > 100).length
    };
  }

  result.sources[name] = {
    mixedOpeningLtr: mixed.length, judged: judged.length,
    shouldRtl: judged.filter((m) => m.should === "rtl").length, shouldLtr: judged.filter((m) => m.should === "ltr").length,
    wrong, wentBack: back, turns: late
  };
  console.log("source " + name + ": " + mixed.length + " mixed texts opening left-to-right, " + judged.length + " judged by the proxy");
  for (const [id, label] of CANDIDATES) {
    const w = wrong[id], l = late[id];
    console.log("  " + label.padEnd(31) + " wrong " + String(w.total).padStart(5) + " (" + (100 * w.total / judged.length).toFixed(1) + "%; Urdu shown LTR " + w.rtlShownLtr + ", English shown RTL " + w.ltrShownRtl + ")"
      + "  went back " + back[id]
      + "  turned " + l.blocksTurned + " blocks, letter median " + l.turnLetter.median + " p90 " + l.turnLetter.p90 + " p99 " + l.turnLetter.p99 + " max " + l.turnLetter.max + ", after 45: " + l.turnedAfterLetter45 + ", after 100: " + l.turnedAfterLetter100);
  }
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log("wrote " + OUT);
