// Choosing N for "starts left-to-right: right-to-left only if a right-to-left word arrives
// within the first N words" - before labels exist.
//
// Every N makes two kinds of mistake on texts that start left-to-right:
//   late   - a mostly right-to-left text whose first right-to-left word comes after word N
//            stays left-to-right (an Urdu or Arabic sentence opening with a long English name)
//   early  - a mostly left-to-right text with a right-to-left word within the first N words
//            turns right-to-left (an English sentence carrying an inserted phrase)
//
// Without labels, "mostly" is a PROXY: the share of right-to-left words in the whole text.
// A text with at least 50% right-to-left words is counted as right-to-left, one with at most
// 20% as left-to-right, and the ones between are left out as unclear. The proxy is not the
// truth - the labels are - so these figures only show where N should be looked for.
//
//   node measure-window.mjs --source A|B  ->  paper/results/window[-B].json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQueue } from "./label/queue.mjs";
import { HELPERS } from "./rules.mjs";
import { toUnits } from "./units.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = (process.argv.find((a, i, all) => all[i - 1] === "--source") || "A").toUpperCase();
const FILE = { A: path.join(HERE, "..", "private", "transcripts.units.jsonl"), B: path.join(HERE, "..", "public", "wildchat.units.jsonl") }[SOURCE];
const OUT = path.join(HERE, "..", "..", "results", `window${SOURCE === "A" ? "" : "-" + SOURCE}.json`);

const records = fs.readFileSync(FILE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const texts = [];
for (const q of buildQueue(records)) {
  if (q.firstStrong !== "L") continue;
  const u = toUnits(q.source).find((x) => x.text != null) || { text: q.text };
  const w = HELPERS.strongWords(u.text);
  const first = w.indexOf("R");
  if (first < 0) continue;
  const share = w.filter((x) => x === "R").length / w.length;
  texts.push({ first: first + 1, words: w.length, share, lang: q.project && q.project.startsWith("wildchat:") ? q.project.slice(9) : "Urdu" });
}

const rtl = texts.filter((t) => t.share >= 0.5);
const ltr = texts.filter((t) => t.share <= 0.2);
const rows = [];
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20]) {
  const late = rtl.filter((t) => t.first > n).length;
  const early = ltr.filter((t) => t.first <= n).length;
  rows.push({ n, late, latePct: +(100 * late / rtl.length).toFixed(1), early, earlyPct: +(100 * early / (ltr.length || 1)).toFixed(1), mistakes: late + early });
}
const result = { source: SOURCE, startsLtrWithRtlWord: texts.length, proxyRtl: rtl.length, proxyLtr: ltr.length, unclear: texts.length - rtl.length - ltr.length, rows };
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");

console.log(`source ${SOURCE}: ${texts.length} texts start left-to-right and hold a right-to-left word`);
console.log(`proxy: ${rtl.length} mostly right-to-left (>=50% words), ${ltr.length} mostly left-to-right (<=20%), ${result.unclear} between`);
console.log("N".padStart(3), "late (RTL text stays LTR)".padStart(28), "early (LTR text turns RTL)".padStart(28), "mistakes".padStart(9));
for (const r of rows) console.log(String(r.n).padStart(3), `${r.late} ${r.latePct}%`.padStart(28), `${r.early} ${r.earlyPct}%`.padStart(28), String(r.mistakes).padStart(9));
