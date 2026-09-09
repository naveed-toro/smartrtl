/**
 * SmartRTL for Claude Code - extension entry point.
 *
 * TWO JOBS, AND THE SECOND ONE IS THE AWKWARD ONE
 *
 * The first is keeping the fix in place. An update to Claude Code replaces its
 * webview bundle and the fix goes with it, so this watches for that in two
 * independent ways - on activation, and on `extensions.onDidChange`. Both would
 * have to miss for the fix to stay gone. Nothing polls.
 *
 * The second is telling the truth about state. VS Code's own Disable and Uninstall
 * buttons do NOT undo this extension, because it edits a file that belongs to
 * somebody else and the editor has no idea we touched it - `vscode:uninstall` has
 * been broken since 1.69 and nothing fires when you are disabled. A user who
 * presses Disable and sees the fix still working has been misled, and that is on
 * us, not on them.
 *
 * So the state is made visible and controllable in the three places a person
 * actually looks:
 *
 *   - a real on/off pair of commands, only the applicable one ever shown
 *   - the same commands in the Extensions view context menu, right beside
 *     Uninstall and Disable, where the misunderstanding happens
 *   - a small status bar item while Claude Code is open, and only then
 *
 * Off is remembered. Turning it off and reloading leaves it off, or the switch
 * would be a lie too.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const patcher = require("./patcher.js");
const fmt = require("./patch-format.js");

const ON_KEY = "smartrtl.on";          // remembered across restarts
const CONTEXT_KEY = "smartrtl.active"; // drives which command is offered
const SEEN_KEY = "smartrtl.introShown";
const OFF_AT_KEY = "smartrtl.offAtVersion";   // which build was running when it was turned off
const RAN_KEY = "smartrtl.hasRun";     // set once we have activated at least once
const MARKER = ".smartrtl-installed";  // lives in our own folder, so it dies with it

/* How often the winding is CONSIDERED. Cheap on purpose - almost every one of these
   is a comparison of two numbers in memory and nothing more. What it guards is
   fmt.STAMP_EVERY_MS, which is the interval that actually reaches the disk. */
const WIND_CHECK_MS = 30 * 60 * 1000;

let log, status;
let lastSeen = null;                   // { dir, version } of the Claude Code we last patched
let stampedAt = 0;                     // when the block was last written or checked - from memory

const wantedOn = (ctx) => ctx.globalState.get(ON_KEY, true);
const version = (ctx) => (ctx.extension && ctx.extension.packageJSON && ctx.extension.packageJSON.version) || "?";

/**
 * Is this copy newly installed?
 *
 * Nothing in the API answers that, so it is read from the one asymmetry the editor
 * leaves us: global state OUTLIVES an uninstall and the extension's own folder does
 * not. So a marker goes in the folder, and the fact that we have run goes in global
 * state. Afterwards the two can disagree in exactly one way - we have run before, and
 * yet the folder is bare - and that way is a reinstall.
 *
 * Version numbers were the first attempt and ask the wrong question: reinstalling the
 * SAME build is the case this exists for, and no comparison of versions can see it.
 *
 * If the marker cannot be written - a read-only or remote install - this answers false
 * forever rather than true forever. A prompt that never comes is a disappointment; one
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

/**
 * Off is remembered, and that remembering survives an uninstall - VS Code keeps an
 * extension's global state and hands it back when it is installed again. Which means
 * somebody can follow this extension's own advice (turn the fix off before removing
 * it), install it again months later, and get an extension that does nothing at all
 * and says nothing about why. We wrote that trap ourselves.
 *
 * Guessing their intent from the version number would be worse. So it asks - once, at
 * either of the two moments that mean anything: a build that is not the one they turned
 * off, or a fresh install, arriving to find the fix off. Going to the trouble of
 * installing this again is itself most of an answer, and that reinstall is usually of
 * the very same build - where a version comparison sees nothing at all.
 */
function askIfStillOff(ctx, fresh) {
  if (wantedOn(ctx)) return;
  if (!fresh && ctx.globalState.get(OFF_AT_KEY) === version(ctx)) return;   // same build, already answered

  vscode.window.showInformationMessage(
    "SmartRTL is installed but the right-to-left fix is turned off.",
    "Turn it on", "Keep it off"
  ).then((choice) => {
    if (choice === "Turn it on") turnOn(ctx);
    else if (choice === "Keep it off") ctx.globalState.update(OFF_AT_KEY, version(ctx));
  });
}
const autoApply = () => vscode.workspace.getConfiguration("smartrtl").get("autoApply", true);

