# The thirty-five builds, and what each one actually contained

Compiled by opening every `.vsix` and reading what is inside it, not from memory. The
second table was rebuilt the same way after the fact, which is why some of its rows say
plainly that nothing changed in a build.

**A tick means "this statement is true"** - including the statements about what a build got
wrong. Everything is ticked to my best evidence; untick anything that does not hold when
you try it yourself.

Where the evidence came from is marked, so you know which ticks to distrust first:

- **(live)** — seen on your machine, in Claude Code
- **(lab)** — the build's own code run against a throwaway Claude Code
- **(code)** — read out of the packaged `.vsix`
- **(unseen)** — believed from the code, never watched running

---

## What was in each build

| | 0.0.1 | 0.0.2 | 0.0.3 | 0.0.4 | 0.0.5 | 0.0.6 | 0.0.7 | 0.0.8 | 0.0.9 |
|---|---|---|---|---|---|---|---|---|---|
| answers read right-to-left | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| your own messages read right-to-left | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| collapse row forced sticky | ~ | – | – | – | – | – | – | – | – |
| expanded message capped at 60vh | – | ~ | – | – | – | – | – | – | – |
| expanded message unpinned | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| view stays put when opening/closing | – | – | – | – | – | ✓ | ✓ | ✓ | ✓ |
| `deactivate()` removes the patch | – | – | ~ | – | – | – | – | – | – |
| keeps a 5MB backup copy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – |
| removal by truncation, nothing kept | – | – | – | – | – | – | ✓ | ✓ | ✓ |
| `vscode:uninstall` hook | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| block expires on its own | – | – | – | – | – | – | – | ✓ | ✓ |
| **loads at all** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |

`~` = it was in the build, and later shown to be the wrong idea.

---

## Version by version

### 0.0.1 — first installable build
Answers only. It also forced the collapse row to `position: sticky` to keep "Show less" on
screen.

- [x] an answer that begins with an English word reads right-to-left **(live)**
- [x] code blocks and pure-English lines are left alone **(live)**
- [x] **failed:** your own messages are not touched at all **(live, and confirmed in the code)**
- [x] **failed:** the "Show less" button moves from where the extension puts it **(live)**

### 0.0.2 — your own messages, and a height cap
Found by reading Claude Code's bundle: a user message is not markdown, it renders as a bare
`<span dir="auto">`. The sticky row was removed; the expanded message was capped at 60vh
with its own scrollbar instead.

- [x] the button is no longer moved **(live)**
- [x] **failed:** the user-message text still hugged the left in the live test. The same code
      works in later builds and the cause was never isolated - most likely the webview had
      not reloaded onto the new payload **(live)**
- [x] **failed as an idea:** capping the height. How much of a window a message may take is
      not ours to decide, and the answer differs on a laptop and an external display **(live)**

### 0.0.3 — unpinning, and the build that broke itself
The cap was dropped. The real cause was found: a message that heads a turn is
`position: sticky`, so expanded it covers the panel and its own button can never be reached.
It also tried to clean up on `deactivate()`.

- [x] an expanded message stops being pinned **(code)**
- [x] **failed badly:** `deactivate()` also fires on every reload. Install → apply → "Reload"
      → deactivate wipes the patch → reload → apply → "Reload"… for ever, and the fix never
      appears **(live)**
- [x] **do not install this build**

### 0.0.4 — the same, with that mistake reverted
Identical to 0.0.3 minus the `deactivate()` cleanup.

- [x] the reload prompt appears once and then stops **(unseen)**
- [x] an expanded message scrolls instead of covering the panel **(unseen)**
- [x] **still missing:** opened from halfway down, the message jumps far up the conversation
      **(code — this is what 0.0.6 fixed)**

### 0.0.5 — the uninstall hook
Adds the `vscode:uninstall` npm hook, the only hook VS Code offers that means "we are
leaving".

