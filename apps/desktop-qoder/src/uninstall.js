/**
 * Takes the Qoder fix away: the extension first (or it would put the fix back the next time
 * Qoder opens), then the script line out of both pages, each page's checksum back to match it,
 * the script file itself, and the kept copies in %LOCALAPPDATA%\SmartRTL\qoder.
 *
 * When Qoder has not updated since, what is left is byte for byte the page Qoder shipped, and
 * its checksum is the one Qoder shipped.
 *
 *   node src/uninstall.js
 */
const q = require("./qoder.js");
const { qoderCli } = require("./cli.js");

function main() {
  const app = q.appRoot();
  try {
    if (qoderCli(app, ["--uninstall-extension", q.EXTENSION_ID]) !== null) console.log("removed  extension " + q.EXTENSION_ID);
  } catch (e) {
    // not installed: nothing to take away
  }
  for (const line of q.remove({ app })) console.log(line);
  console.log("done. Quit Qoder completely and open it again.");
}

try { main(); } catch (e) { console.error(e.message || e); process.exit(1); }
