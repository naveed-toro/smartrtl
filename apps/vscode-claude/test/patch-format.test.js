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
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fmt = require("../src/patch-format.js");
const { BEGIN, stripPatch, readExpiry, stampExpiry, WINDOW_MS, REFRESH_BELOW_MS,
        TMP_SUFFIX, STALE_AFTER_MS, RENAME_TRIES, RENAME_WAIT_MS, tempFor, writeWhole } = fmt;

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


/* ------------------------------------------------------------------
   WRITING SOMEBODY ELSE'S FILE WHILE SOMEBODY ELSE IS WRITING IT

   Two VS Code windows are ordinary, and three are ordinary. Every one of them activates
   at the same moment when the editor starts, and again the moment this extension is
   updated - which is the one time a write is certain rather than skipped. They all used
   to write the SAME file beside the bundle, index.js.smartrtl-tmp: one process's clean-up
   deleting a file another was still writing, and one process's rename landing on a file
   another had renamed away. A rename refused that way - Windows does it while a handle is
   open - falls back to writing five megabytes IN PLACE, from two processes at once, which
   is the torn bundle this whole function exists to prevent. Its cost is not a missing fix;
   it is a Claude Code that will not start.
------------------------------------------------------------------ */

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-write-"));
const BUNDLE = "//bundle" + String.fromCharCode(10);
const MINE = BUNDLE + "/* ours */" + String.fromCharCode(10);
const longAgo = () => new Date(Date.now() - STALE_AFTER_MS - 60_000);

test("each process writes beside the bundle under a name of its own", () => {
  const file = path.join(scratch(), "index.js");
  assert.ok(tempFor(file).startsWith(file + TMP_SUFFIX), "still recognisable as ours");
  assert.ok(tempFor(file).endsWith("." + process.pid), "and no longer shared with every other window");
});

test("another window's temporary file is left alone while it may still be being written", () => {
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");
  // a second window, mid-write, a moment ago
  const theirs = file + TMP_SUFFIX + ".999999";
  fs.writeFileSync(theirs, "half of five megabytes", "utf8");

  writeWhole(fs, file, MINE);

  assert.equal(fs.existsSync(theirs), true, "we deleted a file another process was writing");
  assert.equal(fs.readFileSync(theirs, "utf8"), "half of five megabytes", "and we wrote over it");
  assert.match(fs.readFileSync(file, "utf8"), /ours/, "our own write still landed");
});

test("a temporary file left by a write that never finished is cleared up", () => {
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");
  // the machine lost power mid-write: nothing is ever coming back for this by itself
  const orphan = file + TMP_SUFFIX + ".999998";
  fs.writeFileSync(orphan, "five megabytes of ours in somebody else's folder", "utf8");
  fs.utimesSync(orphan, longAgo(), longAgo());

  writeWhole(fs, file, MINE);

  assert.equal(fs.existsSync(orphan), false, "it was left behind for ever");
  assert.deepEqual(fs.readdirSync(dir), ["index.js"], "and nothing else of ours is in the folder");
});

test("a file that merely starts the same way is not ours to delete", () => {
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");
  const notOurs = path.join(dir, "index.js.map");
  fs.writeFileSync(notOurs, "{}", "utf8");
  fs.utimesSync(notOurs, longAgo(), longAgo());

  writeWhole(fs, file, MINE);

  assert.equal(fs.existsSync(notOurs), true, "we deleted somebody else's file");
});

/* ------------------------------------------------------------------
   AND THE PROMISE THAT WAS NOT BEING KEPT

   The rename used to be allowed to fail back to writing in place. Put to three processes
   writing a five-megabyte file while a fourth read it: thirty-six renames out of
   thirty-six refused, every write done in place, and ten of the reader's reads caught the
   file half written - 2,596,864 bytes of 5,200,000. On Windows a rename over a file ANY
   process has open fails with EPERM, and the process certain to have this one open is the
   Claude Code panel loading it.

   So the two halves of that are asserted here: a held file is waited for rather than
   written over, and a file nobody can rename over at all still gets written.
------------------------------------------------------------------ */

test("a bundle somebody has open is left exactly as it is, and says so", () => {
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");
  const reader = fs.openSync(file, "r");            // a panel, loading it
  try {
    const wrote = writeWhole(fs, file, MINE);
    assert.equal(wrote, false, "it wrote underneath a reader instead of waiting");
    assert.equal(fs.readFileSync(file, "utf8"), BUNDLE, "the bundle was changed anyway");
  } finally { fs.closeSync(reader); }
  assert.deepEqual(fs.readdirSync(dir), ["index.js"], "and nothing of ours was left beside it");
});

test("a reader that lets go within the waiting gets the new bundle, whole", async () => {
  /* The reader has to be another PROCESS, and that is not a detail of the harness - it is
     the whole shape of the thing. The waiting is synchronous, because it happens in the
     middle of one write on the editor's own thread, so nothing inside this process can let
     go of anything while it runs. In the real case the reader is always somebody else: the
     panel loading the bundle. */
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");

  const holder = path.join(dir, "holder.js");
  fs.writeFileSync(holder, [
    'const fs = require("fs");',
    'const fd = fs.openSync(process.argv[2], "r");',
    'process.stdout.write("holding");',
    'setTimeout(() => { fs.closeSync(fd); process.exit(0); }, 150);'
  ].join(String.fromCharCode(10)), "utf8");

  const child = require("node:child_process").spawn(process.execPath, [holder, file],
    { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise((done) => child.stdout.once("data", done));

  const wrote = writeWhole(fs, file, MINE);
  assert.equal(wrote, true, "it gave up on a bundle that was let go of a moment later");
  assert.match(fs.readFileSync(file, "utf8"), /ours/);
  await new Promise((done) => child.once("exit", done));
});

test("waiting is bounded, so nothing can sit on the editor's thread", () => {
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");
  const reader = fs.openSync(file, "r");
  const began = Date.now();
  try { writeWhole(fs, file, MINE); } finally { fs.closeSync(reader); }
  const took = Date.now() - began;
  assert.ok(took < RENAME_TRIES * RENAME_WAIT_MS * 4,
    "waiting for a held bundle took " + took + "ms");
});

test("a filesystem that cannot rename at all is still written", () => {
  // EXDEV and the like never come right by waiting, so in place is the only road there is
  const dir = scratch();
  const file = path.join(dir, "index.js");
  fs.writeFileSync(file, BUNDLE, "utf8");
  const cannot = Object.create(fs);
  cannot.renameSync = () => { const e = new Error("cross-device link not permitted"); e.code = "EXDEV"; throw e; };
  assert.equal(writeWhole(cannot, file, MINE), true);
  assert.match(fs.readFileSync(file, "utf8"), /ours/);
  assert.deepEqual(fs.readdirSync(dir), ["index.js"]);
});
