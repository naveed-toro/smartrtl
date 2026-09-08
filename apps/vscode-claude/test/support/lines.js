/**
 * Where a line of text actually ended up, in pixels.
 *
 * Nothing in the box you type into is an element of ours any more - each line is a
 * bidi paragraph the browser worked out for itself from the newlines. So a line is
 * found in the text and measured with a Range, which reports what was laid out
 * rather than what any attribute claims.
 *
 * Shared by the copied page and by the one built from Claude Code's own stylesheet,
 * so both answer the question the same way.
 */
/**
 * Where each line of an element actually sits, in pixels, inside its own padding box.
 *
 * There are no per-line elements to ask any more, so the lines are found in the text
 * and measured with a Range - which reports what the browser laid out, rather than
 * what anything claims about it.
 */
const LINE_BOXES = `(sel) => {
  const el = document.querySelector(sel);
  const cs = getComputedStyle(el), b = el.getBoundingClientRect();
  const left = b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth || 0);
  const right = b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth || 0);

  const nodes = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, at = 0, all = "";
  while ((n = walk.nextNode())) { nodes.push({ n, at }); at += n.nodeValue.length; all += n.nodeValue; }
  const place = (offset) => {
    for (let i = nodes.length - 1; i >= 0; i--) if (offset >= nodes[i].at) return [nodes[i].n, offset - nodes[i].at];
    return [el, 0];
  };
  const rectOf = (from, to) => {
    const r = document.createRange();
    const a = place(from), z = place(to);
    r.setStart(a[0], a[1]); r.setEnd(z[0], z[1]);
    return r.getBoundingClientRect();
  };

  const out = [];
  let start = 0;
  for (const line of all.split("\\n")) {
    if (line.length) {
      const whole = rectOf(start, start + line.length);
      const first = rectOf(start, start + 1);
      out.push({
        text: line.slice(0, 24),
        firstChar: Math.round(first.left - left),
        leftGap: Math.round(whole.left - left),
        rightGap: Math.round(right - whole.right),
        width: Math.round(right - left)
      });
    } else {
      out.push({ text: "", firstChar: null, leftGap: null, rightGap: null, width: Math.round(right - left) });
    }
    start += line.length + 1;
  }
  return out;
}`;

const lineBoxes = (page, sel) => page.evaluate(([s, src]) => eval(src)(s), [sel, LINE_BOXES]);

/**
 * What a reader sees each line do.
 *
 * The side the line's FIRST character came from, because that answers even for a
 * line long enough to fill the box, where both margins are zero and alignment says
 * nothing at all.
 */
async function lineReads(page, sel) {
  const boxes = await lineBoxes(page, sel);
  return boxes.map((b) => (b.firstChar === null ? "-" : b.firstChar > b.width / 2 ? "rtl" : "ltr"));
}

module.exports = { LINE_BOXES, lineBoxes, lineReads };
