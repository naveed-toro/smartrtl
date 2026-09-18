// Applies the rule written in paper/results/README.md ("Choosing between the four", written
// 2026-09-17, before the first label) to the labels on the texts the four candidates disagree on.
//
//   node score-four.mjs [--by owner]  ->  paper/results/four-labels.json
//
// A label says which drawing of a text reads correctly: rtl, ltr, either (both - no mistake for
// anyone), neither (both wrong - a mistake for everyone alike) or unclear (left out).
// Windows from 45 letters up, and no window at all, are compared: every text on which any two of
// them differ is in the labelled set, so their counts are exact. Windows shorter than 45 were
// already behind on the proxy (x.json) and would need labels on thousands more texts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { disagreements, byWindow, candidates } from "./four.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const by = process.argv.includes("--by") ? process.argv[process.argv.indexOf("--by") + 1] : "owner";
const LABELS = path.join(HERE, "..", "private", "labels", "four", by + ".jsonl");
const OUT = path.join(HERE, "..", "..", "results", "four-labels.json");
const TIE = 3; // the rule: within this many mistakes of the fewest, the shorter window

if (!fs.existsSync(LABELS)) { console.log("no labels yet: " + LABELS); process.exit(1); }
const labels = new Map();
for (const line of fs.readFileSync(LABELS, "utf8").split("\n")) if (line.trim()) { const r = JSON.parse(line); labels.set(r.textId, r.label); }

const queue = disagreements();
const judged = queue.filter((q) => labels.has(q.textId) && labels.get(q.textId) !== "unclear");
const wrong = (label, dir) => label === "neither" || ((label === "rtl" || label === "ltr") && label !== dir);

const windows = [];
for (let X = 45; X <= 120; X++) windows.push(X);
windows.push(Infinity);
const byX = windows.map((X) => {
  const m = judged.filter((q) => wrong(labels.get(q.textId), byWindow(q.text, X)));
  return { X: X === Infinity ? "none (Any RTL)" : X, mistakes: m.length, A: m.filter((q) => q.sourceName === "A").length, B: m.filter((q) => q.sourceName === "B").length };
});
const four = {};
for (const id of ["any-rtl", "first-formula", "firefox-63", "firefox-45"]) {
  four[id] = judged.filter((q) => wrong(labels.get(q.textId), candidates(q.text)[id])).length;
}

const fewest = Math.min(...byX.map((r) => r.mistakes));
const chosen = byX.find((r) => r.mistakes <= fewest + TIE);
const result = {
  rule: "X is the window with the fewest mistakes on the labelled texts, both sources together; a window within " + TIE + " mistakes of the fewest is chosen if it is shorter.",
  by, labelled: labels.size, of: queue.length, judged: judged.length, complete: labels.size === queue.length,
  fewestMistakes: fewest, chosen: chosen.X, four, windows: byX, generated: new Date().toISOString()
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(by + ": " + labels.size + " of " + queue.length + " labelled, " + judged.length + " judged" + (result.complete ? "" : " - NOT COMPLETE, the rule is applied only when every text is labelled"));
console.log("the four:", four);
console.log("fewest mistakes " + fewest + "; by the rule, X = " + chosen.X);
