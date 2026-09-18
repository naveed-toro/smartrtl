// One machine-written answer, in Markdown, becomes the units a browser gives a direction to
// on its own: headings, paragraphs, list items, table cells, and the paragraphs of a
// quotation. Parsed to the CommonMark and GitHub Flavored Markdown specifications - no one
// product's renderer - so the corpus describes the text, not an app.
//
// A unit's `text` is what a reader sees: link text without its address, inline code
// without its backticks, emphasis without its asterisks. Its `source` is the Markdown it
// came from. Every unit keeps where it sits (which list, which table, which row), so how a
// list or a whole answer takes its direction from its parts can be measured on the same
// data as each part alone.

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { firstStrong, strongCounts, strongSwitches } from "./bidi.mjs";

function seen(node) {
  switch (node.type) {
    case "text": case "inlineCode": return node.value;
    case "break": return "\n";
    case "image": case "imageReference": return node.alt || "";
    case "html": return ""; // inline tags are not visible text
    case "footnoteReference": return "[" + node.label + "]";
    default: return (node.children || []).map(seen).join("");
  }
}

// The same, without inline code: what some formulas count as the prose of a line.
function proseOf(node) {
  if (node.type === "inlineCode") return " ";
  if (node.type === "text") return node.value;
  if (node.type === "break") return "\n";
  if (node.type === "image" || node.type === "imageReference" || node.type === "html") return " ";
  return (node.children || []).map(proseOf).join("");
}

function describe(text) {
  const { ltr, rtl } = strongCounts(text);
  return { firstStrong: firstStrong(text), ltr, rtl, switches: strongSwitches(text) };
}

/**
 * @param {string} markdown one answer
 * @returns {Array<object>} its units, in reading order
 */
export function toUnits(markdown) {
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const units = [];
  let groups = 0;

  function add(kind, node, where, extra) {
    const text = seen(node);
    // A table cell's own position includes the pipes around it; its source is what is
    // between them.
    const span = node.type === "tableCell"
      ? (node.children.length ? [node.children[0].position.start.offset, node.children.at(-1).position.end.offset] : [0, 0])
      : [node.position.start.offset, node.position.end.offset];
    const source = markdown.slice(span[0], span[1]);
    units.push({ n: units.length, kind, ...extra, where, text, prose: proseOf(node), source, ...describe(text) });
  }

  function walk(node, where) {
    switch (node.type) {
      case "root":
        node.children.forEach((c) => walk(c, where));
        return;
      case "heading":
        add("heading", node, where, { depth: node.depth });
        return;
      case "paragraph":
        add("paragraph", node, where);
        return;
      case "blockquote": {
        const inner = [...where, { blockquote: ++groups }];
        node.children.forEach((c) => walk(c, inner));
        return;
      }
      case "list": {
        const id = ++groups;
        node.children.forEach((item, i) => {
          const inner = [...where, { list: id, ordered: !!node.ordered, item: i }];
          let first = true;
          for (const c of item.children) {
            if (c.type === "paragraph") {
              add(first ? "list-item" : "list-item-paragraph", c, inner, item.checked == null ? {} : { checked: item.checked });
              first = false;
            } else walk(c, inner);
          }
        });
        return;
      }
      case "table": {
        const id = ++groups;
        node.children.forEach((row, r) => row.children.forEach((cell, c) =>
          add("table-cell", cell, [...where, { table: id, row: r, column: c, header: r === 0 }])));
        return;
      }
      case "code":
        // Recorded so an answer's shape is complete; never labelled - nobody asks which
        // direction a fenced code block reads in.
        units.push({ n: units.length, kind: "code-block", where, lang: node.lang || null,
          lines: node.value.split("\n").length });
        return;
      case "html":
        units.push({ n: units.length, kind: "html", where });
        return;
      case "thematicBreak": case "definition": case "footnoteDefinition": case "yaml":
        return;
      default:
        units.push({ n: units.length, kind: "unhandled:" + node.type, where });
    }
  }

  walk(tree, []);
  return units;
}
