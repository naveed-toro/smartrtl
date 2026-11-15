// The extension, against a stand-in Qoder folder: after a Qoder update (fresh pages, no line)
// it puts the fix back and says so once; when the fix is in place it changes nothing and says
// nothing. Also: the .vsix holds what Qoder needs to install it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const q = require("../src/qoder.js");

const WORKBENCH = '<!DOCTYPE html>\r\n<html>\r\n\t<head></head>\r\n\t<body aria-label="">\r\n\t</body>\r\n\t<script src="./workbench.js" type="module"></script>\r\n</html>\r\n';
const AGENTS = '<!DOCTYPE html>\n<html>\n\t<head></head>\n\t<body aria-label="">\n\t</body>\n</html>\n';

/** A fresh Qoder, as an update leaves it: shipped pages, shipped checksums. */
function freshQoder(app, ver) {
  const pages = { [q.PAGES[0].file]: WORKBENCH, [q.PAGES[1].file]: AGENTS };
  for (const [file, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
    fs.writeFileSync(path.join(app, file), html);
  }
  try { fs.rmSync(path.join(app, q.SCRIPT_FILE)); } catch (e) {}
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ version: ver }));
  fs.writeFileSync(path.join(app, "product.json"), '{\n\t"checksums": {\n' +
    q.PAGES.map((p) => '\t\t"' + p.key + '": "' + q.checksum(Buffer.from(pages[p.file])) + '"').join(",\n") + "\n\t}\n}\n");
}

/** The extension, loaded with a stand-in for Qoder's `vscode` module. */
function loadExtension(app) {
  const said = [];
  const vscode = {
    env: { appRoot: app },
    window: {
      showInformationMessage: (m) => { said.push(m); return Promise.resolve(undefined); },
      showWarningMessage: (m) => { said.push("warning: " + m); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: () => Promise.resolve() }
  };
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) { return request === "vscode" ? "vscode" : resolve.call(this, request, ...rest); };
  require.cache.vscode = { id: "vscode", filename: "vscode", loaded: true, exports: vscode };
  const file = require.resolve("../extension/extension.js");
  delete require.cache[file];
  const ext = require(file);
  Module._resolveFilename = resolve;
  const state = new Map();
  const context = { globalState: { get: (k) => state.get(k), update: (k, v) => { state.set(k, v); return Promise.resolve(); } } };
  return { said, start: () => { ext.activate(context); return new Promise((r) => setTimeout(r, 50)); }, stop: () => ext.deactivate() };
}

test.before(() => {
  process.env.SMARTRTL_QODER_WAIT_MS = "0";
  execFileSync(process.execPath, [path.join(__dirname, "../build/bundle.js")]);
});

