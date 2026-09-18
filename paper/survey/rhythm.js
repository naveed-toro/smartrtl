// Bidi survey - rhythm.js
// How does a real AI chat put its answer on the screen? Paste into the console of a chat page
// (or of Claude Code's panel: "Developer: Open Webview Developer Tools") JUST BEFORE sending a
// message that gets a long answer. It changes nothing on the page. On every painted frame it
// measures how much text the page gained - net, so a renderer that rebuilds its blocks is not
// counted twice - which is what a reader actually sees arrive, frame by frame. It stops after
// 120 s, or when you run  window.__rhythmReport() , and prints JSON to copy. It records only
// counts and times, never the text.
(() => {
  const EDITABLE = "[contenteditable='true'],[contenteditable='plaintext-only'],textarea,input";
  const length = () => {
    let n = document.body.textContent.length;
    for (const e of document.querySelectorAll(EDITABLE)) n -= (e.textContent || "").length;
    return n;
  };
  const start = performance.now();
  const frames = [];
  let previous = length(), last = start, running = true;
  function frame(now) {
    if (!running) return;
    const current = length();
    if (current > previous) {
      frames.push({ ms: Math.round(now - start), chars: current - previous, sinceLast: Math.round(now - last) });
      last = now;
    }
    previous = current;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__rhythmReport = () => {
    running = false;
    const sizes = frames.map((f) => f.chars).sort((a, b) => a - b);
    const gaps = frames.slice(1).map((f) => f.sinceLast).sort((a, b) => a - b);
    const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
    const report = {
      page: location.hostname || "webview", at: new Date().toISOString(), userAgent: navigator.userAgent,
      framesWithText: frames.length, totalChars: sizes.reduce((a, b) => a + b, 0),
      // how fast the answer came, start to end of the text arriving - what the lab's delay is set from
      charsPerSecond: frames.length > 1 ? Math.round(sizes.reduce((a, b) => a + b, 0) / ((frames[frames.length - 1].ms - frames[0].ms) / 1000)) : null,
      charsPerFrame: { median: q(sizes, 0.5), p10: q(sizes, 0.1), p90: q(sizes, 0.9) },
      msBetweenFrames: { median: q(gaps, 0.5), p10: q(gaps, 0.1), p90: q(gaps, 0.9) },
      frames
    };
    console.log(JSON.stringify(report));
    return JSON.stringify(report);
  };
  setTimeout(() => { if (running) window.__rhythmReport(); }, 120000);
  console.log("rhythm recording for 120 s - send your message now");
})();
