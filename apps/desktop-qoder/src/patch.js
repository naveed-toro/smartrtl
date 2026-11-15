/**
 * Sets the direction of the text in Qoder IDE's AI chat, in the installed Qoder.
 *
 * Qoder's pages are plain files under resources\app\out, in the user's own folder (no admin
 * rights, no signature on them). This, and only this:
 *
 *   1. builds dist/smartrtl-qoder.js from the shared rule and engine, and puts it beside the
 *      workbench page;
 *   2. adds one <script> line to the workbench page and the agents-window page;
 *   3. rewrites those two pages' checksums in product.json, so Qoder does not report a
 *      corrupt installation;
 *   4. installs the SmartRTL for Qoder extension. A Qoder update replaces the pages and takes
 *      the line away; the extension lives outside Qoder's folder, looks once each time Qoder
 *      opens, and puts the line back when it is gone.
 *
 * Before the first change, the untouched pages and product.json are kept in
 * %LOCALAPPDATA%\SmartRTL\qoder\<version>. uninstall.js takes all of it away.
 *
 *   node src/patch.js
 */
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const q = require("./qoder.js");
const { qoderCli } = require("./cli.js");

const APP_ROOT = path.resolve(__dirname, "..");

function main() {
  const app = q.appRoot();

  // 0. the script and the extension, freshly built from the shared rule and engine
  execFileSync(process.execPath, [path.join(APP_ROOT, "build/bundle.js")], { stdio: "inherit" });
  const vsix = execFileSync(process.execPath, [path.join(APP_ROOT, "build/vsix.js")], { encoding: "utf8" }).trim().split(/\r?\n/).pop();

  // 1-3. the script, the line in each page, the checksums
  const r = q.apply({ app, script: path.join(APP_ROOT, "dist", q.SCRIPT) });
  for (const p of q.PAGES) console.log((r.pages.includes(p.file) ? "patched  " : "already  ") + p.file);
  if (r.script) console.log("script   " + q.SCRIPT_FILE);

  // 4. the extension that puts it back after a Qoder update
  const out = qoderCli(app, ["--install-extension", vsix, "--force"]);
  if (out === null) console.log("Qoder's command line was not found: the extension is not installed. Run this again after each Qoder update.");
  else console.log("extension " + q.EXTENSION_ID + " installed");

  console.log(`done: Qoder ${r.version}.` + (r.pages.length ? " Quit Qoder completely and open it again." : ""));
}

try { main(); } catch (e) { console.error((e.stderr && String(e.stderr)) || e.message || e); process.exit(1); }
