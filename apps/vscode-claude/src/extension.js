/**
 * SmartRTL for Claude Code - extension entry point.
 *
 * INSTALLED, IT WORKS. UNINSTALLED, IT IS GONE. NOTHING ELSE.
 *
 * Installing puts the formula's block into Claude Code's panel. Uninstalling takes it out:
 * VS Code runs src/uninstall.js when it next starts (docs/decisions.md 57). There is no
 * switch, no status bar item and no expiry - all three were built because an uninstall
 * used to leave the block behind, and it no longer does (decisions.md 58).
 *
 * What this file still does is keep the block in place through Claude Code's own updates,
 * each of which brings a new bundle without it, and ask for a reload only when a panel on
 * screen is running without the current block.
 *
 * Disabling is not uninstalling, and VS Code fires nothing for it, so a disabled SmartRTL's
 * block stays until Claude Code's next update replaces the file. The README says so.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const patcher = require("./patcher.js");

const RAN_KEY = "smartrtl.hasRun";     // set once we have activated at least once
const MARKER = ".smartrtl-installed";  // lives in our own folder, so it dies with it

/* Something has Claude Code's bundle open, so nothing was written to it.
   It is said rather than swallowed because the alternative was the worst thing in here:
   writing five megabytes underneath a panel that is reading it, which does not cost
   somebody the fix - it costs them Claude Code. Measured before it was believed: with a
   reader on the file, thirty-six renames out of thirty-six were refused and the file was
   caught half written. patch-format.js.
   And it ends with what to do, because "busy" on its own leaves a person with nothing. */
const BUSY = "Claude Code's panel is busy, so nothing was changed. Closing it and trying again usually does it.";
const TRY_AGAIN = "Try again";

/* How long before the fix is attempted again on its own after finding the bundle busy. A
   minute is far above how long anything holds a file it is reading. */
const BUSY_WAIT_MS = 60 * 1000;

let log;
let lastSeen = null;                   // { dir, version } of the Claude Code we last patched

const version = (ctx) => (ctx.extension && ctx.extension.packageJSON && ctx.extension.packageJSON.version) || "?";

/**
 * Is this copy newly installed?
 *
 * Nothing in the API answers that, so it is read from the one asymmetry the editor
 * leaves us: global state OUTLIVES an uninstall and the extension's own folder does
 * not. So a marker goes in the folder, and the fact that we have run goes in global
 * state. Afterwards the two can disagree in exactly one way - we have run before, and
 * yet the folder is bare - and that way is a reinstall, or an upgrade, which lands in a
 * new folder.
 *
 * If the marker cannot be written - a read-only or remote install - this answers false
 * forever rather than true forever. A greeting that never comes is a disappointment; one
 * that returns at every startup is a fault.
 *
 * @returns {boolean} true only when this copy was installed after a previous one left
 */
function freshInstall(ctx) {
  const ranBefore = ctx.globalState.get(RAN_KEY, false);
  const mark = path.join(ctx.extensionPath, MARKER);

  let marked = false, wrote = false;
  try { marked = fs.existsSync(mark); } catch (err) {}
  if (!marked) { try { fs.writeFileSync(mark, ""); wrote = true; } catch (err) {} }

  ctx.globalState.update(RAN_KEY, true);
  return ranBefore && !marked && wrote;
}

/* Which build of THIS extension is speaking, in front of every notice. A toast does not
   say which extension it came from, and somebody trying one .vsix after another was told
   "2.1.270 is fixed" by each of them alike, with no way to tell which had just gone in.
   Set once, in activate(). */
let ours = "?";
const signed = (message) => `SmartRTL ${ours}: ${message}`;

function offerReload(message) {
  vscode.window.showInformationMessage(signed(message), "Reload Window").then((choice) => {
    if (choice === "Reload Window") vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

function offerRetry(again) {
  vscode.window.showWarningMessage(BUSY, TRY_AGAIN).then((choice) => {
    if (choice === TRY_AGAIN) again();
  });
}

/**
 * An update of Claude Code that VS Code has unpacked and not started yet, fixed before it
 * starts.
 *
 * Until 0.9.2 the fix went into an update only once it was running: VS Code asked for
 * "Restart Extensions", the new panel came up reading a bundle with nothing in it, and this
 * extension asked for a second reload on top of the one VS Code had just asked for - with
 * every update, and Claude Code updates most days. Fixed while it waits, the restart VS Code
 * asks for is the only one there is. Nothing is said: nothing on screen has changed.
 */
function prepareWaiting(ctx, why) {
  try {
    const waiting = patcher.findWaitingClaudeCode();
    if (!waiting) return null;
    const result = patcher.apply(ctx.extensionPath, waiting);
    log.appendLine(`[${why}] ${result.state} (Claude Code ${waiting.version}, waiting for VS Code to start it)`);
    return result.state;
  } catch (err) {
    log.appendLine(`[${why}] waiting update: ${err && err.message ? err.message : err}`);
    return null;
  }
}

/* How long the extensions folder has to be quiet before an update in it is looked at. VS
   Code unpacks into a hidden folder and renames it into place, so the name appearing is the
   end of the work - this is so that a burst of events is answered once, and so that a virus
   scanner reading every file just unpacked has had a moment with them first. */
const SETTLE_MS = 2000;
const SETTLE_TRIES = 5;                // a bundle still held after that is left to the next start
let watching = null;                   // the folder being watched for updates

/**
 * Watches the folder Claude Code lives in, so an update is fixed the moment it is unpacked.
 *
 * extensions.onDidChange cannot do this: VS Code does not tell a window about an update it
 * has not applied, and it does not apply an update to an extension that is running. The
 * folder is the only place the update can be seen while it waits.
 */
function watchForUpdates(ctx, dir) {
  if (watching === dir) return;
  let timer = null, watcher;
  const settle = (tries) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (prepareWaiting(ctx, "update-unpacked") === "busy" && tries < SETTLE_TRIES) settle(tries + 1);
    }, SETTLE_MS);
    if (timer.unref) timer.unref();
  };
  try {
    watcher = fs.watch(dir, (event, name) => {
      if (name && !String(name).toLowerCase().startsWith(patcher.TARGET_ID + "-")) return;
      settle(1);
    });
  } catch (err) {
    log.appendLine(`[watch] ${dir}: ${err && err.message ? err.message : err}`);
    return;
  }
  watcher.on("error", () => {});
  if (watcher.unref) watcher.unref();
  watching = dir;
  ctx.subscriptions.push({ dispose() { clearTimeout(timer); watcher.close(); if (watching === dir) watching = null; } });
}

