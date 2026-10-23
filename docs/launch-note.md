# What to say at launch

One fix ships in this extension: right to left. Until 0.9.0 there was a second, for a bug
of Claude Code's own that had nothing to do with language - Claude Code fixed that itself in
2.1.307, and it is no longer part of what ships (decisions.md 55).

This file is the source for the release note, the Marketplace description and anything
posted about it, so that all three say the same thing.

---

## The short version

> **Claude Code for VS Code, in your language.**
>
> Urdu, Arabic, Hebrew and Persian read the right way round in the Claude Code panel:
> answers, your own messages, and the box you type in.

---

## Fix one — right to left

### What is wrong

A line's direction is decided by its **first strong character**. That is the CSS rule
`unicode-bidi: plaintext`, it is doing exactly what it is specified to do, and it is
wrong for the way people actually write:

```
npm install کے بعد پروجیکٹ چلائیں
```

One English word at the front, and the whole line reads left to right. Technical writing
triggers it constantly, because sentences open with `useState`, `npm`, `package.json`.

### Why it is worth saying out loud

Nobody has to write this way. Somebody who wants to think in Urdu, Arabic, Hebrew or
Persian can always switch to English and the tool works fine — which is exactly why the
problem stays invisible to whoever builds the tool. The people it costs the most are the
ones who quietly stop using their own language for it.

That is the whole argument for this extension, and it is worth making plainly and
without complaint: **the same experience, in either direction.**

### What it actually does

- **answers** — one decision per message, taken from the first finished block that
  carries an RTL word, never revised. Applied through a single CSS rule, so paragraphs
  written after it are born correct
- **your own sent messages** — one direction for the whole message, from what it says:
  any Urdu in it and it reads right to left
- **the box you type in** — one direction, live, from any RTL letter in it
- **nothing moved by hand** — every change is the direction tag and what the browser does with
  it by itself. The timeline dot stays where Claude Code draws it

Never changes a character of anybody's text. A block with no RTL in it is left exactly
as Claude Code rendered it, down to the pixel — measured, both ways, on their own
stylesheet.

### What it does not do, said before anybody finds out

**A message that mixes two languages takes one direction as a whole** — while it is being
typed, and after it is sent. An English line inside an Urdu message is carried along with
it.

This is a limit, not an oversight, and it was paid for more than once: per-line direction
in the composer needs an element per line, the only place to put one is inside a layer
React owns, and every way of doing that either crashed the panel, re-decided lines that
were already on the screen, or put every keystroke on the screen one keystroke late.
Measured at eighty lines it cost 18ms per character — more than a whole frame. A sent
message was decided line by line for a while, from a copy built beside Claude Code's own;
in the real panel that copy was never once made, and it was the only part of this that
built anything in somebody else's page. It is gone.

**Typing is what a box is for.** While somebody types, the one thing this does is set or
clear a single attribute — and the limit above is what that costs.

---

## Fix two — the long message, fixed upstream

Until 0.9.0 this extension also fixed a bug that was not about language: an opened long
message stayed pinned with no height cap, and its "Show less" could not be reached. It is
written up on its own terms in [claude-code-bug.md](claude-code-bug.md). Claude Code fixed
it itself in 2.1.307 - a pinned message is now capped and scrolls - and 0.9.1 took ours out.
It is not part of the announcement.

---

## Establishing that it was found here

Worth being deliberate about, because of the shape of this particular fix: the RTL half
may be carried alone for a long time, but **the long-message bug is the kind a product
team fixes once it is put in front of them.** When that happens the fix will be theirs -
correctly, it belongs in their renderer - and the finding should still be attributable.

Finding is the expensive half now. Writing three lines of CSS is not; noticing that a
pinned element taller than the window can never show its own bottom, working out why it
only appears in long sessions, and reproducing it on demand - that took a person using
the thing every day.

In order of what it is actually worth:

1. **File it publicly, before it is fixed.** A dated, public issue in their own tracker
   is the whole mechanism. Priority is a timestamp somebody else's system holds, not one
   in a private repository. [issue-to-file.md](issue-to-file.md) is the title and body,
   ready to paste, with nothing in it that needs this repository to make sense - and a
   line to fill in afterwards, so the write-up and the public record point at each other.

2. **Publish the repository.** A second dated public artifact, and the one that shows the
   work behind the report - the two wrong fixes, the measurements, the versions it was
   confirmed on.

3. **Ship the extension.** A Marketplace listing is a third public date, and the only one
   that reaches the people the bug is costing today.

4. **Keep the write-up first-person and dated.** Done: the report now carries who found
   it, when it was first observed, when it was written up, and which builds it was
   reproduced on. A report with no name on it gets fixed and forgotten; one with a name
   and a date is citable.

What not to expect, so it is not a disappointment: there is no bounty for a user-interface
bug at any company I know of - bounties are for security. What a good public report
normally earns is the issue thread with your name on it, a mention in the changelog if
the team is generous, and the fact that it can be pointed at afterwards. That is worth
having, and it only exists if step 1 happens first.

---

## The part that is worth trusting, and why

This edits a file belonging to another extension, because VS Code gives no other way into
another extension's webview. That is a real thing to be careful about, so the care is
worth stating:

- **one marked block at the end of one file.** No copies kept anywhere. Removal is a
  truncation, and the round trip is exact to the byte — asserted by a test, not hoped for
- **uninstalling takes it out.** VS Code runs the extension's own cleanup when it next
  starts, and Claude Code's file is left as it was, byte for byte
- **every part fails on its own.** Each piece is asked whether it is needed and whether
  it is possible before it is switched on, and a fault in one cannot reach another. Run
  `__bidiStatus()` in the webview console to see what is on and what is not
- **it stands down rather than fighting.** If a future Claude Code reads a mixed line
  correctly by itself, or stops pinning turn headers, the part of this that existed for
  that goes quiet — measured by laying out the exact sentence the fault is about and
  looking at where the browser put it, not by reading their stylesheet
- **while you type, it sets attributes and nothing else** - one decision on the element the
  box's layers share, and a mark on each layer that turns with it. Nothing of ours goes into
  the box, and nothing in it is rebuilt
- **the box you type in was put to ten months of Claude Code** - seventeen builds, booted and
  typed into, through two restyles and a new layer - and to the next update made on purpose:
  its classes renamed, its roles taken away, its own direction forced over ours. It held
- **it reports what it measured.** A part that set a direction and found the page did not
  take it says so, instead of saying "on"

The reasoning, and every formula and fix that was tried and rejected first, is in
[decisions.md](decisions.md) — fifty-eight sections, including the wrong turns, the two
crashes, the measurements that came out the other way from what was expected, and the
limits that were accepted in the end.

---

## What not to claim

- not "Claude Code is broken" — one bug, precisely described, in a product that is
  otherwise doing something hard well
- not "full RTL support" — it fixes direction, and says plainly where it stops
- not "it will never break" — it lives inside somebody else's product. What it promises
  is that when something changes, one lamp goes out rather than all of them, and you can
  see which
