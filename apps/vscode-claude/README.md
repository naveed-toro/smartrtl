# @smartrtl/vscode-claude

> # ⚠ Uninstalling does not turn this off
>
> ### ⚙ menu above → “Turn the right-to-left fix off”
>
> Then uninstall or disable as normal. Forgot? It stops working by itself within a day.

Fixes right-to-left text in the Claude Code panel for VS Code.

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
  contenteditable over a visible mirror; the direction flag goes on the container they
  share, so the caret can never sit on one side while the glyph sits on the other
- **the timeline dot** - moves to the side its own message reads from
- **long messages** - a bug of Claude Code's own, and nothing to do with RTL. A message
  that heads a turn is pinned to the top; expanded it has no height cap, so it covers the
  panel, the conversation scrolls invisibly behind it, and its own "Show less" can never
  be reached. An expanded message stops being pinned - and the view follows it, so it
  stays on the exact pixel it was on, whether you opened it from the top of the
  conversation, the middle, or the bottom

Each of those, and the formulas and fixes that were tried and rejected first, is written
up in [docs/decisions.md](../../docs/decisions.md) - fifteen sections, including the two
wrong fixes for the long-message bug and the one that broke the extension outright.

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
- `streaming.test.js` - samples every animation frame while an answer arrives character
  by character, and holds the design to its promise: at most one change per block, and
  never back and forth

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
