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
  const { app, autoUpdater } = require("electron");
  const fs = require("fs");
  const path = require("path");

  // Claude's links (claude://) belong to the installed app. Left alone, the copy registers
  // them to itself on every start, and from then on Windows hands every Claude link - and
  // the installed app's own hand-offs - to the copy. The copy never claims them.
  app.setAsDefaultProtocolClient = () => true;

  const payload = fs.readFileSync(path.join(__dirname, "smartrtl-payload.js"), "utf8");
  const logDir = process.env.SMARTRTL_STATUS_DIRECTORY || path.join(process.env.LOCALAPPDATA || app.getPath("temp"), "SmartRTL");
  const runtime = { at: new Date().toISOString(), version: app.getVersion(),
    exe: process.execPath, windowsStore: !!process.windowsStore,
    userData: app.getPath("userData"), updateEvents: [], originalFilesChanged: false };
  const saveRuntime = () => { try { fs.mkdirSync(logDir, {recursive:true});fs.writeFileSync(path.join(logDir,"claude-native-updates.json"),JSON.stringify(runtime,null,2)); } catch {} };
  for (const event of ["checking-for-update","update-available","update-not-available","update-downloaded","before-quit-for-update","error"]) {
    autoUpdater.on(event, (...args) => {
      runtime.at = new Date().toISOString();
      // No update URL, account data, or chat contents are recorded.
      runtime.updateEvents.push({event,at:runtime.at,...event==="error"?{message:String(args[0]?.message||args[0]||"unknown").slice(0,300)}:{}});
      runtime.updateEvents=runtime.updateEvents.slice(-30);saveRuntime();
    });
  }
  app.whenReady().then(() => {runtime.userData=app.getPath("userData");runtime.ready=true;saveRuntime()});
  saveRuntime();

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
