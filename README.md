# smartrtl

**Right-to-left text, fixed where it breaks.**

Urdu, Arabic, Hebrew and Persian come out wrong in a lot of software. Usually it is
not a bad renderer - it is one rule almost nobody thinks about:

> a line's direction is decided by its **first strong character**

Start a line with an English word and the whole line flips to left-to-right, even when
every other word is Urdu. Technical writing does this constantly, because it opens with
things like `useState`, `npm` or `package.json`.

This repository fixes that, one surface at a time.

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
| Claude Code in VS Code | companion extension | in progress |
| AI chat sites in the browser | Chrome extension | started, paused |
| Claude desktop app | not investigated yet | planned |

The three share one thing only: the rule that decides which direction a piece of text
belongs to. Everything else - how the fix is delivered - is different for each.

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
