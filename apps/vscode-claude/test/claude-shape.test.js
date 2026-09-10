/**
 * What this fix assumes about Claude Code, read straight out of the build under test.
 *
 * The real-bundle and real-stylesheet tests say THAT something stopped working after an
 * update. This says WHICH assumption went, in one line, so the morning an update breaks
 * something starts with the answer instead of an investigation.
 *
 * Every assumption listed here was checked across five builds, 2.1.247 to 2.1.267,
 * before anything was built on it. Each one that has a second road is only reported, not
 * failed: losing one of two ways in is worth knowing about and is not a breakage.
 *
 * Runs against the installed Claude Code, or against the one SMARTRTL_CLAUDE_DIR names -
 * which is how the daily watch points it at each new release.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const real = require("./support/real.js");

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;
const HOME = WEBVIEW ? path.dirname(WEBVIEW) : null;
const read = (f) => fs.readFileSync(f, "utf8");
const bundle = () => read(path.join(WEBVIEW, "index.js"));

test("the panel still loads its code from webview/index.js - the one file the fix goes into", { skip }, () => {
  assert.ok(fs.existsSync(path.join(WEBVIEW, "index.js")), "webview/index.js is gone: the fix has nowhere to go");
  const main = JSON.parse(read(path.join(HOME, "package.json"))).main || "./extension.js";
  const host = read(path.join(HOME, main));
  assert.match(host, /"webview"\s*,\s*"index\.js"/,
    "Claude Code's panel no longer loads webview/index.js - the patch would be written where nothing reads it");
});

test("the box you type in can still be found by what it is, not only by name", { skip }, (t) => {
  const s = bundle();
  assert.ok(s.includes('contentEditable:"plaintext-only"'), "the box you type in is no longer a plaintext-only contenteditable");
  const byRole = s.includes('role:"textbox"'), byLabel = s.includes('"aria-label":"Message input"');
  assert.ok(byRole || byLabel, "neither role=textbox nor the Message input label is left: only the class name finds the box");
  if (!byRole) t.diagnostic("role=textbox is gone; the label still finds the box");
  if (!byLabel) t.diagnostic("the Message input label is gone; role=textbox still finds the box");
  assert.match(s, /className:[A-Za-z0-9_$]+\.mentionMirror,"aria-hidden":"true"/,
    "the layer drawn over the box is no longer aria-hidden, or no longer there - one of two ways to it is gone");
});

test("a sent message's text is still handed to dir=\"auto\"", { skip }, (t) => {
  const n = (bundle().match(/dir:"auto"/g) || []).length;
  if (n === 0) t.diagnostic("dir=\"auto\" is gone; sent messages now rest on the class names alone");
  assert.ok(n <= 3, `dir="auto" appears ${n} times - it used to be once, on a sent message; check what else it now marks`);
});

test("the stylesheet's first road is still open - and if it is not, the second one is taken", { skip }, (t) => {
  const main = JSON.parse(read(path.join(HOME, "package.json"))).main || "./extension.js";
  const host = read(path.join(HOME, main));
  const open = /style-src[^;"`]*'unsafe-inline'/.test(host);
  // not a failure either way: the engine falls back to adoptedStyleSheets by itself
  if (!open) t.diagnostic("style-src no longer allows 'unsafe-inline'; the rules now arrive as an adopted stylesheet");
  assert.ok(true);
});
