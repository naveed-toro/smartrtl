# Decisions, and the things that did not work

This file exists because the code is the small part. Anyone can write two hundred lines
of JavaScript. The expensive part was finding out **which rule is the right rule**, and
that took several attempts that each looked correct until they were measured.

Written in English on purpose: the audience here is anyone maintaining or reviewing the
fix, including upstream. The user-facing README carries the phrasings people actually
search for, in several languages.

---

## 1. The root cause

The Claude Code webview styles its rendered markdown like this:

```css
/* webview/index.css */
.root :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th) { unicode-bidi: plaintext }
.root p { white-space: pre-wrap }
```

`unicode-bidi: plaintext` means the browser decides each paragraph's base direction from
its **first strong directional character**. And because `white-space: pre-wrap` makes
every newline its own bidi paragraph, **every line decides separately**.

So a line that opens with a Latin token renders left-to-right even when the rest of it is
Urdu. Technical writing triggers this constantly, because sentences open with `useState`,
`npm`, `package.json`.

This is not a bug in the renderer. `plaintext` does exactly what it is specified to do.
The specification's heuristic is simply wrong for this kind of text.

---

## 2. Attempt one - ask the model to emit direction marks. Rejected.

The first idea was to leave rendering alone and change the output: instruct the model, via
project rules, to begin every RTL line with U+200F (RIGHT-TO-LEFT MARK).

It failed in a way worth recording: **the model wrote the escape sequence instead of the
character.** Answers came back containing a literal `‏` at the start of each line.
That is visible text, and worse, its first strong character is a Latin `u` - so the line
was forced back to LTR. The cure produced the disease.

Two lessons:

- do not build on invisible characters that a generator has to reproduce exactly
- a rendering problem should be fixed at the rendering layer, not by constraining what the
  writer is allowed to say

---

## 3. Attempt two - decide by character ratio. Rejected.

Next: count RTL letters against Latin letters in a line, and flip when RTL is at least a
third. Reasonable-sounding, and wrong, because it measures the wrong thing.

Latin identifiers are long; RTL function words are short. Two headings of the *same
grammatical shape* score wildly differently:

| line | RTL letters | Latin letters | RTL share |
|---|---|---|---|
| `useMemo اور useCallback` | 3 | 18 | 14% |
| `args - اصل arguments` | 3 | 13 | 19% |
| `children بطور props` | 4 | 13 | 24% |
| `Debounce بمقابلہ Throttle` | 7 | 16 | 30% |
| `JavaScript میں Debounce فنکشن` | 8 | 18 | 31% |

Every one of these is an Urdu heading with borrowed technical nouns. No threshold
separates them: raise it to 30% and the first two still fail; lower it enough to catch them
and English sentences start flipping.

The insight that ended this approach: in these lines the Latin words are **nouns**, and the
grammar is RTL. The language of a line has nothing to do with how many characters each side
happens to occupy.

---

## 4. Attempt three - decide per message, from surrounding context. Rejected.

If a line is ambiguous, look at the message it sits in: count how many of its blocks contain
an RTL word, and let that decide.

This worked, and was still rejected, because it needs to know **where a message begins and
ends** - which means reading the extension's DOM structure. During testing the lookup walked
one level too far, merged two messages, and flipped an English answer. Tightening the walk
fixed that instance, but the fragility is structural: an upstream restyle can silently move
the boundary again.

A rule that depends only on the line's own text cannot rot this way.

---

## 5. The guard that decided on a comma. Rejected.

The surviving rule has one blind spot. It cannot tell

- `Debounce بمقابلہ Throttle` - a borrowed noun, then RTL - **should be RTL**

from

- `In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical.` - an English
  sentence with one RTL insert - **should stay LTR**

Both are "LTR first, RTL later". A guard was tried: skip the flip if the line contains five
or more consecutive non-RTL words.

It was removed after this measurement:

| the same sentence, written with... | longest run of non-RTL words | guard fires? |
|---|---|---|
| an ASCII comma `,` | 5 | yes - line left as LTR |
| an Arabic comma | 3 | no - line flipped to RTL |

The direction of a line depended on which comma the writer happened to type. That is the same
brittleness as the ratio threshold, wearing a different hat.

**Decision: the ambiguous case is given up on purpose**, so that every common case is right.
A deliberate trade, not an oversight.

---

## 6. The rule that survived

```
starts with RTL                 -> RTL   (already correct, nothing to do)
starts with LTR, no RTL after   -> LTR   (left alone)
starts with LTR, RTL follows    -> RTL
```

Plus one safety rule, which is not cosmetic:

> **A block containing no RTL character at all is never touched.**

Forcing RTL onto a purely Latin block gains nothing and can actively break it. Observed in a
real table cell: `250-400ms`, written with an en dash, rendered reversed inside an RTL block,
because the dash is a neutral character that resolves to the paragraph direction. The safety
rule restores such cells to exactly what the extension shipped.

The two sides use different triggers, on purpose:

| where | trigger | why |
|---|---|---|
| answers | one RTL **word** (2+ letters) | the decision sticks until reload, so be careful |
| the composer | one RTL **letter** | a wrong guess costs one keystroke, so be eager |

Punctuation is not a letter, so an Arabic comma or a vowel mark alone will not flip an
English sentence.

---

## 7. One decision per message, not per line

Deciding line by line meant a line's verdict could change *while it was being written*,
because its content changed as it streamed. Measured on one streaming answer of seven blocks,
sampling every frame:

| | visible direction changes | final result |
|---|---|---|
| unpatched | 1 | 5 of 7 blocks wrong |
| per-line ratio formula | **5** | one heading still wrong |
| one decision per message | **2** | all 7 correct |

The design that produced the last row:

1. **One decision per message, never revised.** Taken from the first *finished* block that
   carries an RTL word.
