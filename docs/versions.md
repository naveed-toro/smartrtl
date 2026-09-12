# The fifty builds, and what each one actually contained

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

| | 0.1.0-4 | 0.1.5 | 0.1.6-7 | 0.2.0 | 0.3.0 | 0.3.1 | 0.3.2 | 0.3.3 | 0.3.4 | 0.4.0 | 0.4.1 | 0.4.2 | 0.4.3 | 0.4.4 | 0.4.5 | 0.4.6 | 0.4.7 | 0.4.8 | 0.4.9 | 0.4.10 | 0.4.11 | 0.4.12 | 0.4.13 | 0.4.14 | 0.4.15 | 0.4.16 | 0.4.17 | 0.4.18 | 0.4.19 | 0.4.20 | 0.4.21 | 0.4.22 | 0.5.0 | 0.5.1 | 0.5.2 | 0.5.3 | 0.5.4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| answers read right-to-left | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| your own messages read right-to-left | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| a sent message decided line by line | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | |  |  |  |  |
| ... **as a copy, moving nothing of theirs** | | | | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | |  |  |  |  |
| the composer takes one direction | · | · | · | · | · | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| the composer decided **per line** | | | | | · | | | · | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| ... by `unicode-bidi: plaintext` | | | | | | · | · | | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| ... with a third, "mixed" state | | | | | | | · | | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| a clone of React's mirror | | | | | | | | · | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| its own undo stack | | | | | · | | | · | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| **a sent message decided as one, found twice over** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · | · |
| **the composer sets `unicode-bidi` too** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · | · |
| **the composer found by what it is, not only its name** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · | · |
| **text put in the box from code turns it too** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · | · |
| **the status reports what was measured** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · | · |
| the timeline dot | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| an expanded message unpinned | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| the view follows the message | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **closing gives back the reader's line** | | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| the block expires on its own | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **a fault stops where it happens** | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **a fuse box, and `__bidiStatus()`** | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **stands down if Claude Code fixes it** | | | | | | | | | | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **a keystroke costs 0.18ms, and the answers' part is out of the box entirely** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · |
| **every startup answers from the end of the bundle, not five megabytes of it** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · |
| **the answers' part never looks inside anything editable** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **... asked of the box you type in and of a sent message too, of the real thing** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **a lamp that has thrown and never worked stops saying it is on** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **a collapsed message recognised by what it is, not only by name** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **the box you type in on a circuit of its own** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · |
| **no stylesheet can overrule the box: first layer, `!important`** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · |
| **the box found five ways, its layers by what is drawn over it** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · |
| **the payload parsed as a module before it ships** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · | · |
| **a sent message on a circuit of its own, found by name and by `dir="auto"`** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · |
| **the answers' part never decides from text nobody can see** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · | · |
| **the long-message fix on a circuit of its own: first layer, `!important`, asked of every row** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **a long message taken for a command is not pinned over its answer** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **a sent message is never looked for inside an answer** | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | · | · |
| **crashed the panel** | | | | | **✗** | | | | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| **typed blank spaces** | | | | | **✗** | | | | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| **every keystroke one late** | | | | | | | | **✗** | | | | | | | | | | | | | | | | | | | | | | | | | |  |  |  |  |
| payload, bytes | 28,975 | 30,998 | 31,371 | 35,485 | 59,047 | 51,513 | 54,185 | 71,979 | 51,754 | 66,147 | 69,798 | 70,554 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 75,495 | 80,092 | 100,249 | 113,430 | 157,281 | 157,281 |

The byte count is worth reading as a line of its own. It climbs while the composer is
being fought over — 35K to 59K to 72K — and comes back down to 51K when that was given
up. Everything after that is resilience: 28K by 0.5.0, 20K more in 0.5.1 for the box alone, 13K in 0.5.2 for sent
messages, 22K in 0.5.3 for Claude Code's own long-message bug, and 22K in 0.5.4 for the question every
part of this is now asked - each doing exactly what
it did before, and each much harder to break.

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

- [ ] an English line inside an Urdu message is left alone **(live - but only by luck, and
      unticked in 0.5.0. Claude Code hides a heading above every sent message carrying its
      first 120 characters; with an Urdu word in them, that heading decided the whole
      message before the split was ever asked. See 0.5.0, and decisions.md section 34)**
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

### 0.4.12 — two different things stop sharing a paragraph

