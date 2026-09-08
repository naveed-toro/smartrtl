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

---

*Found while building an unrelated right-to-left fix for the same panel, and reported on
its own because it costs every user the same regardless of language. Happy to test a
build.*
