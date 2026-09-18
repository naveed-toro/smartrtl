// The formulas, for the measurements: paper/rules/rules.js with its real dependencies -
// Unicode 18.0.0 bidi classes, Google Closure's bidi.js at its pinned commit, and SmartRTL's
// frozen rule. The lab page runs the same rules.js with the same three.
//
// RULES[id](text, prose?) -> { dir: "rtl" | "ltr", raw }: a formula's "leave it alone"
// (null) is reported as "ltr", the default a page gives such text, and kept in `raw`.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bidiClass } from "./bidi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const CLOSURE_COMMIT = "0d779e6baca4cf9d650aa28c3146305db3c101ce";
const CLOSURE_SHA256 = "e0b51560339009ac085258f86b56dc22c8afd9c10d47fd5eb7f4e84ecfafa97b";
const CLOSURE_URL = `https://raw.githubusercontent.com/google/closure-library/${CLOSURE_COMMIT}/closure/goog/i18n/bidi.js`;
const CLOSURE_FILE = path.join(HERE, ".cache", `closure-bidi-${CLOSURE_COMMIT.slice(0, 7)}.js`);

async function closure() {
  if (!fs.existsSync(CLOSURE_FILE)) {
    const res = await fetch(CLOSURE_URL);
    if (!res.ok) throw new Error(`could not download ${CLOSURE_URL}: ${res.status}`);
    fs.mkdirSync(path.dirname(CLOSURE_FILE), { recursive: true });
    fs.writeFileSync(CLOSURE_FILE, Buffer.from(await res.arrayBuffer()));
  }
  const source = fs.readFileSync(CLOSURE_FILE);
  const got = crypto.createHash("sha256").update(source).digest("hex");
  if (got !== CLOSURE_SHA256) throw new Error(`${CLOSURE_FILE} is not Closure's bidi.js at ${CLOSURE_COMMIT}`);
  const sandbox = {};
  sandbox.goog = {
    provide(name) { name.split(".").reduce((o, k) => (o[k] = o[k] || {}), sandbox); },
    define(_name, value) { return value; },
    require() {},
    LOCALE: "en" // Closure's own default; it only sets IS_RTL, which estimateDirection never reads
  };
  sandbox.goog.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source.toString("utf8"), sandbox, { filename: CLOSURE_FILE });
  return sandbox.goog.i18n.bidi;
}

const closureBidi = await closure();
const smartrtl = require("../../../packages/core/src/direction.js");
const { createFormulas } = require("../../rules/rules.js");

export const { formulas: FORMULAS, helpers: HELPERS } = createFormulas({ bidiClass });

export const RULES = Object.fromEntries(FORMULAS.map((f) => [f.id, (text, prose) => {
  const raw = f.decide(text, { bidiClass, prose, closure: closureBidi, smartrtl });
  return { dir: raw === "rtl" ? "rtl" : "ltr", raw };
}]));

export const PROVENANCE = {
  unicode: "18.0.0",
  closure: { commit: CLOSURE_COMMIT, sha256: CLOSURE_SHA256 },
  smartrtl: { file: "packages/core/src/direction.js" },
  rules: { file: "paper/rules/rules.js", sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(HERE, "..", "..", "rules", "rules.js"))).digest("hex") }
};
