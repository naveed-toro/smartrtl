// SmartRTL, inside the Claude desktop app's main process.
//
// patch.js puts this file beside the app's own entry and loads it first. It does one thing:
// when a page from claude.ai (or claude.com) is ready, it hands that page the payload - the
// shared rule and engine, and the claude.ai adapter. Nothing else in the app is touched,
// and any failure here leaves the app exactly as it would have been without us.
//
// A few seconds after, it asks the page how the engine is doing and writes the answer to
// %LOCALAPPDATA%\SmartRTL\status-<page>.json - how anyone can see what happened without
// opening the app's developer tools, which it does not allow.
"use strict";
try {
  const { app } = require("electron");
  const fs = require("fs");
  const path = require("path");

  // Claude's links (claude://) belong to the installed app. Left alone, the copy registers
  // them to itself on every start, and from then on Windows hands every Claude link - and
  // the installed app's own hand-offs - to the copy. The copy never claims them.
  app.setAsDefaultProtocolClient = () => true;

  const payload = fs.readFileSync(path.join(__dirname, "smartrtl-payload.js"), "utf8");
  const logDir = path.join(process.env.LOCALAPPDATA || app.getPath("temp"), "SmartRTL");

  const ours = (url) => {
    try {
      const h = new URL(url).hostname;
      return h === "claude.ai" || h.endsWith(".claude.ai") || h === "claude.com" || h.endsWith(".claude.com");
    } catch (e) { return false; }
  };

  const report = (wc, after) => setTimeout(() => {
    if (wc.isDestroyed()) return;
    wc.executeJavaScript("window.__bidiStatus ? window.__bidiStatus() : null", true).then((status) => {
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(path.join(logDir, `status-${wc.id}.json`),
        JSON.stringify({ at: new Date().toISOString(), status }, null, 1));
    }).catch(() => {});
  }, after);

  const reporting = new WeakSet();
  app.on("web-contents-created", (_e, wc) => {
    wc.on("dom-ready", () => {
      if (!ours(wc.getURL())) return;
      wc.executeJavaScript(payload, true).then(() => {
        // claude.ai changes chats without reloading, so one report at load would only ever
        // describe the first chat. Every 20 seconds, for as long as the page lives.
        report(wc, 15000);
        if (reporting.has(wc)) return;   // a reload of the same page: its timer is running
        reporting.add(wc);
        const every = setInterval(() => (wc.isDestroyed() ? clearInterval(every) : report(wc, 0)), 20000);
      }).catch(() => {});
    });
  });
} catch (e) { /* never stand between Claude and its own start */ }
