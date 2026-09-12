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
months later, so the build step inlines [`@smartrtl/core`](https://github.com/naveed-toro/smartrtl/blob/main/packages/core) - the
rule - and [`@smartrtl/dom`](https://github.com/naveed-toro/smartrtl/blob/main/packages/dom) - the engine that decides when to ask
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
- **the timeline dot** - a message's own dot moves to the side that message reads from, at
  the same distances: 9px from the row's edge, 14px from the text, exactly as Claude Code
  draws it on the other side. No other row pays for it - an English answer in the same
  conversation is identical to the pixel
- **the composer** - the box you type in is two stacked layers, an invisible
  contenteditable over a visible mirror; one flag on the container they share turns both,
  so the caret can never sit on one side while the glyph sits on the other. Nothing of
  ours goes inside either layer: while you type, the one thing that happens is that flag
  being set or cleared, with a mark on each layer that turns. It is a lamp on its own
  circuit - its own observers and its own stylesheet - found five ways (by name, and by
  `role=textbox`, its label, `aria-multiline` and `data-placeholder`, which is what the box
  IS and has not changed once in ten months of Claude Code), and its rules sit in a cascade
  layer ahead of all of Claude Code's, so no stylesheet of theirs can overrule them. Put to
  seventeen builds, 2.0.50 to 2.1.268: all of them hold
- **your own messages, as a whole** - a sent message takes one direction from what it
  says. It is a lamp of its own, apart from answers: found by Claude Code's class name and
  by the `dir="auto"` its text is handed to - either one is enough - turned on the text
  alone, never on the row where the buttons are, and nothing is built inside it. Put to the
  same seventeen builds: every one that gives a sent message a road turns it

Each of those, and the formulas and fixes that were tried and rejected first, is written
up in [docs/decisions.md](https://github.com/naveed-toro/smartrtl/blob/main/docs/decisions.md) - forty-one sections, including
three attempts at per-line direction in the composer that were built, shipped and then
withdrawn, the measurements that ended each one, the limits that were finally accepted so
that a Claude Code update is the least likely thing to break it, and the box you type in
put to ten months of Claude Code and to the next update made on purpose.

### What it gives up, before anybody finds out

**A message that mixes two languages takes one direction as a whole** - while it is
typed, and once it is sent. The English line inside an Urdu message goes with it.

Per-line direction needs an element per line, and the only place to put one is inside a
layer React owns. Every way of doing that in the composer either crashed the panel, or
re-decided lines already on the screen, or put every keystroke on the screen one
keystroke late - measured at 18ms of work per character on an eighty-line draft, more
than a whole frame. For a sent message it meant building a copy of the message beside
Claude Code's own, and in the real panel that copy never once ran. Both are given up on
purpose: what is left sets attributes and nothing else, which is the shape that survives
an update.

### What it costs

One rule above all the others here: **a person typing must not be able to tell this is
installed.** Everywhere else a millisecond is worth arguing about; in the box you type into it
is a verdict.

| | |
|---|---|
| a keystroke | **0.18ms** - about one percent of a frame |
| an answer arriving, word by word | the same wall clock, the same layout and the same style recalculation as an untouched panel |
| every time the editor opens | **14ms** |
| switching between files | nothing - it stopped reading the disk for that |
| the block added to Claude Code's bundle | 154KB, against its 5.28MB |

Measured in Claude Code's own running panel, with the fix injected and taken out again
between blocks of keystrokes, hundreds a side, so that nothing about the machine can be
mistaken for something about the fix. Three earlier instruments disagreed with each other
before that one; what went wrong with each is in
[docs/decisions.md](https://github.com/naveed-toro/smartrtl/blob/main/docs/decisions.md),
section 40.

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

The tests do not check that the code says the right things; they render the payload
in a page that carries the extension's own two CSS rules, and measure what a reader
would see. That is how the reversed `250-400ms` was caught, and how the jitter numbers
in [docs/decisions.md](https://github.com/naveed-toro/smartrtl/blob/main/docs/decisions.md) were arrived at.

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
- `composer-survival.test.js` - the box you type in, put to the next update made on purpose:
  Claude Code forcing its own direction, renaming every class, wrapping the box, adding a
  layer, rebuilding it, failing around it. The box turns whole, or is given back whole
- `sent-survival.test.js` - a message somebody sent, put to the next update the same way:
  Claude Code forcing `plaintext` on it, renaming everything, drawing it differently - and
  never a decision from it reaching the answer beside it
- `pinned-message.test.js` - Claude Code's own long-message bug, in its own app: a real
  answer streamed under a forty-line message, then opened, read to "Show less" and closed -
  and the same for a message it takes for a command, with every name renamed, and with a
  build that has stopped pinning
- `history.test.js` - the box, a sent message and a long pinned message in every build of
  Claude Code in a folder, booted, typed into and sent; `build/fetch-claude-builds.js` fetches
  the builds
- `independent-lamps.test.js` - one part failing switches off only itself, and if Claude
  Code fixes something itself, the part that existed for it stands down
- `real-webview.test.js` - every question above, put to Claude Code's own stylesheet with
  its own class names read out of it at run time, so an update cannot leave a green suite
  measuring a page nobody has
- `real-bundle.test.js` - no copy at all: Claude Code's own webview bundle, running, with
  the payload appended the way the patcher appends it, and the composer React renders
  typed into - including how quickly, with the fix and without it
- `claude-shape.test.js` - every assumption this fix makes about Claude Code, one line each,
  so the day an update breaks something starts with which one

Those three, plus `real-webview.test.js`, run every day on GitHub against the newest
Claude Code on the Marketplace - `.github/workflows/claude-watch.yml` - and nowhere near
anybody's editor.
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
  unpinExpandedMessage: "on - measured working",
  keepTheViewOnTheMessage: "on",
  composer: "on - measured working",
  sentMessages: "on - measured working",
  unpinDetail: { found: "by name - an opened message has a collapse row",
                 pinned: 4, letGo: 1, sheet: "style element, first in the page", ... },
  engine: { blocks: "watching", sent: "on - measured working",
            composer: "on - measured working", contained: 0,
            composerDetail: { found: 'by [class*="messageInput_"]; the layer over it by [class*="mentionMirror_"]',
                              sheet: "style element, first in the page", boxes: 1, ... },
            sentDetail: { found: 'by [class*="expandableContainer_"] [class*="content_"]',
                          messages: 3, turned: 2, ... } } }
```

`composerDetail.found` says which of its five roads found the box you type in,
`sentDetail.found` which of its two found a sent message, and `unpinDetail.found` which of
its two found an opened message. On the day a restyle renames Claude Code's classes they
read `by [contenteditable][role="textbox"]`, `by the run handed to dir="auto"` and `by what
it is - pinned, showing its whole length, taller than half the panel` instead - still
working, and already telling you which road closed.

`measured working` means the direction was set AND read back off the page afterwards. A
part that set it and found the page did not take it says `not working`, and why - which
is exactly what a Claude Code update changing a rule underneath it looks like. That is
how 2.1.267 broke the box you type in: silently, while this still said `on`.

**Is it possible?** If a class name is renamed or a component restyled, the part that
depended on it goes off *on its own* and says so. Nothing else notices, and a block that
throws for a reason nobody anticipated is caught at that block - `contained` counts them,
because a fix that has quietly stopped working looks exactly like one that is working.

**Is it needed?** If Claude Code fixes something itself, the part of this that existed for
it goes quiet rather than fighting it - two fixes for one fault argue invisibly, and the
argument is invisible to whoever shipped either of them. That is **measured, not read**. A
stylesheet can be renamed, moved, overridden or shipped in a second file; where the browser
actually puts the first character of a line cannot be any of those things.

All four parts ask, and each asks about itself:

- **answers** - a copy of their own markdown root, off screen, is asked to lay out the exact
  sentence the fault is about, and read back
- **the box you type in** and **a sent message** - asked of the real thing rather than a copy,
  because half of what matters about those is the host's own live layer. The first draft, or
  the first message, that opens in Latin and turns right-to-left is read before a single
  attribute of ours is on it: drawn from the left, the fault is here; drawn from the right,
  Claude Code has fixed it. Text that is only Urdu is never asked with - the browser reads
  that right to left whether the fault is there or not
- **the long message nobody can read past** - every message the page pins is asked whether it
  is really `position: sticky`, and the first one named as pinned that is not takes the whole
  of that fix back out of the page

What stands down is only the part the fix was for. A page that lays out a mixed draft
correctly has said nothing whatsoever about what it does with a message once it is sent, or
with an answer. And the rules themselves do not depend on one road into the page - if the
webview ever refuses a style element, they arrive as a constructed stylesheet instead, and
`__bidiStatus()` says which. A part that has thrown and never once worked says that too,
rather than `on`.

`__bidiFixOff()` in that console takes all of it out, live, at any time.

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
