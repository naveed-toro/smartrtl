# SmartRTL for Qoder IDE

Shows mixed Urdu/English text in Qoder IDE's AI chat in the direction the formula gives it -
the same rule and engine as the VS Code extension and the desktop apps. Qoder has no direction
handling of its own in the chat: without this, every line is left-to-right, even one that
starts in Urdu.

Qoder draws its chat with React in the workbench page itself, not in a webview, so no extension
can reach it. Instead its two chat pages each load one more script. It is made for one person's
own reading on his own machine.

## Use

```
npm run patch
```

Then quit Qoder completely (every window) and open it again. A plain "Reload Window" is not
enough the first time: Qoder reads its checksums only when it starts, and would call the
changed page a corrupt installation until then.

The chat in the side panel, in the agents window, and a chat moved out with
**Move into New Window** are all covered.

`window.__smartRtlQoder.status()` in Help → Toggle Developer Tools shows what was tagged;
`window.__smartRtlQoder.stop()` takes it off until the next start.

## Qoder's updates

A Qoder update puts a whole fresh copy of Qoder in place (Inno Setup, as VS Code), and the
script line goes with the old copy. So `npm run patch` also installs a small extension,
**SmartRTL for Qoder** (`smartrtl.smartrtl-qoder`), into `~/.qoder/extensions` - a folder an
update does not touch.

Each time Qoder opens, about 20 seconds in, the extension looks once whether the line is there:

- there: nothing happens, nothing is said;
- gone (Qoder has updated): it is put back the same way as `npm run patch`, and a message with
  a **Restart Qoder** button appears - once after each update. The button closes Qoder and opens
  it again with the windows it had; the fix shows from then on.

Qoder has no restart command an extension can call. So the button starts `extension/restart.js`
on its own, outside Qoder, and asks Qoder to quit; the helper waits for Qoder's main process to
end, starts Qoder, and is gone. When Qoder does not close (a save dialog was cancelled), it gives
up after two minutes and starts nothing.

Nothing keeps running after that look: no background process, no scheduled task. The wait is
there because Qoder compares its files with its checksums once just after it opens; changed
before that, the page would be called corrupt for that session.

What the extension cannot do: when Qoder changes its chat itself (other class names), the
script finds nothing to tag, and `src/adapter.js` needs new work.

## Remove

```
npm run uninstall
```

Uninstalls the extension, takes the line out of both pages, puts their checksums back, deletes
the script and the kept copies in `%LOCALAPPDATA%\SmartRTL\qoder`. Quit and open Qoder again.
Uninstalling the extension in Qoder's Extensions view takes the fix away too.

## What is changed in Qoder

All under `%LOCALAPPDATA%\Programs\Qoder IDE\resources\app` - the user's own folder, no admin
rights:

| | |
|---|---|
| `out/vs/code/electron-browser/workbench/workbench.html` | one `<script>` line before `<body>` |
| `out/lingma/agents-window/electron-browser/agents-window.html` | the same line |
| `out/vs/code/electron-browser/workbench/smartrtl-qoder.js` | the script, added |
| `product.json` | the two pages' checksums, rewritten to match them |

and the extension in `~/.qoder/extensions/smartrtl.smartrtl-qoder-<version>`.

Before the first change, the untouched files are kept in `%LOCALAPPDATA%\SmartRTL\qoder\<version>`.
A page that is not the one Qoder shipped (its checksum differs) is refused, and nothing is changed.

## Files

| | |
|---|---|
| `src/adapter.js` | the Qoder adapter - where the answers, the box and sent messages are, and chat windows |
| `build/bundle.js` | builds `dist/smartrtl-qoder.js` from the rule, the engine and the adapter |
| `build/vsix.js` | packs the extension as `dist/smartrtl-qoder-<version>.vsix`, with Node alone |
| `src/qoder.js` | the pages, the script line, Qoder's checksum formula; `apply()` and `remove()` |
| `src/cli.js` | Qoder's own command line, to install and uninstall the extension |
| `src/patch.js` | puts the script in place, adds the line, rewrites the checksums, installs the extension |
| `src/uninstall.js` | takes all of it away |
| `extension/` | the extension: one look at start, the restart helper, and its own uninstall hook |

`npm test` builds, runs patch and uninstall against a stand-in Qoder folder, runs the extension
against a stand-in Qoder that has just updated, checks the .vsix, runs the script in Edge on a
page shaped like Qoder's chat, and runs the rule's own tests.
