/**
 * SmartRTL for Qoder - the part that lives through Qoder's updates.
 *
 * A Qoder update puts a fresh copy of Qoder in place, and with it chat pages without our script
 * line. This extension lives in ~/.qoder/extensions, which an update does not touch. Once, when
 * Qoder opens, it looks whether the line is still there:
 *
 *   there      nothing happens (a newer script of ours, if any, is copied in quietly)
 *   not there  it is put back, and a button restarts Qoder to load it
 *
 * Nothing keeps running after that look.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// packed: everything sits beside this file; in the repository: one folder up
function beside(name, fallback) {
  const here = path.join(__dirname, name);
  return fs.existsSync(here) ? here : path.join(__dirname, fallback);
}
const q = require(beside("qoder.js", "../src/qoder.js"));
const SCRIPT = beside(q.SCRIPT, "../dist/" + q.SCRIPT);

// Qoder compares its files with product.json once, shortly after it opens, against the copy of
// product.json it read at start. Changed before that compare, a page would be called corrupt
// for this one session; so the look waits until the compare is long done.
const WAIT_MS = Number(process.env.SMARTRTL_QODER_WAIT_MS) >= 0 && process.env.SMARTRTL_QODER_WAIT_MS ? Number(process.env.SMARTRTL_QODER_WAIT_MS) : 20000;
let timer = null;

function activate(context) {
  timer = setTimeout(() => { timer = null; look(context); }, WAIT_MS);
}

function look(context) {
  const app = vscode.env.appRoot;
  let result;
  try {
    result = q.apply({ app, script: SCRIPT });
  } catch (e) {
    // said once per Qoder version, never on every start
    const key = "smartrtl.failed." + q.version(app);
    if (!context.globalState.get(key)) {
      context.globalState.update(key, true);
      vscode.window.showWarningMessage("SmartRTL: the Urdu/English direction fix could not be put back in Qoder - " + ((e && e.message) || e));
    }
    return;
  }
  if (result.pages.length) {
    vscode.window.showInformationMessage(
      "SmartRTL: Qoder was updated, so the Urdu/English direction fix has been put back. Restart Qoder to see it.",
      "Restart Qoder"
    ).then((pick) => { if (pick) restart(); });
  }
}

/**
 * Qoder reads its checksums only when it starts, so a Reload Window is not enough: Qoder has to
 * close and open. The extension host is a child of Qoder's main process; a helper of its own
 * waits for that process to end and starts Qoder again.
 */
function restart() {
  try {
    const exe = process.execPath;
    spawn(exe, [path.join(__dirname, "restart.js"), String(process.ppid), exe], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, detached: true, stdio: "ignore", windowsHide: true
    }).unref();
  } catch (e) {
    // the helper did not start: Qoder still closes, and opens again by hand
  }
  vscode.commands.executeCommand("workbench.action.quit");
}

function deactivate() { if (timer) clearTimeout(timer); timer = null; }

module.exports = { activate, deactivate };
