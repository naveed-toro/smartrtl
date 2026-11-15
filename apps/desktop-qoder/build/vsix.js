/**
 * Packs the extension as dist/smartrtl-qoder-<version>.vsix - the file Qoder installs with
 * `--install-extension`. A .vsix is a zip: a manifest, a content-types list, and the extension
 * under extension/. Packed here with Node's own zlib, so nothing has to be installed first.
 *
 * Into the package, beside the extension's own files: src/qoder.js (what to change in Qoder)
 * and dist/smartrtl-qoder.js (the script, built by build/bundle.js from the shared rule and
 * engine). Prints the path of the package as its last line.
 *
 *   node build/vsix.js
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const ext = path.join(root, "extension");

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// 1980-01-01, the first date a zip can hold: the same package from the same files, byte for byte
const DOS_DATE = (1 << 5) | 1;

/** A zip of the given entries, deflated. */
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const file = Buffer.from(name, "utf8");
    const packed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(file.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(file.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, file, packed);
    centrals.push(central, file);
    offset += local.length + file.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

function xml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function build() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ext, "package.json"), "utf8"));
  const script = path.join(root, "dist", "smartrtl-qoder.js");
  if (!fs.existsSync(script)) throw new Error("dist/smartrtl-qoder.js is missing - run build/bundle.js first");
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
    <DisplayName>${xml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(pkg.description)}</Description>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`;
  const types = '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension=".json" ContentType="application/json" /><Default Extension=".js" ContentType="application/javascript" />' +
    '<Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>\n';
  const entries = [
    { name: "extension.vsixmanifest", data: Buffer.from(manifest, "utf8") },
    { name: "[Content_Types].xml", data: Buffer.from(types, "utf8") },
    { name: "extension/package.json", data: fs.readFileSync(path.join(ext, "package.json")) },
    { name: "extension/extension.js", data: fs.readFileSync(path.join(ext, "extension.js")) },
    { name: "extension/uninstall-hook.js", data: fs.readFileSync(path.join(ext, "uninstall-hook.js")) },
    { name: "extension/restart.js", data: fs.readFileSync(path.join(ext, "restart.js")) },
    { name: "extension/qoder.js", data: fs.readFileSync(path.join(root, "src", "qoder.js")) },
    { name: "extension/smartrtl-qoder.js", data: fs.readFileSync(script) },
  ];
  const out = path.join(root, "dist", `${pkg.name}-${pkg.version}.vsix`);
  fs.writeFileSync(out, zip(entries));
  return out;
}

if (require.main === module) console.log(build());
module.exports = { zip, crc32, build };
