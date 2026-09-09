/**
 * The documents, checked rather than hoped for.
 *
 * A document that has gone stale reads exactly like one that has not - which is how
 * "fifteen sections" survived in a README that had grown to twenty-nine, and how a list
 * of test files came to name one that had been renamed and miss four that existed.
 *
 * So every claim a document makes that can be put back to the thing it is about, is.
 * Not the prose - nobody can test whether an explanation is any good - but the numbers,
 * the file names, the links, and the promises made about what the payload contains.
 *
 * The one thing here that is not a fact-check is the last test. The instructions for
 * turning the fix off before uninstalling are the single most important paragraph in the
 * app README, because they are the only thing standing between somebody and a patch left
 * behind in a file they do not know about. They are pinned, and pinned deliberately: this
 * fails if they are softened, moved or edited away.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const DOCS = [
  "README.md",
  "apps/vscode-claude/README.md",
  "docs/decisions.md",
  "docs/versions.md",
  "docs/roadmap.md",
  "docs/claude-code-bug.md",
  "docs/launch-note.md",
  "docs/issue-to-file.md"
];

test("every relative link in every document resolves", () => {
  const broken = [];
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (!target) continue;
      const abs = path.resolve(path.dirname(path.join(ROOT, doc)), target);
      if (!fs.existsSync(abs)) broken.push(doc + " -> " + m[1]);
    }
  }
  assert.deepEqual(broken, []);
});

test("every test file a document names actually exists", () => {
  const real = new Set(fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js")));
  const missing = [];
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(/([a-z-]+\.test\.js)/g)) {
      if (!real.has(m[1])) missing.push(doc + " names " + m[1]);
    }
  }
  assert.deepEqual(missing, []);
});

test("the counts the documents quote are the counts that are true", () => {
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen", "twenty"];
  const inWords = (n) => n <= 20 ? WORDS[n]
    : ["twenty", "thirty", "forty", "fifty"][Math.floor(n / 10) - 2] +
      (n % 10 ? "-" + WORDS[n % 10] : "");
  const counts = new Set();
  for (let n = 1; n <= 59; n++) counts.add(inWords(n));

  // How many sections decisions.md has is not written down here either - it is counted,
  // and every document that quotes a number has to quote that one. A test that must be
  // edited to stay green is not a test.
  const decisions = read("docs/decisions.md");
  const numbered = (decisions.match(/^## \d+\./gm) || []).length;
  assert.ok(numbered > 0, "decisions.md has no numbered sections at all");
  for (const doc of DOCS) {
    const body = read(doc);
    // only a COUNT written in words - "in sections 25 to 28" is prose, not a claim
    for (const m of body.matchAll(/\b([A-Za-z]+(?:-[a-z]+)?) sections\b/g)) {
      const said = m[1].toLowerCase();
      if (!counts.has(said)) continue;
      assert.equal(said, inWords(numbered),
        doc + ' says "' + m[1] + ' sections" and there are ' + numbered);
    }
  }

  // versions.md counts the builds in its own title, in words. Read the number back out
  // rather than hard-coding it.
  const builds = fs.readdirSync(path.join(ROOT, "apps/vscode-claude"))
    .filter((f) => f.endsWith(".vsix")).length;
  if (builds) {
    assert.match(read("docs/versions.md"), new RegExp("^# The " + inWords(builds) + " builds", "m"),
      "there are " + builds + " builds on disk, so versions.md should say " +
      "\"The " + inWords(builds) + " builds\"");
  }
});

test("the big table in versions.md has the same number of columns all the way down", () => {
  // it is edited a column at a time, by hand and by script, and a row that has drifted
  // one cell wide renders as a table that is quietly wrong about which build did what.
  const lines = read("docs/versions.md").split(String.fromCharCode(10));
  const head = lines.findIndex((l) => l.startsWith("| | 0.1.0-4 |"));
  assert.ok(head > -1, "the builds table has gone");
  const width = lines[head].split("|").slice(1, -1).length;
  const wrong = [];
  for (let i = head; i < lines.length && lines[i].startsWith("|"); i++) {
    const n = lines[i].split("|").slice(1, -1).length;
    if (n !== width) wrong.push("line " + (i + 1) + " has " + n + ", the header has " + width);
  }
  assert.deepEqual(wrong, []);
});

test("the newest version is the one the documents describe", () => {
  const version = JSON.parse(read("apps/vscode-claude/package.json")).version;
  assert.match(read("docs/versions.md"), new RegExp("### " + version.replace(/\./g, "\\.")),
    "versions.md has no entry for " + version);
  assert.ok(read("README.md").includes(version),
    "the root README does not mention " + version);
});

test("what the documents promise the payload contains, it contains", () => {
  const payload = read("apps/vscode-claude/dist/payload.js");
  const promised = {
    "__bidiStatus": true,     // the app README tells people to run it
    "__bidiFixOff": true,     // so does every document here
    "faultIsStillHere": true, // "needed is measured, not read"
    "readingPosition": true,  // closing gives back the reader's line
    // and the three the documents say are NOT there any more, each of which shipped once
    "smart-rtl-input-line": false,
    "smart-rtl-mirror": false,
    "undoStack": false
  };
  for (const [marker, shouldBe] of Object.entries(promised)) {
    assert.equal(payload.includes(marker), shouldBe,
      shouldBe ? marker + " is promised and missing" : marker + " was withdrawn and is back");
  }
});

test("the adapter keys the roadmap lists are the ones the engine reads", () => {
  const roadmap = read("docs/roadmap.md");
  const engine = read("packages/dom/src/engine.js");
  for (const key of ["blocks", "boxSelector", "boundary", "perLine", "composer",
                     "extraCss", "onDecision", "onCleanup", "quietMs", "maxBox"]) {
    assert.ok(roadmap.includes("`" + key + "`"), "the roadmap does not list " + key);
    assert.ok(new RegExp("(cfg|config)\\." + key + "\\b").test(engine),
      "the roadmap lists " + key + " and the engine never reads it");
  }
});

test("the instructions for turning it off before uninstalling are still there, word for word", () => {
  // Pinned on purpose. This is the only thing standing between somebody and a patch left
  // in a file they do not know about, and it is the one paragraph in this repository
  // that is not to be tidied, shortened or moved without deciding to.
  const readme = read("apps/vscode-claude/README.md");
  const pinned = [
    "⚠ Uninstalling does not turn this off",
    "Turn the right-to-left fix off",
    "Then uninstall or disable as normal. Forgot? It stops working by itself within a day.",
    "SmartRTL: Remove the right-to-left fix",
    "smart-rtl-direction patch BEGIN"
  ];
  for (const line of pinned) {
    assert.ok(readme.includes(line), "the uninstall guidance has lost: " + line);
  }
  assert.ok(readme.indexOf("⚠ Uninstalling does not turn this off") < 400,
    "the warning has been pushed down the page - it has to be the first thing read");
});
