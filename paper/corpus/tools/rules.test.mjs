import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, FORMULAS } from "./rules.mjs";

const dir = (rule, t, prose) => RULES[rule](t, prose).dir;

test("every formula has its group, year, source of authority and a decision", () => {
  const groups = new Set(FORMULAS.map((f) => f.group));
  assert.deepEqual([...groups].sort(), ["adopted", "ai-today", "ours", "proposed"]);
  for (const f of FORMULAS) {
    assert.ok(f.id && f.name && f.year && f.who && f.what && f.situation, f.id);
    assert.ok(["rtl", "ltr"].includes(dir(f.id, "React ایک لائبریری ہے")), f.id);
  }
  assert.equal(new Set(FORMULAS.map((f) => f.id)).size, FORMULAS.length, "ids are unique");
});

test("first-strong decides by the first strong character only", () => {
  assert.equal(dir("first-strong", "useMemo اور useCallback"), "ltr");
  assert.equal(dir("first-strong", "2024 کا سال React"), "rtl");
  assert.equal(dir("first-strong", "— 42 —"), "ltr");
  assert.equal(dir("first-strong-rtl", "— 42 —"), "rtl", "auto-rtl differs only where nothing is strong");
});

test("any-rtl turns on a single right-to-left character; the 63-letter form looks no further", () => {
  assert.equal(dir("any-rtl", "In Urdu this is called ایونٹ لوپ, but it is the same."), "rtl");
  assert.equal(dir("any-rtl", "plain English"), "ltr");
  assert.equal(dir("any-rtl-63", "a".repeat(70) + " اردو"), "ltr");
});

test("Closure's own estimateDirection runs: over 40% RTL words is RTL", () => {
  assert.equal(dir("word-count-40", "Debounce بمقابلہ Throttle"), "ltr");         // 1 of 3
  assert.equal(dir("word-count-40", "JavaScript میں Debounce فنکشن"), "rtl");     // 2 of 4
  assert.equal(RULES["word-count-40"]("123").raw, "ltr", "numbers are weakly LTR");
});

test("majorities: characters, without links, and without code", () => {
  assert.equal(dir("char-majority", "useMemo اور useCallback"), "ltr");
  assert.equal(dir("char-majority", "React ایک لائبریری ہے"), "rtl");
  assert.equal(dir("telegram-2017", "https://example.com/a/very/long/address اردو"), "rtl", "links do not count");
  assert.equal(dir("prose-majority", "useMemo جب حساب مہنگا", "  جب حساب مہنگا"), "rtl", "code does not count");
});

test("SmartRTL today needs an RTL word and otherwise leaves the text alone", () => {
  assert.equal(dir("smartrtl", "useMemo اور useCallback"), "rtl");
  assert.equal(RULES.smartrtl("x ب y").raw, null);
});

test("opening words: the five headings, an English sentence with a late insert, and when it settles", () => {
  const headings = ["useMemo اور useCallback", "args - اصل arguments", "children بطور props",
    "Debounce بمقابلہ Throttle", "JavaScript میں Debounce فنکشن"];
  for (const h of headings) {
    assert.equal(dir("opening-words-3", h), "rtl", h);
    assert.equal(dir("opening-words-6", h), "rtl", h);
  }
  const english = "In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical.";
  assert.equal(dir("opening-words-3", english), "ltr");
  assert.equal(dir("opening-words-6", english), "ltr", "the Urdu phrase is word 7");
  const six = FORMULAS.find((f) => f.id === "opening-words-6");
  assert.equal(six.settled("یہ جملہ"), true, "starts right-to-left: settled at once");
  assert.equal(six.settled("React is a"), false, "three left-to-right words: not yet");
  assert.equal(six.settled("React is a JavaScript library for building"), true, "seven words, none right-to-left: settled");
  assert.equal(six.settled("React ایک"), true, "a right-to-left word inside the window: settled");
});

test("counting formulas have no settle point; first strong settles at its first strong letter", () => {
  for (const id of ["word-count-40", "char-majority", "telegram-2017", "prose-majority"]) {
    assert.equal(typeof FORMULAS.find((f) => f.id === id).settled, "undefined", id);
  }
  const fs1 = FORMULAS.find((f) => f.id === "first-strong");
  assert.equal(fs1.settled("123 "), false);
  assert.equal(fs1.settled("123 a"), true);
});

test("Firefox's formula at 63 letters: the paper's proposal (owner, 2026-09-17)", () => {
  const f = FORMULAS.find((x) => x.id === "any-rtl-63");
  assert.equal(f.proposed, true);
  assert.equal(FORMULAS.filter((x) => x.proposed).length, 1, "one proposal, not two");
  const headings = ["useMemo اور useCallback", "args - اصل arguments", "children بطور props",
    "Debounce بمقابلہ Throttle", "JavaScript میں Debounce فنکشن"];
  for (const h of headings) assert.equal(dir("any-rtl-63", h), "rtl", h);
  // the Urdu arrives at letter 52: inside 63, outside 45
  const late = "useEffect, useMemo, useCallback, useRef and useContext hooks کو سمجھنا ضروری ہے۔";
  assert.equal(dir("any-rtl-63", late), "rtl");
  assert.equal(dir("opening-letters-45", late), "ltr");
  assert.equal(f.settled("React is a JavaScript library for building user interfaces"), false, "50 letters, none right-to-left");
  assert.equal(f.settled("React is a JavaScript library for building user interfaces on the web and phones"), true, "past 63 letters");
});

test("opening letters (45): the earlier suggestion, kept for the comparison", () => {
  const f = FORMULAS.find((x) => x.id === "opening-letters-45");
  assert.equal(f.proposed, false);
  const headings = ["useMemo اور useCallback", "args - اصل arguments", "children بطور props",
    "Debounce بمقابلہ Throttle", "JavaScript میں Debounce فنکشن"];
  for (const h of headings) assert.equal(dir("opening-letters-45", h), "rtl", h);
  assert.equal(dir("opening-letters-45", "یہ جملہ اردو ہے"), "rtl");
  // "In Urdu this idea is called" is 22 letters: the Urdu phrase arrives inside 45 - a known mistake
  assert.equal(dir("opening-letters-45", "In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical."), "rtl");
  assert.equal(dir("opening-letters-45", "The event loop runs microtasks before the next task, and only then ایونٹ"), "ltr", "RTL after 45 letters");
  assert.equal(f.settled("یہ"), true, "first letter right-to-left: settled at once");
  assert.equal(f.settled("React is a JavaScript"), false, "18 letters, none right-to-left");
  assert.equal(f.settled("React is a JavaScript library for building user interfaces"), true, "past 45 letters");
  assert.equal(f.settled("React ایک"), true);
});
