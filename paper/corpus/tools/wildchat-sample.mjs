// Source B, step 2: a sample of WildChat-4.8M's right-to-left conversations, turned into units.
//
// The sample is a cluster sample of the dataset's row groups (1,000 conversations each),
// taken in an order fixed by SEED: a row group is included while it holds a conversation in
// a language whose target is not yet met. Whole row groups, because a row group is the
// smallest piece that can be downloaded - so every conversation of a taken row group is
// kept, and the sample is exactly reproducible.
//
// Only assistant turns are used; conversations WildChat flags as toxic are left out.
//
//   node wildchat-sample.mjs  ->  corpus/public/wildchat.units.jsonl (+ counts on stdout)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { fileUrl, DATASET, REVISION } from "./wildchat-index.mjs";
import { toUnits } from "./units.mjs";
import { UNICODE_VERSION } from "./bidi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "..", "public", "wildchat-index.json");
const OUT = path.join(HERE, "..", "public", "wildchat.units.jsonl");
const PARTS = path.join(HERE, "..", "public", "wildchat-parts");

export const SEED = "smartrtl corpus, source B, WildChat-4.8M, 2026-09-17";
// Hebrew and Urdu are scarce and decide how many row groups are needed; these targets take
// 521 of the 3,131 row groups that hold right-to-left conversations (--plan prints it).
export const TARGETS = { Arabic: 3000, Persian: 3000, Hebrew: 500, Urdu: 250 };

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const rank = (s) => crypto.createHash("sha256").update(`${SEED}:${s}`).digest("hex");

const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
if (index.revision !== REVISION) throw new Error("index is from another revision");
const G = index.rowGroupRows;

// Row groups holding right-to-left conversations, in seeded order.
const groups = new Map();
for (const c of index.conversations) {
  if (c.toxic) continue;
  const key = `${c.file}:${Math.floor(c.row / G)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(c);
}
const order = [...groups.keys()].sort((a, b) => (rank(a) < rank(b) ? -1 : 1));

const got = Object.fromEntries(Object.keys(TARGETS).map((l) => [l, 0]));
const taken = [];
for (const key of order) {
  const convs = groups.get(key);
  const needed = convs.some((c) => TARGETS[c.language] && got[c.language] < TARGETS[c.language]);
  if (!needed) continue;
  taken.push(key);
  for (const c of convs) if (got[c.language] !== undefined) got[c.language]++;
  if (Object.keys(TARGETS).every((l) => got[l] >= TARGETS[l])) break;
}
console.error(`taking ${taken.length} of ${order.length} row groups: ${JSON.stringify(got)}`);

if (process.argv.includes("--plan")) process.exit(0);

const byFile = new Map();
for (const key of taken) {
  const [file, g] = key.split(":").map(Number);
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(g);
}

fs.mkdirSync(PARTS, { recursive: true });
const n = { rowGroups: taken.length, conversations: 0, answers: 0, repeated: 0, units: 0, mixed: 0, byLanguage: {} };
const files = [...byFile.keys()].sort((a, b) => a - b);
let done = 0;

async function readFile(file) {
  for (let attempt = 1; ; attempt++) {
    try {
      const f = await asyncBufferFromUrl({ url: fileUrl(file) });
      const metadata = await parquetMetadataAsync(f);
      const results = [];
      for (const g of byFile.get(file).sort((a, b) => a - b)) {
        const rows = await parquetReadObjects({ file: f, metadata, columns: ["conversation_hash", "model", "language", "toxic", "timestamp", "conversation"], rowStart: g * G, rowEnd: (g + 1) * G });
        results.push(...rows);
      }
      return results;
    } catch (e) {
      if (attempt >= 8) throw e;
      const wait = /429/.test(String(e && e.message)) ? 60000 * attempt : 5000 * attempt;
      process.stderr.write(`file ${file}: ${e.message} - waiting ${wait / 1000}s\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

let nextFile = 0;
async function worker() {
  while (nextFile < files.length) {
    const file = files[nextFile++];
    const part = path.join(PARTS, `${file}.jsonl`);
    if (!fs.existsSync(part)) {
      const rows = await readFile(file);
      const lines = [];
      for (const r of rows) {
        if (r.toxic || !["Arabic", "Persian", "Urdu", "Hebrew"].includes(r.language)) continue;
        (r.conversation || []).forEach((turn, i) => {
          if (turn.role !== "assistant" || !turn.content || !turn.content.trim()) return;
          lines.push(JSON.stringify({
            source: "wildchat-4.8m", dataset: DATASET, revision: REVISION, unicode: UNICODE_VERSION,
            answerId: hash(`${r.conversation_hash}/${i}`), conversation: r.conversation_hash, project: `wildchat:${r.language}`,
            language: r.language, model: r.model, timestamp: r.timestamp, markdown: turn.content
          }));
        });
      }
      fs.writeFileSync(part + ".tmp", lines.join("\n") + (lines.length ? "\n" : ""));
      fs.renameSync(part + ".tmp", part);
    }
    process.stderr.write(`file ${file} done (${++done}/${files.length})\n`);
  }
}
await Promise.all(Array.from({ length: 2 }, worker));

// All parts in file order -> units. Each distinct answer once.
const out = fs.openSync(OUT, "w");
const seen = new Set();
for (const file of files) {
  for (const line of fs.readFileSync(path.join(PARTS, `${file}.jsonl`), "utf8").split("\n")) {
    if (!line) continue;
    const rec = JSON.parse(line);
    const textId = hash(rec.markdown);
    if (seen.has(textId)) { n.repeated++; continue; }
    seen.add(textId);
    const units = toUnits(rec.markdown).map((u) => (u.text == null ? u : { ...u, textId: hash(u.text) }));
    const mixed = units.filter((u) => u.ltr > 0 && u.rtl > 0).length;
    const lang = (n.byLanguage[rec.language] = n.byLanguage[rec.language] || { answers: 0, units: 0, mixed: 0 });
    n.answers++; lang.answers++; n.units += units.length; lang.units += units.length; n.mixed += mixed; lang.mixed += mixed;
    fs.writeSync(out, JSON.stringify({ ...rec, units }) + "\n");
  }
}
fs.closeSync(out);
console.log(JSON.stringify(n, null, 2));