/** Startup, and Claude Code arriving. Silent unless a panel needs a reload. */
function syncQuietly(ctx, why) {
  prepareWaiting(ctx, why);

  let result;
  try { result = patcher.apply(ctx.extensionPath); }
  catch (err) {
    log.appendLine(`[${why}] failed: ${err && err.message ? err.message : err}`);
    return;
  }
  if (result.install) watchForUpdates(ctx, path.dirname(result.install.dir));

  /* Busy means nothing was written. Remembering the build would make onDidChange take this
     Claude Code for one already dealt with, so nothing is remembered - and it is tried again
     in a minute, on its own. */
  if (result.state === "busy") {
    log.appendLine("[" + why + "] the bundle is held open by something else; nothing was written");
    const again = setTimeout(() => syncQuietly(ctx, why), BUSY_WAIT_MS);
    if (again.unref) again.unref();
    ctx.subscriptions.push({ dispose: () => clearTimeout(again) });
    // said where somebody is waiting for an answer: they have just installed this
    if (why === "installed") offerRetry(() => syncQuietly(ctx, why));
    return;
  }
  if (result.install) lastSeen = { dir: result.install.dir, version: result.install.version };
  /* The road is in the line because there are three of them, and the first one is the only
     one that means nothing has changed. Finding the panel's file any other way is the
     morning somebody will want to know about, and by then the log is all there is. */
  const how = result.install && result.install.road && result.install.road !== "webview/index.js"
    ? `, found by ${result.install.road}` : "";
  const nothing = result.state === "no-target"
    ? (patcher.claudeCodeInstalled() ? " (Claude Code has changed where its panel loads from)" : " (Claude Code is not installed)")
    : "";
  log.appendLine(`[${why}] ${result.state}${result.install ? ` (Claude Code ${result.install.version}${how})` : nothing}`);

  if (result.state === "no-target") return;

  // The version is Claude Code's, not ours, and it is here because it names the thing
  // that was worked on.
  const v = result.install ? result.install.version : "";
  /* A reload is asked for when the block in the file changed: a panel already on screen read
     the file when it opened, so it is running without this block - none at all on a first
     install, an older build's after an upgrade - and will until it reloads. A panel opened
     afterwards reads the block by itself.

     Never when Claude Code has only just arrived in this window. VS Code puts an extension
     into an open window only if it was not running there - a first install, or one switched
     back on - so no panel of it has read anything yet. An update does not arrive this way;
     it arrives as prepareWaiting() describes. */
  if (why === "extensions-changed") return;
  if (result.state === "applied") {
    offerReload(`Right-to-left text in Claude Code ${v} is fixed. Reload to see it.`);
  } else if (why === "installed") {
    // It was already working, so there is nothing to reload for - but somebody who has
    // just installed something is owed an answer either way. Silence after a deliberate
    // act reads as "did that do anything?", and this extension is silent the rest of the
    // time, so there is nothing else for them to go on.
    vscode.window.showInformationMessage(signed(`Right-to-left text in Claude Code ${v} is fixed.`));
  }
}

function activate(context) {
  ours = version(context);
  log = vscode.window.createOutputChannel("SmartRTL");
  context.subscriptions.push(log);

  // An update watchForUpdates() did not see - no window was open when it was unpacked - is
  // caught here. Asked once, because asking writes the marker that answers it.
  const installed = freshInstall(context);
  syncQuietly(context, installed ? "installed" : "startup");

  // Claude Code arriving in the window - installed, or switched back on. onDidChange also
  // fires for any other extension, so only act when the copy of Claude Code we are looking
  // at is genuinely a different one.
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const install = patcher.findClaudeCode();
      if (!install) return;
      if (lastSeen && lastSeen.dir === install.dir && lastSeen.version === install.version) return;
      syncQuietly(context, "extensions-changed");
    })
  );
}

function deactivate() {}

/* freshInstall is exported for the tests: it decides whether somebody is spoken to at
   startup, which is not a thing to settle by reading the code and agreeing with yourself. */
module.exports = { activate, deactivate, freshInstall };
