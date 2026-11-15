// What this extension writes into Codex's folder, and that taking it out leaves the folder
// exactly as Codex shipped it. Run against copies - the real index.html of the installed Codex
// when there is one, a page of the same shape when there is not.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const page = require("../src/page.js");
const { cleanUp } = require("../src/uninstall.js");

const SCRIPT = page.BEGIN + "\n;(function(){})();\n";
const SHAPE = '<!doctype html>\n<html lang="en">\n  <head>\n    <!-- PROD_BASE_TAG_HERE -->\n    <!-- PROD_CSP_TAG_HERE -->\n' +
  '    <script type="module" crossorigin src="./assets/index-1.js"></script>\n  </head>\n  <body><div id="root"></div></body>\n</html>\n';

function realPage() {
  const dir = path.join(os.homedir(), ".vscode", "extensions");
  try {
    for (const name of fs.readdirSync(dir).sort().reverse()) {
      const p = page.pageOf(path.join(dir, name));
      if (page.FOLDER.test(name) && p) {
        const html = page.removeTag(fs.readFileSync(p, "utf8"));
        return html;
      }
    }
  } catch (e) {}
  return null;
}

function codexFolder(root, name, html) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "webview"), { recursive: true });
  fs.writeFileSync(path.join(dir, "webview", "index.html"), html);
  return dir;
}

const pages = [["a page of Codex's shape", SHAPE], ["the same with CRLF", SHAPE.replace(/\n/g, "\r\n")],
  ["</head> not on a line of its own", "<html><head><title>x</title></head><body></body></html>"]];
const real = realPage();
if (real) pages.push(["the installed Codex's own page", real]);

for (const [what, html] of pages) {
  test(`in and out again, to the byte: ${what}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rtl-"));
    try {
      const dir = codexFolder(root, "openai.chatgpt-26.1111.21308-win32-x64", html);
      const file = path.join(dir, "webview", "index.html");
      const script = path.join(dir, "webview", page.SCRIPT_FILE);

      assert.strictEqual(page.apply(dir, SCRIPT), "applied");
      const patched = fs.readFileSync(file, "utf8");
      assert.strictEqual(patched.split(page.TAG).length, 2, "the line is there once");
      assert.ok(patched.indexOf(page.TAG) < patched.indexOf("</head>"), "inside <head>");
      assert.ok(patched.indexOf(page.TAG) > patched.indexOf("<head>"));
      assert.strictEqual(fs.readFileSync(script, "utf8"), SCRIPT);

      // the same fix again writes nothing
      const before = fs.statSync(file).mtimeMs;
      assert.strictEqual(page.apply(dir, SCRIPT), "already-current");
      assert.strictEqual(fs.statSync(file).mtimeMs, before);

      // a new build of the script replaces the script and does not stack the line
      assert.strictEqual(page.apply(dir, SCRIPT + "// newer\n"), "applied");
      assert.strictEqual(fs.readFileSync(file, "utf8"), patched);

      assert.strictEqual(page.remove(dir), true);
      assert.strictEqual(fs.readFileSync(file, "utf8"), html, "back to the byte");
      assert.strictEqual(fs.existsSync(script), false, "the script is gone");
      assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ["index.html"], "nothing left behind");
      assert.strictEqual(page.remove(dir), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test("the line holds nothing up: Codex's page is given 30 seconds to report ready", () => {
  assert.match(page.TAG, /^<script async src="\.\/smartrtl-codex\.js"/);
  assert.doesNotMatch(page.TAG, /type="module"|defer/);
});

test("0.1.0's line, without async, is replaced by the current one and taken out like it", () => {
  const OLD = '<script src="./smartrtl-codex.js" data-smartrtl="codex"></script>';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rtl-"));
  try {
    const dir = codexFolder(root, "openai.chatgpt-26.1111.21308-win32-x64", SHAPE.replace("  </head>", "    " + OLD + "\n  </head>"));
    const file = path.join(dir, "webview", "index.html");
    assert.strictEqual(page.tagged(fs.readFileSync(file, "utf8")), true);
    assert.strictEqual(page.apply(dir, SCRIPT), "applied");
    const now = fs.readFileSync(file, "utf8");
    assert.strictEqual(now.includes(OLD), false, "the old line is gone");
    assert.strictEqual(now.split(page.TAG).length, 2, "the current line is there once");
    assert.strictEqual(page.apply(dir, SCRIPT), "already-current");
    assert.strictEqual(page.remove(dir), true);
    assert.strictEqual(fs.readFileSync(file, "utf8"), SHAPE, "back to the byte");

    codexFolder(root, "openai.chatgpt-26.1111.21308-win32-x64", SHAPE.replace("  </head>", "    " + OLD + "\n  </head>"));
    assert.strictEqual(page.remove(dir), true);
    assert.strictEqual(fs.readFileSync(file, "utf8"), SHAPE, "the old line alone comes out too");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a page with no </head> is not Codex's page as we know it: nothing is written", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rtl-"));
  try {
    const dir = codexFolder(root, "openai.chatgpt-1.0.0", "<html><body></body></html>");
    assert.strictEqual(page.apply(dir, SCRIPT), "no-target");
    assert.deepStrictEqual(fs.readdirSync(path.join(dir, "webview")), ["index.html"]);
    assert.strictEqual(page.apply(path.join(root, "nothing-here"), SCRIPT), "no-target");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("the uninstall hook takes it out of every copy of Codex, and touches nothing else", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rtl-"));
  try {
    const old = codexFolder(root, "openai.chatgpt-26.1105.100-win32-x64", SHAPE);
    const cur = codexFolder(root, "openai.chatgpt-26.1111.21308-win32-x64", SHAPE);
    const other = codexFolder(root, "anthropic.claude-code-2.1.300", SHAPE + page.TAG);
    page.apply(old, SCRIPT); page.apply(cur, SCRIPT);

    const { restored } = cleanUp(root);
    assert.deepStrictEqual(restored.sort(), ["openai.chatgpt-26.1105.100-win32-x64", "openai.chatgpt-26.1111.21308-win32-x64"]);
    for (const dir of [old, cur]) {
      assert.strictEqual(fs.readFileSync(path.join(dir, "webview", "index.html"), "utf8"), SHAPE);
      assert.deepStrictEqual(fs.readdirSync(path.join(dir, "webview")), ["index.html"]);
    }
    assert.strictEqual(fs.readFileSync(path.join(other, "webview", "index.html"), "utf8"), SHAPE + page.TAG);
    assert.deepStrictEqual(cleanUp(path.join(root, "missing")), { restored: [] });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