function offerReload(message) {
  vscode.window.showInformationMessage(message, "Reload Window").then((choice) => {
    if (choice === "Reload Window") vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

/* ------------------------------------------------------------------ *
 * Showing what is true
 * ------------------------------------------------------------------ */

/**
 * Is Claude Code the thing you are looking at right now?
 *
 * The ACTIVE tab, not merely an open one. A Claude Code tab left open in the
 * background is not a reason to put anything in somebody's status bar - the
 * point of hiding it is that it stays out of the way until it is relevant.
 *
 * @returns {boolean|null} null when it cannot be established
 */
function claudeCodeFocused() {
  try {
    const groups = vscode.window.tabGroups;
    if (!groups) return null;
    const tab = groups.activeTabGroup && groups.activeTabGroup.activeTab;
    if (!tab) return false;
    const input = tab.input;
    return !!(input && typeof input === "object" && "viewType" in input &&
              String(input.viewType).toLowerCase().includes("claude"));
  } catch (err) { return null; }
}

function refresh(ctx) {
  const st = patcher.state();

  // The commands act on what is in the file; the status bar reports whether the fix is
  // actually doing anything. Once a block can be present and expired at the same time
  // those are two different questions, so they are answered from two different fields.
  vscode.commands.executeCommand("setContext", CONTEXT_KEY, st.present);

  const mode = vscode.workspace.getConfiguration("smartrtl").get("statusBar", "whenClaudeCodeIsFocused");
  const show = mode === "always" ? true
             : mode === "never" ? false
             : claudeCodeFocused() === true;    // only while you are actually in Claude Code

  if (!show) { status.hide(); return; }

  /* The name says what it is, the mark says how it is - which is what every other
     item in that bar does. The words "on" and "off" earn nothing here: blurred to
     what the corner of an eye actually receives, they are unreadable while the two
     marks are still plainly different, and anybody who stops to read has the
     tooltip. $(whole-word) had to go for a separate reason - that glyph is Find's
     "match whole word" toggle, so it already means something else to everybody who
     uses Ctrl+F.

     The word is not lost, only moved. A screen reader cannot see a tick, so it is
     handed the sentence instead. */
  const on = st.live;
  status.text = on ? "$(check) RTL" : "$(circle-slash) RTL";
  status.accessibilityInformation = {
    label: on ? "Right-to-left fix is on" : "Right-to-left fix is off"
  };
  status.tooltip = whyItSays(ctx, st);
  status.command = on ? "smartrtl.turnOff" : "smartrtl.turnOn";
  status.show();
}

/**
 * "Off" means five different things, and only one of them is a decision somebody made.
 *
 * Claude Code may not be installed at all; it may have been replaced by an update that
 * has not been patched back yet; the write may have failed on a locked or protected
 * file; auto-apply may be turned off on purpose; or the person simply turned it off.
 *
 * None of those earns its own thing in the status bar - that would be four more states
 * almost nobody will ever meet, which is programming for an audience of nobody. A line
 * of tooltip costs nothing until somebody wants it, and is exactly right when they do.
 */
function whyItSays(ctx, st) {
  if (st.live) {
    return "Right-to-left text in Claude Code is being fixed. Click to turn it off." +
           "\n\nDisabling or uninstalling this extension does NOT turn it off - use this.";
  }
  if (st.present) {
    return "The fix is still in Claude Code's bundle, but its stamp has run out, so it is " +
           "doing nothing. Click to renew it.";
  }
  if (!st.installed) {
    return "Claude Code is not installed in this editor, so there is nothing to fix.";
  }
  if (!wantedOn(ctx)) return "The right-to-left fix is off. Click to turn it on.";
  return "Claude Code has been replaced and the fix has not been put back. Click to put it back.";
}

/* ------------------------------------------------------------------ *
 * Doing it
 * ------------------------------------------------------------------ */

function turnOn(ctx) {
  ctx.globalState.update(ON_KEY, true);
  ctx.globalState.update(OFF_AT_KEY, undefined);
  const result = patcher.apply(ctx.extensionPath);
  refresh(ctx);
  if (result.state === "no-target") {
    vscode.window.showWarningMessage(
      `Claude Code (${patcher.TARGET_ID}) is not installed in this editor, so there is nothing to fix.`);
    return;
  }
  if (result.state === "applied") offerReload(`Right-to-left text fixed in Claude Code ${result.install.version}. Reload to see it.`);
  else vscode.window.showInformationMessage("The fix is already on.");
}

function turnOff(ctx) {
  ctx.globalState.update(ON_KEY, false);
  ctx.globalState.update(OFF_AT_KEY, version(ctx));
  const result = patcher.remove();
  refresh(ctx);
  if (result.state === "no-target") {
    vscode.window.showWarningMessage(`Claude Code (${patcher.TARGET_ID}) is not installed in this editor.`);
    return;
  }
  if (result.state === "removed") {
    offerReload("The right-to-left fix is off and Claude Code is back to how it was. Reload to see it.");
  } else {
    vscode.window.showInformationMessage("The fix was already off - Claude Code is untouched.");
  }
}

/**
 * Wind the clock, if it needs winding.
 *
 * The disk is never asked how much time is left: the last stamp is remembered here, so
 * the ordinary answer costs one comparison. Only every fmt.STAMP_EVERY_MS does anything
 * touch Claude Code's folder at all.
 */
function keepAlive(ctx, why) {
  if (Date.now() - stampedAt < fmt.STAMP_EVERY_MS) return;
  syncQuietly(ctx, why);
}

/** Startup, and after a Claude Code update. Silent unless something needs a reload. */
function syncQuietly(ctx, why) {
  if (!wantedOn(ctx)) { log.appendLine(`[${why}] turned off by the user`); refresh(ctx); return; }
  if (!autoApply()) { log.appendLine(`[${why}] auto-apply is turned off`); refresh(ctx); return; }

  let result;
  try { result = patcher.apply(ctx.extensionPath); }
  catch (err) {
    // Whatever the bar is showing now, it is no longer the truth. Say so.
    log.appendLine(`[${why}] failed: ${err && err.message ? err.message : err}`);
    refresh(ctx);
    return;
  }

  if (result.install) lastSeen = { dir: result.install.dir, version: result.install.version };
  if (result.state !== "no-target") stampedAt = Date.now();
  log.appendLine(`[${why}] ${result.state}${result.install ? ` (Claude Code ${result.install.version})` : ""}`);
  refresh(ctx);

  if (result.state === "applied") {
    // The first time only, the reload prompt carries the one thing a person needs to
    // know later and will not think to look for: that Uninstall is not the off switch.
    const first = !ctx.globalState.get(SEEN_KEY, false);
    if (first) ctx.globalState.update(SEEN_KEY, true);

    offerReload(why === "extensions-changed"
      ? `Claude Code updated to ${result.install.version} and replaced its bundle. The right-to-left fix has been put back - reload to see it.`
      : `Right-to-left text fixed in Claude Code ${result.install.version}. Reload to see it.` +
        (first ? " To turn it off later, use the gear menu on this extension - Uninstall does not remove it." : ""));
  }
}

function activate(context) {
  log = vscode.window.createOutputChannel("SmartRTL");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(log, status);

  context.subscriptions.push(
    vscode.commands.registerCommand("smartrtl.turnOn", () => turnOn(context)),
    vscode.commands.registerCommand("smartrtl.turnOff", () => turnOff(context)),
    vscode.commands.registerCommand("smartrtl.status", () => {
      const install = patcher.findClaudeCode();
      if (!install) {
        vscode.window.showWarningMessage(`Claude Code (${patcher.TARGET_ID}) is not installed in this editor.`);
        return;
      }
      vscode.window.showInformationMessage(
        `Claude Code ${install.version} - the right-to-left fix is ${patcher.isPatched() ? "on" : "off"}.` +
        (patcher.isPatched() ? " Disabling or uninstalling this extension will not turn it off; use SmartRTL: Turn the right-to-left fix off." : ""));
    })
  );

  /* ------------------------------------------------------------------
     A link that works like a button.

     `command:` URIs do not run from an extension's README - the editor only
     allows them in webviews that opt in, in trusted MarkdownStrings, and in
     hovers. A `vscode://` link is the one remaining candidate: the editor
     resolves it to whichever extension registered the authority, so a plain
     Markdown link can reach us. Whether the README renderer lets that scheme
     through is the open question, and one click answers it.
  ------------------------------------------------------------------ */
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri) {
        const what = String(uri.path || "").replace(/^\/+/, "").toLowerCase();
        if (what === "off") turnOff(context);
        else if (what === "on") turnOn(context);
        else vscode.commands.executeCommand("smartrtl.status");
      }
    })
  );

  // chance one: Claude Code was updated while the editor was closed
  syncQuietly(context, "startup");

  /* And the case none of the chances below covers: this window simply stays open.
     The block dies 24 hours after its last stamp, and until now activation was the
     only thing that ever re-stamped it - which happens once per window. Two days of
     ordinary work therefore let it expire quietly underneath, and because the expiry
     is read once as the payload loads, the panel already on screen carried on while
     the next one opened got nothing. Something has to come back; this is it. */
  const wind = setInterval(() => keepAlive(context, "keep-alive"), WIND_CHECK_MS);
  context.subscriptions.push({ dispose: () => clearInterval(wind) });

  // and never sit there silently doing nothing because of a switch flipped long ago
  askIfStillOff(context, freshInstall(context));

  // chance two: it happens while the editor is open. onDidChange also fires for any
  // other extension being installed, so only act when the copy of Claude Code we are
  // looking at is genuinely a different one.
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const install = patcher.findClaudeCode();
      if (!install) return;
      if (lastSeen && lastSeen.dir === install.dir && lastSeen.version === install.version) return;
      syncQuietly(context, "extensions-changed");
    }),
    // the status bar item follows whichever tab you are on - and opening a tab is also
    // the moment a webview is about to load, so it gets a chance to wind the clock too:
    // a machine coming back from sleep wakes with its timers already late
    vscode.window.tabGroups.onDidChangeTabs(() => { keepAlive(context, "tab"); refresh(context); }),
    vscode.window.tabGroups.onDidChangeTabGroups(() => refresh(context)),
    vscode.window.onDidChangeActiveTextEditor(() => refresh(context)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("smartrtl")) refresh(context);
    })
  );
}

function deactivate() {}

/* freshInstall and askIfStillOff are exported for the tests. Between them they
   decide whether somebody is spoken to at startup, and how often - which is not a
   thing to settle by reading the code and agreeing with yourself. And whyItSays is
   there for the same reason: five situations share one word in the status bar, so
   the only thing keeping them apart is the sentence each one produces. */
module.exports = { activate, deactivate, freshInstall, askIfStillOff, whyItSays };
