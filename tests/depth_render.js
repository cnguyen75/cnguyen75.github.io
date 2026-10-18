// Test helper for tests/test_lately_depth.py: loads PAGE from BASE with data/lately.json answered
// by FIXTURE, and prints what the page shows as JSON.
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
    // The main page is drawn once every panel has its link; a feed page once a slot or the missing note is in.
    await page.waitForFunction(() => document.getElementById("lately")
      ? document.querySelectorAll("#lately .panel .ld-more").length >= 5
      : document.querySelector(".ld-stat .ld-blocks, .ld-missing:not([hidden]), .ld-feed:not([hidden]) > *"), null, { timeout: 90000 });
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
        toc: [...document.querySelectorAll(".ld-toc-group")].map(g => ({ group: g.dataset.group, hidden: g.hidden,
          links: [...g.querySelectorAll("a")].map(a => [a.getAttribute("href"), txt(a), a.parentNode.hidden]) })),
        groups: [...document.querySelectorAll(".ld-group")].map(g => ({ id: g.id, title: txt(g.querySelector(".ld-group-title")), hidden: g.hidden,
          sections: [...g.querySelectorAll(".ld-section")].map(s => s.id) })),
        feeds: [...document.querySelectorAll(".ld-feed")].map(f => ({ block: f.dataset.block, hidden: f.hidden, text: txt(f),
          charts: f.querySelectorAll(".chart-block, .line-chart, .stack-chart, .heat").length,
          lists: [...f.querySelectorAll(".list-title")].map(txt) })),
        attributions: [...document.querySelectorAll(".ld-attributions:not([hidden])")].map(p => ({ text: txt(p), links: [...p.querySelectorAll("a")].map(a => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]) })),
        attribution: [...document.querySelectorAll(".ld-attribution")].map(p => ({ source: p.dataset.whenSource, hidden: p.hidden, text: txt(p),
          link: p.querySelector("a") ? [p.querySelector("a").getAttribute("href"), p.querySelector("a").getAttribute("target"), p.querySelector("a").getAttribute("rel")] : null })),
        places: [...document.querySelectorAll('.ld-feed[data-block="eating.recent"] .list-items--places .list-item')].map(li =>
          [txt(li.querySelector(".item-name")), txt(li.querySelector(".item-score")), txt(li.querySelector(".item-meta"))]),
        watchingEmpty: txt(document.querySelector('.ld-feed[data-block="watching.hours"] .panel-empty')),
        links: [...document.querySelectorAll("a[href]")].map(a => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]),
        headline: [...document.querySelectorAll(".ld-headline .stat")].map(s => [txt(s.querySelector(".stat-label")), txt(s.querySelector(".stat-value"))]),
        sections: [...document.querySelectorAll(".ld-section")].map(sec => ({
          id: sec.id, title: txt(sec.querySelector("h3")), hidden: sec.hidden, group: sec.parentNode.id,
          notes: [...sec.querySelectorAll(".ld-section-note")].map(txt),
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
              quadTitles: [...b.querySelectorAll(".quad-dot[title]")].map(d => d.getAttribute("title")),
              quadLabels: [...b.querySelectorAll(".quad-label")].filter(e => e.offsetParent !== null).map(txt),
              quadKey: [...b.querySelectorAll(".quad-key li")].filter(e => e.offsetParent !== null).map(txt),
              quadOthers: b.querySelectorAll(".quad-dot--other").length,
              quadTrails: b.querySelectorAll(".quad-trail").length,
            })),
            hows: [...slot.querySelectorAll(":scope > .ld-how")].map(txt),
            howFont: slot.querySelector(".ld-how") ? getComputedStyle(slot.querySelector(".ld-how")).fontFamily : null,
          })),
        })),
        board: (() => {
          const b = document.querySelector(".tier-board");
          if (!b) return null;
          return {
            tabs: [...b.querySelectorAll(".tier-tab")].map(txt),
            pressed: (b.querySelector('.tier-tab[aria-pressed="true"]') || {}).dataset ? b.querySelector('.tier-tab[aria-pressed="true"]').dataset.type : null,
            rows: [...b.querySelectorAll(".tier-row")].map(r => ({
              tier: r.dataset.tier, chips: r.querySelectorAll(".tier-chip").length, collapsed: r.classList.contains("tier-row--collapsed"),
              more: txt(r.querySelector(".tier-more")), summary: txt(r.querySelector(".tier-summary")),
              hover: [...r.querySelectorAll(".tier-chip")].map(c => c.getAttribute("title")), years: [...r.querySelectorAll(".tier-chip-year")].map(txt),
            })),
          };
        })(),
        aliases: [...document.querySelectorAll(".ld-alias")].map(e => [e.id, e.dataset.to]),
        squares: [...document.querySelectorAll(".results .result")].map(e => ({
          letter: e.textContent, bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderTopStyle })),
        recordParts: [...document.querySelectorAll(".ld-record-bar > span")].map(e => ({
          cls: e.className, bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderTopStyle })),
        panels: [...document.querySelectorAll("#lately .panel")].map(p => ({
          id: p.id,
          title: txt(p.querySelector(".panel-head h3")),
          meta: txt(p.querySelector(".panel-meta")),
          metaFont: p.querySelector(".panel-meta") ? getComputedStyle(p.querySelector(".panel-meta")).fontFamily : null,
          question: txt(p.querySelector(".panel-question")),
          questionWeight: p.querySelector(".panel-question") ? getComputedStyle(p.querySelector(".panel-question")).fontWeight : null,
          answer: txt(p.querySelector(".panel-answer")),
          headline: [...p.querySelectorAll(".ld-stats .stat")].map(s => [txt(s.querySelector(".stat-label")), txt(s.querySelector(".stat-value")), txt(s.querySelector(".stat-note"))]),
          wait: txt(p.querySelector(".panel-wait")),
          charts: [...p.querySelectorAll(".chart-block")].filter(c => !c.parentNode.closest(".chart-block")).length,
          quadTitles: [...p.querySelectorAll(".quad-dot[title]")].map(d => d.getAttribute("title")),
          quadCorners: [...p.querySelectorAll(".quad-corner")].map(txt),
          quadOthers: p.querySelectorAll(".quad-dot--other").length,
          quadMine: [...p.querySelectorAll(".quad-label")].filter(e => e.offsetParent !== null).map(txt),
          quadNums: [...p.querySelectorAll(".quad-num")].filter(e => e.offsetParent !== null).map(txt),
          quadKey: [...p.querySelectorAll(".quad-key li")].filter(e => e.offsetParent !== null).map(txt),
          legend: txt(p.querySelector(".ld-legend, .chart-foot")),
          legendAll: [...p.querySelectorAll(".ld-legend, .chart-foot, .ld-n")].map(txt).join(" | "),
          tierRows: p.querySelectorAll(".ld-bars--tier .ld-bar-row:not(.ld-range-axis)").length,
          effectRows: p.querySelectorAll(".ld-bars--effects .ld-bar-row").length,
          effectUnclear: p.querySelectorAll(".ld-bars--effects .ld-bar-row--unclear").length,
          effectValues: [...p.querySelectorAll(".ld-bars--effects .ld-bar-value")].map(txt),
          kmCurves: p.querySelectorAll(".km-step").length,
          kmMedians: p.querySelectorAll(".km-median-label").length,
          tierTitles: [...p.querySelectorAll(".ld-bars--tier .ld-bar-row[title]")].map(e => e.getAttribute("title")),
          empty: txt(p.querySelector(".panel-empty")),
          more: p.querySelector(".ld-more") ? [p.querySelector(".ld-more").getAttribute("href"), txt(p.querySelector(".ld-more"))] : null,
          removed: p.querySelectorAll(".teams, .lift, .list, .rankings, .vol-chart, .heat, .stack-chart, .bar-list--wide").length,
        })),
        panelOrder: [...document.querySelectorAll("#lately .panel, #lately .panel-grid")].filter(e => e.parentNode.id === "lately").map(e =>
          e.classList.contains("panel-grid") ? [...e.querySelectorAll(".panel")].map(p => p.id) : e.id),
        latelyHeight: document.getElementById("lately") ? Math.round(document.getElementById("lately").getBoundingClientRect().height) : null,
        pageHeight: de.scrollHeight,
        bodyText: document.body.innerText,
        titles: [...document.querySelectorAll("[title]")].map(e => e.getAttribute("title")),
      };
    });
    facts.errors = errors;
    process.stdout.write(JSON.stringify(facts));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
