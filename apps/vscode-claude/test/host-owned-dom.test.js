/**
 * The one rule the old harness never modelled: the mirror's children belong to React.
 *
 * test/composer.test.js builds the box you type into out of a plain listener -
 *
 *   input.addEventListener("input", () => { mirror.textContent = input.textContent })
 *
 * - which keeps no reference to anything it created, so nothing we do to those nodes
 * can ever be noticed. The real webview is React. Read out of its own bundle:
 *
 *   T("div",{ref:z5,className:i6.mentionMirror,"aria-hidden":"true",children:[n5,e1?D("span",...):null]})
 *
 * where n5 is either the whole text as a string, or an array of strings and
 * <span class=inputMentionChip> elements - one per @mention or misspelled word.
 * React holds a fiber for each of those nodes and, on the next commit, calls
 * `mirror.removeChild(node)` / `mirror.insertBefore(node, before)` with them. Those
 * throw NotFoundError if the node is no longer a child of the mirror, and a throw in
 * React's commit phase with no error boundary above it unmounts the whole tree.
 *
 * The mirror is the only layer you can see - the box you type into is color:#0000,
 * caret-color only. So a dead mirror is a box that types blank spaces.
 *
 * These two tests state that rule directly rather than chasing the symptom:
 *   1. every node the host made is still exactly where the host left it
 *   2. the host can do its own next update without throwing
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("./support/page.js");

/**
 * The composer, with a mirror rendered the way react-dom renders it.
 *
 * It keeps the nodes it creates, updates text through nodeValue, and removes and
 * inserts through the parent - which is the whole of react-dom's contract with the
 * DOM, and the whole of what a third party can break.
 */
const REACT_BOX = [
  '<div class="messageInputContainer_x">',
  '  <div class="mentionMirror_x" aria-hidden="true"></div>',
  '  <div class="messageInput_x" contenteditable="plaintext-only"></div>',
  '</div>',
  '<script>',
  '(function () {',
  '  var mirror = document.querySelector(".mentionMirror_x");',
  '  var input = document.querySelector(".messageInput_x");',
  '  var owned = [];',
  '  window.__owned = owned;',
  '  window.__hostThrew = null;',
  '',
  '  // the real component: one string, unless an @mention splits it into parts',
  '  function segments(text) {',
  '    var out = [], re = /@[^\s]+/g, at = 0, m;',
  '    while ((m = re.exec(text))) {',
  '      if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });',
  '      out.push({ kind: "chip", text: m[0] });',
  '      at = m.index + m[0].length;',
  '    }',
  '    if (at < text.length || !out.length) out.push({ kind: "text", text: text.slice(at) });',
  '    return out;',
  '  }',
  '',
  '  window.__render = function (text) {',
  '    var next = segments(text), i = 0;',
  '    for (; i < next.length && i < owned.length; i++) if (owned[i].kind !== next[i].kind) break;',
  '    try {',
  '      for (var d = owned.length - 1; d >= i; d--) { mirror.removeChild(owned[d].node); owned.pop(); }',
  '      for (var u = 0; u < i; u++) {',
  '        if (owned[u].text === next[u].text) continue;',
  '        if (owned[u].kind === "text") owned[u].node.nodeValue = next[u].text;',
  '        else owned[u].node.textContent = next[u].text;',
  '        owned[u].text = next[u].text;',
  '      }',
  '      for (var a = i; a < next.length; a++) {',
  '        var node;',
  '        if (next[a].kind === "text") node = document.createTextNode(next[a].text);',
  '        else { node = document.createElement("span"); node.className = "inputMentionChip_x"; node.textContent = next[a].text; }',
  '        mirror.appendChild(node);',
  '        owned.push({ node: node, kind: next[a].kind, text: next[a].text });',
  '      }',
  '    } catch (err) { window.__hostThrew = String(err); throw err; }',
  '  };',
  '  input.addEventListener("input", function () { window.__render(input.textContent); });',
  '  window.__render("");',
  '})();',
  '</script>'
].join("\n");

async function type(page, lines) {
  await page.click(".messageInput_x");
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(lines[i], { delay: 3 });
  }
  await page.waitForTimeout(200);
}

/** Is every node the host created still a direct child of the mirror, unreplaced? */
const ownedStillThere = (page) => page.evaluate(() => {
  const mirror = document.querySelector(".mentionMirror_x");
  return window.__owned.map((o) => ({
    kind: o.kind,
    attached: o.node.parentNode === mirror,
    text: (o.node.textContent || "").slice(0, 20)
  }));
});

test("nothing the host put in the mirror is moved, replaced or thrown away", async () => {
  const { page, close } = await open(REACT_BOX);
  try {
    await type(page, ["salam دنیا", "second line"]);
    const owned = await ownedStillThere(page);
    assert.ok(owned.length > 0, "the host rendered something to begin with");
    for (const o of owned) {
      assert.ok(o.attached,
        `a ${o.kind} node the host owns (${JSON.stringify(o.text)}) is no longer its child`);
    }
  } finally { await close(); }
});

test("the host can still update its own mirror after we have been through it", async () => {
  // Typing an @mention is what turns the mirror's children from one string into a
  // list, which is the update react-dom performs with removeChild and insertBefore.
  const { page, close } = await open(REACT_BOX);
  try {
    await type(page, ["دیکھیں @src/engine.js کو"]);
    const threw = await page.evaluate(() => window.__hostThrew);
    assert.equal(threw, null, "the host's own update threw: " + threw);
  } finally { await close(); }
});

test("what you type stays visible in the layer that shows it", async () => {
  // The box you type into is transparent - the mirror is the only thing a reader
  // sees. If it stops matching the text, the box types blank spaces.
  const { page, close } = await open(REACT_BOX);
  try {
    await type(page, ["اسلام علیکم", "hello there"]);
    const shown = await page.$eval(".mentionMirror_x", (el) => el.textContent);
    assert.equal(shown, "اسلام علیکم\nhello there");
  } finally { await close(); }
});
