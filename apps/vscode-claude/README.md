# @smartrtl/vscode-claude

Fixes right-to-left text in the Claude Code panel for VS Code.

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
- **the composer** - the box you type in is two stacked layers, an invisible
  contenteditable over a visible mirror; the direction flag goes on the container they
  share, so the caret can never sit on one side while the glyph sits on the other
- **the timeline dot** - moves to the side its own message reads from
- **long messages** - keeps the collapse control on screen and returns you to the
  message when you collapse it

Each of those, and the four rules that were tried and rejected first, is written up in
[docs/decisions.md](../../docs/decisions.md).

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
this is an extension and not a script. It is the best available arrangement, not a
cure; the real fix belongs upstream, in the renderer.
