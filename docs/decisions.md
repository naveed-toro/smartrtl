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
