/**
 * Every message this extension can say, and whether anybody can ever be shown it.
 *
 * Wording was argued about for a long time before somebody asked the question that
 * mattered: does this situation happen at all? Three of them did not, back when there
 * were commands to press. From 0.10.0 there are none, so what this extension says is
 * said only by what happens to it - being installed, VS Code starting, a bundle held
 * open - and each of those is played out here in a stand-in editor. Anything the source
 * can say that nothing here produces is a message written for nobody, and this fails.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.paths.unshift(path.join(__dirname, "stub", "node_modules"));
require("module").Module._initPaths();
process.env.NODE_PATH = path.join(__dirname, "stub", "node_modules");
require("module")._initPaths();

const APP = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));

/* ---- the stand-in editor ---------------------------------------------------- */
let shown = [], claudeDir = null, disposables = [];
const fake = {
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showInformationMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { shown.push(m); return Promise.resolve(undefined); }
  },
  commands: { executeCommand: () => {} },
  extensions: {
    getExtension: (id) => (id === "anthropic.claude-code" && claudeDir)
      ? { extensionPath: claudeDir, packageJSON: { version: "2.1.263" } } : undefined,
    onDidChange: () => ({ dispose() {} })
  }
};
const stubPath = require.resolve("vscode");
require("vscode");
require.cache[stubPath].exports = fake;

const ext = require("../src/extension.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "reach-"));
/* activate() writes a marker into its own folder to tell a re-install from a restart.
   Handing it the real one puts that marker in the repository - which is how it came to
   be committed once, and then shipped inside eight .vsix files, where its presence made
   freshInstall() answer "no" for ever. It gets a throwaway folder with only the payload
   in it, which is all patcher.apply() reads from there. */
const home = path.join(root, "our-own-folder");
fs.mkdirSync(path.join(home, "dist"), { recursive: true });
fs.copyFileSync(path.join(APP, "dist", "payload.js"), path.join(home, "dist", "payload.js"));

const store = {};
const ctx = {
  extensionPath: home,
  subscriptions: { push(...d) { disposables.push(...d); } },
  globalState: { get: (k, d) => (k in store ? store[k] : d), update: (k, v) => { store[k] = v; } },
  extension: { packageJSON: { version: pkg.version } }
};

claudeDir = path.join(root, "anthropic.claude-code-2.1.263");
fs.mkdirSync(path.join(claudeDir, "webview"), { recursive: true });
const target = path.join(claudeDir, "webview", "index.js");
const bundle = () => fs.writeFileSync(target, "//claude code bundle\n", "utf8");

/** Installed: run here before, and our folder is new. */
function install() {
  store["smartrtl.hasRun"] = true;
  try { fs.unlinkSync(path.join(home, ".smartrtl-installed")); } catch (e) {}
}
function start() {
  disposables.splice(0).forEach((d) => d && d.dispose && d.dispose());
  shown = [];
  ext.activate(ctx);
  return shown;
}

function everythingAnybodyCanBeShown() {
  const seen = new Set();
  const keep = (said) => said.forEach((m) => seen.add(m));

  bundle(); keep(start());                       // the first install: the panel needs a reload
  install(); keep(start());                      // installed again over the same fix: told so

  /* Something holding Claude Code's bundle open, which is what a panel loading it looks
     like from here. On Windows that refuses the rename outright, so nothing is written and
     somebody who has just installed this has to be told. */
  bundle(); install();
  const held = fs.openSync(target, "r");
  try { keep(start()); } finally { fs.closeSync(held); }
  return seen;
}

/** Every sentence the source can hand to a person. */
function everySentenceInTheSource() {
  const src = fs.readFileSync(path.join(APP, "src", "extension.js"), "utf8");
  const out = new Set();
  const LIT = /"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (const m of src.matchAll(LIT)) {
    const lit = (m[1] || m[2] || "").split("\\n").join("\n");
    if (lit.includes(" ") && lit.trim().endsWith(".")) out.add(lit);
  }
  return out;
}

/** The fixed words of a message, with any value dropped into it taken out. */
function splitOnPlaceholders(s) {
  const parts = []; let i = 0;
  for (;;) {
    const a = s.indexOf("${", i);
    if (a === -1) { parts.push(s.slice(i)); break; }
    parts.push(s.slice(i, a));
    const b = s.indexOf("}", a);
    if (b === -1) { parts.push(s.slice(a)); break; }
    i = b + 1;
  }
  return parts;
}

/**
 * Is this sentence one that somebody can be shown?
 *
 * Some carry Claude Code's version, so the string in the source never appears anywhere
 * word for word. What has to match is everything around the value: the same opening, the
 * same closing, and the same words in between, in order.
 */
function saysIt(written, reachable) {
  const parts = splitOnPlaceholders(written);
  if (parts.length === 1) return reachable.has(written);
  for (const r of reachable) {
    if (!r.startsWith(parts[0]) || !r.endsWith(parts[parts.length - 1])) continue;
    let pos = 0, ok = true;
    for (const p of parts) {
      const at = r.indexOf(p, pos);
      if (at === -1) { ok = false; break; }
      pos = at + p.length;
    }
    if (ok) return true;
  }
  return false;
}

test("no message is written for a situation nobody can reach", () => {
  // A notice is shown signed - "SmartRTL 0.10.0: " and then the sentence - and the signature
  // is added where it is shown, not written into each sentence.
  const reachable = new Set([...everythingAnybodyCanBeShown()].map((m) => m.replace(/^SmartRTL [^:\s]+: /, "")));
  const written = everySentenceInTheSource();
  const orphans = [...written].filter((s) => !saysIt(s, reachable));
  assert.deepEqual(orphans, [],
    "these can be said by the code and by nothing that can happen:\n  " + orphans.join("\n  "));
});

test("a notice names both builds - ours and Claude Code's", () => {
  // Somebody trying one .vsix after another was told "Claude Code 2.1.270 is fixed" by
  // every one of them alike.
  bundle();
  const said = start();
  assert.ok(said.some((m) => m.startsWith("SmartRTL " + pkg.version + ":") && m.includes("2.1.263")),
    JSON.stringify(said));
});

test("the marker that tells a re-install from a restart must never ship", () => {
  // activate() writes it into its own folder and reads it back on the next install.
  // Packaged inside the .vsix it is already there on arrival, so freshInstall() answers
  // "no" for ever. It reached eight builds that way, having been committed by a test that
  // handed activate() the real folder - so both halves are guarded here: not in the
  // package, and not on disk.
  const ignore = fs.readFileSync(path.join(APP, ".vscodeignore"), "utf8").split(String.fromCharCode(10));
  assert.ok(ignore.includes(".smartrtl-installed"),
    ".vscodeignore does not exclude the marker, so it will be packaged");
  assert.ok(!fs.existsSync(path.join(APP, ".smartrtl-installed")),
    "a marker has been left in the extension folder - something ran activate() against it");
});

test.after(() => {
  disposables.forEach((d) => d && d.dispose && d.dispose());
  fs.rmSync(root, { recursive: true, force: true });
});
