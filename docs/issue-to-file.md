# Ready to file

[claude-code-bug.md](claude-code-bug.md) is the full write-up, with the reasoning and the
history. **This file is the same thing cut down to something that can be pasted into a
public issue tracker in one go** — no links back here, nothing that needs this repository
to make sense, and short enough that a maintainer reads all of it.

File it **before** the bug is fixed. That is the whole of what establishes when it was
found: a dated entry in a system somebody else runs. A private repository proves nothing
to anyone later.

**Where:** the public issue tracker for Claude Code — check the extension's Marketplace
page or its repository for the current one, because that is the sort of thing that moves.
Search the open and closed issues for `sticky` and for `Show less` first; if it is already
there, add the reproduction and the measurement below to that thread instead of opening a
second one, and say what your build numbers were.

**Afterwards:** put the issue URL at the top of `claude-code-bug.md`, so the write-up and
the public record point at each other.

---

## Title

```
Expanded long user message cannot be scrolled or closed (position: sticky with no height cap)
```

---

## Body

Everything from here down is the issue. Paste it as-is.

---

A user message that heads a turn is `position: sticky`. Collapsed that is the point of
it — the question stays visible while you read the answer. Expanded, the same element has
no height cap, and **a pinned element taller than the window can never show its own
bottom, because it does not move.** Its own "Show less" is at the end of that block, so
for the length of the turn it cannot be reached.

This is not a language or RTL issue — it behaves identically in English.

### Environment

| | |
|---|---|
| Extension | `anthropic.claude-code` — reproduced on 2.1.247, 2.1.259 and 2.1.263 |
| VS Code | 1.135 |
| OS | Windows 11 |

### Steps to reproduce

The conditions matter — this is invisible in a fresh session and obvious in a real one.
There is a copy-paste prompt at the end of this issue that sets all three up in about a
minute, if that is quicker than building them by hand.

1. Send a **long** message — forty lines is plenty. Anything past the collapse threshold
   that is also taller than the panel will do.
2. Get a **long answer** under it. Asking for the numbers 1 to 150, one per line, is
   enough.
3. Send two or three more messages, so there is conversation **below** the one from step 1.
   *This is the step that is easy to miss: with nothing below it, the panel scrolls to the
   end of the message and everything looks fine.*
4. Scroll **up** to the message from step 1. It is pinned at the top of the panel, showing
   its first lines and a "Show more".
5. Click **Show more**.

### Expected

The message opens. You read it, scroll through it, and click "Show less" when you are done.

### Actual

- The message fills the whole panel and stays there.
- The mouse wheel appears to do nothing. It is not doing nothing — the conversation behind
  the message is scrolling, and every pixel of it is hidden by the message you just opened.
  The scrollbar thumb moves; the screen does not change.
- **"Show less" never arrives.** It is at the bottom of a block that does not move.
- To get out, you have to scroll past the entire rest of the turn, or reload the panel.

The longer the answer underneath, the longer the panel appears frozen. The further up you
had scrolled, the worse it is — opening a message at the very bottom of a conversation
looks fine, because there is nothing below it to hide.

### Cause

Two rules in `webview/index.css`, each reasonable on its own:

```css
.message.stickyHeader { position: sticky; top: 0; z-index: 2 }
.content              { overflow-y: hidden }   /* and no max-height once expanded */
```

Collapsed, the component sets `max-height` inline, so the sticky element is small and the
pinning does what it is meant to. Expanded, that inline cap is removed and nothing replaces
it, so the sticky element becomes as tall as the message. Sticky positioning holds an
element at `top: 0` for as long as its containing block is in view — so an element taller
than the viewport is held with its bottom permanently off-screen, and no amount of
scrolling within that turn reveals it.

### Suggested fix

Stop pinning a message while it is expanded. Once the reader has opened it there is
nothing left for it to hold above anything — they are reading the thing itself. One rule,
no script, no capping:

```css
.stickyHeader:has(.expandableContainer > .buttonContainer) { position: static }
```

The collapse row exists only in the expanded state and only as a direct child, so it is a
reliable signal.

Capping the expanded body's height and giving it its own scrollbar also works, but it means
deciding how much of a window a message may occupy, and the right answer differs on a
laptop and an external display.

### One more thing, if you take the fix above

Unpinning alone leaves a second, smaller problem, and it has two halves that need
different answers. I hit both and measured them:

**Opening.** A collapsed message is pinned, so it is visible wherever you have scrolled to.
The moment it stops being pinned it falls back to where it really lives in the document,
which may be thousands of pixels above the reader's eye — the message they just opened
vanishes upwards. Restoring the message's own top across the toggle fixes it, clamped to
the visible area, or reading to the end of a long message and closing it puts that message
back off the top of the screen.

