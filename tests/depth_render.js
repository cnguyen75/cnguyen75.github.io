// Test helper for tests/test_lately_depth.py: loads PAGE from BASE at WIDTH with
// data/lately.json answered by FIXTURE, and prints what the page shows as JSON.
//   node tests/depth_render.js <base-url> <page> <fixture.json> <width>
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../tools/node_modules/playwright-core"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base, pagePath, fixture, width] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "warning" || m.type() === "error") errors.push(m.text()); });
    const body = fs.readFileSync(fixture, "utf8");
    await page.route("**/data/lately.json*", r => r.fulfill({ status: 200, contentType: "application/json", body }));
    await page.goto(base + "/" + pagePath, { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector(".ld-stat .ld-blocks, .ld-missing:not([hidden]), #panel-lifting .ld-more"), null, { timeout: 90000 });
    const facts = await page.evaluate(() => {
      const txt = e => (e ? e.textContent.replace(/\s+/g, " ").trim() : null);
      const de = document.documentElement;
      return {
        scrollX: de.scrollWidth - de.clientWidth,
        title: txt(document.querySelector("h1")),
        source: txt(document.querySelector(".ld-source")),
        sourceLinks: [...document.querySelectorAll(".ld-source a")].map(a => [a.textContent, a.href]),
        missing: !!document.querySelector(".ld-missing:not([hidden])"),
        lede: txt(document.querySelector(".ld-lede")),
        waiting: txt(document.querySelector(".ld-waiting:not([hidden])")),
        hiddenSections: [...document.querySelectorAll(".ld-section[hidden]")].map(sec => sec.id),
        hiddenToc: [...document.querySelectorAll(".ld-toc li[hidden] a")].map(a => a.getAttribute("href")),
        places: [...document.querySelectorAll("#panel-eating .list-items--places .list-item")].map(li =>
          [txt(li.querySelector(".item-name")), txt(li.querySelector(".item-score")), txt(li.querySelector(".item-meta"))]),
        watchingEmpty: txt(document.querySelector("#panel-watching .panel-empty")),
        links: [...document.querySelectorAll("a[href]")].map(a => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]),
        headline: [...document.querySelectorAll(".ld-headline .stat")].map(s => [txt(s.querySelector(".stat-label")), txt(s.querySelector(".stat-value"))]),
        sections: [...document.querySelectorAll(".ld-section")].map(sec => ({
          id: sec.id, title: txt(sec.querySelector("h2")), hidden: sec.hidden,
          slots: [...sec.querySelectorAll(".ld-stat")].map(slot => ({
            stat: slot.dataset.stat, hidden: slot.hidden,
            blocks: [...slot.querySelectorAll(".ld-block")].map(b => ({
              title: txt(b.querySelector(".ld-block-title")), status: b.dataset.status,
              value: txt(b.querySelector(".ld-value-num")), interval: txt(b.querySelector(".ld-interval")),
              n: txt(b.querySelector(".ld-n")), wait: txt(b.querySelector(".ld-wait")), note: txt(b.querySelector(".ld-note")),
              charts: b.querySelectorAll(".ld-chart, table, .meter, .ld-records, .ld-facts").length,
              lines: b.querySelectorAll(":scope > p").length, text: txt(b),
              rows: b.querySelectorAll("table tbody tr").length,
              cells: [...b.querySelectorAll("table tbody tr")].map(tr => [...tr.children].map(td => txt(td))),
            })),
            hows: [...slot.querySelectorAll(":scope > .ld-how")].map(txt),
            howFont: slot.querySelector(".ld-how") ? getComputedStyle(slot.querySelector(".ld-how")).fontFamily : null,
          })),
        })),
        squares: [...document.querySelectorAll(".ld-margins .result")].map(e => ({
          letter: e.textContent, bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderTopStyle })),
        recordParts: [...document.querySelectorAll(".ld-record-bar > span")].map(e => ({
          cls: e.className, bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderTopStyle })),
        panels: [...document.querySelectorAll("#lately .panel")].map(p => ({
          id: p.id,
          headline: [...p.querySelectorAll(".ld-stats .stat")].map(s => [txt(s.querySelector(".stat-label")), txt(s.querySelector(".stat-value"))]),
          more: p.querySelector(".ld-more") ? p.querySelector(".ld-more").getAttribute("href") : null,
        })),
        bodyText: document.body.innerText,
      };
    });
    facts.errors = errors;
    process.stdout.write(JSON.stringify(facts));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
