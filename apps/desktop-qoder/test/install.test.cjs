// patch.js and uninstall.js against a stand-in Qoder folder: one line in, one line out, and
// Qoder's checksums following the pages both ways.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const q = require("../src/qoder.js");

const WORKBENCH = '<!-- c -->\r\n<!DOCTYPE html>\r\n<html>\r\n\t<head></head>\r\n\t<script src="./shiki.min.js"></script>\r\n\r\n\t<body aria-label="">\r\n\t</body>\r\n\r\n\t<script src="./workbench.js" type="module"></script>\r\n</html>\r\n';
const AGENTS = '<!DOCTYPE html>\n<html>\n\t<head></head>\n\t<body aria-label="">\n\t</body>\n\t<script src="./agents-window.js" type="module"></script>\n</html>\n';

function standIn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartrtl-qoder-"));
  const app = path.join(dir, "app");
  const pages = { [q.PAGES[0].file]: WORKBENCH, [q.PAGES[1].file]: AGENTS };
  for (const [file, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
    fs.writeFileSync(path.join(app, file), html);
  }
  fs.writeFileSync(path.join(app, "package.json"), '{"version":"9.9.9"}');
  const product = '{\r\n\t"nameShort": "Qoder",\r\n\t"checksums": {\r\n\t\t"vs/workbench/workbench.desktop.main.js": "abc",\r\n' +
    q.PAGES.map((p) => '\t\t"' + p.key + '": "' + q.checksum(Buffer.from(pages[p.file])) + '"').join(",\r\n") + "\r\n\t}\r\n}\r\n";
  fs.writeFileSync(path.join(app, "product.json"), product);
  return { dir, app, product, env: { ...process.env, SMARTRTL_QODER_APP: app, SMARTRTL_HOME: path.join(dir, "home") } };
}

const run = (script, env) => execFileSync(process.execPath, [path.join(__dirname, "../src", script)], { env, encoding: "utf8" });

test("the line goes in before <body>, in the page's own line ending, and comes out exactly", () => {
  const once = q.addTag(WORKBENCH, "./smartrtl-qoder.js");
  assert.match(once, /\r\n\t<script src="\.\/smartrtl-qoder\.js"><\/script>\r\n\t<body/);
  assert.strictEqual(q.addTag(once, "./smartrtl-qoder.js"), once);
  assert.strictEqual(q.removeTag(once), WORKBENCH);
  assert.strictEqual(q.removeTag(q.addTag(AGENTS, "../x/smartrtl-qoder.js")), AGENTS);
});

test("patch, patch again, uninstall: Qoder's files end as they were", () => {
  const s = standIn();
  try {
    run("patch.js", s.env);
    const product = fs.readFileSync(path.join(s.app, "product.json"), "utf8");
    for (const p of q.PAGES) {
      const buf = fs.readFileSync(path.join(s.app, p.file));
      assert.ok(q.isPatched(buf.toString()), p.file + " loads the script");
      assert.strictEqual(q.readChecksum(product, p.key), q.checksum(buf), p.file + " checksum follows");
    }
    assert.ok(product.includes('"vs/workbench/workbench.desktop.main.js": "abc"'), "other checksums untouched");
    assert.ok(fs.existsSync(path.join(s.app, q.SCRIPT_FILE)), "the script is in place");
    assert.ok(fs.existsSync(path.join(s.dir, "home/qoder/9.9.9/smartrtl-backup.json")), "the untouched files are kept");

    run("patch.js", s.env);
    assert.strictEqual(fs.readFileSync(path.join(s.app, "product.json"), "utf8"), product, "a second run changes nothing");

    run("uninstall.js", s.env);
    assert.strictEqual(fs.readFileSync(path.join(s.app, q.PAGES[0].file), "utf8"), WORKBENCH);
    assert.strictEqual(fs.readFileSync(path.join(s.app, q.PAGES[1].file), "utf8"), AGENTS);
    assert.strictEqual(fs.readFileSync(path.join(s.app, "product.json"), "utf8"), s.product);
    assert.ok(!fs.existsSync(path.join(s.app, q.SCRIPT_FILE)), "the script is gone");
    assert.ok(!fs.existsSync(path.join(s.dir, "home/qoder")), "the kept files are gone");
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test("a page that is not the one Qoder shipped is left alone", () => {
  const s = standIn();
  try {
    const file = path.join(s.app, q.PAGES[0].file);
    fs.writeFileSync(file, WORKBENCH.replace("<html>", "<html lang=x>"));
    assert.throws(() => run("patch.js", { ...s.env }), /checksum differs/);
    assert.strictEqual(fs.readFileSync(path.join(s.app, "product.json"), "utf8"), s.product);
    assert.ok(!q.isPatched(fs.readFileSync(path.join(s.app, q.PAGES[1].file), "utf8")));
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});