test("after a Qoder update the fix is put back, said once; then nothing happens", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-qoder-ext-"));
  const app = path.join(dir, "app");
  process.env.SMARTRTL_HOME = path.join(dir, "home");
  try {
    freshQoder(app, "1.0.0");
    const first = loadExtension(app);
    await first.start();
    assert.strictEqual(first.said.length, 1, "said once");
    assert.match(first.said[0], /Qoder/);
    const product = fs.readFileSync(path.join(app, "product.json"), "utf8");
    for (const p of q.PAGES) {
      const buf = fs.readFileSync(path.join(app, p.file));
      assert.ok(q.isPatched(buf.toString()), p.file + " loads the script");
      assert.strictEqual(q.readChecksum(product, p.key), q.checksum(buf), p.file + " checksum follows");
    }
    assert.ok(fs.existsSync(path.join(app, q.SCRIPT_FILE)));

    // the next start: in place, so nothing is written and nothing said
    const before = fs.statSync(path.join(app, "product.json")).mtimeMs;
    const second = loadExtension(app);
    await second.start();
    assert.deepStrictEqual(second.said, []);
    assert.strictEqual(fs.statSync(path.join(app, "product.json")).mtimeMs, before);

    // another update: fresh files again, and the fix comes back
    freshQoder(app, "1.1.0");
    const third = loadExtension(app);
    await third.start();
    assert.strictEqual(third.said.length, 1);
    assert.ok(q.isPatched(fs.readFileSync(path.join(app, q.PAGES[0].file), "utf8")));
    assert.ok(fs.existsSync(path.join(dir, "home/qoder/1.1.0/smartrtl-backup.json")), "the new version's files are kept");

    // and every trace goes when it is taken away
    q.remove({ app });
    assert.strictEqual(fs.readFileSync(path.join(app, q.PAGES[0].file), "utf8"), WORKBENCH);
    assert.strictEqual(fs.readFileSync(path.join(app, q.PAGES[1].file), "utf8"), AGENTS);
  } finally {
    delete process.env.SMARTRTL_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a page Qoder did not ship is left alone, and said once only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-qoder-ext-"));
  const app = path.join(dir, "app");
  process.env.SMARTRTL_HOME = path.join(dir, "home");
  try {
    freshQoder(app, "1.0.0");
    fs.writeFileSync(path.join(app, q.PAGES[0].file), WORKBENCH.replace("<html>", "<html lang=x>"));
    const product = fs.readFileSync(path.join(app, "product.json"), "utf8");
    const ext = loadExtension(app);
    await ext.start();
    await ext.start();
    assert.strictEqual(ext.said.length, 1);
    assert.match(ext.said[0], /^warning: .*checksum differs/);
    assert.strictEqual(fs.readFileSync(path.join(app, "product.json"), "utf8"), product);
  } finally {
    delete process.env.SMARTRTL_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** The files in a zip, read back with Node's own zlib. */
function unzip(buf) {
  const files = {};
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(end + 16);
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    const size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30), note = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files[name] = zlib.inflateRawSync(buf.subarray(start, start + size));
    at += 46 + nameLen + extra + note;
  }
  return files;
}

test("the .vsix holds the extension, the formula's script and the manifest Qoder reads", () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, "../build/vsix.js")], { encoding: "utf8" }).trim();
  const files = unzip(fs.readFileSync(out));
  const pkg = JSON.parse(files["extension/package.json"]);
  assert.strictEqual(pkg.publisher + "." + pkg.name, q.EXTENSION_ID);
  assert.deepStrictEqual(pkg.activationEvents, ["onStartupFinished"]);
  assert.match(files["extension.vsixmanifest"].toString(), new RegExp('Id="' + pkg.name + '" Version="' + pkg.version.replace(/\./g, "\\.") + '" Publisher="' + pkg.publisher + '"'));
  assert.ok(files["extension/smartrtl-qoder.js"].equals(fs.readFileSync(path.join(__dirname, "../dist", q.SCRIPT))));
  assert.ok(files["extension/qoder.js"].equals(fs.readFileSync(path.join(__dirname, "../src/qoder.js"))));
  for (const f of ["extension/extension.js", "extension/uninstall-hook.js", "extension/restart.js"]) assert.ok(files[f], f);
});

test("Restart: the helper waits for Qoder to close, then opens it - and only then", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-qoder-restart-"));
  const opened = path.join(dir, "opened");
  const helper = path.join(__dirname, "../extension/restart.js");
  const { spawn } = require("node:child_process");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // a stand-in for Qoder's main process, closing after a second
    const qoder = spawn(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], { stdio: "ignore" });
    const env = { ...process.env, SMARTRTL_RESTART_SETTLE_MS: "100", VSCODE_PID: "1", ELECTRON_RUN_AS_NODE: "1" };
    spawn(process.execPath, [helper, String(qoder.pid), process.execPath, "-e",
      "require('fs').writeFileSync(process.argv[1], JSON.stringify(Object.keys(process.env).filter(k => /^(ELECTRON_|VSCODE_)/i.test(k))))", opened],
      { env, stdio: "ignore" });
    await wait(600);
    assert.ok(!fs.existsSync(opened), "not opened while Qoder is still running");
    for (let i = 0; i < 40 && !fs.existsSync(opened); i++) await wait(100);
    assert.ok(fs.existsSync(opened), "opened once Qoder closed");
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(opened, "utf8")), [], "Qoder starts clean of its extension host's settings");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
