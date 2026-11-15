// The extension in a stand-in editor: when somebody is asked to reload, and when nobody is.
// Codex is a folder in a temporary extensions directory; `vscode` is just enough of a stub.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const page = require("../src/page.js");

const shown = [];
let codex = null;                      // { dir, version } the stand-in editor is running
const vscode = {
  extensions: {
    getExtension: (id) => (id === "openai.chatgpt" && codex ? { extensionPath: codex.dir, packageJSON: { version: codex.version } } : undefined),
    onDidChange: () => ({ dispose() {} })
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showInformationMessage: (message, ...items) => { shown.push({ message, items }); return Promise.resolve(undefined); }
  },
  commands: { executeCommand() {} }
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === "vscode" ? "vscode" : resolve.call(this, request, ...rest); };
require.cache.vscode = { id: "vscode", filename: "vscode", loaded: true, exports: vscode };
const extension = require("../src/extension.js");

const built = fs.readFileSync(path.join(__dirname, "../dist", page.SCRIPT_FILE), "utf8");
const SHAPE = "<html>\n  <head>\n    <title>ChatGPT</title>\n  </head>\n  <body><div id=\"root\"></div></body>\n</html>\n";

function folder(root, name) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
  fs.writeFileSync(path.join(dir, "webview", "index.html"), SHAPE);
  return dir;
}

function start(ours, state) {
  const ctx = {
    extensionPath: ours, subscriptions: [], extension: { packageJSON: { version: "0.1.0" } },
    globalState: { get: (k, d) => (k in state ? state[k] : d), update: (k, v) => { state[k] = v; return Promise.resolve(); } }
  };
  shown.length = 0;
  extension.activate(ctx);
  for (const s of ctx.subscriptions) s.dispose();
  return shown.map((s) => s.message);
}

test("asked to reload when the fix went in, and not again until something changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rtl-ext-"));
  try {
    const exts = path.join(root, "extensions");
    const ours = path.join(exts, "smartrtl.codex-rtl-0.1.0");
    fs.mkdirSync(path.join(ours, "dist"), { recursive: true });
    fs.writeFileSync(path.join(ours, "dist", page.SCRIPT_FILE), built);
    const running = folder(exts, "openai.chatgpt-26.1111.21308-win32-x64");
    codex = { dir: running, version: "26.1111.21308" };
    const state = {};

    let said = start(ours, state);
    assert.strictEqual(said.length, 1);
    assert.match(said[0], /^SmartRTL 0\.1\.0: Right-to-left text in Codex 26\.1111\.21308 is fixed\. Reload to see it\.$/);
    assert.deepStrictEqual(shown[0].items, ["Reload Window"]);
    assert.ok(page.tagged(fs.readFileSync(path.join(running, "webview", "index.html"), "utf8")));

    assert.deepStrictEqual(start(ours, state), [], "an ordinary start says nothing");

    // an update unpacked beside the running Codex is fixed before it starts, silently
    const waiting = folder(exts, "openai.chatgpt-26.1112.400-win32-x64");
    folder(exts, "openai.chatgpt-26.1001.1-win32-x64");   // an older copy left behind: not ours to touch
    assert.deepStrictEqual(start(ours, state), []);
    assert.ok(page.tagged(fs.readFileSync(path.join(waiting, "webview", "index.html"), "utf8")));
    assert.ok(!page.tagged(fs.readFileSync(path.join(exts, "openai.chatgpt-26.1001.1-win32-x64", "webview", "index.html"), "utf8")));

    // VS Code restarts into the update: it already has the fix, so nobody is asked again
    codex = { dir: waiting, version: "26.1112.400" };
    assert.deepStrictEqual(start(ours, state), []);

    // an update that arrived while no window watched: fixed at startup, and a reload asked for
    const missed = folder(exts, "openai.chatgpt-26.1120.5-win32-x64");
    codex = { dir: missed, version: "26.1120.5" };
    said = start(ours, state);
    assert.strictEqual(said.length, 1);
    assert.match(said[0], /Codex 26\.1120\.5 is fixed\. Reload to see it\./);
  } finally {
    codex = null;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no Codex: nothing is said and nothing is written", () => {
  codex = null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rtl-ext-"));
  try {
    assert.deepStrictEqual(start(root, {}), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
