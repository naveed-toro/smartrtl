// How long must a browser wait before a text's direction is known?
//
// A text that starts right-to-left shows its direction at its first word. A text that starts
// left-to-right does not: "React ایک لائبریری ہے" and "React is a library" open alike. For
// those, the evidence is the first right-to-left word - so this counts, over every distinct
// mixed text starting left-to-right, at which word the first right-to-left word arrives.
//
// Words are counted as a reader sees them: words holding a strong letter, in the text as
// rendered and, separately, in its prose (inline code left out). Counts only.
//
//   node measure-opening.mjs  ->  paper/results/opening.json

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildQueue, SEED } from "./label/queue.mjs";
import { HELPERS, PROVENANCE } from "./rules.mjs";
import { toUnits } from "./units.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --source A (default): the owner's Claude Code answers. --source B: the WildChat-4.8M sample.
const SOURCE = (process.argv.find((a, i, all) => all[i - 1] === "--source") || "A").toUpperCase();
const SOURCES = {
  A: { file: path.join(HERE, "..", "private", "transcripts.units.jsonl"), label: "A (owner's Claude Code answers, before 2026-09-17)" },
  B: { file: path.join(HERE, "..", "public", "wildchat.units.jsonl"), label: "B (WildChat-4.8M sample, OpenAI models)" }
};
if (!SOURCES[SOURCE]) throw new Error("--source must be A or B");
const SNAPSHOT = SOURCES[SOURCE].file;
const suffix = SOURCE === "A" ? "" : "-" + SOURCE;
// Source B's language: WildChat's label on the conversation ("wildchat:Arabic" -> "Arabic").
const languageOf = (q) => (q.project && q.project.startsWith("wildchat:") ? q.project.slice(9) : "Urdu");
const OUT = path.join(HERE, "..", "..", "results", `opening${suffix}.json`);

const bytes = fs.readFileSync(SNAPSHOT);
const records = bytes.toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
const queue = buildQueue(records);

function firstRtlWord(text) {
  const w = HELPERS.strongWords(text);
  const i = w.indexOf("R");
  return { at: i < 0 ? null : i + 1, words: w.length };
}

function distribution(values) {
  const hist = {};
  for (const v of values) hist[v] = (hist[v] || 0) + 1;
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const within = (n) => values.filter((v) => v <= n).length;
  return {
    texts: values.length,
    mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
    median: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: sorted[sorted.length - 1],
    within: Object.fromEntries([1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => [n, +(100 * within(n) / values.length).toFixed(1)])),
    histogram: hist
  };
}

const view = { text: [], prose: [] };
const byKind = {}, byLanguage = {};
let startsRtl = 0, startsLtr = 0;
for (const q of queue) {
  if (q.firstStrong !== "L") { startsRtl++; continue; }
  startsLtr++;
  const u = toUnits(q.source).find((x) => x.text != null) || { text: q.text, prose: q.text };
  const t = firstRtlWord(u.text), p = firstRtlWord(u.prose);
  if (t.at) { view.text.push(t.at); (byKind[q.kind] = byKind[q.kind] || []).push(t.at); (byLanguage[languageOf(q)] = byLanguage[languageOf(q)] || []).push(t.at); }
  if (p.at) view.prose.push(p.at);
}

const result = {
  what: "Word at which the first right-to-left word arrives, in mixed texts that start left-to-right",
  generated: new Date().toISOString(),
  corpus: { source: SOURCES[SOURCE].label, texts: queue.length, seed: SEED,
    snapshotSha256: crypto.createHash("sha256").update(bytes).digest("hex") },
  provenance: PROVENANCE,
  startsRtl, startsLtr,
  asRendered: distribution(view.text),
  prose: distribution(view.prose),
  byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, distribution(v)])),
  byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([k, v]) => [k, distribution(v)]))
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");

const show = (name, d) => console.log(`${name.padEnd(22)} n=${String(d.texts).padStart(5)}  mean ${d.mean}  median ${d.median}  p90 ${d.p90}  p95 ${d.p95}  max ${d.max}  | within 1:${d.within[1]}% 2:${d.within[2]}% 3:${d.within[3]}% 5:${d.within[5]}% 10:${d.within[10]}%`);
console.log(`${queue.length} texts: ${startsRtl} start right-to-left (known at word 1), ${startsLtr} start left-to-right`);
show("as rendered", result.asRendered);
show("prose (no inline code)", result.prose);
for (const [k, d] of Object.entries(result.byKind)) show(k, d);
for (const [k, d] of Object.entries(result.byLanguage)) show(k, d);
console.log("\nhistogram (as rendered):", JSON.stringify(result.asRendered.histogram));
