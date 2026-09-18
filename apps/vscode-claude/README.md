# @smartrtl/vscode-claude

> # ⚠ Uninstalling does not turn this off
>
> ### ⚙ menu above → “Turn off the right-to-left fix”
>
> Then uninstall or disable as normal. Forgot? It stops working by itself within a day.

Fixes right-to-left text in the Claude Code panel for VS Code - **and one bug of Claude
Code's own that has nothing to do with language.**

| | |
|---|---|
| **Right to left** | Urdu, Arabic, Hebrew and Persian take the direction the formula gives them - answers while they stream and once finished, your own messages, and the box you type in. A line that opens with `npm` and turns Urdu is no longer dragged left to right |
| **Long messages** | a message you have already sent can be opened, read and closed again. Today it cannot, and that costs an English-only user exactly as much - see below |

Never changes a character of anybody's text. From 0.7.0 the one thing it does to text is set
its direction by one formula, and nothing else of its own acts on text.

## Why this one has to be asked, when other extensions do not

Most extensions keep their whole effect inside themselves, so deleting the folder removes
everything - that is not a feature they implement, it is a consequence of never reaching
outside their own box.

This one reaches outside. It adds a small marked block to a file that belongs to the
**Claude Code** extension, because VS Code gives an extension no other way to reach inside
another extension's webview. That is also why it keeps working after Claude Code updates.

