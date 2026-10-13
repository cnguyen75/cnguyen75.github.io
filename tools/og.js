#!/usr/bin/env node
/*
 * Optional developer tool: renders each track page's social preview card,
 * a 1200x630 PNG, into its content folder (content/<tracks|drafts>/<slug>/og.png).
 * build.py copies the card to the built page when the file exists and falls
 * back to the main page's image when it doesn't; it never runs this script.
 *
 *   cd tools && npm install          # once: playwright-core, no browser download
 *   node tools/og.js                 # every content file
 *   node tools/og.js coding-agent-operations paper-trader   # just these slugs
 *   python3 build.py                 # then rebuild
 *
 * It drives an installed Chrome. Set CHROME to its executable if it is not at
 * the macOS default path.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = new Set(process.argv.slice(2));

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function frontMatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${file}: no front matter`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return meta;
}

// The side label for a track number, as on the main page ("side a. athena").
function sideOf(indexHtml, number) {
  let side = "";
  for (const m of indexHtml.matchAll(/<h2 class="side-label" id="\w+-label">([^<]+)<\/h2>|<span class="track-no">(\d\d)<\/span>/g)) {
    if (m[1]) side = m[1];
    else if (m[2] === number) return side.split(",")[0];
  }
  throw new Error(`track ${number} is not on the main page`);
}

function card(meta, side) {
  const no = meta.track.padStart(2, "0");
  const titleSize = meta.title.length > 34 ? 62 : 76;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${path.join(ROOT, "css", "site.css")}">
<style>
body { margin: 0; width: 1200px; height: 630px; background: var(--paper); display: flex; }
.card { margin: 56px; flex: 1; background: var(--card); box-shadow: 0 2px 10px rgba(35, 31, 27, 0.14);
  padding: 56px 64px; display: flex; flex-direction: column; gap: 22px; }
.kicker { font-family: var(--font-label); font-size: 26px; font-weight: 700; color: var(--teal); }
.heading { display: flex; gap: 30px; align-items: baseline; }
.no { font-family: var(--font-label); font-size: 76px; line-height: 1; color: var(--text-3); }
.title { margin: 0; font-size: ${titleSize}px; line-height: 1.04; font-weight: 700; letter-spacing: -0.02em; }
.lede { margin: 0; font-size: 29px; line-height: 1.35; color: var(--text-2); max-width: 960px; }
.site { margin-top: auto; font-family: var(--font-label); font-size: 24px; font-weight: 700; }
</style></head><body><div class="card">
<div class="kicker">${esc(side)} · track ${no}</div>
<div class="heading"><span class="no">${no}</span><h1 class="title">${esc(meta.title)}</h1></div>
<p class="lede">${esc(meta.one_line)}</p>
<div class="site">colin nguyen</div>
</div></body></html>`;
}

(async () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const browser = await chromium.launch({ executablePath: CHROME });
  const tmp = path.join(ROOT, "tools", ".og-card.html");
  try {
    for (const folder of ["tracks", "drafts"]) {
      const dir = path.join(ROOT, "content", folder);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort()) {
        const meta = frontMatter(fs.readFileSync(path.join(dir, file), "utf8"), file);
        if (only.size && !only.has(meta.slug)) continue;
        fs.writeFileSync(tmp, card(meta, sideOf(indexHtml, meta.track.padStart(2, "0"))));
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
        await page.goto("file://" + tmp, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const out = path.join(dir, meta.slug, "og.png");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out });
        await page.close();
        console.log(path.relative(ROOT, out));
      }
    }
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    await browser.close();
  }
})().catch(err => {
  console.error("og.js:", err.message);
  process.exit(1);
});
