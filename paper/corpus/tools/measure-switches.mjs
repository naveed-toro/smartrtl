// How often does a line change direction more than once?
//
// A line that opens in English and turns Urdu can still be read: the reader starts on the wrong
// side and carries on. A line that opens in English, turns Urdu, and turns back - and again -
// is the case the owner describes as unreadable: the eye has no side to start from. Every
// formula in this paper gives such a line ONE direction, so the runs inside it are laid out by
// the browser's own algorithm around that direction; the more switches, the more a wrong choice
// costs.
//
// A switch is counted by units.mjs when the text moves from a left-to-right letter run to a
// right-to-left one or back.
//
//   node measure-switches.mjs  ->  paper/results/switches.json

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "..", "results", "switches.json");
const SOURCES = {
  A: path.join(HERE, "..", "private", "transcripts.units.jsonl"),
  B: path.join(HERE, "..", "public", "wildchat.units.jsonl")
};

const result = { what: "How many times a mixed line changes direction, and what that means for a reader", generated: new Date().toISOString(), sources: {} };

for (const [name, file] of Object.entries(SOURCES)) {
  if (!fs.existsSync(file)) continue;
  const counts = {}, s = { mixedLines: 0, opensLtr: 0, opensLtrTwoOrMore: 0, opensRtl: 0, opensRtlTwoOrMore: 0 };
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  for await (const line of rl) {
    const a = JSON.parse(line);
    for (const u of a.units) {
      if (u.text == null || !(u.ltr > 0 && u.rtl > 0)) continue;
      s.mixedLines++;
      const n = u.switches || 0;
      counts[n] = (counts[n] || 0) + 1;
      if (u.firstStrong === "L") { s.opensLtr++; if (n >= 2) s.opensLtrTwoOrMore++; }
      else { s.opensRtl++; if (n >= 2) s.opensRtlTwoOrMore++; }
    }
  }
  const twoOrMore = Object.entries(counts).reduce((a, [k, v]) => a + (Number(k) >= 2 ? v : 0), 0);
  result.sources[name] = { ...s, twoOrMoreSwitches: twoOrMore, bySwitches: counts };
  const pct = (x, n) => (n ? (100 * x / n).toFixed(1) + "%" : "-");
  console.log(`${name}: ${s.mixedLines} mixed lines, ${pct(twoOrMore, s.mixedLines)} change direction two or more times`);
  console.log(`   opening left-to-right: ${s.opensLtr} (${pct(s.opensLtr, s.mixedLines)}), of them ${pct(s.opensLtrTwoOrMore, s.opensLtr)} change twice or more`);
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log("wrote " + OUT);
