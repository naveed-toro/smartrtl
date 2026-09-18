// Source A: the owner's own Claude Code answers, from the transcripts Claude Code keeps on
// this machine. Private conversations - so this writes only into corpus/private, which git
// ignores, and prints numbers, never text. Nothing from here is published until the owner
// has read it (corpus.md, "Source A").
//
//   node transcripts.mjs [transcripts folder] [--overwrite-snapshot]
//
// Only assistant text is taken: never what the person typed, never tool output, never the
// model's thinking. An answer that appears more than once (a transcript carried into a
// continued session) is kept once.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { toUnits } from "./units.mjs";
import { UNICODE_VERSION } from "./bidi.mjs";

// The transcripts keep growing while this work goes on, and answers written after the
// formula study began are about the study itself. Source A is every answer written before
// that day, and nothing after it - so the corpus is a fixed thing, and re-running this
// script gives the same units.
export const CUTOFF = "2026-09-17T00:00:00Z";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FROM = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(os.homedir(), ".claude", "projects");
const OUT = path.join(HERE, "..", "private", "transcripts.units.jsonl");

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".jsonl")) files.push(p);
  }
})(FROM);
files.sort();

// The snapshot is the corpus. Claude Code deletes old transcripts on its own schedule, so
// once written, this file may be all that is left of them - it is never overwritten
// unless asked for by name.
if (fs.existsSync(OUT) && !process.argv.includes("--overwrite-snapshot")) {
  console.error(`${OUT} already exists and is the corpus snapshot. Pass --overwrite-snapshot to replace it.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const out = fs.openSync(OUT, "w");
const seenAnswers = new Set();
const n = { files: files.length, answers: 0, repeated: 0, synthetic: 0, afterCutoff: 0, units: 0, byKind: {}, withRtl: 0,
  withRtlAndLtr: 0, withRtlFirstStrongL: 0, withRtl3Switches: 0, byProject: {}, byModel: {} };

for (const file of files) {
  const project = path.relative(FROM, file).split(path.sep)[0];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== "assistant" || !Array.isArray(o.message?.content)) continue;
    if (o.message.model === "<synthetic>") { n.synthetic++; continue; }
    if (!(o.timestamp < CUTOFF)) { n.afterCutoff++; continue; }
    o.message.content.forEach((part, i) => {
      if (part.type !== "text" || !part.text?.trim()) return;
      const textId = hash(part.text);
      if (seenAnswers.has(textId)) { n.repeated++; return; }
      seenAnswers.add(textId);
      const units = toUnits(part.text).map((u) => (u.text == null ? u : { ...u, textId: hash(u.text) }));
      const record = {
        source: "claude-code-transcripts", cutoff: CUTOFF, unicode: UNICODE_VERSION,
        answerId: hash(`${o.sessionId}/${o.uuid}/${i}`), project, model: o.message.model,
        timestamp: o.timestamp, sidechain: !!o.isSidechain, markdown: part.text, units
      };
      fs.writeSync(out, JSON.stringify(record) + "\n");
      n.answers++;
      n.byProject[project] = (n.byProject[project] || 0) + 1;
      n.byModel[record.model] = (n.byModel[record.model] || 0) + 1;
      for (const u of units) {
        n.units++;
        n.byKind[u.kind] = (n.byKind[u.kind] || 0) + 1;
        if (!(u.rtl > 0)) continue;
        n.withRtl++;
        if (u.ltr > 0) n.withRtlAndLtr++;
        if (u.firstStrong === "L") n.withRtlFirstStrongL++;
        if (u.switches >= 3) n.withRtl3Switches++;
      }
    });
  }
}
fs.closeSync(out);
console.log(JSON.stringify(n, null, 2));
