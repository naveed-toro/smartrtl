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
const { findTarget } = require("../src/find-target.js");

/* ------------------------------------------------------------------
   A DECLARATION, NOT A SUBSTRING.

   These two used to be written inline, as [^}]*(direction|unicode-bidi)\s*: - and that
   matches "flex-direction:column", which is in almost every rule Claude Code ships. So
   the diagnostic below fired on 2.1.268 and on 2.1.269 and on every build before them,
   announcing that Claude Code had started setting a direction on a sent message itself.
   It never had.

   That is worse than a harmless bug. The whole plan for surviving the next update rests
   on somebody READING the daily watch's report, and a line that appears every single day
   teaches the reader to skip it - so the day it is finally true, it will be skipped too.

   (?:[^}]*;)? is what makes it a declaration rather than a substring: the property has to
   come straight after the brace that opened the block, or after the semicolon that ended
   the declaration before it. A hyphen in front of it - flex-direction,
   background-position, -webkit-text-align - is then not a match, because a hyphen is
   neither of those two things.
------------------------------------------------------------------ */
const SETS_ON_THE_BOX =
  /(messageInput|mentionMirror)_[^{}]*\{(?:[^}]*;)?\s*(direction|unicode-bidi|text-align)\s*:[^;}]*!important/;
const SETS_ON_A_SENT_MESSAGE =
  /(expandableContainer|content)_[^{}]*\{(?:[^}]*;)?\s*(direction|unicode-bidi)\s*:/;

test("the instrument reads a declaration, not a substring of one", () => {
  // No Claude Code needed, and that is the point. This is the one test in this file that
  // checks the file itself, so it has to run on every machine and in every CI job - the
  // rest of them skip where Claude Code is not installed, which is where CI started.
  const onlyFlex = ".content_xx{display:flex;flex-direction:column;gap:4px}" +
                   ".messageInput_xx{flex-direction:row!important;background-position:left}";
  assert.equal(SETS_ON_A_SENT_MESSAGE.test(onlyFlex), false, "flex-direction was read as direction");
  assert.equal(SETS_ON_THE_BOX.test(onlyFlex), false, "flex-direction was read as direction");

  // ...and it still sees the real thing: first in a block, and after another declaration
  assert.ok(SETS_ON_A_SENT_MESSAGE.test(".content_xx{direction:rtl}"));
  assert.ok(SETS_ON_A_SENT_MESSAGE.test(".content_xx{display:flex;unicode-bidi:plaintext}"));
  assert.ok(SETS_ON_THE_BOX.test(".messageInput_xx{color:red;direction:ltr!important}"));
  assert.ok(SETS_ON_THE_BOX.test(".mentionMirror_xx{text-align:left !important}"));
});

const skip = real.installed ? false : "Claude Code is not installed in this editor";
const WEBVIEW = real.installed ? path.dirname(real.installed.css) : null;
const HOME = WEBVIEW ? path.dirname(WEBVIEW) : null;
const read = (f) => fs.readFileSync(f, "utf8");
const bundle = () => read(path.join(WEBVIEW, "index.js"));

