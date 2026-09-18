// Words or letters? Words differ in length, and earlier formulas (fantasai's 63) count letters.
//
// For texts that start left-to-right and hold a right-to-left word:
//   1. how many letters the first 6 words come to (letters = Unicode \p{L});
//   2. the same late/early trade-off as measure-window.mjs, but with a window of L letters:
//      right-to-left if a right-to-left letter arrives within the first L letters.
// Same proxy as measure-window.mjs (>=50% right-to-left words, <=20%) until labels exist.
//
//   node measure-letters.mjs --source A|B  ->  paper/results/letters[-B].json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQueue } from "./label/queue.mjs";
import { HELPERS } from "./rules.mjs";
import { bidiClass } from "./bidi.mjs";
import { toUnits } from "./units.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = (process.argv.find((a, i, all) => all[i - 1] === "--source") || "A").toUpperCase();
const FILE = { A: path.join(HERE, "..", "private", "transcripts.units.jsonl"), B: path.join(HERE, "..", "public", "wildchat.units.jsonl") }[SOURCE];
const OUT = path.join(HERE, "..", "..", "results", `letters${SOURCE === "A" ? "" : "-" + SOURCE}.json`);
const isLetter = (ch) => /\p{L}/u.test(ch);
const isRtl = (ch) => { const c = bidiClass(ch.codePointAt(0)); return c === "R" || c === "AL"; };

const records = fs.readFileSync(FILE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const texts = [];
for (const q of buildQueue(records)) {
  if (q.firstStrong !== "L") continue;
  const text = (toUnits(q.source).find((x) => x.text != null) || { text: q.text }).text;
  const w = HELPERS.strongWords(text);
  if (w.indexOf("R") < 0) continue;
  const share = w.filter((x) => x === "R").length / w.length;
  // letters in the first 6 words that hold a strong letter
  let words = 0, lettersIn6 = 0;
  for (const word of text.split(/\s+/)) {
    const letters = [...word].filter(isLetter).length;
    if (!letters) continue;
    if (words++ >= 6) break;
    lettersIn6 += letters;
  }
  let letter = 0, firstRtlLetter = null;
  for (const ch of text) {
    if (!isLetter(ch)) continue;
    letter++;
    if (isRtl(ch)) { firstRtlLetter = letter; break; }
  }
  texts.push({ share, lettersIn6: words >= 6 ? lettersIn6 : null, firstRtlLetter, firstRtlWord: w.indexOf("R") + 1 });
}

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const six = texts.map((t) => t.lettersIn6).filter((x) => x !== null);
const sixStats = { texts: six.length, mean: +(six.reduce((a, b) => a + b, 0) / six.length).toFixed(1), p10: q(six, 0.1), median: q(six, 0.5), p90: q(six, 0.9) };

const rtl = texts.filter((t) => t.share >= 0.5), ltr = texts.filter((t) => t.share <= 0.2);
const byLetters = [10, 15, 20, 25, 30, 35, 40, 50, 63, 80].map((L) => {
  const late = rtl.filter((t) => t.firstRtlLetter > L).length;
  const early = ltr.filter((t) => t.firstRtlLetter <= L).length;
  return { L, late, latePct: +(100 * late / rtl.length).toFixed(1), early, earlyPct: +(100 * early / (ltr.length || 1)).toFixed(1), mistakes: late + early };
});
const byWords = [3, 4, 5, 6, 7, 8].map((N) => {
  const late = rtl.filter((t) => t.firstRtlWord > N).length;
  const early = ltr.filter((t) => t.firstRtlWord <= N).length;
  return { N, late, latePct: +(100 * late / rtl.length).toFixed(1), early, earlyPct: +(100 * early / (ltr.length || 1)).toFixed(1), mistakes: late + early };
});

const result = { source: SOURCE, texts: texts.length, proxyRtl: rtl.length, proxyLtr: ltr.length, lettersInFirst6Words: sixStats, byLetters, byWords };
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`source ${SOURCE}: ${texts.length} texts; proxy ${rtl.length} mostly RTL, ${ltr.length} mostly LTR`);
console.log(`letters in the first 6 words: mean ${sixStats.mean}, median ${sixStats.median}, 10% of texts ${sixStats.p10} or fewer, 90% ${sixStats.p90} or fewer (${sixStats.texts} texts with 6+ words)`);
console.log("letters  late (RTL stays LTR)   early (LTR turns RTL)  mistakes");
for (const r of byLetters) console.log(String(r.L).padStart(7), `${r.late} ${r.latePct}%`.padStart(22), `${r.early} ${r.earlyPct}%`.padStart(22), String(r.mistakes).padStart(9));
console.log("  words  late (RTL stays LTR)   early (LTR turns RTL)  mistakes");
for (const r of byWords) console.log(String(r.N).padStart(7), `${r.late} ${r.latePct}%`.padStart(22), `${r.early} ${r.earlyPct}%`.padStart(22), String(r.mistakes).padStart(9));
