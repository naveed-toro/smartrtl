# The nine builds, and what each one actually contained

Compiled by opening every `.vsix` and reading what is inside it, not from memory.

**A tick means "this statement is true"** - including the statements about what a build got
wrong. Everything is ticked to my best evidence; untick anything that does not hold when
you try it yourself.

Where the evidence came from is marked, so you know which ticks to distrust first:

- **(live)** — seen on your machine, in Claude Code
- **(lab)** — the build's own code run against a throwaway Claude Code
- **(code)** — read out of the packaged `.vsix`
- **(unseen)** — believed from the code, never watched running

---

## What was in each build

| | 0.0.1 | 0.0.2 | 0.0.3 | 0.0.4 | 0.0.5 | 0.0.6 | 0.0.7 | 0.0.8 | 0.0.9 |
|---|---|---|---|---|---|---|---|---|---|
| answers read right-to-left | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| your own messages read right-to-left | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| collapse row forced sticky | ~ | – | – | – | – | – | – | – | – |
| expanded message capped at 60vh | – | ~ | – | – | – | – | – | – | – |
| expanded message unpinned | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| view stays put when opening/closing | – | – | – | – | – | ✓ | ✓ | ✓ | ✓ |
| `deactivate()` removes the patch | – | – | ~ | – | – | – | – | – | – |
| keeps a 5MB backup copy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – |
| removal by truncation, nothing kept | – | – | – | – | – | – | ✓ | ✓ | ✓ |
| `vscode:uninstall` hook | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| block expires on its own | – | – | – | – | – | – | – | ✓ | ✓ |
| **loads at all** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |

`~` = it was in the build, and later shown to be the wrong idea.

---

## Version by version

### 0.0.1 — first installable build
Answers only. It also forced the collapse row to `position: sticky` to keep "Show less" on
screen.

- [x] an answer that begins with an English word reads right-to-left **(live)**
- [x] code blocks and pure-English lines are left alone **(live)**
- [x] **failed:** your own messages are not touched at all **(live, and confirmed in the code)**
- [x] **failed:** the "Show less" button moves from where the extension puts it **(live)**

### 0.0.2 — your own messages, and a height cap
Found by reading Claude Code's bundle: a user message is not markdown, it renders as a bare
`<span dir="auto">`. The sticky row was removed; the expanded message was capped at 60vh
with its own scrollbar instead.

- [x] the button is no longer moved **(live)**
- [x] **failed:** the user-message text still hugged the left in the live test. The same code
      works in later builds and the cause was never isolated - most likely the webview had
      not reloaded onto the new payload **(live)**
- [x] **failed as an idea:** capping the height. How much of a window a message may take is
      not ours to decide, and the answer differs on a laptop and an external display **(live)**

### 0.0.3 — unpinning, and the build that broke itself
The cap was dropped. The real cause was found: a message that heads a turn is
`position: sticky`, so expanded it covers the panel and its own button can never be reached.
It also tried to clean up on `deactivate()`.

- [x] an expanded message stops being pinned **(code)**
- [x] **failed badly:** `deactivate()` also fires on every reload. Install → apply → "Reload"
      → deactivate wipes the patch → reload → apply → "Reload"… for ever, and the fix never
      appears **(live)**
- [x] **do not install this build**

### 0.0.4 — the same, with that mistake reverted
Identical to 0.0.3 minus the `deactivate()` cleanup.

- [x] the reload prompt appears once and then stops **(unseen)**
- [x] an expanded message scrolls instead of covering the panel **(unseen)**
- [x] **still missing:** opened from halfway down, the message jumps far up the conversation
      **(code — this is what 0.0.6 fixed)**

### 0.0.5 — the uninstall hook
Adds the `vscode:uninstall` npm hook, the only hook VS Code offers that means "we are
leaving".

