# SmartRTL for the Claude desktop app

A copy of the Claude desktop app that shows mixed Urdu/English text in the direction the
formula gives it - the same rule and engine as the VS Code extension. The installed Claude is
never touched and keeps updating.

This exists because every way that would not touch Claude was tried first and failed in use;
the whole story, and what the copy costs, is [docs/decisions.md](../../docs/decisions.md),
section 54. It is made for one person's own reading on his own machine. The proof handed to
Anthropic is still the page set right in the browser.

## Use

```
npm install
npm run patch
```

Then open **Claude (SmartRTL)** from the Start menu. Open one of the two - Claude or Claude
(SmartRTL) - at a time; quit the other from its tray icon first.

When Claude updates, the shortcut makes a fresh copy of the new version before opening it
(about a minute, once per update). This folder has to stay where it is for that to work.

## Remove

```
npm run uninstall-copy
```

Removes the copy, its shortcut, the copy's own login (`%APPDATA%\Claude`) and, if it points at
the copy, the `claude://` registration. The installed Claude was never changed.

## Files

| | |
|---|---|
| `src/patch.js` | makes the copy, loads the hook first, turns off the asar integrity check |
| `src/hook.js` | runs inside the copy: hands claude.ai pages the payload, refuses `claude://` |
| `src/injected/payload.js` | the claude.ai adapter - where the answers, the box and sent messages are |
| `build/bundle-payload.js` | builds `dist/payload.js` from the rule, the engine and the adapter |
| `src/launch.ps1` | what the shortcut runs: re-copies when Claude has updated, then opens it |
| `src/uninstall.js` | takes all of it away |

Every page the payload reaches writes a report to `%LOCALAPPDATA%\SmartRTL\status-<page>.json`
every 20 seconds: how many blocks it tagged, and where the page puts its own `dir`.