The blurb had been carrying two unrelated jobs in one run of text: what this extension
is, and what to do before uninstalling it. Read at a glance they blur into each other.

Splitting them turned out not to be a wording problem. VS Code's extension page renders
`description` through `textContent` into an element whose only rule is `margin-top:10px`
- read out of workbench.desktop.main.css rather than guessed at - so a newline collapses
to a space and there is no smaller text to drop into. **It cannot be two lines.**

So the second job moved to where it can be formatted, which is where it already was:
the README opens with it as a heading in a quoted block, directly under the blurb on the
same page.

- [x] the blurb says only what the extension does **(code)**
- [x] the uninstall instruction stays a heading in the README block below it, which is
      the only place either of them can be made to look different from the other
- [x] the tooltip's two lines became one: `Do this before uninstalling, or the fix stays
      on`. Instruction and reason are one thought, and splitting a thought across lines
      is the same fault as joining two of them on one **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the tenth build running: 75,495.

### 0.4.13 — two words, and both of them earn it

One tooltip line, twice more. Neither change is cosmetic.

    0.4.12   Do this before uninstalling, or the fix stays on
    0.4.13   Do this before uninstalling, otherwise the fix is still on

- [x] **or → otherwise.** After an imperative, "or" can be read for a moment as offering
      a choice - *do this, or ...* - and the reader has to unpick it. "Otherwise" has
      only one meaning: if you do not **(code)**
- [x] **stays on → is still on.** The thing worth saying is not that it stays on, but
      that it is on **even after the uninstall** - and "still" is the one word that
      carries that. The long way round was 78 characters; this is 58 **(code)**
- [x] on/off is the vocabulary the bar already uses, so "is still on" borrows nothing new
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the eleventh build running: 75,495.

### 0.4.14 — the blurb goes back to where it started

Three attempts at one sentence, and the first one was right.

    0.4.11   … panel. ⚠ Uninstalling does not turn it off — turn it off from the ⚙ menu first.
    0.4.12   … panel.                              (warning dropped, README carries it)
    0.4.14   … panel. ⚠ Uninstalling does not turn it off — use the ⚙ menu first.

Finishing the sentence made it heavier than the thing it is attached to, and the page
cannot separate them - `description` goes through `textContent` into an element whose
only rule is `margin-top:10px`, so there is no second line and no smaller text.

Dropping it went too far the other way. The README block below is bigger and clearer,
but it is *below*, and the extension list shows the blurb on its own. What that blurb
needs is not the whole instruction - it is enough of one to make somebody stop and go
looking, and "use the ⚙ menu first" does that in six words.

- [x] the short warning is back, unfinished on purpose: it points, and the README block
      directly under it finishes the job **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

### What a person is told when this is installed

Measured rather than assumed, by running `activate()` in a stand-in editor:

| what happened | what they are told |
|---|---|
| first install, Claude Code never patched | *Right-to-left text is fixed. Reload to see it.* |
| re-install, the same payload already in place | **nothing** |
| re-install, and they had switched the fix off | *SmartRTL is installed, but the right-to-left fix is off.* |

The silence in the middle row is the right answer and looks like a fault: eleven builds
in a row have had a byte-identical payload, so re-installing changes nothing, needs no
reload, and has nothing to say. It is also why nobody testing this has seen the first
message since the very first install.

Payload untouched for the twelfth build running: 75,495.

### 0.4.15 — the same lesson, applied twice

0.4.14 settled the blurb by leaving it deliberately unfinished: enough to make somebody
stop and look, with the block below finishing the job. The tooltip had been going the
other way at the same time - four attempts, each one more complete than the last:

    Uninstalling does not turn it off
    Do this before uninstalling / Uninstall does not stop it
    Do this before uninstalling / The fix stays on after uninstall
    Do this before uninstalling, otherwise the fix is still on
    Do this before uninstalling

The last one is the first one's second half, on its own. Everything added to it was an
explanation, and an explanation is what the README block is for. A tooltip is read by
somebody whose hand is already on the mouse; four words that make them stop beat
eleven that make them read.

- [x] `Turn off right-to-left fix` — blank line — `Do this before uninstalling` **(code)**
- [x] the test is back to thirty-two characters a line, which is the width both lines
      fitted in before the explaining started **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the thirteenth build running: 75,495.

### 0.4.16 — the second line goes back to being the reason

0.4.15 left the tooltip as an instruction and no reason:

    Turn off right-to-left fix
    Do this before uninstalling

Both lines are then about the same thing - what to do - and the fact the whole tooltip
exists for is missing. Nobody needs telling to tidy up before uninstalling; what they do
not know is that **not** tidying up leaves the fix running. That belief is the danger,
and "do this first" never touches it.

With the action already stated above it, the reason is not half a sentence any more:

    Turn off right-to-left fix        what this does
    Uninstall does not turn it off    and why you would

- [x] **Uninstall**, not *uninstalling*: it is the word on the button, and at 30
      characters it fits the line-width test that 33 would have forced open again
      **(code)**
- [x] the third candidate - both halves on one line - was 62 characters with
      "uninstall" twice, and was the shape rejected back in 0.4.8
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the fourteenth build running: 75,495.

### 0.4.17 — the rule behind the rule

`Uninstalling does not turn it off` reads better than `Uninstall does not turn it off`,
and it is 33 characters against a test that allowed 32. 0.4.16 had picked the shorter
word to avoid raising the bound, having just pointed out that raising the bound is how
four earlier versions grew their explanations.

Both of those are the wrong move, because **the number was never the thing being
guarded**. It was standing in for something structural, and the standing-in is what
kept bending: 32, then 50, then 60, then back to 32. A rule that moves whenever it is
inconvenient is a rule doing as it is told.

So the width became a backstop at 40, and the real test says what a label actually is:

| refused | because |
|---|---|
| a full stop or an exclamation | it is a sentence |
| a comma | two ideas sharing a line |
| a spaced dash | the same, wearing a different coat |

Checked by feeding it the three wordings this line has already worn and watching each
one fail. `right-to-left` keeps its hyphens - the dash rule only looks for one with
spaces around it, which is the kind that joins clauses.

- [x] `Turn off right-to-left fix` / `Uninstalling does not turn it off` **(code)**
- [x] the length test is now three tests, and only one of them is a number **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the fifteenth build running: 75,495.

### 0.4.18 — installing it now says so, and a file stops shipping

Two faults behind one question - why does installing this tell you nothing. Written up
in [decisions.md section 33](decisions.md).

- [x] a re-install or an update that finds the fix already working now says
      `Right-to-left text is fixed.` - no reload offered, because none is needed. An
      ordinary window opening still says nothing **(code)**
- [x] whether to offer a reload is decided by whether it was **running** a moment ago,
      not by whether the file changed - an expired block needs no write and very much
      needs a reload **(code)**
- [x] **`.smartrtl-installed` was inside eight .vsix files.** Packaged, it is already
      there on arrival, so `freshInstall()` answered "no" for ever and the re-install
      question could not be asked in 0.4.10 to 0.4.17 **(code)**
- [x] it got there from a test that handed `activate()` the real extension folder. The
      test now gets a throwaway one, the file is untracked and ignored twice over, and a
      test fails if it ever reappears **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the sixteenth build running: 75,495.

### 0.4.19 — the message says where, and which

Four wordings, dug out of the history and read side by side:

    0.1.0   Right-to-left text fixed in Claude Code 2.1.263. Reload to see it.
    0.3.0   … the same, plus 90 characters about the gear menu and Uninstall
    0.4.9   Right-to-left text is fixed. Reload to see it.
    0.4.19  Right-to-left text in Claude Code 2.1.263 is fixed. Reload to see it.

The first had something the others lost. **A notification toast does not say which
extension is speaking** - so "Right-to-left text is fixed" leaves somebody who has just
installed three things wondering what, exactly, was fixed and by whom. Naming Claude
Code answers both, and naming its version says which build was worked on, which is the
first thing anybody wants in a bug report.

What the 0.3.0 version added was the uninstall warning, and that is the one part not
coming back: it has its own place now, in the tooltip and the ⚙ menu and the README
block, each at the moment it is wanted.

- [x] all three messages about the same event now name Claude Code and its version -
      installed, already working, and updated underneath us **(code)**
- [x] the reachability test had to learn about a value dropped into a sentence: it now
      matches on the fixed words around it, and was checked by feeding it a template
      nobody produces **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the seventeenth build running: 75,495.

### 0.4.20 — all seven read against their own histories

Every message dug out of git, laid next to every shape it has ever had, and gone through
one at a time. Five were left exactly as they were, which is the useful part: knowing a
line is right is worth as much as changing it.

- [x] `Show status` names the build: `Right-to-left fix is on in Claude Code 2.1.264.`
      It is a report somebody asked for, not a notice they were handed, so it can carry
      the thing they will be asked for next **(code)**
- [x] a rule instead of a wording, written up in [decisions.md section 33](decisions.md):
      the version belongs where the build is the point, and nowhere else
- [x] left alone after review: the update notice, turning it off, no Claude Code, the
      re-install question, and all three marks with their tooltip
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the eighteenth build running: 75,495.

### 0.4.21 — one action, one name

The same switch had two names. The ⚙ menu and the palette said `Turn the right-to-left
fix off`; the tooltip said `Turn off right-to-left fix`.

Which order is right was settled by counting rather than arguing. Across the 57
extensions installed here, the verb comes first **34 times** - `Enable X`, `Disable X`,
`Toggle X` - and the particle is held to the end **zero** times. Ours were the only two
in the whole list doing it the other way.

It matters most in the one place this was built for: that line sits directly under
**Uninstall** in the ⚙ menu, and `off` arriving second beats `off` arriving fifth.

- [x] `Turn off the right-to-left fix` in all three places - menu, palette, tooltip
      **(code)**
- [x] the article stays. `the right-to-left fix` reads as the name of a particular
      thing, which is what made these titles explain rather than order somebody about

### And a command the documents have been naming for twenty builds does not exist

The command it named, **Remove the right-to-left fix**, was replaced by Turn on / Turn off
in **0.1.4**. The README, decisions.md, roadmap.md and versions.md have all told people to run it ever
since - and the pinned uninstall test was holding **the wrong name** in place, which is
the opposite of what pinning it was for.

- [x] all four documents name the command that exists **(code)**
- [x] a test now reads every `SmartRTL: …` in the documents and refuses any that is not
      a real command title in package.json **(code)**
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the nineteenth build running: 75,495.

### 0.4.22 — five links that were only dead once packaged

The readme links to the write-ups by relative path, `../../docs/…`. Those resolve in the
repository and on GitHub, and every test here said so. On the Marketplace page all five
were 404s.

`vsce` makes relative links absolute against the **repository root**, not against the
folder the readme sits in - so `../../docs/decisions.md` became
`…/blob/HEAD/../../docs/decisions.md`, which a browser flattens to a path GitHub does
not answer to.

- [x] the five are absolute now, and the built .vsix was opened to check **(code)**
- [x] a test refuses any link in that readme that climbs out of its own folder **(code)**
- [x] second fault today that only exists after packaging - the first was
      `.smartrtl-installed` being inside the .vsix. Both were found by reading what
      actually shipped rather than what it was built from
- [ ] a week of ordinary use **(unseen - this is the one to try)**

Payload untouched for the twentieth build running: 75,495.

### 0.5.0 — the limits accepted, and built for the next update

Claude Code 2.1.267 broke the box you type in without a single error: it added
`unicode-bidi: plaintext` to both of its layers, and a rule that set only `direction`
stopped doing anything. Looking into that found something older. The line-by-line split
of a sent message had never run in the real panel at all: Claude Code hides an `h3` above
every sent message carrying the same text, the heading is a block, it comes first, and it
decided the whole message before the split was asked. It was there in 2.1.247, before this
project began.

So this build stops fighting both limits, and is built instead for the next update:

- [x] the composer sets `direction`, `unicode-bidi` and `text-align`, all `!important` -
      measured right on 2.1.247, 2.1.263, 2.1.266 and 2.1.267 **(lab)**
- [x] both composer layers are found by name AND by what they are - `contenteditable`
      with `role=textbox`, and `aria-hidden` - so a restyle that renames classes leaves
      it working **(lab)**
- [x] nothing turns unless both layers are there: an invisible box with no layer over it is
      left alone, rather than moving the caret away from the text **(lab)**
- [x] text Claude Code puts in the box from code - clearing it after a send, history,
      completions - turns it too. Before, an emptied box stayed right to left **(lab)**
- [x] a sent message takes one direction from what it says, found by class name and by the
      `dir="auto"` its text is handed to - each tested with the other taken away **(lab)**
- [x] the copy-beside-the-message machinery is gone: nothing in this extension builds
      elements in Claude Code's page any more **(code)**
- [x] `__bidiStatus()` reports what was measured - `on - measured working` - instead of
      what a lamp was told when it was switched on **(lab)**
- [x] the test pages carry Claude Code's hidden heading and its new `plaintext`, the two
      things a hand-drawn model had left out **(lab)**
- [x] Claude Code fixing its answers stands down the answers' part and nothing else. It
      used to stop everything - so fixing answers would have switched off the box you type
      in and sent messages too, and if it was fixed before this ever started, none of it
      would have started at all **(lab)**
- [x] a page that refuses a `<style>` added from script still gets the rules: the
      stylesheet falls back to `adoptedStyleSheets`, which a `style-src` without
      `'unsafe-inline'` does not block - measured - and the status says which way was
      used **(lab)**
- [x] **found by installing it:** installed over a working 0.4.22, it said "fixed" and
      offered no reload - while the panel already open went on running 0.4.22 from
      memory, which is broken on 2.1.267. The first real try looked exactly like 0.5.0
      failing. A new block written into the file now always asks for a reload
      **(live, then lab)**
- [x] a test boots Claude Code's own webview bundle - its React, its CSS, its CSP - with
      this payload appended, and types into the composer React renders: the box turns,
      and goes back when Claude Code empties it itself after a send **(lab, on the real app)**
- [x] typing is timed in that same app with the fix and without it, taken in turns: about a
      fifth of a millisecond a keystroke - a frame is sixteen **(lab, on the real app)**
- [x] the box you type in is found a third way, by the label a screen reader announces -
      "Message input" in every build from 2.1.247 to 2.1.267 **(lab)**
- [x] once the box is found, a change elsewhere on the page costs one native `contains()`,
      so a streaming answer never pays for the box being watched **(lab)**
- [x] Claude Code's bundle is written beside itself and renamed over, never half-written
      where a loading panel could read it - so this can never be the thing that breaks
      Claude Code **(lab)**
- [x] if an update moves the file Claude Code's panel loads from, it says so - "Claude Code
      has changed" - instead of telling somebody looking at it that it is not installed **(lab)**
- [x] a daily watch, on GitHub and nowhere near anybody's machine, downloads each new Claude
      Code and puts this build to it: the running app, its stylesheet, and every assumption
      in one-line form. Run locally the way GitHub runs it, against 2.1.267: 27 of 27 **(lab)**
- [ ] typed into and read in the real panel **(unseen - this is the one to try)**

Given up on purpose: a message that mixes two languages takes one direction as a whole,
while it is typed and after it is sent.

Payload: 80,092 bytes - 4,597 more than 0.4.22, for the per-part stand-down, a second road for the stylesheet and a third way to the box you type in, with the per-line machinery taken out.

### 0.5.1 — the box you type into, built for the updates that have not happened yet

Nothing a person sees is different: the box still takes one direction as a whole, from any
RTL letter in it. What is different is how much it takes to break that. Seventeen Claude
Code builds were downloaded and booted first - 2.0.50 to 2.1.268, ten months - to find out
how the box has actually changed: its class names went from minified letters to hashes, a
second layer appeared over it, and 2.1.267 added `plaintext`. Its role, label,
`aria-multiline` and `data-placeholder` never changed once. decisions.md, section 35.

- [x] the box is a lamp on its own circuit: its own observers, listeners, stylesheet and
      status. The answers' part failing to start was made to happen, and the box stayed on
      **(lab)**
- [x] its rules sit in a cascade layer declared before any of Claude Code's, all
      `!important`, and name only our own attributes: Claude Code forcing `ltr` with
      `!important` from a specific selector, or from its own cascade layer, loses - in its
      own running app, with its real stylesheet rewritten to do it **(lab, on the real app)**
- [x] found five ways - by name, role, label, `aria-multiline`, `data-placeholder` - so every
      class renamed AND the role and label taken away still finds it, in the real app
      **(lab, on the real app)**
- [x] the layers that turn with it are found by what they are: anything drawn over the box
      turns, an icon beside it does not, a box or layer wrapped in something new is still
      found **(lab)**
- [x] inside a turned layer nothing decides a direction of its own, so the caret and the
      letters cannot part; on today's box, with a mention chip in it, that changes nothing
      at all - measured property by property on Claude Code's own stylesheet **(lab)**
- [x] a box rebuilt with Urdu already in it turns at once, a box whose layer over it is drawn
      late turns when it arrives, two boxes are each followed, and a message brought back
      from history turns the box in the real app **(lab, on the real app)**
- [x] a fault takes a box back to how Claude Code had it, whole; layers that did not all take
      the direction are given back together and the status says why; a stylesheet taken out
      is put back; a box in a shadow root is reached **(lab)**
- [x] the sent-message lamp stays out of the box and out of the layer drawn over it - it
      could reach in before, and would have left the copy right to left over an English
      caret on a build that drew a `dir="auto"` run into it **(lab)**
- [x] the payload is parsed as a module before it ships, the way Claude Code loads it: the
      one mistake in it that could stop Claude Code's own panel from starting **(lab)**
- [x] every build from 2.0.50 to 2.1.268 booted and typed into with this in it: first letter
      on the right, both layers turned, measured working, no error - seventeen of seventeen
      **(lab, on the real app)**
- [x] twenty-four new tests on the copied page, and 0.5.0 fails eighteen of them; five
      rewrites of Claude Code's real bundle, and 0.5.0 fails three on behaviour **(lab)**
- [x] four faults in the new code itself were found before it was built - two by its own
      tests, two by reading it again: black text taken for invisible, "not working"
      forgotten at the next keystroke, a reading-back that turned a rebuilt box back, and a
      layer added inside a wrapper going unseen. Each test was run with its fix taken out,
      and failed **(lab)**
- [ ] typed into and read in the real panel **(unseen - this is the one to try)**

Payload: 100,249 bytes - 20,157 more than 0.5.0, for the box becoming a part of its own and
the reasons written beside it.

### 0.5.2 — a message somebody sent, on a circuit of its own

Nothing a person sees is different: a sent message still takes one direction as a whole,
from what it says. What is different is what holds that up. The same seventeen builds were
booted and sent a message first, and in 0.5.1 a sent message turned out to have no lamp of
its own - it was turned by the code for answers, from 2.1.247 on by deciding the whole row
from a heading hidden for screen readers, and in 2.0.50 and 2.1.0 by nothing at all. A class
it leaned on had also quietly stopped existing in 2.1.266. decisions.md, section 36.

- [x] a sent message is decided by a lamp of its own - its own observers, stylesheet and
      status - found by the class of the element holding its text and by the run its text
      is handed to `dir="auto"`, either one enough **(lab, on the real app)**
- [x] the direction goes on the text only, never on the row, so the controls beside a
      message stay where Claude Code put them; a mention Claude Code marks left to right
      keeps its own direction **(lab)**
- [x] its rules sit in the cascade layer declared ahead of all of Claude Code's: `plaintext`
      forced on a sent message with `!important`, from a specific selector or a cascade layer,
      loses - in Claude Code's own running app, its real stylesheet rewritten to do it
      **(lab, on the real app)**
- [x] the code for answers stays out of sent messages: it skips the heading above them by
      name, and never takes a decision from anything drawn one pixel square - so with every
      class renamed, an English answer streaming under an Urdu message does not read right to
      left for a single frame **(lab, on the real app)**
- [x] one message now ends at `data-transcript-message` as well as at its class name - the
      attribute Claude Code has put on every message in the transcript since 2.1.268 **(code)**
- [x] the class `contentWrapper_`, named for sent messages until 0.5.1, is no longer relied
      on - it stopped existing in 2.1.266 **(lab)**
- [x] a slash command sent with Urdu in it now turns - no road reached it before **(lab)**
- [x] a message rewritten by the page is decided again, both ways; a message that throws when
      read is left as the page had it while the one beside it is still decided; the answers'
      part failing to start leaves sent messages on **(lab)**
- [x] every build from 2.1.30 to 2.1.268 sends a message that reads right to left, decided by
      its own lamp alone and measured working; 2.0.50 and 2.1.0 give a sent message no road,
      and the report says so **(lab, on the real app)**
- [x] eighteen new tests on the copied page, and 0.5.1 fails twelve of them; seven in the real
      app, five of them rewrites of its bundle **(lab)**
- [x] a hundred and three hundred sent messages with an answer streaming: the same cost per
      chunk as 0.5.1, and the same as with none **(lab)**
- [ ] typed into, sent and read in the real panel **(unseen - this is the one to try)**

Given up on purpose, still: a message that mixes two languages takes one direction as a whole.

Payload: 113,430 bytes - 13,181 more than 0.5.1, for sent messages becoming a part of their
own and the reasons written beside it; the part of the answers' code that used to do their
work is gone from it.

### 0.5.3 — the long message nobody can read past, on a circuit of its own

Claude Code's own bug, not a right-to-left one, put through what 0.5.1 and 0.5.2 put the box
and a sent message through. Measured first in Claude Code's own app, with a real answer
streamed under the message: in every build that pins a message, 2.1.90 to 2.1.268, the trap
is identical to the pixel - it has not been fixed upstream - and 0.5.2's fix for it worked,
while everything around the fix did not. decisions.md, section 37.

- [x] a circuit of its own, started before the engine inside its own guard: its own
      observers, its own stylesheet - until now its rule rode in the answers' stylesheet
      **(code)**
- [x] its rules sit in a cascade layer declared ahead of all of Claude Code's, every
      declaration `!important`; until now plain CSS winning by specificity alone **(code)**
- [x] a pinned row found by name, by `data-transcript-message`, and by the sticky ancestor of
      a sent message's `dir="auto"` - never from inside or beside the box you type into, which
      a draft could make taller than half the panel the day it is pinned; an opened message by
      name and by what the trap is - pinned, showing its whole length, taller than half the
      panel. With every name it relies on renamed, it still works **(lab, on the real app)**
- [x] a long message Claude Code takes for a command - anything that opens with `/`, a pasted
      path included - has no "Show more" or "Show less" and was pinned over its own answer,
      forty turns of the wheel without a line of it seen; it is let go of now **(lab, on the
      real app)**
- [x] what Claude Code designed is not touched: a collapsed message, a short one and a short
      command stay pinned, however small the panel **(lab, on the real app)**
- [x] whether it is needed is asked of every row it pins, not once before any existed: a build
      that stops pinning takes all of it back out of the page, and its status says `not
      needed` **(lab, on the real app)**
- [x] the status says what was measured: `on - measured working`, or `not working` for an
      opened message the page kept pinned and taller than the panel - it said `on - no header
      rendered yet` for ever before **(lab, on the real app)**
- [x] `__bidiFixOff()` takes out the listener too; it used to be left behind, still moving the
      view on close **(lab, on the real app)**
- [x] the view kept on an opened message does its work two frames after the click, outside
      the guard around the click; it has a guard of its own now **(code)**
- [x] a sent message is never looked for inside an answer - named by the test id every answer
      has carried since 2.1.59 - so the day an answer's paragraphs are handed to `dir="auto"`,
      two lamps do not decide the same paragraph **(lab)**
- [x] all seventeen builds, in Claude Code's own app: in the thirteen that pin, the long one
      reaches "Show less" in three turns of the wheel instead of twenty-two and closing it
      lands on the reader's line; nothing is marked in the four that pin nothing **(lab, on the
      real app)**
- [x] seven new tests in the real app, and 0.5.2 fails five; the history test for this, and
      0.5.2 fails it in all thirteen builds that pin **(lab)**
- [x] a hundred pinned messages with an answer streaming: 377 microseconds a chunk, against
      0.5.2's 381 **(lab)**
- [ ] opened, read and closed in the real panel **(unseen - this is the one to try)**

Given up on purpose, still: a message that mixes two languages takes one direction as a whole.
And a choice worth knowing is made here: a pinned message showing its whole length is let go
of once it is taller than **half** the panel, not only once it is taller than all of it.

Payload: 135,021 bytes - 21,591 more than 0.5.2, for the long-message fix
becoming a part of its own, a second way into the same trap, and the reasons written beside
both.

### 0.5.4 — asked, measured, and got out of the way

Nothing a person sees is different. What is different is what happens on the day Claude Code
fixes one of these itself, what a lamp says once it has stopped working, and what any of it
costs somebody who is typing.

0.5.3 was finished, built and installed - and then put to the four questions that decide
whether it should be committed at all: is it over-built, does it load quickly, is every part
really on a circuit of its own, and will it survive the next update without breaking or
crashing. Three came back clean and measured. The fourth found the gap that matters most, and
this release is that gap closed, and then the cost of the whole thing brought down to where a
person cannot feel it. decisions.md, sections 38, 39 and 40.

And then the whole of it was put to the four questions it has to answer before any of this is
committed - is it over-built, does it load fast, is every part really on its own circuit, and
will it survive the next update. Three of the four came back clean and measured. The fourth
found the gap that matters most, and the rest of 0.5.3 is that gap closed. decisions.md,
sections 38 and 39.

- [x] **the box you type in and a sent message are asked whether they are still needed** -
      until now only answers ever asked, and those two simply assumed it for ever. The
      likeliest update of all is Claude Code fixing the box, and ours would have gone on
      forcing it underneath theirs, reporting `on` **(lab, on the real stylesheet)**
- [x] asked of the REAL box and the REAL message, never of a copy, before a single attribute
      of ours is on it - and with the one text that can answer: a line that opens in Latin and
      turns Urdu. A draft of pure Urdu is never asked with, because it reads right to left on
      every build ever shipped **(lab)**
- [x] every layer showing the text has to agree, or there is no answer yet - the caret's layer
      is live and the layer over it is the host's, a frame behind **(lab)**
- [x] a build that has fixed all three places ends with **not one attribute of ours anywhere on
      the page**, and a reader still sees every line the right way round **(lab)**
- [x] a lamp that has thrown and never once worked says so, instead of `on`; three goes at
      that condition, and the first two were satisfied by an empty draft succeeding at nothing
      **(lab, found by breaking each circuit inside Claude Code's own app)**
- [x] the one piece of code three circuits share can no longer dim them together: each carries
      on and reports what it measured **(lab, on the real app)**
- [x] a collapsed message is recognised by what it is - text being held back - as well as by
      name, so a cap moved into a stylesheet does not get a message let go of that Claude Code
      meant to keep pinned **(lab)**
- [x] the answers' pass looks at each block once per batch instead of ten times: 7,023 selector
      queries over a streamed answer became 1,224, and 85ms of scripting became 42ms **(lab,
      on the real app)**
- [x] 2.1.269, published since 0.5.2 and never tested before, booted and put through all three
      circuits: the box, a sent message and the long-message trap, all as 2.1.268 **(lab, on
      the real app)**
- [x] sixteen new tests; `npm test` itself was silently doing nothing on Windows - the shell
      never expanded `test/*.test.js` - and now runs them **(lab)**

And then the one thing in this whole project where no cost at all is acceptable: the box
somebody is typing into. Measured properly - one page, the fix injected and taken out again
between blocks, hundreds of keystrokes a side - because the first two instruments both lied,
one by a factor of fifteen and one by changing its mind about which way round the answer was.
decisions.md, section 40.

- [x] **a keystroke costs 0.18ms instead of 1.25ms**, and the part responsible for six
      sevenths of that was the ANSWERS' part - which has nothing to do with typing, and was
      being handed every keystroke because it is the only part that listens for
      `characterData` **(lab, on the real app)**
- [x] it never looks inside anything editable now, nor at the layer drawn over it: a
      correctness rule as much as a cost - the day Claude Code gives that box real paragraphs,
      a block in there would be decided twice over by two lamps, and the answers rule would
      WIN, parting the caret from the letters. Written as a test for that day, it failed twice
      more before it passed **(lab)**
- [x] the question 0.5.3 added - is this box still ours to turn - forced style and layout in
      the middle of a keystroke: **14.2ms against 4.3ms for the keystrokes either side**. It is
      asked after the frame now, where the same read is free, and the box turns one frame later
      on that single keystroke **(lab, on the real app)**
- [x] and the test for a host that rebuilds a layer caught what that change broke: the question
      was tied to one record, the record was replaced, and the box never turned at all **(lab)**
- [x] what remains is 0.187ms a keystroke, almost none of it our code running - it is four
      separate observers existing at all. One observer would be cheaper and would put four
      lamps on one fuse **(lab, on the real app)**
- [x] **every startup: `apply()` went from 197.70ms to 13.64ms.** It read five megabytes of
      Claude Code's bundle to find out that nothing needed doing; it asks the end of the file
      first now, as `state()` has since 0.5.0 **(lab)**
- [x] and the status bar stopped reading that file on every tab change - 13ms, every time
      anybody switched files - by remembering what it last saw and forgetting it at each of the
      three moments it could stop being true **(code)**
- [x] the guard that keeps the two message lamps off each other's text no longer rests on a
      single name: an answer is markdown and a sent message is not, and that shape says it
      without a name **(lab)**
- [x] streaming is unchanged by all of it: 1,224 selector queries and the same wall clock, the
      same layout, the same style recalculation as an untouched panel **(lab, on the real app)**

Given up on purpose, still: a message that mixes two languages takes one direction as a whole.

Payload: 157,281 bytes - 22,260 more than 0.5.3, for the question every part of
this is now asked before it does anything, the two roads that need no name, and the reasons
written beside all of them.


---

## What happens if you forget to turn it off between builds

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

`Ctrl+Shift+P` → **SmartRTL: Turn off the right-to-left fix**

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
