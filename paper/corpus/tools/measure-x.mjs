// The final formula:
//   first letter right-to-left -> right-to-left
//   first letter left-to-right -> right-to-left if a right-to-left letter arrives within the
//                                 first X letters, otherwise left-to-right
// This measures, for every X from 5 to 100, on both sources, the two things X is chosen by:
//
//   mistakes (mixed texts starting left-to-right; proxy until labels, as in measure-window.mjs)
//     late  - mostly right-to-left text (>= 50% RTL words) whose first RTL letter is after X
//     early - mostly left-to-right text (<= 20% RTL words) with an RTL letter within X
//   waiting (Part 2, every block of every answer, not only mixed ones)
//     a block that starts left-to-right is hidden until an RTL letter arrives, X letters
//     have passed, or the block ends - the letters a reader waits for, averaged over all blocks
//
// "Letter" is Unicode \p{L}, counted from the start of the block's visible text.
//
//   node measure-x.mjs  ->  paper/results/x.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQueue } from "./label/queue.mjs";
import { HELPERS } from "./rules.mjs";
import { bidiClass } from "./bidi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "..", "results", "x.json");
const SOURCES = { A: path.join(HERE, "..", "private", "transcripts.units.jsonl"), B: path.join(HERE, "..", "public", "wildchat.units.jsonl") };
const XS = Array.from({ length: 96 }, (_, i) => i + 5);
const isLetter = (ch) => /\p{L}/u.test(ch);
const isRtl = (ch) => { const c = bidiClass(ch.codePointAt(0)); return c === "R" || c === "AL"; };

function letterProfile(text) {
  let letters = 0, firstRtl = null, firstLetterRtl = null;
  for (const ch of text) {
    if (!isLetter(ch)) continue;
    letters++;
    const r = isRtl(ch);
    if (firstLetterRtl === null) firstLetterRtl = r;
    if (r && firstRtl === null) firstRtl = letters;
  }
  return { letters, firstRtl, firstLetterRtl };
}

const result = { what: "Choosing X: mistakes and waiting for every window of X letters", generated: new Date().toISOString(), sources: {} };

for (const [name, file] of Object.entries(SOURCES)) {
  const records = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));

  // mistakes: distinct mixed texts whose first letter is left-to-right
  const rtl = [], ltr = [];
  for (const q of buildQueue(records)) {
    const p = letterProfile(q.text);
    if (p.firstLetterRtl !== false || p.firstRtl === null) continue;
    const w = HELPERS.strongWords(q.text);
    const share = w.filter((x) => x === "R").length / (w.length || 1);
    if (share >= 0.5) rtl.push(p.firstRtl); else if (share <= 0.2) ltr.push(p.firstRtl);
  }

  // waiting: every block of every answer
  const blocks = [];
  for (const a of records) for (const u of a.units) {
    if (u.text == null) continue;
    const p = letterProfile(u.text);
    if (!p.letters) continue;
    blocks.push(p);
  }

  const rows = XS.map((X) => {
    const late = rtl.filter((f) => f > X).length;
    const early = ltr.filter((f) => f <= X).length;
    let waited = 0, waitedAll = 0;
    for (const b of blocks) {
      if (b.firstLetterRtl) continue; // shown at once
      const w = Math.min(X, b.firstRtl === null ? b.letters : b.firstRtl - 1, b.letters);
      waited += w;
      if (w > 0) waitedAll++;
    }
    return { X, late, early, mistakes: late + early, meanLettersWaited: +(waited / blocks.length).toFixed(2), blocksWaiting: waitedAll };
  });
  const min = Math.min(...rows.map((r) => r.mistakes));
  result.sources[name] = { mostlyRtl: rtl.length, mostlyLtr: ltr.length, blocks: blocks.length, minMistakes: min, rows };
  console.log(`source ${name}: ${rtl.length} mostly RTL, ${ltr.length} mostly LTR (mixed, starting LTR); ${blocks.length} blocks; fewest mistakes ${min}`);
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
const pick = [10, 15, 20, 25, 30, 32, 34, 35, 36, 38, 40, 42, 45, 50, 55, 60, 63, 70, 80, 100];
console.log("\n  X |  A late  early  total  wait |  B late  early  total  wait");
for (const X of pick) {
  const a = result.sources.A.rows.find((r) => r.X === X), b = result.sources.B.rows.find((r) => r.X === X);
  console.log(String(X).padStart(3), "|", String(a.late).padStart(6), String(a.early).padStart(6), String(a.mistakes).padStart(6), String(a.meanLettersWaited).padStart(5),
    "|", String(b.late).padStart(6), String(b.early).padStart(6), String(b.mistakes).padStart(6), String(b.meanLettersWaited).padStart(5));
}
