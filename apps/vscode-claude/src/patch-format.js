/**
 * The shape of the block we append to Claude Code's bundle, in one place, because
 * three separate pieces of code have to agree on it exactly: the patcher, the
 * uninstall hook, and the tests.
 *
 * TWO THINGS MAKE THE BLOCK SAFE TO LEAVE BEHIND
 *
 * It is appended at the end and marked, so the original is everything before the
 * marker: removing it is a truncation and needs nothing kept anywhere.
 *
 * And it carries an expiry. VS Code gives an extension no working way to clean up
 * after itself when it is uninstalled - `vscode:uninstall` has been broken since
 * 1.69 and `onDidChange` does not fire for your own removal, by design. So the
 * block does not rely on anyone coming back for it: past its date it returns
 * immediately and does nothing at all. While the extension is installed, every
 * activation re-stamps it, so in use it never expires.
 *
 * That does not make an uninstall instant - it makes it certain, and bounded. The
 * difference is worth being honest about.
 */
const path = require("node:path");

const BEGIN = "/* ==== smart-rtl-direction patch BEGIN ==== */";
const MARK = "\n" + BEGIN;
const STAMP = /var EXPIRES_AT = (\d+);/;

/** How long a block stays alive without being re-stamped. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Re-stamp once less than this is left, so an active editor never runs it close. */
const REFRESH_BELOW_MS = 12 * 60 * 60 * 1000;

/**
 * How often a running editor winds the clock.
 *
 * The two numbers above assume somebody comes back before the block dies. For a long
 * time the only thing that ever came back was activation - and activation happens once
 * per window. A window left open for a day and a half let the block expire underneath
 * it: the panel already on screen carried on, because the expiry is read once when the
 * payload loads, but the next panel opened got nothing at all.
 *
 * This is the thing that comes back. It is far shorter than REFRESH_BELOW_MS on
 * purpose - several of these can be missed outright, a laptop asleep being the ordinary
 * way, and the block is still re-stamped with half a day in hand.
 */
const STAMP_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * The file as it was before we ever touched it.
 *
 * The block is searched for WITH the newline that separates it from the bundle,
 * because that newline is ours. Looking for the marker alone and then guessing
 * whether to drop a newline gets it wrong by one byte, which is exactly the kind
 * of "nearly" this is meant not to be.
 */
function stripPatch(content) {
  const at = content.indexOf(MARK);
  if (at !== -1) return content.slice(0, at);
  const bare = content.indexOf(BEGIN);      // written before the newline was ours
  return bare === -1 ? content : content.slice(0, bare);
}

/** @returns {number} the block's expiry in ms, or 0 if there is no block */
function readExpiry(content) {
  const at = content.indexOf(BEGIN);
  if (at === -1) return 0;
  const m = STAMP.exec(content.slice(at));
  return m ? Number(m[1]) : 0;
}

/** @returns {string} the payload with its expiry set */
function stampExpiry(payload, now) {
  if (!STAMP.test(payload)) throw new Error("payload has no EXPIRES_AT slot to stamp");
  return payload.replace(STAMP, "var EXPIRES_AT = " + (now + WINDOW_MS) + ";");
}

/**
 * Write somebody else's file so that nobody ever reads half of it.
 *
 * Claude Code's bundle is about five megabytes, and it is read by every panel that
 * loads. Written in place, there is a moment when it is truncated and only partly
 * rewritten - and a panel loading in that moment (a second window opening, a reload)
 * gets a broken bundle: not our fix missing, Claude Code itself failing to start. Rare,
 * and the most expensive thing this extension could ever do.
 *
 * So the new content goes into a file beside it, and is then renamed over the old one,
 * which the file system does in one step: a reader sees the old file or the new one,
 * never a part of either.
 *
 * AND THEN THE PROMISE WAS MEASURED, AND IT WAS NOT BEING KEPT
 *
 * The rename was allowed to fail back to writing in place - "never worse than the past",
 * which was true and was not the point. Put to three processes writing a five-megabyte
 * file while a fourth read it: THIRTY-SIX renames out of thirty-six refused, every write
 * done in place, and ten of the reader's reads caught the file half written - 2,596,864
 * bytes of 5,200,000. On Windows a rename over a destination ANY process has open fails
 * with EPERM, and the one process certain to have this file open is the Claude Code panel
 * that is loading it. The single most expensive thing this extension can do was reachable
 * through the very fallback written to make it safe.
 *
 * So a refusal that means "somebody has it open" is now waited out rather than given in
 * to: a handle on a file being read is held for a moment, and half a second of trying
 * outlasts it. If it is STILL held after that, the bundle is left exactly as it is and
 * this says so. Not applying the fix for another minute is a disappointment; a bundle
 * torn in half is a Claude Code that will not start.
 *
 * A rename refused for a reason that will never come right - a filesystem that cannot do
 * one at all - still falls back to writing in place, because there it is the only road
 * there is and waiting would not help.
 *
 * The file beside it is always cleaned up.
 *
 * @returns {boolean} false only when the bundle was held open and is unchanged
 */
