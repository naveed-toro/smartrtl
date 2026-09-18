// Bidi survey - watch.js
// Paste into the console on an AI chat page JUST BEFORE sending the test message. For the
// next 90 seconds it looks at the page every 50 ms and records, for each test case, the
// direction the reader sees while the answer streams - and every time it changes. It changes
// nothing on the page. When done (or earlier, by running  window.__bidiWatchReport() ) it
// prints the JSON to copy.
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
  // A case is matched from its first two words, so it is found while it is still arriving.
  const PREFIX = Object.fromEntries(Object.entries(CASES).map(([k, v]) => [k, v.split(" ").slice(0, 2).join(" ")]));
  const start = performance.now();
  const seen = {}, node = {};
  const inBox = (e) => !!e.closest("[contenteditable='true'],[contenteditable='plaintext-only'],textarea");
  function look() {
    const t = Math.round(performance.now() - start);
    for (const [id, needle] of Object.entries(PREFIX)) {
      const all = [...document.querySelectorAll("body *")].filter((e) => !inBox(e) && e.textContent && e.textContent.includes(needle));
      const deepest = all.filter((e) => ![...e.children].some((c) => c.textContent.includes(needle)));
      const e = deepest[deepest.length - 1]; // the latest: the answer, after the sent message
      if (!e) continue;
      const d = getComputedStyle(e).direction + " / " + getComputedStyle(e).textAlign;
      const log = (seen[id] = seen[id] || []);
      // A new element (the sent message first, then the answer) starts its own record; only
      // a change on the same element is a change the reader watched happen.
      if (node[id] !== e) { node[id] = e; log.push({ ms: t, element: "new " + e.tagName.toLowerCase(), seen: d, chars: e.textContent.length }); }
      else if (log[log.length - 1].seen !== d) log.push({ ms: t, seen: d, chars: e.textContent.length });
    }
  }
  const timer = setInterval(look, 50);
  window.__bidiWatchReport = () => {
    clearInterval(timer);
    const report = { url: location.hostname, at: new Date().toISOString(), cases: seen,
      changedWhileStreaming: Object.fromEntries(Object.entries(seen).map(([k, v]) => {
        const last = v.map((x) => !!x.element).lastIndexOf(true);
        return [k, v.slice(last + 1).length];
      })) };
    console.log(JSON.stringify(report, null, 1));
    return JSON.stringify(report, null, 1);
  };
  setTimeout(window.__bidiWatchReport, 90000);
  console.log("bidi watch running for 90 s - send the test message now");
})();
