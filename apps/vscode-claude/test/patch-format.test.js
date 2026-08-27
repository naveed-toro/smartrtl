/**
 * The block's shape, and the promise it carries.
 *
 * VS Code gives an extension no working way to clean up after itself when it is
 * uninstalled: `vscode:uninstall` has been broken since 1.69
 * (microsoft/vscode#155561, open) and `onDidChange` does not fire for your own
 * removal, closed as-designed. The block therefore has to be safe to leave behind
 * on its own terms - which is what these assert.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fmt = require("../src/patch-format.js");
const { BEGIN, stripPatch, readExpiry, stampExpiry, WINDOW_MS, REFRESH_BELOW_MS } = fmt;

const BLOCK = BEGIN + "\n;(function(){var EXPIRES_AT = 0;})();\n/* ==== smart-rtl-direction patch END ==== */";
const applyTo = (clean, now = 1_700_000_000_000) => clean + "\n" + stampExpiry(BLOCK, now) + "\n";

test("apply then remove gives back the original, byte for byte", () => {
  for (const original of [
    "//bundle\nconst a=1;\n",       // ends with a newline
    "//bundle\nconst a=1;",         // ends without one
    "//bundle\nconst a=1;\n\n\n",   // ends with several
    "// a trailing line comment"    // last line is a comment - the risky one
  ]) {
    assert.equal(stripPatch(applyTo(original)), original, JSON.stringify(original));
  }
});

test("a patch can never stack on a patch", () => {
  const original = "//bundle\n";
  assert.equal(stripPatch(applyTo(stripPatch(applyTo(original)))), original);
});

test("the block carries an expiry, and it can be read back out", () => {
  const now = 1_700_000_000_000;
  assert.equal(readExpiry(applyTo("//x\n", now)), now + WINDOW_MS);
});

test("an unstamped file has no expiry to find", () => {
  assert.equal(readExpiry("//just a bundle\n"), 0);
});

test("the window outlasts the refresh threshold, or it would rewrite constantly", () => {
  assert.ok(WINDOW_MS > REFRESH_BELOW_MS,
    "a block must be re-stamped well before it is due to lapse");
});

test("a payload with nowhere to stamp is refused rather than shipped unguarded", () => {
  // A block with no expiry would outlive the extension for good. Fail loudly at
  // build time instead of quietly leaving one behind on somebody's machine.
  assert.throws(() => stampExpiry("/* no slot here */", Date.now()), /EXPIRES_AT/);
});
