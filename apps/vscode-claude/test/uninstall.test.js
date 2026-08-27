/**
 * Leaving no trace.
 *
 * The whole footprint of this extension is one marked block appended to the end
 * of one file. These tests hold that claim: the round trip is exact to the byte,
 * a patch cannot stack on a patch, and the uninstall hook cleans every copy of
 * Claude Code it can see - including the 5MB backups an older version of this
 * extension used to leave behind.
 *
 * No browser and no editor: what is under test happens on a machine that is about
 * to stop running our code.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cleanUp, stripPatch, BEGIN } = require("../src/uninstall.js");

const PAYLOAD = BEGIN + "\n;(function(){})();\n/* ==== smart-rtl-direction patch END ==== */";
const applyTo = (clean) => clean + "\n" + PAYLOAD + "\n";

function fakeExtensionsDir(copies) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-"));
  fs.mkdirSync(path.join(root, "smartrtl.claude-code-rtl-0.0.7"), { recursive: true });
  for (const [name, { bundle, legacy }] of Object.entries(copies)) {
    const dir = path.join(root, name, "webview");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.js"), bundle, "utf8");
    if (legacy !== undefined) fs.writeFileSync(path.join(dir, "index.js.pristine-backup"), legacy, "utf8");
  }
  return root;
}
const bundleOf = (root, name) => fs.readFileSync(path.join(root, name, "webview", "index.js"), "utf8");
const legacyExists = (root, name) => fs.existsSync(path.join(root, name, "webview", "index.js.pristine-backup"));

test("apply then remove gives back the original, byte for byte", () => {
  // Not "nearly the same file". The same file. Trailing newlines included, because
  // a diff that shows one changed byte is still a diff somebody has to explain.
  for (const original of [
    "//bundle\nconst a=1;\n",          // ends with a newline
    "//bundle\nconst a=1;",            // ends without one
    "//bundle\nconst a=1;\n\n\n",      // ends with several
    "// a trailing line comment"       // last line is a comment - the risky one
  ]) {
    assert.equal(stripPatch(applyTo(original)), original, JSON.stringify(original));
  }
});

test("a patch can never stack on a patch", () => {
  const original = "//bundle\n";
  assert.equal(stripPatch(applyTo(stripPatch(applyTo(original)))), original);
});

test("uninstalling truncates the patch out of every copy of Claude Code", () => {
  const root = fakeExtensionsDir({
    "anthropic.claude-code-2.1.246-win32-x64": { bundle: applyTo("//old\n") },
    "anthropic.claude-code-2.1.247-win32-x64": { bundle: applyTo("//new\n") }
  });
  const r = cleanUp(root);
  assert.equal(r.restored.length, 2, "an update leaves older folders behind, still carrying our block");
  assert.equal(bundleOf(root, "anthropic.claude-code-2.1.246-win32-x64"), "//old\n");
  assert.equal(bundleOf(root, "anthropic.claude-code-2.1.247-win32-x64"), "//new\n");
});

test("the 5MB copies an older version of us used to keep are cleaned up too", () => {
  const root = fakeExtensionsDir({
    "anthropic.claude-code-2.1.247-win32-x64": { bundle: applyTo("//x\n"), legacy: "//x\n" }
  });
  const r = cleanUp(root);
  assert.deepEqual(r.legacyRemoved, ["anthropic.claude-code-2.1.247-win32-x64"]);
  assert.equal(legacyExists(root, "anthropic.claude-code-2.1.247-win32-x64"), false);
});

test("a patch written by an older version is restored from its copy, not truncated", () => {
  // Versions before 0.0.7 trimmed the original's trailing whitespace when patching,
  // so truncating one of their patches gives back a file that is nearly right. The
  // copy they kept is the only exact original there is - use it while it is there.
  const original = "//bundle\n\n\n";
  const oldStylePatch = original.replace(/\s+$/, "") + "\n" + PAYLOAD + "\n";
  const root = fakeExtensionsDir({
    "anthropic.claude-code-2.1.247-win32-x64": { bundle: oldStylePatch, legacy: original }
  });
  cleanUp(root);
  assert.equal(bundleOf(root, "anthropic.claude-code-2.1.247-win32-x64"), original,
    "the trailing bytes their trim threw away come back from the copy");
});

test("a copy that is itself a patch is thrown away, not written back", () => {
  const root = fakeExtensionsDir({
    "anthropic.claude-code-2.1.247-win32-x64": { bundle: applyTo("//x\n"), legacy: applyTo("//x\n") }
  });
  cleanUp(root);
  assert.equal(bundleOf(root, "anthropic.claude-code-2.1.247-win32-x64"), "//x\n");
});

test("an unpatched copy is not written to at all", () => {
  const root = fakeExtensionsDir({ "anthropic.claude-code-2.1.247-win32-x64": { bundle: "//clean\n" } });
  const r = cleanUp(root);
  assert.deepEqual(r.restored, []);
  assert.equal(bundleOf(root, "anthropic.claude-code-2.1.247-win32-x64"), "//clean\n");
});

test("other people's extensions are none of our business", () => {
  const root = fakeExtensionsDir({
    "anthropic.claude-code-2.1.247-win32-x64": { bundle: applyTo("//x\n") },
    "someone.else-1.0.0": { bundle: applyTo("//theirs\n"), legacy: "//theirs\n" }
  });
  cleanUp(root);
  assert.equal(bundleOf(root, "someone.else-1.0.0"), applyTo("//theirs\n"));
  assert.equal(legacyExists(root, "someone.else-1.0.0"), true);
});

test("nothing there, nothing thrown - it must never crash on the way out", () => {
  assert.doesNotThrow(() => cleanUp(path.join(os.tmpdir(), "smartrtl-does-not-exist")));
  assert.doesNotThrow(() => cleanUp(fakeExtensionsDir({})));
});
