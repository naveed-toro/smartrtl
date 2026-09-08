# See it for yourself, in about a minute

Describing this bug in words does not work. Everyone nods and nobody pictures it, because
it needs three things at once — a long message, a long answer under it, and more
conversation below that — and in a fresh session it is completely invisible.

So here is the whole thing as one paste. It uses no tools, reads nothing, writes nothing
and runs no commands. It is deliberately in **English**, because the first thing people
assume is that this is a right-to-left problem, and it is not: it costs an English-only
user exactly as much.

---

## Step 1 — paste this into Claude Code and send it

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

## Step 2 — send two more short messages

Anything will do. `ok` twice is enough.

This is the step everybody skips, and it is the one that makes the bug appear. With
nothing below the turn, the panel simply scrolls to the end of the message and everything
looks fine.

## Step 3 — scroll back up to your long message, and click "Show more"

It is pinned at the top of the panel, showing its first couple of lines.

---

## What you will see — WITHOUT the extension

- the message opens and **fills the whole panel**
- you scroll, and **nothing appears to happen.** It is not doing nothing: the conversation
  behind the message is moving, and every pixel of it is hidden by the message you just
  opened. Watch the scrollbar — the thumb moves. The screen does not.
- **"Show less" never arrives.** It is at the bottom of a block that does not move
- to get out you have to scroll past the entire rest of the turn, or reload the panel

Then try it again from further up — scroll so you are halfway through the numbers before
you open the message. It gets worse the further up you were.

## What you will see — WITH the extension

- the message opens and **scrolls like ordinary text.** Its own "Show less" arrives where
  you would expect it
- opening it does not move it: it stays on the pixel it was on, whether you opened it from
  the top of the conversation, the middle, or the end
- closing it puts you back on **the line of the answer you were reading** — not at the
  beginning of it

That last one is the difference you feel every day and nobody thinks to describe: you were
partway down a long answer, opened the question above to check what you had asked, closed
it again, and got the answer back from line 1.

---

## Why the prompt is that long, and not shorter

Because a shorter one does not set the trap, and then whoever tried it decides the bug is
imaginary. Measured on Claude Code's own stylesheet, with the message from step 1:

| | |
|---|---|
| lines in the message | 52 |
| its height when expanded | **832px** |
| a panel to fit it into | 420px |
| the collapse threshold the bundle uses for a user message | `maxHeight: 60` |

So there is certainly a "Show more" to click, and the pinned row is twice the height of
the panel it is pinned inside - which is the whole bug: **a pinned element taller than
the window can never show its own bottom, because it does not move.**

The 150 numbered lines are the third condition. They give the conversation something to
scroll behind the message, which is what makes the scrolling look broken rather than
merely slow.

---

## Why the language does not matter

Try the whole thing again with an Urdu, Arabic, Hebrew or Persian message. The bug behaves
identically, because it has nothing to do with text direction — it is a pinned element
that has grown taller than the window, and a pinned element cannot show its own bottom,
because it does not move.

The reason it gets reported by right-to-left users more often is not that it affects them
more. It is that they are already looking closely at how messages are laid out.

---

Written up properly, with the cause and the fix, in [claude-code-bug.md](claude-code-bug.md).
Ready to paste into a public tracker in [issue-to-file.md](issue-to-file.md).
