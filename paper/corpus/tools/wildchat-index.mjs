// Source B, step 1: an index of WildChat-4.8M's right-to-left conversations.
//
// Reads only the small columns (language, model, turn, toxic, redacted, conversation hash)
// of all 86 files, straight from Hugging Face by HTTP range requests, at a pinned revision -
// so the counts are of the whole dataset, not a sample, and anyone can re-run them.
//
//   node wildchat-index.mjs  ->  corpus/public/wildchat-index.json (+ counts on stdout)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "hyparquet";

export const DATASET = "allenai/WildChat-4.8M";
export const REVISION = "c827c6df8fcf008219ffaffa4d1dd77491099367";
export const FILES = 86;
export const RTL_LANGUAGES = ["Arabic", "Persian", "Urdu", "Hebrew", "Pashto", "Sindhi", "Kurdish", "Uighur", "Yiddish", "Dhivehi"];
export const fileUrl = (i) => `https://huggingface.co/datasets/${DATASET}/resolve/${REVISION}/data/train-${String(i).padStart(5, "0")}-of-00086.parquet`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "public", "wildchat-index.json");
const PARTS = path.join(HERE, "..", "public", "wildchat-index-parts");

// Hugging Face limits request rates: each file's result is kept, so a stopped run resumes,
// and a refused request waits long enough for the limit to pass.
async function indexFile(i) {
  const part = path.join(PARTS, `${i}.json`);
  if (fs.existsSync(part)) return JSON.parse(fs.readFileSync(part, "utf8"));
  for (let attempt = 1; ; attempt++) {
    try {
      const file = await asyncBufferFromUrl({ url: fileUrl(i) });
      const metadata = await parquetMetadataAsync(file);
      const rows = await parquetReadObjects({ file, metadata, columns: ["conversation_hash", "model", "turn", "language", "toxic", "redacted"] });
      const all = {}, rtl = [];
      rows.forEach((r, row) => {
        all[r.language] = (all[r.language] || 0) + 1;
        if (RTL_LANGUAGES.includes(r.language)) {
          rtl.push({ file: i, row, hash: r.conversation_hash, model: r.model, turn: Number(r.turn), language: r.language, toxic: !!r.toxic, redacted: !!r.redacted });
        }
      });
      const result = { file: i, rows: rows.length, rowGroupRows: Number(metadata.row_groups[0].num_rows), languages: all, rtl };
      fs.mkdirSync(PARTS, { recursive: true });
      fs.writeFileSync(part, JSON.stringify(result));
      return result;
    } catch (e) {
      if (attempt >= 8) throw e;
      const wait = /429/.test(String(e && e.message)) ? 60000 * attempt : 5000 * attempt;
      process.stderr.write(`file ${i}: ${e.message} - waiting ${wait / 1000}s\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < FILES) {
      const i = next++;
      const r = await indexFile(i);
      results[i] = r;
      process.stderr.write(`file ${i}: ${r.rows} rows, ${r.rtl.length} right-to-left\n`);
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));

  const totals = {}, byModel = {};
  let rows = 0;
  for (const r of results) {
    rows += r.rows;
    for (const [k, v] of Object.entries(r.languages)) totals[k] = (totals[k] || 0) + v;
    for (const c of r.rtl) {
      byModel[c.language] = byModel[c.language] || {};
      byModel[c.language][c.model] = (byModel[c.language][c.model] || 0) + 1;
    }
  }
  const index = {
    dataset: DATASET, revision: REVISION, generated: new Date().toISOString(), rows,
    rowGroupRows: results[0].rowGroupRows,
    rtlLanguages: Object.fromEntries(RTL_LANGUAGES.map((l) => [l, totals[l] || 0])),
    byModel,
    conversations: results.flatMap((r) => r.rtl)
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(index) + "\n");
  console.log(JSON.stringify({ rows, rtlLanguages: index.rtlLanguages, byModel }, null, 2));
}
