/**
 * SmartRTL for Claude Code - extension entry point.
 *
 * TWO JOBS, AND THE SECOND ONE IS THE AWKWARD ONE
 *
 * The first is keeping the fix in place. An update to Claude Code replaces its
 * webview bundle and the fix goes with it, so this watches for that in two
 * independent ways - on activation, and on `extensions.onDidChange`. Both would
 * have to miss for the fix to stay gone. Nothing polls.
 *
 * The second is telling the truth about state. VS Code's own Disable and Uninstall
 * buttons do NOT undo this extension, because it edits a file that belongs to
 * somebody else and the editor has no idea we touched it - `vscode:uninstall` has
 * been broken since 1.69 and nothing fires when you are disabled. A user who
 * presses Disable and sees the fix still working has been misled, and that is on
 * us, not on them.
 *
 * So the state is made visible and controllable in the three places a person
 * actually looks:
 *
 *   - a real on/off pair of commands, only the applicable one ever shown
 *   - the same commands in the Extensions view context menu, right beside
 *     Uninstall and Disable, where the misunderstanding happens
 *   - a small status bar item while Claude Code is open, and only then
 *
 * Off is remembered. Turning it off and reloading leaves it off, or the switch
 * would be a lie too.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const patcher = require("./patcher.js");
const fmt = require("./patch-format.js");

const ON_KEY = "smartrtl.on";          // remembered across restarts
const CONTEXT_KEY = "smartrtl.active"; // drives which command is offered
const OFF_AT_KEY = "smartrtl.offAtVersion";   // which build was running when it was turned off
const RAN_KEY = "smartrtl.hasRun";     // set once we have activated at least once
const MARKER = ".smartrtl-installed";  // lives in our own folder, so it dies with it

/* Said in three places, and it has to end with what it means for the reader rather than
   with what is true: "not installed" on its own leaves somebody asking "and?". */
const NO_CLAUDE_CODE = "Claude Code is not installed, so there is nothing to fix.";

/* And the case that used to be told the same thing: Claude Code IS installed, but the
   file its panel loads from is not where it has always been. Saying "not installed" to
   somebody looking at Claude Code sends them looking for a fault on their own machine.
   What is true is that an update changed something this build does not know about. */
const UNRECOGNIZED = "Claude Code has changed how its panel loads, so the fix cannot reach it until SmartRTL is updated.";
const noTarget = () => (patcher.claudeCodeInstalled() ? UNRECOGNIZED : NO_CLAUDE_CODE);

/* How often the winding is CONSIDERED. Cheap on purpose - almost every one of these
   is a comparison of two numbers in memory and nothing more. What it guards is
   fmt.STAMP_EVERY_MS, which is the interval that actually reaches the disk. */
const WIND_CHECK_MS = 30 * 60 * 1000;

let log, status;
let lastSeen = null;                   // { dir, version } of the Claude Code we last patched
let stampedAt = 0;                     // when the block was last written or checked - from memory

const wantedOn = (ctx) => ctx.globalState.get(ON_KEY, true);
const version = (ctx) => (ctx.extension && ctx.extension.packageJSON && ctx.extension.packageJSON.version) || "?";

/**
 * Is this copy newly installed?
 *
 * Nothing in the API answers that, so it is read from the one asymmetry the editor
 * leaves us: global state OUTLIVES an uninstall and the extension's own folder does
 * not. So a marker goes in the folder, and the fact that we have run goes in global
 * state. Afterwards the two can disagree in exactly one way - we have run before, and
 * yet the folder is bare - and that way is a reinstall.
 *
 * Version numbers were the first attempt and ask the wrong question: reinstalling the
 * SAME build is the case this exists for, and no comparison of versions can see it.
 *
 * If the marker cannot be written - a read-only or remote install - this answers false
 * forever rather than true forever. A prompt that never comes is a disappointment; one
 * that returns at every startup is a fault.
 *
 * @returns {boolean} true only when this copy was installed after a previous one left
 */
