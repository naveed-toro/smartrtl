# Codex / ChatGPT desktop — SmartRTL preview

Runs the original installed Windows app with the shared SmartRTL engine injected in
memory through a private debugging pipe. It creates no app copy, patches no installed
files and opens no TCP debugging port. The original Windows shortcut is unchanged.

## Use

Fully Quit the app, including its tray icon, then run `./launch.ps1`. After a successful
start, use **ChatGPT (SmartRTL)** in Windows Start. A per-user, limited, on-demand Windows task
and a GUI helper keep the app independent of the invoking PowerShell window. There is
no logon trigger or stored password. A cold start from the original shortcut has no RTL
helper; opening either shortcut while an instance already runs may surface that instance.

The launcher resolves the installed app and bundled Node runtime each time. Native app
updates remain available, but a complete update/relaunch cycle with RTL has not yet
been verified. After an update, fully Quit and reopen ChatGPT (SmartRTL).

## Layout

- `src/`: adapter, pipe client, task launcher and GUI host source.
- `build/build-host.ps1`: builds the GUI host into ignored `dist/` using Windows .NET.
- `.runtime/`: ignored local requests, task ownership records and diagnostic reports.
- `../../packages/core` and `../../packages/dom`: shared engine sources, read directly.

No runtime reports, binaries or copies of the shared engine belong in Git. Moving this
folder requires updating the shortcut. A recorded task from the prototype can be
migrated on the next full start only if its owner and exact previous action match.
Keep the old prototype files until its currently running helper has exited.

## Checks and removal

Run `npm test`, `npm run test:windows`, and `npm run build` on Windows. Tests cover pipe
framing/session routing, task ownership checks and the shared frozen formula. Real
message rendering and updates also need an app check; passing unit tests is not proof
of the entire Windows update cycle.

Fully Quit, then run `./uninstall.ps1` to remove this launcher's owned task and shortcut.
Delete this app's generated `.runtime/` and `dist/` folders after the helper exits if
you also want to remove local diagnostics and the compiled host. The installed app
and its profile are untouched.
