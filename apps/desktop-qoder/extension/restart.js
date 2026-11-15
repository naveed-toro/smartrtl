/**
 * Opens Qoder again once it has closed - the "Restart Qoder" button. Qoder has no restart
 * command an extension can call, so the extension starts this small helper on its own, outside
 * Qoder, and then asks Qoder to quit.
 *
 *   restart.js <pid of Qoder's main process> <Qoder's executable> [its arguments]
 *
 * It waits for that process to end, then starts Qoder, which opens the windows it had. When
 * Qoder does not close (a save dialog was cancelled), it gives up after two minutes and starts
 * nothing. Run by Qoder's own executable as Node (ELECTRON_RUN_AS_NODE).
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const pid = Number(process.argv[2]);
const exe = process.argv[3];
const args = process.argv.slice(4);
const POLL_MS = 250, SETTLE_MS = Number(process.env.SMARTRTL_RESTART_SETTLE_MS) || 1500, GIVE_UP_MS = 120000;

function alive(id) {
  try { process.kill(id, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

/** Qoder's start, without what its extension host passed down to this helper. */
function start() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(ELECTRON_|VSCODE_)/i.test(k)) env[k] = v;
  spawn(exe, args, { cwd: path.dirname(exe), env, detached: true, stdio: "ignore" }).unref();
}

if (pid > 0 && exe) {
  const began = Date.now();
  const tick = setInterval(() => {
    if (alive(pid)) { if (Date.now() - began > GIVE_UP_MS) clearInterval(tick); return; }
    clearInterval(tick);
    // Qoder lets only one copy run: give the old one time to let go before the new one starts
    setTimeout(start, SETTLE_MS);
  }, POLL_MS);
}