- [x] the hook is present and correctly declared **(code — checked inside the packaged manifest)**
- [x] **failed:** uninstalled, nothing was cleaned. The hook has been broken in VS Code since
      1.69 — [microsoft/vscode#155561](https://github.com/microsoft/vscode/issues/155561),
      still open **(live)**

### 0.0.6 — the view follows the message
Unpinning alone was half a fix: a collapsed message is pinned so you can see it from
anywhere, and opening it dropped it back to where it really lives. Now its top returns to
the exact pixel it was on.

- [x] opening from the top works **(live, via F5)**
- [x] opening from halfway down works **(live, via F5)**
- [x] opening from the bottom works **(live, via F5)**
- [x] closing leaves the view where it was **(live, via F5)**
- [x] a collapsed message is still pinned, as it should be **(unseen)**

### 0.0.7 — nothing kept behind
The 5MB backup copy is gone. The original is everything before the marker, so removal is a
truncation.

- [x] open and close work from any scroll position **(live)**
- [x] the text inside the box reads by the rule **(live — "close to what we wanted")**
- [x] apply then remove returns Claude Code byte for byte **(live, verified by SHA)**
- [x] a patch written by an older build is still restored from the copy that build kept **(lab)**
- [x] **still failed:** uninstalling still leaves the block, because the hook still does not
      fire **(live)**

### 0.0.8 — broken. Do not install.
Meant to add the self-expiring block. A `require` line was missing from `patcher.js`, so the
module throws the moment it is loaded and the extension cannot activate at all.

- [x] **the extension does not load** — `ReferenceError: stripPatch is not defined` **(lab)**
- [x] no test caught it, because `patcher.js` was the one file with no test - it imports
      `vscode` and so could not be loaded outside the editor **(code)**
- [x] **use 0.0.9 instead**

### 0.0.9 — 0.0.8, fixed, and the gap that let it through closed
Same features. A stub `vscode` module now lets `patcher.js` be tested outside the editor,
and six tests cover it - the first of which is simply that it loads.

- [x] it loads **(lab)**
- [x] apply then remove returns the original byte for byte **(lab)**
- [x] applying twice leaves one block and does not rewrite for nothing **(lab)**
- [x] a stale block is re-stamped without asking anyone to reload **(lab)**
- [x] an older build's patch and its 5MB copy are both taken over cleanly **(lab)**
- [x] with no Claude Code installed it reports that instead of throwing **(lab)**
- [ ] everything 0.0.7 did, still working **(unseen — this is the one to try)**
- [ ] after uninstalling, the effect is gone by the next day on its own **(unseen)**
- [x] **known:** that expiry is bounded, not instant. Instant still needs the Remove command

---

## What happens if you forget the Remove command between builds

Measured, not assumed - both builds' own code, run against a throwaway Claude Code.

**Newer over older — safe.**

```
apply 0.0.5 -> applied          one block
apply 0.0.9 -> applied          one block, and it is 0.0.9's
Remove      -> removed          identical to the original, byte for byte
```

A new build strips whatever block is there before writing its own, and takes over the 5MB
copy an older build kept. **They never stack and they never fight - only the newer one
runs.**

**Older over newer — silently does nothing.**

```
apply 0.0.9 -> applied
apply 0.0.5 -> no-pristine-copy   ← 0.0.5 refused, and 0.0.9's block is still there
```

Builds up to 0.0.6 restore from a copy they keep; 0.0.9 deletes that copy, so an older build
finds a patched file with nothing to rebuild from and correctly refuses to touch it. You
would think you were testing 0.0.5 while 0.0.9 was still running.

> **Rule: test upwards (0.0.1 → 0.0.9). To go back down, run the Remove command first.**

**The same build twice** — `already-current`, one block, the file is not rewritten at all.

---

## Testing them yourself, one at a time

All commands from PowerShell. `--force` lets one build replace another without uninstalling
first, which is what you want while comparing.

```powershell
cd "$env:USERPROFILE\Desktop\smartrtl\apps\vscode-claude"
```

**1. Install a build**

```powershell
code --install-extension .\claude-code-rtl-0.0.9.vsix --force
```

Then reload the window once (`Ctrl+Shift+P` → *Developer: Reload Window*). The patch is
written when the extension activates, and a webview only reads it as it loads.

**2. Check what is installed**

```powershell
code --list-extensions --show-versions | Select-String smartrtl
```

**3. Check whether Claude Code is currently patched**

```powershell
Select-String -Path "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js" `
  -Pattern "smart-rtl-direction patch BEGIN" -SimpleMatch -List
```

Output = patched. No output = clean.

**4. Before moving to another build: take the effect off**

`Ctrl+Shift+P` → **SmartRTL: Remove the right-to-left fix**

Required when going *down* a version. Going up, the newer build handles it - but running it
anyway costs nothing and removes all doubt about what you are looking at.

**5. Uninstall**

```powershell
code --uninstall-extension smartrtl.claude-code-rtl
```

**6. Confirm nothing is left**

```powershell
Select-String -Path "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js" `
  -Pattern "smart-rtl-direction patch BEGIN" -SimpleMatch -List
Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\*.pristine-backup" -ErrorAction SilentlyContinue
```

Both silent = Claude Code is exactly as it was.

**7. If you forgot step 4 and the extension is already gone**

```powershell
Get-Item "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.js" | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName)
  $i = $t.IndexOf("/* ==== smart-rtl-direction patch BEGIN ==== */")
  if ($i -ge 0) { [IO.File]::WriteAllText($_.FullName, $t.Substring(0, $i).TrimEnd("`n")) }
  Remove-Item "$($_.FullName).pristine-backup" -ErrorAction SilentlyContinue
}
```

Then reload the window.

---

## One warning about F5

Running the extension with **F5** (the Extension Development Host) also writes the patch,
and closing that window does not take it off - there is no uninstall involved. While you are
testing cleanup, do not press F5 in between, or the leftover block will look like a failure
of the build you were actually testing. That has already happened once.
