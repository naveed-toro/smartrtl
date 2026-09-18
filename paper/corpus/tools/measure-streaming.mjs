// Outline section 5: what each rule does while a text is still arriving.
//
// Every distinct mixed text in the snapshot is replayed as a stream of its Markdown source -
// once a character at a time (the worst case) and once a word at a time - and each rule is asked for a direction
// after every arrival. Counted per rule:
//
//   changed   texts whose answer changed at least once after the first strong character
//   reversed  texts whose answer went back to one it had already given - the property
//             decisions.md 42 depends on is that this never happens
//   changes   all changes, summed
//   shownOtherWay  for texts that changed, the average share of arrivals at which the answer
//             differed from the final one - how long a reader saw the other direction
//
// No labels are needed: this is about stability, not correctness. Only counts are written,
// never text, so the result can be published.
//
//   node measure-streaming.mjs  ->  paper/results/streaming.json

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { RULES, PROVENANCE, FORMULAS } from "./rules.mjs";
import { bidiClass } from "./bidi.mjs";
import { createRequire } from "node:module";
const smartrtlCore = createRequire(import.meta.url)("../../../packages/core/src/direction.js");
import { buildQueue, SEED } from "./label/queue.mjs";
import { strongCounts } from "./bidi.mjs";
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
const OUT = path.join(HERE, "..", "..", "results", `streaming${suffix}.json`);
// Source B is ten times larger; by character would take hours and the two replays have agreed
// to one decimal place on source A, so B is replayed by word unless --by-character is given.
const MODES = SOURCE === "A" || process.argv.includes("--by-character") ? ["character", "word"] : ["word"];

const bytes = fs.readFileSync(SNAPSHOT);
const records = bytes.toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
const texts = buildQueue(records).map((q) => ({ source: q.source, kind: q.kind, firstStrong: q.firstStrong, language: languageOf(q) }));

// A unit arrives as Markdown, the way a model streams it: every prefix of its source is
// parsed again, so inline code only becomes code once its closing backtick has arrived -
// exactly what a reader's screen shows at that moment.
function view(source) {
  const u = toUnits(source).find((x) => x.text != null);
  return u ? { text: u.text, prose: u.prose } : { text: "", prose: "" };
}

function prefixes(text, by) {
  const cps = [...text];
  if (by === "character") return cps.map((_, i) => cps.slice(0, i + 1).join(""));
  const out = [];
  const re = /\S+\s*/g;
  let m;
  while ((m = re.exec(text))) out.push(text.slice(0, m.index + m[0].length));
  return out;
}

function views(source, by) { return prefixes(source, by).map(view); }

// Part 2: with the stream held until the formula can no longer change its mind, how many
// arrivals (words, when replayed by word) does a reader wait before the block appears? A
// formula with no settle point waits for the whole block.
function heldFor(rule, seen) {
  const f = FORMULAS.find((x) => x.id === rule);
  const withStrong = seen.filter((v) => { const c = strongCounts(v.text); return c.ltr + c.rtl > 0; });
  if (typeof f.settled !== "function") return { held: withStrong.length, never: true };
  const i = withStrong.findIndex((v) => f.settled(v.text, { bidiClass, prose: v.prose, smartrtl: smartrtlCore }));
  return { held: i < 0 ? withStrong.length : i, never: i < 0 };
}

function replay(rule, seen) {
  const answers = [];
  for (const v of seen) {
    const { ltr, rtl } = strongCounts(v.text);
    if (ltr + rtl === 0) continue; // nothing to decide from yet
    answers.push(RULES[rule](v.text, v.prose).dir);
  }
  let changes = 0, reversed = false;
  const given = new Set([answers[0]]);
  for (let i = 1; i < answers.length; i++) {
    if (answers[i] === answers[i - 1]) continue;
    changes++;
    if (given.has(answers[i])) reversed = true;
    given.add(answers[i]);
  }
  const final = answers[answers.length - 1];
  const other = answers.filter((a) => a !== final).length / answers.length;
  return { changes, reversed, final, other };
}

const result = {
  what: "Direction rules replayed over streamed text (outline section 5)",
  generated: new Date().toISOString(),
  corpus: { source: SOURCES[SOURCE].label, texts: texts.length, seed: SEED,
    snapshotSha256: crypto.createHash("sha256").update(bytes).digest("hex") },
  provenance: PROVENANCE,
  by: {}
};

for (const t of texts) t.views = Object.fromEntries(MODES.map((m) => [m, views(t.source, m)]));

for (const by of MODES) {
  result.by[by] = {};
  for (const rule of Object.keys(RULES)) {
    let changed = 0, reversed = 0, changes = 0, otherSum = 0, finalRtl = 0;
    const holds = []; let unsettled = 0;
    const byStart = { L: { texts: 0, changed: 0, reversed: 0 }, R: { texts: 0, changed: 0, reversed: 0 } };
    const byLanguage = {};
    for (const t of texts) {
      const r = replay(rule, t.views[by]);
      const h = heldFor(rule, t.views[by]);
      holds.push(h.held); if (h.never) unsettled++;
      const start = t.firstStrong === "L" ? "L" : "R";
      byStart[start].texts++;
      if (r.final === "rtl") finalRtl++;
      if (r.changes > 0) { changed++; otherSum += r.other; byStart[start].changed++; }
      const L = (byLanguage[t.language] = byLanguage[t.language] || { texts: 0, changed: 0, reversed: 0 });
      L.texts++; if (r.changes > 0) L.changed++; if (r.reversed) L.reversed++;
      if (r.reversed) { reversed++; byStart[start].reversed++; }
      changes += r.changes;
    }
    holds.sort((a, b) => a - b);
    const hq = (p) => holds[Math.min(holds.length - 1, Math.floor(p * holds.length))];
    const hold = { meanArrivals: +(holds.reduce((a, b) => a + b, 0) / holds.length).toFixed(2), zeroPct: +(100 * holds.filter((x) => x === 0).length / holds.length).toFixed(1),
      median: hq(0.5), p90: hq(0.9), p95: hq(0.95), p99: hq(0.99), waitsForWholeBlock: unsettled };
    result.by[by][rule] = { changed, reversed, changes, finalRtl, hold,
      shownOtherWay: changed ? +(otherSum / changed).toFixed(4) : 0, byFirstStrong: byStart, byLanguage };
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");

const pct = (n) => (100 * n / texts.length).toFixed(1) + "%";
for (const by of Object.keys(result.by)) {
  console.log(`\nby ${by} (${texts.length} texts)`);
  console.log("rule".padEnd(22), "final rtl".padStart(14), "changed".padStart(14), "reversed".padStart(14), "shown other way".padStart(16), "| held: none / mean / p95 / whole block");
  for (const [rule, r] of Object.entries(result.by[by])) {
    console.log(rule.padEnd(22), `${r.finalRtl} ${pct(r.finalRtl)}`.padStart(14), `${r.changed} ${pct(r.changed)}`.padStart(14),
      `${r.reversed} ${pct(r.reversed)}`.padStart(14), (100 * r.shownOtherWay).toFixed(1).padStart(15) + "%",
      `| ${r.hold.zeroPct}% / ${r.hold.meanArrivals} / ${r.hold.p95} / ${r.hold.waitsForWholeBlock}`);
  }
}