const TMP_SUFFIX = ".smartrtl-tmp";

/**
 * The name of the file beside it - and why it carries a process id.
 *
 * It used to be one name for everybody: index.js.smartrtl-tmp. Two VS Code windows are
 * ordinary and three are ordinary, and every one of them activates at the same moment -
 * when the editor starts, and again the moment this extension is updated, which is the
 * one time a write is certain. All of them would then write the SAME file beside the
 * bundle: each one's clean-up deleting a file another was still writing, and each one's
 * rename landing on a file another had just renamed away. On Windows a rename refused
 * that way falls back to writing five megabytes IN PLACE, from two processes at once -
 * which is precisely the torn bundle this whole function exists to prevent, and its cost
 * is not a missing fix but a Claude Code that will not start.
 *
 * A process id makes the file this process's own. Nobody else writes it, nobody else
 * deletes it, and the rename still puts the finished thing over the bundle in one step.
 */
function tempFor(file) { return file + TMP_SUFFIX + "." + process.pid; }

/**
 * And the other half of giving each write its own name: clearing up after the dead.
 *
 * A write that never finished - the machine lost power, the window was killed - leaves
 * five megabytes of ours in somebody else's folder with nothing ever coming back for it,
 * because the process it belonged to is gone. So each write clears up any temporary file
 * shaped like one of ours and old enough that no live write could still be holding it.
 * A minute is an age for one writeFileSync, and no time at all next to a file left over
 * from a previous session.
 */
const STALE_AFTER_MS = 60 * 1000;
function clearStaleTemps(fs, file) {
  try {
    const dir = path.dirname(file);
    const mine = path.basename(file) + TMP_SUFFIX + ".";
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      if (name.indexOf(mine) !== 0) continue;
      const full = path.join(dir, name);
      try {
        if (now - fs.statSync(full).mtimeMs < STALE_AFTER_MS) continue;   // somebody may still be writing it
        fs.unlinkSync(full);
      } catch (e) { /* in use, or gone between the two calls: leave it */ }
    }
  } catch (e) { /* not our folder to insist on */ }
}

/* "Somebody has it open just now", as the three operating systems say it. Anything else -
   a filesystem that cannot rename, a path that has gone - is not something waiting fixes. */
const HELD_OPEN = { EPERM: 1, EACCES: 1, EBUSY: 1 };
const RENAME_TRIES = 20;
const RENAME_WAIT_MS = 25;            // twenty of these is half a second

/* A wait with nothing running in it. This is the extension host's thread, so the wait has
   to be short - and it is: it only ever happens while somebody is reading the bundle. */
function pause(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) {}
}

function writeWhole(fs, file, content) {
  const tmp = tempFor(file);
  let done = false;
  try {
    fs.writeFileSync(tmp, content, "utf8");
    for (let go = 0; !done; go++) {
      try { fs.renameSync(tmp, file); done = true; }
      catch (e) {
        if (!HELD_OPEN[e && e.code]) {
          // it will never come right by waiting: this filesystem cannot do the rename at
          // all, and writing in place is the only road there is
          fs.writeFileSync(file, content, "utf8");
          done = true;
        } else if (go >= RENAME_TRIES) {
          break;                      // still held: the bundle is left exactly as it is
        } else {
          pause(RENAME_WAIT_MS);
        }
      }
    }
  } catch (e) {
    /* the temporary file could not even be written. In place is not attempted here
       either: if a five-megabyte file cannot be created beside it, the same write is not
       going to go better on top of the one Claude Code loads. */
    done = false;
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e) {}
    clearStaleTemps(fs, file);
  }
  return done;
}

module.exports = { BEGIN, MARK, WINDOW_MS, REFRESH_BELOW_MS, STAMP_EVERY_MS, TMP_SUFFIX,
                   STALE_AFTER_MS, RENAME_TRIES, RENAME_WAIT_MS,
                   tempFor, stripPatch, readExpiry, stampExpiry, writeWhole };