2. **Applied by an attribute plus one CSS rule**, not by touching each block from
   JavaScript - so blocks written after the decision are born correct and cost nothing.
3. **Nothing is decided from a half-written block.** A block counts only once another block
   follows it, or the stream has gone quiet.
4. **No `getComputedStyle` per block.** It forces a style recalculation, and this code runs
   on every frame while an answer streams.

Zero flips is not achievable: when a line's first word is English, the information that RTL
is coming does not exist yet. What is guaranteed is **at most one change per block, and never
back and forth.**

---

## 8. The timeline dot

The webview draws a small dot and a connector line to the left of every message:

```css
.timelineMessage        { padding-left: 30px }
.timelineMessage:before { position: absolute; left: 9px  }   /* dot  */
.timelineMessage:after  { position: absolute; left: 12px }   /* line */
```

The whole stylesheet was searched first, to confirm nothing else lives in that gutter - no
buttons, no icons. Mirroring it therefore touches only padding and offsets, never `direction`
or `unicode-bidi`, so it cannot disturb anything above.

Two levels, deliberately:

- **per conversation** - once any message is RTL, the same gutter is reserved on *both* sides
  of every row, so content columns stay identical and nothing shifts sideways when an English
  answer sits between two RTL ones
- **per message** - only a row whose own content is RTL moves its dot into the right gutter.
  English answers, "Thinking" rows and tool cards keep their dot on the left, beside their own
  text

A first version moved every dot in the conversation. That was blind: an English answer ended
up with its dot far away on the opposite side.

The three offsets are read from the extension at runtime rather than copied into the patch, so
an upstream restyle cannot leave them stale. If any of them is not a plain pixel value, nothing
is done at all - moving the gutter without moving the dot would be worse than leaving it alone.

---

## 9. The composer is two stacked layers

The box you type into is not a textarea:

```
messageInput   contenteditable="plaintext-only",  color: #0000   (invisible; the caret lives here)
mentionMirror  position: absolute, aria-hidden                   (this is the text you actually see)
```

You type into a transparent layer and read a mirror behind it - the trick that lets @-mentions
be highlighted.

So the direction flag is set on the **shared container**, never on one layer, and a single CSS
rule flips both. It is structurally impossible for the caret to end up on one side while the
glyph sits on the other. Measured with both layers rendered: the last character's position
matched to the pixel in both states.

Unlike answers, the composer is **live, not sticky** - delete the RTL text and it returns to
LTR, because an input must show what is currently in it.

---

## 10. Long messages: the collapse control (not an RTL bug)

Found while working on direction, and it affects everyone:

```jsx
<div className={content + (collapsed ? " collapsed" : "")}
     style={ collapsed ? { maxHeight: `${Y}px` } : undefined }>
```

The height cap exists **only while collapsed**. On expand it is removed entirely, and
"Show less" is a normal element placed after all of the content. Measured with a 120-line
message: 2344px tall in a 552px viewport, with the collapse button 2097px below the fold. The
expand button is `position: absolute`, so it never has this problem - the two controls are
positioned by different mechanisms.

A second failure came out of testing: collapsing part-way through a long message leaves the
scroll offset where it was while the block shrinks by thousands of pixels, so you land
somewhere else entirely - often at the bottom of the conversation.

**Rejected fix:** cap the expanded height and scroll inside the block. It works, but it breaks
text selection across messages and introduces nested scrolling.

**Two wrong fixes before the right one.** This section is kept in full because the two
detours are more instructive than the answer.

*First:* make the collapse row `position: sticky` so it rides at the bottom of the window,
and pin the message's own top on collapse. The first live run killed it. Sticky moves a
control the extension had placed on purpose - `justify-content: flex-end` on its own flex
row - and it treated the symptom rather than the cause.

*Second:* cap the expanded body and give it its own scrollbar (`max-height: 60vh;
overflow-y: auto`). It tested green, and it was still wrong. How much of a window a
message may occupy is not ours to decide, and the right answer is not the same on a laptop
as on an external display. A message should open to its full length. Anything else is us
imposing a number we have no standing to choose.

**What was actually wrong, measured in the real panel.** A user message that heads a turn
is pinned:

```css
.message.stickyHeader { position: sticky; top: 0; z-index: 2 }
```

Collapsed, that is 60px of question held above a long answer, which is exactly the point of
it. Expanded, the same element has no height cap - and **a pinned element taller than the
window can never show its own bottom, because it does not move.** The wheel scrolls the
conversation behind it, invisibly, until the whole turn has gone past; only then does the
message itself begin to travel. Its "Show less" lives at the end of that pinned block, so
for the length of the turn it cannot be reached at all.

Opening a long message after scrolling up therefore looks like the panel has frozen. It has
not: it is scrolling, and every pixel of it is hidden behind the message you just opened.
Reported as an RTL problem, it is nothing of the kind - it happens in every language, and
the further up you had scrolled, the worse it is.

**The fix is one line, and it removes a behaviour rather than adding one:**

```css
stickyHeader:has(expandableContainer > buttonContainer) { position: static }
```

An expanded turn header stops being pinned and scrolls like ordinary content. Nothing is
capped, nothing is moved, no script runs, and the collapse row - which exists only when
expanded, and only as a direct child - is what tells an expanded message apart from a merely
short one. Collapsed messages and short messages keep their pinning untouched, because there
the pinning is doing its job.

Once you are reading the message itself, there is nothing left for it to hold above
anything. That is the whole argument.

**How it is held.** Five tests, and the two that matter measure against the same page with
the fix switched off: unpatched, the pinned message does not move and its button never
arrives; patched, it scrolls away and the button can be reached. A fifth asserts the
expanded height is identical either way, so the capping detour cannot come back by accident.

---

## 11. Why an extension, and not a script

