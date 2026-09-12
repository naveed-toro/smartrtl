/**
 * Every message this extension can say, and whether anybody can ever be shown it.
 *
 * Wording was argued about for a long time before somebody asked the question that
 * mattered: does this situation happen at all? Three of them did not. "Right-to-left fix
 * is already on" could only appear if the command were offered while the fix was on, and
 * it is offered only while it is off - in the palette, in the Extensions menu and on the
 * status bar alike. Same for "already off", and for the no-Claude-Code warning on a
 * command that no editor will hand you without Claude Code.
 *
 * So this builds a stand-in editor, runs activate() in it, and for every state the disk
 * can be in presses exactly the commands VS Code would offer - honouring the same
 * when-clauses from package.json. Anything the source can say that nothing here produces
 * is a message written for nobody, and this fails.
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
let shown = [], ctxKeys = {}, bar = null, claudeDir = null, disposables = [], onExtensionsChanged = null;
let claudeVersion = "2.1.263";
const noop = () => ({ dispose() {} });
const fake = {
  StatusBarAlignment: { Right: 2 },
  MarkdownString: class { constructor(v) { this.value = v; } },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createStatusBarItem: () => (bar = { text: "", show() { this.shown = true; }, hide() { this.shown = false; }, dispose() {} }),
    showInformationMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
    registerUriHandler: noop,
    onDidChangeActiveTextEditor: noop,
    tabGroups: {
      get activeTabGroup() { return { activeTab: { input: { viewType: "claude-code.panel" } } }; },
      onDidChangeTabs: noop, onDidChangeTabGroups: noop
    }
  },
  commands: {
    registerCommand: (id, fn) => { CMD[id] = fn; return { dispose() {} }; },
    executeCommand: (id, key, val) => { if (id === "setContext") ctxKeys[key] = val; }
  },
  workspace: { onDidChangeConfiguration: noop, getConfiguration: () => ({ get: (k, d) => d }) },
  extensions: {
    getExtension: (id) => (id === "anthropic.claude-code" && claudeDir)
      ? { extensionPath: claudeDir, packageJSON: { version: claudeVersion } } : undefined,
    onDidChange: (fn) => { onExtensionsChanged = fn; return { dispose() {} }; }
  }
};
const CMD = {};
const stubPath = require.resolve("vscode");
require("vscode");
require.cache[stubPath].exports = fake;

const ext = require("../src/extension.js");
const patcher = require("../src/patcher.js");

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

const dir = path.join(root, "anthropic.claude-code-2.1.263");
fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
const target = path.join(dir, "webview", "index.js");
const bundle = () => fs.writeFileSync(target, "//claude code bundle\n", "utf8");
const age = (when) => fs.writeFileSync(target,
  fs.readFileSync(target, "utf8").replace(/var EXPIRES_AT = \d+;/, "var EXPIRES_AT = " + when + ";"), "utf8");

/** Exactly the commands VS Code would put in front of somebody, by its own rules. */
function offered() {
  const active = !!ctxKeys["smartrtl.active"];
  const out = [];
  for (const m of pkg.contributes.menus.commandPalette) {
    const ok = m.when === "smartrtl.active" ? active : m.when === "!smartrtl.active" ? !active : true;
    if (ok) out.push(m.command);
  }
  out.push("smartrtl.status");        // no when-clause anywhere, so always offered
  return out;
}

/* Something holding Claude Code's bundle open, which is what a panel loading it looks
   like from here. On Windows that refuses the rename outright, so nothing is written and
   the extension has to say so instead of reporting the fix in place. The handle is held
   for the whole of that state and let go of before any other. */
let held = null;
function letGo() { if (held !== null) { try { fs.closeSync(held); } catch (e) {} held = null; } }
function holdTheBundleOpen() { try { held = fs.openSync(target, "r"); } catch (e) { held = null; } }

const STATES = [
  ["Claude Code there, fix on", () => { claudeDir = dir; bundle(); patcher.apply(APP); }, true],
  ["Claude Code there, fix off", () => { claudeDir = dir; bundle(); }, false],
  ["a block whose stamp has run out", () => { claudeDir = dir; bundle(); patcher.apply(APP); age(Date.now() - 1000); }, true],
  ["no Claude Code at all", () => { claudeDir = null; }, true],
  // installed, but an update moved the file its panel loads from - which used to be
  // reported as "not installed" to somebody looking straight at Claude Code
  ["Claude Code there, but its panel file moved", () => {
    claudeDir = path.join(root, "anthropic.claude-code-moved");
    fs.mkdirSync(claudeDir, { recursive: true });
  }, true],
  // and the bundle held open by something else, where nothing at all can be written to it
  ["the bundle is held open by something else", () => {
    claudeDir = dir; bundle(); holdTheBundleOpen();
  }, false]
];

/* Every state below rewrites Claude Code's bundle from underneath the extension - a
   patched one, a clean one, a lapsed one - which is a thing no real editor does: that file
   has exactly one writer, and it forgets its cached reading of it whenever it writes. So
   the stand-in editor has to forget too. Without this, activate() in one state answers
   refresh() from the state before it, the context key comes out wrong, and the commands
   pressed below are not the ones VS Code would have offered - which quietly stopped
   "Turn on" from ever being pressed at all. */
for (const s of STATES) {
  const rewriteTheDisk = s[1];
  s[1] = () => { letGo(); rewriteTheDisk(); ext.forgetState(); };
}

