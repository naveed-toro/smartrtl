# smartrtl

**Right-to-left text, fixed where it breaks.**

Urdu, Arabic, Hebrew and Persian come out wrong in a lot of software. Usually it is
not a bad renderer - it is one rule almost nobody thinks about:

> a line's direction is decided by its **first strong character**

Start a line with an English word and the whole line flips to left-to-right, even when
every other word is Urdu. Technical writing does this constantly, because it opens with
things like `useState`, `npm` or `package.json`.

This repository fixes that, one surface at a time.

## And one bug that was not about language at all

Until 0.9.0 the companion extension also fixed a fault of the Claude Code extension's own,
one that cost every user the same: **a long message you had already sent could not be
closed again** - pinned to the top of the panel with no height cap, its own "Show less" out
of reach for the length of the turn. It is written up on its own terms, with no RTL
attached, in [docs/claude-code-bug.md](docs/claude-code-bug.md).

Claude Code fixed it itself in 2.1.307, in October 2026 - a pinned message is now capped
and scrolls - and 0.9.1 took ours out (decisions.md 55).

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
| Claude Code in VS Code | companion extension | 0.9.2 - a Claude Code update costs one restart, VS Code's own: the fix goes into the update while it waits for that restart, and no second reload is asked for (decisions.md 56). 0.9.1 - only the formula: Claude Code fixed its own long-message bug in 2.1.307, and the fix this carried for it came out (decisions.md 55). 0.9.0 - clean: only the formula acts on text, and nothing measures it any more: in all four places a text is right-to-left when its first letter is, or an RTL letter comes within its first 63, the window the labelled texts put it at (decisions.md 53); nothing else of ours touches text (decisions.md 51). Before that, all four places gave the text its direction tag and nothing else, and are checked element by element, character order included, against what the browser draws when it is told - on Claude Code's own bundle with its incomplete rule deleted; nothing is moved by hand, the timeline dot included; bullets, numbers and tables included; the box you type in, the message you send, and Claude Code's own long-message bug each on a circuit of its own, put to seventeen Claude Code builds, 2.0.50 to 2.1.269; not published yet |
| AI chat sites in the browser | Chrome extension | next |
| a markdown editor | VS Code, desktop, web | shape not decided |
| Claude desktop app | a patched copy beside the installed app | 0.0.1 - for the owner's own use: the app has no extension door, and covers laid over it from outside jolted the eye, so a copy of it loads the same rule and engine; the installed app is never touched; chat, Cowork and Claude in Chrome work in it, the Code tab is not covered yet (decisions.md 54) |

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

## The documents

The code is the small part. What took the time was finding out which rule is the right
rule, and every wrong turn is written down rather than quietly dropped.

| | |
|---|---|
| [docs/reviewing.md](docs/reviewing.md) | the two questions this project has, and the one command that answers them - read before reviewing anything here |
| [docs/decisions.md](docs/decisions.md) | fifty-six sections: every rule and fix that was tried, measured and rejected, including the two that crashed, the one that was too slow, the limits that were finally accepted, and how what was left was made to outlast the next update |
| [docs/versions.md](docs/versions.md) | what was actually inside each build, read out of the `.vsix` rather than remembered |
| [docs/roadmap.md](docs/roadmap.md) | what a new surface has to provide, the four rules an adapter obeys, and what order the rest gets built in |
| [docs/claude-code-bug.md](docs/claude-code-bug.md) | the Claude Code bug on its own terms, with no RTL attached - fixed by Claude Code in 2.1.307 |
| [docs/issue-to-file.md](docs/issue-to-file.md) | the same, cut down to something that can be pasted into a public tracker |
| [docs/see-it-yourself.md](docs/see-it-yourself.md) | one prompt to paste into Claude Code that puts the bug in front of your own eyes in about a minute |
| [docs/launch-note.md](docs/launch-note.md) | what to say when this is published, including what not to claim |

## Licence

MIT - see [LICENSE](LICENSE).