VS Code cleans up only what it owns, and has no idea we touched a foreign file.
`vscode:uninstall` - the one hook meant for exactly this - has been broken since VS Code
1.69 ([#155561](https://github.com/microsoft/vscode/issues/155561)), and nothing at all
fires when an extension is disabled. Asking you to turn it off first is the honest
workaround, not a preference.

Three things make that safe to live with: turning it off restores Claude Code byte for
byte, the block stops working by itself within a day if nobody does, and Claude Code's
next update replaces the file anyway.

## How the fix reaches the screen

VS Code gives an extension no way to reach inside another extension's webview - they
are isolated on purpose. So the fix is a small script appended to the Claude Code
webview bundle, and this package's job is to put it there and keep it there.

```
src/injected/payload.js   what runs inside the webview
build/bundle-payload.js   inlines core + dom into it -> dist/payload.js
```

`dist/` is generated and not committed. Build it with:

```
npm run build
```

## Why the rule and the engine are not in this file

The payload cannot `import` anything - it is concatenated onto someone else's bundle
and runs as a plain script. The obvious shortcut is to paste the regexes in and move
on. That is exactly how three products end up disagreeing about the same question six
months later, so the build step inlines [`@smartrtl/core`](https://github.com/naveed-toro/smartrtl/blob/main/packages/core) - the
rule - and [`@smartrtl/dom`](https://github.com/naveed-toro/smartrtl/blob/main/packages/dom) - the engine that decides when to ask
it - instead. What is left in this file is only what is true of Claude Code and of
nothing else.

## What the payload actually does (0.7.0)

**1. The direction of text, by the formula alone.** One rule, `openingLetters` in
[`@smartrtl/core`](https://github.com/naveed-toro/smartrtl/blob/main/packages/core):

```
first letter right-to-left                            -> right-to-left
first letter left-to-right, an RTL letter within 45   -> right-to-left
first letter left-to-right, none within 45            -> left-to-right
```

45 was measured on the answers of Claude and ChatGPT
([docs/decisions.md](https://github.com/naveed-toro/smartrtl/blob/main/docs/decisions.md), section 50).

- **an answer** - every paragraph, heading, list item and table cell takes its own direction
  from its own text, the moment it arrives and on every change after. A list item is decided
  by itself, so an English item in an Urdu list reads left to right, bullet included
- **the box you type in** - both of its layers, the one holding the caret and the one drawn
  over it, take the draft's direction after every keystroke
- **a message you send** - takes its own text's direction

On exactly those elements Claude Code's own guess - `unicode-bidi: plaintext` and
`dir="auto"`, the first strong character - is switched off from a cascade layer ahead of its
stylesheet, so no second rule acts on the same text. Code blocks are never touched.

**Nothing else acts on text.** Until 0.6.0 there was more: one decision for a whole message,
bullets kept on one side, numbers like `250–400ms` and code kept in order, and a check of
whether Claude Code had fixed this itself. All of it was taken out in 0.7.0 on purpose, so
that what a reader sees is the formula and only the formula - and whether a block visibly
turns while it streams can be judged in daily use. Section 51.

What that costs a reader, knowingly: an Urdu list with an English item has bullets on both
sides, and `250–400ms` inside an Urdu line can read `400ms–250` - both are what the browser
does when it is told only a direction.

## The other fix: long messages you cannot close

**This one is not about language.** An English-only user hits it exactly as hard, and it
is reported on its own terms in
[docs/claude-code-bug.md](https://github.com/naveed-toro/smartrtl/blob/main/docs/claude-code-bug.md).

A message that heads a turn is `position: sticky`. Collapsed, that is a couple of lines
of question held above a long answer, which is the point of it. Expanded, the same
element has no height cap - and **a pinned element taller than the window can never show
its own bottom, because it does not move.** The wheel scrolls the conversation behind it,
invisibly; its own "Show less" sits at the end of that pinned block and cannot be
reached for the length of the turn.

What this does about it:

- an **expanded** message stops being pinned, so it scrolls like ordinary content and its
  button comes back into reach. Nothing is capped and nothing is moved - how much of a
  window a message may take is not ours to decide, and the answer differs on a laptop and
  an external display
- a **collapsed** message is still pinned; that part was never broken
- opening one keeps it **under your eye** - the exact pixel it was on, whether you opened
  it from the top of the conversation, the middle or the end
- closing it gives you back **the line you were reading** - the answer underneath, where
  you left it, rather than from its beginning
- a long message Claude Code takes for a **command** - a skill with long arguments, or any
  message that opens with `/`, a pasted path included - has no "Show more" or "Show less" at
  all, and is pinned anyway: it is no longer held over its own answer. A pinned message
  showing its whole length, and taller than half the panel, scrolls like ordinary content

Measured in Claude Code's own app with a real answer under the message, in every build that
pins one - 2.1.90 to 2.1.268: untouched, "Show less" arrives after twenty-two turns of the
wheel and closing it leaves you 2,640px from your line; with this in, three turns, and
exactly back on your line. It is a lamp of its own - its own observers and stylesheet - that
asks the page about every message it pins, and comes back out by itself if Claude Code stops
pinning them.

Two wrong fixes came first and are written up with the right one: capping the height, and
forcing the collapse row sticky, which moved a button the extension had placed.

## Tests

```
npm install                     # once - playwright, for the browser
npx playwright install chromium # once - the browser itself
npm test
```

- `only-the-formula.test.js` - Claude Code's own running app with the payload in it: an
  answer streamed three characters at a time, and in every painted frame every block's
  direction is exactly the formula's; the box after every keystroke; a sent message; nothing
  of ours anywhere else; and nothing left after `__bidiFixOff()`
- `pinned-message.test.js` and `expandable.test.js` - Claude Code's own long-message bug,
  opened, read to "Show less" and closed, with every name renamed, and with a build that has
  stopped pinning
- the install, update and uninstall path - `patcher.test.js`, `patch-format.test.js`,
  `find-target.test.js`, `reinstall.test.js`, `uninstall.test.js`, `status-bar.test.js`,
  `status-truth.test.js`, `startup-cost.test.js`, `reachable-messages.test.js`
- `docs.test.js` - every link, file name, count and promise in the documents, put back to
  the thing it is about

In the webview console (Developer: Open Webview Developer Tools):

```js
__bidiStatus()   // what the formula has tagged, and the pinned message's state
__bidiFixOff()   // take all of it out, live
```

## Limits

This edits a file that belongs to another extension. An update to Claude Code replaces
that file and the fix is gone until it is applied again - which is the whole reason
this is an extension and not a script: it notices the update and puts the fix back, on
startup and on `extensions.onDidChange`, so both would have to miss for it to stay gone.

**Its whole footprint is one marked block at the end of one file.** There is no backup
copy beside it and nothing kept anywhere else, because there is nothing to keep: the
original is everything before the marker, so removal is a truncation. The round trip is
exact to the byte, and a test asserts that rather than hoping for it.

That shape matters more than any hook. It means the change can be undone by anyone, with
or without this extension - by the `vscode:uninstall` script VS Code runs after the
extension is removed, by `SmartRTL: Turn off the right-to-left fix` on demand, by Claude
Code's own next update (which installs into a fresh folder), or by hand:

```powershell
$f = "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js"
Get-Item $f | ForEach-Object {
  $t = Get-Content $_ -Raw
  $i = $t.IndexOf("/* ==== smart-rtl-direction patch BEGIN ==== */")
  if ($i -ge 0) { [IO.File]::WriteAllText($_.FullName, $t.Substring(0, $i).TrimEnd("`n")) }
}
```

Two gaps remain honest ones: *disabling* the extension is not uninstalling it and fires no
hook, and the uninstall hook has been reported to miss in some versions of VS Code. Either
way the block is still one truncation away from gone.

It is the best available arrangement, not a cure; the real fix belongs upstream, in the
renderer.
