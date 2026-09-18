// The labelling tool: a page on this computer only (127.0.0.1), over the private snapshot.
//
//   npm run label                 then open http://127.0.0.1:4173/?by=owner
//   npm run label -- --freeze     freeze every labels file (asks nothing; do it once, on purpose)
//   npm run label -- --set four   the texts the four candidates disagree on, from both sources
//                                 (four.mjs); labels kept apart, in private/labels/four
//
// Each text is drawn twice from its own Markdown - right-to-left and left-to-right, nothing
// else different - and the labeller says which reads correctly (corpus/guide.md).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { buildQueue, SEED } from "./queue.mjs";
import { openStore, LABELS } from "./store.mjs";
import { disagreements, SEED_FOUR } from "../four.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(HERE, "..", "..");
const SNAPSHOT = path.join(CORPUS, "private", "transcripts.units.jsonl");
const GUIDE = path.join(CORPUS, "guide.md");
const PORT = Number(process.env.PORT) || 4173;

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const at = process.argv.indexOf("--set");
const FOUR = at > -1 && process.argv[at + 1] === "four";
const store = openStore(FOUR ? path.join(CORPUS, "private", "labels", "four") : path.join(CORPUS, "private", "labels"));

if (process.argv.includes("--freeze")) {
  console.log(JSON.stringify(store.freeze(), null, 2));
  process.exit(0);
}

const snapshotBytes = fs.readFileSync(SNAPSHOT);
const snapshot = sha256(snapshotBytes).slice(0, 16);
const records = snapshotBytes.toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
// The four set carries its own answers, from both sources; its texts are shown the same way.
const queue = FOUR ? disagreements() : buildQueue(records);
const answers = FOUR ? new Map(queue.map((q) => [q.answerId, q.markdown])) : new Map(records.map((a) => [a.answerId, a.markdown]));
const seed = FOUR ? SEED_FOUR : SEED;
const guide = () => sha256(fs.readFileSync(GUIDE)).slice(0, 16);

const render = (md) => micromark(md, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });

function unitHtml(q) {
  if (q.kind === "heading") return render(q.source);
  const inner = render(q.source);
  if (q.kind === "list-item") {
    const tag = q.ordered ? "ol" : "ul";
    return `<${tag}><li>${inner}</li></${tag}>`;
  }
  return inner;
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const by = url.searchParams.get("by") || "owner";

    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, fs.readFileSync(path.join(HERE, "page.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      const labels = store.read(by);
      return send(res, 200, { by, total: queue.length, labels: queue.map((q) => labels.get(q.textId)?.label || null),
        choices: LABELS, frozen: !!store.frozen(), tampered: store.tampered(), guide: guide(), snapshot, seed, set: FOUR ? "four" : "sample" });
    }
    if (req.method === "GET" && url.pathname === "/api/unit") {
      const i = Number(url.searchParams.get("i"));
      const q = queue[i];
      if (!q) return send(res, 404, { error: "no such unit" });
      return send(res, 200, { i, textId: q.textId, kind: q.kind, html: unitHtml(q) });
    }
    if (req.method === "GET" && url.pathname === "/api/context") {
      const q = queue[Number(url.searchParams.get("i"))];
      if (!q) return send(res, 404, { error: "no such unit" });
      return send(res, 200, { markdown: escape(answers.get(q.answerId) || ""), source: escape(q.source) });
    }
    if (req.method === "POST" && url.pathname === "/api/label") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const entry = JSON.parse(body);
      const q = queue[Number(entry.i)];
      if (!q || q.textId !== entry.textId) return send(res, 409, { error: "the unit and its textId do not match" });
      return send(res, 200, store.add(by, { ...entry, guide: guide(), snapshot }));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`${queue.length} texts to label. Open http://127.0.0.1:${PORT}/?by=owner`);
});
