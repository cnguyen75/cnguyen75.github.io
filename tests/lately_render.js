// Test helper for tests/test_lately.py: loads the page from BASE with data/lately.json
// answered by FIXTURE, runs ACTIONS, and prints what the rankings and lift tiles show.
//   node tests/lately_render.js <base-url> <fixture.json> <width>
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../tools/node_modules/playwright-core"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base, fixture, width] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
    const body = fs.readFileSync(fixture, "utf8");
    await page.route("**/data/lately.json*", r => r.fulfill({ status: 200, contentType: "application/json", body }));
    await page.goto(base + "/index.html");
    await page.waitForSelector("#panel-lifting .lift");
    const facts = page => page.evaluate(() => {
      const visible = el => !!el && el.offsetParent !== null;
      return {
        scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rankings: [...document.querySelectorAll("#panel-rankings .ranking")].map(r => {
          const b = r.querySelector("button.ranking-more");
          return {
            visible: [...r.querySelectorAll("li")].filter(visible).map(li => li.querySelector(".item-rank").textContent),
            button: b && { text: b.textContent, expanded: b.getAttribute("aria-expanded"), controls: b.getAttribute("aria-controls") === r.querySelector("ol").id },
          };
        }),
        lifts: [...document.querySelectorAll("#panel-lifting .lift")].map(l => ({
          best: l.querySelector(".lift-best").textContent,
          bestSet: (l.querySelector(".lift-best-set") || {}).textContent || null,
          setUnderBest: !!l.querySelector(".lift-best-set") &&
            l.querySelector(".lift-best-set").getBoundingClientRect().top >= l.querySelector(".lift-best > span").getBoundingClientRect().bottom - 1,
          few: (l.querySelector(".lift-few") || {}).textContent || null,
          chart: !!l.querySelector(".line-chart"),
          toggle: !!l.querySelector(".table-toggle"),
        })),
      };
    });
    const before = await facts(page);
    // Keyboard: tab to the first "show all" button and press Enter, then Space to close.
    const btn = page.locator("#panel-rankings button.ranking-more").first();
    await btn.focus();
    await page.keyboard.press("Enter");
    const opened = await facts(page);
    const focused = await page.evaluate(() => document.activeElement.className);
    await page.keyboard.press("Space");
    const closed = await facts(page);
    process.stdout.write(JSON.stringify({ before, opened, closed, focused }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