The patch is appended to the extension's own bundle, so an extension update replaces the file
and the fix disappears. This is not theoretical - it happened within hours: `2.1.245` was
patched, `2.1.246` arrived, and a newly opened session was unpatched while an already-open tab
still ran the old code from memory.

- **A CLI / npm command** solves installation, not survival. It only runs when a person runs
  it, and updates do not wait for that.
- **A scheduled background job** was tried and rejected. Polling every twenty minutes to edit
  someone else's file is not something to run on your own machine, let alone ship.
- **A companion extension** already lives inside the process that installs the update. It can
  check on startup *and* watch the extensions directory, so a new version is caught the moment
  it lands. Two independent chances, no polling, same behaviour on Windows, macOS and Linux.

The honest limit: this is the best available arrangement, not a cure. The real fix belongs
upstream, in the renderer.

---

## 12. Three packages, not one file

The Claude Code payload started as a single file, and by the time it worked it held two
unrelated things: an engine, and a description of one product.

The engine is the part that is true of any surface rendering markdown into a page - watch
for changes, decide once per message, apply the decision with an attribute and a rule,
never decide from a half-written block. The product part is class names (`timelineMessage_`,
`expandableContainer_`, `messageInputContainer_`), a decorative dot, and a collapse button.

A browser extension needs **all** of the first and **none** of the second. Left as one file,
the next surface would have begun with a copy of it, and from that day an edge case would
have had to be fixed twice - which is exactly the failure the shared rule was extracted to
avoid in the first place.

So:

| package | answers |
|---|---|
| `@smartrtl/core` | which direction does this text belong to? |
| `@smartrtl/dom` | when to ask, and what to do with the answer |
| adapter | what this particular product's page looks like |

The engine takes the rule as an argument rather than reaching for a global, and takes the
product as configuration: `boxSelector`, `composer`, `extraCss`, and two hooks - `onDecision`
for what an adapter wants to do when a message is decided, `onCleanup` for undoing it.
Nothing product-shaped is left inside.

**How the split was verified.** The eight rendering and streaming tests were not touched -
not one assertion, not one fixture. They render the built payload against the extension's own
CSS and measure what a reader sees, so if the extraction had changed behaviour anywhere they
were already written to catch it. They pass unchanged, along with core's nine. That is the
whole proof, and it is why they were written before this refactor rather than after.

One deliberate change came with the move: `__bidiFixOff()` now disconnects the observer.
Before, it removed the stylesheet and the attributes but left the engine running, so a block
arriving afterwards was marked again by something the user had just switched off.


---

## 13. What the first live run found: a user message is not markdown

The extension was packaged, installed, and pointed at a real working session. Answers were
right. User messages were not touched at all - the ones that looked correct were the ones
that happened to begin with an RTL character, where the browser's own guess lands right by
luck.

The screenshots suggested attachments were the trigger. They were not. Reading
`webview/index.js` gave the real answer in one line:

```js
function Zw1({ text, context }) { return j("span", { dir: "auto", children: ... }) }
```

An **answer** goes through the markdown renderer, so its text arrives in real `p`, `li` and
`h` elements. A **user message** goes through a plainText path and comes out as a bare
`<span dir="auto">` inside a content div. Nothing in it is a block, so the engine - which
looks only at blocks - could not see a user message at all, whatever it said. Attachments
are a sibling div rendered before it, and never mattered.

`dir="auto"` is itself the first-strong-character rule. The bug this project exists to fix
is applied here by the extension, explicitly, in the one place the fix could not reach.

Two changes, at two different levels, on purpose:

- **in the adapter**, because it is a fact about this product: the content div is named as a
  block, and as the scope of one message.
- **in the engine**, because it is not: inside a block whose direction has already been
  decided, any `[dir="auto"]` descendant is told to `inherit` that decision. The browser's
  guess does not get a second vote. Any surface that hands a run of text to `dir="auto"` -
  and chat sites do it constantly - gets this for free.

The lesson worth keeping: three days of screenshots would not have found this, and ten
minutes of reading the bundle did. When a guest fix does not fire, read the host.


---

## 14. Leaving as cleanly as arriving

Installing applies the patch. Uninstalling used to leave it there, along with a 5MB pristine
backup in somebody else's folder. A guest that cannot be asked to leave is not a good guest,
and it is the one promise a design like this has to keep.

### The attempt that broke the extension

The obvious move is `deactivate()` - the last moment the editor certainly gives us, and one
that uninstalling, disabling and closing the window all pass through. It was built, it
packaged, all seventeen tests passed, and **it made the extension stop working entirely.**

```
install -> activate -> apply -> "Reload to see it"
        -> user clicks Reload
        -> DEACTIVATE runs -> patch removed
        -> window reloads, webview reads a clean bundle -> no fix
        -> activate -> apply -> "Reload to see it"   ... forever
```

The prompt returned after every reload and the fix never appeared. Both symptoms were
reported within minutes of installing, and no unit test could have caught either: this is
not behaviour inside a page, it is the editor's lifecycle.

The mistake, named exactly: **`deactivate()` does not mean "we are leaving". It means "this
extension host is stopping"** - which happens on every reload, every window close and every
update, and only incidentally on an uninstall. Tying a persistent on-disk change to it
guarantees the change is absent precisely when it is needed, because a webview reads the
bundle as it loads and we were re-applying afterwards.

### The hook that actually means it

VS Code does have one, and it is documented: an npm script named `vscode:uninstall`, run
"when the extension is completely uninstalled from VS Code, which is when VS Code is
restarted after the extension is uninstalled". It fires on an uninstall and on nothing else
- no reloads, no window closes - so it cannot produce the loop above.

Two things about it shape the implementation:

