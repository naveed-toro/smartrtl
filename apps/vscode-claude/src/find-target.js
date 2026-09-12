/**
 * Where the Claude Code panel loads its code from - found more than one way.
 *
 * THE ONE THING IN THIS PROJECT THAT HAD A SINGLE ROAD
 *
 * Everything else here is found two ways or more, because a name that is hashed per
 * build is a name that will one day be a different name: the box you type into has
 * five roads, a sent message two, a pinned row three. This had one, written down -
 * `webview/index.js` - and it is the road everything else stands on. Put a content
 * hash in that filename, the way every other bundler already does, and the whole fix
 * goes dark at once, on every machine, with no way back until a new build of this
 * extension is published and installed.
 *
 * So the same rule applies here now. Three roads, each enough on its own, tried in
 * the order of how certain they are:
 *
 *   1. webview/index.js       what it has been in every build from 2.0.50 to 2.1.269,
 *                             and one stat call. Nothing below this line runs on any
 *                             machine where that is still true - which is all of them,
 *                             today.
 *
 *   2. what Claude Code itself names. Its host code joins its own folder to the
 *                             panel's file in plain string literals -
 *                             `joinPath(this.extensionUri, "webview", "index.js")` -
 *                             and in the whole 3.4MB of 2.1.269 exactly one pair of
 *                             literals names a `.js` file that exists. Read them out
 *                             and this survives a rename of either half.
 *
 *   3. the shape of a webview folder. A folder holding exactly ONE script and at
 *                             least one stylesheet is what a webview's folder is,
 *                             and it needs no name at all. Exactly one, never "the
 *                             biggest": "probably that one" is a guess, and a guess
 *                             here writes five megabytes into a file nobody loads and
 *                             then reports that the fix is on.
 *
 * Which road was taken is reported, not swallowed. A fix running on road 2 or 3 is a
 * fix running on a day something changed, and that belongs in the log rather than in
 * somebody's later investigation.
 *
 * There is deliberately no `vscode` in here. The uninstall hook runs as a plain node
 * script with no editor around it and has to find the same file the patcher does; it
 * used to keep a second copy of the path, which is the other way two pieces of code
 * quietly stop agreeing.
 */
const fs = require("node:fs");
const path = require("node:path");

const WEBVIEW = "webview";
const INDEX = "index.js";

/** The path as it has always been, relative to Claude Code's own folder. */
const REL_TARGET = path.join(WEBVIEW, INDEX);

/** A file, and not a directory that happens to be named like one. */
function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (e) { return false; }
}

/**
 * Is there a stylesheet beside this script?
 *
 * The one thing that is true of a webview's folder and of no other folder in an
 * extension: the panel ships its styles next to its code. `resources/` holds images
 * and svgs and would otherwise be a candidate on both of the roads below.
 */
function hasAStylesheetBesideIt(file) {
  try {
    return fs.readdirSync(path.dirname(file)).some(function (n) { return /\.css$/i.test(n); });
  } catch (e) { return false; }
}

/** A name that tries to climb out of the extension's folder is not a name we follow. */
function safeSegment(s) { return !!s && s !== "." && s !== ".." && s.indexOf("/") < 0 && s.indexOf("\\") < 0; }

/* Two shapes for the same thing: the folder and the file as separate literals, which
   is what joinPath takes, and the two joined into one - which nothing writes today,
   and which costs one more pass over a string already in memory. */
const PAIR = /"([A-Za-z0-9._-]{1,40})"\s*,\s*"([A-Za-z0-9._-]{1,60}\.js)"/g;
const JOINED = /"([A-Za-z0-9._-]{1,40})\/([A-Za-z0-9._-]{1,60}\.js)"/g;

/**
 * The file Claude Code's own code names.
 *
 * Its host file is three and a half megabytes, so this is not something to do on every
 * activation - and it never is: road 1 answers first on every build that has ever
 * shipped, and this is only reached on the day that stops being true.
 *
 * @returns {string|null}
 */
function namedByHost(dir) {
  var main = "./extension.js";
  try {
    var pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    if (pkg && typeof pkg.main === "string" && pkg.main) main = pkg.main;
  } catch (e) { /* no package.json, or not JSON: the default is still worth trying */ }

  var host;
  try { host = fs.readFileSync(path.join(dir, main), "utf8"); } catch (e) { return null; }

  var seen = Object.create(null);
  for (var r = 0; r < 2; r++) {
    var re = r === 0 ? PAIR : JOINED;
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(host)) !== null) {
      if (!safeSegment(m[1]) || !safeSegment(m[2])) continue;
      var rel = path.join(m[1], m[2]);
      if (seen[rel]) continue;
      seen[rel] = 1;
      var full = path.join(dir, rel);
      if (isFile(full) && hasAStylesheetBesideIt(full)) return full;
    }
  }
  return null;
}

/** A folder holding exactly one script, with a stylesheet beside it. */
function theOneScriptIn(dir) {
  var names;
  try { names = fs.readdirSync(dir); } catch (e) { return null; }
  var scripts = names.filter(function (n) { return /\.js$/i.test(n); });
  if (scripts.length !== 1) return null;                       // two is not an answer
  if (!names.some(function (n) { return /\.css$/i.test(n); })) return null;
  var full = path.join(dir, scripts[0]);
  return isFile(full) ? full : null;
}

/**
 * The panel's folder by its shape, for a build that has renamed the folder as well as
 * the file. One level down and no deeper: a webview's folder sits beside the host's own
 * code, and walking a whole extension tree looking for something to write to is not a
 * thing this should ever do.
 *
 * @returns {string|null}
 */
function byShape(root) {
  var here = theOneScriptIn(path.join(root, WEBVIEW));
  if (here) return here;

  var entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { return null; }
  var found = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e.isDirectory() || e.name === "node_modules" || e.name.charAt(0) === ".") continue;
    var hit = theOneScriptIn(path.join(root, e.name));
    if (hit) found.push(hit);
  }
  return found.length === 1 ? found[0] : null;                 // two of them is not an answer either
}

/**
 * @param {string} dir Claude Code's own extension folder
 * @returns {{target: string, road: string}|null} null when no road reaches a file
 */
function findTarget(dir) {
  if (!dir) return null;

  var known = path.join(dir, REL_TARGET);
  if (isFile(known)) return { target: known, road: "webview/index.js" };

  var named = namedByHost(dir);
  if (named) return { target: named, road: "the file Claude Code's own code names" };

  var shaped = byShape(dir);
  if (shaped) return { target: shaped, road: "the one script in a folder with a stylesheet" };

  return null;
}

module.exports = { findTarget, REL_TARGET, WEBVIEW, INDEX };
