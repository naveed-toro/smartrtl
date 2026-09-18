// Where labels are kept. One append-only file per labeller; a later line for the same text
// replaces an earlier one, so a label can be corrected - until the labels are frozen.
// Freezing writes the hash of every labels file; after that nothing is accepted, and a
// labels file that no longer matches its frozen hash is reported, not trusted.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const LABELS = ["rtl", "ltr", "either", "neither", "unclear"];

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

export function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const frozenFile = path.join(dir, "FROZEN.json");
  const fileOf = (by) => {
    if (!/^[a-z0-9-]{1,40}$/.test(by)) throw new Error(`labeller name must be lowercase letters, digits or -: ${by}`);
    return path.join(dir, `${by}.jsonl`);
  };

  function frozen() {
    return fs.existsSync(frozenFile) ? JSON.parse(fs.readFileSync(frozenFile, "utf8")) : null;
  }

  /** The current label of every text this labeller has answered: textId -> line. */
  function read(by) {
    const file = fileOf(by), out = new Map();
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      out.set(r.textId, r);
    }
    return out;
  }

  function add(by, entry) {
    if (frozen()) throw new Error("the labels are frozen; nothing more is accepted");
    if (!LABELS.includes(entry.label)) throw new Error(`unknown label: ${entry.label}`);
    if (!/^[0-9a-f]{16}$/.test(entry.textId || "")) throw new Error("a label needs the textId it answers");
    const line = { textId: entry.textId, label: entry.label, by, at: new Date().toISOString(),
      ms: Math.max(0, Math.round(Number(entry.ms) || 0)), context: !!entry.context,
      guide: entry.guide, snapshot: entry.snapshot, sitting: String(entry.sitting || "") };
    fs.appendFileSync(fileOf(by), JSON.stringify(line) + "\n");
    return line;
  }

  function freeze() {
    if (frozen()) throw new Error("already frozen");
    const files = {};
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      files[f] = sha256(fs.readFileSync(path.join(dir, f)));
    }
    const record = { at: new Date().toISOString(), files };
    fs.writeFileSync(frozenFile, JSON.stringify(record, null, 2) + "\n");
    return record;
  }

  /** Files whose bytes differ from what was frozen. Empty when nothing was touched. */
  function tampered() {
    const f = frozen();
    if (!f) return [];
    return Object.entries(f.files).filter(([name, hash]) => {
      const p = path.join(dir, name);
      return !fs.existsSync(p) || sha256(fs.readFileSync(p)) !== hash;
    }).map(([name]) => name);
  }

  return { read, add, freeze, frozen, tampered };
}