test("the panel's own file is still reachable, and road one is still the right road", { skip }, (t) => {
  // Not "webview/index.js exists" any more. There are three roads to that file since
  // 0.5.5, and losing the first one is a line in the report rather than a breakage - the
  // same way losing one of the five roads to the box you type into is.
  const hit = findTarget(HOME);
  assert.ok(hit, "no road reaches the file Claude Code's panel loads: the fix has nowhere to go");
  if (hit.road !== "webview/index.js") {
    t.diagnostic("webview/index.js is gone; the panel's file is now found by " + hit.road);
  }

  const main = JSON.parse(read(path.join(HOME, "package.json"))).main || "./extension.js";
  const host = read(path.join(HOME, main));
  /* And the one way three roads can be WORSE than one: webview/index.js still sitting
     there while the panel has moved on to some other file. Road one is taken on sight,
     because it is a single stat call where reading the host is 3.4MB - so nothing at
     runtime would ever notice, and the fix would be written into a file nobody loads
     while the status bar went on saying "on". This is the day that has to be caught
     here, so it is an assertion and not a note. */
  if (fs.existsSync(path.join(WEBVIEW, "index.js"))) {
    assert.match(host, /"webview"\s*,\s*"index\.js"/,
      "webview/index.js is still there, but Claude Code no longer loads it - road one would take it every time and the patch would go where nothing reads it");
  }
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

test("the box you type in is still what it has been since 2.0.50", { skip }, (t) => {
  // Four things the box has said about itself in every build from 2.0.50 to 2.1.268,
  // through minified class names and a second layer appearing over it. Each is a road to
  // the box on its own; losing some is a line in the report, losing all of them is not.
  const s = bundle();
  const roads = {
    role: 'role:"textbox"',
    label: '"aria-label":"Message input"',
    multiline: '"aria-multiline":"true"',
    placeholder: '"data-placeholder":'
  };
  const left = Object.keys(roads).filter((k) => s.includes(roads[k]));
  for (const k of Object.keys(roads)) {
    if (!left.includes(k)) t.diagnostic(k + " is gone from the box; " + (left.join(", ") || "nothing") + " still finds it");
  }
  assert.ok(left.length > 0, "none of the four things the box has always been is left - only its class name finds it now");
});

test("Claude Code does not set the box's direction with !important, or from a cascade layer", { skip }, (t) => {
  // Not a failure either way: the box's rules sit in a layer declared before any of the
  // page's, and win over both. But either one is Claude Code starting to decide the box's
  // direction itself - which is the day to look at __bidiStatus(), and at whether it is
  // still needed at all.
  const css = read(real.installed.css);
  if (SETS_ON_THE_BOX.test(css)) {
    t.diagnostic("the box's own rules now set direction, unicode-bidi or text-align with !important");
  }
  if (/@layer\b/.test(css)) t.diagnostic("Claude Code's stylesheet now uses cascade layers");
  assert.ok(true);
});

test("a sent message can still be reached - by name, and by the run its text is handed to", { skip }, (t) => {
  // Two roads to a sent message, and either is enough: the class of the container its text
  // is in (every build from 2.1.30), and dir="auto" on the run the text sits in (from
  // 2.1.220). A build with neither has sent messages this fix cannot see at all.
  const s = bundle();
  const byName = /[{,]expandableContainer:"expandableContainer_/.test(s) && /[{,]content:"content_/.test(s);
  const byRun = s.includes('dir:"auto"');
  if (!byName) t.diagnostic("the sent message's container is no longer named expandableContainer/content; dir=\"auto\" still finds it");
  if (!byRun) t.diagnostic("a sent message's text is no longer handed to dir=\"auto\"; its class name still finds it");
  assert.ok(byName || byRun, "neither road to a sent message is left - sent messages will not turn");
});

test("the heading above a sent message is still kept from deciding anything", { skip }, (t) => {
  // It is skipped by name, and separately because it is drawn one pixel square - either is
  // enough. And a message's own row is bounded by name, and by data-transcript-message.
  const s = bundle();
  if (!s.includes("screenReaderTurnHeading")) t.diagnostic("the heading above a sent message is no longer named; it is still skipped because nobody can see it");
  if (!s.includes('"data-transcript-message"')) t.diagnostic("data-transcript-message is gone; a message's row is bounded by its class name alone");
  const css = read(real.installed.css);
  if (SETS_ON_A_SENT_MESSAGE.test(css)) {
    t.diagnostic("Claude Code now sets a direction on a sent message itself - the layered rules still win; check __bidiStatus()");
  }
  assert.ok(true);
});

test("a sent message's text is still handed to dir=\"auto\"", { skip }, (t) => {
  const n = (bundle().match(/dir:"auto"/g) || []).length;
  if (n === 0) t.diagnostic("dir=\"auto\" is gone; sent messages now rest on the class names alone");
  assert.ok(n <= 3, `dir="auto" appears ${n} times - it used to be once, on a sent message; check what else it now marks`);
});

test("a message that heads a turn is still pinned, and the trap under it still reachable by both roads", { skip }, (t) => {
  // Claude Code's own bug, not a right-to-left one. What the fix for it rests on, read out of
  // the build: the row is sticky; an opened message has a collapse row as a direct child of
  // its box; a message taken for a command is drawn with no box at all. None of these is a
  // failure when it changes - each is the morning to look at __bidiStatus().unpinExpandedMessage.
  const s = bundle(), css = read(real.installed.css);
  const sticky = /\.stickyHeader_[A-Za-z0-9_-]+\{[^}]*position:sticky/.test(css);
  if (!sticky) t.diagnostic("a message that heads a turn is no longer position: sticky - the fix should report \"not needed\" and have come back out");
  if (!/[{,]stickyHeader:"stickyHeader_/.test(s)) t.diagnostic("stickyHeader is renamed; pinned rows are found by data-transcript-message and dir=\"auto\"");
  if (!s.includes('"data-transcript-message"')) t.diagnostic("data-transcript-message is gone; pinned rows rest on their class name and dir=\"auto\"");
  if (!/maxHeight:60\}/.test(s)) t.diagnostic("a user message no longer collapses at 60px - check that a collapsed one is still told apart");
  if (/isSlashCommand\)return [A-Za-z0-9_$]+\("div",\{className:`\$\{[A-Za-z0-9_$]+\.userMessage\} \$\{[A-Za-z0-9_$]+\.slashCommandMessage\}`/.test(s)) {
    t.diagnostic("a message taken for a command is still drawn with no collapsed state - measured and let go of when it is taller than half the panel");
  } else {
    t.diagnostic("a message taken for a command is no longer drawn bare - Claude Code may have given it a collapsed state of its own");
  }
  // and the fix for their bug, landing in their own stylesheet: a height cap on the opened
  // message, or pinning dropped while it is open
  if (/\.stickyHeader_[A-Za-z0-9_-]+:has\([^)]*\)\{[^}]*position:(static|relative)/.test(css)) {
    t.diagnostic("Claude Code now unpins a message itself in some state - the fix may no longer be needed");
  }
  assert.ok(true);
});

test("the stylesheet's first road is still open - and if it is not, the second one is taken", { skip }, (t) => {
  const main = JSON.parse(read(path.join(HOME, "package.json"))).main || "./extension.js";
  const host = read(path.join(HOME, main));
  const open = /style-src[^;"`]*'unsafe-inline'/.test(host);
  // not a failure either way: the engine falls back to adoptedStyleSheets by itself
  if (!open) t.diagnostic("style-src no longer allows 'unsafe-inline'; the rules now arrive as an adopted stylesheet");
  assert.ok(true);
});
