// Builds the lab page: one self-contained HTML file, published as a link.
//
//   node build.mjs   ->  paper/demo/lab.html
//
// The page runs every rule from the same sources the corpus tools use, inlined, so the page
// and the measurements can never disagree about what a rule is:
//   - Unicode 18.0.0 bidi classes, as ranges, from corpus/tools/bidi.mjs's pinned data file
//   - Google Closure's bidi.js at its pinned commit, run unmodified
//   - SmartRTL's frozen rule, packages/core/src/direction.js, unmodified
//   - every formula from paper/rules/rules.js - the file the measurements run

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { bidiClass, UNICODE_VERSION } from "../corpus/tools/bidi.mjs";
import { PROVENANCE } from "../corpus/tools/rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// Only the classes a direction rule reads: strong L / R / AL, isolates (P2 skips them), and
// paragraph separators. Everything else is "other".
const KEEP = new Set(["L", "R", "AL", "LRI", "RLI", "FSI", "PDI", "B"]);
const ranges = [];
let start = 0, current = null;
for (let cp = 0; cp <= 0x110000; cp++) {
  const c = cp < 0x110000 ? bidiClass(cp) : null;
  const k = KEEP.has(c) ? c : null;
  if (k !== current) {
    if (current) ranges.push([start, cp - 1, current]);
    start = cp; current = k;
  }
}

const closureFile = path.join(ROOT, "paper", "corpus", "tools", ".cache", `closure-bidi-${PROVENANCE.closure.commit.slice(0, 7)}.js`);
const closure = fs.readFileSync(closureFile);
if (sha(closure) !== PROVENANCE.closure.sha256) throw new Error("Closure bidi.js does not match its pinned hash");
const smartrtlFile = path.join(ROOT, "packages", "core", "src", "direction.js");
const smartrtl = fs.readFileSync(smartrtlFile);
const rulesFile = path.join(ROOT, "paper", "rules", "rules.js");
const rules = fs.readFileSync(rulesFile);

const provenance = {
  unicode: UNICODE_VERSION,
  closure: PROVENANCE.closure,
  smartrtl: { file: "packages/core/src/direction.js", sha256: sha(smartrtl) },
  rules: { file: "paper/rules/rules.js", sha256: sha(rules) },
  built: new Date().toISOString()
};

// A closing script tag inside inlined code would end the script element early.
const inline = (s) => s.toString("utf8").replace(/<\/script/gi, "<\\/script");

let page = fs.readFileSync(path.join(HERE, "lab.src.html"), "utf8");
const fill = (marker, value) => {
  if (!page.includes(marker)) throw new Error(`template has no ${marker}`);
  page = page.split(marker).join(value);
};
fill("/*@BIDI_RANGES@*/", JSON.stringify(ranges));
fill("/*@PROVENANCE@*/", JSON.stringify(provenance));
fill("/*@CLOSURE_BIDI@*/", inline(closure));
fill("/*@SMARTRTL@*/", inline(smartrtl));
fill("/*@RULES@*/", inline(rules));

// Each recorded chat: the answer's pieces and the time between them, from the frames
// survey/results/rhythms.json names as the answer.
const RESULTS = path.join(ROOT, "paper", "survey", "results");
const picks = JSON.parse(fs.readFileSync(path.join(RESULTS, "rhythms.json"), "utf8")).chats;
const rhythms = {};
for (const [id, p] of Object.entries(picks)) {
  const rec = JSON.parse(fs.readFileSync(path.join(RESULTS, p.recording), "utf8"));
  const frames = p.answerFrames.map((i) => rec.frames[i]);
  if (frames.some((f) => !f)) throw new Error(id + ": answerFrames points past the recording");
  rhythms[id] = {
    recorded: p.recorded, recording: "paper/survey/results/" + p.recording,
    pieces: frames.map((f) => f.chars),
    gapsMs: frames.slice(1).map((f, i) => f.ms - frames[i].ms)
  };
}
fill("/*@RHYTHMS@*/", JSON.stringify(rhythms));

