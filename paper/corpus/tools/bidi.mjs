// The Unicode Bidi_Class of every code point, read from the Unicode Character Database
// itself - not from script names or hand-written ranges - so that "strong", "first strong"
// and "right-to-left" mean exactly what UAX #9 means by them, at a version the paper names.
//
// The data file is downloaded once into .cache and checked against the hash recorded here.
// A different file is refused rather than used: a silent change of Unicode version would
// change the corpus's numbers without anybody deciding it.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const UNICODE_VERSION = "18.0.0";
const SHA256 = "d9e23222522551348ea1ccfbb4f62efbf98982afb95840f8959c08ed992c5607";
const URL_ = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/extracted/DerivedBidiClass.txt`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, ".cache", `DerivedBidiClass-${UNICODE_VERSION}.txt`);

// Long names in @missing lines, short names in data lines.
const SHORT = { Left_To_Right: "L", Right_To_Left: "R", Arabic_Letter: "AL", European_Terminator: "ET" };

async function load() {
  if (!fs.existsSync(FILE)) {
    const res = await fetch(URL_);
    if (!res.ok) throw new Error(`could not download ${URL_}: ${res.status}`);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = fs.readFileSync(FILE);
  const got = crypto.createHash("sha256").update(bytes).digest("hex");
  if (got !== SHA256) throw new Error(`${FILE} is not Unicode ${UNICODE_VERSION}'s DerivedBidiClass.txt (sha256 ${got})`);
  return bytes.toString("utf8");
}

const table = new Array(0x110000);
{
  const text = await load();
  // Defaults first, in file order (later @missing lines are narrower and win), then the
  // explicit assignments, which win over every default.
  for (const m of text.matchAll(/^# @missing: ([0-9A-F]+)\.\.([0-9A-F]+); (\w+)/gm)) {
    const cls = SHORT[m[3]];
    if (!cls) throw new Error(`unknown default bidi class ${m[3]}`);
    table.fill(cls, parseInt(m[1], 16), parseInt(m[2], 16) + 1);
  }
  for (const m of text.matchAll(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)/gm)) {
    table.fill(m[3], parseInt(m[1], 16), parseInt(m[2] || m[1], 16) + 1);
  }
}

/** The Bidi_Class of one code point, as its short name: L, R, AL, EN, ON, LRI, ... */
export function bidiClass(cp) { return table[cp]; }

const ISOLATE_OPEN = new Set(["LRI", "RLI", "FSI"]);

/**
 * UAX #9 rules P2 and P3 for a single paragraph: the class of the first strong character
 * (L, R or AL), skipping characters between an isolate initiator and its matching PDI.
 * Returns "L", "R", "AL", or null when the text has no strong character.
 */
export function firstStrong(text) {
  let depth = 0;
  for (const ch of text) {
    const c = table[ch.codePointAt(0)];
    if (ISOLATE_OPEN.has(c)) { depth++; continue; }
    if (c === "PDI") { if (depth > 0) depth--; continue; }
    if (c === "B") depth = 0;
    if (depth === 0 && (c === "L" || c === "R" || c === "AL")) return c;
  }
  return null;
}

/** How many strong characters of each direction the text holds. */
export function strongCounts(text) {
  let ltr = 0, rtl = 0;
  for (const ch of text) {
    const c = table[ch.codePointAt(0)];
    if (c === "L") ltr++;
    else if (c === "R" || c === "AL") rtl++;
  }
  return { ltr, rtl };
}

/** How many times the direction of strong characters changes along the text. */
export function strongSwitches(text) {
  let last = null, n = 0;
  for (const ch of text) {
    const c = table[ch.codePointAt(0)];
    const d = c === "L" ? "L" : c === "R" || c === "AL" ? "R" : null;
    if (!d) continue;
    if (last && d !== last) n++;
    last = d;
  }
  return n;
}