function freshInstall(ctx) {
  const ranBefore = ctx.globalState.get(RAN_KEY, false);
  const mark = path.join(ctx.extensionPath, MARKER);

  let marked = false, wrote = false;
  try { marked = fs.existsSync(mark); } catch (err) {}
  if (!marked) { try { fs.writeFileSync(mark, ""); wrote = true; } catch (err) {} }

  ctx.globalState.update(RAN_KEY, true);
  return ranBefore && !marked && wrote;
}

/**
 * Off is remembered, and that remembering survives an uninstall - VS Code keeps an
 * extension's global state and hands it back when it is installed again. Which means
 * somebody can follow this extension's own advice (turn the fix off before removing
 * it), install it again months later, and get an extension that does nothing at all
 * and says nothing about why. We wrote that trap ourselves.
 *
 * Guessing their intent from the version number would be worse. So it asks - once, at
 * either of the two moments that mean anything: a build that is not the one they turned
 * off, or a fresh install, arriving to find the fix off. Going to the trouble of
 * installing this again is itself most of an answer, and that reinstall is usually of
 * the very same build - where a version comparison sees nothing at all.
 */
function askIfStillOff(ctx, fresh) {
  if (wantedOn(ctx)) return;
  if (!fresh && ctx.globalState.get(OFF_AT_KEY) === version(ctx)) return;   // same build, already answered

  vscode.window.showInformationMessage(
    "SmartRTL is installed, but the right-to-left fix is off.",
    "Turn it on", "Keep it off"
  ).then((choice) => {
    if (choice === "Turn it on") turnOn(ctx);
    else if (choice === "Keep it off") ctx.globalState.update(OFF_AT_KEY, version(ctx));
  });
}

