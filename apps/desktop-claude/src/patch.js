/**
 * Makes a copy of the installed Claude desktop app that sets the direction of its text.
 *
 * The installed app is never touched: it stays signed, and Windows keeps updating it. This
 * copies it into %LOCALAPPDATA%\SmartRTL\claude\<version>, and in the copy only:
 *
 *   1. puts hook.js and the payload beside the app's own entry, and loads the hook first;
 *   2. turns off the one switch (the asar integrity check) that would refuse a changed app.
 *
 * Nothing else is changed - no certificate, no admin rights, no other file. A Start menu
 * shortcut "Claude (SmartRTL)" runs launch.ps1, which calls this again whenever Claude has
 * updated, so the copy follows the installed version. uninstall.js takes all of it away.
 *
 *   node src/patch.js [--force]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

const SMART_HOME = process.env.SMARTRTL_HOME || path.join(process.env.LOCALAPPDATA, "SmartRTL");
const COPIES = path.join(SMART_HOME, "claude");
const MARKER = "smartrtl-patched.json";
const HOOK_LINE = 'require("./smartrtl-hook.js");';
const APP_ROOT = path.resolve(__dirname, "..");

function requireWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Refusing a filesystem operation outside its SmartRTL directory");
  }
}

function installed() {
  const suppliedIndex = process.argv.indexOf("--package-info");
  if (suppliedIndex >= 0) {
    const supplied = JSON.parse(fs.readFileSync(process.argv[suppliedIndex + 1], "utf8"));
    const version = supplied.Version;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid Claude package version");
    const expectedParent = path.join(process.env.ProgramFiles, "WindowsApps");
    const location = path.resolve(supplied.InstallLocation);
    if (path.dirname(location).toLowerCase() !== expectedParent.toLowerCase() ||
        !new RegExp("^Claude_" + version.replace(/\./g,"\\.") + "_(x64|arm64)__pzs8sxrjxfjjc$", "i").test(path.basename(location))) {
      throw new Error("The supplied source is not the installed Claude package directory");
    }
    return {Version: version, InstallLocation: location};
  }
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command",
    "Get-AppxPackage -Name Claude | Select-Object Version, InstallLocation | ConvertTo-Json -Compress"],
    { encoding: "utf8" }).trim();
  if (!out) throw new Error("The Claude desktop app is not installed.");
  const pkg = JSON.parse(out);
  return Array.isArray(pkg) ? pkg[pkg.length - 1] : pkg;
}

async function main() {
  const force = process.argv.includes("--force");
  const { Version: version, InstallLocation: location } = installed();
  const source = path.join(location, "app");
  const target = path.join(COPIES, version);

  if (!force && fs.existsSync(path.join(target, MARKER)) && JSON.parse(fs.readFileSync(path.join(target, MARKER),"utf8")).patchRevision === 1) {
    console.log(`Claude ${version} is already copied and patched: ${target}`);
    shortcut(target);
    return;
  }

  // 0. the payload, freshly built from the shared rule and engine
  execFileSync(process.execPath, [path.join(APP_ROOT, "build/bundle-payload.js")], { stdio: "inherit" });

  // 1. the copy, built beside its final place and moved in only when complete
  const building = target + ".building";
  requireWithin(COPIES, building);
  fs.rmSync(building, { recursive: true, force: true });
  console.log(`copying Claude ${version} ...`);
  fs.cpSync(source, building, { recursive: true });

  // 2. the hook, inside the copy's archive
  const archive = path.join(building, "resources", "app.asar");
  const scratchRoot = process.env.SMARTRTL_BUILD_TMP || os.tmpdir();
  fs.mkdirSync(scratchRoot, { recursive: true });
  const work = fs.mkdtempSync(path.join(scratchRoot, "smartrtl-asar-"));
  try {
    asar.extractAll(archive, work);
    const main = JSON.parse(fs.readFileSync(path.join(work, "package.json"), "utf8")).main;
    const entry = path.join(work, main);
    const code = fs.readFileSync(entry, "utf8");
    if (code.includes(HOOK_LINE)) throw new Error("the entry already loads the hook - is this an already patched app?");
    fs.copyFileSync(path.join(APP_ROOT, "src/hook.js"), path.join(path.dirname(entry), "smartrtl-hook.js"));
    fs.copyFileSync(path.join(APP_ROOT, "dist/payload.js"), path.join(path.dirname(entry), "smartrtl-payload.js"));
    // first thing the entry does, after its own "use strict"
    const strict = code.match(/^\s*"use strict";/);
    fs.writeFileSync(entry, strict ? strict[0] + HOOK_LINE + code.slice(strict[0].length) : HOOK_LINE + code);

    // the same six native files stay outside the archive, as they were
    requireWithin(building, archive);
    fs.rmSync(archive, { force: true });
    fs.rmSync(archive + ".unpacked", { recursive: true, force: true });
    await asar.createPackageWithOptions(work, archive, { unpack: "*.{node,dll,exe}" });
  } finally {
    requireWithin(scratchRoot, work);
    fs.rmSync(work, { recursive: true, force: true });
  }

  // 3. the one switch
  await flipFuses(path.join(building, "claude.exe"), {
    version: FuseVersion.V1,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
  });

  fs.writeFileSync(path.join(building, MARKER), JSON.stringify({
    version, from: source, patchedAt: new Date().toISOString(), patchRevision: 1,
  }, null, 1));

  // 4. in place, preserving older copies. The old copy is moved aside first: a move either
  // happens whole or not at all, so a copy that is open is never left half deleted.
  if (fs.existsSync(target)) {
    requireWithin(COPIES, target);
    try { fs.renameSync(target, target + ".old-" + Date.now()); }
    catch (e) {
      throw new Error("Claude (SmartRTL) is open. Quit it (tray icon by the clock -> Quit) and run this again.\n" +
        `The new copy is ready in ${building}.`);
    }
  }
  fs.renameSync(building, target);
  // Retain the previous known-working copy until the new package-context launch is verified.
  shortcut(target);
  console.log(`done: ${target}`);
}

// Start menu: "Claude (SmartRTL)" runs launch.ps1, which makes a fresh copy whenever the
// installed Claude has updated, then opens it.
function shortcut(target) {
  const q = (s) => s.replace(/'/g, "''");
  const link = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Claude (SmartRTL).lnk");
  const launcher = path.join(APP_ROOT, "src", "launch.ps1");
  const args = `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launcher}"`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command",
    `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(link)}');` +
    `$s.TargetPath='powershell.exe';$s.Arguments='${q(args)}';$s.WindowStyle=7;` +
    `$s.WorkingDirectory='${q(APP_ROOT)}';$s.IconLocation='${q(path.join(target, "claude.exe"))},0';$s.Save()`]);
  console.log(`shortcut: ${link}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
