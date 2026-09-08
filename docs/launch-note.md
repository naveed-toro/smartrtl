# What to say at launch

Two fixes ship in this extension, and only one of them is about language. The second is
easy to leave out of the announcement because it was never the point — and it is the one
that affects every user of Claude Code for VS Code, in every language.

This file is the source for the release note, the Marketplace description and anything
posted about it, so that all three say the same thing.

---

## The short version

> **Claude Code for VS Code, in your language — and one bug fixed for everybody.**
>
> Urdu, Arabic, Hebrew and Persian read the right way round in the Claude Code panel:
> answers, your own messages, and the box you type in.
>
> And a long message you have already sent can be opened, read and closed again. Today
> it cannot — that one has nothing to do with language, and an English-only user hits it
> exactly as hard.

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
- **your own sent messages** — decided line by line, so an English line inside an Urdu
  message is not dragged round with it
- **the box you type in** — one direction, live, from any RTL letter in it
- **the timeline dot** — moves to the side its own message reads from

Never changes a character of anybody's text. A block with no RTL in it is left exactly
as Claude Code rendered it, down to the pixel — measured, both ways, on their own
stylesheet.

### What it does not do, said before anybody finds out

**A draft that mixes two languages goes right to left as a whole while it is being
typed.** An English line inside an Urdu draft is carried along with it until the message
is sent, at which point it reads correctly.

This is a limit, not an oversight, and it was paid for three times: per-line direction in
the composer needs an element per line, the only place to put one is inside a layer React
owns, and every way of doing that either crashed the panel, re-decided lines that were
already on the screen, or put every keystroke on the screen one keystroke late. Measured
at eighty lines it cost 18ms per character — more than a whole frame.

**Typing is what a box is for.** So the composer runs no code of ours at all while
somebody types, and the limit above is what that costs.

---

## Fix two — the long message you cannot close

**This is not an RTL bug.** It is written up separately, on its own terms, in
[claude-code-bug.md](claude-code-bug.md), so it can be reported and read without any of
the above attached to it.

### What happens

A message that heads a turn is pinned to the top of the panel — `position: sticky`.
Collapsed, that is a couple of lines of question held above a long answer, which is the
point of it. Expanded, the same element has no height cap at all.

**A pinned element taller than the window can never show its own bottom, because it does
not move.** The wheel scrolls the conversation behind it, invisibly. Its own "Show less"
sits at the end of that pinned block, so for the length of the turn it cannot be reached.

It is invisible in a fresh session and obvious in a real one: it needs a long message, a
long answer under it, and something below that.

### What this extension does about it

- an **expanded** message stops being pinned, so it scrolls like ordinary content and its
  own button comes back into reach. Nothing is capped and nothing is moved: how much of a
  window a message may take is not ours to decide
- a **collapsed** message is still pinned — that part was never broken
- opening one keeps it **under your eye**: it stays on the pixel it was on, whether you
  opened it from the top of the conversation, the middle or the end
- closing it gives you back **the line you were reading**. Not the message — the answer
  underneath it, exactly where you left it

That last one is the half that is easiest to miss and the most annoying to live with:
you were partway down a long answer, opened the question above to check something,
closed it again — and got the answer back from its beginning.

### How to say it

Factually, and without an accusation. Every large product has bugs that only show up in
long sessions, and a report that reads as a complaint gets argued with, while one that
reads as a careful reproduction gets fixed. The write-up is deliberately in that second
shape: what happens, what you would expect, the exact conditions, and why the obvious
fixes are wrong.

**And the goal is for this half to become unnecessary.** If Claude Code fixes it, this
extension notices and stands down on its own — see below.

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
- **it stops by itself.** The block carries an expiry that the extension re-stamps while
  it is installed. Left alone, it goes inert within a day
- **every part fails on its own.** Each piece is asked whether it is needed and whether
  it is possible before it is switched on, and a fault in one cannot reach another. Run
  `__bidiStatus()` in the webview console to see what is on and what is not
- **it stands down rather than fighting.** If a future Claude Code reads a mixed line
  correctly by itself, or stops pinning turn headers, the part of this that existed for
  that goes quiet — measured by laying out the exact sentence the fault is about and
  looking at where the browser put it, not by reading their stylesheet
- **it never runs while you type.** Not "it is fast": it does not run

The reasoning, and every formula and fix that was tried and rejected first, is in
[decisions.md](decisions.md) — thirty sections, including the wrong turns, the two
crashes, and the measurements that came out the other way from what was expected.

---

## What not to claim

- not "Claude Code is broken" — one bug, precisely described, in a product that is
  otherwise doing something hard well
- not "full RTL support" — it fixes direction, and says plainly where it stops
- not "it will never break" — it lives inside somebody else's product. What it promises
  is that when something changes, one lamp goes out rather than all of them, and you can
  see which
