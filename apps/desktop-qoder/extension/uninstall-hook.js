/**
 * Run by Qoder ("vscode:uninstall") after the extension is removed in the Extensions view:
 * the fix goes with it, so nothing of SmartRTL is left in Qoder.
 *
 * Qoder may run this for the old version when the extension is only being updated; then a
 * newer smartrtl.smartrtl-qoder folder sits beside this one, and nothing is taken away.
 */
const fs = require("node:fs");
const path = require("node:path");

function beside(name, fallback) {
  const here = path.join(__dirname, name);
  return fs.existsSync(here) ? here : path.join(__dirname, fallback);
}

try {
  const q = require(beside("qoder.js", "../src/qoder.js"));
  const mine = path.basename(__dirname).toLowerCase();
  const prefix = q.EXTENSION_ID + "-";
  const others = fs.readdirSync(path.dirname(__dirname))
    .filter((d) => d.toLowerCase().startsWith(prefix) && d.toLowerCase() !== mine);
  if (!others.length) q.remove({});
} catch (e) {
  // fails to nothing: Qoder's next update takes the line away in any case
}
