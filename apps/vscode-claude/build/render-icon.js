/**
 * icon.svg -> icon.png, at the size the Marketplace and the Extensions list want.
 *
 * Rendered with the browser that is already here for the tests rather than by adding an
 * image toolchain to a repository that has one dependency. The same engine that draws it
 * in the editor draws it here, which is the point: what comes out is what a person sees.
 *
 *   node build/render-icon.js            icon.png, 128x128
 *   node build/render-icon.js --preview  also a sheet at 128/64/32/16 on both grounds,
 *                                        for looking at before deciding it is finished
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const HERE = path.resolve(__dirname, "..");
const SVG = path.join(HERE, "icon.svg");
const PNG = path.join(HERE, "icon.png");
// generated, and gitignored: something to look at, not something to keep
const SHEET = path.join(HERE, "icon-preview.png");

(async () => {
  const svg = fs.readFileSync(SVG, "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 },
                                         deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>html,body{margin:0;padding:0;width:128px;height:128px;overflow:hidden}
              svg{display:block}</style>${svg}`);
    await page.screenshot({ path: PNG });
    console.log("wrote icon.png  (128x128, " + fs.statSync(PNG).size + " bytes)");

    if (process.argv.includes("--preview")) {
      // every size it will actually be seen at, on both grounds it will be seen against
      const sizes = [128, 64, 32, 16];
      const cell = (bg) => sizes.map((s) =>
        `<div style="background:${bg};padding:14px;display:flex;align-items:center">
           <div style="width:${s}px;height:${s}px">${svg
             .replace('width="128"', `width="${s}"`).replace('height="128"', `height="${s}"`)}</div>
         </div>`).join("");
      const sheet = await browser.newPage({ viewport: { width: 520, height: 210 } });
      await sheet.setContent(
        `<!doctype html><meta charset="utf-8">
         <style>html,body{margin:0;font:12px system-ui}
                .row{display:flex;align-items:center}
                .lbl{width:70px;padding-left:10px;color:#666}</style>
         <div class="row"><div class="lbl">on dark</div>${cell("#1F1F1F")}</div>
         <div class="row"><div class="lbl">on light</div>${cell("#F3F3F3")}</div>
         <div class="row"><div class="lbl">sizes</div>
           ${sizes.map((s) => `<div style="padding:14px;width:${s}px;text-align:center;color:#888">${s}</div>`).join("")}
         </div>`);
      await sheet.screenshot({ path: SHEET });
      console.log("wrote icon-preview.png - look at it before calling this done");
    }
  } finally {
    await browser.close();
  }
})();
