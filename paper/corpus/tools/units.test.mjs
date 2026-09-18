import { test } from "node:test";
import assert from "node:assert/strict";
import { toUnits } from "./units.mjs";
import { bidiClass, firstStrong, strongSwitches, UNICODE_VERSION } from "./bidi.mjs";

test("bidi classes come from the Unicode data file, defaults included", () => {
  assert.equal(UNICODE_VERSION, "18.0.0");
  assert.equal(bidiClass(0x41), "L");      // A
  assert.equal(bidiClass(0x05D0), "R");    // alef (Hebrew)
  assert.equal(bidiClass(0x0627), "AL");   // alef (Arabic)
  assert.equal(bidiClass(0x06F1), "EN");   // extended Arabic-Indic digit one
  assert.equal(bidiClass(0x0661), "AN");   // Arabic-Indic digit one
  assert.equal(bidiClass(0x0030), "EN");
  assert.equal(bidiClass(0x2067), "RLI");
  assert.equal(bidiClass(0x08FF), "NSM");  // an explicit entry inside an AL default range
});

test("first strong follows P2: digits and punctuation do not decide, isolates are skipped", () => {
  assert.equal(firstStrong("2024 کا سال"), "AL");
  assert.equal(firstStrong("useMemo اور useCallback"), "L");
  assert.equal(firstStrong("⁧React⁩ ایک لائبریری"), "AL");
  assert.equal(firstStrong("250–400ms"), "L");
  assert.equal(firstStrong("— 42 —"), null);
});

test("a direction switch is counted between strong characters only", () => {
  assert.equal(strongSwitches("React میں state اور props کا فرق"), 5);
  assert.equal(strongSwitches("React ایک لائبریری ہے"), 1);
  assert.equal(strongSwitches("اردو 123 اردو"), 0);
});

test("an answer becomes the units a browser directs on its own", () => {
  const md = [
    "## `useMemo` اور useCallback",
    "",
    "پہلا پیراگراف [ایک لنک](https://example.com) کے ساتھ۔",
    "",
    "- پہلا نکتہ",
    "  - اندر والا **نکتہ**",
    "- second item",
    "",
    "  its second paragraph",
    "",
    "| نام | value |",
    "|---|---|",
    "| الف | 1 |",
    "",
    "> اقتباس",
    "",
    "```js",
    "const a = 1;",
    "```"
  ].join("\n");
  const u = toUnits(md);
  assert.deepEqual(u.map((x) => x.kind), [
    "heading", "paragraph", "list-item", "list-item", "list-item", "list-item-paragraph",
    "table-cell", "table-cell", "table-cell", "table-cell", "paragraph", "code-block"
  ]);
  assert.equal(u[0].text, "useMemo اور useCallback");
  assert.equal(u[0].source, "## `useMemo` اور useCallback");
  assert.equal(u[0].prose, "  اور useCallback", "prose leaves inline code out");
  assert.equal(u[1].text, "پہلا پیراگراف ایک لنک کے ساتھ۔", "a link's address is not seen");
  assert.equal(u[3].text, "اندر والا نکتہ");
  assert.equal(u[3].where.length, 2, "a nested item knows both lists it is in");
  assert.equal(u[2].where[0].list, u[3].where[0].list);
  assert.equal(u[6].where[0].header, true);
  assert.equal(u[6].source, "نام", "a cell's source holds no pipes");
  assert.equal(u[9].source, "1");
  assert.equal(u[8].where[0].row, 1);
  assert.ok(u[10].where[0].blockquote);
  assert.equal(u[11].lang, "js");
  assert.equal(u[0].firstStrong, "L");
  assert.equal(u[0].rtl > 0, true);
});
