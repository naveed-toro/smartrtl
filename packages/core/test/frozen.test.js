/**
 * The formula does not change by accident.
 *
 * `direction.test.js` next to this file holds the rule to its BEHAVIOUR - the five
 * headings, the scripts, the two modes. That is the right test and it is not enough, for
 * one reason: an edit that changes the rule and updates those cases to match is green.
 * That is not a hypothetical. It is what a code review of the extension, asked for
 * something else entirely, started doing on its own.
 *
 * So this file holds the two files to their BYTES. It cannot be satisfied by editing the
 * cases, and changing the rule stops being something that can happen quietly: the hash
 * below has to be edited too, by hand, in a file whose only purpose is this - which shows
 * up in a diff as exactly what it is.
 *
 * Line endings are normalised first. `.gitattributes` stores LF, but a checkout that was
 * configured differently must not turn this into a red test about nothing.
 *
 * Yes, this is a test that has to be edited to stay green, which docs.test.js argues
 * against. That argument is about values which legitimately change - how many sections a
 * document has. This file is supposed to never change. Here, "somebody had to edit it" is
 * not the flaw. It is the entire point.
 *
 * docs/decisions.md section 42 is why the rule is worth this.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Changed on purpose on 2026-09-17, by the owner's decision, for 0.6.0: the rule for an
// answer became openingLetters (45 letters). Section 42's first question - the answer only
// ever moves one way - still holds, and the five headings still read right to left; both
// are asserted in direction.test.js. docs/decisions.md section 50.
const FROZEN = {
  "src/direction.js":
    "8977154f0d7c1cbcd7ae948d0c691b4219f58217bf5b2e47fd7405ac02081c2f",
  "test/direction.test.js":
    "d93d47e185758a57b56fe2029bd8619055e732802fc248a97d5a38ac4556c1a5"
};

const ROOT = path.resolve(__dirname, "..");
const hash = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n"))
  .digest("hex");

test("the formula is exactly what it was, byte for byte", () => {
  for (const [file, expected] of Object.entries(FROZEN)) {
    const actual = hash(file);
    assert.equal(actual, expected, [
      "",
      "  packages/core/" + file + " has changed.",
      "",
      "  This file is frozen. If you are here in the middle of some other task - a review,",
      "  a cleanup, a refactor, a rename - then the change is the mistake and the fix is to",
      "  put the file back, not to update the hash.",
      "",
      "  The rule is frozen because its answer only ever moves one way, and that property -",
      "  not its accuracy - is what lets the engine decide from a half-written block while an",
      "  answer is still streaming. Deciding on sight costs 3 frames. Waiting was measured at",
      "  42. A formula that can revise itself cannot decide on sight, whatever else it gets",
      "  right. docs/decisions.md section 42 has the whole of it, and CLAUDE.md has it short.",
      "",
      "  If the change IS the work - deliberate, evidenced, its own commit - then update the",
      "  hash below and say in the commit message which of section 42's two questions it",
      "  answers:",
      "",
      "    " + file + ": " + actual,
      ""
    ].join("\n"));
  }
});

test("the frozen list still points at files that exist", () => {
  // A rename would otherwise pass this file silently by leaving nothing to hash.
  for (const file of Object.keys(FROZEN)) {
    assert.ok(fs.existsSync(path.join(ROOT, file)),
      "packages/core/" + file + " is named as frozen and is not there. A frozen file is " +
      "not renamed or moved as part of other work either.");
  }
});
