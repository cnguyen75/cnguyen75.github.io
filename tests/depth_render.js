// Test helper for tests/test_lately_depth.py: loads PAGE from BASE with data/lately.json answered
// by FIXTURE, and prints what the page shows as JSON.
//   node tests/depth_render.js <base-url> <page> <fixture.json> <width>
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../tools/node_modules/playwright-core'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [base, pagePath, fixture, width] = process.argv.slice(2);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    try {
        const page = await browser.newPage({
            viewport: { width: Number(width), height: 900 },
            bypassCSP: true,
        });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'warning' || m.type() === 'error') errors.push(m.text());
        });
        const body = fs.readFileSync(fixture, 'utf8');
        await page.route('**/data/lately.json*', (r) =>
            r.fulfill({ status: 200, contentType: 'application/json', body }),
        );
        await page.goto(base + '/' + pagePath, { timeout: 90000 });
        // The main page is drawn once every panel has content under its header; a feed page once a
        // slot or the missing note is in.
        await page.waitForFunction(
            () =>
                document.querySelector('.lately-updating') ||
                (document.getElementById('lately')
                    ? [...document.querySelectorAll('#lately .panel')].length >= 5 &&
                      [...document.querySelectorAll('#lately .panel')].every(
                          (p) => p.children.length > 1,
                      )
                    : document.querySelector(
                          '.ld-stat .ld-blocks, .ld-missing:not([hidden]), ' +
                              '.ld-feed:not([hidden]) > *',
                      )),
            null,
            { timeout: 90000 },
        );
        // the reading bar re-measures the sections on the next frame
        await page.waitForTimeout(150);
        const facts = await page.evaluate(() => {
            const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
            const de = document.documentElement;
            const holder = document.getElementById('lately') || document.getElementById('main');
            return {
                scrollX: de.scrollWidth - de.clientWidth,
                updating: txt(document.querySelector('.lately-updating')),
                shown: [...holder.children]
                    .filter((c) => c.offsetParent !== null)
                    .map((c) => c.className || c.tagName),
                title: txt(document.querySelector('h1')),
                // The Lately pages are track pages: the data row of "built with" is the source
                // line.
                source: txt(document.querySelector('.tp-built-row--data dd')),
                sourceLinks: [...document.querySelectorAll('.tp-built-row--data a')].map((a) => [
                    a.textContent,
                    a.href,
                ]),
                asof: txt(document.querySelector('.ld-asof:not([hidden]) .ld-asof-date')),
                builtRows: [...document.querySelectorAll('.tp-built-row')].map((r) => [
                    txt(r.querySelector('dt')),
                    txt(r.querySelector('dd')),
                    r.hidden,
                ]),
                missing: !!document.querySelector('.ld-missing:not([hidden])'),
                lede: txt(document.querySelector('.tp-lede')),
                own: txt(document.querySelector('.ld-own')),
                kicker: txt(document.querySelector('.tp-kicker')),
                no: txt(document.querySelector('.tp-no')),
                badge: txt(document.querySelector('.tp-badge')),
                clock: txt(document.querySelector('.tp-clock')),
                player: !!document.querySelector('.tp-player'),
                playText: txt(document.querySelector('.tp-controls:not([hidden]) .tp-play-text')),
                feedsNav: [...document.querySelectorAll('.tp-part.ld-feeds a')].map((a) => [
                    txt(a),
                    a.getAttribute('aria-current'),
                ]),
                other: [...document.querySelectorAll('.tp-other a')].map((a) => [
                    a.className,
                    a.getAttribute('href'),
                    txt(a),
                ]),
                segs: [...document.querySelectorAll('.tp-seg')].map((a) => [
                    a.getAttribute('href'),
                    txt(a.querySelector('.tp-seg-name')),
                    a.hidden,
                    txt(a.querySelector('.tp-seg-time')),
                ]),
                waiting: txt(document.querySelector('.ld-waiting:not([hidden])')),
                hiddenSections: [...document.querySelectorAll('.ld-section[hidden]')].map(
                    (sec) => sec.id,
                ),
                groups: ['whats-happening', 'why'].map((id) => ({
                    id,
                    sections: [...document.querySelectorAll('.ld-section--' + id)].map((s) => s.id),
                })),
                feeds: [...document.querySelectorAll('.ld-feed')].map((f) => ({
                    block: f.dataset.block,
                    hidden: f.hidden,
                    text: txt(f),
                    charts: f.querySelectorAll('.chart, .line-chart, .stack-chart, .heat').length,
                    lists: [...f.querySelectorAll('.list-title')].map(txt),
                })),
                attributions: [...document.querySelectorAll('.ld-attributions:not([hidden])')].map(
                    (p) => ({
                        text: txt(p),
                        links: [...p.querySelectorAll('a')].map((a) => [
                            a.getAttribute('href'),
                            a.getAttribute('target'),
                            a.getAttribute('rel'),
                        ]),
                    }),
                ),
                attribution: [...document.querySelectorAll('.ld-attribution')].map((p) => ({
                    source: p.dataset.whenSource,
                    hidden: p.hidden,
                    text: txt(p),
                    link: p.querySelector('a')
                        ? [
                              p.querySelector('a').getAttribute('href'),
                              p.querySelector('a').getAttribute('target'),
                              p.querySelector('a').getAttribute('rel'),
                          ]
                        : null,
                })),
                places: [
                    ...document.querySelectorAll(
                        '.ld-feed[data-block="eating.recent"] .list-items--places .list-item',
                    ),
                ].map((li) => [
                    txt(li.querySelector('.item-name')),
                    txt(li.querySelector('.item-score')),
                    txt(li.querySelector('.item-meta')),
                ]),
                watchingEmpty: txt(
                    document.querySelector('.ld-feed[data-block="watching.hours"] .panel-empty'),
                ),
                links: [...document.querySelectorAll('a[href]')].map((a) => [
                    a.getAttribute('href'),
                    a.getAttribute('target'),
                    a.getAttribute('rel'),
                ]),
                // The table behind every chart: visually hidden, never display: none, with no
                // toggle.
                srTables: [...document.querySelectorAll('.table.sr-only')].map((t) => [
                    getComputedStyle(t).display !== 'none',
                    getComputedStyle(t).position,
                    t.querySelectorAll('tbody tr').length,
                ]),
                toggles: document.querySelectorAll('.table-toggle').length,
                headline: [...document.querySelectorAll('.ld-headline .stat')].map((s) => [
                    txt(s.querySelector('.stat-label')),
                    txt(s.querySelector('.stat-value')),
                ]),
                sections: [...document.querySelectorAll('.ld-section')].map((sec) => ({
                    id: sec.id,
                    hidden: sec.hidden,
                    group: (sec.className.match(/ld-section--([\w-]+)/) || [])[1],
                    title: [...sec.querySelector('.tp-section-label').childNodes]
                        .filter((n) => n.nodeType === 3)
                        .map((n) => n.textContent)
                        .join('')
                        .trim(),
                    time: txt(sec.querySelector('.tp-label-time')),
                    notes: [...sec.querySelectorAll('.ld-section-note')].map(txt),
                    source: txt(sec.querySelector('.ld-section-source')),
                    sourceFont: sec.querySelector('.ld-section-source')
                        ? getComputedStyle(sec.querySelector('.ld-section-source')).fontFamily
                        : null,
                    slots: [...sec.querySelectorAll('.ld-stat')].map((slot) => ({
                        stat: slot.dataset.stat,
                        hidden: slot.hidden,
                        blocks: [...slot.querySelectorAll('.ld-block')].map((b) => ({
                            title: txt(b.querySelector('.ld-block-title')),
                            status: b.dataset.status,
                            value: txt(b.querySelector('.ld-value-num')),
                            interval: txt(b.querySelector('.ld-interval')),
                            n: txt(b.querySelector('.ld-n')),
                            wait: txt(b.querySelector('.ld-wait')),
                            note: txt(b.querySelector('.ld-note')),
                            tags: [...b.querySelectorAll('.ld-tag')].map(txt),
                            tagRows: [...b.querySelectorAll('.ld-n--row')].map(txt),
                            charts: b.querySelectorAll(
                                '.chart, table, .meter, .ld-records, .ld-facts',
                            ).length,
                            lines: b.querySelectorAll(':scope > p').length,
                            text: txt(b),
                            title: txt(b.querySelector('.ld-block-title')),
                            headlines: b.querySelectorAll('.ld-value:not(.ld-value--line)').length,
                            rows: b.querySelectorAll('table tbody tr').length,
                            hiddenRows: b.querySelectorAll(
                                'table tbody tr[hidden], .bar[hidden], .ld-iv-row[hidden]',
                            ).length,
                            more: [...b.querySelectorAll('.rows-more')].map((x) => [
                                txt(x),
                                x.getAttribute('aria-expanded'),
                                !!document.getElementById(x.getAttribute('aria-controls')),
                            ]),
                            cells: [...b.querySelectorAll('table tbody tr')].map((tr) =>
                                [...tr.children].map((td) => txt(td)),
                            ),
                            quadTitles: [...b.querySelectorAll('.quad-dot[title]')].map((d) =>
                                d.getAttribute('title'),
                            ),
                            quadLabels: [...b.querySelectorAll('.quad-label')]
                                .filter((e) => e.offsetParent !== null)
                                .map(txt),
                            quadKey: [...b.querySelectorAll('.quad-key li')]
                                .filter((e) => e.offsetParent !== null)
                                .map(txt),
                            quadOthers: b.querySelectorAll('.quad-dot--other').length,
                            quadTrails: b.querySelectorAll('.quad-trail').length,
                            quadTrailsShown: [...b.querySelectorAll('.quad-trail')].filter(
                                (x) => getComputedStyle(x).display !== 'none',
                            ).length,
                            quadToggle: txt(b.querySelector('.quad-trails-toggle')),
                            quadTrailsOn: (() => {
                                const t = b.querySelector('.quad-trails-toggle');
                                if (!t) return null;
                                t.click();
                                const n = [...b.querySelectorAll('.quad-trail')].filter(
                                    (x) => getComputedStyle(x).display !== 'none',
                                ).length;
                                t.click();
                                return n;
                            })(),
                            kmBands: b.querySelectorAll('.km-band').length,
                            kmBandsShown: [...b.querySelectorAll('.km-band')].filter(
                                (x) => getComputedStyle(x).display !== 'none',
                            ).length,
                            kmToggle: txt(b.querySelector('.km-bands-toggle')),
                            kmGuide: b.querySelectorAll('.km-guide').length,
                            chartTitles: [...b.querySelectorAll('.chart-title')].map(txt),
                            endLabels: b.querySelectorAll('.line-end-label').length,
                        })),
                        hows: [...slot.querySelectorAll(':scope > .how')].map(
                            (d) => 'how: ' + txt(d.querySelector('.how-text')),
                        ),
                        howOpen: [...slot.querySelectorAll(':scope > .how')].map((d) => d.open),
                        howSummary: [...slot.querySelectorAll(':scope > .how > summary')].map(txt),
                        howFont: slot.querySelector('.how')
                            ? getComputedStyle(slot.querySelector('.how')).fontFamily
                            : null,
                    })),
                })),
                board: (() => {
                    const b = document.querySelector('.tier-board');
                    if (!b) return null;
                    return {
                        tabs: [...b.querySelectorAll('.tab')].map(txt),
                        pressed: (b.querySelector('.tab[aria-pressed="true"]') || {}).dataset
                            ? b.querySelector('.tab[aria-pressed="true"]').dataset.type
                            : null,
                        rows: [...b.querySelectorAll('.tier-row')].map((r) => ({
                            tier: r.dataset.tier,
                            chips: r.querySelectorAll('.tier-chip').length,
                            shown: [...r.querySelectorAll('.tier-chip')].filter((c) => !c.hidden)
                                .length,
                            more: txt(r.querySelector('.tier-more')),
                            moreExpanded: r.querySelector('.tier-more')
                                ? r.querySelector('.tier-more').getAttribute('aria-expanded')
                                : null,
                            summary: txt(r.querySelector('.tier-summary')),
                            hover: [...r.querySelectorAll('.tier-chip')].map((c) =>
                                c.getAttribute('title'),
                            ),
                            years: [...r.querySelectorAll('.tier-chip-year')].map(txt),
                        })),
                    };
                })(),
                aliases: [...document.querySelectorAll('.ld-alias')].map((e) => [
                    e.id,
                    e.dataset.to,
                ]),
                tabSections: [...document.querySelectorAll('.ld-section')].map((s) => ({
                    id: s.id,
                    strips: s.querySelectorAll('.tab-strip').length,
                    pressed: [...s.querySelectorAll('.tab[aria-pressed="true"]')].map(txt),
                    tabs: [...s.querySelectorAll('.tab-strip:first-of-type .tab')].map(txt),
                    panels: s.querySelectorAll('.tab-panel').length,
                    hiddenPanels: s.querySelectorAll('.tab-panel[hidden]').length,
                })),
                hash: location.hash,
                teamLinks: [...document.querySelectorAll('a.team-link')].map((a) => [
                    txt(a),
                    a.getAttribute('href'),
                ]),
                squares: [...document.querySelectorAll('.results .result')].map((e) => ({
                    letter: e.textContent,
                    bg: getComputedStyle(e).backgroundColor,
                    border: getComputedStyle(e).borderTopStyle,
                })),
                recordParts: [...document.querySelectorAll('.ld-record-bar > span')].map((e) => ({
                    cls: e.className,
                    bg: getComputedStyle(e).backgroundColor,
                    border: getComputedStyle(e).borderTopStyle,
                })),
                panels: [...document.querySelectorAll('#lately .panel')].map((p) => ({
                    id: p.id,
                    title: txt(p.querySelector('.panel-head h3')),
                    no: txt(p.querySelector('.panel-head .track-no')),
                    desc: txt(p.querySelector('.panel-head .track-desc')),
                    headChildren: [
                        ...p
                            .querySelector('.panel-head')
                            .querySelectorAll(':scope > *, :scope > .track-body > *'),
                    ].map((e) => e.className),
                    titleLink: !!p.querySelector('.panel-head h3 a'),
                    question: txt(p.querySelector('.panel-question')),
                    questionWeight: p.querySelector('.panel-question')
                        ? getComputedStyle(p.querySelector('.panel-question')).fontWeight
                        : null,
                    answer: txt(p.querySelector('.panel-answer')),
                    headline: [...p.querySelectorAll('.stats--tight .stat')].map((s) => [
                        txt(s.querySelector('.stat-label')),
                        txt(s.querySelector('.stat-value')),
                        txt(s.querySelector('.stat-note')),
                    ]),
                    wait: txt(p.querySelector('.panel-wait')),
                    tags: [...p.querySelectorAll('.ld-tag')].map(txt),
                    tagLine: txt(p.querySelector('.ld-n--panel')),
                    charts: [...p.querySelectorAll('.chart')].filter(
                        (c) => !c.parentNode.closest('.chart'),
                    ).length,
                    quadTitles: [...p.querySelectorAll('.quad-dot[title]')].map((d) =>
                        d.getAttribute('title'),
                    ),
                    quadCorners: [...p.querySelectorAll('.quad-corner')].map(txt),
                    quadOthers: p.querySelectorAll('.quad-dot--other').length,
                    quadMine: [...p.querySelectorAll('.quad-label')]
                        .filter((e) => e.offsetParent !== null)
                        .map(txt),
                    quadNums: [...p.querySelectorAll('.quad-num')]
                        .filter((e) => e.offsetParent !== null)
                        .map(txt),
                    quadKey: [...p.querySelectorAll('.quad-key li')]
                        .filter((e) => e.offsetParent !== null)
                        .map(txt),
                    legend: txt(p.querySelector('.legend--mono, .chart-foot')),
                    legendAll: [...p.querySelectorAll('.legend--mono, .chart-foot, .ld-n')]
                        .map(txt)
                        .join(' | '),
                    tierRows: p.querySelectorAll('.bars--tier .bar:not(.axis-row)').length,
                    effectRows: p.querySelectorAll('.bars--effects .bar').length,
                    effectUnclear: p.querySelectorAll('.bars--effects .bar--faded').length,
                    effectValues: [...p.querySelectorAll('.bars--effects .bar-value')].map(txt),
                    kmCurves: p.querySelectorAll('.km-step').length,
                    kmGuide: p.querySelectorAll('.km-guide').length,
                    kmCross: [...p.querySelectorAll('.km-cross')].map((c) =>
                        c.getAttribute('title'),
                    ),
                    kmBands: p.querySelectorAll('.km-band').length,
                    kmBandsShown: [...p.querySelectorAll('.km-band')].filter(
                        (b) => getComputedStyle(b).display !== 'none',
                    ).length,
                    kmYLabel: txt(p.querySelector('.km .axis-title--y')),
                    chartTitles: [...p.querySelectorAll('.chart-title')].map(txt),
                    quadTrails: p.querySelectorAll('.quad-trail').length,
                    lineCount: p.querySelectorAll('.line-svg polyline').length,
                    pointDots: p.querySelectorAll('.line-dot--point').length,
                    thinCount: p.querySelectorAll('.line-svg polyline.line-thin').length,
                    endLabels: p.querySelectorAll('.line-end-label').length,
                    kmMedians: p.querySelectorAll('.km-median-label').length,
                    tierTitles: [...p.querySelectorAll('.bars--tier .bar[title]')].map((e) =>
                        e.getAttribute('title'),
                    ),
                    empty: txt(p.querySelector('.panel-empty')),
                    more: p.querySelector('.ld-more')
                        ? [
                              p.querySelector('.ld-more').getAttribute('href'),
                              txt(p.querySelector('.ld-more')),
                              p.querySelector('.ld-more').getAttribute('aria-label'),
                              p.querySelector('.ld-more').parentNode.className,
                          ]
                        : null,
                    removed: p.querySelectorAll(
                        '.teams, .lift, .list, .rankings, .vol-chart, .heat, .stack-chart, ' +
                            '.bars--wide',
                    ).length,
                })),
                panelOrder: [...document.querySelectorAll('#lately .panel, #lately .panel-grid')]
                    .filter((e) => e.parentNode.id === 'lately')
                    .map((e) =>
                        e.classList.contains('panel-grid')
                            ? [...e.querySelectorAll('.panel')].map((p) => p.id)
                            : e.id,
                    ),
                // The source-status chips: their place among the section's children, and their
                // count.
                latelyChildren: document.getElementById('lately')
                    ? [...document.getElementById('lately').children].map(
                          (e) => e.id || e.className || e.tagName,
                      )
                    : null,
                chips: [...document.querySelectorAll('#lately-sources .chip')].map(txt),
                latelyHeight: document.getElementById('lately')
                    ? Math.round(document.getElementById('lately').getBoundingClientRect().height)
                    : null,
                pageHeight: de.scrollHeight,
                bodyText: document.body.innerText,
                titles: [...document.querySelectorAll('[title]')].map((e) =>
                    e.getAttribute('title'),
                ),
            };
        });
        facts.errors = errors;
        process.stdout.write(JSON.stringify(facts));
    } finally {
        await browser.close();
    }
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
