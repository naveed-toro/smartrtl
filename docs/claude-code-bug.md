# A bug in Claude Code for VS Code: an expanded message cannot be scrolled or closed

This is not an RTL bug. It has nothing to do with language, and an English-only user hits
it exactly as hard. It is written up separately so it can be reported on its own.

**Found by:** Naveed · first observed **2026-08-27**, written up on its own terms
**2026-09-02**.

**Affects:** the Claude Code extension for VS Code. Reproduced on `anthropic.claude-code`
**2.1.247, 2.1.259 and 2.1.263**, VS Code 1.135, Windows 11 - from a clean install every
time, with the conditions in "Reproducing it" below.

**Use it freely.** This write-up may be copied, quoted, filed as an issue, or acted on by
anyone, with or without permission. If it leads to a fix, a line of credit is the only
thing asked for - the finding is the work here. The fix itself is three lines of CSS.

---

## In one paragraph

A user message that heads a turn is `position: sticky`. Collapsed, that is 60px of question
held above a long answer, which is the point of it. Expanded, the same element has no height
cap at all - and **a pinned element taller than the window can never show its own bottom,
because it does not move.** Scrolling moves the conversation behind it, invisibly. Its own
"Show less" sits at the end of that pinned block, so for the length of the turn it cannot be
reached.

---

## Reproducing it, step by step

The conditions matter. The bug is invisible in a fresh session and obvious in a real one.

1. Start a session and send a **long** message - forty lines is plenty. Anything past the
   60px collapse threshold that is also taller than the panel will do.
2. Get a **long answer** under it. Asking for the numbers 1 to 150, one per line, is enough
   and costs nothing to generate.
3. Send two or three more messages, so there is conversation **below** the one from step 1.
   *This is the step that is easy to miss: with nothing below it, the panel scrolls to the
   end of the message and everything looks fine.*
4. Scroll **up** to the message from step 1. It is pinned at the top of the panel, showing
   its first two lines and a "Show more".
5. Click **Show more**.

### What you would expect

The message opens. You read it, scroll through it, and click "Show less" when you are done.

### What happens

- The message fills the whole panel and **stays there**.
- The mouse wheel does nothing you can see. It is not doing nothing - the conversation
  behind the message is scrolling, and every pixel of it is hidden by the message you just
  opened. The scrollbar thumb moves; the screen does not change.
- **"Show less" never arrives.** It is at the bottom of a block that does not move.
- To escape, you have to scroll past the entire remainder of the turn, or reload the panel.

The longer the answer under the message, the longer the panel appears frozen.

---

## Why

Two rules in `webview/index.css`, each reasonable on its own:

```css
.message.stickyHeader { position: sticky; top: 0; z-index: 2 }
.content              { overflow-y: hidden }          /* and no max-height when expanded */
```

Collapsed, the component sets `max-height: 60px` inline, so the sticky element is small and
the pinning does exactly what it is meant to: it keeps the question visible while you read
the answer.

Expanded, that inline cap is removed and nothing replaces it. The sticky element becomes as
tall as the message. Sticky positioning holds an element at `top: 0` for as long as its
containing block is in view - so an element taller than the viewport is held with its bottom
permanently off-screen, and no amount of scrolling within that turn will reveal it.

---

## Where it is worst

- **The further up you had scrolled, the worse it is.** Opening a message at the very bottom
  of a conversation looks fine, because there is nothing below it to hide.
- **The longer the answer, the longer it lasts** - the pin holds until the whole turn has
  passed.
- It is reported by RTL users far more often than by anyone else, but only because they are
  looking closely at message layout for other reasons. The behaviour is identical in
  English.

---

## Suggested fixes, in order of how little they change

**1. Stop pinning a message while it is expanded.** Once the reader has opened the message,
there is nothing left for it to hold above anything - they are reading the thing itself.
One rule, no script, no capping:

```css
.stickyHeader:has(.expandableContainer > .buttonContainer) { position: static }
```

The collapse row exists only in the expanded state and only as a direct child, so it is a
reliable signal.

**2. If it must stay pinned, give the expanded body its own scrollbar**, capped to something
under the viewport height. This works, but it means choosing how much of a window a message
may occupy, and the right answer differs on a laptop and an external display.

**3. Either way, keep the reader's place across the toggle** - and it is two different
promises, not one.

*Opening.* A collapsed message is pinned, so it is visible wherever you have scrolled to;
the moment it stops being pinned it falls back to where it really lives in the document,
which may be thousands of pixels above the eye. Restoring the message's own top fixes
that - clamped to the visible area, or reading to the end of a long one and closing it
puts it back off the top of the screen.

*Closing.* Here the pinning bites a second time, and this half is easy to miss. The
moment a message collapses it is sticky again, so its top IS the panel's top whatever the
scroll position: any drift measured against it is zero, nothing is scrolled, and the view
is left wherever reading the message happened to leave it. Somebody who was partway down
a long answer, opened the question above it to check something and closed it again gets
the answer back **from its beginning**.

The anchor for that has to be an element BELOW the message, and this was measured rather
than reasoned: anchoring to the turn the message heads brought its top back to the pixel
and still left the reader 20px out, because the message's own collapsed height was not
quite what it had been. Everything under a message moves rigidly when that message grows
or shrinks, so putting one element under it back where it was puts the whole of what the
reader was reading back where it was - whatever the message above it did in between.

---

## What we did about it meanwhile

[SmartRTL for Claude Code](../apps/vscode-claude) applies fix 1 and both halves of fix 3
from outside, by appending a marked block to the webview bundle. That is a workaround for
our own use, not a solution - the real fix belongs in the renderer, where it costs one CSS
rule and nobody has to patch anybody's files.

It is also built to get out of the way. The part of it that exists for this bug asks the
live element whether a turn header is still `position: sticky` before it does anything, so
the day this is fixed upstream that part switches itself off rather than arguing with the
fix. `__bidiStatus()` in the webview console reports which parts are on and which have
stood down.

The reasoning behind each of the above, including two fixes that were tried and rejected
first - capping the height, and forcing the collapse row sticky, which moved a button the
extension had placed - is in [decisions.md](decisions.md) sections 10, 15 and 29.
