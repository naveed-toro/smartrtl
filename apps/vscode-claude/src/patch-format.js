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
const BEGIN = "/* ==== smart-rtl-direction patch BEGIN ==== */";
const MARK = "\n" + BEGIN;
const STAMP = /var EXPIRES_AT = (\d+);/;

/** How long a block stays alive without being re-stamped. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Re-stamp once less than this is left, so an active editor never runs it close. */
const REFRESH_BELOW_MS = 12 * 60 * 60 * 1000;

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

module.exports = { BEGIN, MARK, WINDOW_MS, REFRESH_BELOW_MS, stripPatch, readExpiry, stampExpiry };
