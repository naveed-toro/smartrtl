# @smartrtl/vscode-claude

Fixes right-to-left text in the Claude Code panel for VS Code.

## How the fix reaches the screen

VS Code gives an extension no way to reach inside another extension's webview - they
are isolated on purpose. So the fix is a small script appended to the Claude Code
webview bundle, and this package's job is to put it there and keep it there.

```
src/injected/payload.js   what runs inside the webview
build/bundle-payload.js   inlines @smartrtl/core into it -> dist/payload.js
```

`dist/` is generated and not committed. Build it with:

```
npm run build
```

## Why the rule is not in this file

The payload cannot `import` anything - it is concatenated onto someone else's bundle
and runs as a plain script. The obvious shortcut is to paste the regexes in and move
on. That is exactly how three products end up disagreeing about the same question six
months later, so the build step inlines [`@smartrtl/core`](../core) instead.

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

## Limits

This edits a file that belongs to another extension. An update to Claude Code replaces
that file and the fix is gone until it is applied again - which is the whole reason
this is an extension and not a script. It is the best available arrangement, not a
cure; the real fix belongs upstream, in the renderer.
