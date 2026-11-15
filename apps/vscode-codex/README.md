# SmartRTL for Codex

Fixes right-to-left text - Urdu, Arabic, Hebrew, Persian - in the Codex panel in VS Code
(OpenAI's `openai.chatgpt` extension).

**Install it and it works. Uninstall it and it is gone.** There is no switch, no status bar
item and no command - the same shape as [SmartRTL for Claude Code](../vscode-claude/README.md),
and a separate extension on purpose ([decisions.md 59](../../docs/decisions.md)).

## What it does

A line that starts with an English word and goes on in Urdu is laid out left to right by the
browser, because its first strong letter is English. The shared rule decides each block by its
own text instead - every paragraph, list item, heading and table cell of an answer, the box you
type into, and the message you sent. Code blocks, and text with no right-to-left letter in it,
are never touched.

## What it changes, and where

Two things, both inside Codex's own folder, `openai.chatgpt-<version>/webview/`:

| | |
|---|---|
| `smartrtl-codex.js` | the shared rule and engine, and the adapter (`src/adapter.js`) |
| one line before `</head>` in `index.html` | `<script async src="./smartrtl-codex.js" data-smartrtl="codex"></script>` |

Codex serves that page with a content security policy that already allows scripts from that
folder, so nothing is loosened to let it in. The line is `async` and the script starts only once
the page has loaded: Codex's host gives its page 30 seconds to report ready and then shows
"Codex could not start", so nothing of ours stands in the way of Codex's own start. Taking it
out deletes the line and the file, and the page is back to the byte.

## Codex's updates

Every Codex update arrives as a new folder without the fix. This extension watches the folder
Codex lives in and puts the fix into an update as soon as VS Code has unpacked it, before it
starts - so the restart VS Code asks for is the only one. An update it did not see is fixed at
the next start, and then it asks for one **Reload Window**.

## Remove

Uninstall it in the Extensions view. VS Code runs `src/uninstall.js` when it next starts, and
that takes the fix out of every copy of Codex.

Disabling is not uninstalling: VS Code tells an extension nothing when it is disabled, so a
disabled SmartRTL's fix stays until Codex's next update replaces its folder.

## Build and check

```
npm test            # builds dist/smartrtl-codex.js, then runs the tests
npm run package     # codex-rtl-<version>.vsix, with vsce
```

| | |
|---|---|
| `src/page.js` | what goes into a Codex folder, and how it comes out - shared by install and uninstall |
| `src/patcher.js` | which Codex: the one VS Code runs, and an update waiting beside it |
| `src/extension.js` | startup, updates, and the one reload notice |
| `src/uninstall.js` | the uninstall hook |
| `src/adapter.js` | the only part that knows Codex's page; built into `dist/` by `build/bundle.js` |
