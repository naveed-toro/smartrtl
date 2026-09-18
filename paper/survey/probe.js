// Bidi survey - probe.js
// Paste into the browser console (or run as page JavaScript) on an AI chat page, AFTER the
// test answer has finished streaming. It changes nothing on the page. It finds every test
// case in the page and reports how the page is directing it. Copy the JSON it returns.
(() => {
  const CASES = {
    T1: "useMemo اور useCallback",
    T2: "Debounce بمقابلہ Throttle",
    T3: "React ایک لائبریری ہے",
    T4: "In Urdu this idea is called ایونٹ لوپ",
    T5: "جب حساب مہنگا ہو",
    T6: "The call stack runs first",
    T7: "یہ فنکشن React میں استعمال ہوتا ہے",
    T8: "Python هي لغة برمجة سهلة التعلم",
    T9: "This line is plain English"
  };
  const tagOf = (e) => e.tagName.toLowerCase();
  const out = [];
  for (const [id, needle] of Object.entries(CASES)) {
    const all = [...document.querySelectorAll("body *")].filter((e) => e.textContent && e.textContent.includes(needle));
    const deepest = all.filter((e) => ![...e.children].some((c) => c.textContent.includes(needle)));
    deepest.forEach((e, i) => {
      const cs = getComputedStyle(e);
      let a = e, nearestDir = null;
      while (a && a !== document.documentElement) {
        if (a.hasAttribute("dir")) { nearestDir = tagOf(a) + '[dir="' + a.getAttribute("dir") + '"]' + (a === e ? " (itself)" : ""); break; }
        a = a.parentElement;
      }
      const chain = [];
      a = e;
      for (let k = 0; a && k < 8; k++, a = a.parentElement) {
        const u = getComputedStyle(a).unicodeBidi;
        if (u !== "normal") chain.push(tagOf(a) + ":" + u);
      }
      out.push({
        case: id, match: (i + 1) + "/" + deepest.length, tag: tagOf(e),
        direction: cs.direction, textAlign: cs.textAlign, unicodeBidi: cs.unicodeBidi,
        nearestDir: nearestDir || "none", unicodeBidiUpTheTree: chain.join(" < ") || "normal",
        inInputBox: !!e.closest("[contenteditable='true'],[contenteditable='plaintext-only'],textarea"),
        text: e.textContent.trim().slice(0, 60)
      });
    });
    if (!deepest.length) out.push({ case: id, match: "not found" });
  }
  console.table(out);
  return JSON.stringify({ url: location.hostname, at: new Date().toISOString(), userAgent: navigator.userAgent, results: out }, null, 1);
})();
