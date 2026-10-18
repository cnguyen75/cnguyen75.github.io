// Test helper for tests/test_lately.py: loads the watching and lifting pages from BASE with
// data/lately.json answered by FIXTURE, runs ACTIONS, and prints what the rankings (under
// "What's happening" on lately/watching/) and the lift tiles (lately/lifting/) show.
//   node tests/lately_render.js <base-url> <fixture.json> <width>
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../tools/node_modules/playwright-core"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base, fixture, width] = process.argv.slice(2);
const RANKINGS = '.ld-feed[data-block="watching.rankings"]';
const LIFTS = '.ld-feed[data-block="lifting.lifts"]';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const body = fs.readFileSync(fixture, "utf8");
    async function open(pagePath, waitFor) {
      const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
      await page.route("**/data/lately.json*", r => r.fulfill({ status: 200, contentType: "application/json", body }));
      await page.goto(base + "/" + pagePath, { timeout: 90000 });
      // Generous: a loaded machine can take well over 30 s to draw the page (the old default).
      await page.waitForSelector(waitFor, { timeout: 90000 });
      return page;
    }
    const facts = page => page.evaluate(([RANKINGS, LIFTS]) => {
      const visible = el => !!el && el.offsetParent !== null;
      return {
        scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rankings: [...document.querySelectorAll(RANKINGS + " .ranking")].map(r => {
          const b = r.querySelector("button.ranking-more");
          return {
            visible: [...r.querySelectorAll("li")].filter(visible).map(li => li.querySelector(".item-rank").textContent),
            button: b && { text: b.textContent, expanded: b.getAttribute("aria-expanded"), controls: b.getAttribute("aria-controls") === r.querySelector("ol").id },
          };
        }),
        rankingsSection: (() => { const s = document.querySelector(RANKINGS); return s ? [s.closest(".ld-group").id, s.closest(".ld-section").id] : null; })(),
        lifts: [...document.querySelectorAll(LIFTS + " .lift")].map(l => ({
          best: l.querySelector(".lift-best").textContent,
          bestSet: (l.querySelector(".lift-best-set") || {}).textContent || null,
          handTag: (l.querySelector(".lift-best-set .tag") || {}).textContent || null,
          setUnderBest: !!l.querySelector(".lift-best-set") &&
            l.querySelector(".lift-best-set").getBoundingClientRect().top >= l.querySelector(".lift-best > span").getBoundingClientRect().bottom - 1,
          few: (l.querySelector(".lift-few") || {}).textContent || null,
          chart: !!l.querySelector(".line-chart"),
          toggle: !!l.querySelector(".table-toggle"),
        })),
      };
    }, [RANKINGS, LIFTS]);
    const watching = await open("lately/watching/", RANKINGS + " .ranking");
    const lifting = await open("lately/lifting/", LIFTS + " .lift");
    const before = Object.assign(await facts(watching), { lifts: (await facts(lifting)).lifts, liftsScrollX: (await facts(lifting)).scrollX });
    // Keyboard: tab to the first "show all" button and press Enter, then Space to close.
    const btn = watching.locator(RANKINGS + " button.ranking-more").first();
    await btn.focus();
    await watching.keyboard.press("Enter");
    const opened = await facts(watching);
    const focused = await watching.evaluate(() => document.activeElement.className);
    await watching.keyboard.press("Space");
    const closed = await facts(watching);
    process.stdout.write(JSON.stringify({ before, opened, closed, focused }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