function offerReload(message) {
  vscode.window.showInformationMessage(message, "Reload Window").then((choice) => {
    if (choice === "Reload Window") vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

/* ------------------------------------------------------------------ *
 * Showing what is true
 * ------------------------------------------------------------------ */

/**
 * Is Claude Code the thing you are looking at right now?
 *
 * The ACTIVE tab, not merely an open one. A Claude Code tab left open in the
 * background is not a reason to put anything in somebody's status bar - the
 * point of hiding it is that it stays out of the way until it is relevant.
 *
 * @returns {boolean|null} null when it cannot be established
 */
function claudeCodeFocused() {
  try {
    const groups = vscode.window.tabGroups;
    if (!groups) return null;
    const tab = groups.activeTabGroup && groups.activeTabGroup.activeTab;
    if (!tab) return false;
    const input = tab.input;
    return !!(input && typeof input === "object" && "viewType" in input &&
              String(input.viewType).toLowerCase().includes("claude"));
  } catch (err) { return null; }
}

/* What patcher.state() last said, and when.

   refresh() runs on every tab change, every tab-group change and every editor change - and
   each call read the last 512KB of Claude Code's bundle off the disk, measured at 13ms.
   Switching between two files paid it twice.

   Nothing but this extension changes that file, so the answer only goes stale when WE change
   it, or when Claude Code itself is replaced - and both of those clear this by hand. The
   short life is a safety net for the one case neither covers: somebody editing the file
   themselves. */
let lastState = null, lastStateAt = 0;
const STATE_GOOD_FOR_MS = 30 * 1000;

function forgetState() { lastState = null; }

function currentState() {
  if (lastState && Date.now() - lastStateAt < STATE_GOOD_FOR_MS) return lastState;
  lastState = patcher.state();
  lastStateAt = Date.now();
  return lastState;
}

function refresh() {
  const st = currentState();

  // The commands act on what is in the file; the status bar reports whether the fix is
  // actually doing anything. Once a block can be present and expired at the same time
  // those are two different questions, so they are answered from two different fields.
  vscode.commands.executeCommand("setContext", CONTEXT_KEY, st.present);

  // Only while you are actually looking at Claude Code. There was a setting for this
  // once, offering "always" and "never" as well. Neither earned its place. "Always"
  // puts a mark in the corner of windows that have nothing to do with Claude Code, and
  // "never" hides the one thing in the whole editor that tells the truth about this -
  // its own description had to warn people off choosing it, which is a setting
  // admitting it should not exist.
  if (claudeCodeFocused() !== true) { status.hide(); return; }

  /* $(whole-word) had to go: that glyph is Find's "match whole word" toggle, so it
     already meant something else to everybody who uses Ctrl+F, and at 16px it was two
     letters and an underline. A tick and a slashed circle say which of two states this
     is, and say it from the corner of an eye.

     The words stayed, and one build was spent finding that out. Dropping them reads
     well as an argument - the marks survive a blur and the words do not - but a blur
     is not how anybody uses this. Somebody who has stopped and looked at the corner of
     their screen is trying to be told something, and at that moment a word beats a
     symbol they have to decode. The mark is for the glance; the word is for the look.

     A screen reader can do neither, so it is handed a sentence below. */
  const on = st.live;
  // Three marks, not two. "Off" is a state somebody chose; with no Claude Code in the
  // editor there is nothing to have chosen, and saying "off" there sends a person
  // looking for a switch they turned. It gets its own mark and no on/off word at all -
  // and so does the day an update moves Claude Code's panel somewhere this build does
  // not know, which is nobody's switch either.
  const unreachable = !st.installed || st.recognized === false;
  status.text = unreachable ? "$(warning) RTL"
              : on          ? "$(check) RTL on"
                            : "$(circle-slash) RTL off";
  status.accessibilityInformation = {
    label: !st.installed              ? "Claude Code is not installed"
         : st.recognized === false    ? "Claude Code has changed, and the fix cannot reach it"
         : on                         ? "Right-to-left fix is on"
                                      : "Right-to-left fix is off"
  };
  status.tooltip = new vscode.MarkdownString(whyItSays(st));
  status.command = unreachable ? "smartrtl.status" : on ? "smartrtl.turnOff" : "smartrtl.turnOn";
  status.show();
}

/**
 * Labels, not sentences - and never more than one idea to a line.
 *
 * Three builds went into this. First five explanations, one per situation. Then three
 * short sentences. Both were prose, and prose in a tooltip has to be READ, which is the
 * one thing the person hovering has not agreed to do: their hand is already on the mouse
 * and they want the answer in the time it takes to look at it.
 *
 * So the first line is what the click does. Nothing else - the state is already spelled
 * out on the bar beside it, so repeating it here would be a second copy of something on
 * screen.
 *
 * The second line exists for one fact and only in the one state where it is true. VS
 * Code's own Uninstall does not undo this, because the file being edited belongs to
 * somebody else and the editor has no idea it was touched. Nobody guesses that. It is on
 * its own line rather than tacked onto the first, because two ideas sharing a line is how
 * a label turns back into a sentence.
 */
function whyItSays(st) {
  if (st.live) {
    return "Turn off the right-to-left fix\n\nUninstalling does not turn it off";
  }
  if (!st.installed) return "Claude Code is not installed";
  // installed, and an update moved its panel somewhere this build does not know: no
  // switch would help, so none is offered - just what happened, and what fixes it
  if (st.recognized === false) return "Claude Code has changed\n\nThe fix is waiting for an update";
  return "Turn on the right-to-left fix";
}

/* ------------------------------------------------------------------ *
 * Doing it
 * ------------------------------------------------------------------ */

function turnOn(ctx) {
  ctx.globalState.update(ON_KEY, true);
  ctx.globalState.update(OFF_AT_KEY, undefined);
  const result = patcher.apply(ctx.extensionPath);
  forgetState();
  refresh();
  if (result.state === "no-target") { vscode.window.showWarningMessage(noTarget()); return; }

  // One answer, because it is true however much or little apply() had to do: the fix is
  // in place now. There used to be a second one here - "already on" - for the case where
  // nothing needed doing. Nothing can reach it: the command is only offered while the
  // fix is off, in the palette, in the Extensions menu and on the status bar alike. It
  // was also wrong when it did fire, telling somebody who had just clicked a bar reading
  // "RTL off" that it was already on. Both problems went with the branch.
  offerReload(`Right-to-left text in Claude Code ${result.install.version} is fixed. Reload to see it.`);
}

function turnOff(ctx) {
  ctx.globalState.update(ON_KEY, false);
  ctx.globalState.update(OFF_AT_KEY, version(ctx));
  const result = patcher.remove();
  forgetState();
  refresh();
  if (result.state === "no-target") { vscode.window.showWarningMessage(noTarget()); return; }

  // Same again: true whether there was a block to take out or not, and the "already off"
  // branch that used to be here could not be reached either.
  offerReload("Right-to-left fix is off and Claude Code is back to normal. Reload to see it.");
}

/**
 * Wind the clock, if it needs winding.
 *
 * The disk is never asked how much time is left: the last stamp is remembered here, so
 * the ordinary answer costs one comparison. Only every fmt.STAMP_EVERY_MS does anything
 * touch Claude Code's folder at all.
 */
function keepAlive(ctx, why) {
  if (Date.now() - stampedAt < fmt.STAMP_EVERY_MS) return;
  syncQuietly(ctx, why);
}

/** Startup, and after a Claude Code update. Silent unless something needs a reload. */
function syncQuietly(ctx, why) {
  if (!wantedOn(ctx)) { log.appendLine(`[${why}] turned off by the user`); refresh(); return; }

  // Whether right-to-left text was ACTUALLY being fixed a moment ago is the only thing
  // that decides whether a reload is worth asking for. apply() answers a narrower
  // question - did the file change - and a block whose stamp has run out is still in the
  // file, so it answers "restamped" while the panel on screen runs a dead copy.
  const before = currentState();
  let result;
  try { result = patcher.apply(ctx.extensionPath); }
  catch (err) {
    // Whatever the bar is showing now, it is no longer the truth. Say so.
    log.appendLine(`[${why}] failed: ${err && err.message ? err.message : err}`);
    forgetState();
    refresh();
    return;
  }

  if (result.install) lastSeen = { dir: result.install.dir, version: result.install.version };
  if (result.state !== "no-target") stampedAt = Date.now();
  forgetState();                       // we have just been the thing that could change it
  log.appendLine(`[${why}] ${result.state}${result.install ? ` (Claude Code ${result.install.version})` : ""}`);
  refresh();

  if (result.state === "no-target") return;

  // The version is Claude Code's, not ours, and it is here because it names the thing
  // that was worked on. A notification toast does not show which extension is speaking,
  // so without it somebody who has just installed three things is told that something,
  // somewhere, is fixed.
  const v = result.install ? result.install.version : "";
  // Two reasons to ask for a reload, and 0.5.0 was installed with only the first:
  //
  //   nothing was running      - the fix was not live a moment ago
  //   a DIFFERENT fix was      - apply() wrote a new block over an older one. The panel
  //                              already on screen read the file when it loaded, so it is
  //                              still running the older block from memory, and will until
  //                              it reloads.
  //
  // The second is every upgrade of this extension. Asking only "was it live" answered yes
  // - the OLD one was - and the person was told it was fixed, with no reload offered,
  // while the panel in front of them went on running the build it replaced.
  if (!before.live || result.state === "applied") {
    offerReload(why === "extensions-changed"
      ? `Claude Code updated to ${v}. Right-to-left text is fixed again. Reload to see it.`
      : `Right-to-left text in Claude Code ${v} is fixed. Reload to see it.`);
  } else if (why === "installed") {
    // It was already working, so there is nothing to reload for - but somebody who has
    // just installed something is owed an answer either way. Silence after a deliberate
    // act reads as "did that do anything?", and this extension is silent by design the
    // rest of the time, so there is nothing else for them to go on.
    vscode.window.showInformationMessage(`Right-to-left text in Claude Code ${v} is fixed.`);
  }
}

function activate(context) {
  log = vscode.window.createOutputChannel("SmartRTL");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(log, status);

  context.subscriptions.push(
    vscode.commands.registerCommand("smartrtl.turnOn", () => turnOn(context)),
    vscode.commands.registerCommand("smartrtl.turnOff", () => turnOff(context)),
    vscode.commands.registerCommand("smartrtl.status", () => {
      const install = patcher.findClaudeCode();
      if (!install) {
        vscode.window.showWarningMessage(noTarget());
        return;
      }
      // A report, not a notice. Nobody runs "Show status" by accident, so the answer can
      // carry the build it is about - the first thing anybody is asked for afterwards.
      vscode.window.showInformationMessage(patcher.isPatched()
        ? `Right-to-left fix is on in Claude Code ${install.version}.`
        : `Right-to-left fix is off. Claude Code ${install.version} is untouched.`);
    })
  );

  /* ------------------------------------------------------------------
     A link that works like a button.

     `command:` URIs do not run from an extension's README - the editor only
     allows them in webviews that opt in, in trusted MarkdownStrings, and in
     hovers. A `vscode://` link is the one remaining candidate: the editor
     resolves it to whichever extension registered the authority, so a plain
     Markdown link can reach us. Whether the README renderer lets that scheme
     through is the open question, and one click answers it.
  ------------------------------------------------------------------ */
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri) {
        const what = String(uri.path || "").replace(/^\/+/, "").toLowerCase();
        if (what === "off") turnOff(context);
        else if (what === "on") turnOn(context);
        else vscode.commands.executeCommand("smartrtl.status");
      }
    })
  );

  // chance one: Claude Code was updated while the editor was closed
  // Asked once, because asking writes the marker that answers it. An upgrade lands in a
  // new folder, so this is true for a re-install and for every update, and false for an
  // ordinary window opening.
  const installed = freshInstall(context);

  syncQuietly(context, installed ? "installed" : "startup");

  /* And the case none of the chances below covers: this window simply stays open.
     The block dies 24 hours after its last stamp, and until now activation was the
     only thing that ever re-stamped it - which happens once per window. Two days of
     ordinary work therefore let it expire quietly underneath, and because the expiry
     is read once as the payload loads, the panel already on screen carried on while
     the next one opened got nothing. Something has to come back; this is it. */
  const wind = setInterval(() => keepAlive(context, "keep-alive"), WIND_CHECK_MS);
  context.subscriptions.push({ dispose: () => clearInterval(wind) });

  // and never sit there silently doing nothing because of a switch flipped long ago
  askIfStillOff(context, installed);

  // chance two: it happens while the editor is open. onDidChange also fires for any
  // other extension being installed, so only act when the copy of Claude Code we are
  // looking at is genuinely a different one.
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const install = patcher.findClaudeCode();
      if (!install) return;
      if (lastSeen && lastSeen.dir === install.dir && lastSeen.version === install.version) return;
      forgetState();                   // a different Claude Code: nothing known about it holds
      syncQuietly(context, "extensions-changed");
    }),
    // the status bar item follows whichever tab you are on - and opening a tab is also
    // the moment a webview is about to load, so it gets a chance to wind the clock too:
    // a machine coming back from sleep wakes with its timers already late
    vscode.window.tabGroups.onDidChangeTabs(() => { keepAlive(context, "tab"); refresh(); }),
    vscode.window.tabGroups.onDidChangeTabGroups(() => refresh()),
    vscode.window.onDidChangeActiveTextEditor(() => refresh())
  );
}

function deactivate() {}

/* freshInstall and askIfStillOff are exported for the tests. Between them they
   decide whether somebody is spoken to at startup, and how often - which is not a
   thing to settle by reading the code and agreeing with yourself. And whyItSays is
   there for the same reason: five situations share one word in the status bar, so
   the only thing keeping them apart is the sentence each one produces. */
module.exports = { activate, deactivate, freshInstall, askIfStillOff, whyItSays };