- **There is no `vscode` module.** It is a plain node script, so Claude Code cannot be asked
  where it lives. It does not need to be: the script sits in our own folder inside the
  extensions directory, so `path.dirname(__dirname)` *is* that directory and every copy of
  Claude Code in it can be found by name. That turns out better than asking - old versions
  left behind by earlier updates get cleaned up too, and the editor would only have pointed
  at the current one.
- **It runs while we are being deleted.** Nothing in it may throw. A cleanup that crashes on
  the way out is worse than one that quietly does nothing.

It keeps apply()'s rule about not guessing: a patched bundle with no pristine copy beside it
is left exactly as it is, because rebuilding somebody else's file from memory is worse than
leaving it patched.

### The hook does not run

It was built, packaged as 0.0.7, installed, used, and uninstalled. Claude Code's bundle was
still patched afterwards, and the extension's own folder was already gone - so nothing of
ours had run.

This is not our bug. `vscode:uninstall` has been broken in VS Code since 1.69
([microsoft/vscode#155561](https://github.com/microsoft/vscode/issues/155561), which is a
recurrence of #100323). Both are open, in the Backlog, unassigned to a milestone. The
feature is documented and does not work.

So: **automatic cleanup on uninstall is not achievable through any supported mechanism
today.** After an uninstall no code of ours runs, ever, and the one hook the editor
advertises for it does not fire. Every clever alternative dies on the same rock - a webview
cannot read the filesystem, another extension's CSS cannot cross into a webview iframe, and
`deactivate()` means "the host is stopping", not "we are leaving".

The hook stays in place, because it costs nothing and will start working the day VS Code
fixes it. It is simply not something to promise.

### What can be promised instead

- `SmartRTL: Remove the right-to-left fix` - instant, complete, on demand
- the block is one truncation away from gone, by hand, with the one-liner in the app README
- Claude Code installs each update into a fresh folder, so an orphan clears itself at its
  next update - which for a tool that ships as often as Claude Code is days, not months

That is the honest position, and the README says exactly this rather than implying more.

### The next experiment, in order

1. **Prove whether the hook runs at all.** A build whose uninstall script writes a line to a
   file before doing anything else. If the line appears, the hook fires and our script is at
   fault - fixable. If it does not, the editor never called us, and no amount of care in
   that file will change it. Guessing between those two is what has already cost a day.
2. **If it never runs: make the block expire by itself.** Stamp a date into the block at
   apply time and have it do nothing past that date; every activation re-stamps it. Then an
   uninstalled patch lapses on its own, with no dependence on VS Code, on us, or on anyone
   remembering a command. It converts a permanent change into a temporary one - which is
   not the same as instant removal, and should not be described as if it were.

---

## 15. Unpinning was half a fix

Section 10 stops being pinned while expanded. Installed and used, it was still wrong - and
only from somewhere other than the top of the conversation, which is why the first round of
testing missed it.

A collapsed message is pinned, so you can see it wherever you have scrolled to. Click it
open and it stops being pinned - and immediately falls back to where it actually lives in
the document, which may be thousands of pixels above your eye. The message you just asked
to see vanishes upwards and has to be chased back.

Right behaviour, wrong moment: the unpinning is correct, but the view has to follow.

```js
const wasAt = header.getBoundingClientRect().top;   // before the click
// ... two frames later, once layout has settled
const drift = header.getBoundingClientRect().top - wasAt;
if (drift) scroller.scrollTop += drift;
```

The header goes back to **the exact pixel it occupied before the click**, not "the top of
the panel" - that would assume where the pin puts it, and the container's own 20px padding
already makes that a guess. Measured after layout rather than predicted, and only when the
collapsed state actually changed, so a click that toggles nothing moves nothing.

The result is that opening and closing a message look like nothing happened, which is
exactly right: as far as the reader is concerned, nothing should have. It works the same
whether you are at the top, halfway down, or at the bottom.

Three tests hold it, all of them toggling for real rather than rendering a fixed state: open
from 800px down and the message stays on its pixel; scroll afterwards and it really does
travel, so the unpinning has not been undone; close it and it stays on its pixel again.

---

## 16. Reading it while it is being written

Every test up to here checked what the panel **settles on**. That is not what a reader
does. They read the answer as it lands, halfway down it, while a tool is still running
underneath - and if the line under their eye is backwards at that moment, being right
thirty seconds later is worth very little.

The symptom had been described exactly and never explained: **wrong while it streams,
right when you scroll back up afterwards.** That "afterwards" was the clue. Something was
being decided at the end of the turn and nothing before it.

### What it actually was

From Claude Code's own bundle:

```js
d30 = ["·","✢","✳","✶","✻","✽","✻","✶","✳","✢"]
setInterval(() => X(q => (q + 1) % d30.length), 120)
```

A spinner character, rewritten **every 120ms** for as long as the model is working. To a
MutationObserver that is a mutation like any other, and the engine's quiet timer was armed
by every mutation on the page:

```js
function isFinal(el) { return quiet || !!el.nextElementSibling; }
```

`QUIET_MS` is 350. 120 is less than 350, so while the model worked the timer was reset
before it could ever expire, and `quiet` was **unreachable**. Any block with nothing after
it yet - the last one, the one being read - could not be decided. The spinner stopped, the
timer finally ran, and everything came right at once.

Three changes came out of that, and each is a smaller claim than the one before it.

**Quiet means the writing stopped, not the page.** The timer is now armed only by a
mutation that touched a block. A spinner is not writing; neither is a clock, a progress
bar, or whatever a product animates next to an answer tomorrow.

**Anything that follows a block is proof the block is finished.** Text is appended, so the
arrival of anything after it - not just its own next sibling - settles it. Checking only
the sibling missed the ordinary shape of that: the last cell of a table row has no
sibling, and neither does the last item of a list, so a cell reading `250-400ms` stayed
turned round for half a second while a reader looked at `400ms-250`.

**And the wait before deciding was removed entirely.** This is the one that sounds
reckless and is not. Everywhere else the engine refuses to decide from a half-written
block, but that one decision cannot be revised by anything arriving later: text is
appended and never unwritten, so a block that holds an RTL word will hold one for the rest
of its life, and the rule's answer for such a block is RTL whatever else joins it. The
wait was protecting a decision that was never at risk.

### The one that was a real risk, and how it was found

Deciding sooner has a genuine cost, and it was not spotted by reasoning - a test caught it.
The quiet timer now expires **during** a message, so a paragraph that was half-written when
a tool started running looks finished. If it holds no RTL yet it is marked `data-bidi=ltr`
by the safety rule, and under the old code that mark was permanent. Urdu arriving after the
pause then read left to right **for good**. That is worse than the bug being fixed: late is
a disappointment, permanently wrong is not.

So the mark is now written but not settled. When RTL turns up the mark comes off, and that
direction is final - text is appended, never unwritten, so it can only travel one way.

### What it is worth, in numbers

Measured with `test/support/jitter.js`, sampling every animation frame on a page with the
real 120ms spinner running and never stopping, which is the condition a reader meets:

| | short reply | one block, paused | full answer | table |
|---|---|---|---|---|
| before | never turned at all | 75 frames wrong | 12 | 11 |
| quiet + isFinal fixed | 42 | 32 | 11 | 12 |
| deciding on sight | **3** | **5** | **5** | **5** |

Flips stayed at one per block throughout, total flips for a whole answer stayed at one, and
sideways movement of settled text stayed at 0px. That last row is the point: three frames
is not a delay anybody can see, and it cost nothing.

A short reply is the row to look at. Before, it **never** turned round while the model was
working, because a reply of one paragraph never grows the second block that used to settle
the first.

### Why both halves are asserted together, always

Every previous attempt at "decide sooner" in this project ended in the panel jumping about,
so `test/jitter.test.js` refuses to accept one without the other. Each scenario asserts:

- `wrongFrames` - how long a block was shown a direction it did not end up in
- `flips` - how often it changed, and whether it ever changed back
- `drift` - how far settled text moved sideways while its own text did not change
- `scrollJump` - whether the panel scrolled itself under a reader

Waiting for the turn to end scores a perfect zero on flips and is useless. Deciding on
every keystroke reads correctly and dances. Only the pair means anything.

---

## 17. What a reader can still see, and what they cannot

Section 16 claimed real time and proved it with a number - `wrongFrames` - which on a
second look was measuring the wrong thing. It counts every frame a block did not point
the way it ended up, and that includes the frames before there was anything to know. A
heading that has so far produced only `JavaScript` is not being got wrong. It is being
read correctly, because nothing in it yet says otherwise.

Counting those frames against the fix made the fix look worse than it is, and worse
measurements are not the safe kind of mistake: they hide the numbers a reader actually
experiences. There are two.

**lag** - frames between the first RTL *word* existing in a block and that block
pointing right to left. This is the only latency anyone could have avoided.

**moved** - how many characters were already on screen at the moment it turned. A
correction after thirteen characters is one word twitching. The same correction after a
hundred and fifty is a paragraph thrown across the panel.

### Draining before the paint, not after it

Measuring `lag` immediately found a frame that did not have to be spent. The queue was
drained from `requestAnimationFrame`, which is one frame too late: a mutation landing
after a frame's rAF callbacks have run is not looked at until the next frame, and the
frame in between is painted without the decision on it.

Usually nobody could tell. Where it showed was a host re-mounting a message - React does
this routinely - because our attribute leaves with the old elements, and the whole
message gets painted the other way round while we wait for a frame that has already gone
past. **Six of twelve runs flickered.**

A MutationObserver callback is a microtask, so draining from one runs at the end of the
same task the mutation happened in, *before* rendering. Same batching, same cost -
measured at 60fps with and without the fix, under a mutation every millisecond - and
nothing is painted mid-correction. Twelve runs of the same re-mount: **none flickered**,
and `lag` went to **zero on every scenario measured**.

### The sweep

Each of these streams with Claude Code's own 120ms spinner running and never stopping,
sampled every animation frame:

| | lag | moved | flips | drift | scroll |
|---|---|---|---|---|---|
| Urdu from the first letter | 0 | 1 | 0 | 0px | 0 |
| a code block, then Urdu | 0 | 1 | 0 | 0px | 0 |
| an English answer | 0 | 0 | 0 | 0px | 0 |
| a short reply | 0 | 10 | 1 | 0px | 0 |
| a heading opening in English | 0 | 13 | 1 | 0px | 0 |
| a nested list | 0 | 40 | 0 | 0px | 0 |
| **RTL arriving very late** | 0 | **157** | 1 | 0px | 0 |

### The two things a reader can still see

**One.** `moved` is not zero for a line that opens in English. When the first Urdu word
of `JavaScript میں Debounce فنکشن` arrives, thirteen characters are already on screen and
they cross the panel. Nothing can prevent that: before that word there is no information
anywhere in the line saying it is Urdu, and a person reading along could not have known
either. The bottom row is the same fact at its worst - an English sentence that turns out
to end in Urdu, and this is exactly the ambiguous case section 5 gave up on deliberately.

The only way to remove it is to guess the direction before the evidence, from the message
above or from what was typed in the composer. That guess is right most of the time for
somebody writing Urdu - and when it is wrong it puts a **correction into every English
answer**, which today has none at all. It was not taken. It is written down here because
it is a real option with a measurable trade, not because it was overlooked.

**Two.** A block with no RTL in it *at all*, at the end of an Urdu answer, is shown right
to left for about **450ms** before the safety rule puts it back - measured; with another
block behind it, 117ms. This is the same trade seen from the other side. Inside a decided
message, a block is born pointing the way the message points, and that is right for
almost all of them; marking a block left-to-right the moment it appears would instead put
a correction into every ordinary Urdu paragraph that happens to open with a Latin word.

Shortening the quiet window to cut the 450ms was considered and rejected on the same
grounds as everything else in this file: a shorter window marks blocks left-to-right
while they are still being written, so a paragraph would be corrected once in the wrong
direction and then corrected back. Two corrections, the first of them visibly wrong, to
save a third of a second on the rarer case.

---

## 18. Measuring against the real stylesheet, and four faults in the instrument

Everything in sections 16 and 17 was measured on `test/support/page.js` - a small page
carrying the handful of Claude Code rules that cause the problem. That page has been
right about every one of them. It is still a copy, and a copy can only answer questions
somebody thought to copy the rules for, so `test/support/real.js` was written: it loads
`webview/index.css` out of the installed extension and finds the real class names in it
at runtime, because every one of them is hashed per build and a written-down hash turns
a Claude Code update into a green suite measuring a page nobody has.

Everything it found on its first day was a fault in **itself**. That is worth writing
down in full, because each one had first been written up as a fault in the fix, and two
of them nearly shipped a change.

**One. The viewport was never applied.** `newPage({ viewportSize })` is not an option -
Playwright's is `viewport`. Every measurement in this project, from the beginning, had
been taken on a panel 1280 pixels wide, where hardly anything wraps.

**Two. The page scrolled as a document.** The real panel is a fixed box; only the message
list inside it scrolls. Modelled as an ordinary page it grew its own scrollbars and
changed width while text arrived - and right-to-left text starts at the right edge, so
that read as "already-read paragraphs twitching sideways, three times per answer". Two
fixes were written for it: stretching the markdown root, and reserving the scrollbar
gutter. Neither shipped. Constrained the way the panel is constrained, the edge does not
move at all - zero frames, with the fix and without it.

**Three. The stylesheet arrived with sixty-six rules on it.** Pasted into the markup that
`setContent` parses, most of a 390KB minified stylesheet did not survive; the page looked
exactly like a page that had all of it. `addStyleTag` sets the text through the DOM
instead, where it is never parsed as markup.

**Four. The test element was called `root`.** Claude Code's stylesheet has a rule for
`#root` - its own React mount point - that sets `display: flex`. Our answer container
shared the id, inherited an application-level layout by accident, and laid its paragraphs
out in a ROW. Reading the CSS by hand found nothing, because the rule does not mention
any class this project knows; `CSS.getMatchedStylesForNode`, over the devtools protocol,
named it in one question. The lesson is narrower than "be careful": when the page
disagrees with the stylesheet you have read, ask the engine what it matched.

A harness is not a lesser thing than the code. It is the instrument every number comes
from, and an instrument nobody checks reads back whatever you were hoping for.

### With the instrument fixed

The same sweep, on Claude Code's own stylesheet, streaming with its own spinner:

| | lag | moved | flips | drift | scroll |
|---|---|---|---|---|---|
| a plain answer | 0 | 13 | 1 | 0px | 0 |
| a short reply | 0 | 10 | 1 | 0px | 0 |
| lines that grow longer | 0 | 1 | 0 | 0px | 0 |

Identical to the copied page, which is the outcome that makes both worth keeping: the
copy is fast and readable and can model things that are not installed, and the real one
is the check that the copy has not quietly drifted from the product.

Four tests hold it: that every `[class*="..."]` prefix the fix is built on is still
present in the installed stylesheet, that an answer streams calm on the real one, that
the panel edge is moved exactly once by us and never by the panel itself, and that a user
message is still split line by line under the real class names.

---

## 19. Direction, and nothing that is not direction

The whole project is one claim: it sets a text direction, and does nothing else. Not a
new rule, not a restyle, not a nudge to somebody's spacing. Everything a reader sees
should be Claude Code's own work, arranged the way Claude Code arranges it, and only
pointing the right way.

That is not a claim to make from reading the code. So every computed property of every
element in a message is read twice - with the fix loaded and without it, on Claude
Code's own stylesheet - and the difference is the entire answer.

**An English answer: nothing differs. Not one property, on any element.** Same widths,
same heights, same text. The fix is not merely harmless there; it is absent.

**An Urdu answer**, before this was measured:

| property | how many elements |
|---|---|
| `direction` | 6 |
| `unicode-bidi` | 9 |
| **`text-align`** | **2** |
| `padding-right` / `padding-inline-end` | 1 |
| `width` / `inline-size` | 9 |
| `perspective-origin`, `transform-origin` | 8 |

The third row is the one that mattered. `text-align: start !important` was going onto
every block, for a good reason written up in the code: a host that sets `text-align:
left` on a container beats direction outright - the words come out in the right order
and every line still hugs the left edge.

But it was also landing on `<th>`, and a table header is centred - by the **browser**,
not by the host, which writes no `text-align` on `th` at all. So every centred header in
an Urdu table was being quietly left-aligned. Centre is centre in both directions; that
was a restyle, not a direction. `th` is now excluded, and `text-align` is gone from the
list.

What is left is `direction`, `unicode-bidi`, and the timeline dot being moved to the side
the message reads from - a 30px gutter on the row, plus the width every element inside it
then inherits, plus two properties the browser computes from width. That gutter is the
only thing in the page that is not direction, and it is decoration: `MIRROR_TIMELINE` in
the payload turns it off, and with it off the complete list of everything that differs,
anywhere on the page, is:

    direction, unicode-bidi

Two tests hold this, on the real stylesheet, and they are the strictest in the suite
because they assert over properties nobody enumerated in advance: a new restyle
introduced by any future change fails them without anyone having to think of it first.

---

## 20. The dot, in real time

Section 8 gave the timeline dot to the side its message reads from. It is the one thing
this project adds that is not a direction, it is deliberate, and it stays: a message
whose text runs right to left with its dot still on the left is half-turned.

What section 8 could not say is *when* it happens, because until section 16 the answer
was "at the end of the turn, if at all". Measured on Claude Code's own stylesheet, a
one-paragraph Urdu reply with the model still working:

| | the dot moved on |
|---|---|
| before | **0 frames** - it never moved at all |
| now | frame 4, the frame the first Urdu word arrived |

The dot was not broken. It was waiting on the same decision the text was waiting on, and
that decision was unreachable while the spinner ran. A short reply never grew the second
block that used to settle the first, so the reply stayed left-aligned with its dot on the
left until the whole turn ended. Everything in section 16 that fixed the text fixed the
dot in the same movement, because they were always the same event.

On a longer answer the dot used to move at frame 13 - once a second block had arrived to
settle the first - and now moves at frame 5, with the text rather than after it.

What a reader sees now, on a conversation holding one English answer and one Urdu one:

```
frame 0   English  dot left    Urdu  dot left
frame 5   English  dot left    Urdu  dot RIGHT      <- and the text turns in this frame
          (nothing else, ever)
```

The English answer's dot never moves. Both rows have the gutter reserved on both sides,
which is what keeps the content columns identical from row to row - so an English answer
sitting between two Urdu ones does not shift sideways. And no dot ever moves twice.

---

## 21. What an end user does, and the one path that must never make things worse

Sections 16 to 20 tested the fix. This one tested the person: somebody who keeps a
panel open for six hours, copies an answer into an email, writes a date in the middle
of a sentence, types a reply while an answer is still arriving, and - when something
looks wrong - reaches for the escape hatch.

Six of those scenarios passed first time. That is not reassuring on its own, so the
weakest of them was checked properly, and it turned out to prove nothing: every line in
it opened with an Urdu character, which the browser already renders right to left. It
would have passed with the payload deleted. Rewritten so that every line opens with
something Latin - a date, a command, a filename, an identifier - and run **twice**, with
the fix and without, it now asserts the difference rather than the result. Two of the
predictions in it were wrong before the run, and both are worth keeping: a line opening
`12/03/2026` renders right to left already, because digits are not strong directional
characters, and a list item opening `args` renders left to right, because that one is.

### The escape hatch was leaving people worse off

`__bidiFixOff()` is the one thing a person has when something goes wrong, and it had
never been tested. For an answer it was perfect - nothing there is ever restructured.
For a typed message it was not:

| | pristine | after the escape hatch |
|---|---|---|
| the spans we made | 0 | 3 |
| our attributes | 0 | 3 |
| line breaks in the text | present | **gone** |
| height | 273px | 233px |

The split drops the newline characters and lets the line elements be blocks instead.
That is what makes a copied message come back exactly right - and it means the breaks
depend on our stylesheet still being there. Remove the sheet and three lines collapse
into one unreadable run, taking every line break out of the clipboard with them.

Two changes, because one is not enough:

- `display: block` is now set on each line element **inline**, so a line break does not
  depend on a stylesheet that anything might remove.
- `stop()` puts a split message back together: the line elements are unwrapped, their
  children moved rather than copied, the newline characters restored between them, the
  `<br>` that held a blank line open removed, and the host normalised back to one text
  node. Measured against a page that never had the fix on it: identical markup,
  identical text, identical height, nothing of ours left anywhere.

### And the thing that was actually feared

A conversation of 200 messages: 29.9fps without the fix while a 201st answer streams,
29.1 with. Forty answers streamed one after another into one conversation: the first
five took 379ms each, the last five 383ms - with the fix and without it, the same
numbers. Whatever else may be wrong, it does not get slower the longer it is used.

---

## 22. The composer decides once, for the whole box

The browser extension decided the composer's direction **per line**: type English, add an
Urdu word, and that line turned - while the line above it, if it was English, stayed
English. This one decides for the whole box: the formula runs over everything in it, so
once any Urdu is present the box is right-to-left and stays that way however much English
is typed or pasted afterwards. Delete the Urdu and it goes back.

That difference was raised as a defect, and the first answer given was wrong: that
per-line here would mean rewriting the box's contents on every keystroke, and rewriting
kills undo. The objection came back - *it did not do that in the browser* - and the
objection was right. What follows is what the measurement actually says.

### Why it was free there and is not free here

A browser chat box is an editor whose lines are already elements: one `<div>` per line,
made by the editor itself. Per-line direction there is **an attribute on an element that
already exists**. Nothing is created, no text node is touched, and the browser's undo
stack never notices.

This composer is `contenteditable="plaintext-only"` with `white-space: pre-wrap`. Its
lines are not elements. They are `\n` characters inside one text node - which is exactly
why the text it sends comes out right. To give a line its own direction, the elements
have to be **made**, and making them is what costs.

Measured, the same formula applied on every keystroke to both:

| | per-line direction | three ctrl+z |
|---|---|---|
| lines already elements, attribute only | applied | **undo alive** |
| lines are `\n`, elements rebuilt | applied | **undo dead** |

Rebuilding only when a line's direction actually changes softens it rather than fixing
it. On a three-line draft that is seven rebuilds, and each one is a barrier the undo
stack cannot cross: 84 characters typed, twenty presses of ctrl+z, and 64 characters
still there - it could not reach past the current line. Untouched, the same twenty
presses take it back through the whole draft to 31.

### What whole-box actually costs, exactly

Measured against per-line on the same draft, the word order is identical, the alignment
is identical, and the sent text is identical. **One thing differs:** on a line with no
Urdu in it at all, trailing punctuation sits at the far end - `.Run the build and check
it` rather than `Run the build and check it.`

And that is not a rendering fault. An English sentence inside a right-to-left paragraph
puts its full stop at the paragraph's end in every word processor there is; it is what a
right-to-left paragraph means. Per-line is a different model, not a more correct one -
each line becomes its own paragraph. Both are legitimate. One is free.

It shows only while typing. The moment the message is sent it is split line by line and
decided by the same formula, so what the reader sees is per-line correct either way.

### The decision, and what would change it

Whole box. The gain is the position of one full stop, visible only while typing; the
price is ctrl+z, in a box people type into all day - and the work needed to collect that
gain is caret restoration, IME composition handling, and re-applying the structure
against a mirror React rebuilds on every keystroke. That is the shape of the ground the
browser extension was abandoned on, and it is not worth re-entering for a full stop.

**This becomes free the day Claude Code's composer gains a line element per line** - a
rich-text editor, or any structure where a line is a node. On that day the whole cost
above disappears, because nothing has to be built: it is one attribute per line, exactly
as it was in the browser. `test/real-webview.test.js` already fails if the composer's
class names change; anyone looking at that failure should check this too.

---

## 23. The composer, line by line after all

Section 22 concluded that the composer should keep deciding once for the whole box,
and that per-line would cost ctrl+z. The first half of that was a judgement; the second
half was wrong, and the objection that found it was simply *it did not do that in the
browser*.

It did not, and the reason is worth keeping: a browser chat box is an editor whose lines
are already elements, so per-line direction there is an attribute on something that
exists. Here a line is a `\n` inside one text node, so the elements have to be made -
and making them is what breaks the browser's undo stack. The difference was never
browser versus editor. It was whether anything has to be built.

Measured, the same formula on every keystroke:

| | per-line direction | three ctrl+z |
|---|---|---|
| lines already elements, attribute only | applied | undo alive |
| lines are `\n`, elements rebuilt | applied | **undo dead** |

### What made it possible

Undo can be kept, because the entire state of a plain-text box is `(text, caret)`. There
is no formatting to remember, which is what makes an editor's undo hard. So the fix
keeps its own stack: a step per burst of typing, broken at a space, at a line, and at
twelve characters, with redo. Measured against a box with nothing done to it: 84
characters typed, ctrl+z walks all the way back, and redo returns exactly what was
typed. Claude Code does not handle ctrl+z in the composer itself - the `execCommand`
undo in its bundle belongs to the Monaco editor - so nothing is being taken away from
anybody.

### The four things that had to survive, and how each broke first

**The text.** The newline characters stay in the DOM between the lines, so `textContent`
- which is what gets sent - is byte for byte what was typed. The first attempt made the
lines block elements and dropped the `\n`; the message then arrived with its lines run
together.

**The caret.** Both layers are wrapped identically, so the caret cannot sit on one side
while the glyph sits on the other. The first attempt took a previous line element's
children back out without re-splitting them, so a line break the browser had put inside
one of our spans left that layer with one line while the other had three.

**Everything the host owns.** Element children are moved, never recreated: a mention
chip keeps whatever was attached to it. Same discipline as the sent-message split.

**The page not freezing.** A MutationObserver callback is a microtask, so a flag set
around our own writing is already false when the callback runs: we saw our own work,
did it again, and queued another callback. Not a slow loop - a hang, the page stops
responding. `takeRecords()` after our own writing empties the queue so it is never
handed back.

### And the two things the user asked for, measured

Pasting sets the direction with **zero frames** painted the wrong way round - the same
before-paint arrangement a streaming answer already relies on. An English-only draft is
not touched at all: no line elements, no direction, nothing.

Six tests in `test/composer.test.js` hold all of it, and each one corresponds to
something that was actually broken while it was being built.

---

## 24. Number two, checked the same way

Section 13 built the per-line split for a message somebody has sent, and section 15
unpinned an expanded one. Both were measured on the copied page. This is the same two
things put to Claude Code's own stylesheet, and the direction put to the only test that
means anything: measured with the fix and without it, on the same message.

### The direction is the formula's, not the browser's

| the line | untouched | with the fix |
|---|---|---|
| `npm install کے بعد پروجیکٹ چلائیں` | mixed | **rtl** |
| `Run the build and check the output` | ltr | ltr |
| `12/03/2026 تک یہ کام مکمل کرنا ہے` | mixed | **rtl** |
| `package.json میں scripts دیکھیں` | ltr | **rtl** |
| `const x = useMemo(a, b);` | ltr | ltr |
| `یہ آخری سطر ہے۔` | rtl | rtl |

Untouched, the whole message is one left-to-right run and nothing is split at all -
which is the bug. Three of the six lines come out wrong on their own, and every one of
them is the same shape: opens with a Latin token, and is Urdu after it.

Two of those rows were written down wrong before the run, again: `package.json میں
scripts دیکھیں` has an Urdu word in it and is therefore right-to-left, and a date is
not a strong direction. The measurement was right and the expectation was not, which is
the only reason to run one.

### Copying it still gives back what was sent

The split drops the newline characters and lets the line elements be blocks, so
`textContent` reads the lines run together while a selection reads them correctly. That
difference is only safe if nothing reads `textContent`, so the bundle was checked rather
than assumed: Claude Code's copy buttons take their text from the component's own state
(`getText`), never from the DOM. A selection copy comes back byte for byte - asserted on
both pages.

### And Claude Code's own fault, on Claude Code's own rules

`stickyHeader` is `position: sticky; top: 0` in the real stylesheet, and an expanded
message has no height cap, so it cannot show its own bottom: the "Show less" at the end
of it is unreachable for as long as the turn lasts. Three things now hold on the real
sheet rather than a copy of it - opening a long message from 700px down leaves it within
2px of where it was, it becomes `position: static` so scrolling really does carry it
past, and closing it again leaves it within 2px.
