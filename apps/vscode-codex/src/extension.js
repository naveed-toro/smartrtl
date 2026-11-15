/**
 * SmartRTL for Codex - extension entry point.
 *
 * INSTALLED, IT WORKS. UNINSTALLED, IT IS GONE. NOTHING ELSE.
 *
 * The same shape as SmartRTL for Claude Code (docs/decisions.md 58), and a separate extension on
 * purpose (decisions.md 59): installing puts the fix into Codex's panel, uninstalling takes it
 * out - VS Code runs src/uninstall.js when it next starts. No switch, no status bar item, no
 * commands.
 *
 * What this file does is keep the fix in place through Codex's own updates, each of which
 * brings a new folder without it, and ask for a reload only when the panel may be running
 * without the current fix.
 *
 * Disabling is not uninstalling, and VS Code fires nothing for it, so a disabled SmartRTL's fix
 * stays until Codex's next update replaces its folder. The README says so.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const patcher = require("./patcher.js");
const page = require("./page.js");

const RAN_KEY = "smartrtl.hasRun";     // set once we have activated at least once
const MARKER = ".smartrtl-installed";  // lives in our own folder, so it dies with it

let log;
let lastSeen = null;                   // { dir, version } of the Codex we last fixed

const version = (ctx) => (ctx.extension && ctx.extension.packageJSON && ctx.extension.packageJSON.version) || "?";

/**
 * Is this copy newly installed? Global state outlives an uninstall and our own folder does not,
 * so a marker goes in the folder and the fact that we have run goes in global state; "run
 * before, folder bare" is a reinstall or an upgrade. Can't write the marker: false, forever.
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

// Which build of THIS extension is speaking, in front of every notice. Set once, in activate().
let ours = "?";
const signed = (message) => `SmartRTL ${ours}: ${message}`;

function offerReload(message) {
  vscode.window.showInformationMessage(signed(message), "Reload Window").then((choice) => {
    if (choice === "Reload Window") vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

/** An update of Codex that VS Code has unpacked and not started yet, fixed before it starts. */
function prepareWaiting(ctx, why) {
  try {
    const waiting = patcher.findWaitingCodex();
    if (!waiting) return null;
    const result = patcher.apply(ctx.extensionPath, waiting);
    log.appendLine(`[${why}] ${result.state} (Codex ${waiting.version}, waiting for VS Code to start it)`);
    return result.state;
  } catch (err) {
    log.appendLine(`[${why}] waiting update: ${err && err.message ? err.message : err}`);
    return null;
  }
}

/* How long the extensions folder has to be quiet before an update in it is looked at: VS Code
   unpacks into a hidden folder and renames it into place, and a burst of events is answered once. */
const SETTLE_MS = 2000;
let watching = null;                   // the folder being watched for updates

/**
 * Watches the folder Codex lives in, so an update is fixed the moment it is unpacked.
 * extensions.onDidChange cannot do this: VS Code does not tell a window about an update it has
 * not applied, and it does not apply one to an extension that is running.
 */
function watchForUpdates(ctx, dir) {
  if (watching === dir) return;
  let timer = null, watcher;
  try {
    watcher = fs.watch(dir, (event, name) => {
      if (name && !String(name).toLowerCase().startsWith(page.PREFIX)) return;
      clearTimeout(timer);
      timer = setTimeout(() => prepareWaiting(ctx, "update-unpacked"), SETTLE_MS);
      if (timer.unref) timer.unref();
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

/** Startup, and Codex arriving. Silent unless the panel needs a reload. */
function syncQuietly(ctx, why) {
  prepareWaiting(ctx, why);

  let result;
  try { result = patcher.apply(ctx.extensionPath); }
  catch (err) {
    log.appendLine(`[${why}] failed: ${err && err.message ? err.message : err}`);
    return;
  }
  if (result.install) {
    watchForUpdates(ctx, path.dirname(result.install.dir));
    lastSeen = { dir: result.install.dir, version: result.install.version };
  }
  const nothing = result.state === "no-target"
    ? (patcher.codexInstalled() ? " (Codex has changed where its panel loads from)" : " (Codex is not installed)")
    : "";
  log.appendLine(`[${why}] ${result.state}${result.install ? ` (Codex ${result.install.version})` : nothing}`);

  if (result.state === "no-target") return;
  const v = result.install.version;
  /* Codex reads its page once per window, when its panel first opens, so a panel already open
     is running without the fix until a reload. Never when Codex has only just arrived in this
     window: nothing of it has read anything yet. */
  if (why === "extensions-changed") return;
  if (result.state === "applied") {
    offerReload(`Right-to-left text in Codex ${v} is fixed. Reload to see it.`);
  } else if (why === "installed") {
    vscode.window.showInformationMessage(signed(`Right-to-left text in Codex ${v} is fixed.`));
  }
}

function activate(context) {
  ours = version(context);
  log = vscode.window.createOutputChannel("SmartRTL for Codex");
  context.subscriptions.push(log);

  const installed = freshInstall(context);
  syncQuietly(context, installed ? "installed" : "startup");

  // Codex arriving in the window - installed, or switched back on.
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const install = patcher.findCodex();
      if (!install) return;
      if (lastSeen && lastSeen.dir === install.dir && lastSeen.version === install.version) return;
      syncQuietly(context, "extensions-changed");
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate, freshInstall };
