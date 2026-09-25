/**
 * Takes away everything patch.js and the patched copy left behind:
 *
 *   %LOCALAPPDATA%\SmartRTL          the patched copies and the status reports
 *   the Start menu shortcut          "Claude (SmartRTL)"
 *   %APPDATA%\Claude                 the copy's own profile (its login). The installed app
 *                                    keeps its profile inside its package folder and never
 *                                    uses this one, so removing it cannot touch it.
 *
 * The installed Claude app is not touched; it was never changed.
 *
 *   node src/uninstall.js
 */
const fs = require("node:fs");
const path = require("node:path");

const targets = [
  path.join(process.env.LOCALAPPDATA, "SmartRTL"),
  path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Claude (SmartRTL).lnk"),
  path.join(process.env.APPDATA, "Claude"),
];
for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  fs.rmSync(t, { recursive: true, force: true });
  console.log(`removed ${t}`);
}
forgetLinks();

/**
 * A copy made before the hook refused Claude's links registered claude:// to itself in
 * HKCU\Software\Classes\claude. That key is ours only if it points into SmartRTL; the
 * installed app registers its links through its package, never here.
 */
function forgetLinks() {
  const { execFileSync } = require("node:child_process");
  const key = "HKCU\\Software\\Classes\\claude";
  let command = "";
  try { command = execFileSync("reg", ["query", key + "\\shell\\open\\command", "/ve"], { encoding: "utf8" }); }
  catch (e) { return; }
  if (!/\\SmartRTL\\/i.test(command)) return;
  execFileSync("reg", ["delete", key, "/f"]);
  console.log(`removed ${key} (claude:// links pointed at the copy)`);
}
