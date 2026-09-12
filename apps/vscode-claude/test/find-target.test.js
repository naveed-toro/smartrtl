/**
 * The roads to the file the panel loads.
 *
 * Until 0.5.5 this had one road and no test, and the two facts went together: there is
 * nothing to test about a constant. `webview/index.js` was written down in the patcher,
 * written down again in the uninstall hook, and a rename of it - a content hash in the
 * filename, which is what every bundler does by default - would have taken the whole fix
 * down on every machine at once, with no way back until a new build was published.
 *
 * So what is asserted here is not "it finds the file". It is that each road finds it ON
 * ITS OWN, with the ones above it taken away - because a fallback nobody has ever run is
 * not a fallback, and the day it is needed is the worst possible day to find that out.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { findTarget } = require("../src/find-target.js");

/** A throwaway extension folder, shaped the way Claude Code's is. */
function fakeExtension({ script = "index.js", folder = "webview", css = "index.css", host = null, extra = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-shape-"));
  fs.mkdirSync(path.join(dir, folder), { recursive: true });
  fs.writeFileSync(path.join(dir, folder, script), "//the panel\n", "utf8");
  if (css) fs.writeFileSync(path.join(dir, folder, css), ".x{}", "utf8");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ main: "./extension.js" }), "utf8");
  // what Claude Code's own host code looks like where it names the panel's file
  const names = host === null ? `"${folder}","${script}"` : host;
  fs.writeFileSync(path.join(dir, "extension.js"),
    `let W=V4.Uri.joinPath(this.extensionUri,${names}),K=$.asWebviewUri(W);\n`, "utf8");
  for (const [rel, body] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body, "utf8");
  }
  return dir;
}

test("road one: the path it has been in every build, and it says so", () => {
  const dir = fakeExtension();
  const hit = findTarget(dir);
  assert.equal(hit.target, path.join(dir, "webview", "index.js"));
  assert.equal(hit.road, "webview/index.js");
});

test("road two: the file is renamed, and Claude Code's own code still names it", () => {
  // the shape of the thing this exists for: a content hash in the bundle's filename
  const dir = fakeExtension({ script: "index-a7f3c1.js" });
  const hit = findTarget(dir);
  assert.equal(hit.target, path.join(dir, "webview", "index-a7f3c1.js"));
  assert.match(hit.road, /names/);
});

test("road two: the folder is renamed too", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js" });
  assert.equal(findTarget(dir).target, path.join(dir, "panel", "app.js"));
});

test("road two: named as one string rather than two", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js", host: `"panel/app.js"` });
  assert.equal(findTarget(dir).target, path.join(dir, "panel", "app.js"));
});

test("road two never follows a name that climbs out of the extension's folder", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js", host: `"..","evil.js"` });
  const outside = path.join(path.dirname(dir), "evil.js");
  fs.writeFileSync(outside, "//not ours to touch\n", "utf8");
  try {
    // road two refuses it, so road three answers instead - inside the folder, where it belongs
    const hit = findTarget(dir);
    assert.equal(hit.target, path.join(dir, "panel", "app.js"));
  } finally { fs.unlinkSync(outside); }
});

test("a named file with no stylesheet beside it is not the panel, and is left alone", () => {
  // resources/ is full of files and is not a webview. Named or not, it is not the panel -
  // and answering "the file it named" here would write five megabytes into an icon.
  const dir = fakeExtension({ host: `"resources","claude-logo.js"`, extra: { "resources/claude-logo.js": "//icons" } });
  fs.unlinkSync(path.join(dir, "webview", "index.js"));   // close road one
  assert.equal(findTarget(dir), null, "it took a named file that has no stylesheet beside it");
});

test("road three: nothing names it, and the shape of the folder answers", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js", host: `"nothing","useful.txt"` });
  const hit = findTarget(dir);
  assert.equal(hit.target, path.join(dir, "panel", "app.js"));
  assert.match(hit.road, /one script/);
});

test("road three refuses to guess: two scripts in the folder is not an answer", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js", host: `"nothing","useful.txt"` });
  fs.writeFileSync(path.join(dir, "panel", "worker.js"), "//a worker\n", "utf8");
  assert.equal(findTarget(dir), null, "a guess here writes five megabytes into a file nobody loads");
});

test("road three refuses a folder with no stylesheet: that is not a webview", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js", css: null, host: `"nothing","useful.txt"` });
  assert.equal(findTarget(dir), null);
});

test("two folders that both look like a webview is not an answer either", () => {
  const dir = fakeExtension({ folder: "panel", script: "app.js", host: `"nothing","useful.txt"` });
  fs.mkdirSync(path.join(dir, "other"));
  fs.writeFileSync(path.join(dir, "other", "app.js"), "//?\n", "utf8");
  fs.writeFileSync(path.join(dir, "other", "app.css"), ".y{}", "utf8");
  assert.equal(findTarget(dir), null);
});

test("nothing there at all is null, not a throw", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-empty-"));
  assert.equal(findTarget(dir), null);
  assert.equal(findTarget(null), null);
  assert.equal(findTarget(path.join(dir, "does-not-exist")), null);
});

test("a directory named like the bundle is not the bundle", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-dir-"));
  fs.mkdirSync(path.join(dir, "webview", "index.js"), { recursive: true });
  assert.equal(findTarget(dir), null);
});