- [x] the hook is present and correctly declared **(code — checked inside the packaged manifest)**
- [x] **failed:** uninstalled, nothing was cleaned. The hook has been broken in VS Code since
      1.69 — [microsoft/vscode#155561](https://github.com/microsoft/vscode/issues/155561),
      still open **(live)**

### 0.0.6 — the view follows the message
Unpinning alone was half a fix: a collapsed message is pinned so you can see it from
anywhere, and opening it dropped it back to where it really lives. Now its top returns to
the exact pixel it was on.

- [x] opening from the top works **(live, via F5)**
- [x] opening from halfway down works **(live, via F5)**
- [x] opening from the bottom works **(live, via F5)**
- [x] closing leaves the view where it was **(live, via F5)**
- [x] a collapsed message is still pinned, as it should be **(unseen)**

### 0.0.7 — nothing kept behind
The 5MB backup copy is gone. The original is everything before the marker, so removal is a
truncation.

- [x] open and close work from any scroll position **(live)**
- [x] the text inside the box reads by the rule **(live — "close to what we wanted")**
- [x] apply then remove returns Claude Code byte for byte **(live, verified by SHA)**
- [x] a patch written by an older build is still restored from the copy that build kept **(lab)**
- [x] **still failed:** uninstalling still leaves the block, because the hook still does not
      fire **(live)**

### 0.0.8 — broken. Do not install.
Meant to add the self-expiring block. A `require` line was missing from `patcher.js`, so the
module throws the moment it is loaded and the extension cannot activate at all.

- [x] **the extension does not load** — `ReferenceError: stripPatch is not defined` **(lab)**
- [x] no test caught it, because `patcher.js` was the one file with no test - it imports
      `vscode` and so could not be loaded outside the editor **(code)**
- [x] **use 0.0.9 instead**

### 0.0.9 — 0.0.8, fixed, and the gap that let it through closed
Same features. A stub `vscode` module now lets `patcher.js` be tested outside the editor,
and six tests cover it - the first of which is simply that it loads.

- [x] it loads **(lab)**
- [x] apply then remove returns the original byte for byte **(lab)**
- [x] applying twice leaves one block and does not rewrite for nothing **(lab)**
- [x] a stale block is re-stamped without asking anyone to reload **(lab)**
- [x] an older build's patch and its 5MB copy are both taken over cleanly **(lab)**
- [x] with no Claude Code installed it reports that instead of throwing **(lab)**
- [ ] everything 0.0.7 did, still working **(unseen — this is the one to try)**
- [ ] after uninstalling, the effect is gone by the next day on its own **(unseen)**
- [x] **known:** that expiry is bounded, not instant. Instant still needs the Remove command

---

## What was in each build, 0.1.0 onwards

Read out of the packaged `.vsix` the same way, months later. `·` means the build carried
it; a blank means it did not.

| | 0.1.0-4 | 0.1.5 | 0.1.6-7 | 0.2.0 | 0.3.0 | 0.3.1 | 0.3.2 | 0.3.3 | 0.3.4 | 0.4.0 | 0.4.1 | 0.4.2 | 0.4.3 | 0.4.4 | 0.4.5 | 0.4.6 | 0.4.7 | 0.4.8 | 0.4.9 | 0.4.10 | 0.4.11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| answers read right-to-left | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| your own messages read right-to-left | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| a sent message decided line by line | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| ... **as a copy, moving nothing of theirs** | | | | | | | | | | | | | · | · | · | · | · | · | · | · | · | · |
| the composer takes one direction | · | · | · | · | · | | | | · | · | · | · | · | · | · | · | · | · | · | · | · |
| the composer decided **per line** | | | | | · | | | · | | | | | | | | | | | | | |
| ... by `unicode-bidi: plaintext` | | | | | | · | · | | | | | | | | | | | | | | |
| ... with a third, "mixed" state | | | | | | | · | | | | | | | | | | | | | | |
| a clone of React's mirror | | | | | | | | · | | | | | | | | | | | | | |
| its own undo stack | | | | | · | | | · | | | | | | | | | | | | | |
| the timeline dot | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| an expanded message unpinned | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| the view follows the message | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **closing gives back the reader's line** | | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · |
| the block expires on its own | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **a fault stops where it happens** | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · |
| **a fuse box, and `__bidiStatus()`** | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · |
| **stands down if Claude Code fixes it** | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · |
| **crashed the panel** | | | | | **✗** | | | | | | | | | | | | | | | | |
| **typed blank spaces** | | | | | **✗** | | | | | | | | | | | | | | | | |
| **every keystroke one late** | | | | | | | | **✗** | | | | | | | | | | | | | |
| payload, bytes | 28,975 | 30,998 | 31,371 | 35,485 | 59,047 | 51,513 | 54,185 | 71,979 | 51,754 | 66,147 | 69,798 | 70,554 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 |

The byte count is worth reading as a line of its own. It climbs while the composer is
being fought over — 35K to 59K to 72K — and comes back down to 51K when that was given
up. Everything after that is resilience, and it costs 18K.

---

## Version by version, 0.1.0 onwards

### 0.1.0 – 0.1.4 — five builds, one payload
Byte-identical payloads, and `extension.js` changed twice across the five. These are
rebuilds made while testing on a live editor: a version number is how one build is told
apart from another when both are installed the same way. Nothing about the fix itself
changed.

- [x] identical payload in all five **(code)**
- [x] `extension.js` differs at 0.1.2 and again at 0.1.3 - the on/off switch **(code)**

### 0.1.5 — the text is aligned, not merely reordered
The rule had been setting `direction` and nothing else. A host that writes
`text-align: left` on a container beats direction outright: the words come out in the
right order and every line still hugs the left edge. `text-align: start` was added, which
follows whatever direction was just decided rather than naming a side.

- [x] an Urdu line starts at the right edge, not merely reads right to left **(live)**
- [x] a table header stays centred - `th` is excluded, because centre is centre either
      way and overriding it was restyling somebody's table **(lab)**

### 0.1.6 – 0.1.7 — closing a message from inside it must not hide it
"Put it back on the exact pixel" is only right while the message WAS somewhere you could
see. Read to the end of an expanded message and its head is far above the panel;
restoring that pixel faithfully put the message you were reading back off the top of the
screen. The target is now clamped to the visible band.

- [x] closing from deep inside a long message brings it back into view **(live)**
- [x] closing one you can see does not move it **(lab)**

### 0.2.0 — a sent message decided line by line
A typed message is one element with newlines in it, so a single decision governed all of
it: paste a command, press shift+enter, write Urdu under it, and the command was dragged
round with the Urdu. Its lines are now split into elements of their own, and each decides
by the formula.

- [x] an English line inside an Urdu message is left alone **(live)**
- [x] copying the message back gives the original text, newlines included **(lab)**
- [x] a mention chip is moved, not rebuilt, so it keeps what the host attached **(lab)**

### 0.3.0 — the composer per line. **Broken. Do not install.**
The same idea taken into the box you type in: an element per line, made inside the
`mentionMirror`. That mirror is React's, and the spans threw React's own text node away.

- [x] **failed:** the box typed **blank spaces** - React went on writing every keystroke
      into a node no longer in the page **(live)**
- [x] **failed:** React's next `removeChild` threw inside its commit phase and **took the
      whole panel down** **(live)**
- [x] six tests were green. The modelled mirror kept no reference to anything it created,
      so the one contract the real page enforces did not exist in the model **(lab)**
- [x] **failed, and only found later:** its inline isolates ordered a line right to left
      and left it hugging the left edge. It never aligned anything **(lab)**

### 0.3.1 — no elements at all
The crash removed by removing its cause: `unicode-bidi: plaintext` on both layers gives
per-line direction with nothing of ours in anybody's DOM.

- [x] the crash is gone, and so are the blank spaces **(live)**
- [x] **failed:** `plaintext` is the browser's rule - first strong character - so
      `Hello ہیلو` came back left to right, which is the fault this project exists for **(live)**

### 0.3.2 — three states instead of two
A draft that is one language throughout turns as a whole, by the project's rule; only a
draft holding both languages is handed to the browser line by line.

- [x] `Hello ہیلو` reads right to left again **(live)**
- [x] **failed:** adding an English line underneath put the whole box into per-line, and
      the Urdu line already on the screen **silently swung back to the left**. A line
      somebody has finished writing is finished **(live)**

### 0.3.3 — elements again, in the half nobody owns
React renders no children into the box you type in, so its contents are the browser's and
ours. React's mirror was left untouched and a clone of it drawn instead.

- [x] the rule is right on every line, and a decided line stays decided **(lab)**
- [x] **failed:** every keystroke reached the screen **one keystroke late** - type a
      letter, see nothing; type the next, see the first **(live)**
- [x] **failed:** 18ms of work per character on an eighty-line draft, more than a whole
      frame at 60fps **(lab)**

### 0.3.4 — the composer takes one direction, and that is the answer
Three attempts, three faults, each found by a person typing. The box now takes ONE
direction, live, from any RTL letter in it: one attribute, one CSS rule, nothing of ours
inside either layer, and no code of ours running while anybody types.

- [x] typing feels exactly as it does without the extension **(live)**
- [x] undo, IME, dictation and spellcheck are the browser's again **(lab)**
- [x] **given up on purpose:** a draft mixing two languages goes right to left as a whole
      while it is being typed. Written down as a passing test, not a wish **(lab)**

### 0.4.0 — a string of lamps, not a circuit in series
Nothing new on the screen. Everything about what happens when Claude Code changes:
a fault now stops at the block it happened in, every feature is switched on separately
and reports itself, and anything that Claude Code fixes itself is stood down rather than
argued with.

- [x] one block that throws no longer takes the rest of the batch with it **(lab)**
- [x] `__bidiStatus()` in the webview console says what is on and what is not **(live)**
- [x] a build that reads a mixed line correctly gets nothing installed at all **(lab)**
- [x] **found by booting the real 5MB bundle, not by any test:** the stand-down check
      asked itself for ever and hung the panel. Fixed, and now has a test **(lab)**

### 0.4.1 — closing a message gives back the line you were reading
The half of the long-message fix that was still missing. A collapsed message is sticky
again the moment it closes, so its top IS the panel's top whatever the scroll position -
the drift measured against it is zero, nothing is scrolled, and somebody halfway down a
long answer got the answer back from its beginning.

- [x] open a question from partway down a long answer, close it, and land on the line you
      were reading **(live)**
- [x] the same after reading to the very end of the message first **(lab)**
- [x] anchoring to the turn was tried: its top came back to the pixel and the reader still
      landed 20px out, because the message's own collapsed height had changed. The anchor
      has to be an element BELOW the message **(lab)**

### 0.4.2 — the same code, and the documents that describe it
No behaviour change of any kind. With comments and whitespace stripped the payload is
byte-identical to 0.4.1 - 21,206 bytes of code either way. What changed is the engine's
own configuration comment, which had lost two keys that ship and a `@returns` that
predated `status()`, and which the roadmap copies from.

It exists because of a rule worth keeping: **what is installed should be what is
committed.** 0.4.1 was packaged before that comment was corrected, so the installed build
and the repository had drifted - by nothing that runs, which is exactly the kind of drift
that is easy to let stand and then impossible to reason about later.

- [x] code identical to 0.4.1 with comments removed **(code)**
- [x] every document now checked by a test rather than by hand **(lab)**

### 0.4.3 — a sent message is copied beside the host's, never taken out of it
The last place in this project that moved a node somebody else created, and the same
fault that crashed the panel in 0.3.0 - in a neighbourhood where nobody had been hurt by
it yet, because a sent message never changes and React therefore never came back for
those nodes.

It was fixed now rather than someday because the browser is the next surface, and the
browser already has the button: Gemini puts a pencil beside every message you have sent.

Nothing of the host's is moved, removed or replaced. A copy is built beside their span,
their span is hidden by a CSS rule, and the copy is what a reader sees. A cloned mention
chip hands its click back to the original. If the host rewrites the message, the copy is
rebuilt and the lines are decided again - because not crashing is not the same as
working.

- [x] React's own nodes are still its own children — was false, false, false **(lab)**
- [x] the host rewriting its own message throws nothing — was NotFoundError **(lab)**
- [x] and what a reader sees becomes the new text, decided again **(lab)**
- [x] height, width, position and scrollHeight identical to the pixel, on their own
      stylesheet **(lab)**
- [x] selecting the message and copying gives exactly what was typed **(lab)**
- [x] clicking a mention in a message still opens the file **(lab)**
- [x] **known:** the message's text is now in the DOM twice, so anything reading
      textContent would get it doubled. Nothing reads it - checked every `getText:` in
      their bundle - and the build this replaces mangled that text anyway **(code)**
- [ ] a week of ordinary use **(unseen — this is the one to try)**

### 0.4.4 — an icon
Nothing in the payload changed: byte for byte the same 75,495 as 0.4.3. Until now the
extension showed VS Code's default box in a list of fifty other extensions, which is the
one place somebody decides whether a thing looks looked-after before trying it.

Four lines, right-aligned, with the ragged edge on the left - the shape everybody
already has as the "align right" button, which is why it needs no explaining. Chosen by
rendering four candidates at 128, 48 and 32 on both a dark and a light ground and
looking at them, which is how three ideas that worked at 128 were found to turn to mush
at 32: a two-tone line smudged, a second colour read as a stray bullet, and an arrow
said "back" rather than "right to left".

- [x] the source is icon.svg; icon.png is generated from it by build/render-icon.js **(code)**
- [x] rendered by the browser already here for the tests - no image toolchain added **(code)**
- [x] icon.svg and the preview sheet are kept out of the package **(code)**
- [x] deliberately not in Claude's own colour: this is a companion, not their product

### 0.4.5 — the status bar stops overstating itself

Nothing in the payload again: 75,495 bytes for the third build running. All of this is
in the extension host, and all of it came out of one question - what should the thing in
the corner look like.

- [x] `$(whole-word)` is gone. That glyph is Find's **Match Whole Word** toggle, so it
      already meant something else to anyone who uses Ctrl+F **(code)**
- [x] `✓ RTL` and `⊘ RTL`: the name identifies, the mark reports. Chosen by rendering
      both at the real 12px on the real theme colours and blurring them to what the
      corner of an eye gets - the words disappear, the marks do not **(code)**
- [x] `accessibilityInformation` carries the sentence a screen reader cannot see **(code)**
- [x] five different situations were all saying "off"; each now says which one it is,
      in the tooltip - including "Claude Code is not installed", which used to be a
      click that led nowhere **(code)**
- [x] and the one that mattered: **an expired block was being reported as the fix being
      on.** Nothing wound the clock inside a window that stayed open, so a day and a
      half of ordinary work let it run out under a tick **(code)**
- [x] `STAMP_EVERY_MS` (6h) winds it; `patcher.state()` separates *present* from *live*
      as the backstop **(code)**
- [x] `isPatched()` was reading five megabytes on every tab change to find a marker in
      the last few kilobytes. It reads the final 512KB **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Written up in [decisions.md section 31](decisions.md).

### 0.4.6 — the words come back, and the tooltips go

0.4.5 held for one afternoon. Two of its three decisions were wrong in the same way:
both moved something a person reads out of the place they read it.

- [x] `✓ RTL on` and `⊘ RTL off` — the words are back. The blur test was sound and its
      conclusion was not: a blur is the half-second nobody is asking, and the moment
      the words matter is the opposite one, when somebody has turned their head to the
      corner of the screen on purpose. **The mark is for the glance, the word is for
      the look** **(code)**
- [x] five tooltips became three lines, none over eighty characters and none with a
      paragraph in it. A rare mark had been traded for a permanent wall of text, which
      is a worse trade than the one it was avoiding **(code)**
- [x] the split that survives: clicking puts it right in four of the five situations,
      so they share a line; the fifth cannot be clicked out of and no longer pretends
      it can **(code)**
- [x] `$(whole-word)` stays gone, and `accessibilityInformation` stays **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload again untouched: 75,495 for the fourth build running.

### 0.4.7 — the tooltip stops being prose

Third attempt at the same three inches of screen, and the first one that is not writing.

- [x] `Turn off right-to-left fix` / `Turn on right-to-left fix` / `Claude Code not
      installed` — what the click does, and nothing else. The state is on the bar
      beside it, so repeating it was a second copy of something already visible **(code)**
- [x] the test now enforces labels, not sentences: 32 characters, no full stop, no
      line breaks **(code)**
- [x] the Uninstall warning moved to where somebody is actually uninstalling — it was
      already in the Extensions context menu, the README, the first reload prompt and
      the status command **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the fifth build running: 75,495.

### 0.4.8 — the second line

0.4.7 threw out the Uninstall warning along with the prose it was buried in. The prose
was the problem; the warning was not.

- [x] the tooltip is two lines in the one state where the second is true: the action,
      then `Uninstall does not turn it off` **(code)**
- [x] on its own line, not tacked onto the first — two ideas sharing a line is how a
      label turns back into a sentence, which is what 0.4.6 got wrong **(code)**
- [x] nothing in the off state: there is no fix left running to warn about **(code)**
- [x] the test measures each line, not the whole string **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the sixth build running: 75,495.

### 0.4.9 — thirteen messages, read out loud

Every string a person can ever see, taken one at a time and read next to the others for
the first time. Written up in [decisions.md section 32](decisions.md).

- [x] the tooltip's second line says what happens, not what does not: `The fix stays on
      after uninstall` **(code)**
- [x] a third mark, `⚠ RTL`, carrying no on/off word - with no Claude Code in the
      editor neither of them is true **(code)**
- [x] `(anthropic.claude-code)` and version numbers out of every message; each one now
      ends with what it means for the reader **(code)**
- [x] **both settings removed.** One let right-to-left text break silently; the other's
      own description had to warn people off choosing it **(code)**
- [x] `turnOn` decides from what was RUNNING, not from whether the file changed - an
      expired block used to answer "already on" to somebody clicking a bar that read
      `RTL off` **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the seventh build running: 75,495.

### 0.4.10 — three messages nobody could ever see

0.4.9 polished thirteen messages. This one asks which of them a person can actually be
shown, and answers it by building a stand-in editor rather than by reading the source.

- [x] `test/reachable-messages.test.js` runs `activate()` in a stand-in VS Code and, for
      every state the disk can be in, presses exactly the commands the editor would
      offer - the same when-clauses, honoured **(code)**
- [x] three messages were produced by nothing at all and are gone, along with the
      branches that chose them: "already on", "already off", and "nothing to turn off"
      **(code)**
- [x] what is left states the resulting state, which is true however much or little had
      to be done - one answer that is always right instead of two to choose between **(code)**
- [x] the test was checked by putting an unreachable message back and watching it fail
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the eighth build running: 75,495.

### 0.4.11 — the shop window says the whole thing

One line, changed twice on the way to being right. The Marketplace blurb is the only
place somebody meets this before installing it, so it is the one place the WARNING has to
come before the instruction - "use the gear menu" means nothing until you know why.

- [x] `⚠ Uninstalling does not turn it off — turn it off from the ⚙ menu first.`
      Problem, then what to do about it, and the second half now names the action
      instead of pointing at a menu **(code)**
- [x] two earlier attempts recorded rather than quietly dropped: shortening it to just
      the instruction lost the reason, and rewording the reason lost the plain words
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the ninth build running: 75,495.

---

## What happens if you forget the Remove command between builds

Measured, not assumed - both builds' own code, run against a throwaway Claude Code.

**Newer over older — safe.**

```
apply 0.0.5 -> applied          one block
apply 0.0.9 -> applied          one block, and it is 0.0.9's
Remove      -> removed          identical to the original, byte for byte
```

A new build strips whatever block is there before writing its own, and takes over the 5MB
copy an older build kept. **They never stack and they never fight - only the newer one
runs.**

**Older over newer — silently does nothing.**

```
apply 0.0.9 -> applied
apply 0.0.5 -> no-pristine-copy   ← 0.0.5 refused, and 0.0.9's block is still there
```

Builds up to 0.0.6 restore from a copy they keep; 0.0.9 deletes that copy, so an older build
finds a patched file with nothing to rebuild from and correctly refuses to touch it. You
would think you were testing 0.0.5 while 0.0.9 was still running.

> **Rule: test upwards (0.0.1 → 0.0.9). To go back down, run the Remove command first.**

**The same build twice** — `already-current`, one block, the file is not rewritten at all.

---

## Testing them yourself, one at a time

All commands from PowerShell. `--force` lets one build replace another without uninstalling
first, which is what you want while comparing.

```powershell
cd "$env:USERPROFILE\Desktop\smartrtl\apps\vscode-claude"
```

**1. Install a build**

```powershell
code --install-extension .\claude-code-rtl-0.0.9.vsix --force
```

Then reload the window once (`Ctrl+Shift+P` → *Developer: Reload Window*). The patch is
written when the extension activates, and a webview only reads it as it loads.

**2. Check what is installed**

```powershell
code --list-extensions --show-versions | Select-String smartrtl
```

**3. Check whether Claude Code is currently patched**

```powershell
Select-String -Path "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js" `
  -Pattern "smart-rtl-direction patch BEGIN" -SimpleMatch -List
```

Output = patched. No output = clean.

**4. Before moving to another build: take the effect off**

`Ctrl+Shift+P` → **SmartRTL: Remove the right-to-left fix**

Required when going *down* a version. Going up, the newer build handles it - but running it
anyway costs nothing and removes all doubt about what you are looking at.

**5. Uninstall**

```powershell
code --uninstall-extension smartrtl.claude-code-rtl
```

**6. Confirm nothing is left**

```powershell
Select-String -Path "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js" `
  -Pattern "smart-rtl-direction patch BEGIN" -SimpleMatch -List
Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\*.pristine-backup" -ErrorAction SilentlyContinue
```

Both silent = Claude Code is exactly as it was.

**7. If you forgot step 4 and the extension is already gone**

```powershell
Get-Item "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js" | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName)
  $i = $t.IndexOf("/* ==== smart-rtl-direction patch BEGIN ==== */")
  if ($i -ge 0) { [IO.File]::WriteAllText($_.FullName, $t.Substring(0, $i).TrimEnd("`n")) }
  Remove-Item "$($_.FullName).pristine-backup" -ErrorAction SilentlyContinue
}
```

Then reload the window.

---

## One warning about F5

Running the extension with **F5** (the Extension Development Host) also writes the patch,
and closing that window does not take it off - there is no uninstall involved. While you are
testing cleanup, do not press F5 in between, or the leftover block will look like a failure
of the build you were actually testing. That has already happened once.