**Closing.** Here the pinning bites again. The moment a message collapses it is sticky
again, so its top *is* the panel's top whatever the scroll position: any drift measured
against it is zero, nothing is scrolled, and the view is left wherever reading the message
happened to leave it. Somebody who was partway down a long answer, opened the question
above it to check something, and closed it again gets the answer back **from its
beginning**.

The anchor for that has to be an element **below** the message. I tried anchoring to the
turn the message heads: its top came back to the pixel and the reader still landed 20px
out, because the message's own collapsed height was not quite what it had been. Everything
under a message moves rigidly when that message grows or shrinks, so restoring one element
below it restores the whole of what the reader was looking at.

### Also noticed, much smaller, and not worth its own issue

Hovering the copy button on a code block while an answer is still streaming makes it
flicker for as long as the answer is arriving.

`.copyButton` is `opacity: 0` with `.codeBlockWrapper:hover` bringing it to 1, so it is
pure CSS — and the renderer replaces the block as it re-parses, which loses the hover
state. The new element is not hovered until the pointer moves, so the fade restarts.

**The useful part is where it does NOT happen.** The copy button on a Bash tool block is
the same kind of hover-revealed control (`.inputRow:hover .copyButton`) and it does not
blink during the same stream — because a tool block's command is settled when the call is
made, while an answer's markdown is re-parsed on every chunk. So this is not a fault in a
button; it is that re-parsing the whole partial answer replaces elements the reader may
be pointing at.

**And there is a bigger consequence than the blink.** If elements are replaced under the
reader, a text selection should not survive either - so I measured it: selecting a phrase
in a paragraph and then replacing that paragraph the way the re-parse does **loses the
selection entirely**, while a control that only appends text below keeps it.

So highlighting a sentence in an answer that is still arriving loses the highlight. Same
single cause, costs everybody the same regardless of language, and unlike the blink it is
not cosmetic. The copy button is just the part of it you can see without trying to do
anything.

Measured, in case it matters: it stays clickable throughout — 11 of 12 clicks landed, and
a control with nothing replaced landed exactly the same 11, so the miss is in my harness.
Opacity never settles above 0.58 while it happens, against 1.00 when it does not. So the
blink itself is cosmetic; it is mentioned because of what it points at.

### A prompt that sets it up, if that is quicker

Uses no tools, reads and writes nothing, runs no commands. Send it, then send `ok` twice
so there is conversation below the turn, then scroll back up to it and click "Show more".

```
This is a reproduction case for a user-interface bug in the Claude Code panel.

Please answer with plain text only. Do not use any tools, do not read or write
any files, do not run any commands, and do not search anything. There is nothing
here that needs them.

This message has to be TALL, because the bug only appears with a long message.
Lines 01-40 below are filler. They mean nothing. Please ignore them completely.

  01 filler line, ignore
  02 filler line, ignore
  03 filler line, ignore
  04 filler line, ignore
  05 filler line, ignore
  06 filler line, ignore
  07 filler line, ignore
  08 filler line, ignore
  09 filler line, ignore
  10 filler line, ignore
  11 filler line, ignore
  12 filler line, ignore
  13 filler line, ignore
  14 filler line, ignore
  15 filler line, ignore
  16 filler line, ignore
  17 filler line, ignore
  18 filler line, ignore
  19 filler line, ignore
  20 filler line, ignore
  21 filler line, ignore
  22 filler line, ignore
  23 filler line, ignore
  24 filler line, ignore
  25 filler line, ignore
  26 filler line, ignore
  27 filler line, ignore
  28 filler line, ignore
  29 filler line, ignore
  30 filler line, ignore
  31 filler line, ignore
  32 filler line, ignore
  33 filler line, ignore
  34 filler line, ignore
  35 filler line, ignore
  36 filler line, ignore
  37 filler line, ignore
  38 filler line, ignore
  39 filler line, ignore
  40 filler line, ignore

THE ONLY REQUEST: print the numbers 1 to 150, one per line, and nothing else.
No introduction, no summary, no commentary. Just the 150 lines.
```

Measured on your own stylesheet: that message is 52 lines and 832px tall expanded, against
a 420px panel, and the collapse threshold for a user message is `maxHeight: 60` — so there
is a "Show more" to click and the pinned row is twice the height of what it is pinned
inside.

---

*Found while building an unrelated right-to-left fix for the same panel, and reported on
its own because it costs every user the same regardless of language. Happy to test a
build.*
