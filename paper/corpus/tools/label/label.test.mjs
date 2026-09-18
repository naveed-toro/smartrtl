import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildQueue, isMixed } from "./queue.mjs";
import { openStore } from "./store.mjs";

const unit = (textId, ltr, rtl, extra = {}) => ({ textId, text: "x", source: "x", kind: "paragraph", where: [], ltr, rtl, firstStrong: "L", ...extra });

const records = [
  { answerId: "a1", project: "p", units: [unit("0000000000000001", 3, 2), unit("0000000000000002", 0, 5), unit("0000000000000003", 4, 0)] },
  { answerId: "a2", project: "p", units: [unit("0000000000000001", 3, 2), unit("0000000000000004", 1, 1),
    { kind: "code-block", where: [] }] },
  { answerId: "a3", project: "p", units: Array.from({ length: 40 }, (_, k) => unit((100 + k).toString(16).padStart(16, "0"), 1, 1)) }
];

test("only mixed texts are queued, each once, at their first occurrence", () => {
  const q = buildQueue(records);
  assert.equal(q.length, 42);
  assert.equal(new Set(q.map((x) => x.textId)).size, 42);
  assert.ok(!q.some((x) => x.textId === "0000000000000002" || x.textId === "0000000000000003"));
  assert.equal(q.find((x) => x.textId === "0000000000000001").answerId, "a1");
  assert.equal(isMixed({ kind: "code-block" }), false);
});

test("the order is fixed by the seed, not by the order answers were read in", () => {
  const a = buildQueue(records).map((x) => x.textId);
  const b = buildQueue([...records].reverse()).map((x) => x.textId);
  assert.deepEqual(a, b);
  const c = buildQueue(records, "another seed").map((x) => x.textId);
  assert.notDeepEqual(a, c, "a different seed gives a different order");
  assert.notDeepEqual(a, [...a].sort(), "the order is shuffled");
});

test("labels are kept, corrected by a later line, and refused once frozen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "labels-"));
  try {
    const s = openStore(dir);
    s.add("owner", { textId: "0000000000000001", label: "ltr", ms: 900 });
    s.add("owner", { textId: "0000000000000001", label: "rtl", ms: 1200 });
    s.add("owner", { textId: "0000000000000004", label: "neither" });
    assert.equal(s.read("owner").get("0000000000000001").label, "rtl");
    assert.equal(s.read("owner").size, 2);
    assert.throws(() => s.add("owner", { textId: "0000000000000004", label: "maybe" }), /unknown label/);
    assert.throws(() => s.add("../x", { textId: "0000000000000004", label: "rtl" }), /labeller name/);

    s.freeze();
    assert.throws(() => s.add("owner", { textId: "0000000000000004", label: "rtl" }), /frozen/);
    assert.deepEqual(s.tampered(), []);
    fs.appendFileSync(path.join(dir, "owner.jsonl"), "{}\n");
    assert.deepEqual(s.tampered(), ["owner.jsonl"], "a change after freezing is reported");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
