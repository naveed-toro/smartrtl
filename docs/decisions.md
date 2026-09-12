# Decisions, and the things that did not work

This file exists because the code is the small part. Anyone can write two hundred lines
of JavaScript. The expensive part was finding out **which rule is the right rule**, and
that took several attempts that each looked correct until they were measured.

Written in English on purpose: the audience here is anyone maintaining or reviewing the
fix, including upstream. The user-facing README carries the phrasings people actually
search for, in several languages.

## What is in here

Forty sections, in the order they were written, which is the order the faults were
found. The ones worth reading first are marked.

 1. [The root cause](#1-the-root-cause)
 2. [Attempt one - ask the model to emit direction marks. Rejected.](#2-attempt-one---ask-the-model-to-emit-direction-marks-rejected)
 3. [Attempt two - decide by character ratio. Rejected.](#3-attempt-two---decide-by-character-ratio-rejected)
 4. [Attempt three - decide per message, from surrounding context. Rejected.](#4-attempt-three---decide-per-message-from-surrounding-context-rejected)
 5. [The guard that decided on a comma. Rejected.](#5-the-guard-that-decided-on-a-comma-rejected)
 6. [The rule that survived](#6-the-rule-that-survived) ←
 7. [One decision per message, not per line](#7-one-decision-per-message-not-per-line) ←
 8. [The timeline dot](#8-the-timeline-dot)
 9. [The composer is two stacked layers](#9-the-composer-is-two-stacked-layers)
10. [Long messages: the collapse control (not an RTL bug)](#10-long-messages-the-collapse-control-not-an-rtl-bug)
11. [Why an extension, and not a script](#11-why-an-extension-and-not-a-script)
12. [Three packages, not one file](#12-three-packages-not-one-file)
13. [What the first live run found: a user message is not markdown](#13-what-the-first-live-run-found-a-user-message-is-not-markdown) ←
14. [Leaving as cleanly as arriving](#14-leaving-as-cleanly-as-arriving)
15. [Unpinning was half a fix](#15-unpinning-was-half-a-fix)
16. [Reading it while it is being written](#16-reading-it-while-it-is-being-written)
17. [What a reader can still see, and what they cannot](#17-what-a-reader-can-still-see-and-what-they-cannot)
18. [Measuring against the real stylesheet, and four faults in the instrument](#18-measuring-against-the-real-stylesheet-and-four-faults-in-the-instrument)
19. [Direction, and nothing that is not direction](#19-direction-and-nothing-that-is-not-direction)
20. [The dot, in real time](#20-the-dot-in-real-time)
21. [What an end user does, and the one path that must never make things worse](#21-what-an-end-user-does-and-the-one-path-that-must-never-make-things-worse)
22. [The composer decides once, for the whole box](#22-the-composer-decides-once-for-the-whole-box)
23. [The composer, line by line after all](#23-the-composer-line-by-line-after-all)
24. [Number two, checked the same way](#24-number-two-checked-the-same-way)
25. [The composer, line by line, was a crash — and the harness could not have seen it](#25-the-composer-line-by-line-was-a-crash--and-the-harness-could-not-have-seen-it) ←
26. [The lines really do have to be elements — just not in React's half](#26-the-lines-really-do-have-to-be-elements--just-not-in-reacts-half)
27. [Stopping: the composer takes one direction, and that is the answer](#27-stopping-the-composer-takes-one-direction-and-that-is-the-answer) ←
28. [The question left over: would it ever have felt fast?](#28-the-question-left-over-would-it-ever-have-felt-fast) ←
29. [A string of lamps, not a circuit in series](#29-a-string-of-lamps-not-a-circuit-in-series) ←
30. [The copy button that blinks — found, measured, and deliberately left alone](#30-the-copy-button-that-blinks--found-measured-and-deliberately-left-alone)
31. [The status bar was telling the truth about the wrong thing](#31-the-status-bar-was-telling-the-truth-about-the-wrong-thing) ←
32. [Every message, read out loud one at a time](#32-every-message-read-out-loud-one-at-a-time) ←
33. [Installing it said nothing, and the reason was a file we shipped by mistake](#33-installing-it-said-nothing-and-the-reason-was-a-file-we-shipped-by-mistake) ←
34. [Accepting the limits: one direction for the box you type in, and one for a sent message](#34-accepting-the-limits-one-direction-for-the-box-you-type-in-and-one-for-a-sent-message) ←
35. [The box you type into, built for the next update](#35-the-box-you-type-into-built-for-the-next-update) ←
36. [A message somebody sent, on a circuit of its own](#36-a-message-somebody-sent-on-a-circuit-of-its-own) ←
37. [The long message nobody can read past, on a circuit of its own](#37-the-long-message-nobody-can-read-past-on-a-circuit-of-its-own) ←
38. [Ten looks at one paragraph, and the cost of the pass nobody had counted](#38-ten-looks-at-one-paragraph-and-the-cost-of-the-pass-nobody-had-counted) ←
39. [The question only one of the three places was ever asked](#39-the-question-only-one-of-the-three-places-was-ever-asked) ←
40. [The one place where nothing is allowed to cost anything](#40-the-one-place-where-nothing-is-allowed-to-cost-anything) ←

← 6 and 7 are the rule and the design it forced. 13 is what the first live run found.
25 and 27 are the composer crash and the decision to stop; 28 is what that would have
cost; 29 is how the whole thing is wired so one fault cannot spread. 34 is where the
project stopped trying to beat every limit and started building for the next update, and
35 and 36 are that done to the first two places text appears - the box people write in,
and the message once it is sent - each put to ten months of Claude Code. 37 is the same
done to Claude Code's own long-message bug, and the answer to whether they have fixed it. 38 is
what all four of them cost, measured, and what happens when each is broken on purpose. 39 is
the question two of the three places were never asked - whether Claude Code has fixed this
itself - and what a lamp says once it has stopped working. 40 is the box you type into held to
a harder rule than anything else here: that nobody can tell this is installed.

---



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

- `SmartRTL: Turn off the right-to-left fix` - instant, complete, on demand
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

---

## 25. The composer, line by line, was a crash — and the harness could not have seen it

Section 23 shipped as 0.3.0 with six green tests. Installed, it did this:

- the box you type into accepted every keystroke and **showed nothing** — the characters
  went in like blank spaces
- the panel came down with it

That is one fault with two faces, and neither of them is about direction.

### What is actually there

Read out of Claude Code's own bundle rather than guessed at:

```js
T("div", { className: i6.messageInputContainer, children: [
  D("div", { ref: b1, contentEditable: "plaintext-only", onInput: j9, className: i6.messageInput, … }),
  D("div", { ref: z5, className: i6.mentionMirror, "aria-hidden": "true",
             children: [n5, e1 ? D("span", { className: i6.argumentHint, … }) : null] }),
  …
]})
```

and, in their stylesheet:

```css
.messageInput_cKsPxg  { color:#0000; caret-color:var(--app-input-foreground); z-index:1 }
.mentionMirror_cKsPxg { position:absolute; inset:0; pointer-events:none;
                        color:var(--app-input-foreground) }
```

Two facts follow, and 0.3.0 was built without either of them:

1. **The box you type into is invisible.** Not faint — `color:#0000`, caret only. Every
   glyph a person sees while typing comes from the mirror.
2. **The mirror's children belong to React.** `n5` is the whole draft as a string, or an
   array of strings and `<span>`s once an @mention or a misspelled word splits it. React
   holds a fiber per node and later calls `mirror.removeChild(node)` and
   `mirror.insertBefore(node, before)` **with those nodes**.

### The two failures, in order

`wrapLines` split each line into a span of its own. Splitting a text node meant
`document.createTextNode(part)` — a **new** node — so React's node was dropped on the
floor. Not moved: discarded.

- From that moment React's `commitTextUpdate` wrote every later keystroke into a node
  that was no longer in the page. The mirror never changed again. **A box that types
  blank spaces.** It happens on the very first wrap, because the mirror starts with one
  empty text node and that is enough.
- The next time React had to *remove* a child — text becoming an array when a mention
  appears, the argument hint going away, the box being cleared after send — it called
  `removeChild` on a node that was no longer its child. `NotFoundError`, thrown inside
  React's commit phase, with no error boundary above it. **The tree unmounts.**

The whole box was `[class*="root"]`-free, `try`-wrapped, and defensive throughout, and
none of that helps: the fault was not an exception in our code. It was our code doing
exactly what it meant to do, to somebody else's nodes.

### Why six green tests said nothing

`test/support/page.js` modelled the composer like this:

```js
input.addEventListener("input", () => { mirror.textContent = input.textContent; });
```

That mirror keeps no reference to anything it creates, and never removes or reorders a
node. **The single contract the real page enforces did not exist in the model.** The
tests were not weak about the thing they measured; they measured a page on which the bug
is not expressible.

`test/host-owned-dom.test.js` models the contract instead — nodes the host keeps, and
removes through the parent — and states the rule rather than the symptom: *nothing the
host put in the mirror is moved, replaced or thrown away.* Against 0.3.0 it fails
immediately, and its third test reproduces the user's report exactly: two lines typed,
mirror empty.

### What replaced it

CSS, driven by one attribute on the container the two layers share. **Nothing of ours
goes into anybody's DOM.**

```css
[data-bidi-input="rtl"]   layer { direction: rtl;              text-align: start }
[data-bidi-input="mixed"] layer { unicode-bidi: plaintext;     text-align: start }
```

Three states, and the middle one is the point:

| the draft | state | what happens |
|---|---|---|
| no RTL letter anywhere | *(none)* | untouched |
| every line that says anything says it in RTL | `rtl` | the whole box turns — **this project's rule**, so a line that opens with `Hello` and turns Urdu reads right to left |
| RTL lines *and* English lines together | `mixed` | `unicode-bidi: plaintext` — every newline-separated line becomes its own bidi paragraph and the **browser** decides each one |

Both layers are named by the same rules in the same stylesheet, so the caret and the
glyph cannot part company — not by discipline, by construction.

The first version of this fix used `plaintext` unconditionally, and that was shipped
and typed into. It was wrong in a way only using it shows: **most drafts are one
language**, and for those, handing every line to the browser gives up the project's
rule for nothing at all — there is no second language to be confused with. `Hello`
followed by `ہیلو` came back left-to-right, which is exactly the fault this project
exists to fix. `plaintext` earns its keep only when a draft really does hold both.

Everything section 23 had to build and defend goes with it: the undo stack, the caret
save and restore, the layer-mirroring observer, `takeRecords()` against the hang. Undo,
IME, dictation, autocorrect and spellcheck go back to being the browser's problem.

### What it costs, measured

| the line, while it is being typed | 0.3.0 (elements) | plaintext always | now |
|---|---|---|---|
| `Hello ہیلو`, on its own | rtl | **ltr** | rtl |
| `npm install کے بعد چلائیں`, among other Urdu lines | rtl | **ltr** | rtl |
| `npm install کے بعد چلائیں`, above `Run the build` | rtl | ltr | **ltr** |
| `Run the build and check it.`, among Urdu lines | ltr | ltr | ltr |
| `12345` | rtl (followed the box) | ltr | rtl in an Urdu draft |

One row is a loss, and only in a draft that is genuinely two languages at once: the
project's rule versus the browser's, any RTL word against the first strong character.
That line reads right-to-left the moment it is **sent**, where the lines really are
elements of ours. It is written down as a passing test in `composer.test.js`, not as a
wish, so the day somebody claims otherwise it says so.

Buying that last row back means owning the pixels the caret sits on: wrapping the lines
of the box you type into (React owns no children there — its JSX passes none) and, in
place of React's mirror, drawing our own from a **clone** of it. A clone is safe where
0.3.0 was not, because the mirror is `aria-hidden` and `pointer-events:none` — there are
no handlers on it to lose. It also brings back everything 0.3.0 had to carry for
wrapping a live editor: its own undo stack, caret save and restore, an IME guard. Not
done, and not because it cannot be.

### What the fourth row cost, and why it came back

`12345` on its own line in an Urdu draft: under `plaintext` it is left-to-right, because
the bidi algorithm's rule for a paragraph with no strong character is left-to-right and
`direction` is never consulted (measured; see below). Under `rtl` the box turns as a
whole and the digits go with it, which is what a person writing Urdu expects. So a line
holding neither kind of letter — digits, a bare path, an empty line — is counted as
voting for **nothing**, rather than as English. Otherwise a draft would fall out of
`rtl` and rearrange itself the moment somebody typed a file path under their Urdu.

### A wrong assumption, caught by measurement

The box-level flag was expected to work *alongside* `plaintext`, catching the lines with
no strong character in them. Measured in Chromium, `direction` on an element that is
`unicode-bidi: plaintext` **changes nothing at all** — not a digits-only line, not the
caret waiting on an empty one. The bidi algorithm's own rule is that a paragraph with no
strong character is left-to-right, and the property is never consulted.

So the two cannot be combined, which is why the states are exclusive: a box is either
turned as a whole or handed to the browser line by line, never both.

### The rule this leaves behind

> An attribute is ours to set. Somebody else's child node is not ours to move.

Setting `data-bidi` on a host's element is safe: React does not enumerate attributes it
never set. Re-parenting, replacing or dropping one of its children is not, however
carefully it is done, because the host is entitled to remove that node from the parent
*it* put it in. The sent-message split still moves nodes — it has shipped since 0.2.0
and works, because a sent message is never updated again — and it is the one place left
in this project standing on that distinction.

---

## 26. The lines really do have to be elements — just not in React's half

Section 25 replaced the crashing per-line elements with a stylesheet, in three states,
and it shipped. Typed into, next to a browser chat box, it failed on the thing the
comparison made obvious:

1. write `Hello ہیلو` — in the browser it reads right to left. Here it did too, in the
   `rtl` state.
2. press shift+enter and write `Hello 2` — in the browser the new line is left to right
   **and the line above does not move**.
3. here, the draft became `mixed`, the whole box went to `unicode-bidi: plaintext`, and
   the line already on the screen **swung back to the left**.

That is not a rough edge. A line that a person has finished writing and can see is
finished. Re-deciding it because of something typed afterwards is the same fault as the
original bug wearing different clothes.

And it is not fixable in CSS. `plaintext` is per-line, but it is per-line **by the first
strong character**, applied to every line every time. There is no way to say "this line
was decided by a different rule, and it is not up for discussion".

So the lines are elements after all. What changed is *whose* DOM they are made in, and
that distinction was read out of Claude Code's own bundle rather than assumed:

| | who owns the children | what we may do |
|---|---|---|
| `messageInput` | **nobody.** `D("div",{ref:b1,contentEditable:"plaintext-only",…})` — no `children` prop at all. React renders nothing into it; its contents are the browser's. | wrap them |
| `mentionMirror` | **React.** `T("div",{ref:z5,…,children:[n5, hint]})` | read only — `cloneNode`, nothing else, ever |

### The arrangement

- the box you type into is wrapped, one element per line
- **React's mirror is hidden** — by a rule that only matches once ours is up, so a
  failure anywhere leaves the host's own layer on the screen rather than a blank one
- **our mirror** — a clone of theirs, wearing their own class so every pixel of its
  styling is theirs rather than a copy that can go stale — is what you read

Cloning is the whole safety argument. Nothing of React's is moved, removed or replaced,
so its fibers keep pointing at exactly the nodes it put there and it can update or
unmount them whenever it likes. And the clone loses nothing: the mirror is
`aria-hidden` and `pointer-events:none`, so there is not one handler on it to lose.
Chips, misspellings and the argument hint all come across.

`test/host-owned-dom.test.js` — written against the crash, and the reason it is stated
as a rule rather than a symptom — passes unchanged.

### The shape of a line, measured four ways

Each candidate on its own page, because the first run of this had all four stylesheets
in one document and every candidate silently inherited `display: block` from another:

| | direction | **aligned** | height | textContent | copies back |
|---|---|---|---|---|---|
| inline isolate — *what 0.3.0 shipped* | right | ✗ **hugs the left** | same | exact | exact |
| `display:block`, newlines between | right | ✓ | **+50%** | exact | doubled newlines |
| **`display:inline-block; width:100%`** | right | ✓ | same | exact | exact |

So 0.3.0 never aligned a composer line at all. It ordered the characters and left the
line against the left edge — and its tests could not tell, because they read our own
`data-bidi-line` attribute instead of asking the page where the text was. Every test in
`composer.test.js` now measures pixels.

`width: 100%` is what earns the alignment: it gives each line a line box of its own, so
`text-align: start` resolves against **that line's** direction. `unicode-bidi: isolate`
stops a line reordering its neighbours. And the `\n` characters stay in the DOM between
the lines, because `textContent` is what gets sent.

### Undo, which is cheaper than it was

Rewriting a box's insides destroys the browser's undo stack. 0.3.0 rebuilt on every
keystroke and so had to carry a complete replacement.

This one asks first: `intact()` checks that the children are still exactly our line
elements separated by single newlines. Ordinary typing — **including typing the first
Urdu letter, the keystroke that turns a line** — changes nothing structural, so all that
happens is one attribute, and the browser's own undo goes on working underneath.
Rebuilding is left for adding, splitting or joining a line, and for a paste.

The stack is still carried, and ctrl+z is still taken over for the whole box, because
half-owning an undo stack is worse than owning it: a draft that loses its last Urdu
letter has our elements taken out from under it, and by then the browser's idea of what
to put back is several keystrokes stale.

### The rule, now that it is ours to write

Per line, live:

| the line | reads |
|---|---|
| holds an RTL letter | rtl — **whatever it opens with** |
| holds a strongly left-to-right letter and no RTL | ltr |
| holds neither — digits, a bare path, an empty line | follows the draft it sits in |

The third row is the one CSS could not do at all. A line of digits under three lines of
Urdu belongs with them; the bidi algorithm's own answer is left-to-right, and it would
sit on the wrong side.

### Order of operations, which is a safety property

The host's mirror is found **first**. If it is not there — a rename upstream, a layout
nobody has seen — nothing happens at all. Wrapping the box you type into while the layer
you READ is still the host's would put the caret on one side of the panel and the glyph
on the other, which is worse than doing nothing.

---

## 27. Stopping: the composer takes one direction, and that is the answer

Section 26 shipped as 0.3.3. Typed into, it did this:

> press a key — nothing appears. Press the next — the first one appears.

Every keystroke reached the screen one keystroke late. Nothing was lost and nothing
crashed; it was simply not a box anybody could write in.

### Where the keystroke went

Reproduced in ten lines, and the reproduction is the whole finding:

| the composer is… | typed | on screen |
|---|---|---|
| already in the page when the payload runs *(what every test did)* | `ہ` `ہی` `ہیل` | `ہ` `ہی` `ہیل` |
| built after the payload runs *(what the real webview does)* | `ہ` `ہی` `ہیل` | *(nothing)* `ہ` `ہی` |

Our mirror was painted from the host's mirror in a **capture-phase `input` handler**,
which runs before the host has redrawn its own — so it always painted the previous
text. The MutationObserver that existed precisely to correct that, in the same task,
before the frame, never ran: it is attached with

```js
var boxes = document.querySelectorAll(composer.container);   // at start()
```

and at `start()` the composer **does not exist**. The payload is appended to the end of
Claude Code's own bundle; React has not rendered the input yet. `boxes.length` is 0, the
observer is attached to nothing, and the only thing left driving the clone is the one
handler that is guaranteed to be early.

Fixable in a line — delegate, or attach lazily. It was not fixed, and that is the
decision this section records.

### Why it was not fixed

Three attempts at per-line direction in a live editor, three faults, and each one was
found by a person typing rather than by a test:

| | what it did | how it failed |
|---|---|---|
| 0.3.0 | elements per line, inside React's mirror | React's nodes thrown away → **the box typed blank spaces**, then `removeChild` threw in React's commit phase and **took the panel down** |
| 0.3.2 | no elements; `unicode-bidi: plaintext` when a draft mixed languages | a line already on the screen was **re-decided** by the next line typed under it |
| 0.3.3 | elements per line in the box, a **clone** of React's mirror to read | **every keystroke one keystroke late** |

Each fix was correct about the fault before it. The pattern is not a run of bad luck:
an editor is a live thing somebody else owns, and every one of these needed our code to
run *between* a key being pressed and the frame being painted. That is a place with no
margin, and being right there three times in a row is not a plan.

**Typing is what a composer is for.** A box that reads the wrong way round is a
complaint; a box that types a letter behind is unusable. So the composer takes ONE
direction, live, from any RTL letter in it — one attribute, one CSS rule, nothing of
ours inside either layer, and no code of ours running while anybody types.

Undo, IME, dictation, autocorrect and spellcheck go back to being the browser's job.

### What is given up, stated plainly

A draft that mixes Urdu and English goes right to left as a whole. An English line
inside an Urdu draft is carried along with it. That is the platform's limit — a line is
a `\n` inside one text node, and the only place to put an element per line is inside a
mirror React owns — and it is now **accepted rather than fought**. There is a passing
test that says so, so changing it has to change the test and give a reason.

The rule still applies in full where it costs nothing and cannot be felt: the message
once it is **sent**, where the lines are real elements in a page nobody is typing into.
That was the belief, and the per-line tests said it had held since 0.2.0. Section 34 is
what the real panel said instead.

### The gap in the harness, for the third time

Every one of these three faults was invisible to a green suite, and each time for the
same reason: **the harness modelled as already-there a page that is built at runtime.**

- 0.3.0 — the mirror was modelled by `mirror.textContent = input.textContent`, which
  keeps no reference to anything it creates. React's one contract did not exist in the
  model. → `test/host-owned-dom.test.js`
- 0.3.3 — the composer was in the page before the payload ran, so an observer that is
  dead on the real page was alive in the test. → `"a composer that arrives after the
  payload behaves the same in every way"`

Both of those tests are now in the suite, and both fail against the build they were
written for. The second one is the more general lesson, and it is worth stating as a
rule: **a harness that builds the page before the code under test runs cannot see
anything about a page that is built afterwards.**

---

## 28. The question left over: would it ever have felt fast?

Stopping left one thing unanswered. The three per-line builds each failed on
correctness, and each failure was fixable — so *if* the code had been right, would a
composer that watches every keystroke have been as quick to type in as one that does
nothing? It is worth an answer, because "we could have fixed it" and "we should have"
are not the same claim.

Measured rather than argued, and the first attempt at measuring it was worthless:
driving Playwright's keyboard and reading `requestAnimationFrame` gave numbers in
which the **unpatched** page was slower than the patched one. That is jitter, not a
result. So the box is driven from inside the page, microtasks are flushed between
characters so the MutationObserver work is counted, and style and layout are forced
each time. What is left is the work itself.

**Milliseconds of work per character typed:**

| lines already in the box | none | 0.3.4 *(shipped)* | 0.3.3 *(per-line)* | |
|---|---|---|---|---|
| 0 | 0.21 | 0.27 | 0.58 | ×2.8 |
| 5 | 0.36 | 0.41 | 1.24 | ×3.4 |
| 20 | 0.60 | 0.73 | 3.06 | ×5.1 |
| 40 | 1.15 | 1.32 | 6.20 | ×5.4 |
| 80 | 2.84 | 2.61 | **18.05** | ×6.4 |

What shipped is free: 0.3.4 sits inside the noise of doing nothing at all, at every
size, because one attribute is all it writes.

The per-line build is not. At eighty lines it spends **18ms per character — more than
a whole frame at 60fps**, on every keystroke, before the browser has drawn anything.
That is not a number you can type behind.

### Whose cost is it — the idea's, or the code's?

The code's. `paintMirror` rebuilt the entire visible layer on every keystroke: clone
every child of the host's mirror, re-split the whole draft, rewrap every line. That is
O(the whole draft) per character, and the table is that O showing itself. The idea does
not require it — only the line that changed needs anything doing to it, and 0.3.3
already did exactly that for the box you type into, through `intact()`. The visible
layer never got the same treatment.

So the honest answer to the question is: **yes, it was almost certainly possible.** Not
as written — as written it was measurably too slow, and the instinct that it might be
was right where an argument from "it is only a regex per line" was wrong. But there is
no barrier of principle between the version that was built and one that is both correct
and free.

### And it is still the right place to stop

What that version costs is not CPU. It is ownership: a text layer of ours living inside
somebody else's editor, in the hottest path there is, carrying its own undo, IME,
dictation and spellcheck, re-deriving whatever the host adds to its mirror next, and
re-verified against a bundle that changes every week. All of that buys exactly one
case — a draft that mixes two languages *while it is being typed*, which reads
correctly the moment it is sent either way.

Three attempts, three faults, none caught by a green suite. The measurement above does
not say the fourth attempt would have failed. It says what the fourth attempt would
have had to be worth, and it is not worth that.

---

## 29. A string of lamps, not a circuit in series

This fix lives inside somebody else's product. One day it will meet a version of that
product nobody has seen, and the question that matters then is not whether everything
still works. It is **how much goes dark**, and whether anything of ours starts arguing
with a fix of theirs.

Two promises, and both are now measured rather than asserted in a comment.

### 1. One lamp at a time

The audit found three places wired in series, where one fault took out everything
behind it:

| where | what happened before | now |
|---|---|---|
| `drain()` — decides a batch of blocks in one loop | the **first** block to throw ended the pass, so every block behind it went undecided; then the next batch; then the feature, silently | each block is decided inside its own `try`, and the count of contained faults is reported |
| the quiet timer's catch-up pass | the same | the same fix |
| `decidePerLine` — the one thing that restructures anything | a throw took the block's ordinary decision with it | it fails on its own; the block still gets the whole-block decision |
| an unusable selector | threw on **every batch, for ever**, silently | asked once at start-up; what cannot be used is not used, and the parts that do not depend on it carry on |

Everything above that lives in the adapter is now a **lamp**: asked before it is
switched on whether it is needed and whether it is possible, wrapped so a throw cannot
reach another lamp, and reported. `__bidiStatus()` in the webview console says which
parts are on, which stood down, and why — because a fix that silently stops working
looks exactly like a fix that is working.

### 2. Stand down, do not fight

If Claude Code fixes something itself, the part of this that existed for it must go
quiet. Two fixes for one fault fight each other, and the fight is invisible to whoever
shipped either of them.

**"Needed" is measured, never read.** A rule can be renamed, moved, overridden or
shipped in a second file, and a text search over their stylesheet would lie in
whichever direction is most expensive. So the page is asked to lay out the exact
sentence the fault is about, in a copy of their own container, off screen:

| paragraph | what it is for |
|---|---|
| `اسلام علیکم کیسے ہیں` — the **control** | in any build that decides a line's direction at all, this reads right to left. If it does not, the container found is not the one the fault lives in, the measurement means nothing, and it is thrown away rather than believed |
| `npm install کے بعد…` — the **subject** | left to right = the fault is still here. Right to left = somebody fixed it, and everything of ours comes back out through the same escape hatch a person would use |

The probe carries no decision of ours, so our own stylesheet cannot answer our own
question. And it is taken out again whatever happens.

Two more stand-downs on the same principle: the unpinning rule asks the live element
whether a turn header is still `position: sticky`, and the timeline dot refuses to
install unless it can read three plain pixel numbers.

### What this cost to get right, and what found it

Two real faults, both introduced by the resilience work itself:

**`stop()` did not cancel work already in flight.** A pass is queued as a microtask, so
one can be mid-air when the fix stands down — and it would then write a decision into a
page that had just been handed back, with nothing left to remove it. Found by the test
that stands the fix down the moment a message arrives.

**The question asked itself for ever.** Asking means putting a probe in the page and
taking it out again, and the thing deciding *when* to ask is watching the page. On a
page where the question cannot be answered yet, each ask caused the next one. Not a
slow loop — a **hang**, and the panel never finished loading.

That one was not found by any test. It was found by booting the real 5MB bundle, and
the copied page could not have found it: the copy always has a container the probe can
measure in, so the first ask always gets an answer and stops. Same shape as every other
gap this harness has had — **the model was easier than the thing**. Both faults now have
tests, and the real-bundle boot is part of how a build is checked.

### The rule the whole project now runs on

> Every dependency must fail to **nothing happens**, never to **something breaks**.
> An attribute is ours to set. Somebody else's child node is not ours to move.
> And if they fix it themselves, we are the ones who go quiet.

---

## 30. The copy button that blinks — found, measured, and deliberately left alone

Hovering the copy button on a code block while an answer streams makes it flicker, fast,
the whole time the answer is arriving.

It is theirs, not ours, and that was settled before anything else was said about it —
"it started after I installed your thing" is the only evidence anybody ever has, so it
had to be answered with a measurement rather than a denial. Same page, same mouse
position, same stream, with the fix and without it:

| | blinks |
|---|---|
| no patch, the renderer replacing the block as it re-parses | 27 |
| **with the fix**, same | **27** |
| with the fix, nothing replaced | 0 |
| no patch, nothing replaced | 0 |

Identical both ways, and the stronger form of the same answer is asserted permanently in
`real-webview.test.js`: **no rule of ours matches that button or its wrapper at all**,
checked by putting every rule in our stylesheet to the live element.

### What it actually is

Their own two rules, and nothing in JavaScript decides it:

```css
.copyButton_CEmTFw                                { opacity: 0; transition: opacity .15s }
.codeBlockWrapper_-a7MRw:hover .copyButton_-a7MRw { opacity: 1 }
```

Pure CSS `:hover`. It can only blink if the hover state is lost, and hover is lost when
the element under the pointer is **replaced** — which is what their renderer does as it
re-parses what has arrived so far. The new element is not hovered until the pointer moves
again, so the fade restarts, over and over.

### It is not the button. It is what is being re-parsed.

Found by using it, not by reading anything: the copy button on a **code block in an
answer** blinks, and the copy button on a **Bash tool block** does not — during the same
stream, on the same screen.

That looked at first like two different buttons behaving differently. It is not. Both are
the same hover-revealed control:

| button | belongs to | hidden until hover? |
|---|---|---|
| `copyButton_-a7MRw` | the markdown renderer — a code fence in an answer | yes, `codeBlockWrapper:hover` |
| `copyButton_F2hEIg` | the Bash tool — its command row | yes, `inputRow:hover` |
| `copyButton_Eg8KCQ` | the sign-in panel | no, always visible |

So the difference cannot be the button, and the measurement above already says what it is:
**replaced → 27 blinks, not replaced → 0.** The markdown of an answer is re-parsed on every
chunk, so anything inside it is rebuilt; a tool block's command is settled the moment the
call is made and only its output grows underneath.

That is worth more to whoever fixes it than the blink itself, because it says where to
look. The fault is not in a button. It is that **re-parsing the whole partial answer
replaces elements a person may be pointing at** — and the copy button is simply the one
place where a replaced element is visibly different from the one it replaced.

### And the copy button is not the worst of it

If elements are being replaced under the reader, then a reader who is SELECTING TEXT
while an answer streams should lose the selection the same way. That was a guess, so it
was measured before it was written down anywhere:

| what happens to the block | the selection |
|---|---|
| replaced, as the re-parse does | **lost entirely** |
| text only appended below it, control | kept |

So: **highlight a sentence in an answer that is still arriving, and the highlight goes.**
That is worth more than the blink, costs everybody the same regardless of language, and
has the same single cause. The copy button is simply the one part of it that is visible
without trying to do anything.

### How bad, exactly

The question that decides whether it is worth touching: is it still clickable?

| | clicks that landed | opacity when clicked |
|---|---|---|
| control — same clicks, nothing replaced | 11 of 12 | 1.00 every time |
| the real case — blinking | 11 of 12 | 0.11 – 0.58, never settling |

**Identical**, which is the answer: the lost click is in the harness, not in the panel.
Every click reaches the host. The button is fully functional and never finishes fading
in. It is a flicker, and it stops the moment the answer does.

### Why it is not fixed

Because the only lever is their design decision, not their fault.

The blink comes from the element being replaced, so no CSS can restore a hover state that
the browser has correctly decided does not apply. The one thing CSS *can* do is stop
depending on hover — make the button always visible — and that is not fixing a bug, it is
overruling a choice they made about their own interface. This project has refused that
before and been right to: 0.0.1 forced the collapse row sticky and moved a button the
extension had placed, and it was withdrawn immediately.

The JavaScript route is worse. Re-applying a class to the new element on every re-render
means running our code in the hottest path there is — while an answer streams — to cure a
flicker. That is the exact trade sections 25 to 28 were spent learning to refuse.

### The rule this sets, next to section 10

Two bugs of theirs, found the same way, treated oppositely — and the difference is not
how interesting they are, it is what they cost:

| | the expanded message | the blinking button |
|---|---|---|
| can you do the thing? | **no** — cannot close it, cannot read the answer, must reload the panel | **yes** — every click lands |
| how do you escape it? | scroll past the whole turn, or reload and lose your place | wait; it ends with the answer |
| could we wait for them? | no. It makes long sessions unusable, and there was no telling when | yes. Nothing is prevented meanwhile |
| so | **found it, and carried the fix ourselves** | **found it, measured it, wrote it down, handed it over** |

Both halves of that are deliberate. Carrying somebody else's fix is a cost you take on for
as long as you carry it, and it is only worth taking when the alternative is people not
being able to work.

### And the reason it is written down at all

Writing the code is the cheap half now. What took the time here was **noticing** — that a
pinned element taller than the window can never show its own bottom, that it only appears
in long sessions, that the wheel is not doing nothing — and then choosing, out of several
fixes that all looked correct, the one that was actually right. Capping the height looked
correct. Forcing the collapse row sticky looked correct. Both shipped and both were wrong.

So the finding gets recorded with the same care as the fix, including the findings we
decided not to act on. This is one of those.

---

## 31. The status bar was telling the truth about the wrong thing

The item in the corner makes one claim — *the right-to-left fix is on* — and that claim
is the entire reason it exists. VS Code's own Enable, Disable and Uninstall buttons
cannot be believed about this extension, because it edits a file the editor does not know
was touched. This is the only place a person can find out. So it had better be right.

Three things were wrong with it. Only the first one was visible.

### The icon already meant something else

It was `$(whole-word)` — the "ab" glyph. That is the **Match Whole Word** toggle in VS
Code's own Find widget, so to everybody who uses Ctrl+F it already means something, and
what it means is not this. At 16px it is also two letters and an underline, which is mud.

Looking for a better one answered the question a different way. Of the **759 codicons in
the build**, not one is an alignment or a text-direction mark — the names were read out
of `workbench.desktop.main.js` rather than guessed at. The picture cannot say "right to
left". Only the word can. Which leaves the mark exactly one job: to say which of the two
states this is.

### The words: taken away, and put back

`RTL on` and `RTL off` differ by one letter, at the end of the phrase. Rendered at the
real 12px in a 22px bar, on the real theme colours, and then blurred to roughly what the
corner of an eye receives — which is how a status bar is actually read, because nobody
looks at it — **the words vanish and the marks do not.**

That measurement is real and it is still the reason the marks are there. The conclusion
drawn from it was not. **0.4.5 dropped the words. 0.4.6 put them back**, and the reason is
worth more than the original argument was.

A blur is not how anybody uses this. It is how the bar looks in the half-second you are
not attending to it — and in that half-second nobody is asking the question either. The
moment the words matter is the opposite moment: somebody has stopped, turned their head to
the corner of the screen, and is deliberately trying to find something out. At *that*
moment a word beats a symbol, because a symbol still has to be decoded and a word does not.

So both, and each for the case it is good at. **The mark is for the glance, the word is
for the look.** `✓ RTL on` and `⊘ RTL off`.

Two objections that had to be given up with it. `⊘ RTL off` does put a negation in twice -
the slashed circle already means "not" - and that is a real cost, paid because being told
plainly beats being elegant. And a screen reader still cannot see a tick, which is why
`StatusBarItem.accessibilityInformation` carries the full sentence regardless: "RTL" as an
abbreviation is worse spoken than written.

### "Off" was five situations wearing one word

Each of these was set up on a real disk with a real stand-in for Claude Code and put to
`isPatched()`, rather than argued from reading the code:

| | situation | how likely |
|---|---|---|
| R1 | Claude Code is not installed at all | invisible under the default setting — the item only appears on a Claude Code tab, which cannot exist |
| ~~R2~~ | ~~`autoApply` is off and Claude Code updated~~ | **gone in 0.4.9** - the setting was removed, and this way of ending up off went with it |
| R3 | the write failed — EPERM, a lock, antivirus, a read-only file | environmental, and unmeasurable from here |
| R4 | Claude Code re-installed at the **same** version, so the `onDidChange` guard skips it | occasional |
| R5 | the moment during any update, before the fix goes back | every update, for an instant |

Only the sixth — the person turned it off — is a decision anybody made. And R1 was a
closed door: with `statusBar: "always"` and no Claude Code, the item said "off" and
invited a click that answered "Claude Code is not installed".

The tempting fix was a third state, `⚠ RTL not applied`. Counting honestly is what killed
it: **almost nobody would ever see it.** A visible state built for an audience of nobody
is not carefulness, it is weight — more to render, more to explain, more to get wrong.

So there are still two marks. But the replacement - a sentence for each of the five,
living in the tooltip - was the wrong lesson from the right observation, and it lasted
exactly one build.

"A tooltip costs nothing until somebody wants it" is false. It is read by somebody who is
already unsure, and a paragraph handed to an unsure person is worse than the one short
answer they came for: they now have to work out which part is about them. **A rare mark
was traded for a permanent wall of text.**

Cutting them to three did not fix it either, and that took a third build to admit. Three
short sentences are still sentences: they have to be **read**, and reading is the one thing
the person hovering has not agreed to do. Their hand is already on the mouse. They want the
answer in the time it takes to look at it, not to parse it.

So the tooltip stopped describing the situation and started naming the action:

    on            "Turn off right-to-left fix"
                  "Do this before uninstalling"
                  "The fix stays on after uninstall"
    off           "Turn on right-to-left fix"
    no Claude     "Claude Code is not installed"

The state is on the bar beside it, spelled out - `✓ RTL on` - so saying it again in the
tooltip was a second copy of something already on screen. What is not on screen is what
happens if you click, and that is now the whole of it.

The Uninstall warning survives, and the reason it does is the reason it now has a line of
its own. Nobody guesses that VS Code's own Uninstall leaves this running - the file being
edited belongs to somebody else and the editor has no idea it was touched - so it is worth
a line. What it was not worth is being **tacked onto the first one**, which is what made
that first attempt a sentence: two ideas sharing a line is exactly how a label turns back
into prose.

So: the action on the first line, the one thing nobody guesses on the second, and only in
the state where it is true. There is nothing to warn about when the fix is already off.

The test holds the line: at most two lines, each of them under 32 characters, none with a
full stop in it, no "Uninstall" in the off state, and never the word "Turn" in the one that
cannot be turned.

### The thing that was actually wrong pointed the other way

Chasing those five turned up a worse one, in the opposite direction — not "it says off
when it is fine", but **it says on when it is not**.

`isPatched()` looked for the `BEGIN` marker. That is not the same question as whether the
fix runs. The block carries a 24-hour stamp; past it the payload returns immediately and
does nothing at all, and it is still very much in the file. The two facts had been treated
as one.

Worse, nothing was winding the clock. Re-stamping happened on activation and on
`extensions.onDidChange` — there is no timer anywhere in `src/` — and activation happens
**once per window**. So:

> Leave a VS Code window open past a day, then open a Claude Code tab. The stamp has run
> out, the payload turns straight around, right-to-left text is not being fixed — and the
> status bar is showing a tick.

The panel already on screen keeps working, because the expiry is read once as the payload
loads. It is the next one that gets nothing. `patch-format.js` said "every activation
re-stamps it, so in use it never expires", and that sentence was only ever true of a
window restarted daily.

Two changes, and they are different in kind:

- **`STAMP_EVERY_MS`, six hours.** Something has to come back, so now something does. It
  is deliberately far shorter than the twelve-hour re-stamp threshold: several can be
  missed outright — a sleeping laptop is the ordinary way — and the block is still
  re-stamped with half a day in hand. A tab opening gets the same chance, because that is
  the moment a webview is about to load and a machine waking from sleep has late timers.
  The check itself is a comparison of two numbers in memory; the disk is reached at most
  once every six hours.
- **`patcher.state()` reports `present` and `live` separately.** The commands act on what
  is in the file; the status bar reports whether anything is happening. Now that a block
  can be both present and dead, those are two questions and they get two fields. The
  timer should mean `live` is never false while the extension runs — this is the backstop
  that stops it lying if it ever is.

The expiry itself was left exactly as it is. It is what makes an uninstall certain when
`vscode:uninstall` has been broken since 1.69 (see section 14), and that is worth more
than the inconvenience it just caused.

### And one thing found on the way

`isPatched()` read Claude Code's **entire bundle — about five megabytes — on every tab
change**, to look for a marker that is always in the last few kilobytes, because
everything this extension writes is appended. It now reads the final 512KB. A byte window
can cut a UTF-8 character in half where it starts; that is harmless here, because what is
searched for is ASCII, sits well inside the window, and nothing read this way is ever
written back.

The test for it plants a `BEGIN` at the **front** of a 3MB file and requires that it is
not reported, which is what makes the cheap read honest rather than lucky.

---

## 32. Every message, read out loud one at a time

Thirteen things this extension can say to somebody. They had grown the way strings do —
each written at the moment it was needed, none of them ever read next to the others.
Going through them in order found the same three faults again and again.

### Half a sentence is worse than none

The one that took three attempts was a single tooltip line. It began as

    Uninstalling does not turn it off

which says what will NOT happen and leaves the reader to work out the rest. It became

    Do this before uninstalling
    Uninstall does not stop it

— an instruction with a reason under it, which is the right shape and still the wrong
words: "it" has to be resolved, and "does not stop" is a negative the reader has to turn
into a consequence themselves. Both of those are work. The version that stands says the
consequence outright:

    Do this before uninstalling
    The fix stays on after uninstall

**Where you tell somebody to do something, put the reason underneath — and state the
reason as a thing that happens, not as a thing that does not.**

### Two ideas on one line is how a label turns back into prose

`Turn off right-to-left fix - uninstalling does not` reads as a sentence and has to be
parsed. The same words on two lines are taken in at a glance. Nothing was cut; a line
break did the work.

### Say what it means for the reader, not what is true

    Claude Code (anthropic.claude-code) is not installed in this editor.
    Claude Code is not installed, so there is nothing to fix.

The first is accurate and leaves somebody asking "and?". The extension id was the first
thing the eye landed on and means nothing to a reader. The clause that replaced it is the
only part they needed.

### And two faults that were not about words at all

**A setting whose own description has to warn you off it should not exist.**
`smartrtl.statusBar` offered "never", and its text had to add "use the command to turn the
fix off instead". `smartrtl.autoApply` was worse: turning it off did nothing except let
right-to-left text break silently after a Claude Code update — it was R2 in the table in
section 31, one of the five ways to end up "off". Both settings are gone and the settings
page is empty. Ten sentences a person had to read and decide about, for two choices
nobody benefits from making.

**And one message was being chosen by the wrong question.** `turnOn` read its answer off
`apply()`, which reports whether the FILE changed. A block whose stamp has run out is
still in the file, so apply() only re-stamps it and answers "restamped" — while the panel
on screen carries on running the dead copy. Somebody who had just clicked a bar reading
`RTL off` was told **"Right-to-left fix is already on"**, and offered no reload, which was
the one thing that would have put it right. It now asks what was actually RUNNING before,
which is the question the person is asking.

That one was found because somebody refused to accept "it can happen in theory" and asked
for it to be run instead.

### Then somebody asked whether they happen at all

The wording had been argued over for an afternoon before the useful question arrived:
**which of these does a person ever see?**

It cannot be answered by reading, because the answer lives in three places at once — the
`when` clauses in package.json, the command the status bar item carries, and what
`apply()` and `remove()` return. So a stand-in editor was built instead:
`test/reachable-messages.test.js` runs `activate()` in it and, for every state the disk
can be in, presses exactly the commands VS Code would offer, honouring the same
when-clauses VS Code honours.

Three messages were produced by nothing:

| | why it cannot happen |
|---|---|
| "Right-to-left fix is already on." | Turn On is only offered while the fix is off — in the palette, the Extensions menu and on the status bar alike |
| "Right-to-left fix is already off. Claude Code is untouched." | and Turn Off only while it is on |
| "Claude Code is not installed, so there is nothing to turn off." | Turn Off is not offered at all without Claude Code |

All three are gone, and with them the branches that chose between them. What is left says
the resulting state — *the fix is in place* / *the fix is off* — which is true whether or
not anything had to be done to the file. **One answer that is always right beats two that
have to be chosen between.**

That also retired the fix from the paragraph above. `turnOn` had been taught to ask what
was RUNNING rather than what apply() did to the file, to stop it saying "already on" to
somebody looking at a bar reading `RTL off`. Deleting the message deletes the question:
there is nothing left to choose.

The test stays, and it has teeth — it was checked by putting an unreachable message back
and watching it fail. It also caught a fault in its own harness first: firing
`extensions.onDidChange` was not enough to reproduce a Claude Code update, because the
real thing arrives as a **new folder with a new version in it**, which is precisely what
the guard against other extensions being installed is there to tell apart.

---

## 33. Installing it said nothing, and the reason was a file we shipped by mistake

Somebody installs an extension and is told nothing at all. That is the question that
started this, and it turned out to have two separate answers.

### The first: silence was the design, and the design was half right

Activation only spoke when `apply()` answered **"applied"** — when the file on disk had
actually changed. Re-install the extension over a patch that is already there and
identical, and nothing changed, so nothing was said.

That is right for a window opening, and wrong for an install. **Installing something is a
deliberate act, and silence after a deliberate act reads as "did that do anything?"** —
especially here, where being quiet the rest of the time is the whole point, so there is
nothing else for a person to go on.

`freshInstall()` already knew the difference and was only being used to decide whether to
ask about a fix left switched off. It writes a marker into the extension's own folder and
reads it back; an upgrade lands in a **new folder**, so it is true for a re-install and
for every update, and false for an ordinary restart. Now it also picks the greeting:

| | what they are told |
|---|---|
| first install, nothing patched yet | *Right-to-left text is fixed. Reload to see it.* |
| re-install or update, and it was already working | *Right-to-left text is fixed.* |
| an ordinary window opening | nothing |
| re-install, and they had switched it off | *SmartRTL is installed, but the right-to-left fix is off.* |

Same sentence, and the half that asks for a reload appears only when there is a reason to
reload. The reload test changed at the same time, from "did the file change" to
**"was it actually running a moment ago"** — a block whose stamp has run out is still in
the file, so the file needs no change while the panel on screen very much needs a reload.

### The second: the marker was inside the .vsix

And it would not have worked anyway.

`.smartrtl-installed` was **committed to the repository and packaged into eight builds**.
Packaged, it is already in the folder when the extension arrives — so `freshInstall()`
finds a marker on its very first run and answers "no", for ever. The re-install question
could never be asked in 0.4.10 through 0.4.17.

It got there the way these things do: `test/reachable-messages.test.js` handed `activate()`
the real extension folder, activation wrote its marker there, and `git add -A` swept it up
in the same commit that added the test.

Three changes, because one of them is not enough:

- the file is untracked, and named in `.gitignore` and `.vscodeignore`
- the test hands `activate()` a throwaway folder with only the payload in it, which is all
  `apply()` reads from there — so nothing writes into the repository any more
- and a test refuses to pass if the marker is in the extension folder or missing from
  `.vscodeignore`, which is the pair of facts that made it ship

**A test that writes into the thing it is testing can ship its own droppings.** That is
the lesson, and it cost eight builds of a feature that quietly did nothing.

### Which messages name the version, and which do not

Going back through all seven, one at a time and next to their own histories, settled a
rule rather than a wording. **The build number belongs where the build is the point.**

| | names Claude Code and its version | why |
|---|---|---|
| just installed | yes | says which build was worked on, and which extension is speaking - a toast does not |
| Claude Code updated | yes | the version changing *is* the news |
| Show status | yes | it is a report somebody asked for, not a notice they were handed |
| you turned it off | no | nothing about switching it off depends on a build |
| no Claude Code | no | there is no version to name |
| re-installed, still off | no | it is about a decision the person made, not about Claude Code |

Trying it in the wrong place shows why the rule is worth having. *"Right-to-left fix is
off and Claude Code 2.1.264 is back to normal"* reads as though that version had been the
thing wrong with it.

The other half of the same pass: the wordings that had grown a warning about Uninstall -
the first install message and the status report both carried one - lost it. It is in the
tooltip, the ⚙ menu, the README block and the Marketplace blurb, each where somebody is
actually about to uninstall something. **Repeating it a fifth time punishes the person who
only asked what the state was.**

### Five links that only break once it is packaged

The app README links to the write-ups by relative path - `../../docs/decisions.md` and
four more. They resolve in the repository, they resolve on GitHub, and every test said so.

They were dead on the Marketplace page.

`vsce` turns relative links absolute for you, and it does it against the **repository
root** rather than against the folder the readme is in. In a monorepo the readme is not at
the root, so what it wrote was:

    https://github.com/naveed-toro/smartrtl/blob/HEAD/../../docs/decisions.md

A browser flattens that to `https://github.com/naveed-toro/smartrtl/docs/decisions.md`,
which is not a file path GitHub answers to. All five, gone.

This is the second fault today that **only exists after packaging** - the first was
`.smartrtl-installed` being inside the .vsix. Neither can be seen by looking at the
repository, and both were found by opening the built file and reading what was actually in
it. That is now the habit: **check the thing that ships, not the thing it was built from.**

- the five links are absolute
- a test refuses any link in that readme that climbs out of its own folder

---

## 34. Accepting the limits: one direction for the box you type in, and one for a sent message

Claude Code 2.1.267 broke the box you type in, and nothing here noticed. Looking into why
found something older and worse: the line-by-line split of a sent message, shipped since
0.2.0 and written up in sections 21 and 24, had never run in the real panel at all.

Both are the same failure. And the answer to both was not a cleverer fix. It was to stop
insisting that the formula reach everywhere, and to build what remains so that the next
update is the least likely thing to break it.

### What 2.1.267 did

One property, added to three rules: `unicode-bidi: plaintext` on the box you type into,
on the mirror drawn over it, and on the placeholder. On 2.1.247 to 2.1.266 none of the
three had it. Measured on each build's own stylesheet:

| the draft | 267, no fix | 267, the rule as shipped | `direction` only, `!important` | all three, `!important` |
|---|---|---|---|---|
| `Hello ہیلو` | ltr | ltr | ltr | **rtl** |
| `npm install کے بعد` | ltr | ltr | ltr | **rtl** |
| an English-only draft | untouched | untouched | untouched | **untouched, 0px moved** |

Section 25 had already measured why: `direction` on an element that is `unicode-bidi:
plaintext` changes nothing at all. The rule had set `direction` and `text-align` and
trusted the page never to set `unicode-bidi`. The page set it.

Nothing noticed, for three reasons, and each is a thing to fix rather than regret. The
copied test page did not have the new property, so every composer test on it stayed
green. The real-stylesheet tests did catch it, but only when somebody ran them. And
`__bidiStatus()` went on saying `composer: "on"`, because the lamp only ever asked
whether the box could be found, never whether it had turned.

### What looking at it found: the sent message was never split

Claude Code puts a heading above every message somebody sends, for screen readers:

```js
j && D("h3", { className: `${w_.visuallyHidden} ${X5.screenReaderTurnHeading}`, children: EJ0(B) })
// EJ0: "You: " + the message on one line, cut at 120 characters
```

An `h3` is a block. It comes before the message. So the engine met it first, found an Urdu
word in it, and put the decision on the whole row - after which the message's own body
arrived inside an already-decided row, took the "already decided" path, and the split was
never asked for. Measured on the real stylesheet:

| | lines split | decided on | every line |
|---|---|---|---|
| the model, without the heading | 3 | nothing | rtl, ltr, rtl |
| the real shape, with it | **0** | **the whole row** | all rtl |

The heading was in 2.1.247, before this project began. The one live tick the split ever
got - versions.md, 0.2.0 - can only have been luck: the heading holds the first 120
characters, and a message whose first 120 held no Urdu word would have been split. Every
ordinary Urdu message took one direction as a whole, which is exactly what the person
using it reported, and what three rounds of explanation got wrong before the heading was
found.

The model had no heading because it was drawn by hand from what somebody expected a
message to look like. This is the fourth time in this file that the model was easier than
the thing.

### The decision

The formula does not have to reach everywhere. Where it runs, it must not stop when the
host updates. Of the four places text appears, two had been bought at a price that kept
being paid:

- **the box you type in** takes one direction, from any RTL letter in it - as it has since
  0.3.4 - and is now made to survive
- **a sent message** takes one direction, from what it says, as a whole. The line-by-line
  machinery is deleted: it was the only code here that built elements in somebody else's
  page, it could corrupt text rather than merely direction if it went wrong, and it had
  never run where it mattered
- **answers, streaming and finished**, are left exactly as they are. They are where the
  formula runs in full, and they have never broken - on all five builds measured. Their
  rules already set `direction` and `unicode-bidi` together, with `!important`, which is
  precisely why

### How the two are made to survive

Eight things. The first six are each an answer to something that actually happened; the
last two to something that has not happened yet and would have taken everything with it.

**Every property relied on is set here, not trusted.** `direction`, `unicode-bidi` and
`text-align`, all `!important`, on the composer's layers and on a sent message. Whatever
the page adds under them, these win.

**The host is described twice.** Once by its class names, and once by what its elements
are for - which a restyle does not change:

| | by name | by what it is |
|---|---|---|
| the box you type into | `messageInput_` | `contenteditable` with `role=textbox` |
| the layer drawn over it | `mentionMirror_` | `aria-hidden="true"` |
| a sent message | the content div inside `expandableContainer_` | the run handed to `dir="auto"` |

Checked across five builds before it was relied on: the names never changed, the roles
never changed, and `dir="auto"` occurs exactly once in each bundle - on the span a typed
message's text goes into. Each description is tested with the other taken away, and either
one alone turns the text. `dir="auto"` is also the most honest hook there is: it is the
browser's first-strong-character guess, applied by the page to text it did not want to
decide, which is the one rule this project exists to replace.

**Nothing of ours goes into their DOM.** With the copy gone, every part of this extension
is an attribute on an element the host rendered, plus one stylesheet. There is nothing
left for the host to trip over.

**Text that arrives without anybody typing it.** Read out of the bundle: Claude Code
empties the box itself after a send, and puts text in from code for history, completions
and forks - `b1.current.textContent = ...` - with no input event. The box is now also
asked on any change to it, in the same microtask, so before the paint. Measured: an
emptied box goes back to left to right, recalled Urdu turns, and no keystroke is late.

**Refuse to turn half of it.** If the layer drawn over the box cannot be found and the box
itself is invisible, nothing is turned: moving the caret while the text people read stays
put is worse than doing nothing. The status says why.

**Report what was measured.** Each part reads the page back once, after the first time it
acts, and `__bidiStatus()` shows the result - `on - measured working`, or `not working`
and the computed values that prove it. 2.1.267 would have shown that on the first Urdu
letter typed.

**One lamp at a time, in the other direction too.** If Claude Code starts reading its
answers correctly, the part that existed for that stands down. Until now that meant
`stop()` - everything, including the box you type in and sent messages, which that fix
says nothing about. And if the answers were already fixed when the panel loaded, the
engine never started, so neither did they. Now the answers' part stands down alone, and
the engine starts whether or not the answers need it.

**No single road into the page.** Every part of this rides on one stylesheet, and the
stylesheet on `'unsafe-inline'` in the webview's `style-src`, which Claude Code grants
today. Measured: without that word a `<style>` added from script is refused, while a
constructed stylesheet handed to `document.adoptedStyleSheets` still applies. So the
engine checks that its rules actually arrived, takes the second road if they did not, and
the status says which road was used.

### Knowing the day it breaks

None of the above makes it unbreakable. Claude Code will one day replace the box you type
in with something else, and on that day the best any of this can do is stop cleanly and
say so. What decides how much that costs is how long it goes unnoticed - and until now the
answer was "until the person using it sees it", which is how 2.1.267 was found.

So every day, on GitHub and nowhere near anybody's machine, the newest Claude Code is
downloaded from the Marketplace and this build is put to it: Claude Code's own webview
bundle running with the payload in it and the real composer typed into, its own stylesheet
under every question the older tests ask, and a one-line check of each assumption above.
A failure is an email the same day, naming the release. Nothing of it runs where anybody
types, which was the condition it was chosen under: a fix that feels like Claude Code's own
cannot also be the thing that makes the editor feel slow.

It also caught a false alarm of its own before it ever ran: the typing-speed check, run
beside every other test at once, read the fix as tripling the time. Measured quietly the
same two were 144ms and 131ms for sixty-three keystrokes. It now takes both in turns and
compares medians, because a watch that cries wolf is a watch somebody stops reading.

### What it costs, said plainly

- a message that mixes two languages takes one direction as a whole - while it is typed,
  and once it is sent. An English line inside an Urdu message goes with it
- a sent message sits against the left of its bubble, where Claude Code's layout puts it;
  moving it moves the buttons that live in the same container
- the composer is asked on every change to it, not only on typing. Measured: the same
  single attribute as before, and no keystroke late

### The rule this leaves

> Set every property you depend on. Describe the host by what its elements are, not only by
> what they are called. And ask the page afterwards whether it listened.

The first would have kept 2.1.267 from breaking anything. The second is what lets a
restyle pass. The third is what turns the next surprise from a report weeks later into a
line in the status on the day it happens.

---

## 35. The box you type into, built for the next update

0.5.0 accepted a limit - the box takes one direction as a whole - and the instruction that
followed it was about nothing else: that one place, where people write, must keep working
through every Claude Code update that can be foreseen, as a lamp of its own, and must never
be the thing that crashes anything. Not a larger formula. The same small one, made hard to
break.

### Ten months of the box, booted

"Measured on one build" is how 2.1.267 broke the box without anything noticing. So before a
line was changed, seventeen builds were downloaded from the Marketplace - 2.0.50 from
November 2025 to 2.1.268, released the day before this was written - and each one was
booted with the payload in it and typed into: its own bundle, its own stylesheet.

| builds | class names | layers | what the box sets on itself |
|---|---|---|---|
| 2.0.50 - 2.1.0 | minified: `c`, `d` | one, visible | nothing |
| 2.1.30 - 2.1.59 | `messageInput_cKsPxg` | one, visible | nothing |
| 2.1.90 - 2.1.266 | the same | two: a caret layer at `color:#0000`, and a copy drawn over it | nothing |
| 2.1.267 - 2.1.268 | the same | two | `unicode-bidi: plaintext` on both |

Three changes in ten months, and through every one of them what the box says about ITSELF
never moved: `role="textbox"`, `aria-label="Message input"`, `aria-multiline="true"`,
`data-placeholder`, `contenteditable="plaintext-only"`. Untouched, every one of the seventeen
reads `Hello ہیلو` left to right. With 0.5.0, every one of them reads it right to left - on
2.0.50 and 2.1.0 through `role=textbox` alone, because there was no class name to find.
Describing the box twice had already survived two changes nobody saw coming.

That is the evidence for the rest of this section. The next change will most likely be of
one of those three kinds: a restyle, a new layer, or a property the box sets on itself.

### The next update, made on purpose

So each of those, and the ones nearest to them, were made - to the copied page, and to
Claude Code's own bundle and stylesheet, rewritten before they were served. 0.5.0 against
0.5.1:

| the change | 0.5.0 | 0.5.1 |
|---|---|---|
| Claude Code forcing `ltr`, `plaintext` and `left` with `!important`, from a specific selector | **lost** | holds |
| the same from inside a cascade layer | **lost** | holds |
| every class renamed, and the role and the label gone | **not found** | found by `aria-multiline`, or by `data-placeholder` alone |
| the box wrapped in a new element, or the layer over it wrapped | **off** | holds |
| a second layer drawn over the box - inline suggestions, say | turned, by the accident of a loose selector | turns with it, found as a layer drawn over the box |
| an icon put beside the box, hidden from screen readers | **turned with the box** | left alone |
| the layer over the box drawn only once there is text | **never turned** - "off" was remembered | turns when the layer arrives |
| the box rebuilt with Urdu already in it | waited for a key | turns at once |
| two boxes, text put into the one not last typed in | **missed** | each follows its own text |
| the answers' part failing to start | **took the box with it** | the box stays on |
| one layer held left to right from script | **caret and letters apart** | given back whole, and said |
| our stylesheet taken out of the page | **gone** | put back |
| the box inside a shadow root | **unreachable** | turned, from inside it |

On the copied page that is twenty-four tests, and 0.5.0 fails eighteen of them. In Claude
Code's own running app it is five rewrites of its real bundle, and 0.5.0 fails three on
behaviour - `test/composer-survival.test.js` and `test/real-bundle.test.js`.

### How it is built now

**Its own circuit.** The box used to be one part of one engine: one start, one observer, one
stylesheet, and a throw anywhere in the answers' half reached it. Now it is `startComposer`,
started first and inside its own guard, with its own listeners, its own observers - one that
finds boxes as they are added, and one on each box it has found - its own stylesheet and its
own status. The answers' part failing to start was made to happen, and the box stays on. The
box throwing on every question was made to happen, and the answer beside it is decided
exactly as before.

**Five roads to it.** By name, by `role=textbox`, by its label, by `aria-multiline`, by
`data-placeholder`. The last four are what the box is, and `data-placeholder` occurs on it
and on nothing else in the bundle. A label on something that cannot be typed into is not the
box, so a hit counts only if it is editable.

**The rules name nothing of the host's.** JavaScript finds the layers and marks each one; the
stylesheet speaks only of our own two attributes. There is no class name in it to go stale,
and no selector in it the browser could refuse.

**No stylesheet can overrule it.** 2.1.267 won by adding one property the rule did not set.
0.5.0 set all three, with `!important`, and would still have lost to the next step: the same
properties with `!important` and a longer selector, or from inside a cascade layer. The rules
now live in a cascade layer declared before any of the page's, their stylesheet first in the
document. An `!important` declaration in the earliest layer outranks every later layer and
every unlayered rule, whatever its specificity and wherever it sits. Only an inline
`!important` from script can beat it - not how React styles anything, and what the
measurement below exists for.

**Nothing inside a turned layer decides for itself.** The caret's layer is plain text; the
layer people read is not always - a mention is a chip, a misspelling a span. Were any of those
ever given a direction of its own - `dir`, `bdi`, `plaintext` - the letters would be laid out
by one rule and the caret by another. So inside a turned layer everything is held to the
layer's direction. Measured on Claude Code's own stylesheet with a chip in the box: what
differs with the fix and without it is `direction`, `unicode-bidi`, and the logical names of
padding that did not move. On today's box it changes nothing else at all.

**Layers found by what they are.** More than one thing beside the box can be hidden from a
screen reader - a copy of its text, and an icon. They are told apart by the only thing that
makes a copy a copy: it is drawn over the box. More than one candidate beside it, or any
deeper in the container, is taken only if it covers most of the box. Every road is asked and
what they find is put together, so a layer Claude Code adds tomorrow turns with the one it
has today.

**Found as it arrives, and watched from itself.** A box rebuilt with text already in it -
switching sessions, a draft restored - fires no key and no focus. The finder looks inside what
is added to the page, which costs about a microsecond for a paragraph of a streaming answer
and fifteen for a sixty-cell table. Once found, a box is watched from the box itself, so
while an answer streams elsewhere nothing about the box is asked. Over a four-hundred-chunk
stream: 8.21ms a chunk without the payload, 8.19ms with it.

**It fails to nothing.** A fault while handling a box takes that box's direction back out, so
its layers return to Claude Code's rendering together. After a box turns, the page is read
back: if its layers did not all take the direction, the caret would sit apart from the
letter it writes, so none of them is turned and the status says why. A stylesheet taken out
of the page goes back. A page that refuses a style element gets a constructed one. A box
inside a shadow root gets a sheet of its own.

**It says what it measured.** Which road found the box, which road the stylesheet came in by,
and whether the page took the direction - `on - measured working`, or `not working` with the
values that prove it, kept until it is measured again. If something editable is typed into
while no box has been found, the status says that too: the day a restyle closes every road,
the first line of the report is which one.

### What was found in it before it was built

Five faults, and four of them were in the new code - two found by its tests, two by reading
it again once the tests were green. Each has a test now, and each of those tests was run
with its fix taken out, to see it fail:

- **Black text was taken for invisible.** With nothing drawn over it, the box is only turned
  if people can see it. The first version read the last number in the colour, and in
  `rgb(0, 0, 0)` that is the blue. A one-layer box with black text - every build before
  2.1.90, in a light theme - would never have turned. Found by the test that runs under a
  strict CSP, where no page style reaches the box and its text is black.
- **"Not working" lasted one letter.** The status went back to "not measured" at the next
  keystroke, so the one report that mattered was on screen for a single character.
- **A reading-back that outlived its box.** A box turns, and is read back a moment later.
  If Claude Code rebuilt a layer inside that moment, the reading-back still named the old
  layer, gone from the page - and a layer that is gone reads like a layer that disagrees. It
  took the direction back from the healthy box that had replaced it. Only a box still being
  looked after is read back now.
- **A layer added inside a wrapper went unseen.** Whether the box needed looking at again was
  asked of its own children, and a layer put inside something it already had does not
  change those. What arrives in the box is looked at instead.
- **Two lamps on one box.** A sent message's text is a run handed to `dir="auto"`, and so
  would be any run Claude Code drew into the copy over the box - which sits BESIDE the
  editable layer, not inside it, so "never inside an editor" did not keep the sent-message
  lamp out. It marked the copy while a draft had one line, kept the mark when it had two, and
  once the draft was English again the copy read right to left over a caret that did not.
  None of the seventeen builds draws such a run; it was a fault waiting for an update. The
  sent-message lamp now stays out of an editor and out of the copy drawn over one. That is
  the only line of it that changed, and all of its own tests pass unchanged.

Which is also why every new test here was run against 0.5.0 as well. A test that passes on
both proves nothing about the change. Eighteen of the twenty-four fail on 0.5.0; of the six
that do not, three test what 0.5.0 already did, one passes on 0.5.0 only through the
two-lamps fault above, and two test faults of the new code that 0.5.0 never had.

### The one way this could break Claude Code itself

Everything above fails to "nothing happens". One thing does not. The payload is appended to
Claude Code's bundle, and the bundle is loaded with `type="module"`: a syntax error in module
mode is not our part going quiet - the whole module fails to parse and the panel never
starts. The build checked the payload with `new Function`, which parses a forgiving script.
It now also parses it as a module, and that check was shown to have teeth: a legacy octal
literal passes the old check and fails the new one.

### What it still cannot survive, said plainly

- **Claude Code holding both layers left to right with an inline `!important`.** Nothing a
  stylesheet does outranks that. The status says `not working`, with the values.
- **The box moved into a closed shadow root, or another frame.** Nothing of ours reaches it.
  The status goes on waiting, and says something was typed into that matched nothing.
- **A textarea whose text is changed from code.** A textarea's value is not in the page, so
  no observer sees it change; it turns at the next key or focus. No build has had one.
- **A different kind of editor** - one that lays out its own lines and draws its own caret.
  It may well be found, by role. Whether turning it is right is a question that build would
  have to answer, and the layer check and the daily watch are what would ask it.
- **A draft that mixes two languages takes one direction as a whole.** The limit section 34
  accepted, and still the one this is built around.

### Knowing the day it changes

`claude-shape.test.js` now names each of the four things the box has always been, one line
each, and says so when Claude Code starts setting the box's direction itself - with
`!important`, or from a cascade layer. The daily watch puts that, the real bundle and its five
rewrites to every new release. And `build/fetch-claude-builds.js` fetches builds by version,
keeping only the four files anything here reads, so that `test/history.test.js` can put the
box to every one of them: seventeen today, all holding.

### The rule this leaves

> Find it by what it is. Turn it from somewhere nothing else can outrank. When it cannot be
> turned whole, give it back whole - and let no other lamp reach inside it.

---

## 36. A message somebody sent, on a circuit of its own

The second of the four places text appears, done the way section 35 did the first: studied
in every build there is, then built for the updates that have not happened yet. It takes
one direction as a whole, from what it says - any RTL word in it and it reads right to left,
none and it is left exactly as Claude Code drew it. That was already the behaviour. What
this section is about is what was holding it up.

### Seventeen builds, and a message sent in each

The stubbed app draws a sent message exactly as the real panel does - its row, its
expandable container, the run its text sits in - so the same seventeen builds as section 35
were booted and sent `npm install کے بعد پروجیکٹ چلائیں`. Untouched, every one of them reads
it left to right. With 0.5.1, what turned it depended on which era the build came from:

| builds | what the build gives a sent message | what turned it in 0.5.1 |
|---|---|---|
| 2.0.50 - 2.1.0 | minified classes, a plain `<span>` | **nothing - it never turned** |
| 2.1.30 - 2.1.200 | its container's class name | the code for answers, treating its body as one of their blocks |
| 2.1.220 - 2.1.235 | that, and the run its text is handed to `dir="auto"` | the same, and the `dir="auto"` road |
| 2.1.247 - 2.1.268 | that, and a heading hidden above it for screen readers | **the code for answers, deciding the whole row from that heading** |

Three things in that table were wrong, and none of them showed on the screen:

- **A sent message had no lamp of its own.** Both of its roads lived inside the code for
  answers. Had Claude Code fixed its answers - the one fault that part stands down for - or
  had that part failed to start, sent messages would have gone dark with it.
- **It was decided from text nobody can see.** Since 2.1.247 the first block in a sent
  message's row is a heading kept one pixel square for screen readers. The answers' part met
  it first and put the decision on the whole row. Rename the row's class, and nothing stops
  that decision climbing out of the row onto the answer below it.
- **A class it leaned on had quietly gone.** `contentWrapper_` - named here as "one message"
  for a sent message - stopped existing in 2.1.266. Claude Code's component still asks for
  it; its stylesheet no longer defines it, so no element carries it.

And the status said `nothing decided yet` on every build from 2.1.30 to 2.1.200, over
messages that had been turned - by a different part.

### What replaced it

`startSent`, a third circuit beside the box and the answers:

**Found two ways, each enough.** By the class of the element that holds a sent message's
text - the same class and hash in every build from 2.1.30 to 2.1.268 - and by what it is:
the run the page hands to `dir="auto"`, the browser's first-strong guess applied to text the
page did not want to decide. A slash command with its arguments, shown in a plain div with
neither, is named too; no road reached it before.

**Decided where the text is, and nowhere else.** The direction goes on the element that
holds the text, never on the row: the controls beside a message sit in flex rows that end
at `flex-end`, and a row that turned would carry "Show less" to the other side. Inside the
text, the run handed to `dir="auto"` and the text's own children are held to the message's
direction. Anything deeper that Claude Code gives a direction on purpose - a mention it
marks left to right - keeps it.

**No stylesheet can overrule it.** The same cascade layer, declared first, every
declaration `!important`, as the box's. Claude Code has never set a direction on a sent
message; it set one on the box in 2.1.267, and the next place it does so will not win.

**It fails to nothing.** A message that throws when it is read is left as the page had it,
and the message beside it is still decided. Each message found is watched from itself, so a
message the page rewrites is decided again - both ways - and one that leaves the page is let
go.

**The code for answers stays out of it.** It skips the heading by name, and never takes a
decision from a block drawn one pixel square - the same heading said by what it is, so a
rename does not bring it back. And one message now ends at `data-transcript-message` as well
as at its class name: Claude Code has put that attribute on every message in the
transcript since 2.1.268, and no restyle renames an attribute.

### What it came to, measured

- **Fifteen of the seventeen builds** turn a sent message - every line of it, the English
  line with the rest - and in not one of them does anything else decide anything in its row.
  2.0.50 and 2.1.0 give a sent message no road at all, and the report says so rather than
  failing.
- **Eighteen tests on the copied page, and 0.5.1 fails twelve.** Among them: Claude Code
  forcing `plaintext` on the message from its most specific selector and from a cascade
  layer; the run given `plaintext` by a class with `dir="auto"` gone; every class renamed
  with an English answer streaming under the message, watched frame by frame for a single
  frame of it reading right to left; a slash command; the answers' part failing to start; a
  message that throws when read.
- **Seven in Claude Code's own app**, five of them rewrites of its real bundle: the message's
  classes renamed, `dir="auto"` removed, `plaintext` forced with `!important` and from a
  layer, and the heading renamed along with everything that names it - where the one-pixel
  rule alone keeps the answers' part off the row.
- **Nothing measurable to pay.** A conversation of a hundred sent messages, and of three
  hundred, with an answer streaming under it: the same cost per chunk as 0.5.0 and 0.5.1, and
  the same with none. Each message watched from itself costs a streaming answer nothing.

That last measurement also found something that is not this section's: in that stress test
the answers' part spends about a third of a millisecond on each chunk, in every build of
this extension there has been. A frame is sixteen. It is written down for number three.

### What it still cannot do

- **2.0.50-shaped builds** - every class minified and no `dir="auto"` - give a sent message
  nothing to be told apart by. The composer survived them through its role; a sent message
  has none.
- **A message inside a shadow root.** The box is reached there through the events that come
  out of it; a sent message sends none.
- **A message that mixes two languages takes one direction as a whole.** The limit section
  34 accepted, unchanged.

### The rule this leaves

> A message is decided by its own lamp, from its own text, where its text is - never by the
> lamp beside it, and never from anything nobody can see.

## 37. The long message nobody can read past, on a circuit of its own

Not a right-to-left fault, and not ours: Claude Code's own, found here and written up in
[claude-code-bug.md](claude-code-bug.md). A message that heads a turn is `position: sticky`,
and once it is opened it has no height cap, so a pinned element taller than the panel can
never show its own bottom. Sections 10, 15 and 29 built the fix for it. This is that fix,
put through what sections 35 and 36 put the box and a sent message through - and asked
whether Claude Code has fixed the bug itself.

### Every build, with a real answer under the message

Everything earlier here was measured on a copy of the page, with a stand-in for the component
that opens and closes a message. This time Claude Code's own app was booted, and the
extension host was made to answer: a forty-line message, a hundred and fifty lines of answer
streamed under it the way the host streams one, more conversation below, and then what a
person does - scroll back into the answer, point at the message, click "Show more", wheel
down to "Show less", click it.

| builds | untouched | 0.5.2 |
|---|---|---|
| 2.0.50 - 2.1.59 | nothing is pinned; there is no trap | nothing to do |
| 2.1.90 - 2.1.268 | opened, the message stays pinned: 856px in a 560px panel. Not one line of the answer is seen. "Show less" arrives after **22** turns of the wheel, at the very end of the turn. Closing it leaves the reader **2,640px** from their line | unpinned; "Show less" after **3** turns; closing puts the reader back on their line exactly |

The same in all thirteen that pin, to the pixel. Nothing between 2.1.90 - when a message that
heads a turn first became sticky - and 2.1.268 has changed it. The only thing near it that did
change: from 2.1.257 a click on a pinned message's text scrolls to the start of its turn,
300ms later, and from 2.1.268 moving focus between messages allows for the pinned header's
height. Neither touches the trap.

### And upstream

Claude Code's public tracker has this, many times, from different people, since March 2026 -
the plain message (#39809, #72707, #85505) and, far more often, a message taken for a command
(#69771, #72590, #88512, #93052). As of 2026-09-11 none shows a reply from Anthropic or a
linked fix; two were closed by the stale bot as "not planned" and two as duplicates. The plain
case was put down to a scrollbar that stops short (#85505); the command case was diagnosed
correctly - pinned, with no collapsible wrapper - in #88512 and #93052. The write-up here has
still not been filed.

### What was wrong with it

The behaviour was right. Everything around it was not:

- **It rode in the answers' stylesheet.** `UNPIN_CSS` was handed to the engine as `extraCss`,
  so if the answers' part could not start, this went with it: two lamps on one circuit.
- **It was plain CSS**, unlayered, winning by specificity alone: `(0,3,0)` against Claude
  Code's `(0,2,0)`. One rule of theirs as specific, later in the page, and it would have lost.
- **It was found by class names and nothing else.** Four of them, all stable since 2.1.90 -
  and any one renamed would have brought the trap back without a word.
- **It never asked whether it was needed.** The question was put once, at start-up, when no
  message exists. Every build reported `on - no header rendered yet, the rule waits in the
  sheet` for ever - so the promise that it stands down when Claude Code stops pinning was one
  it could not keep, and "on" meant nothing.
- **It did not know about the second way into the trap.** A message Claude Code takes for a
  command - a skill run with long arguments, or any message whose first character is `/`, a
  pasted path included - is drawn with no collapsible wrapper: no "Show more", no "Show less",
  no height cap, and pinned like any other. In 2.1.268, 755px of it in a 560px panel, and
  forty turns of the wheel went by without a line of the answer under it appearing - with
  0.5.2 in, because its rule looked for a "Show less" that is never there.
- **`__bidiFixOff()` left the listener behind**, still putting the reader back on their line
  after all of this had been turned off.

### What replaced it

`startPinned`, a circuit of the adapter's own, started before the engine inside its own guard:

**Found by three roads.** A pinned row by its class name; by what it is - a message in the
transcript (`data-transcript-message`, 2.1.268) that the page makes sticky; and, failing both,
the sticky ancestor of the run a sent message's text is handed to (`dir="auto"`, 2.1.220).
That last road is kept out of the box you type into - not inside it and not beside it, the
same test the sent-message lamp uses. It was written without that at first, and a test gave
the box `position: sticky` and a forty-line draft: the road took the box for a message and
let go of it. Nothing of Claude Code's but a message is sticky today; the day the box is,
a long draft would have scrolled it away.
An opened message by name - the collapse row that only an opened message has - and by what
the trap IS: a pinned row, showing its whole length, taller than half the panel it is pinned
in. That road is the one that reaches the command-shaped message, and it still finds an opened
one with every name renamed.

**It never touches what Claude Code designed.** A collapsed message - collapsed by name, or
held under an inline height cap that clips its text - stays pinned, however small the panel.
So does a short one, and a short command. Only a message showing its whole length is let go
of, and only while it is taller than half the panel.

**No stylesheet can overrule it.** Its own sheet, first in the page, a cascade layer declared
ahead of all of Claude Code's, every declaration `!important`.

**It stands down row by row, and altogether.** A row the page does not pin is never touched. If
the first message drawn is named as pinned and the page does not pin it, Claude Code has
stopped pinning, and the sheet, the marks and the listener all come back out.

**It says what it measured.** Each row it lets go of is read back after the frame; an opened
message found still pinned and taller than the panel is `not working`, not `on`.

### What it came to, measured

- **All seventeen builds** in Claude Code's own app: in the thirteen that pin, the command-shaped
  message is let go of and its answer is read; a collapsed message, a short one and a short
  command stay pinned; opened, the long one reaches "Show less" in three turns of the wheel and
  closing it lands on the reader's line; the status reads `measured working`. In the four that
  pin nothing, nothing is marked. Not one error.
- **Every name renamed** - `stickyHeader`, `expandableContainer`, `buttonContainer`,
  `collapsed`, in the bundle and the stylesheet together: in 2.1.268 all of it still works, by
  what it is. In 2.1.220 - 2.1.267 the plain message still works through `dir="auto"`.
- **A build that stops pinning**, made by taking `position: sticky` out of its own rule: in all
  thirteen, `not needed`, and nothing of this left in the page.
- **Seven tests in the installed build's app, and 0.5.2 fails five**: the status, the
  command-shaped message, the renamed names, the build that stops pinning, and the listener
  left behind.
- **Nothing to pay.** A hundred pinned messages with an answer streaming under them: 377
  microseconds a chunk against 0.5.2's 381. Everything of it runs when a message is added or
  changes size, and a streaming answer does neither to a pinned row.

### Found while re-checking the other two

- **Two lamps on one paragraph, the day it would happen.** `dir="auto"` is one of the two roads
  to a sent message because it occurs once in Claude Code's bundle - on a sent message. The day
  an answer's paragraphs are handed to it too, an obvious way for anyone to start fixing
  right-to-left, that road would take every paragraph of every answer for a sent message. The
  sent-message lamp is told what an answer is now - the test id every answer has carried since
  2.1.59 - and never goes inside one.
- **A guard with a gap in it.** Keeping the view on a message it opens does its work two frames
  after the click, outside the `try` that wraps the click. A fault there had nothing between it
  and the page. It has a guard of its own.

### What it still cannot do

- **Half the panel is a choice, not a measurement.** Below it, a message showing its whole
  length stays pinned, as Claude Code has it; above it, it scrolls. Taller than the panel is
  the only point at which the trap is strictly a trap - a message 90% of the panel tall can
  still be read past, through the 10% left. Half was chosen because a pinned message is there
  to keep the question in view while the answer is read, and past half it covers more of the
  answer than it leaves.
- **With every name renamed and `data-transcript-message` gone**, a command-shaped message has
  nothing left to be found by: it carries no `dir="auto"`.
- **While a message is let go of**, 2.1.268's focus movement still allows for its height as if
  it were pinned, and a message it moves focus to lands that much lower. Nothing breaks.

### The rule this leaves

> A fix for somebody else's bug is asked, row by row, whether it is still needed - and says
> what it measured, not what it was told when it was switched on.

## 38. Ten looks at one paragraph, and the cost of the pass nobody had counted

Asked before the commits for 0.5.3 went in: is any of this too expensive to live inside
somebody else's panel? The three circuits added since 0.5.0 each watch the page from
their own observer, which is what keeps one of them failing from reaching another - and
that is four document-wide observers where there used to be one.

So it was measured rather than argued about, in Claude Code's own running app and on its
own stylesheet.

### What it costs to arrive

| | |
|---|---|
| the block appended to `webview/index.js` | 135,471 bytes, against the bundle's 5,279,795 - **2.6% bigger** |
| parsing it, running it, and installing all four circuits | **3 - 7ms**, once, inside a boot that takes about 1,300ms |
| the panel rendering its composer, with the fix and without | 1,266 - 1,436ms against 1,376 - 1,600ms: **no measurable difference** |

### What it costs while an answer streams

The interesting number is not the total; it is the work done per batch of mutations,
because that is what repeats. 1,500 appends - words added to a paragraph, a new paragraph
every 25, the way markdown streams - into an answer with a composer and three sent
messages on the page:

| | untouched | 0.5.2 | after this |
|---|---|---|---|
| selector queries of ours | 0 | **7,023** | **1,224** |
| our scripting, over a 3.1s answer | 4 - 6ms | 51 - 85ms | **41 - 42ms** |
| style recalculation | 28 - 68ms | 27 - 47ms | 27ms |
| wall clock for the whole stream | 3,097 - 3,489ms | 3,078 - 3,110ms | 3,078 - 3,101ms |

7,023 queries for 1,500 appends is nearly five per append, and the reason is the shape of
streaming rather than anything clever: text arrives word by word into the SAME paragraph,
so one batch of mutations names that paragraph over and over - ten times in a batch is
ordinary. The queue was a list, so each of those ten asked the page for its blocks again
and read the whole paragraph again.

The queue is a `Set` now, and so is the list of blocks a pass collects. Looking at one
block twice in a pass can only ever reach the same verdict twice, so nothing about the
outcome changes - the 249 tests say the same thing after it as before. What changes is
that the pass happens once.

It was never slow enough for anybody to see: the wall clock is the same either way, and
the browser's own layout is twenty times the cost of our pass. It is worth doing because
a guest in somebody else's panel should not be spending five times what it needs to, and
because the number nobody has counted is the one that grows.

### What was checked and left alone

- **Four document-wide observers, not one.** One observer fanning out to four circuits
  would be cheaper by three callbacks and would put all four on one fuse. Measured, those
  three callbacks are not worth anybody's independence.
- **`getComputedStyle` outside the hot path.** The box is measured once per turn, a sent
  message once per decision, a pinned row once per resize - never per mutation. Style
  recalculation during a streamed answer is *lower* with the fix in than without it.
- **The probe that asks whether the fault is still here** builds and removes two
  paragraphs, up to 40 times, and then never again. Section 29 has the hang it caused and
  the two guards that ended it.

### And the fuse box, put to the test rather than described

Each of the four circuits was made to throw at its first line, in the real app, and the
page read back afterwards:

| broken | uncaught errors | Claude Code's error pane | the other three |
|---|---|---|---|
| the box you type into | 0 | empty | a sent message still turns; answers and the pinned message still on |
| a sent message | 0 | empty | the box still turns; answers and the pinned message still on |
| answers | 0 | empty | the box and a sent message both still turn |
| the pinned message | 0 | empty | all three of the engine's parts still on |

And the two things all of them share, broken the same way, because a claim about
independence is worth only as much as its exceptions:

- **`layeredSheet`**, the helper that gets a stylesheet into the page: breaking it took the
  box, a sent message and the pinned message dark together. Answers survived - that part
  installs its own sheet. Nothing reached the page, and every lamp said `off` and no more.
- **the rule**: the box still turned (it asks a different function of it), and the
  sent-message lamp went on reporting `on - nothing decided yet` while deciding nothing.
  Its fault counter rose, which `__bidiStatus()` shows beside it, but the headline was
  still `on`.

Neither is reachable from anything Claude Code can do - only from a fault of ours inside one
of those two functions - and the first draft of this section said so and left them. That was
the wrong call twice over. The first is the one piece of code three circuits share, so it is
the one fault that could ever dim three lamps at once, and it costs six lines to make it
unable to: the helper is guarded from outside as well as inside now, and a circuit handed a
sheet that could not be built goes on running, turns nothing anybody can see, and reports
what it measured - `not working - the direction was set and the page did not take it` - which
is exactly what is true. And the second is this project's own rule broken in its own status:
a lamp that has thrown and never once worked now says so, instead of saying `on`. Both are
in section 39, with what they look like now.

### The rule this leaves

> The cost of a pass is measured on the page it runs on, and the claim that one lamp
> cannot dim another is made by breaking them one at a time, not by reading the code.

## 39. The question only one of the three places was ever asked

Section 29 set the rule for this whole fix, in one line: **needed is MEASURED, never assumed**.
Two fixes for one fault fight each other, and the fight is invisible to whoever shipped
either of them - so every part of this is supposed to ask the page whether the fault it
exists for is still there, and take itself out if it is not.

One of the three places text appears was actually asking. The answers' part has put a probe
in the page since the beginning: two paragraphs in a copy of the markdown root, one pure
Urdu to check the instrument and one mixed to ask the question, read back and removed. The
other two lamps looked like this:

```js
var composer = MIRROR_INPUT ? lamp("composer", function () { return true; }) : false;
var sent = lamp("sentMessages", function () { return true; });
```

"Is it needed? — yes, assume so, for ever." And of everything Claude Code might fix next, the
box you type into is the likeliest: it is the thing people keep filing about, and in 2.1.267
they were already in that file, putting `unicode-bidi: plaintext` on both of its layers. The
day they finish the job, the old behaviour was for our rule to go on forcing the whole box
right to left underneath theirs, with the status cheerfully reporting `on`.

### Why these two could not use the probe

A probe is a copy, and the thing that makes these two places different from an answer is
exactly that a copy of them is worthless. A copy of a box nobody types into says nothing
about the box people do type into - half of what is being measured is the host's own live
layer, drawn by React a frame behind the caret. The same goes for a message: the run its text
is handed to, the heading above it, the wrapper it is clipped by, are all the host's.

So the real thing is asked, and the question is put to it before anything of ours is on it -
which is the part that makes the answer mean anything. Our own rules all apply under our own
attributes, so a box with no attribute of ours on it is answering about itself.

### The one text worth asking with

```js
function tellsThemApart(text) {
  return firstStrong(text) === "ltr" && containsRtlLetter(text);
}
```

`dir="auto"` and `unicode-bidi: plaintext` take a run's direction from its first strong
character; this project's rule takes it from whether there is any right-to-left text at all.
For most text the two agree. Where they disagree is a line that opens in Latin and turns
Urdu - which is the fault, written as a string. So that is the only text a page is asked
with, and where the page draws its first character is the whole answer:

| what the page does with "npm install کے بعد" | what it means | what happens |
|---|---|---|
| draws the **n** on the left | the fault is here | carry on, nothing changes |
| draws the **n** on the right | somebody has fixed it | that circuit comes out of the page |

**A draft of pure Urdu is never asked with, and that exclusion is the whole reliability of
it.** The browser reads pure Urdu right to left whether the fault is there or not, so a
question asked with one answers "fixed" on every build ever shipped - including the one in
front of you. There is a test for exactly that, on a page where the temptation is live: a
fixed page, a pure Urdu draft, and the lamp required to stay on.

### The instrument checks itself

Every layer showing the same text has to give the same answer, or there is no answer yet.
That is not ceremony: the caret's layer is updated in the same instant a key goes down and
the layer drawn over it is the host's, a frame behind, so while the two disagree they are
looking at different drafts and neither is worth having. A keystroke later they agree. The
same rule covers a message caught half rebuilt: it answers nothing, and the next one is
asked instead.

And the character has to land inside the box it was measured against, or something nobody
modelled is going on - a transform, a scrolled overflow - and the answer would be arithmetic
rather than a measurement.

### Measured, on the real stylesheet

| the build | the box | a sent message | answers | attributes of ours left on the page |
|---|---|---|---|---|
| Claude Code as it is | on, measured working | on, measured working | watching | 4 |
| + the box fixed | **not needed** | on, measured working | watching | 1 |
| + a sent message fixed | on, measured working | **not needed** | watching | 3 |
| + all three fixed | **not needed** | **not needed** | **not needed** | **0** |

In each of those the reader still sees every line the right way round - their fix doing what
ours did - and one place being fixed moves nothing in the other two. Which is the point: a
page that draws a mixed draft correctly has said nothing whatsoever about what it does with a
message somebody sent, or with an answer.

### A lamp that has stopped working stops saying it is on

Found by breaking this fix on purpose, one circuit at a time, inside Claude Code's own app -
the runs in section 38. Every fault was contained exactly as intended. What none of them did
was say so: the fault counter rose in a field underneath and the headline still read `on`.

Three goes at the condition, and the first two were wrong in the same way - they counted
attempts:

1. **around the turn.** A fault in the first thing an attempt does - asking the rule - was
   never counted at all, because the counter sat after it.
2. **around the whole attempt.** Better, and still wrong: the box's commonest attempt by far
   is the **empty draft**, which succeeds at doing nothing. A circuit that handled every empty
   draft perfectly and threw on every real one went on reporting `on`.
3. **has anything ever actually worked?** Something threw, and nothing has ever been turned.
   Both halves are needed: a fault while setting something up, on a circuit that goes on
   turning boxes, says nothing about the circuit - and a circuit with no faults that has
   never been shown any Urdu is not broken, it is waiting.

A third shape turned up while testing it: a box that throws the moment it is asked anything
never becomes a record at all, so nothing is ever *tried* and the clause above has nothing to
speak about. That one says `not working - it could not take hold of a box at all`.

It can still cry wolf in one way - a harmless fault on a healthy circuit that has not yet
been shown anything to turn. On the real panel every circuit reports `contained: 0`, so that
fault is hypothetical; and of the two ways to be wrong, a status that says "not working" when
nothing has worked yet is the one this project can live with.

### And one more name taken out of the pinned message

Whether a message is collapsed is the question that decides whether Claude Code's own design
is left alone, and it was answered by two names: a `collapsed_` class, and an inline
`max-height`. Move that cap into a stylesheet or a custom property and both answers go quiet
together - and a message Claude Code is deliberately holding back gets let go of.

It is answered by measurement now as well: something inside the message is taller than itself
and is not letting it out. No name, and nothing about how the cap is written. With one
discrimination that has to be kept, and a test that failed until it was: a cap that **clips**
text is Claude Code holding something back, and a cap that lets it overflow is not - and the
wrapper Claude Code draws around a message clips on its own account, so while it does, text
is being held back whatever the cap says.

### Found while writing it

One missing backslash. The new first-letter matcher was written `new RegExp("\p{L}", "u")`
instead of `"\\p{L}"`, which throws - and it was inside a `try` with a fallback range after
it, so it fell silently to the broader road and stayed there. That road had the digits of
these scripts in it as well as their letters, so it answered that "2024 کا سال" begins right
to left. Exactly the shape of fault this whole file is about: a thing that works, reached by
the wrong road, saying something slightly wrong for ever. The fallback is letters only now,
and `usingScriptProperties` says from outside which road was taken.

### What it still cannot do

- **If the box is already turned by us when the first mixed draft arrives** - select all,
  paste a mixed draft over pure Urdu - the question is not asked, because our own rule would
  be what got measured. It stays unasked until a clean chance comes, and in the meantime
  nothing changes. Unasked is the safe side: it means "carry on".
- **A page that reads a mixed draft right to left for some other reason** - an editor-wide
  direction somebody set - stands the circuit down too. Which is correct, if not for the
  reason it thinks: the reader already sees it the right way round.
- **Each place answers only for itself.** Three questions, three circuits, three answers.
  There is no arrangement in which one of them speaks for another.

### The rule this leaves

> Every part of this asks the page whether it is still needed, with the one text that can
> answer, and never with text that cannot - and a part that has thrown and never worked says
> that, rather than "on".

## 40. The one place where nothing is allowed to cost anything

Everything up to here was about being right, and about staying right through somebody else's
updates. This is about the other half, and it has a rule of its own:

> A person typing must not be able to tell this is installed. Not "barely", not "within
> tolerance". Everywhere else a millisecond is an argument; in the box you type into it is a
> verdict.

The order matters too, and it is the order somebody actually meets this fix:

| | what is acceptable |
|---|---|
| installing it, once | a reload, and a wait, if it must |
| every time the editor opens | a little, unnoticed |
| **every keystroke** | **nothing at all** |
| an answer arriving, a message sent | good, and never worse than it is without us |

### Three instruments, and the first two lied

The first said our whole cost was **0.14ms a keystroke**. The second said **2 to 3ms**, and
that one keystroke cost **11ms**. The third said **0.15ms** again. They cannot all be right,
and the way they were wrong is worth more than the numbers.

- **Real typing through the browser's own keyboard.** Unusable, and quietly so: for an Urdu
  character the driver inserts text without a keydown at all, so two thirds of the keystrokes
  were never timed - and a timeout queued to measure the end of a keystroke lands after the
  next paint, which puts a frame's worth of the browser's own work inside every number.
- **Keystrokes back to back.** The event was dispatched exactly as the page sees it, which is
  right, and then the next one was sent immediately, which is not. The browser amortises one
  style recalculation across a burst, so the cost of a keystroke was divided among the ten
  after it. A person leaves a frame or more between keys, and each of those keystrokes pays
  for its own layout. Leaving a frame between them multiplied the measured cost by fifteen.
- **Separate browsers for the two sides.** The comparison that finally broke: switching a
  circuit OFF came out slower than leaving it on, twice. That is not a result, it is machine
  drift with a decimal point on it.

What was believable in the end: **one page, the fix injected and taken out again between
blocks, alternating, hundreds of samples a side.** Whatever the machine is doing, it is doing
it to both sides at once. Every number below is from that.

### What a keystroke actually cost

| | mean, per keystroke |
|---|---|
| all four circuits, before | **1.25ms** |
| the answers' part, of that | **1.07ms** |
| all four circuits, after | **0.18ms** |

The answers' part had nothing whatsoever to do with typing, and was taking six sevenths of
what typing cost. It is the only part of this fix that listens for `characterData` - it has
to, because that is how an answer arrives a word at a time - so every keystroke anybody types
was delivered to it, and it asked the page two selector questions about a box it has no
business in. The answer was always "there is nothing here".

One line, and it is a correctness rule that happens to be the whole cost as well:

```js
if (node.isContentEditable) return;
```

An answer is never inside an editor. What IS inside one has a lamp of its own - so a block
found there would be decided twice over, by two parts, each its own way, which is exactly what
three separate circuits exist to prevent. The day Claude Code gives its composer real
paragraphs instead of plain text, that is what would have happened.

That day was then written as a test - a composer with real paragraphs in it - and the test
failed twice more before it passed, both times on something the measurement could not have
found:

**The layer drawn over the box is not editable.** It is a copy of the draft, sitting beside
the thing that holds the caret, and "never inside an editor" does not reach it. Decided there,
the glyphs would take a direction of their own while the caret took the box's - and the
answers' part would WIN, because its stylesheet is unlayered and an unlayered `!important`
outranks the layered one the composer's rules live in. The caret and the letters would part,
which is the single thing the composer circuit exists to prevent.

**And it cannot be answered by our own mark.** The layers carry one, but only once the box's
lamp has turned them, and the answers' first pass over the page runs before that - a microtask
against a frame. A draft already in the box when the panel loads is decided before the
composer has said a word. Marking the layers as soon as the box is FOUND would fix it and
would cost a promise this fix makes and tests: an English draft leaves not one attribute of
ours anywhere on the page.

So it is recognised by shape, with the same function the sent-message lamp uses to stay out of
the same place - and that is where the second failure came from. `besideAnEditor` looks four
levels up, because the run IT asks about is a span nested inside the copy. Asked about a
paragraph with four levels of room, it walks up until it reaches a level where the composer is
a sibling - which on a real page it always eventually is - and then answers yes about every
paragraph on the page. Three tests said so within a minute. A block is the copy's own child:
one hop, and the caller says so.

### And the one keystroke that cost eleven

Section 39 put a question in: is this box still ours to turn? It is answered by reading where
the page drew a character, and reading geometry forces style and layout. Mid-keystroke that is
the most expensive thing this file can do, and the measurement found it exactly where it was
put - on the keystroke where Urdu first follows Latin:

```
12  "npm install "     2.3ms      4.5ms
13  "npm install ک"    3.2ms     14.2ms   <- the question
14  "npm install کے"   1.8ms      4.3ms
```

It is asked after the frame now, where the browser has already laid the page out and the
identical read is free. Not from `requestAnimationFrame`, which runs BEFORE the frame's
layout and would force it again - from a timeout queued inside a frame callback, which runs
after that frame has been drawn with nothing left pending.

What it costs instead: on that one keystroke, once per page, the box turns a frame later than
it used to. Against a keystroke somebody can feel, that is the right way round.

**And the test caught what the change broke.** Tying the deferred question to one record was
wrong: the test for a host that rebuilds a layer in the moment after the box turns showed the
box never turning at all. The question was scheduled for record A, the host replaced the
layer, A was let go of and B took its place - and B could not schedule a question of its own,
because A's was still pending. A's then fired, found itself forgotten, and returned. Nothing
was waiting for anything any more. The question belongs to the circuit, not to a record.

### What is left, and why it stays

| | per keystroke |
|---|---|
| the box you type into | 0.087ms |
| a message somebody sent | 0.086ms |
| the pinned message | 0.027ms |
| answers | 0.020ms |
| **all four** | **0.187ms** |

That is one percent of a frame, and it is the floor for this shape of fix rather than
something left undone. Almost none of it is our code running: it is the cost of four separate
`MutationObserver`s existing at all, and the browser delivering the same records to each. One
observer fanning out to four circuits would be cheaper - and would put all four on one fuse,
which is the thing sections 29 and 38 exist to prevent. The independence is worth more than
0.1ms.

Two things measured and deliberately left alone:

- **The box's own handler runs three times for one keystroke** - the typed event, the caret
  layer's text changing, the layer over it being rebuilt. Skipping the repeats needs a memory
  of the last draft, and that memory is wrong in exactly the case that matters: a host that
  takes our attribute off without touching the text. Three cheap passes beat one clever one.
- **The composer's rule for elements inside a turned layer** was the suspect going in - a
  universal selector over a subtree React rebuilds on every keystroke - and it measures at
  zero. It stays.

### Every time the editor opens

The same instrument, pointed at the extension rather than the page, found something bigger
than all of the above put together.

```
apply(), with the block already in place       197.70ms
  of which, reading Claude Code's bundle       130.05ms
state(), which reads only the end of the file   13.30ms
```

`apply()` runs on every activation - every time somebody opens VS Code - and read five
megabytes to decide whether anything needed doing. The answer is almost always no: the block
is there and its clock is not due for winding. `state()` had been reading only the end of the
file since 0.5.0 for exactly this reason; `apply()` never got the same treatment.

It asks the end of the file first now. **197.70ms became 13.64ms.** A tail too short to hold
the whole block cannot match one, so it falls through to the full read and is merely slow,
never wrong - and a test holds the window at more than twice the payload so that it does not
quietly stop being available.

The other one: the status bar item refreshes on every tab change, every tab-group change and
every editor change, and each refresh read the end of that file again - 13ms, every time
anybody switched files. Nothing but this extension changes that file, so the answer is
remembered now, and forgotten by hand at each of the three moments it could stop being true:
when we write the file, when Claude Code is replaced, and when a write fails.

### And one more name given a second road

While the typing path was being read through, the guard that keeps the two message lamps off
each other's text turned out to rest on a single name - the test id every answer carries. A
renamed test id does not fail loudly: the selector stays valid and simply stops matching, so
the guard would go quiet and nothing would say so. Pair that with the day Claude Code hands an
answer's paragraphs to `dir="auto"` - which is how anyone would start fixing right-to-left -
and both circuits would be deciding the same paragraph.

The shape says it without a name: an answer is markdown, so its text lands in real blocks; a
sent message is not markdown, its text is a bare run in a plain container. A run whose holder
IS one of the answers' blocks is not the sent-message lamp's business, whatever the row it
sits in is called.

### What is still single-road, said plainly

- **A message Claude Code takes for a command.** It is drawn as plain text with no
  `dir="auto"` anywhere near it - read out of the bundle, not guessed - so the class name is
  the only road there is. Renamed, slash-command messages stop being decided; every other
  sent message carries on, and the status still says which road found what.
- **The timeline dot**, which is decoration and says so.

### The rule this leaves

> Measure the thing a person can feel, on the page they will feel it on, with an instrument
> that is asked to prove itself first - and when a number says a part of this costs nothing,
> suspect the instrument before believing it.
