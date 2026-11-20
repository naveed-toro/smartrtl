// SmartRTL, inside the Claude desktop app's main process.
//
// patch.js puts this file beside the app's own entry and loads it first. Its main job:
// when a page from claude.ai (or claude.com) is ready, it hands that page the payload - the
// shared rule and engine, and the claude.ai adapter. Nothing else in the app is touched,
// and any failure here leaves the app exactly as it would have been without us.
//
// A few seconds after, it asks the page how the engine is doing and writes the answer to
// %LOCALAPPDATA%\SmartRTL\status-<page>.json - how anyone can see what happened without
// opening the app's developer tools, which it does not allow.
//
// It also says which Claude this is. The copy runs with the installed app's own package
// identity, so Windows would put both on one taskbar button with one icon, and both windows
// are titled "Claude". The copy's windows get a taskbar button of their own with Claude's icon
// marked in its corner (icon.js), and "(SmartRTL)" after their titles and the tray tooltip.
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

  // Which Claude this is. Its own try: a copy that cannot mark itself still sets direction.
  try {
    const { Tray, nativeImage } = require("electron");
    const MARK = " (SmartRTL)";
    const marked = (text) => {
      const title = String(text || app.getName());
      return title.endsWith(MARK) ? title : title + MARK;
    };
    let button = null;   // set below, before any window exists

    // Claude announces its first window a second time, so a window can arrive here twice.
    const seen = new WeakSet();
    app.on("browser-window-created", (_e, win) => {
      if (seen.has(win)) return;
      seen.add(win);
      const setTitle = win.setTitle.bind(win);
      win.setTitle = (title) => setTitle(marked(title));
      win.setTitle(win.getTitle());
      if (button) {
        win.setAppDetails(button.details);
        win.setIcon(button.icon);
      }
    });

    // Only Claude's own tray icon, whose tooltip is the app's name.
    const setToolTip = Tray.prototype.setToolTip;
    Tray.prototype.setToolTip = function (text) {
      return setToolTip.call(this, text === app.getName() ? marked(text) : text);
    };

    // A taskbar button of their own needs the marked icon patch.js built beside claude.exe.
    // Without it the windows stay on Claude's button: a button of their own with Claude's
    // plain icon would be harder to tell apart, not easier.
    const copy = path.dirname(process.execPath);
    const icon = nativeImage.createFromPath(path.join(copy, "smartrtl-icon.png"));
    if (!icon.isEmpty()) {
      const { relaunch } = JSON.parse(fs.readFileSync(path.join(copy, "smartrtl-patched.json"), "utf8"));
      button = {
        icon,
        details: {
          appId: "SmartRTL.Claude",
          appIconPath: path.join(copy, "smartrtl-icon.ico"),
          relaunchCommand: relaunch,   // a pinned button opens the copy through launch.ps1
          relaunchDisplayName: marked(app.getName()),
        },
      };
    }
  } catch (e) { /* the copy works the same, only unmarked */ }
} catch (e) { /* never stand between Claude and its own start */ }
