// The four candidates, and the texts that decide between them.
//
//   Any RTL              one right-to-left letter anywhere
//   Our first formula    two right-to-left characters in a row anywhere (packages/core, frozen)
//   Firefox's formula    a right-to-left letter within the first 63 letters
//   Firefox's formula    ... within the first 45 letters
//
// Where all four give a text the same direction they are all right or all wrong together, so
// that text cannot rank them. Only the texts they disagree on are labelled - every one of them,
// from both sources - and the rule that chooses is written in paper/results/README.md before the
// first label.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildQueue } from "./label/queue.mjs";
import { bidiClass } from "./bidi.mjs";

const require = createRequire(import.meta.url);
const core = require("../../../packages/core/src/direction.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOURCES = {
  A: path.join(HERE, "..", "private", "transcripts.units.jsonl"),
  B: path.join(HERE, "..", "public", "wildchat.units.jsonl")
};
export const SEED_FOUR = "smartrtl, the four candidates, both sources, 2026-09-17";

const isLetter = (ch) => /\p{L}/u.test(ch);
const isRtlLetter = (ch) => { const c = bidiClass(ch.codePointAt(0)); return c === "R" || c === "AL"; };

/** The letter of a text's first right-to-left letter, and whether its first letter is one. */
export function profile(text) {
  let letters = 0, firstRtl = null, firstLetterRtl = null;
  for (const ch of text) {
    if (!isLetter(ch)) continue;
    letters++;
    const r = isRtlLetter(ch);
    if (firstLetterRtl === null) firstLetterRtl = r;
    if (r && firstRtl === null) firstRtl = letters;
  }
  return { letters, firstRtl, firstLetterRtl };
}

/** A window of X letters (Infinity: no window, Any RTL): the direction it leaves on the text. */
export function byWindow(text, X) {
  const p = profile(text);
  if (p.firstLetterRtl) return "rtl";
  return p.firstRtl !== null && p.firstRtl <= X ? "rtl" : "ltr";
}

export function candidates(text) {
  return {
    "any-rtl": byWindow(text, Infinity),
    "first-formula": core.directionFor(text) === "rtl" ? "rtl" : "ltr",
    "firefox-63": byWindow(text, 63),
    "firefox-45": byWindow(text, 45)
  };
}

/** Every text, from both sources, on which the four do not all agree - shuffled by SEED_FOUR. */
export function disagreements() {
  const out = [];
  for (const [source, file] of Object.entries(SOURCES)) {
    const records = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const answers = new Map(records.map((a) => [a.answerId, a.markdown]));
    for (const q of buildQueue(records)) {
      const c = candidates(q.text);
      if (new Set(Object.values(c)).size < 2) continue;
      out.push({ ...q, sourceName: source, markdown: answers.get(q.answerId) || "" });
    }
  }
  out.sort((x, y) => (x.textId < y.textId ? -1 : 1));
  let counter = 0, pool = [];
  const next = () => {
    if (!pool.length) {
      const h = crypto.createHash("sha256").update(`${SEED_FOUR}:${counter++}`).digest();
      for (let i = 0; i < 32; i += 4) pool.push(h.readUInt32BE(i));
    }
    return pool.shift();
  };
  for (let i = out.length - 1; i > 0; i--) {
    const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1);
    let x; do { x = next(); } while (x >= limit);
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
