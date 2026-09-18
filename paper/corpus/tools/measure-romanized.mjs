// How do people write their own language to a chat - in its own script, or in Latin letters?
//
// The paper's introduction claims that a reader whose script is not supported is pushed into
// writing their language in `abc`. This measures it on real conversations, on the same sample
// the rest of the paper uses (source B, WildChat-4.8M), but on the USER's turns - the corpus
// itself keeps only the assistant's.
//
// For every user turn in a conversation WildChat labels Arabic, Persian, Urdu or Hebrew:
//   script    - it holds letters of a right-to-left script
//   latin     - it holds Latin letters and no right-to-left letter
//   neither   - digits, punctuation, emoji, code only
// A `latin` turn is not proof of romanization: the person may be writing English. So two
// numbers are reported, and the paper quotes both:
//   upper bound - every `latin` turn
//   lower bound - `latin` turns by a user who ALSO writes the script elsewhere in the same
//                 conversation; that person has both, and chose Latin letters for this turn
//
// Whole row groups are downloaded, as in wildchat-sample.mjs, and only counts are kept - no
// message text is written anywhere.
//
//   node measure-romanized.mjs [--groups 40]  ->  paper/results/romanized.json

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { fileUrl, DATASET, REVISION } from "./wildchat-index.mjs";
import { bidiClass, UNICODE_VERSION } from "./bidi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "..", "public", "wildchat-index.json");
const OUT = path.join(HERE, "..", "..", "results", "romanized.json");
const LANGS = ["Arabic", "Persian", "Urdu", "Hebrew"];
// The same seed string as the corpus sample (wildchat-sample.mjs), kept here as a literal
// because importing that file would start its download. The order below is its own, though:
// this measurement draws its own row groups from the same dataset and revision.
const SEED = "smartrtl corpus, source B, WildChat-4.8M, 2026-09-17";
const WANT = Number((process.argv.find((a, i) => process.argv[i - 1] === "--groups") || 40));

const rank = (s) => crypto.createHash("sha256").update(`${SEED}:romanized:${s}`).digest("hex");
const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
if (index.revision !== REVISION) throw new Error("index is from another revision");
const G = index.rowGroupRows;

// The row groups that hold a conversation in one of these languages, in an order fixed by the
// seed; the first WANT of them are this measurement's sample.
const groups = new Map();
for (const c of index.conversations) {
  if (!LANGS.includes(c.language)) continue;
  const key = `${c.file}:${Math.floor(c.row / G)}`;
  if (!groups.has(key)) groups.set(key, 0);
  groups.set(key, groups.get(key) + 1);
}
const taken = [...groups.keys()].sort((a, b) => (rank(a) < rank(b) ? -1 : 1)).slice(0, WANT);

const isLetter = (ch) => /\p{L}/u.test(ch);
const isRtlLetter = (ch) => { const c = bidiClass(ch.codePointAt(0)); return c === "R" || c === "AL"; };
const isLatin = (ch) => /\p{Script=Latin}/u.test(ch);

function kindOf(text) {
  let rtl = 0, latin = 0;
  for (const ch of text) {
    if (!isLetter(ch)) continue;
    if (isRtlLetter(ch)) rtl++;
    else if (isLatin(ch)) latin++;
  }
  if (rtl) return latin ? "mixed" : "script";
  return latin ? "latin" : "neither";
}

const empty = () => ({ conversations: 0, userTurns: 0, script: 0, latin: 0, mixed: 0, neither: 0,
  latinOnlyConversations: 0, bothWaysConversations: 0, latinTurnsByBothWaysUsers: 0 });
const per = Object.fromEntries(LANGS.map((l) => [l, empty()]));

const byFile = new Map();
for (const key of taken) {
  const [file, g] = key.split(":").map(Number);
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(g);
}

async function readFile(file) {
  for (let attempt = 1; ; attempt++) {
    try {
      const f = await asyncBufferFromUrl({ url: fileUrl(file) });
      const metadata = await parquetMetadataAsync(f);
      const rows = [];
      for (const g of byFile.get(file).sort((a, b) => a - b)) {
        rows.push(...await parquetReadObjects({ file: f, metadata, columns: ["conversation_hash", "language", "toxic", "conversation"], rowStart: g * G, rowEnd: (g + 1) * G }));
      }
      return rows;
    } catch (e) {
      if (attempt >= 8) throw e;
      const wait = /429/.test(String(e && e.message)) ? 60000 * attempt : 5000 * attempt;
      process.stderr.write(`file ${file}: ${e.message} - waiting ${wait / 1000}s\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const files = [...byFile.keys()].sort((a, b) => a - b);
let nextFile = 0, done = 0;
async function worker() {
  while (nextFile < files.length) {
    const file = files[nextFile++];
    const rows = await readFile(file);
    for (const r of rows) {
      if (r.toxic || !LANGS.includes(r.language)) continue;
      const p = per[r.language];
      p.conversations++;
      const kinds = [];
      for (const turn of r.conversation || []) {
        if (turn.role !== "user" || !turn.content || !turn.content.trim()) continue;
        const k = kindOf(turn.content);
        kinds.push(k);
        p.userTurns++; p[k]++;
      }
      const hasScript = kinds.some((k) => k === "script" || k === "mixed");
      const latinTurns = kinds.filter((k) => k === "latin").length;
      if (latinTurns && !hasScript) p.latinOnlyConversations++;
      if (latinTurns && hasScript) { p.bothWaysConversations++; p.latinTurnsByBothWaysUsers += latinTurns; }
    }
    done++;
    process.stderr.write(`file ${file} done (${done}/${files.length})\n`);
  }
}

await Promise.all([worker(), worker(), worker()]);

const totals = Object.values(per).reduce((a, p) => {
  for (const k of Object.keys(a)) a[k] += p[k];
  return a;
}, empty());
const result = {
  what: "How users write to a chat in right-to-left languages: their own script, or Latin letters",
  dataset: DATASET, revision: REVISION, unicode: UNICODE_VERSION, seed: SEED,
  sample: { rowGroups: taken.length, ofRowGroups: groups.size, conversationsPerRowGroup: G },
  note: "A 'latin' turn holds Latin letters and no right-to-left letter; it may be romanized or plain English, so it is an upper bound. The lower bound is latinTurnsByBothWaysUsers: Latin turns written by someone who also writes the script in the same conversation.",
  perLanguage: per, all: totals, generated: new Date().toISOString()
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
const pct = (x, n) => (n ? (100 * x / n).toFixed(1) + "%" : "-");
console.log(`${taken.length} row groups of ${groups.size}; ${totals.conversations} conversations, ${totals.userTurns} user turns`);
for (const l of LANGS) {
  const p = per[l];
  console.log(`  ${l.padEnd(8)} turns ${String(p.userTurns).padStart(6)}  script ${pct(p.script + p.mixed, p.userTurns).padStart(6)}  latin-only ${pct(p.latin, p.userTurns).padStart(6)}  conversations with both ${p.bothWaysConversations}/${p.conversations}`);
}
console.log("wrote " + OUT);