function everythingAnybodyCanBeShown() {
  const seen = new Set();
  for (const [, setup, wanted] of STATES) {
    setup();
    store["smartrtl.on"] = wanted;
    ctxKeys = {};
    ext.activate(ctx);
    for (const id of offered()) {
      shown = [];
      CMD[id]();
      shown.forEach((m) => seen.add(m));
      setup();
      store["smartrtl.on"] = wanted;
    }
  }
  // Everything from here on writes to the bundle, so whatever the last state was holding
  // it with has to be let go of first - otherwise these scenarios all answer "busy" and
  // the messages they exist to produce are never produced.
  letGo();

  // the two nobody presses a button for: an update landing under the editor, and a
  // re-install that finds the fix switched off
  claudeDir = dir; claudeVersion = "2.1.263"; bundle(); store["smartrtl.on"] = true;
  ctxKeys = {}; ext.activate(ctx);

  // a real update: a NEW folder with a new version in it, and our block gone with the
  // old one. Anything less is caught by the guard that ignores other extensions being
  // installed, which is exactly what that guard is for.
  const next = path.join(root, "anthropic.claude-code-2.1.264");
  fs.mkdirSync(path.join(next, "webview"), { recursive: true });
  fs.writeFileSync(path.join(next, "webview", "index.js"), "//a newer bundle", "utf8");
  claudeDir = next; claudeVersion = "2.1.264";
  shown = [];
  if (onExtensionsChanged) onExtensionsChanged();
  shown.forEach((m) => seen.add(m));

  // and the one only a re-install produces: the fix already working, so nothing to
  // reload for, but somebody has just installed something and is owed an answer.
  // freshInstall() says yes when we have run before and our folder has no marker in it -
  // which is what an upgrade looks like, because an upgrade lands in a new folder.
  claudeDir = dir; bundle(); patcher.apply(APP);
  store["smartrtl.on"] = true;
  store["smartrtl.hasRun"] = true;
  try { fs.unlinkSync(path.join(home, ".smartrtl-installed")); } catch (e) {}
  shown = [];
  ext.activate(ctx);
  shown.forEach((m) => seen.add(m));

  store["smartrtl.on"] = false;
  shown = [];
  ext.askIfStillOff(ctx, true);
  shown.forEach((m) => seen.add(m));
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
 * Three of them carry Claude Code's version, so the string in the source never appears
 * anywhere word for word. What has to match is everything around the value: the same
 * opening, the same closing, and the same words in between, in order.
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
  const reachable = everythingAnybodyCanBeShown();
  const written = everySentenceInTheSource();
  const orphans = [...written].filter((s) => !saysIt(s, reachable));
  assert.deepEqual(orphans, [],
    "these can be said by the code and by nothing a person can do:\n  " + orphans.join("\n  "));
});

test("and every state has something to say for itself", () => {
  for (const [name, setup, wanted] of STATES) {
    setup();
    store["smartrtl.on"] = wanted;
    ctxKeys = {};
    ext.activate(ctx);
    assert.ok(bar.text, name + ": the status bar says nothing");
    for (const id of offered()) {
      shown = [];
      CMD[id]();
      assert.ok(shown.length > 0, name + ": " + id + " says nothing at all");
      setup();
      store["smartrtl.on"] = wanted;
    }
  }
});

test("the marker that tells a re-install from a restart must never ship", () => {
  // activate() writes it into its own folder and reads it back on the next install.
  // Packaged inside the .vsix it is already there on arrival, so freshInstall() answers
  // "no" for ever and the re-install question can never be asked. It reached eight
  // builds that way, having been committed by a test that handed activate() the real
  // folder - so both halves are guarded here: not in the package, and not on disk.
  const ignore = fs.readFileSync(path.join(APP, ".vscodeignore"), "utf8").split(String.fromCharCode(10));
  assert.ok(ignore.includes(".smartrtl-installed"),
    ".vscodeignore does not exclude the marker, so it will be packaged");
  assert.ok(!fs.existsSync(path.join(APP, ".smartrtl-installed")),
    "a marker has been left in the extension folder - something ran activate() against it");
});

test("an update over an older build that was working still asks for a reload", () => {
  // Found by installing 0.5.0 over 0.4.22 in a real window. The older block was live, so
  // "was it running a moment ago" said yes and nobody was asked to reload - while the
  // panel on screen went on running 0.4.22 from memory, which is exactly the build 0.5.0
  // was written to replace. A new block in the file means every open panel is stale.
  letGo();                       // a state before this one may still be holding it
  claudeDir = dir; claudeVersion = "2.1.263";
  fs.writeFileSync(target, "//claude code bundle\n" + patcher.BEGIN +
    "\n/* an older build's block */ var EXPIRES_AT = " + (Date.now() + 864e5) + ";\n", "utf8");
  assert.equal(patcher.state().live, true, "the older block is live, as it is after any earlier install");
  store["smartrtl.on"] = true;
  store["smartrtl.hasRun"] = true;
  try { fs.unlinkSync(path.join(home, ".smartrtl-installed")); } catch (e) {}
  shown = [];
  ext.activate(ctx);
  assert.ok(shown.some((m) => /Reload to see it/.test(m)),
    "the new build went into the file and nobody was asked to reload: " + JSON.stringify(shown));
});

test.after(() => {
  letGo();
  disposables.forEach((d) => d && d.dispose && d.dispose());
  fs.rmSync(root, { recursive: true, force: true });
});
