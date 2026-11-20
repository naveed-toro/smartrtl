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

The copy has a taskbar button of its own, with Claude's icon marked in its lower right corner,
and "Claude (SmartRTL)" as its window title (Alt+Tab, the taskbar preview) and tray tooltip. A
plain Claude icon means the installed Claude. To pin the copy, pin its own taskbar button while
it is open: the pin opens it through `launch.ps1`, like the shortcut. A pin is yours - unpin it
before removing the copy.

When Claude updates, the shortcut makes a fresh copy of the new version before opening it
(about a minute, once per update). This folder has to stay where it is for that to work.

## Package-context updater preview (2026-11-15)

The launcher now starts the RTL executable with the installed Claude package's Windows
identity using `Invoke-CommandInDesktopPackage`. This tests whether Claude's own updater
can run inside the RTL copy, instead of requiring the original app to be opened separately.
The original signed package and updater code are not modified. Quit either Claude fully
before starting the other. Existing profiles and the previous RTL executable are retained.

The hook records `windowsStore` and native updater events in `claude-native-updates.json`
beside its status reports. `launch.ps1 -StatusDirectory <folder>` puts diagnostic reports
in an explicit folder. Source tests run with `npm run test:native-updates`.

This remains a preview until a live package-identity launch, updater check and actual update
restart have been observed. Windows may relaunch the original executable after an update;
automatic return to the RTL copy has not been established. The launcher still rebuilds
from the installed version on its next invocation. Microsoft's package-context command is
a debugging facility, not a promise of production-equivalent activation behavior.

## Remove

```
npm run uninstall-copy
```

Removes the copy, its shortcut, the copy's own login (`%APPDATA%\Claude`) and, if it points at
the copy, the `claude://` registration. The installed Claude was never changed.

## Files

| | |
|---|---|
| `src/patch.js` | makes the copy, loads the hook first, turns off the asar integrity check, marks its icon (`packages/mark`) |
| `src/hook.js` | runs inside the copy: hands claude.ai pages the payload, refuses `claude://`, marks the copy |
| `src/injected/payload.js` | the claude.ai adapter - where the answers, the box and sent messages are |
| `build/bundle-payload.js` | builds `dist/payload.js` from the rule, the engine and the adapter |
| `src/launch.ps1` | what the shortcut runs: re-copies when Claude has updated, then opens it |
| `src/uninstall.js` | takes all of it away |

Every page the payload reaches writes a report to `%LOCALAPPDATA%\SmartRTL\status-<page>.json`
every 20 seconds: how many blocks it tagged, and where the page puts its own `dir`.
