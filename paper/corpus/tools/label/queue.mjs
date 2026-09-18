// What a labeller is asked about, and in what order.
//
// Only mixed texts - a left-to-right and a right-to-left strong character both present
// (corpus.md, "The unit") - each distinct text once, at its first occurrence. The order is
// a shuffle fixed by SEED, so any number of labels taken from the start of the queue is a
// uniform random sample of all of it (corpus.md, "How many to label").

import crypto from "node:crypto";

export const SEED = "smartrtl corpus, source A, 2026-09-17";

export function isMixed(u) { return u.text != null && u.ltr > 0 && u.rtl > 0; }

/** A deterministic stream of 32-bit numbers from a text seed: SHA-256 in counter mode. */
function randomFrom(seed) {
  let counter = 0, pool = [];
  return function next() {
    if (!pool.length) {
      const h = crypto.createHash("sha256").update(`${seed}:${counter++}`).digest();
      for (let i = 0; i < 32; i += 4) pool.push(h.readUInt32BE(i));
    }
    return pool.shift();
  };
}

/** A uniform integer in [0, n), without modulo bias. */
function below(next, n) {
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) { const x = next(); if (x < limit) return x % n; }
}

/**
 * @param {Iterable<object>} records answers as written by transcripts.mjs, in file order
 * @returns {Array<object>} the queue: one entry per distinct mixed text, shuffled
 */
export function buildQueue(records, seed = SEED) {
  const byText = new Map();
  for (const a of records) {
    for (const u of a.units) {
      if (!isMixed(u) || byText.has(u.textId)) continue;
      const list = [...u.where].reverse().find((w) => w.list);
      byText.set(u.textId, { textId: u.textId, kind: u.kind, depth: u.depth ?? null, ordered: list ? list.ordered : null, source: u.source,
        text: u.text, answerId: a.answerId, project: a.project, firstStrong: u.firstStrong });
    }
  }
  // Sorted first, so the shuffle does not depend on the order the answers were read in.
  const queue = [...byText.values()].sort((x, y) => (x.textId < y.textId ? -1 : 1));
  const next = randomFrom(seed);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = below(next, i + 1);
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}
