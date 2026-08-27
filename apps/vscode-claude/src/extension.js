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
const patcher = require("./patcher.js");

const ON_KEY = "smartrtl.on";          // remembered across restarts
const CONTEXT_KEY = "smartrtl.active"; // drives which command is offered
const SEEN_KEY = "smartrtl.introShown";

let log, status;
let lastSeen = null;                   // { dir, version } of the Claude Code we last patched

const wantedOn = (ctx) => ctx.globalState.get(ON_KEY, true);
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
  const on = patcher.isPatched();
  vscode.commands.executeCommand("setContext", CONTEXT_KEY, on);

  const mode = vscode.workspace.getConfiguration("smartrtl").get("statusBar", "whenClaudeCodeIsFocused");
  const show = mode === "always" ? true
             : mode === "never" ? false
             : claudeCodeFocused() === true;    // only while you are actually in Claude Code

  if (!show) { status.hide(); return; }
  status.text = on ? "$(whole-word) RTL on" : "$(whole-word) RTL off";
  status.tooltip = on
    ? "Right-to-left text in Claude Code is being fixed. Click to turn it off.\n\nDisabling or uninstalling this extension does NOT turn it off - use this."
    : "The right-to-left fix is off. Click to turn it on.";
  status.command = on ? "smartrtl.turnOff" : "smartrtl.turnOn";
  status.show();
}

/* ------------------------------------------------------------------ *
 * Doing it
 * ------------------------------------------------------------------ */

function turnOn(ctx) {
  ctx.globalState.update(ON_KEY, true);
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

/** Startup, and after a Claude Code update. Silent unless something needs a reload. */
function syncQuietly(ctx, why) {
  if (!wantedOn(ctx)) { log.appendLine(`[${why}] turned off by the user`); refresh(ctx); return; }
  if (!autoApply()) { log.appendLine(`[${why}] auto-apply is turned off`); refresh(ctx); return; }

  let result;
  try { result = patcher.apply(ctx.extensionPath); }
  catch (err) { log.appendLine(`[${why}] failed: ${err && err.message ? err.message : err}`); return; }

  if (result.install) lastSeen = { dir: result.install.dir, version: result.install.version };
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
    // the status bar item follows whichever tab you are on
    vscode.window.tabGroups.onDidChangeTabs(() => refresh(context)),
    vscode.window.tabGroups.onDidChangeTabGroups(() => refresh(context)),
    vscode.window.onDidChangeActiveTextEditor(() => refresh(context)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("smartrtl")) refresh(context);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
