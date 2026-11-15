/**
 * Qoder's own command line, as its bin\code.cmd runs it: the Qoder executable as Node, with
 * out\cli.js. Used to install and uninstall the extension the supported way.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/** @returns {string|null} the command's output, or null when this Qoder has no command line */
function qoderCli(app, args) {
  const exe = path.resolve(app, "../../Qoder IDE.exe");
  const cli = path.join(app, "out", "cli.js");
  if (!fs.existsSync(exe) || !fs.existsSync(cli)) return null;
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  delete env.VSCODE_DEV;
  return execFileSync(exe, [cli, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

module.exports = { qoderCli };
