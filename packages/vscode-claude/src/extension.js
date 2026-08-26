/**
 * SmartRTL for Claude Code - extension entry point.
 *
 * This version does the work when you ask it to. Applying it by itself after an
 * update comes next; the two are kept apart so that if the automatic part ever
 * misbehaves, the manual commands still stand on their own.
 */
const vscode = require("vscode");
const patcher = require("./patcher.js");

function offerReload(message) {
  vscode.window.showInformationMessage(message, "Reload Window").then((choice) => {
    if (choice === "Reload Window") {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
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

function activate(context) {
  const run = (fn, verb) => () => {
    try {
      report(fn(), verb);
    } catch (err) {
      vscode.window.showErrorMessage("SmartRTL: " + (err && err.message ? err.message : String(err)));
    }
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
        `Claude Code ${install.version} - right-to-left fix is ${patcher.isPatched() ? "applied" : "not applied"}.`);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