// The machine: every WildChat answer that holds a mixed line (letters of both directions) - the
// only answers on which the formulas can disagree - cut into files under 16 MB, in the sample's
// own order. Only public data: source A (private Claude conversations) never goes on the page.
const UNITS = path.join(ROOT, "paper", "corpus", "public", "wildchat.units.jsonl");
const DATA = path.join(HERE, "data");
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
const PART_BYTES = 10 * 1024 * 1024;
const parts = [];
let part = [], partBytes = 0, total = 0, meta = null;
const flush = () => {
  if (!part.length) return;
  const file = "data/wildchat-" + (parts.length + 1) + ".json";
  fs.writeFileSync(path.join(HERE, file), JSON.stringify(part));
  parts.push({ file, count: part.length, from: total - part.length });
  part = []; partBytes = 0;
};
for (const line of fs.readFileSync(UNITS, "utf8").split("\n")) {
  if (!line) continue;
  const a = JSON.parse(line);
  if (!a.units.some((u) => u.text != null && u.ltr > 0 && u.rtl > 0)) continue;
  meta = meta || { dataset: a.dataset, revision: a.revision };
  const row = [a.answerId, a.language, a.model, a.markdown];
  const bytes = Buffer.byteLength(JSON.stringify(row));
  if (partBytes + bytes > PART_BYTES) flush();
  part.push(row); partBytes += bytes; total++;
}
flush();
const machine = { dataset: meta.dataset, revision: meta.revision, total, parts };
fill("/*@MACHINE@*/", JSON.stringify(machine));
console.log("machine: " + total + " answers in " + parts.length + " files");

// Machine 2: every line the four candidates disagree on (corpus/tools/four.mjs), with the label it
// was read as. Only source B goes on the page; source A is private, and appears as counts only.
const { disagreements, candidates } = await import("../corpus/tools/four.mjs");
const LABELLER = "claude";
const labelFile = path.join(ROOT, "paper", "corpus", "private", "labels", "four", LABELLER + ".jsonl");
const labelOf = new Map(fs.readFileSync(labelFile, "utf8").trim().split("\n").map((l) => { const r = JSON.parse(l); return [r.textId, r.label]; }));
const disputedAll = disagreements();
const missing = disputedAll.filter((q) => !labelOf.has(q.textId)).length;
if (missing) throw new Error(missing + " disputed lines have no label");
const disputedB = disputedAll.filter((q) => q.sourceName === "B");
const md = (q) => (q.kind === "list-item" || q.kind === "list-item-paragraph" ? "- " + q.source : q.source);
fs.writeFileSync(path.join(DATA, "disputed.json"), JSON.stringify(disputedB.map((q) => [q.textId, q.kind, md(q), labelOf.get(q.textId), q.text])));
const privateA = { lines: 0, judged: 0, any: 0, first: 0, f63: 0, f45: 0 };
for (const q of disputedAll.filter((x) => x.sourceName === "A")) {
  privateA.lines++;
  const l = labelOf.get(q.textId);
  if (l !== "rtl" && l !== "ltr") continue;
  const c = candidates(q.text);
  privateA.judged++;
  if (c["any-rtl"] !== l) privateA.any++;
  if (c["first-formula"] !== l) privateA.first++;
  if (c["firefox-63"] !== l) privateA.f63++;
  if (c["firefox-45"] !== l) privateA.f45++;
}
const disputed = {
  file: "data/disputed.json", total: disputedB.length,
  labeller: "by Claude (the assistant) for this first reading, to be checked by a person",
  privateNote: `On the ${privateA.lines} such lines from Claude's answers (private, not on this page), wrong: Any RTL ${privateA.any}, our first formula ${privateA.first}, Firefox 63 ${privateA.f63}, Firefox 45 ${privateA.f45}.`
};
fill("/*@DISPUTED@*/", JSON.stringify(disputed));
console.log("machine 2: " + disputedB.length + " lines; private A: " + JSON.stringify(privateA));

fs.writeFileSync(path.join(HERE, "lab.html"), page);
console.log(`lab.html: ${(page.length / 1024).toFixed(0)} KiB, ${ranges.length} bidi ranges`);
