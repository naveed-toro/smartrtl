# smartrtl

**Right-to-left text, fixed where it breaks.**

Urdu, Arabic, Hebrew and Persian come out wrong in a lot of software. Usually it is
not a bad renderer - it is one rule almost nobody thinks about:

> a line's direction is decided by its **first strong character**

Start a line with an English word and the whole line flips to left-to-right, even when
every other word is Urdu. Technical writing does this constantly, because it opens with
things like `useState`, `npm` or `package.json`.

This repository fixes that, one surface at a time.

## And one bug that is not about language at all

The Claude Code extension for VS Code has a fault that costs every user the same,
whatever they write in: **a long message you have already sent cannot be closed again.**

A message that heads a turn is pinned to the top of the panel. Collapsed that is the
point of it; expanded it has no height cap, and a pinned element taller than the window
can never show its own bottom, because it does not move. The wheel scrolls the
conversation behind it, invisibly, and its own "Show less" is at the end of the pinned
block, out of reach for the length of the turn.

The companion extension fixes that too: an expanded message scrolls like ordinary
content, opening one keeps it under your eye, and closing it gives you back the line of
the answer you were reading. It is written up on its own terms, with no RTL attached, in
[docs/claude-code-bug.md](docs/claude-code-bug.md) so that it can be reported and fixed
upstream - at which point this half of the extension stands down by itself.

## Does this sound familiar?

- my Urdu text starts from the left instead of the right
- arabic text is reversed / backwards in my editor
- hebrew line renders left to right when it starts with an English word
- persian text direction is wrong in the chat panel
- ‏میری اردو بائیں طرف سے شروع ہو رہی ہے
- ‏النص العربي يظهر معكوسًا
- ‏הטקסט בעברית מוצג הפוך
- ‏متن فارسی برعکس نمایش داده می‌شود

Then yes, this is the same bug.

## Surfaces

| where | what it is | status |
|---|---|---|
| Claude Code in VS Code | companion extension | works; tested live; not published yet |
| AI chat sites in the browser | Chrome extension | next |
| a markdown editor | VS Code, desktop, web | shape not decided |
| Claude desktop app | not investigated yet | unknown |

They share two things: the rule that decides which direction a piece of text belongs to,
and the engine that decides when to ask it. Everything else - how the fix reaches the
screen - is different for each, and lives in an adapter of a few dozen lines. The order
they get built in, and what an adapter has to provide, are in
[docs/roadmap.md](docs/roadmap.md).

## The rule

```
starts with RTL                 -> RTL   (already correct, nothing to do)
starts with LTR, no RTL after   -> LTR   (left alone)
starts with LTR, RTL follows    -> RTL
```

Plus one safety rule: **a block with no RTL character in it is never touched.**

A line that opens in English, contains RTL, and is still meant to read left to right
does exist - but no local signal separates it reliably, so that case is given up on
purpose, in exchange for every common case being right. The reasoning, and the two
formulas that were tried and rejected before this one, are written down in
[docs/decisions.md](docs/decisions.md).

## Licence

MIT - see [LICENSE](LICENSE).
