/**
 * SmartRTL for Claude Code - extension entry point.
 *
 * An update to Claude Code replaces its webview bundle, and the fix goes with it.
 * That is the problem this extension exists to solve, so it watches for it in two
 * independent ways:
 *
 *   - on every activation, in case the update happened while the editor was closed
 *   - on vscode.extensions.onDidChange, which fires when the installed set changes,
 *     in case it happened while the editor was open
 *
 * Both would have to miss for the fix to stay gone. Nothing polls, and nothing runs
 * in the background - the editor tells us, we do not go looking.
 */
const vscode = require("vscode");
const patcher = require("./patcher.js");

let log;
let lastSeen = null;   // { dir, version } of the Claude Code we last patched

function autoApplyEnabled() {
  return vscode.workspace.getConfiguration("smartrtl").get("autoApply", true);
}

function offerReload(message) {
  vscode.window.showInformationMessage(message, "Reload Window").then((choice) => {
    if (choice === "Reload Window") vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

function report(result, verb) {
  switch (result.state) {
    case "applied":
      offerReload(`Right-to-left text fixed in Claude Code ${result.install.version}. Reload to see it.`);
      return;
    case "removed":
      offerReload("The right-to-left fix has been removed. Reload to go back.");
      return;
    case "already-current":
      vscode.window.showInformationMessage("The fix is already in place and up to date.");
      return;
    case "already-clean":
      vscode.window.showInformationMessage("The fix is not applied, so there is nothing to remove.");
      return;
    case "no-target":
      vscode.window.showWarningMessage(
        `Could not ${verb}: the Claude Code extension (${patcher.TARGET_ID}) is not installed in this editor.`);
      return;
    case "no-pristine-copy":
      vscode.window.showErrorMessage(
        "Claude Code's bundle has been modified but no clean copy was kept, so it cannot be " +
        "rebuilt safely. Reinstall the Claude Code extension, then try again.");
      return;
  }
}

/**
 * Apply without a word unless something actually changed. Startup should be silent
 * when all is well; the only message worth interrupting for is "this needs a reload".
 */
function syncQuietly(context, why) {
  if (!autoApplyEnabled()) { log.appendLine(`[${why}] auto-apply is turned off`); return; }
  let result;
  try {
    result = patcher.apply(context.extensionPath);
  } catch (err) {
    log.appendLine(`[${why}] failed: ${err && err.message ? err.message : err}`);
    return;
  }
  const install = result.install;
  if (install) lastSeen = { dir: install.dir, version: install.version };
  log.appendLine(`[${why}] ${result.state}${install ? ` (Claude Code ${install.version})` : ""}`);

  if (result.state === "applied") {
    offerReload(why === "extensions-changed"
      ? `Claude Code updated to ${install.version} and replaced its bundle. The right-to-left fix has been put back - reload to see it.`
      : `Right-to-left text fixed in Claude Code ${install.version}. Reload to see it.`);
  }
}

function activate(context) {
  log = vscode.window.createOutputChannel("SmartRTL");
  context.subscriptions.push(log);

  const run = (fn, verb) => () => {
    try { report(fn(), verb); }
    catch (err) { vscode.window.showErrorMessage("SmartRTL: " + (err && err.message ? err.message : String(err))); }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("smartrtl.apply", run(() => patcher.apply(context.extensionPath), "apply the fix")),
    vscode.commands.registerCommand("smartrtl.remove", run(() => patcher.remove(), "remove the fix")),
    vscode.commands.registerCommand("smartrtl.status", () => {
      const install = patcher.findClaudeCode();
      if (!install) {
        vscode.window.showWarningMessage(`Claude Code (${patcher.TARGET_ID}) is not installed in this editor.`);
        return;
      }
      vscode.window.showInformationMessage(
        `Claude Code ${install.version} - right-to-left fix is ${patcher.isPatched() ? "applied" : "not applied"}` +
        (autoApplyEnabled() ? "." : ", and auto-apply is turned off."));
    })
  );

  // chance one: the update happened while the editor was closed
  syncQuietly(context, "startup");

  // chance two: it happens while the editor is open. onDidChange also fires for any
  // other extension being installed, enabled or disabled, so only act when the copy
  // of Claude Code we are looking at is genuinely a different one.
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

module.exports = { activate, deactivate };
