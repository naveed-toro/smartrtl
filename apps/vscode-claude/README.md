# @smartrtl/vscode-claude

> # ⚠ Uninstalling does not turn this off
>
> ### ⚙ menu above → “Turn the right-to-left fix off”
>
> Then uninstall or disable as normal. Forgot? It stops working by itself within a day.

Fixes right-to-left text in the Claude Code panel for VS Code - **and one bug of Claude
Code's own that has nothing to do with language.**

| | |
|---|---|
| **Right to left** | Urdu, Arabic, Hebrew and Persian read the right way round: answers, your own messages, and the box you type in. A line that opens with `npm` and turns Urdu is no longer dragged left to right |
| **Long messages** | a message you have already sent can be opened, read and closed again. Today it cannot, and that costs an English-only user exactly as much - see below |

Never changes a character of anybody's text, and a block with no RTL in it is left
exactly as Claude Code rendered it, to the pixel.

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
months later, so the build step inlines [`@smartrtl/core`](../../packages/core) - the
rule - and [`@smartrtl/dom`](../../packages/dom) - the engine that decides when to ask
it - instead. What is left in this file is only what is true of Claude Code and of
nothing else.

## What the payload actually does

- **answers** - one decision per message, never revised, applied through a single CSS
  rule so blocks written later are born correct
- **your own messages** - these are not markdown. They render through a plainText path
  as a bare `<span dir="auto">`, which is the first-strong-character rule this project
  exists to replace, applied by the extension itself in the one place the engine could
  not see. The body div is named as a block, and the engine tells any `dir="auto"`
  inside a decided block to inherit that decision
- **the composer** - the box you type in is two stacked layers, an invisible
  contenteditable over a visible mirror; one flag on the container they share turns both,
  so the caret can never sit on one side while the glyph sits on the other. Nothing of
  ours goes inside either layer, and no code of ours runs while you type
- **your own messages, line by line** - a sent message is one element with newlines in
  it, so one decision would govern all of it: paste a command, press shift+enter, write
  Urdu underneath, and the command is dragged round with the Urdu. Its lines are split
  into elements of their own and each is decided by the formula
- **the timeline dot** - moves to the side its own message reads from

Each of those, and the formulas and fixes that were tried and rejected first, is written
up in [docs/decisions.md](../../docs/decisions.md) - thirty-three sections, including
three attempts at per-line direction in the composer that were built, shipped and then
withdrawn, and the measurements that ended each one.

### What it gives up, before anybody finds out

**A draft that mixes two languages goes right to left as a whole while it is being
typed.** The English line inside it is carried along until the message is sent, at which
point it reads correctly.

Per-line direction in the composer needs an element per line, and the only place to put
one is inside a layer React owns. Every way of doing that either crashed the panel, or
re-decided lines already on the screen, or put every keystroke on the screen one
keystroke late - measured at 18ms of work per character on an eighty-line draft, more
than a whole frame. Typing is what a box is for, so nothing of ours runs while anybody
types.

## The other fix: long messages you cannot close

**This one is not about language.** An English-only user hits it exactly as hard, and it
is reported on its own terms in
[docs/claude-code-bug.md](../../docs/claude-code-bug.md).

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

Two wrong fixes came first and are written up with the right one: capping the height, and
forcing the collapse row sticky, which moved a button the extension had placed.

## Tests

```
npm install                     # once - playwright, for the browser
npx playwright install chromium # once - the browser itself
npm test
```

The tests do not check that the code says the right things; they render the payload
in a page that carries the extension's own two CSS rules, and measure what a reader
would see. That is how the reversed `250-400ms` was caught, and how the jitter numbers
in [docs/decisions.md](../../docs/decisions.md) were arrived at.

Every case is a line that came out of a real answer, and several are the exact lines
that broke an earlier version.

- `rendering.test.js` - direction per block, the safety rule, all four RTL languages,
  the timeline dot, and the composer's two layers staying in step
- `streaming.test.js` / `jitter.test.js` - sample every animation frame while an answer
  arrives character by character, and hold the design to its promise: at most one change
  per block, and never back and forth
- `expandable.test.js` - the long-message fix, including the round trip: open a question
  from partway down a long answer, close it, and land on the line you were reading
- `host-owned-dom.test.js` - the rule a crash was paid for: nothing the host put in its
  own DOM is moved, replaced or thrown away
- `independent-lamps.test.js` - one part failing switches off only itself, and if Claude
  Code fixes something itself, the part that existed for it stands down
- `real-webview.test.js` - every question above, put to Claude Code's own stylesheet with
  its own class names read out of it at run time, so an update cannot leave a green suite
  measuring a page nobody has
- `docs.test.js` - the documents get the same treatment as the code: every link, every
  file name, every count and every promise made about what the payload contains, put back
  to the thing it is about. A document that has gone stale reads exactly like one that has
  not

## When Claude Code changes

It will. This is a guest inside a product that ships every week, so the question worth
answering is not whether everything keeps working - it is **how much goes dark, and
whether anything here starts arguing with a fix of theirs.**

Every part is on its own circuit. Before it is switched on it is asked two questions, and
both answers are kept where you can read them:

```js
__bidiStatus()      // in the webview console: Developer: Open Webview Developer Tools
```
```
{ direction: "on",
  unpinExpandedMessage: "on",
  composer: "on",
  splitSentMessages: "on",
  keepTheViewOnTheMessage: "on",
  engine: { blocks: "watching", perLine: "on", contained: 0 } }
```

**Is it possible?** If a class name is renamed or a component restyled, the part that
depended on it goes off *on its own* and says so. Nothing else notices, and a block that
throws for a reason nobody anticipated is caught at that block - `contained` counts them,
because a fix that has quietly stopped working looks exactly like one that is working.

**Is it needed?** If Claude Code fixes something itself, the part of this that existed for
it goes quiet rather than fighting it - two fixes for one fault argue invisibly. That is
**measured, not read**: a copy of their own markdown root, off screen, is asked to lay out
the exact sentence the fault is about, and where the browser puts the first character is
the answer. A stylesheet can be renamed, moved or overridden; where the text ends up
cannot. The unpinning rule asks the live element whether a turn header is still
`position: sticky`, and stands down if it is not.

If the whole of it ever stands down, everything comes out through the same path a person
would use - and `__bidiFixOff()` in that console is that path, live, at any time.

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
extension is removed, by `SmartRTL: Remove the right-to-left fix` on demand, by Claude
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
