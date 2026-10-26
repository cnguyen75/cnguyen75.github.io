/*
 * Lately, in depth. Draws the lately/<feed>/ pages from the "analysis" block of
 * data/lately.json, and gives the main
 * page's panels their headline numbers through window.LatelyDepth.headline.
 *
 * build.py writes each page's frame: a headline row, then one section per
 * statistic with a slot <div class="ld-stat" data-stat="path">. A path is the
 * statistic's place in the analysis block: "teams[]" is every team, "*" every
 * key of a map (one per lift, platform or ranking). Every statistic shows its
 * value and interval, its chart or table, its n, and the pipeline's "how"
 * sentence. A statistic that is not "ok" shows only why.
 *
 * Only fields named here are drawn, so nothing else in the file can reach the
 * page. All text goes in with textContent.
 */
(function () {
    'use strict';

    var MINUS = '−';
    var MONTHS = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    var NOT_CONNECTED = 'Not connected yet.';
    var NAMES = {
        sleeper: 'Sleeper',
        espn: 'ESPN',
        yahoo: 'Yahoo',
        show: 'Shows',
        film: 'Films',
        anime: 'Anime',
        shows: 'Shows',
        films: 'Films',
    };
    var TYPE_CLASS = {
        show: 'shows',
        film: 'films',
        anime: 'anime',
        shows: 'shows',
        films: 'films',
    };

    // ---------- small helpers ----------

    function h(tag, attrs) {
        var el = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v == null || v === false) return;
                if (k === 'style') Object.assign(el.style, v);
                else el.setAttribute(k, v === true ? '' : String(v));
            });
        }
        for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
        return el;
    }
    function append(el, child) {
        if (child == null || child === false) return;
        if (Array.isArray(child))
            child.forEach(function (c) {
                append(el, c);
            });
        else
            el.appendChild(
                typeof child === 'object' ? child : document.createTextNode(String(child)),
            );
    }
    function isObj(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }
    function isNum(v) {
        return typeof v === 'number' && isFinite(v);
    }
    function list(v) {
        return Array.isArray(v) ? v : [];
    }
    function need(cond, what) {
        if (!cond) throw new Error('lately-depth: bad ' + what);
    }

    // Numbers: a real minus sign, thousands separators, and the data's own precision unless dp
    // is given.
    function num(x, dp) {
        need(isNum(x), 'number');
        var s = dp === undefined ? String(Math.round(x * 1000) / 1000) : x.toFixed(dp);
        if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
        s = s.replace(/^(-?)(\d{4,})/, function (m, sign, digits) {
            return sign + digits.replace(/\B(?=(\d{3})+$)/g, ',');
        });
        return s.charAt(0) === '-' ? MINUS + s.slice(1) : s;
    }
    function signed(x, dp) {
        var s = num(x, dp);
        return x > 0 && s !== num(0, dp) ? '+' + s : s;
    }
    function big(x) {
        return Math.round(x).toLocaleString('en-US');
    }
    // Shares are whole percentages; under 10 points one decimal, where it tells 4% from 4.9%.
    function pct(x) {
        need(isNum(x), 'share');
        var p = x * 100,
            r = Math.round(p);
        if (x > 0 && Math.round(p * 10) === 0) return '<1%';
        if (x < 1 && r === 100) return '>99%';
        if (p > 0 && p < 10) return num(p, 1).replace(/\.0$/, '') + '%';
        return r + '%';
    }
    function plural(n, unit) {
        var one = {
            weeks: 'week',
            plays: 'play',
            sessions: 'session',
            places: 'place',
            titles: 'title',
            films: 'film',
            months: 'month',
            albums: 'album',
            tracks: 'track',
            days: 'day',
            years: 'year',
            tiers: 'tier',
            pairs: 'pair',
            predictions: 'prediction',
            seasons: 'season',
            workouts: 'workout',
            'weigh-ins': 'weigh-in',
            'adds judged': 'add judged',
            artists: 'artist',
            're-rankings': 're-ranking',
            picks: 'pick',
        }[unit];
        return big(n) + ' ' + (n === 1 && one ? one : unit);
    }
    function record(r) {
        need(isObj(r), 'record');
        return r.wins + '–' + r.losses + (r.ties ? '–' + r.ties : '');
    }
    function dateText(s, withYear) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
        need(m, 'date');
        return (
            Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + (withYear === false ? '' : ' ' + m[1])
        );
    }
    function monthText(s, short) {
        var m = /^(\d{4})-(\d{2})$/.exec(String(s));
        need(m, 'month');
        return MONTHS[Number(m[2]) - 1] + (short ? '' : ' ' + m[1]);
    }
    function hoursText(x) {
        return x < 48
            ? num(x, 0) + ' hours'
            : num(x / 24, x / 24 < 10 ? 1 : 0).replace(/\.0$/, '') + ' days';
    }
    function interval(iv, f) {
        if (!Array.isArray(iv) || iv.length !== 2 || !isNum(iv[0]) || !isNum(iv[1])) return null;
        return '95% interval ' + f(iv[0]) + ' to ' + f(iv[1]);
    }
    function excludesZero(iv) {
        return Array.isArray(iv) && iv.length === 2 && (iv[0] > 0 || iv[1] < 0);
    }
    function nameOf(key) {
        return NAMES[key] || key;
    }

    // ---------- building blocks ----------

    function facts(rows) {
        rows = rows.filter(function (r) {
            return r && r[1] !== null && r[1] !== undefined && r[1] !== '';
        });
        if (!rows.length) return null;
        return h(
            'dl',
            { class: 'ld-facts' },
            rows.map(function (r) {
                return h('div', { class: 'ld-fact' }, h('dt', null, r[0]), h('dd', null, r[1]));
            }),
        );
    }

    function table(caption, cols, rows, opts) {
        var body = h(
            'tbody',
            null,
            rows.map(function (r) {
                return h(
                    'tr',
                    null,
                    r.map(function (cell, i) {
                        return i === 0
                            ? h('th', { scope: 'row' }, cell)
                            : h('td', { class: cols[i].num ? 'num' : null }, cell);
                    }),
                );
            }),
        );
        var box = h(
            'div',
            {
                class: 'table table--depth' + (opts && opts.cls ? ' ' + opts.cls : ''),
                hidden: opts && opts.hidden,
            },
            h(
                'table',
                null,
                h(
                    'caption',
                    { class: opts && opts.showCaption ? 'table-caption' : 'sr-only' },
                    caption,
                ),
                h(
                    'thead',
                    null,
                    h(
                        'tr',
                        null,
                        cols.map(function (c) {
                            return h('th', { scope: 'col', class: c.num ? 'num' : null }, c.label);
                        }),
                    ),
                ),
                body,
            ),
        );
        append(box, collapseRows(box, body.children));
        return box;
    }

    var uid = 0;
    var SHOW_ROWS = 10;
    // A list or table with more than SHOW_ROWS rows shows that many and a "show all N" button
    // that opens the rest in place and closes them again. The rows stay in the DOM, hidden,
    // and the button carries aria-expanded and aria-controls. Returns the button, or null.
    function collapseRows(container, rows, opts) {
        opts = opts || {};
        var limit = opts.limit || SHOW_ROWS;
        rows = Array.prototype.slice.call(rows);
        if (rows.length <= limit) return null;
        if (!container.id) container.id = 'ld-rows-' + ++uid;
        function set(open) {
            rows.forEach(function (r, i) {
                if (i >= limit) r.hidden = !open;
            });
        }
        set(false);
        var more = 'show all ' + rows.length,
            less = 'show fewer';
        var btn = h(
            'button',
            {
                type: 'button',
                class: 'control control--quiet rows-more' + (opts.cls ? ' ' + opts.cls : ''),
                'aria-controls': container.id,
                'aria-expanded': 'false',
            },
            more,
        );
        btn.addEventListener('click', function () {
            var open = btn.getAttribute('aria-expanded') !== 'true';
            set(open);
            btn.setAttribute('aria-expanded', String(open));
            btn.textContent = open ? less : more;
        });
        return btn;
    }
    // A chart whose rows collapse: the chart and its button in one box.
    function collapsible(chart, rows, opts) {
        var btn = collapseRows(chart, rows, opts);
        return btn ? h('div', { class: 'ld-collapsible' }, chart, btn) : chart;
    }

    // ---------- tabs ----------
    // One tab control for a set of panels, in the tier board's look: buttons with aria-pressed,
    // the selected panel shown and the rest hidden. Groups that share a sync key switch
    // together (the tier board, My rankings and the per-type sections of the watching page;
    // every fantasy section's team tabs). A group may hold panels only (strip: false) and follow
    // a strip elsewhere in its section; with render(i) it keeps one live panel and redraws it.
    var TAB_GROUPS = {};
    function tabs(labels, panels, opts) {
        opts = opts || {};
        var selected = isNum(opts.selected) ? opts.selected : 0;
        var strip =
            opts.strip === false
                ? null
                : h(
                      'div',
                      {
                          class: 'tab-strip',
                          role: 'group',
                          'aria-label': opts.label || 'Choose',
                          'data-sync': opts.sync || null,
                      },
                      labels.map(function (l, i) {
                          return h(
                              'button',
                              {
                                  type: 'button',
                                  class: 'control tab',
                                  'data-tab': String(i),
                                  'data-type': opts.keys ? opts.keys[i] : null,
                                  'aria-pressed': String(i === selected),
                              },
                              l,
                          );
                      }),
                  );
        var box = h(
            'div',
            { class: 'tab-panels' },
            panels.map(function (p, i) {
                var d = h('div', { class: 'tab-panel', hidden: !opts.render && i !== selected });
                append(d, p);
                return d;
            }),
        );
        var group = {
            strip: strip,
            box: box,
            keys: opts.keys || null,
            selected: selected,
            select: function (i) {
                group.selected = i;
                if (strip)
                    Array.prototype.forEach.call(strip.children, function (b, k) {
                        b.setAttribute('aria-pressed', String(k === i));
                    });
                if (opts.render) opts.render(i);
                else
                    Array.prototype.forEach.call(box.children, function (p, k) {
                        p.hidden = k !== i;
                    });
            },
        };
        if (strip)
            Array.prototype.forEach.call(strip.children, function (b, i) {
                b.addEventListener('click', function () {
                    if (opts.sync) selectTabs(opts.sync, i);
                    else group.select(i);
                    if (opts.onSelect) opts.onSelect(i, opts.keys ? opts.keys[i] : null);
                });
            });
        if (opts.sync) (TAB_GROUPS[opts.sync] = TAB_GROUPS[opts.sync] || []).push(group);
        group.root = h('div', { class: 'tabs' }, strip, box);
        return group;
    }
    function selectTabs(key, i) {
        list(TAB_GROUPS[key]).forEach(function (g) {
            g.select(i);
        });
    }
    // Select by a tab's key (a team's slug) in every group with that sync key; false when unknown.
    function selectTabKey(sync, k) {
        var i = -1;
        list(TAB_GROUPS[sync]).forEach(function (g) {
            if (i < 0 && g.keys) i = g.keys.indexOf(k);
        });
        if (i < 0) return false;
        selectTabs(sync, i);
        return true;
    }
    function slug(s) {
        return String(s)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
    // A hash part decoded, or as written when it is not valid percent-encoding.
    function decodeHash(part) {
        try {
            return decodeURIComponent(part);
        } catch (e) {
            return part;
        }
    }
    // The hash: "#section", "#team=key" or "#section&team=key".
    function hashParts() {
        var parts = (location.hash || '').slice(1).split('&'),
            team = null;
        parts.forEach(function (p) {
            var m = /^team=(.+)$/.exec(p);
            if (m) team = decodeHash(m[1]);
        });
        return { id: /=/.test(parts[0]) ? '' : parts[0], team: team };
    }
    function setTeamHash(key) {
        var hp = hashParts(),
            next = (hp.id ? '#' + hp.id + '&' : '#') + 'team=' + key;
        if (history.replaceState) history.replaceState(null, '', next);
    }

    // A chart with the same numbers as a real table behind it, for screen readers: in the DOM,
    // visually hidden (.sr-only, never display: none), with no control to reveal it.
    function charted(title, chart, cols, rows, after) {
        var t = table(title, cols, rows, { cls: 'sr-only' });
        t.id = 'ld-table-' + ++uid;
        return h(
            'div',
            { class: 'chart chart--depth' },
            h('div', { class: 'chart-head' }, h('div', { class: 'chart-title' }, title)),
            chart,
            t,
            after || null,
        );
    }

    // Vertical columns, e.g. months or weekdays. items: {label, value, text, title}
    function columns(title, items, opts) {
        opts = opts || {};
        var max = Math.max.apply(
            null,
            items
                .map(function (i) {
                    return i.value;
                })
                .concat(0),
        );
        var chart = h(
            'div',
            {
                class: 'ld-cols' + (items.length > 12 ? ' ld-cols--dense' : ''),
                role: 'img',
                'aria-label':
                    title +
                    ': ' +
                    items
                        .map(function (i) {
                            return (i.title || i.label) + ' ' + i.text;
                        })
                        .join('; '),
                style: { gridTemplateColumns: 'repeat(' + items.length + ', minmax(0, 1fr))' },
            },
            items.map(function (i, k) {
                return h(
                    'div',
                    { class: 'ld-col', title: (i.title || i.label) + ': ' + i.text },
                    h('span', { class: 'ld-col-value' }, items.length > 12 ? '' : i.text),
                    h('div', {
                        class: 'ld-col-bar',
                        style: {
                            height:
                                max > 0
                                    ? 'calc((100% - 18px) * ' + (i.value / max).toFixed(4) + ')'
                                    : '0',
                        },
                    }),
                    h(
                        'span',
                        { class: 'ld-col-label', 'aria-hidden': 'true' },
                        opts.every && k % opts.every ? '' : i.label,
                    ),
                );
            }),
        );
        return charted(
            title,
            chart,
            [{ label: opts.labelHeading || '' }, { label: opts.valueHeading || '', num: true }],
            items.map(function (i) {
                return [i.title || i.label, i.text];
            }),
        );
    }

    // Horizontal bars. items: {label, value, text, ref, cls}; ref draws an outlined marker
    // (a comparison value) on the same scale. A bar is the track colour with an ink end-mark;
    // blue when the row is me against others (opts.subject, with the others as ref marks) or a
    // positive among negatives, orange when negative, which also keeps its minus sign in the
    // text, so colour is never the only cue.
    function bars(title, items, opts) {
        opts = opts || {};
        var vals = items
            .map(function (i) {
                return i.value;
            })
            .concat(
                items.map(function (i) {
                    return isNum(i.ref) ? i.ref : 0;
                }),
            );
        var max = Math.max.apply(null, vals.concat(0)),
            min = Math.min.apply(null, vals.concat(0));
        var span = max - min || 1,
            zero = (-min / span) * 100;
        var chart = h(
            'div',
            {
                class: 'bars',
                role: 'img',
                'aria-label':
                    title +
                    ': ' +
                    items
                        .map(function (i) {
                            return (
                                i.label + ' ' + i.text + (i.refText ? ' (' + i.refText + ')' : '')
                            );
                        })
                        .join('; '),
            },
            items.map(function (i) {
                var w = (Math.abs(i.value) / span) * 100;
                var cls =
                    i.value < 0 ? ' bar--neg' : opts.subject || min < 0 ? ' bar--subject' : '';
                return h(
                    'div',
                    {
                        class: 'bar' + cls,
                        title: i.label + ': ' + i.text + (i.refText ? ' (' + i.refText + ')' : ''),
                    },
                    h('span', { class: 'bar-label' }, i.label),
                    h(
                        'span',
                        { class: 'bar-track' },
                        min < 0
                            ? h('span', { class: 'bar-zero', style: { left: zero + '%' } })
                            : null,
                        h('span', {
                            class: 'bar-fill' + (i.cls ? ' ' + i.cls : ''),
                            style: { left: (i.value < 0 ? zero - w : zero) + '%', width: w + '%' },
                        }),
                        isNum(i.ref)
                            ? h('span', {
                                  class: 'bar-ref',
                                  style: { left: ((i.ref - min) / span) * 100 + '%' },
                              })
                            : null,
                    ),
                    h(
                        'span',
                        { class: 'bar-value' },
                        i.text + (i.refText ? ' / ' + i.refText : ''),
                    ),
                );
            }),
        );
        var cols = [
            { label: opts.labelHeading || '' },
            { label: opts.valueHeading || '', num: true },
        ];
        if (opts.refHeading) cols.push({ label: opts.refHeading, num: true });
        var legend = opts.refHeading
            ? h(
                  'p',
                  { class: 'legend legend--mono' },
                  h('span', {
                      class: 'legend-bar' + (opts.subject ? ' legend-bar--subject' : ''),
                      'aria-hidden': 'true',
                  }),
                  ' ' + opts.valueHeading + ' (first number)   ',
                  h('span', { class: 'legend-ref', 'aria-hidden': 'true' }),
                  ' ' + opts.refHeading + ' (second)',
              )
            : null;
        return charted(
            title,
            collapsible(chart, chart.querySelectorAll('.bar')),
            cols,
            items.map(function (i) {
                var r = [i.label, i.text];
                if (opts.refHeading) r.push(i.refText || '');
                return r;
            }),
            legend,
        );
    }

    // Points with 95% intervals on one scale that includes zero. rows: {label, value, lo, hi, text}
    function intervals(title, rows, opts) {
        opts = opts || {};
        var lo = Math.min.apply(
            null,
            rows
                .map(function (r) {
                    return r.lo;
                })
                .concat(opts.min !== undefined ? opts.min : 0),
        );
        var hi = Math.max.apply(
            null,
            rows
                .map(function (r) {
                    return r.hi;
                })
                .concat(opts.max !== undefined ? opts.max : 0),
        );
        var pad = (hi - lo) * 0.06 || 1;
        if (opts.min === undefined) lo -= pad;
        if (opts.max === undefined) hi += pad;
        function x(v) {
            return ((v - lo) / (hi - lo)) * 100 + '%';
        }
        var chart = h(
            'div',
            {
                class: 'ld-ivs',
                role: 'img',
                'aria-label':
                    title +
                    ': ' +
                    rows
                        .map(function (r) {
                            return r.label + ' ' + r.text;
                        })
                        .join('; '),
            },
            rows.map(function (r) {
                return h(
                    'div',
                    { class: 'ld-iv-row', title: r.label + ': ' + r.text },
                    h('span', { class: 'ld-iv-label' }, r.label),
                    h(
                        'span',
                        { class: 'ld-iv-track' },
                        h('span', { class: 'ld-iv-zero', style: { left: x(0) } }),
                        h('span', {
                            class: 'ld-iv-line',
                            style: {
                                left: x(r.lo),
                                width: 'calc(' + x(r.hi) + ' - ' + x(r.lo) + ')',
                            },
                        }),
                        h('span', { class: 'ld-iv-dot', style: { left: x(r.value) } }),
                    ),
                    h('span', { class: 'ld-iv-value' }, r.text),
                );
            }),
            h(
                'div',
                { class: 'axis-row', 'aria-hidden': 'true' },
                h('span', null, ''),
                h('span', { class: 'axis-ticks' }, h('span', { style: { left: x(0) } }, '0')),
                h('span', null, ''),
            ),
        );
        return charted(
            title,
            collapsible(chart, chart.querySelectorAll('.ld-iv-row')),
            [{ label: opts.labelHeading || '' }, { label: 'value and 95% interval', num: true }],
            rows.map(function (r) {
                return [r.label, r.text];
            }),
        );
    }

    // Wins as filled squares, losses outlined, ties dashed; each carries its letter.
    function resultSquare(kind, title) {
        return h(
            'span',
            {
                class:
                    'result' + (kind === 'W' ? ' result--win' : kind === 'T' ? ' result--tie' : ''),
                title: title,
            },
            kind,
        );
    }
    // A record as a split bar: filled for wins, outlined for losses, with the counts in words.
    function recordBar(label, r) {
        need(isObj(r), 'record');
        var total = r.wins + r.losses + (r.ties || 0);
        return h(
            'div',
            { class: 'ld-record' },
            h('span', { class: 'ld-record-label' }, label),
            h(
                'span',
                { class: 'ld-record-bar', 'aria-hidden': 'true' },
                h('span', { class: 'ld-record-w', style: { flexGrow: r.wins } }),
                r.ties ? h('span', { class: 'ld-record-t', style: { flexGrow: r.ties } }) : null,
                h('span', { class: 'ld-record-l', style: { flexGrow: r.losses } }),
            ),
            h(
                'span',
                { class: 'ld-record-text' },
                record(r) + (total ? ' (' + pct(r.wins / total) + ' won)' : ''),
            ),
        );
    }

    function lineChart(title, points, fmt) {
        var ys = points.map(function (p) {
            return p.value;
        });
        var lo = Math.min.apply(null, ys),
            hi = Math.max.apply(null, ys);
        var pad = hi > lo ? (hi - lo) * 0.1 : Math.abs(hi) * 0.05 || 1;
        lo -= pad;
        hi += pad;
        var n = points.length;
        function x(i) {
            return n > 1 ? (i / (n - 1)) * 100 : 100;
        }
        function y(v) {
            return (1 - (v - lo) / (hi - lo)) * 100;
        }
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('class', 'line-svg');
        svg.setAttribute('aria-hidden', 'true');
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute(
            'points',
            points
                .map(function (p, i) {
                    return x(i).toFixed(2) + ',' + y(p.value).toFixed(2);
                })
                .join(' '),
        );
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(line);
        var last = points[n - 1],
            first = points[0];
        var chart = h(
            'div',
            {
                class: 'ld-line',
                role: 'img',
                'aria-label':
                    title +
                    ', ' +
                    n +
                    ' points from ' +
                    first.label +
                    ' to ' +
                    last.label +
                    ': ' +
                    fmt(first.value) +
                    ' to ' +
                    fmt(last.value),
            },
            h(
                'div',
                { class: 'line-chart', style: { height: '90px' } },
                h(
                    'div',
                    { class: 'line-area' },
                    h(
                        'div',
                        { class: 'line-plot' },
                        svg,
                        points.map(function (p, i) {
                            return h('span', {
                                class:
                                    'line-dot' +
                                    (i === n - 1 ? ' line-dot--last' : ' line-dot--point'),
                                title: p.label + ': ' + fmt(p.value),
                                style: { left: x(i) + '%', top: y(p.value) + '%' },
                            });
                        }),
                    ),
                ),
                h(
                    'div',
                    {
                        class: 'line-end',
                        style: { width: fmt(last.value).length * 0.62 + 0.4 + 'em' },
                    },
                    h(
                        'span',
                        {
                            class: 'line-end-label',
                            style: { top: Math.min(Math.max(y(last.value), 10), 90) + '%' },
                        },
                        fmt(last.value),
                    ),
                ),
            ),
            h(
                'div',
                { class: 'axis', 'aria-hidden': 'true' },
                h('span', null, first.label),
                h('span', null, last.label),
            ),
        );
        return charted(
            title,
            chart,
            [{ label: 'Date' }, { label: 'Value', num: true }],
            points.map(function (p) {
                return [p.label, fmt(p.value)];
            }),
        );
    }

    function heatLevel(v, max) {
        if (!v || max <= 0) return 0;
        return Math.min(5, 2 + Math.floor((v / max) * 3.999));
    }

    // ---------- SVG charts shared with the main page (window.LatelyDepth.charts) ----------
    // Geometry is SVG stretched to its box (vector-effect keeps strokes 2px); dots, labels and
    // legends are HTML placed in percentages, so text keeps its size at any width.

    var NS = 'http://www.w3.org/2000/svg';
    function sv(tag, attrs) {
        var el = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(function (k) {
            el.setAttribute(k, String(attrs[k]));
        });
        return el;
    }
    function plotSvg() {
        return sv('svg', {
            class: 'line-svg',
            viewBox: '0 0 100 100',
            preserveAspectRatio: 'none',
            'aria-hidden': 'true',
            focusable: 'false',
        });
    }
    function polyline(pts, cls) {
        return sv('polyline', {
            class: cls || '',
            points: pts
                .map(function (p) {
                    return p[0].toFixed(2) + ',' + p[1].toFixed(2);
                })
                .join(' '),
            'vector-effect': 'non-scaling-stroke',
        });
    }
    function legendItem(cls, text) {
        return h(
            'span',
            { class: 'legend-item' },
            h('span', { class: 'legend-swatch ' + cls, 'aria-hidden': 'true' }),
            text,
        );
    }
    // one hue for one series, a second for two; the rest for thin extra lines
    var SERIES = ['s-blue', 's-orange', 's-purple', 's-teal', 's-grey'];

    // Lines over the same x positions. series: [{name, values: [number|null]}]; labels: x labels
    // (first and last are shown); opts: {fmt, base (a dashed reference line, e.g. 100), height,
    // endLabels (true: each series' last value at the right), title}. Returns the chart with its
    // table behind it and, for two or more series, a legend.
    // opts.endLabels === false: the series are labelled in the legend only, no value at the line
    // end. A series' line runs through every point it has, however far apart they are.
    function multiLine(title, labels, series, opts) {
        opts = opts || {};
        var fmt =
            opts.fmt ||
            function (x) {
                return num(x, 1);
            };
        var all = [];
        series.forEach(function (s) {
            s.values.forEach(function (v) {
                if (isNum(v)) all.push(v);
            });
        });
        if (isNum(opts.base)) all.push(opts.base);
        var lo = Math.min.apply(null, all),
            hi = Math.max.apply(null, all);
        var pad = hi > lo ? (hi - lo) * 0.12 : Math.abs(hi) * 0.05 || 1;
        lo -= pad;
        hi += pad;
        var n = labels.length;
        // One point sits at the right edge, where its label is.
        function x(i) {
            return n > 1 ? (i / (n - 1)) * 100 : 100;
        }
        function y(v) {
            return (1 - (v - lo) / (hi - lo)) * 100;
        }
        var svg = plotSvg();
        if (isNum(opts.base))
            svg.appendChild(
                sv('line', {
                    class: 'line-base',
                    x1: 0,
                    x2: 100,
                    y1: y(opts.base).toFixed(2),
                    y2: y(opts.base).toFixed(2),
                    'vector-effect': 'non-scaling-stroke',
                }),
            );
        var ends = [],
            points = [];
        series.forEach(function (s, k) {
            var pts = [];
            s.values.forEach(function (v, i) {
                if (isNum(v)) pts.push([x(i), y(v)]);
            });
            // A sparse series (s.points: measurements at some weeks only) and a thin one are 1px
            // lines, a full series 2px; every series marks every point it has.
            if (pts.length > 1)
                svg.appendChild(
                    polyline(
                        pts,
                        SERIES[k % SERIES.length] + (s.points || s.thin ? ' line-thin' : ''),
                    ),
                );
            s.values.forEach(function (v, i) {
                if (isNum(v))
                    points.push({
                        k: k,
                        left: x(i),
                        top: y(v),
                        title: Array.isArray(s.titles) ? s.titles[i] : labels[i] + ': ' + fmt(v),
                    });
            });
            var lastIdx = -1;
            s.values.forEach(function (v, i) {
                if (isNum(v)) lastIdx = i;
            });
            if (lastIdx >= 0)
                ends.push({
                    k: k,
                    v: s.values[lastIdx],
                    top: y(s.values[lastIdx]),
                    left: x(lastIdx),
                });
        });
        var plot = h(
            'div',
            { class: 'line-plot' },
            svg,
            points.map(function (d) {
                return h('span', {
                    class: 'line-dot line-dot--point ' + SERIES[d.k % SERIES.length],
                    title: d.title || null,
                    style: { left: d.left + '%', top: d.top + '%' },
                });
            }),
        );
        // End labels: nudged apart when two sit within 14% of each other.
        ends.sort(function (a, b) {
            return a.top - b.top;
        });
        for (var i = 1; i < ends.length; i++)
            if (ends[i].top - ends[i - 1].top < 14) ends[i].top = ends[i - 1].top + 14;
        var endText = ends.map(function (e) {
            return fmt(e.v);
        });
        var width = Math.max.apply(
            null,
            endText
                .map(function (t) {
                    return t.length;
                })
                .concat(1),
        );
        var summary = series
            .map(function (s) {
                var vals = s.values.filter(isNum);
                return s.name + ' from ' + fmt(vals[0]) + ' to ' + fmt(vals[vals.length - 1]);
            })
            .join('; ');
        var chart = h(
            'div',
            {
                class: 'ld-line',
                role: 'img',
                'aria-label':
                    title +
                    ', ' +
                    n +
                    ' points from ' +
                    labels[0] +
                    ' to ' +
                    labels[n - 1] +
                    ': ' +
                    summary,
            },
            h(
                'div',
                { class: 'line-chart', style: { height: (opts.height || 120) + 'px' } },
                h('div', { class: 'line-area' }, plot),
                opts.endLabels === false
                    ? null
                    : h(
                          'div',
                          { class: 'line-end', style: { width: width * 0.62 + 0.4 + 'em' } },
                          ends.map(function (e) {
                              return h(
                                  'span',
                                  {
                                      class: 'line-end-label ' + SERIES[e.k % SERIES.length],
                                      style: { top: Math.min(Math.max(e.top, 6), 94) + '%' },
                                  },
                                  fmt(e.v),
                              );
                          }),
                      ),
            ),
            h(
                'div',
                { class: 'axis', 'aria-hidden': 'true' },
                h('span', null, labels[0]),
                h('span', null, n > 1 ? labels[n - 1] : ''),
            ),
        );
        var legend =
            series.length > 1 || opts.legend
                ? h(
                      'p',
                      { class: 'legend legend--mono' },
                      series.map(function (s, k) {
                          return legendItem(SERIES[k % SERIES.length], s.name);
                      }),
                      isNum(opts.base)
                          ? legendItem('s-base', opts.baseText || String(opts.base))
                          : null,
                  )
                : null;
        var cols = [{ label: opts.labelHeading || '' }].concat(
            series.map(function (s) {
                return { label: s.name, num: true };
            }),
        );
        return charted(
            title,
            chart,
            cols,
            labels.map(function (l, i) {
                return [l].concat(
                    series.map(function (s) {
                        return isNum(s.values[i]) ? fmt(s.values[i]) : '–';
                    }),
                );
            }),
            legend,
        );
    }

    // Strength against luck: every team in my leagues as a point, mine in blue with their
    // labels, the others grey with their label at most. A faint trail from week 3 is drawn but
    // hidden until the "show trail" control (opts.trailToggle) is pressed; opts.trails false
    // leaves it out. Hover on any point shows a label, record and all-play share only; no name
    // of another team ever appears.
    function quadrant(v, opts) {
        opts = opts || {};
        var mine = list(v.mine).filter(function (t) {
            return isObj(t) && isNum(t.all_play) && isNum(t.luck);
        });
        var others = list(v.others).filter(function (t) {
            return isObj(t) && isNum(t.all_play) && isNum(t.luck);
        });
        var xs = mine.concat(others).map(function (t) {
            return t.all_play;
        });
        mine.forEach(function (t) {
            list(t.trail).forEach(function (p) {
                if (isObj(p) && isNum(p.all_play)) xs.push(p.all_play);
            });
        });
        var ys = mine.concat(others).map(function (t) {
            return Math.abs(t.luck);
        });
        mine.forEach(function (t) {
            list(t.trail).forEach(function (p) {
                if (isObj(p) && isNum(p.luck)) ys.push(Math.abs(p.luck));
            });
        });
        // 0.25 to 0.75 is shown; the range widens only when a team sits outside it.
        var x0 = Math.min(0.25, Math.min.apply(null, xs.concat(0.25)) - 0.03),
            x1 = Math.max(0.75, Math.max.apply(null, xs.concat(0.75)) + 0.03);
        var yMax = Math.max(1.5, Math.max.apply(null, ys.concat(0)) + 0.4);
        function x(a) {
            return ((a - x0) / (x1 - x0)) * 100;
        }
        function y(l) {
            return (1 - (l + yMax) / (2 * yMax)) * 100;
        }
        function hover(t) {
            return record(t.record) + ' · all-play ' + pct(t.all_play);
        }
        var svg = plotSvg();
        svg.appendChild(
            sv('line', {
                class: 'quad-axis',
                x1: x(0.5).toFixed(2),
                x2: x(0.5).toFixed(2),
                y1: 0,
                y2: 100,
                'vector-effect': 'non-scaling-stroke',
            }),
        );
        svg.appendChild(
            sv('line', {
                class: 'quad-axis',
                x1: 0,
                x2: 100,
                y1: 50,
                y2: 50,
                'vector-effect': 'non-scaling-stroke',
            }),
        );
        // A team's trail: complete weeks from week 3 on, the last five of them, ending at the
        // team's point. Older weeks fade toward 0.25; none is drawn under three complete weeks.
        var trailDots = [];
        if (opts.trails !== false)
            mine.forEach(function (t) {
                var done = list(t.trail)
                    .filter(function (p) {
                        return (
                            isObj(p) &&
                            isNum(p.week) &&
                            isNum(p.all_play) &&
                            isNum(p.luck) &&
                            (!isNum(v.week) || p.week <= v.week)
                        );
                    })
                    .sort(function (a, b) {
                        return a.week - b.week;
                    });
                if (done.length < 3) return;
                var pts = done
                    .filter(function (p) {
                        return p.week >= 3;
                    })
                    .slice(-5);
                if (pts.length < 2) return;
                function fade(i) {
                    return 0.25 + 0.75 * (i / (pts.length - 1));
                }
                pts.forEach(function (p, i) {
                    if (i > 0) {
                        var a = pts[i - 1];
                        svg.appendChild(
                            sv('line', {
                                class: 'quad-trail',
                                x1: x(a.all_play).toFixed(2),
                                y1: y(a.luck).toFixed(2),
                                x2: x(p.all_play).toFixed(2),
                                y2: y(p.luck).toFixed(2),
                                opacity: ((fade(i - 1) + fade(i)) / 2).toFixed(2),
                                'vector-effect': 'non-scaling-stroke',
                            }),
                        );
                    }
                    if (i < pts.length - 1)
                        trailDots.push({
                            left: x(p.all_play),
                            top: y(p.luck),
                            opacity: fade(i),
                            week: p.week,
                        });
                });
            });
        var plot = h(
            'div',
            { class: 'quad-plot' },
            svg,
            trailDots.map(function (d) {
                return h('span', {
                    class: 'quad-trail-dot',
                    'aria-hidden': 'true',
                    title: 'week ' + d.week,
                    style: { left: d.left + '%', top: d.top + '%', opacity: d.opacity },
                });
            }),
            others.map(function (t) {
                var labelled = typeof t.label === 'string' && t.label;
                return h(
                    'span',
                    {
                        class: 'quad-dot quad-dot--other',
                        title: (labelled ? t.label + ' · ' : '') + hover(t),
                        style: { left: x(t.all_play) + '%', top: y(t.luck) + '%' },
                    },
                    h('span', { class: 'sr-only' }, otherLabel(t) + ', ' + hover(t)),
                );
            }),
            mine.map(function (t, i) {
                // Wide: the label beside the point. Under 600px (CSS): a numbered marker and the
                // key below.
                return h(
                    'span',
                    {
                        class: 'quad-dot quad-dot--mine',
                        title: hover(t),
                        style: { left: x(t.all_play) + '%', top: y(t.luck) + '%' },
                    },
                    h('span', { class: 'quad-num', 'aria-hidden': 'true' }, String(i + 1)),
                    h(
                        'span',
                        { class: 'quad-label' + (x(t.all_play) > 60 ? ' quad-label--left' : '') },
                        String(t.label),
                    ),
                    h('span', { class: 'sr-only' }, ', ' + hover(t)),
                );
            }),
            [
                ['quad-corner--tl', 'bad and lucky'],
                ['quad-corner--tr', 'good and lucky'],
                ['quad-corner--bl', 'bad and unlucky'],
                ['quad-corner--br', 'good and unlucky'],
            ].map(function (c) {
                return h('span', { class: 'quad-corner ' + c[0], 'aria-hidden': 'true' }, c[1]);
            }),
        );
        var chart = h(
            'div',
            {
                class: 'quad',
                role: 'img',
                'aria-label':
                    'Strength against luck, week ' +
                    (isNum(v.week) ? v.week : '') +
                    ': ' +
                    mine
                        .map(function (t) {
                            return (
                                t.label +
                                ' ' +
                                hover(t) +
                                ', ' +
                                signed(t.luck, 1) +
                                ' wins above expected'
                            );
                        })
                        .join('; ') +
                    '; and ' +
                    others.length +
                    ' other teams as unlabelled points',
            },
            h('div', { class: 'quad-y', 'aria-hidden': 'true' }, 'wins above expected ↑'),
            plot,
            h(
                'div',
                { class: 'quad-x', 'aria-hidden': 'true' },
                [0.25, 0.5, 0.75].map(function (a) {
                    return h('span', { style: { left: x(a) + '%' } }, pct(a));
                }),
                h('span', { class: 'quad-x-label' }, 'all-play win share →'),
            ),
        );
        var rows = mine
            .map(function (t) {
                return [String(t.label), record(t.record), pct(t.all_play), signed(t.luck, 1)];
            })
            .concat(
                others.map(function (t) {
                    return [otherLabel(t), record(t.record), pct(t.all_play), signed(t.luck, 1)];
                }),
            );
        var key = mine.length
            ? h(
                  'ol',
                  { class: 'quad-key', 'aria-label': 'My teams, by marker number' },
                  mine.map(function (t, i) {
                      return h(
                          'li',
                          null,
                          h(
                              'span',
                              { class: 'quad-key-num', 'aria-hidden': 'true' },
                              String(i + 1),
                          ),
                          String(t.label) + ' · ' + record(t.record),
                      );
                  }),
              )
            : null;
        var toggle = null;
        if (opts.trails !== false && opts.trailToggle) {
            toggle = h(
                'button',
                {
                    type: 'button',
                    class: 'control control--quiet quad-trails-toggle',
                    'aria-pressed': 'false',
                },
                'show trail',
            );
            toggle.addEventListener('click', function () {
                var on = toggle.getAttribute('aria-pressed') !== 'true';
                chart.classList.toggle('quad--trails', on);
                toggle.setAttribute('aria-pressed', String(on));
                toggle.textContent = on ? 'hide trail' : 'show trail';
            });
        }
        return charted(
            'Which of my teams are good, and which are lucky?',
            chart,
            [
                { label: 'Team' },
                { label: 'Record' },
                { label: 'All-play', num: true },
                { label: 'Wins above expected', num: true },
            ],
            rows,
            [
                h(
                    'p',
                    { class: 'legend legend--mono' },
                    legendItem('s-blue', 'my teams'),
                    legendItem('s-grey', 'other teams in my leagues'),
                    toggle ? legendItem('s-trail', 'my trail, last 5 weeks') : null,
                    toggle,
                ),
                key,
            ],
        );
    }

    // ---------- films: tier bars and the crowd plot ----------

    var TIER_ORDER = ['D', 'C', 'B', 'A', 'S']; // the tier scale, D = 1 to S = 5
    function tierLetter(x) {
        return TIER_ORDER[Math.max(0, Math.min(4, Math.round(x) - 1))];
    }
    // A mean tier as "4.0 (A)": the number and the letter it rounds to.
    function tierText(x) {
        return num(x, 1) + ' (' + tierLetter(x) + ')';
    }
    function tierPos(x) {
        return Math.max(0, Math.min(1, (x - 1) / 4));
    } // 0 at D, 1 at S
    function tierScore(letter) {
        var i = TIER_ORDER.indexOf(String(letter));
        return i < 0 ? null : i + 1;
    }
    function filmsText(films) {
        return list(films)
            .filter(isObj)
            .map(function (f) {
                return f.title + ' (' + f.tier + ')';
            })
            .join(', ');
    }
    function rowTitles(r) {
        return Array.isArray(r.films) ? r.films : r.titles;
    }

    // Horizontal bars of a mean tier on the fixed D..S scale, each labelled with its count;
    // hover lists the titles with their tiers. rows: {name, mean_tier, n, films}
    function tierBars(title, rows, opts) {
        opts = opts || {};
        var unit = opts.unit || 'films';
        var chart = h(
            'div',
            {
                class: 'bars bars--tier',
                role: 'img',
                'aria-label':
                    title +
                    ': ' +
                    rows
                        .map(function (r) {
                            return (
                                r.name + ' ' + tierText(r.mean_tier) + ' over ' + plural(r.n, unit)
                            );
                        })
                        .join('; '),
            },
            rows.map(function (r) {
                var films = filmsText(rowTitles(r));
                return h(
                    'div',
                    { class: 'bar', title: r.name + (films ? ': ' + films : '') },
                    h('span', { class: 'bar-label' }, String(r.name)),
                    h(
                        'span',
                        { class: 'bar-track' },
                        h('span', {
                            class: 'bar-fill' + (opts.cls ? ' ' + opts.cls : ''),
                            style: { left: 0, width: tierPos(r.mean_tier) * 100 + '%' },
                        }),
                    ),
                    h(
                        'span',
                        { class: 'bar-value' },
                        tierText(r.mean_tier) + ' · ' + plural(r.n, unit),
                    ),
                );
            }),
            h(
                'div',
                { class: 'bar axis-row', 'aria-hidden': 'true' },
                h('span'),
                h(
                    'span',
                    { class: 'axis-ticks' },
                    TIER_ORDER.map(function (t, i) {
                        return h('span', { style: { left: (i / 4) * 100 + '%' } }, t);
                    }),
                ),
                h('span'),
            ),
        );
        return charted(
            title,
            collapsible(chart, chart.querySelectorAll('.bar:not(.axis-row)')),
            [
                { label: opts.labelHeading || 'Name' },
                { label: 'Mean tier', num: true },
                { label: unit, num: true },
                { label: 'Titles' },
            ],
            rows.map(function (r) {
                return [
                    String(r.name),
                    tierText(r.mean_tier),
                    String(r.n),
                    filmsText(rowTitles(r)),
                ];
            }),
            opts.after,
        );
    }

    // Community score (x) against my tier (y): every title a muted dot, the disagreements
    // labelled (numbered markers with a key under 600px); hover gives title, year, tier, score.
    function crowdPlot(v) {
        var pts = list(v.points).filter(function (p) {
            return isObj(p) && isNum(p.community) && isNum(p.tier_score);
        });
        // The disagreements: {above: [...], below: [...]} (the three furthest each way), or one
        // list.
        var dis = isObj(v.disagreements)
            ? list(v.disagreements.above).concat(list(v.disagreements.below))
            : list(v.disagreements);
        var marks = dis.filter(function (p) {
            return isObj(p) && isNum(p.community) && typeof p.tier === 'string';
        });
        var xs = pts.concat(marks).map(function (p) {
            return p.community;
        });
        var x0 = Math.min.apply(null, xs.concat(10)) - 0.2,
            x1 = Math.max.apply(null, xs.concat(0)) + 0.2;
        function x(c) {
            return ((c - x0) / (x1 - x0)) * 100;
        }
        function y(ts, i) {
            return 90 - ((ts - 1) / 4) * 80 + (((i * 37) % 11) - 5) * 1.1;
        } // rows for the five tiers (D = 1 to S = 5), a little jitter
        function hover(p) {
            return (
                p.title +
                (isNum(p.year) ? ' (' + p.year + ')' : '') +
                ' · ' +
                p.tier +
                ' · ' +
                num(p.community, 1)
            );
        }
        var svg = plotSvg();
        TIER_ORDER.forEach(function (t, k) {
            svg.appendChild(
                sv('line', {
                    class: 'quad-axis',
                    x1: 0,
                    x2: 100,
                    y1: (90 - k * 20).toFixed(1),
                    y2: (90 - k * 20).toFixed(1),
                    'vector-effect': 'non-scaling-stroke',
                }),
            );
        });
        var plot = h(
            'div',
            { class: 'quad-plot crowd-plot' },
            svg,
            pts.map(function (p, i) {
                return h('span', {
                    class: 'quad-dot quad-dot--other',
                    title: hover(p),
                    style: { left: x(p.community) + '%', top: y(p.tier_score, i) + '%' },
                });
            }),
            marks.map(function (p, i) {
                var ts = isNum(p.tier_score) ? p.tier_score : tierScore(p.tier);
                return h(
                    'span',
                    {
                        class: 'quad-dot quad-dot--mine',
                        title: hover(p),
                        style: {
                            left: x(p.community) + '%',
                            top: y(ts === null ? 3 : ts, i + 3) + '%',
                        },
                    },
                    h('span', { class: 'quad-num', 'aria-hidden': 'true' }, String(i + 1)),
                    h(
                        'span',
                        { class: 'quad-label' + (x(p.community) > 60 ? ' quad-label--left' : '') },
                        String(p.title),
                    ),
                    h('span', { class: 'sr-only' }, ', ' + hover(p)),
                );
            }),
        );
        var ticks = [];
        for (var t = Math.ceil(x0); t <= Math.floor(x1); t++) ticks.push(t);
        var chart = h(
            'div',
            {
                class: 'quad',
                role: 'img',
                'aria-label':
                    'Community score against my tier for ' +
                    plural(pts.length, 'titles') +
                    '; the largest disagreements: ' +
                    marks.map(hover).join('; '),
            },
            h(
                'div',
                { class: 'quad-y crowd-y', 'aria-hidden': 'true' },
                TIER_ORDER.map(function (t, k) {
                    return h('span', { style: { top: 90 - k * 20 + '%' } }, t);
                }),
            ),
            plot,
            h(
                'div',
                { class: 'quad-x', 'aria-hidden': 'true' },
                ticks.map(function (t) {
                    return h('span', { style: { left: x(t) + '%' } }, String(t));
                }),
                h('span', { class: 'quad-x-label' }, 'Simkl community score →'),
            ),
        );
        var key = marks.length
            ? h(
                  'ol',
                  { class: 'quad-key', 'aria-label': 'The disagreements, by marker number' },
                  marks.map(function (p, i) {
                      return h(
                          'li',
                          null,
                          h(
                              'span',
                              { class: 'quad-key-num', 'aria-hidden': 'true' },
                              String(i + 1),
                          ),
                          hover(p),
                      );
                  }),
              )
            : null;
        return charted(
            "Where do my tiers part from the community's score?",
            chart,
            [
                { label: 'Title' },
                { label: 'Year', num: true },
                { label: 'My tier' },
                { label: 'Community', num: true },
            ],
            pts.map(function (p) {
                return [
                    String(p.title),
                    isNum(p.year) ? String(p.year) : '–',
                    String(p.tier),
                    num(p.community, 1),
                ];
            }),
            [
                h(
                    'p',
                    { class: 'legend legend--mono' },
                    legendItem('s-grey', 'every tiered title'),
                    legendItem('s-blue', 'the six largest disagreements'),
                ),
                key,
            ],
        );
    }

    // Diverging bars of standardised effects: zero centred, positive right (blue), negative left
    // (orange), each with a thin 95% interval line; a row whose interval includes zero is faded.
    // rows: {name, effect, interval, clear}
    function effectBars(title, rows) {
        var span = Math.max.apply(
            null,
            rows
                .map(function (r) {
                    return Math.max(
                        Math.abs(r.effect),
                        Math.abs(list(r.interval)[0] || 0),
                        Math.abs(list(r.interval)[1] || 0),
                    );
                })
                .concat(0.1),
        );
        function x(v) {
            return 50 + (v / span) * 50;
        }
        var chart = h(
            'div',
            {
                class: 'bars bars--effects',
                role: 'img',
                'aria-label':
                    title +
                    ': ' +
                    rows
                        .map(function (r) {
                            return (
                                r.name +
                                ' ' +
                                signed(r.effect, 2) +
                                (r.clear === false ? ' (unclear)' : '')
                            );
                        })
                        .join('; '),
            },
            rows.map(function (r) {
                var iv =
                    Array.isArray(r.interval) && isNum(r.interval[0]) && isNum(r.interval[1])
                        ? r.interval
                        : null;
                var w = (Math.abs(r.effect) / span) * 50;
                return h(
                    'div',
                    {
                        class:
                            'bar' +
                            (r.clear === false ? ' bar--faded' : '') +
                            (r.effect < 0 ? ' bar--neg' : ' bar--subject'),
                        title:
                            r.name +
                            ': ' +
                            signed(r.effect, 2) +
                            (iv
                                ? ' (95% ' + signed(iv[0], 2) + ' to ' + signed(iv[1], 2) + ')'
                                : '') +
                            (r.clear === false ? '; the interval includes zero' : ''),
                    },
                    h('span', { class: 'bar-label' }, String(r.name)),
                    h(
                        'span',
                        { class: 'bar-track' },
                        h('span', { class: 'bar-zero', style: { left: '50%' } }),
                        h('span', {
                            class: 'bar-fill',
                            style: { left: (r.effect < 0 ? 50 - w : 50) + '%', width: w + '%' },
                        }),
                        iv
                            ? h('span', {
                                  class: 'ld-iv-line ld-iv-line--thin',
                                  style: { left: x(iv[0]) + '%', width: x(iv[1]) - x(iv[0]) + '%' },
                              })
                            : null,
                    ),
                    h('span', { class: 'bar-value' }, signed(r.effect, 2)),
                );
            }),
        );
        return charted(
            title,
            chart,
            [
                { label: 'Feature' },
                { label: 'Effect', num: true },
                { label: '95% interval' },
                { label: 'Clear' },
            ],
            rows.map(function (r) {
                return [
                    String(r.name),
                    signed(r.effect, 2),
                    interval(r.interval, function (x) {
                        return signed(x, 2);
                    }) || '–',
                    r.clear === false ? 'no' : 'yes',
                ];
            }),
            h(
                'p',
                { class: 'legend legend--mono' },
                legendItem('s-blue', 'raises my tier'),
                legendItem('s-orange', 'lowers it'),
                legendItem('s-base', 'thin line: 95% interval; faded: includes zero'),
            ),
        );
    }

    // "Above the crowd: Title (A, 6.4), …" and "Below: …" from a disagreements block.
    function disagreementLines(dis) {
        if (!isObj(dis)) return null;
        function line(label, xs) {
            xs = list(xs).filter(function (p) {
                return isObj(p) && typeof p.title === 'string';
            });
            if (!xs.length) return null;
            return h(
                'p',
                { class: 'ld-small ld-disagree' },
                h('b', null, label + ' '),
                xs
                    .map(function (p) {
                        return (
                            p.title +
                            ' (' +
                            p.tier +
                            (isNum(p.community) ? ', ' + num(p.community, 1) : '') +
                            ')'
                        );
                    })
                    .join(', '),
            );
        }
        return [line('Above the crowd:', dis.above), line('Below:', dis.below)];
    }

    // Kaplan–Meier step curves, catalog against new: months since discovery across, the share
    // still in rotation up, a shaded 95% band, the median marked with a dropped line and label.
    // curves: [{type, n, median, points: [{months, survival, lower, upper, at_risk}]}]
    // opts.bands: the 95% bands drawn from the start; opts.bandToggle: a "show 95% bands" button,
    // off by default (the listening page); opts.guide: one horizontal 50% guide with each curve's
    // crossing point marked and labelled from its median (the main page's panel), in place of
    // the dropped median lines. The title is the question the chart answers.
    function survivalChart(title, curves, opts) {
        opts = opts || {};
        curves = list(curves).filter(function (c) {
            return isObj(c) && list(c.points).length;
        });
        var maxM = Math.max.apply(
            null,
            curves
                .map(function (c) {
                    return Math.max.apply(
                        null,
                        c.points.map(function (p) {
                            return p.months;
                        }),
                    );
                })
                .concat(1),
        );
        title =
            title ||
            'Of the artists I start playing, how many am I still playing ' +
                maxM +
                ' months later?';
        function x(m) {
            return (m / maxM) * 100;
        }
        function y(v) {
            return (1 - v) * 100;
        }
        var svg = plotSvg();
        if (opts.guide)
            svg.appendChild(
                sv('line', {
                    class: 'km-guide',
                    x1: 0,
                    x2: 100,
                    y1: 50,
                    y2: 50,
                    'vector-effect': 'non-scaling-stroke',
                }),
            );
        curves.forEach(function (c, k) {
            var pts = c.points
                .filter(function (p) {
                    return isObj(p) && isNum(p.months) && isNum(p.survival);
                })
                .slice()
                .sort(function (a, b) {
                    return a.months - b.months;
                });
            var cls = SERIES[k % SERIES.length];
            if (opts.bands !== false) {
                // The band: the upper bound stepped forward, the lower stepped back.
                var up = [],
                    lo = [];
                pts.forEach(function (p, i) {
                    var prev = i ? pts[i - 1] : null;
                    if (prev) {
                        up.push([x(p.months), y(isNum(prev.upper) ? prev.upper : prev.survival)]);
                        lo.push([x(p.months), y(isNum(prev.lower) ? prev.lower : prev.survival)]);
                    }
                    up.push([x(p.months), y(isNum(p.upper) ? p.upper : p.survival)]);
                    lo.push([x(p.months), y(isNum(p.lower) ? p.lower : p.survival)]);
                });
                if (up.length > 1)
                    svg.appendChild(
                        sv('polygon', {
                            class: 'km-band ' + cls,
                            points: up
                                .concat(lo.slice().reverse())
                                .map(function (q) {
                                    return q[0].toFixed(2) + ',' + q[1].toFixed(2);
                                })
                                .join(' '),
                        }),
                    );
            }
            var step = [];
            pts.forEach(function (p, i) {
                if (i) step.push([x(p.months), y(pts[i - 1].survival)]);
                step.push([x(p.months), y(p.survival)]);
            });
            if (step.length > 1) svg.appendChild(polyline(step, cls + ' km-step'));
            if (isNum(c.median) && !opts.guide) {
                svg.appendChild(
                    sv('line', {
                        class: 'km-median ' + cls,
                        x1: x(c.median).toFixed(2),
                        x2: x(c.median).toFixed(2),
                        y1: 50,
                        y2: 100,
                        'vector-effect': 'non-scaling-stroke',
                    }),
                );
            }
        });
        // The crossing points on the guide (the panel), or each curve's median label on its own
        // line under the plot, so close medians never overlap.
        var crossings = opts.guide
            ? curves
                  .filter(function (c) {
                      return isNum(c.median);
                  })
                  .map(function (c) {
                      var k = curves.indexOf(c);
                      return h('span', {
                          class: 'km-cross ' + SERIES[k % SERIES.length],
                          style: { left: x(c.median) + '%', top: '50%' },
                          title: c.type + ' ' + c.median + ' mo',
                      });
                  })
            : null;
        var labels = curves
            .filter(function (c) {
                return isNum(c.median);
            })
            .map(function (c) {
                var k = curves.indexOf(c);
                return h(
                    'span',
                    {
                        class: 'km-median-label ' + SERIES[k % SERIES.length],
                        style: { left: x(c.median) + '%', top: k * 14 + 'px' },
                    },
                    opts.guide
                        ? c.type + ' ' + c.median + ' mo'
                        : c.type + ' median ' + c.median + ' mo',
                );
            });
        var chart = h(
            'div',
            {
                class:
                    'ld-line km' + (opts.bands !== false && !opts.bandToggle ? ' km--bands' : ''),
                role: 'img',
                'aria-label':
                    title +
                    ' ' +
                    curves
                        .map(function (c) {
                            var last = c.points[c.points.length - 1];
                            return (
                                c.type +
                                ' (n = ' +
                                c.n +
                                ')' +
                                (isNum(c.median)
                                    ? ', half still playing at ' + c.median + ' months'
                                    : ', half still playing beyond the data') +
                                ', ' +
                                pct(last.survival) +
                                ' still in rotation at ' +
                                last.months +
                                ' months'
                            );
                        })
                        .join('; '),
            },
            h(
                'div',
                { class: 'km-plot' },
                h('div', { class: 'km-ylabel', 'aria-hidden': 'true' }, 'still in rotation'),
                h('div', { class: 'line-plot' }, svg, crossings),
                h(
                    'div',
                    { class: 'km-y', 'aria-hidden': 'true' },
                    [1, 0.5, 0].map(function (v) {
                        return h('span', { style: { top: y(v) + '%' } }, pct(v));
                    }),
                ),
            ),
            h('div', { class: 'km-medians', 'aria-hidden': 'true' }, labels),
            h(
                'div',
                { class: 'axis', 'aria-hidden': 'true' },
                h('span', null, '0 months since first play'),
                h('span', null, maxM + ' months'),
            ),
        );
        var months = [];
        curves.forEach(function (c) {
            c.points.forEach(function (p) {
                if (months.indexOf(p.months) < 0) months.push(p.months);
            });
        });
        months.sort(function (a, b) {
            return a - b;
        });
        function at(c, m) {
            var p = c.points
                .filter(function (q) {
                    return q.months <= m;
                })
                .slice(-1)[0];
            return p ? pct(p.survival) : '–';
        }
        var legend = h(
            'p',
            { class: 'legend legend--mono' },
            curves.map(function (c, k) {
                return legendItem(SERIES[k % SERIES.length], c.type + ' · n = ' + c.n);
            }),
            opts.guide
                ? legendItem('s-base', 'guide: half still playing')
                : legendItem('s-base', 'dropped line: median'),
        );
        var toggle = null;
        if (opts.bandToggle) {
            toggle = h(
                'button',
                {
                    type: 'button',
                    class: 'control control--quiet km-bands-toggle',
                    'aria-pressed': 'false',
                },
                'show 95% bands',
            );
            toggle.addEventListener('click', function () {
                var on = toggle.getAttribute('aria-pressed') !== 'true';
                chart.classList.toggle('km--bands', on);
                toggle.setAttribute('aria-pressed', String(on));
                toggle.textContent = on ? 'hide 95% bands' : 'show 95% bands';
            });
        }
        return charted(
            title,
            chart,
            [{ label: 'Months' }].concat(
                curves.map(function (c) {
                    return { label: c.type + ' still in rotation', num: true };
                }),
            ),
            months.map(function (m) {
                return [String(m)].concat(
                    curves.map(function (c) {
                        return at(c, m);
                    }),
                );
            }),
            [legend, toggle],
        );
    }

    // The plain reading of the survival curves, from whether the hazard ratio's interval crosses 1
    // and the medians (the ratio itself is a stat tile): "After 16 months I'm still playing about
    // half of both groups; no real difference yet", or which group fades faster.
    function hazardSentence(hr, medians, curves) {
        if (!isObj(hr) || !isNum(hr.value)) return null;
        var iv =
            Array.isArray(hr.interval) && isNum(hr.interval[0]) && isNum(hr.interval[1])
                ? hr.interval
                : null;
        var crosses = !iv || (iv[0] <= 1 && iv[1] >= 1);
        var med = isObj(medians) ? medians : {};
        if (crosses) {
            var m =
                isNum(med.catalog) && isNum(med.new)
                    ? Math.max(med.catalog, med.new)
                    : isNum(med.catalog)
                      ? med.catalog
                      : isNum(med.new)
                        ? med.new
                        : null;
            if (m !== null)
                return (
                    'After ' +
                    num(m, 1).replace(/\.0$/, '') +
                    " months I'm still playing about half of both groups; no real difference yet."
                );
            var last = list(curves)
                .filter(function (c) {
                    return isObj(c) && list(c.points).length;
                })
                .map(function (c) {
                    var p = c.points[c.points.length - 1];
                    return c.type + ' ' + pct(p.survival) + ' at ' + p.months + ' months';
                });
            return (
                "I'm still playing " +
                (last.length ? last.join(', ') : 'both groups') +
                '; no real difference yet.'
            );
        }
        var faster = hr.value > 1 ? 'new music fades faster.' : 'new music lasts longer.';
        if (isNum(med.catalog) && isNum(med.new))
            return (
                'Half of my catalog discoveries are still in rotation after ' +
                med.catalog +
                ' months, against ' +
                med.new +
                ' for new ones: ' +
                faster
            );
        if (isNum(med.catalog))
            return (
                'Half of my catalog discoveries are still in rotation after ' +
                med.catalog +
                ' months, and over half of the new ones still are: ' +
                faster
            );
        return hr.value > 1
            ? 'New artists leave rotation faster than catalog ones.'
            : 'New artists stay in rotation longer than catalog ones.';
    }
    function longestLine(xs) {
        xs = list(xs)
            .filter(function (p) {
                return isObj(p) && typeof p.artist === 'string' && isNum(p.months);
            })
            .slice(0, 5);
        if (!xs.length) return null;
        return h(
            'p',
            { class: 'ld-small ld-disagree' },
            h('b', null, 'Longest in rotation: '),
            xs
                .map(function (p) {
                    return (
                        p.artist +
                        ' (' +
                        plural(p.months, 'months') +
                        (p.censored ? ', still playing' : '') +
                        ')'
                    );
                })
                .join(', '),
        );
    }
    var PRESYNC_NOTE =
        'artists in the library before the 2023 sync excluded; see the listening page for the ' +
        'version that includes them.';
    // The play-date floor, in the how line's own words: the export records no play before a
    // day, so a rotation that ended before it is invisible (which is why the primary cohort is
    // the artists added after it).
    // The censoring rule: an artist with a play in the last N days before the export is still in
    // rotation. N is read from the how line ("a play in the 60 days before the export"); when the
    // how
    // line carries no number, the pipeline's rule of 60 days (lately/analysis, artist_survival) is
    // used.
    var CENSOR_DAYS_PIPELINE = 60;
    function censorDays(s) {
        var how = isObj(s) && typeof s.how === 'string' ? s.how : '';
        var m =
            /play in the (?:last )?(\d+) days before the export/i.exec(how) ||
            /(\d+) days without (?:a play|one)/i.exec(how);
        return m ? Number(m[1]) : CENSOR_DAYS_PIPELINE;
    }

    function floorNote(v, s) {
        var how = isObj(s) && typeof s.how === 'string' ? s.how : '';
        var sentence = (how.match(/[^.]*\.(?:\s+|$)/g) || [how]).filter(function (t) {
            return /no play before|invisible|floor/i.test(t);
        })[0];
        return sentence ? h('p', { class: 'ld-note' }, sentence.trim()) : null;
    }

    // The credits in analysis.meta.attributions, as text or links, joined by dots.
    function attributionNodes(attrs) {
        return attrs.map(function (x, i) {
            var link = typeof x.url === 'string' && /^https:\/\//.test(x.url);
            return [
                i ? ' · ' : null,
                link
                    ? h('a', { href: x.url, target: '_blank', rel: 'noopener' }, String(x.text))
                    : String(x.text),
            ];
        });
    }

    // ---------- statistics ----------
    // Each entry: n (what n counts), value(stat) -> [text, unit] or null, intervalFmt,
    // draw(values, stat, ctx) -> nodes. Keys are the paths build.py writes.

    var WEEKS = 'weeks';

    function weeklyBench(v) {
        return columns(
            'How many points did I leave on the bench each week?',
            list(v.weekly).map(function (w) {
                return {
                    label: 'wk ' + w.week,
                    title: 'Week ' + w.week,
                    value: w.bench_points,
                    text: num(w.bench_points, 1),
                };
            }),
            { labelHeading: 'Week', valueHeading: 'Points on the bench' },
        );
    }

    // "With any other team's schedule I'd be 3–3 once, 2–4 twice and 1–5 eight times; no schedule
    // would have done better than my own." (or "; N of M schedules would have done better."), from
    // the distribution of records over the league's other schedules.
    var TIMES = [
        '',
        'once',
        'twice',
        'three times',
        'four times',
        'five times',
        'six times',
        'seven times',
        'eight times',
        'nine times',
        'ten times',
    ];
    function timesText(n) {
        return TIMES[n] || n + ' times';
    }
    function scheduleSentence(v) {
        var dist = list(v.distribution).filter(function (d) {
            return isObj(d) && isNum(d.schedules) && d.schedules > 0;
        });
        var parts = dist.map(function (d) {
            return record(d) + ' ' + timesText(d.schedules);
        });
        var text =
            parts.length < 2
                ? parts.join('')
                : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
        var total = dist.reduce(function (a, d) {
            return a + d.schedules;
        }, 0);
        var better = isNum(v.better) ? v.better : 0;
        return (
            "With any other team's schedule I'd be " +
            text +
            '; ' +
            (better === 0
                ? 'no schedule would have done better than my own.'
                : better + ' of ' + total + ' schedules would have done better.')
        );
    }
    // Another team in my league: its label when the file gives one ("Team C"), never a name.
    function otherLabel(t) {
        return typeof t.label === 'string' && t.label ? t.label : 'another team';
    }

    function rankText(rank, size, oneIs) {
        return isNum(rank) && isNum(size) ? rank + ' of ' + size + ' (1 = ' + oneIs + ')' : null;
    }

    function weekdayColumns(title, weekdays, counts, unit) {
        return columns(
            title,
            list(counts).map(function (c, i) {
                return { label: weekdays[i] || String(i), value: c, text: big(c) };
            }),
            { labelHeading: 'Weekday', valueHeading: unit },
        );
    }

    var STATS = {
        // ----- fantasy, per team -----
        'fantasy.teams[].playoff_odds': {
            n: WEEKS,
            value: function (s) {
                return [pct(s.values.playoffs), 'chance to make the playoffs'];
            },
            draw: function (v) {
                return [
                    h(
                        'div',
                        { class: 'meter' },
                        h(
                            'div',
                            { class: 'chance-track', 'aria-hidden': 'true' },
                            h('div', {
                                class: 'chance-bar',
                                style: { width: v.playoffs * 100 + '%' },
                            }),
                        ),
                    ),
                    facts([
                        ['top seed', pct(v.top_seed)],
                        ['first-round bye', isNum(v.bye) ? pct(v.bye) : null],
                        ['expected wins', num(v.expected_wins, 1)],
                        ['weeks left', v.remaining_weeks],
                        ['playoff spots', v.playoff_teams],
                        ['simulated seasons', big(v.simulations)],
                    ]),
                ];
            },
        },
        'fantasy.teams[].record_vs_median': {
            n: WEEKS,
            draw: function (v) {
                return h(
                    'div',
                    { class: 'ld-records' },
                    recordBar("against the week's median", v.vs_median),
                    recordBar('all-play', v.all_play),
                );
            },
        },
        'fantasy.teams[].margins': {
            n: WEEKS,
            value: function (s) {
                return [signed(s.values.median, 1), 'points, median margin'];
            },
            draw: function (v) {
                var rows = list(v.margins);
                var max = Math.max.apply(
                    null,
                    rows
                        .map(function (m) {
                            return Math.abs(m.margin);
                        })
                        .concat(1),
                );
                var chart = h(
                    'div',
                    {
                        class: 'ld-margins',
                        role: 'img',
                        'aria-label':
                            'Margin each week: ' +
                            rows
                                .map(function (m) {
                                    return (
                                        'week ' +
                                        m.week +
                                        ' ' +
                                        (m.margin > 0 ? 'won' : m.margin < 0 ? 'lost' : 'tied') +
                                        ' by ' +
                                        num(Math.abs(m.margin), 1)
                                    );
                                })
                                .join('; '),
                    },
                    rows.map(function (m) {
                        var kind = m.margin > 0 ? 'W' : m.margin < 0 ? 'L' : 'T';
                        var w = (Math.abs(m.margin) / max) * 50;
                        return h(
                            'div',
                            {
                                class: 'ld-margin-row' + (m.margin < 0 ? ' bar--neg' : ''),
                                title: 'Week ' + m.week + ': ' + signed(m.margin, 2),
                            },
                            h('span', { class: 'ld-margin-week' }, 'wk ' + m.week),
                            resultSquare(kind),
                            h(
                                'span',
                                { class: 'ld-margin-track' },
                                h('span', { class: 'bar-zero', style: { left: '50%' } }),
                                h('span', {
                                    class: 'bar-fill',
                                    style: {
                                        left: (m.margin < 0 ? 50 - w : 50) + '%',
                                        width: w + '%',
                                    },
                                }),
                            ),
                            h('span', { class: 'bar-value' }, signed(m.margin, 1)),
                        );
                    }),
                );
                return [
                    charted(
                        'By how much did I win or lose each week?',
                        chart,
                        [{ label: 'Week' }, { label: 'Result' }, { label: 'Margin', num: true }],
                        rows.map(function (m) {
                            return [
                                'Week ' + m.week,
                                m.margin > 0 ? 'W' : m.margin < 0 ? 'L' : 'T',
                                signed(m.margin, 2),
                            ];
                        }),
                    ),
                    facts([
                        ['close games (under 5 points)', String(v.under_5)],
                        ['record in close games', v.under_5 ? record(v.under_5_record) : null],
                    ]),
                ];
            },
        },
        'fantasy.teams[].schedule_what_if': {
            n: WEEKS,
            value: function (s) {
                return [record(s.values.real), 'my real record'];
            },
            draw: function (v) {
                return h('p', { class: 'ld-sentence' }, scheduleSentence(v));
            },
        },
        'fantasy.teams[].strength_of_schedule': {
            n: WEEKS,
            value: function (s) {
                return [signed(s.value, 2), 'points a week above the league average'];
            },
            draw: function (v) {
                return facts([
                    ["my opponents' average", num(v.opponents_average, 2)],
                    ['league average', num(v.league_average, 2)],
                    ['rank', rankText(v.league_rank, v.league_size, 'hardest')],
                ]);
            },
        },
        'fantasy.teams[].lineup_efficiency': {
            n: WEEKS,
            value: function (s) {
                return [num(s.value, 1), 'points left on the bench this season'];
            },
            draw: function (v) {
                var slots = isObj(v.regret_by_slot) ? Object.keys(v.regret_by_slot) : [];
                var hits = isObj(v.waiver_hits_left_on_bench) ? v.waiver_hits_left_on_bench : null;
                return [
                    facts([
                        [
                            'rank',
                            rankText(v.league_rank, v.league_size, 'fewest left on the bench'),
                        ],
                        ['league average', num(v.league_average, 1)],
                    ]),
                    // Apart from the lineup total: adds that beat their baseline but sat on my
                    // bench.
                    hits
                        ? h(
                              'p',
                              { class: 'ld-sentence' },
                              h('b', null, 'Hit, left on the bench: '),
                              hits.adds === 0
                                  ? 'no waiver adds.'
                                  : plural(hits.adds, 'adds').replace(/^1 adds$/, '1 add') +
                                        ', ' +
                                        num(hits.benched_points, 1) +
                                        ' points on my bench, ' +
                                        signed(hits.points_available, 2) +
                                        ' net points available.',
                          )
                        : null,
                    weeklyBench(v),
                    slots.length
                        ? bars(
                              'Which slot cost me the most points?',
                              slots.map(function (k) {
                                  return {
                                      label: k,
                                      value: v.regret_by_slot[k],
                                      text: num(v.regret_by_slot[k], 1),
                                  };
                              }),
                              { labelHeading: 'Slot', valueHeading: 'Points' },
                          )
                        : null,
                ];
            },
        },
        'fantasy.teams[].start_sit': {
            n: WEEKS,
            value: function (s) {
                return [pct(s.value), 'of close calls right'];
            },
            draw: function (v) {
                return facts([['close calls right', v.right + ' of ' + v.total]]);
            },
        },
        'fantasy.teams[].consistency': {
            n: WEEKS,
            value: function (s) {
                return [num(s.value, 3), 'spread of weekly scores (lower = steadier)'];
            },
            draw: function (v) {
                return facts([
                    ['rank', rankText(v.league_rank, v.league_size, 'steadiest')],
                    ['league average', num(v.league_average, 3)],
                ]);
            },
        },
        'fantasy.teams[].draft_value': {
            n: WEEKS,
            wide: true,
            draw: function (v) {
                var cols = [
                    { label: 'Player' },
                    { label: 'Pos' },
                    { label: 'Pick', num: true },
                    { label: 'Rank, points per game', num: true },
                    { label: 'Difference', num: true },
                    { label: 'Points per game', num: true },
                ];
                function rows(xs) {
                    return list(xs).map(function (p) {
                        return [
                            p.player,
                            p.position,
                            String(p.pick),
                            String(p.ppg_rank),
                            signed(p.difference, 0),
                            num(p.points_per_game, 2),
                        ];
                    });
                }
                return [
                    facts([['picks ranked', v.ranked + ' of ' + v.my_picks]]),
                    table('Best value for where they were drafted', cols, rows(v.best), {
                        showCaption: true,
                    }),
                    table('Worst value for where they were drafted', cols, rows(v.worst), {
                        showCaption: true,
                    }),
                ];
            },
        },
        'fantasy.teams[].waiver_impact': {
            n: WEEKS,
            value: function (s) {
                return [num(s.value, 1), "points from players I didn't draft"];
            },
            draw: function (v) {
                return [
                    facts([
                        ["share of my starters' points", pct(v.share)],
                        ['players', String(v.players)],
                    ]),
                    list(v.top).length
                        ? table(
                              "Most points from players I didn't draft",
                              [{ label: 'Player' }, { label: 'Points', num: true }],
                              list(v.top).map(function (p) {
                                  return [p.player, num(p.points, 1)];
                              }),
                              { showCaption: true },
                          )
                        : null,
                ];
            },
        },
        'fantasy.teams[].waiver_adds': {
            n: 'adds judged',
            wide: true,
            value: function (s) {
                return [pct(s.value), 'hit rate'];
            },
            intervalFmt: function (x) {
                return pct(x);
            },
            draw: function (v) {
                // Every add (values.all, in the file's order), the best and worst three marked by
                // their flags, in words and by a filled or outlined triangle, never colour alone.
                // An older file has only the best and worst lists, so those are shown. Only
                // players are named: the team a dropped player went to is never shown.
                var rows = [],
                    seen = {};
                if (Array.isArray(v.all)) {
                    rows = v.all.map(function (a) {
                        return {
                            add: a,
                            marks: [
                                a.best === true ? 'best' : null,
                                a.worst === true ? 'worst' : null,
                            ].filter(Boolean),
                        };
                    });
                } else
                    [
                        ['best', list(v.best)],
                        ['worst', list(v.worst)],
                    ].forEach(function (g) {
                        g[1].forEach(function (a) {
                            var key = a.week + '|' + a.added;
                            if (seen[key]) {
                                seen[key].marks.push(g[0]);
                                return;
                            }
                            seen[key] = { add: a, marks: [g[0]] };
                            rows.push(seen[key]);
                        });
                    });
                rows.sort(function (a, b) {
                    return a.add.week - b.add.week;
                });
                function bid(sp) {
                    return isObj(sp) && sp.kind === 'faab' && isNum(sp.amount)
                        ? '$' + sp.amount
                        : '–';
                }
                // A league without bids (waiver priority, free agents) gets no Bid column.
                var anyBid = rows.some(function (r) {
                    return bid(r.add.spent) !== '–';
                });
                function mark(m) {
                    if (!m.length) return null;
                    return h(
                        'span',
                        { class: 'ld-mark ld-mark--' + m[0] },
                        h('span', { 'aria-hidden': 'true' }, m[0] === 'best' ? '▲ ' : '▽ '),
                        m.join(' and '),
                    );
                }
                var counts = isObj(v.counts) ? v.counts : {};
                var t = h(
                    'div',
                    { class: 'table table--depth' },
                    h(
                        'table',
                        null,
                        h(
                            'caption',
                            { class: 'table-caption' },
                            (Array.isArray(v.all) ? 'Every add' : 'Adds') +
                                ', best and worst three marked',
                        ),
                        h(
                            'thead',
                            null,
                            h(
                                'tr',
                                null,
                                (anyBid
                                    ? ['Week', 'Added', 'Dropped', 'Bid', 'Class']
                                    : ['Week', 'Added', 'Dropped', 'Class']
                                ).map(function (c) {
                                    return h(
                                        'th',
                                        {
                                            scope: 'col',
                                            class: c === 'Week' || c === 'Bid' ? 'num' : null,
                                        },
                                        c,
                                    );
                                }),
                            ),
                        ),
                        h(
                            'tbody',
                            null,
                            rows.map(function (r) {
                                var a = r.add;
                                return h(
                                    'tr',
                                    null,
                                    h('td', { class: 'num' }, String(a.week)),
                                    h(
                                        'th',
                                        { scope: 'row' },
                                        a.added + (a.position ? ' (' + a.position + ')' : ''),
                                        r.marks.length ? [h('br'), mark(r.marks)] : null,
                                    ),
                                    h('td', null, a.dropped || '–'),
                                    anyBid ? h('td', { class: 'num' }, bid(a.spent)) : null,
                                    h('td', null, String(a['class'])),
                                );
                            }),
                        ),
                    ),
                );
                append(t, collapseRows(t, t.querySelectorAll('tbody tr')));
                return [
                    facts([
                        ['net points available', signed(v.net_points_available, 2)],
                        ['net points captured', signed(v.net_points_captured, 2)],
                        ['adds a week', num(v.adds_per_week, 1)],
                        ['adds', String(v.adds)],
                        ['judged', String(v.judged)],
                    ]),
                    facts(
                        [
                            'hit, captured',
                            'hit, left on the bench',
                            'miss',
                            'stash',
                            'insurance',
                        ].map(function (k) {
                            return [k, isNum(counts[k]) ? String(counts[k]) : null];
                        }),
                    ),
                    t,
                    isNum(v.adds) && v.adds > rows.length
                        ? h(
                              'p',
                              { class: 'ld-small' },
                              'The data lists the best and worst three of ' +
                                  v.adds +
                                  ' adds; the other ' +
                                  (v.adds - rows.length) +
                                  " aren't in it.",
                          )
                        : null,
                ];
            },
        },
        'fantasy.teams[].position_share': {
            n: WEEKS,
            draw: function (v) {
                need(isObj(v.mine) && isObj(v.league), 'position_share');
                return bars(
                    "Where do my starters' points come from, by position?",
                    Object.keys(v.mine).map(function (k) {
                        return {
                            label: k,
                            value: v.mine[k],
                            text: pct(v.mine[k]),
                            ref: v.league[k],
                            refText: isNum(v.league[k]) ? pct(v.league[k]) : null,
                        };
                    }),
                    {
                        labelHeading: 'Position',
                        valueHeading: 'mine',
                        refHeading: 'league average',
                        subject: true,
                    },
                );
            },
        },
        'fantasy.quadrant': {
            n: WEEKS,
            wide: true,
            draw: function (v) {
                return quadrant(v, { trailToggle: true });
            },
        },
        'fantasy.manager_score.components.draft': managerComponent(
            'Draft',
            'my drafted starters against the median player taken in the same round',
        ),
        'fantasy.manager_score.components.lineup': managerComponent(
            'Lineup',
            'my lineup against the best possible one from my roster',
        ),
        'fantasy.manager_score.components.moves': managerComponent(
            'Moves',
            'adds, drops and trades against keeping my drafted roster',
        ),
        'fantasy.manager_score.components.strength': managerComponent(
            'Strength',
            'my starters against the league average',
            function (x) {
                return share2(x) + ' all-play';
            },
        ),
        'fantasy.manager_score.composite': {
            n: WEEKS,
            label: 'Composite',
            value: function (s) {
                return [pct(s.value), 'of managers across my leagues score lower'];
            },
            intervalFmt: function (x) {
                return pct(x);
            },
            draw: function (v, s) {
                return h(
                    'div',
                    { class: 'meter' },
                    h(
                        'div',
                        { class: 'chance-track', 'aria-hidden': 'true' },
                        h('div', {
                            class: 'chance-bar',
                            style: { width: Math.max(0, Math.min(1, s.value)) * 100 + '%' },
                        }),
                    ),
                );
            },
        },
        'fantasy.teams[].acquisition_split': {
            n: WEEKS,
            draw: function (v) {
                var keys = ['draft', 'waiver', 'trade', 'other'].filter(function (k) {
                    return isObj(v[k]) && isNum(v[k].mine);
                });
                return bars(
                    'How did the players scoring my points arrive?',
                    keys.map(function (k) {
                        return {
                            label: k,
                            value: v[k].mine,
                            text: num(v[k].mine, 1),
                            ref: v[k].league_median,
                            refText: isNum(v[k].league_median) ? num(v[k].league_median, 1) : null,
                        };
                    }),
                    {
                        labelHeading: 'Arrived by',
                        valueHeading: 'mine',
                        refHeading: 'league median',
                        subject: true,
                    },
                );
            },
        },
        'fantasy.teams[].draft': {
            n: WEEKS,
            wide: true,
            value: function (s) {
                return isNum(s.value)
                    ? [signed(s.value, 1), 'points above the round baseline, all picks together']
                    : null;
            },
            draw: function (v) {
                var picks = list(v.picks).filter(isObj);
                var best = null,
                    worst = null;
                picks.forEach(function (p) {
                    if (!isNum(p.residual)) return;
                    if (!best || p.residual > best.residual) best = p;
                    if (!worst || p.residual < worst.residual) worst = p;
                });
                return [
                    facts([
                        [
                            'best value',
                            best
                                ? best.player +
                                  ' (round ' +
                                  best.round +
                                  ', ' +
                                  signed(best.residual, 1) +
                                  ')'
                                : null,
                        ],
                        [
                            'worst value',
                            worst
                                ? worst.player +
                                  ' (round ' +
                                  worst.round +
                                  ', ' +
                                  signed(worst.residual, 1) +
                                  ')'
                                : null,
                        ],
                    ]),
                    table(
                        'Every pick against the median for its round',
                        [
                            { label: 'Round', num: true },
                            { label: 'Pick', num: true },
                            { label: 'Player' },
                            { label: 'Points to date', num: true },
                            { label: 'Round baseline', num: true },
                            { label: 'Residual', num: true },
                        ],
                        picks.map(function (p) {
                            return [
                                String(p.round),
                                String(p.pick),
                                String(p.player),
                                num(p.points_to_date, 1),
                                num(p.round_baseline, 1),
                                signed(p.residual, 1),
                            ];
                        }),
                        { showCaption: true },
                    ),
                ];
            },
        },
        'fantasy.platforms.*.projection_accuracy': {
            n: WEEKS,
            value: function (s) {
                return [signed(s.value, 2), 'points per player-week (bias)'];
            },
            intervalFmt: function (x) {
                return signed(x, 2);
            },
            draw: function (v) {
                var pos = isObj(v.by_position) ? Object.keys(v.by_position) : [];
                return [
                    facts([
                        ['mean absolute error', num(v.mae, 2) + ' points'],
                        ['player-weeks', big(v.player_weeks)],
                    ]),
                    pos.length
                        ? table(
                              'By position',
                              [
                                  { label: 'Position' },
                                  { label: 'Bias', num: true },
                                  { label: 'Mean absolute error', num: true },
                                  { label: 'Player-weeks', num: true },
                              ],
                              pos.map(function (k) {
                                  var p = v.by_position[k];
                                  return [k, signed(p.bias, 2), num(p.mae, 2), String(p.n)];
                              }),
                              { showCaption: true },
                          )
                        : null,
                ];
            },
        },

        // ----- grading -----
        'grading.win_chance': {
            n: 'predictions',
            // Not enough until twenty predictions are stored, whatever the block's status says.
            gate: function (s, a) {
                var stored =
                    isObj(a.grading) && isNum(a.grading.predictions_stored)
                        ? a.grading.predictions_stored
                        : 0;
                return stored < 20 ? { status: 'not enough data yet', n: stored, min_n: 20 } : null;
            },
            value: function (s) {
                return [num(s.values.brier, 3), 'Brier score (always saying 50% scores 0.25)'];
            },
            draw: function (v) {
                return table(
                    'Predicted win chance against how often I won',
                    [
                        { label: 'Predicted chance' },
                        { label: 'Predictions', num: true },
                        { label: 'Mean predicted', num: true },
                        { label: 'Won', num: true },
                    ],
                    list(v.bins).map(function (b) {
                        return [
                            pct(b.from) + ' to ' + pct(b.to),
                            String(b.n),
                            isNum(b.predicted) ? pct(b.predicted) : '–',
                            isNum(b.observed) ? pct(b.observed) : '–',
                        ];
                    }),
                    { showCaption: true },
                );
            },
        },
        'grading.playoff_odds[].odds_over_time': {
            n: 'seasons',
            draw: function (v) {
                return [
                    facts([
                        [
                            'made the playoffs',
                            v.made_playoffs === true
                                ? 'yes'
                                : v.made_playoffs === false
                                  ? 'no'
                                  : null,
                        ],
                        ['final seed', isNum(v.final_seed) ? String(v.final_seed) : null],
                    ]),
                    table(
                        'Odds before each week',
                        [
                            { label: 'Week' },
                            { label: 'Playoffs', num: true },
                            { label: 'Top seed', num: true },
                            { label: 'Bye', num: true },
                            { label: 'Expected wins', num: true },
                        ],
                        list(v.weeks).map(function (w) {
                            return [
                                'Week ' + w.week,
                                pct(w.playoffs),
                                pct(w.top_seed),
                                isNum(w.bye) ? pct(w.bye) : '–',
                                num(w.expected_wins, 1),
                            ];
                        }),
                        { showCaption: true },
                    ),
                ];
            },
        },

        // ----- listening -----
        'listening.album_half_life': {
            n: 'albums',
            value: function (s) {
                return [
                    num(s.values.median_half_life_days, 1) + ' days',
                    "median half-life of an album's plays",
                ];
            },
            draw: function (v) {
                var c = v.current;
                if (!isObj(c)) return null;
                var ok = c.status === 'ok' && isNum(c.half_life_days);
                return h(
                    'div',
                    { class: 'ld-callout' },
                    h('p', { class: 'ld-callout-title' }, "This week's most-played album"),
                    h(
                        'p',
                        { class: 'ld-callout-body' },
                        h('b', null, String(c.album)),
                        ' by ' + c.artist,
                    ),
                    facts([
                        [
                            'half-life so far',
                            ok ? num(c.half_life_days, 1) + ' days' : String(c.status),
                        ],
                        [
                            'interval',
                            ok
                                ? interval(c.half_life_interval, function (x) {
                                      return num(x, 1);
                                  })
                                : null,
                        ],
                        ['plays, last 7 days', String(c.plays_last_7_days)],
                        ['days since its first play', String(c.days_so_far)],
                    ]),
                );
            },
        },
        'listening.discovery': {
            n: 'months',
            draw: function (v) {
                return columns(
                    "How much of each month's listening went to new artists?",
                    list(v.months).map(function (m) {
                        return {
                            label: monthText(m.month, true),
                            title: monthText(m.month),
                            value: m.share,
                            text: pct(m.share),
                        };
                    }),
                    { labelHeading: 'Month', valueHeading: 'Share by new artists' },
                );
            },
        },
        'listening.album_listener': {
            n: 'plays',
            value: function (s) {
                return isNum(s.value)
                    ? [pct(s.value), "of plays follow the album's previous track"]
                    : null;
            },
        },
        'listening.concentration': {
            n: 'months',
            draw: function (v) {
                var d = v.most_in_a_day;
                return [
                    columns(
                        'How much of each month went to my top five artists?',
                        list(v.months).map(function (m) {
                            return {
                                label: monthText(m.month, true),
                                title: monthText(m.month),
                                value: m.top_five_share,
                                text: pct(m.top_five_share),
                            };
                        }),
                        { labelHeading: 'Month', valueHeading: "Top five's share" },
                    ),
                    isObj(d)
                        ? facts([
                              [
                                  'most plays of one track in a day',
                                  d.plays +
                                      ', “' +
                                      d.track +
                                      '” by ' +
                                      d.artist +
                                      ', ' +
                                      dateText(d.date),
                              ],
                          ])
                        : null,
                ];
            },
        },
        'listening.heatmap': {
            n: 'days',
            draw: function (v) {
                var days = list(v.weekdays),
                    grid = list(v.grid);
                var max = Math.max.apply(
                    null,
                    grid
                        .map(function (r) {
                            return Math.max.apply(null, list(r).concat(0));
                        })
                        .concat(0),
                );
                var chart = h(
                    'div',
                    {
                        class: 'ld-heat',
                        role: 'img',
                        'aria-label':
                            'Plays by weekday and hour, Pacific. ' +
                            days
                                .map(function (d, i) {
                                    return (
                                        d +
                                        ': ' +
                                        list(grid[i]).reduce(function (a, b) {
                                            return a + b;
                                        }, 0) +
                                        ' plays'
                                    );
                                })
                                .join('; '),
                    },
                    days.map(function (d, i) {
                        return h(
                            'div',
                            { class: 'ld-heat-row' },
                            h('span', { class: 'ld-heat-day' }, d),
                            h(
                                'span',
                                { class: 'ld-heat-cells' },
                                list(grid[i]).map(function (c, hr) {
                                    return h('span', {
                                        class: 'heat-cell heat-' + heatLevel(c, max),
                                        title: d + ' ' + hr + ':00, ' + c + ' plays',
                                    });
                                }),
                            ),
                        );
                    }),
                    h(
                        'div',
                        { class: 'ld-heat-row ld-heat-axis', 'aria-hidden': 'true' },
                        h('span', { class: 'ld-heat-day' }),
                        h(
                            'span',
                            { class: 'ld-heat-cells' },
                            [0, 6, 12, 18].map(function (hr) {
                                return h(
                                    'span',
                                    { style: { gridColumn: hr + 1 + ' / span 6' } },
                                    hr + ':00',
                                );
                            }),
                        ),
                    ),
                );
                var hours = [];
                for (var hr = 0; hr < 24; hr++) hours.push({ label: hr + ':00', num: true });
                var t = charted(
                    'When do I listen, by weekday and hour?',
                    chart,
                    [{ label: 'Weekday' }].concat(hours),
                    days.map(function (d, i) {
                        return [d].concat(list(grid[i]).map(String));
                    }),
                );
                return [
                    t,
                    facts([
                        ['plays a weekday', num(v.per_weekday, 1)],
                        ['plays a weekend day', num(v.per_weekend_day, 1)],
                    ]),
                ];
            },
        },
        'listening.genre_mix': {
            n: 'months',
            // Under three months the table would be a row or two: it waits, under the small-sample
            // policy.
            gate: function (s) {
                var m = isObj(s.values) ? list(s.values.months).length : 0;
                return s.status === 'ok' && m < 3
                    ? { status: 'not enough data yet', n: m, min_n: 3 }
                    : null;
            },
            draw: function (v) {
                var months = list(v.months),
                    totals = {};
                months.forEach(function (m) {
                    Object.keys(m.genres || {}).forEach(function (g) {
                        totals[g] = (totals[g] || 0) + m.genres[g] * m.plays;
                    });
                });
                var genres = Object.keys(totals).sort(function (a, b) {
                    return totals[b] - totals[a];
                });
                return table(
                    "Share of each month's plays by genre",
                    [{ label: 'Month' }, { label: 'Plays', num: true }].concat(
                        genres.map(function (g) {
                            return { label: g, num: true };
                        }),
                    ),
                    months.map(function (m) {
                        return [monthText(m.month), big(m.plays)].concat(
                            genres.map(function (g) {
                                return isNum((m.genres || {})[g]) ? pct(m.genres[g]) : '–';
                            }),
                        );
                    }),
                    { showCaption: true, cls: 'table--wide' },
                );
            },
        },
        'listening.comebacks': {
            n: 'months',
            draw: function (v) {
                var xs = list(v.comebacks);
                return xs.length
                    ? table(
                          'Comebacks, newest first',
                          [
                              { label: 'Artist' },
                              { label: 'Month' },
                              { label: 'Plays', num: true },
                              { label: 'Months away', num: true },
                          ],
                          xs.map(function (c) {
                              return [
                                  c.artist,
                                  monthText(c.month),
                                  String(c.plays),
                                  String(c.months_away),
                              ];
                          }),
                          { showCaption: true },
                      )
                    : h('p', { class: 'panel-empty' }, 'None so far.');
            },
        },
        'listening.first_repeat': {
            n: 'tracks',
            value: function (s) {
                return [
                    hoursText(s.values.median_hours),
                    "median from a new track's first play to its second",
                ];
            },
            draw: function (v) {
                return facts([['new tracks played twice', v.repeated + ' of ' + v.new_tracks]]);
            },
        },
        'cross.rhythm.plays': {
            n: 'plays',
            draw: function (v, s, ctx) {
                var hours = list(v.by_hour);
                return [
                    weekdayColumns(
                        'On which weekdays do I listen?',
                        ctx.weekdays,
                        v.by_weekday,
                        'Plays',
                    ),
                    hours.length
                        ? columns(
                              'At which hours do I listen?',
                              hours.map(function (c, i) {
                                  return {
                                      label: String(i),
                                      title: i + ':00',
                                      value: c,
                                      text: big(c),
                                  };
                              }),
                              { labelHeading: 'Hour', valueHeading: 'Plays', every: 6 },
                          )
                        : null,
                ];
            },
        },
        'listening.artist_survival': survivalSpec(
            'Artists first played since the 2023 Apple Music sync',
        ),
        'listening.artist_survival_all': Object.assign(
            survivalSpec('Every artist, those in the library before the 2023 sync included'),
            { label: 'Counting the artists from before the 2023 sync too' },
        ),
        'listening.album_listening': {
            n: 'albums',
            // The share of albums played through: the statistic's value, else from the rows (Gini
            // under 0.4).
            value: function (s) {
                var rows = isObj(s.values)
                    ? list(s.values.rows).filter(function (r) {
                          return isObj(r) && isNum(r.gini);
                      })
                    : [];
                var share = isNum(s.value)
                    ? s.value
                    : rows.length
                      ? rows.filter(function (r) {
                            return r.gini < 0.4;
                        }).length / rows.length
                      : null;
                return isNum(share)
                    ? [
                          pct(share),
                          'of my albums get played through (Gini of plays across tracks under 0.4)',
                      ]
                    : null;
            },
            draw: function (v) {
                var rows = list(v.rows)
                    .filter(function (r) {
                        return isObj(r) && isNum(r.gini) && typeof r.album === 'string';
                    })
                    .slice()
                    .sort(function (a, b) {
                        return a.gini - b.gini;
                    });
                return [
                    facts([
                        ['albums', isNum(v.albums) ? big(v.albums) : null],
                        ['played through (Gini under 0.4)', isNum(v.even) ? big(v.even) : null],
                        ['median Gini', isNum(v.median_gini) ? num(v.median_gini, 2) : null],
                    ]),
                    rows.length
                        ? table(
                              "Each album's Gini of plays across its tracks " +
                                  '(low: played through; high: one or two tracks)',
                              [
                                  { label: 'Album' },
                                  { label: 'Artist' },
                                  { label: 'Gini', num: true },
                                  { label: 'Plays', num: true },
                              ],
                              rows.map(function (r) {
                                  return [
                                      r.album,
                                      String(r.artist),
                                      num(r.gini, 2),
                                      isNum(r.plays) ? big(r.plays) : '–',
                                  ];
                              }),
                              { showCaption: true },
                          )
                        : null,
                ];
            },
        },
        'listening.discovery_direction': {
            n: 'artists',
            value: function (s) {
                var share = isNum(s.value)
                    ? s.value
                    : isObj(s.values) && isNum(s.values.share_back)
                      ? s.values.share_back
                      : null;
                return isNum(share)
                    ? [
                          pct(share),
                          'of the tracks I added were at least 5 years old when added (digging ' +
                              'back)',
                      ]
                    : null;
            },
            draw: function (v) {
                var years = list(v.by_year).filter(function (y) {
                    return isObj(y) && isNum(y.share_dig_back);
                });
                return [
                    facts([
                        ['digging back', isNum(v.back) ? big(v.back) + ' additions' : null],
                        ['keeping up', isNum(v.keep_up) ? big(v.keep_up) + ' additions' : null],
                        [
                            'median gap to the release years',
                            isNum(v.median_release_gap_years)
                                ? num(v.median_release_gap_years, 1) + ' years'
                                : null,
                        ],
                        [
                            'left out: added by the sync, not found',
                            isNum(v.sync_additions_left_out)
                                ? big(v.sync_additions_left_out)
                                : null,
                        ],
                    ]),
                    years.length
                        ? bars(
                              'Was I digging back or keeping up, by the year I found them?',
                              years.map(function (y) {
                                  return {
                                      label:
                                          String(y.year) +
                                          (isNum(y.n) ? ' · ' + big(y.n) + ' additions' : ''),
                                      value: y.share_dig_back,
                                      text: pct(y.share_dig_back),
                                  };
                              }),
                              { labelHeading: 'Year', valueHeading: 'Digging back' },
                          )
                        : null,
                ];
            },
        },
        'listening.entropy': {
            n: 'months',
            value: function (s) {
                return isNum(s.value)
                    ? [num(s.value, 2) + ' bits', 'entropy of plays across artists, latest month']
                    : null;
            },
            draw: function (v) {
                // By week while the archive has under three months, by month after that.
                var months = list(v.months).filter(isObj),
                    weeks = list(v.weeks).filter(isObj);
                var weekly = weeks.length > 0 && months.length < 3;
                var rows = weekly ? weeks : months;
                function eff(r) {
                    return isNum(r.effective_artists)
                        ? r.effective_artists
                        : Math.pow(2, r.entropy_bits);
                }
                return rows.length
                    ? columns(
                          'How many artists was I really listening to, by ' +
                              (weekly ? 'week' : 'month') +
                              '?',
                          rows.map(function (r) {
                              return {
                                  label: weekly
                                      ? dateText(r.week_start, false)
                                      : monthText(r.month, true),
                                  title:
                                      (weekly
                                          ? 'week of ' + dateText(r.week_start)
                                          : monthText(r.month)) +
                                      ' (' +
                                      plural(r.plays, 'plays') +
                                      ', ' +
                                      plural(r.artists, 'artists') +
                                      ')',
                                  value: eff(r),
                                  text: num(eff(r), 1),
                              };
                          }),
                          {
                              labelHeading: weekly ? 'Week of' : 'Month',
                              valueHeading: 'Effective artists',
                          },
                      )
                    : null;
            },
        },
        'listening.nostalgia': {
            n: 'months',
            value: function (s) {
                return isNum(s.value)
                    ? [
                          String(Math.round(s.value)),
                          'median release year of what I played, latest month',
                      ]
                    : null;
            },
            draw: function (v) {
                var months = list(v.months).filter(isObj),
                    weeks = list(v.weeks).filter(isObj);
                var weekly = weeks.length > 0 && months.length < 3;
                var rows = (weekly ? weeks : months).filter(function (r) {
                    return isNum(r.median_release_year);
                });
                return rows.length
                    ? lineChart(
                          'How old was the music I played, by ' + (weekly ? 'week' : 'month') + '?',
                          rows.map(function (r) {
                              return {
                                  label: weekly ? dateText(r.week_start) : monthText(r.month),
                                  value: r.median_release_year,
                              };
                          }),
                          function (x) {
                              return String(Math.round(x));
                          },
                      )
                    : null;
            },
        },
        'listening.enduring': {
            n: 'artists',
            draw: function (v) {
                var lib = isObj(v.library) ? v.library : {};
                return [
                    facts([
                        ['artists in the library', isNum(lib.artists) ? big(lib.artists) : null],
                        ['lifetime plays', isNum(lib.plays) ? big(lib.plays) : null],
                        [
                            'library since',
                            typeof lib.since === 'string' ? monthText(lib.since) : null,
                        ],
                    ]),
                    bars(
                        'Which artists have lasted, in plays a year?',
                        list(v.artists).map(function (a) {
                            return {
                                label: a.artist,
                                value: a.plays_per_year,
                                text:
                                    big(a.plays_per_year) +
                                    ' (' +
                                    big(a.plays) +
                                    ' over ' +
                                    num(a.years, 1) +
                                    ' years)',
                            };
                        }),
                        { labelHeading: 'Artist', valueHeading: 'Plays a year' },
                    ),
                ];
            },
        },
        'listening.retention_new_artists': {
            n: 'months',
            value: function (s) {
                return isNum(s.value)
                    ? [pct(s.value), "of a month's new artists played again within 30 days, latest"]
                    : null;
            },
            draw: function (v) {
                var months = list(v.months);
                return months.length
                    ? multiLine(
                          "Do I keep playing a month's new artists 30 and 90 days later?",
                          months.map(function (m) {
                              return monthText(m.month);
                          }),
                          [
                              {
                                  name: 'after 30 days',
                                  values: months.map(function (m) {
                                      return m.share_30d;
                                  }),
                              },
                              {
                                  name: 'after 90 days',
                                  values: months.map(function (m) {
                                      return m.share_90d;
                                  }),
                              },
                          ],
                          { fmt: pct, labelHeading: 'Month', height: 110 },
                      )
                    : null;
            },
        },

        // ----- lifting -----
        'lifting.body_weight_rate': {
            n: 'weigh-ins',
            value: function (s) {
                return [signed(s.value, 2), 'lb a week since the cut started'];
            },
            intervalFmt: function (x) {
                return signed(x, 2);
            },
            draw: function (v) {
                return facts([
                    ['cut started', v.cut_start ? dateText(v.cut_start) : null],
                    ['first weigh-in', num(v.first, 1) + ' lb'],
                    ['latest', num(v.latest, 1) + ' lb'],
                    ['weigh-ins', String(v.weigh_ins)],
                ]);
            },
        },
        'lifting.strength_kept.*': {
            n: 'weigh-ins',
            value: function (s) {
                return [num(s.value, 2), 'lb of e1RM kept per lb lost'];
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v) {
                function iv(x) {
                    return interval(x, function (y) {
                        return signed(y, 1);
                    });
                }
                return facts([
                    [
                        'e1RM change',
                        signed(v.e1rm_change, 1) +
                            ' lb' +
                            (iv(v.e1rm_change_interval)
                                ? ' (' + iv(v.e1rm_change_interval) + ')'
                                : ''),
                    ],
                    [
                        'body weight change',
                        signed(v.weight_change, 1) +
                            ' lb' +
                            (iv(v.weight_change_interval)
                                ? ' (' + iv(v.weight_change_interval) + ')'
                                : ''),
                    ],
                    ['days since the cut started', String(v.days)],
                    ['sessions', String(v.sessions)],
                ]);
            },
        },
        'lifting.progress.*': {
            n: 'sessions',
            value: function (s) {
                return [signed(s.value, 1), 'lb a month, estimated one-rep max'];
            },
            intervalFmt: function (x) {
                return signed(x, 1);
            },
            draw: function (v) {
                // A lift with too few recent sessions has nulls here; those rows are left out.
                var l8 =
                    isObj(v.last_8_weeks) && isNum(v.last_8_weeks.lb_per_month)
                        ? v.last_8_weeks
                        : null;
                return facts([
                    [
                        'last 8 weeks',
                        l8
                            ? (v.plateau ? 'plateau' : String(l8.direction)) +
                              ', ' +
                              signed(l8.lb_per_month, 1) +
                              ' lb a month'
                            : null,
                    ],
                    [
                        'its interval',
                        l8
                            ? interval(l8.interval, function (x) {
                                  return signed(x, 1);
                              })
                            : null,
                    ],
                    ['sessions in those weeks', l8 ? String(l8.sessions) : null],
                    [
                        'sessions a week',
                        isNum(v.sessions_per_week) ? num(v.sessions_per_week, 1) : null,
                    ],
                ]);
            },
        },
        'lifting.strength_index': {
            n: WEEKS,
            value: function (s) {
                return isNum(s.value)
                    ? [num(s.value, 1), "strength index (the cut's first week = 100)"]
                    : null;
            },
            draw: function (v) {
                // A week without a weigh-in has a null body weight; each line skips those points.
                var weeks = list(v.weeks).filter(function (w) {
                    return isObj(w) && (isNum(w.strength) || isNum(w.body_weight));
                });
                function latest(key) {
                    if (isObj(v.current) && isNum(v.current[key])) return v.current[key];
                    for (var i = weeks.length - 1; i >= 0; i--)
                        if (isNum(weeks[i][key])) return weeks[i][key];
                    return null;
                }
                var bw = latest('body_weight'),
                    st = latest('strength');
                var change = isObj(v.lifts_change)
                    ? Object.keys(v.lifts_change)
                          .filter(function (k) {
                              return (
                                  isObj(v.lifts_change[k]) && isNum(v.lifts_change[k].change_pct)
                              );
                          })
                          .sort(function (x, y) {
                              return v.lifts_change[y].change_pct - v.lifts_change[x].change_pct;
                          })
                    : [];
                return [
                    weeks.length > 1 ? indexedLines(weeks, null, v) : null,
                    change.length
                        ? bars(
                              'Which lifts have held up since the cut started?',
                              change.map(function (k) {
                                  var c = v.lifts_change[k];
                                  return {
                                      label: k,
                                      value: c.change_pct * 100,
                                      text:
                                          signed(c.change_pct * 100, 1) +
                                          '%' +
                                          (isNum(c.start) && isNum(c.latest)
                                              ? ' (' +
                                                num(c.start, 1) +
                                                ' to ' +
                                                num(c.latest, 1) +
                                                ' lb)'
                                              : ''),
                                  };
                              }),
                              { labelHeading: 'Lift', valueHeading: 'Change' },
                          )
                        : null,
                    facts([
                        ['cut started', v.cut_start ? dateText(v.cut_start) : null],
                        ['body weight', isNum(bw) ? signed(bw - 100, 1) + '%' : null],
                        ['strength', isNum(st) ? signed(st - 100, 1) + '%' : null],
                        [
                            'lifts in the index',
                            list(v.lifts).length ? list(v.lifts).join(', ') : null,
                        ],
                        [
                            'not tracked',
                            list(v.untracked).length ? list(v.untracked).join(', ') : null,
                        ],
                    ]),
                ];
            },
        },
        'lifting.retention.*': {
            n: 'sessions',
            value: function (s) {
                return [signed(s.value, 1), 'lb of e1RM since the cut started'];
            },
            intervalFmt: function (x) {
                return signed(x, 1);
            },
            draw: function (v) {
                return facts([
                    ['before the cut', isNum(v.start) ? num(v.start, 1) + ' lb' : null],
                    ['latest', isNum(v.latest) ? num(v.latest, 1) + ' lb' : null],
                    ['change', isNum(v.change_pct) ? signed(v.change_pct * 100, 1) + '%' : null],
                ]);
            },
        },
        'lifting.volume_lag': {
            n: WEEKS,
            value: function (s) {
                return [
                    'r ' + num(s.value, 2),
                    "a week's volume against the next week's e1RM change",
                ];
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v) {
                var pts = list(v.points).filter(function (p) {
                    return isObj(p) && isNum(p.volume) && isNum(p.next_e1rm_change);
                });
                return [
                    facts([
                        ['lag', isNum(v.lag_weeks) ? plural(v.lag_weeks, WEEKS) : null],
                        ['weeks paired', isNum(v.weeks) ? String(v.weeks) : null],
                    ]),
                    pts.length
                        ? table(
                              "Each week's volume and the next week's change",
                              [
                                  { label: 'Week of' },
                                  { label: 'Volume (lb)', num: true },
                                  { label: "Next week's e1RM change", num: true },
                              ],
                              pts.map(function (p) {
                                  return [
                                      dateText(p.week_start),
                                      big(p.volume),
                                      signed(p.next_e1rm_change, 1),
                                  ];
                              }),
                              { showCaption: true },
                          )
                        : null,
                ];
            },
        },
        'lifting.consistency': {
            n: WEEKS,
            value: function (s) {
                return [
                    'r ' + num(s.value, 2),
                    "sessions a week against the next week's e1RM change",
                ];
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v) {
                // A bucket with no following week has a null mean and is left out.
                var rows = list(v.buckets).filter(function (b) {
                    return isObj(b) && isNum(b.mean_e1rm_change);
                });
                return rows.length
                    ? bars(
                          'Does a week with more sessions move my strength more?',
                          rows.map(function (b) {
                              return {
                                  label:
                                      String(b.sessions_per_week) +
                                      (String(b.sessions_per_week) === '1'
                                          ? ' session'
                                          : ' sessions') +
                                      ' · ' +
                                      plural(b.weeks, WEEKS),
                                  value: b.mean_e1rm_change,
                                  text: signed(b.mean_e1rm_change, 1) + ' lb',
                              };
                          }),
                          { labelHeading: 'Sessions a week', valueHeading: 'Mean e1RM change' },
                      )
                    : null;
            },
        },
        'cross.time_budget': {
            n: WEEKS,
            draw: function (v, s, ctx) {
                var hrs = isObj(v.hours) ? v.hours : {},
                    kinds = ['watching', 'listening', 'training'];
                var days = list(v.weekdays).length === 7 ? v.weekdays : ctx.weekdays;
                var span = isNum(v.weeks) ? v.weeks : 8;
                // The file gives each weekday's mean hours per week (and the window's "to"
                // date); an older file holds the window's totals, and says so. Nothing is divided
                // here.
                var perWeek = typeof v.to === 'string';
                var title = perWeek
                    ? 'How do my hours fall across the week, per week over the last ' +
                      span +
                      ' weeks?'
                    : 'How do my hours fall across the week, in total over the last ' +
                      span +
                      ' weeks?';
                var unit = perWeek ? 'hours a week' : 'hours in total';
                var totals = days.map(function (d, i) {
                    return kinds.reduce(function (a, k) {
                        return a + (isNum(list(hrs[k])[i]) ? hrs[k][i] : 0);
                    }, 0);
                });
                var max = Math.max.apply(null, totals.concat(0));
                var chart = h(
                    'div',
                    {
                        class: 'ld-cols',
                        role: 'img',
                        style: { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' },
                        'aria-label':
                            title +
                            ': ' +
                            days
                                .map(function (d, i) {
                                    return (
                                        d +
                                        ' ' +
                                        num(totals[i], 1) +
                                        ' ' +
                                        unit +
                                        ' (' +
                                        kinds
                                            .map(function (k) {
                                                return k + ' ' + num(list(hrs[k])[i] || 0, 1);
                                            })
                                            .join(', ') +
                                        ')'
                                    );
                                })
                                .join('; '),
                    },
                    days.map(function (d, i) {
                        return h(
                            'div',
                            { class: 'ld-col', title: d + ': ' + num(totals[i], 1) + ' ' + unit },
                            h('span', { class: 'ld-col-value' }, num(totals[i], 1)),
                            h(
                                'div',
                                {
                                    class: 'ld-col-stack',
                                    style: {
                                        height:
                                            max > 0
                                                ? 'calc((100% - 18px) * ' +
                                                  (totals[i] / max).toFixed(4) +
                                                  ')'
                                                : '0',
                                    },
                                },
                                kinds
                                    .map(function (k) {
                                        var x = list(hrs[k])[i];
                                        return isNum(x) && x > 0
                                            ? h('span', {
                                                  class: 'fill--' + k,
                                                  style: { flexGrow: x },
                                              })
                                            : null;
                                    })
                                    .reverse(),
                            ),
                            h('span', { class: 'ld-col-label', 'aria-hidden': 'true' }, d),
                        );
                    }),
                );
                return [
                    charted(
                        title,
                        chart,
                        [
                            { label: 'Weekday' },
                            { label: perWeek ? 'Hours a week' : 'Hours, total', num: true },
                        ].concat(
                            kinds.map(function (k) {
                                return { label: k, num: true };
                            }),
                        ),
                        days.map(function (d, i) {
                            return [d, num(totals[i], 1)].concat(
                                kinds.map(function (k) {
                                    return num(list(hrs[k])[i] || 0, 1);
                                }),
                            );
                        }),
                        h(
                            'p',
                            { class: 'legend legend--mono' },
                            kinds.map(function (k) {
                                return legendItem('fill--' + k, k);
                            }),
                        ),
                    ),
                    facts([
                        [
                            'window',
                            v.from
                                ? dateText(v.from) + (perWeek ? ' to ' + dateText(v.to) : '')
                                : null,
                        ],
                        [
                            'figures',
                            perWeek
                                ? 'mean hours per week'
                                : 'totals over the window (per-week means arrive with the next ' +
                                  'pipeline run)',
                        ],
                    ]),
                ];
            },
        },

        'lifting.relative_strength.*': {
            n: 'sessions',
            value: function (s) {
                return isNum(s.value)
                    ? [signed(s.value, 3), 'a month, e1RM per lb of body weight']
                    : null;
            },
            intervalFmt: function (x) {
                return signed(x, 3);
            },
            draw: function (v, s, ctx) {
                var series = list(v.series);
                return [
                    facts([
                        ['latest', isNum(v.latest) ? num(v.latest, 3) + ' lb e1RM per lb' : null],
                    ]),
                    series.length > 1
                        ? lineChart(
                              'How is my ' + ctx.label + ' moving, in e1RM per lb of body weight?',
                              series.map(function (p) {
                                  return { label: dateText(p.date), value: p.ratio };
                              }),
                              function (x) {
                                  return num(x, 3);
                              },
                          )
                        : null,
                ];
            },
        },
        'lifting.lag_check': {
            n: WEEKS,
            draw: function (v) {
                return intervals(
                    'Does a change in weight show up in strength weeks later?',
                    list(v.lags).map(function (l) {
                        return {
                            label:
                                l.lag_weeks + (l.lag_weeks === 1 ? ' week' : ' weeks') + ' later',
                            value: l.r,
                            lo: l.interval[0],
                            hi: l.interval[1],
                            text:
                                'r ' +
                                num(l.r, 2) +
                                ' (' +
                                num(l.interval[0], 2) +
                                ' to ' +
                                num(l.interval[1], 2) +
                                '), n ' +
                                l.n,
                        };
                    }),
                    { min: -1, max: 1, labelHeading: 'Lag' },
                );
            },
        },
        'cross.lifting_soundtrack': {
            n: 'plays',
            draw: function (v) {
                var top = list(v.top_artists_this_month),
                    bests = list(v.artists_at_bests);
                return [
                    facts([
                        ['plays during workouts', big(v.plays_in_workouts)],
                        [
                            'workouts with music',
                            v.workouts_with_music +
                                ' of ' +
                                v.workouts_since_first_play +
                                ' since my first play',
                        ],
                        [
                            'sessions with a best e1RM and music',
                            isNum(v.best_sessions_with_music)
                                ? String(v.best_sessions_with_music)
                                : null,
                        ],
                    ]),
                    top.length
                        ? bars(
                              'What did I play most in workouts this month?',
                              top.map(function (a) {
                                  return { label: a.artist, value: a.plays, text: String(a.plays) };
                              }),
                              { labelHeading: 'Artist', valueHeading: 'Plays' },
                          )
                        : h('p', { class: 'panel-empty' }, 'No plays during workouts this month.'),
                    bests.length
                        ? bars(
                              'What was playing when a best was set?',
                              bests.map(function (a) {
                                  return { label: a.artist, value: a.plays, text: String(a.plays) };
                              }),
                              { labelHeading: 'Artist', valueHeading: 'Plays' },
                          )
                        : null,
                ];
            },
        },
        'cross.rhythm.workouts': {
            n: 'workouts',
            draw: function (v, s, ctx) {
                return weekdayColumns(
                    'On which weekdays do I train?',
                    ctx.weekdays,
                    v.by_weekday,
                    'Workouts',
                );
            },
        },

        // ----- watching -----
        'watching.completion.show': completion('show'),
        'watching.completion.film': completion('film'),
        'watching.completion.anime': completion('anime'),
        'watching.hours_by_month': {
            n: 'months',
            draw: function (v) {
                var months = list(v.months),
                    types = ['film', 'show', 'anime'];
                var max = Math.max.apply(
                    null,
                    months
                        .map(function (m) {
                            return m.hours;
                        })
                        .concat(0),
                );
                var chart = h(
                    'div',
                    {
                        class: 'ld-cols',
                        role: 'img',
                        style: {
                            gridTemplateColumns:
                                'repeat(' + Math.max(months.length, 3) + ', minmax(0, 1fr))',
                        },
                        'aria-label':
                            'Hours watched by month: ' +
                            months
                                .map(function (m) {
                                    return (
                                        monthText(m.month) +
                                        ' ' +
                                        num(m.hours, 1) +
                                        ' hours (' +
                                        types
                                            .map(function (t) {
                                                return (
                                                    nameOf(t).toLowerCase() +
                                                    ' ' +
                                                    pct(m.share[t] || 0)
                                                );
                                            })
                                            .join(', ') +
                                        ')'
                                    );
                                })
                                .join('; '),
                    },
                    months.map(function (m) {
                        return h(
                            'div',
                            {
                                class: 'ld-col',
                                title: monthText(m.month) + ': ' + num(m.hours, 1) + ' hours',
                            },
                            h('span', { class: 'ld-col-value' }, num(m.hours, 1)),
                            h(
                                'div',
                                {
                                    class: 'ld-col-stack',
                                    style: {
                                        height:
                                            max > 0
                                                ? 'calc((100% - 18px) * ' +
                                                  (m.hours / max).toFixed(4) +
                                                  ')'
                                                : '0',
                                    },
                                },
                                types
                                    .map(function (t) {
                                        return m.share[t]
                                            ? h('span', {
                                                  class: 'fill--' + TYPE_CLASS[t],
                                                  style: { flexGrow: m.share[t] },
                                              })
                                            : null;
                                    })
                                    .reverse(),
                            ),
                            h(
                                'span',
                                { class: 'ld-col-label', 'aria-hidden': 'true' },
                                monthText(m.month, true),
                            ),
                        );
                    }),
                );
                return charted(
                    'How many hours did I watch each month?',
                    chart,
                    [{ label: 'Month' }, { label: 'Hours', num: true }].concat(
                        types.map(function (t) {
                            return { label: nameOf(t), num: true };
                        }),
                    ),
                    months.map(function (m) {
                        return [monthText(m.month), num(m.hours, 1)].concat(
                            types.map(function (t) {
                                return pct(m.share[t] || 0);
                            }),
                        );
                    }),
                    h(
                        'p',
                        { class: 'legend legend--mono' },
                        types.map(function (t) {
                            return h(
                                'span',
                                { class: 'legend-item' },
                                h('span', {
                                    class: 'legend-swatch fill--' + TYPE_CLASS[t],
                                    'aria-hidden': 'true',
                                }),
                                nameOf(t),
                            );
                        }),
                    ),
                );
            },
        },
        'watching.pace': {
            n: 'titles',
            value: function (s) {
                return [num(s.value, 1), 'episodes a week, median'];
            },
            draw: function (v) {
                return table(
                    'Finished titles with dated episodes',
                    [
                        { label: 'Title' },
                        { label: 'Type' },
                        { label: 'Episodes', num: true },
                        { label: 'Weeks', num: true },
                        { label: 'A week', num: true },
                    ],
                    list(v.titles).map(function (t) {
                        return [
                            t.title,
                            String(t.type),
                            String(t.episodes),
                            num(t.weeks, 1),
                            num(t.episodes_per_week, 1),
                        ];
                    }),
                    { showCaption: true },
                );
            },
        },
        'watching.keeping_up': {
            n: 'titles',
            draw: function (v) {
                return [
                    table(
                        'Still airing',
                        [
                            { label: 'Title' },
                            { label: 'Type' },
                            { label: 'Watched', num: true },
                            { label: 'Released', num: true },
                            { label: 'Behind', num: true },
                        ],
                        list(v.titles).map(function (t) {
                            return [
                                t.title,
                                String(t.type),
                                String(t.watched),
                                String(t.released),
                                String(t.behind),
                            ];
                        }),
                        { showCaption: true },
                    ),
                    facts([
                        ['caught up', String(v.caught_up)],
                        ['left out (no episodes logged)', String(v.left_out_unknown)],
                    ]),
                ];
            },
        },
        'watching.first_episode_drops': {
            n: 'titles',
            value: function (s) {
                return [pct(s.value), 'dropped after one episode at most'];
            },
            draw: function (v) {
                var bt = isObj(v.by_type) ? v.by_type : {};
                return facts(
                    [['dropped', v.dropped_after_one + ' of ' + v.started + ' started']]
                        .concat(
                            Object.keys(bt).map(function (k) {
                                return [
                                    nameOf(k).toLowerCase(),
                                    bt[k].dropped_after_one + ' of ' + bt[k].started,
                                ];
                            }),
                        )
                        .concat([['left out (no episodes logged)', String(v.left_out_unknown)]]),
                );
            },
        },
        'watching.backlog': {
            n: 'titles',
            value: function (s) {
                return isNum(s.value)
                    ? [num(s.value, 0), 'days from the list to a first watch, median']
                    : null;
            },
        },
        'watching.genre_mix.show': genres('show'),
        'watching.genre_mix.film': genres('film'),
        'watching.genre_mix.anime': genres('anime'),
        'watching.genre_mix.by_year': {
            n: 'years',
            label: 'By the year I watched them',
            draw: function (v) {
                var ys = isObj(v.years) ? Object.keys(v.years) : [];
                return table(
                    'Genres by the year watched',
                    [{ label: 'Year' }, { label: 'Titles', num: true }, { label: 'Genres' }],
                    ys.map(function (y) {
                        var g = v.years[y].genres || {};
                        return [
                            y,
                            String(v.years[y].titles),
                            Object.keys(g)
                                .map(function (k) {
                                    return k + ' ' + pct(g[k]);
                                })
                                .join(', '),
                        ];
                    }),
                );
            },
        },
        'watching.release_decades': {
            n: 'films',
            draw: function (v) {
                return columns(
                    'Which decades do my films come from?',
                    list(v.decades).map(function (d) {
                        return {
                            label: d.decade,
                            value: d.films,
                            text: String(d.films),
                            title: d.decade + ' (' + pct(d.share) + ')',
                        };
                    }),
                    { labelHeading: 'Decade', valueHeading: 'Films' },
                );
            },
        },
        'watching.runtime': {
            n: 'films',
            value: function (s) {
                return [num(s.values.median_minutes) + ' minutes', 'median film'];
            },
            draw: function (v) {
                return facts([['over 120 minutes', pct(v.over_120_share)]]);
            },
        },
        'watching.countries.show': countries('show'),
        'watching.countries.film': countries('film'),
        'watching.countries.anime': countries('anime'),
        'watching.contrarian.*': {
            n: 'titles',
            wide: true,
            value: function (s) {
                return [num(s.value, 2), "rank correlation with Simkl's community"];
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v) {
                function gap(t) {
                    return isObj(t) ? t.title + ' (' + signed(t.gap, 0) + ' places)' : null;
                }
                return [
                    facts([
                        ['placed furthest above the community', gap(v.i_rate_higher)],
                        ['furthest below', gap(v.i_rate_lower)],
                    ]),
                    table(
                        "My top ten and Simkl's ratings",
                        [
                            { label: 'My rank', num: true },
                            { label: 'Title' },
                            { label: 'Simkl rating', num: true },
                            { label: "Simkl's order", num: true },
                            { label: 'Gap', num: true },
                        ],
                        list(v.titles).map(function (t) {
                            return [
                                String(t.my_rank),
                                t.title,
                                num(t.community, 1),
                                String(t.community_rank),
                                signed(t.gap, 0),
                            ];
                        }),
                    ),
                ];
            },
        },
        'watching.tier_distribution.*': {
            n: 'titles',
            draw: function (v, s, ctx) {
                return bars(
                    'How do my titles split across tiers?',
                    list(v.tiers).map(function (t) {
                        return {
                            label: t.tier,
                            value: t.titles,
                            text: t.titles + ' (' + pct(t.share) + ')',
                            cls: ctx.typeClass,
                        };
                    }),
                    { labelHeading: 'Tier', valueHeading: 'Titles' },
                );
            },
        },
        'watching.tier_genres_decades': {
            n: 'tiers',
            draw: function (v) {
                function shares(o) {
                    return isObj(o)
                        ? Object.keys(o)
                              .map(function (k) {
                                  return k + ' ' + pct(o[k]);
                              })
                              .join(', ')
                        : '';
                }
                return table(
                    "Each tier's genres and decades",
                    [
                        { label: 'Tier' },
                        { label: 'Titles', num: true },
                        { label: 'Genres' },
                        { label: 'Decades' },
                    ],
                    list(v.tiers).map(function (t) {
                        return [t.tier, String(t.titles), shares(t.genres), shares(t.decades)];
                    }),
                    { cls: 'table--wide' },
                );
            },
        },
        'watching.tier_contrarian.*': {
            n: 'titles',
            wide: true,
            value: function (s) {
                return [num(s.value, 2), "rank correlation, my tier against Simkl's rating"];
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v) {
                var cols = [
                    { label: 'Title' },
                    { label: 'Tier' },
                    { label: 'Simkl rating', num: true },
                    { label: 'Gap', num: true },
                ];
                function rows(xs) {
                    return list(xs).map(function (t) {
                        return [t.title, t.tier, num(t.community, 1), signed(t.gap, 2)];
                    });
                }
                return [
                    table('Tiered above their rating', cols, rows(v.i_rate_higher), {
                        showCaption: true,
                    }),
                    table('Tiered below their rating', cols, rows(v.i_rate_lower), {
                        showCaption: true,
                    }),
                ];
            },
        },
        'watching.s_tier': {
            n: 'titles',
            value: function (s) {
                return isNum(s.value) ? [pct(s.value), 'of my tiered titles are S'] : null;
            },
            draw: function (v) {
                // Two small rows under the taste profile: S share by type and by release decade.
                return sTierBars(v);
            },
        },
        'watching.by_director': {
            n: 'films',
            wide: true,
            draw: function (v) {
                return tierBars(
                    'Whose films earn the highest tiers, by director?',
                    list(v.rows).filter(isObj),
                    { unit: 'films', labelHeading: 'Director' },
                );
            },
        },
        'watching.by_studio': {
            n: 'titles',
            wide: true,
            draw: function (v) {
                return tierBars(
                    'Which anime studios earn the highest tiers?',
                    list(v.rows).filter(isObj),
                    { unit: 'titles', labelHeading: 'Studio', cls: 'fill--anime' },
                );
            },
        },
        'watching.by_lead': {
            n: 'films',
            wide: true,
            draw: function (v) {
                return tierBars(
                    'Whose films earn the highest tiers, by lead actor?',
                    list(v.rows).filter(isObj),
                    { unit: 'films', labelHeading: 'Lead' },
                );
            },
        },
        'watching.crowd_agreement': {
            n: 'titles',
            wide: true,
            value: function (s) {
                return isNum(s.value)
                    ? [num(s.value, 2), 'rank correlation, my tier against the community score']
                    : null;
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v) {
                // A genre is a name, or {genre, gap, n} in older samples.
                function genre(g) {
                    return typeof g === 'string'
                        ? g
                        : isObj(g) && typeof g.genre === 'string'
                          ? g.genre +
                            (isNum(g.gap)
                                ? ' (' +
                                  signed(g.gap, 2) +
                                  ' tier points over ' +
                                  plural(g.n, 'titles') +
                                  ')'
                                : '')
                          : null;
                }
                var base = isNum(v.model_baseline) ? v.model_baseline : v.baseline;
                return [
                    crowdPlot(v),
                    facts([
                        ['I rate highest against the crowd', genre(v.top_overrated_genre)],
                        ['lowest against the crowd', genre(v.top_underrated_genre)],
                        [
                            'tier predicted from the score alone',
                            isNum(v.model_accuracy)
                                ? pct(v.model_accuracy) +
                                  ' right' +
                                  (isNum(base)
                                      ? ', against ' +
                                        pct(base) +
                                        ' always guessing the commonest tier'
                                      : '')
                                : null,
                        ],
                    ]),
                ];
            },
        },
        'watching.blockbuster': {
            n: 'films',
            value: function (s) {
                return isNum(s.value)
                    ? [
                          signed(s.value, 2),
                          'tier points per unit of log revenue over budget (the slope)',
                      ]
                    : null;
            },
            intervalFmt: function (x) {
                return signed(x, 2);
            },
            draw: function (v) {
                var qs = list(v.by_popularity_quartile).filter(function (q) {
                    return isObj(q) && isNum(q.mean_tier);
                });
                var names = {
                    1: 'least popular quarter',
                    2: 'second quarter',
                    3: 'third quarter',
                    4: 'most popular quarter',
                };
                return [
                    facts([
                        [
                            'films with revenue and budget',
                            isNum(v.films_with_money) ? String(v.films_with_money) : null,
                        ],
                        [
                            'films with a popularity',
                            isNum(v.films_with_popularity) ? String(v.films_with_popularity) : null,
                        ],
                    ]),
                    tierBars(
                        'Do more popular films earn higher tiers?',
                        qs.map(function (q) {
                            return {
                                name: names[q.quartile] || 'quartile ' + q.quartile,
                                mean_tier: q.mean_tier,
                                n: q.n,
                            };
                        }),
                        { unit: 'films', labelHeading: 'Quartile' },
                    ),
                ];
            },
        },
        'watching.sequels': {
            n: 'collections',
            value: function (s) {
                return isNum(s.value)
                    ? [
                          signed(s.value, 2),
                          'tier points the first film rates above its sequels, on average',
                      ]
                    : null;
            },
            intervalFmt: function (x) {
                return signed(x, 2);
            },
            draw: function (v) {
                var cols = list(v.collections).filter(function (c) {
                    return isObj(c) && isObj(c.first);
                });
                return table(
                    "Each collection's first film against the later ones " +
                        '(positive: the first rated higher)',
                    [
                        { label: 'Collection' },
                        { label: 'First' },
                        { label: 'Later' },
                        { label: 'First minus later', num: true },
                    ],
                    cols.map(function (c) {
                        var diff = isNum(c.first_minus_later)
                            ? c.first_minus_later
                            : isNum(c.mean_later) && isNum(c.mean_first)
                              ? c.mean_first - c.mean_later
                              : null;
                        return [
                            String(c.collection),
                            c.first.title + ' (' + c.first.tier + ')',
                            filmsText(c.later),
                            diff === null ? '–' : signed(diff, 2),
                        ];
                    }),
                    { showCaption: true },
                );
            },
        },
        'watching.language': {
            n: 'films',
            draw: function (v) {
                var m = isObj(v.means) ? v.means : {};
                var rows = [
                    ['English', m.english],
                    ['Other languages', m.other],
                ]
                    .filter(function (r) {
                        return isObj(r[1]) && isNum(r[1].mean_tier);
                    })
                    .map(function (r) {
                        return { name: r[0], mean_tier: r[1].mean_tier, n: r[1].n };
                    });
                return [
                    facts([
                        [
                            'films not in English',
                            isNum(v.share_non_english) ? pct(v.share_non_english) : null,
                        ],
                    ]),
                    rows.length
                        ? tierBars('Do films in other languages earn higher tiers?', rows, {
                              unit: 'films',
                              labelHeading: 'Language',
                          })
                        : null,
                ];
            },
        },
        'watching.critics_vs_audience': {
            n: 'films',
            absentStatus: 'not available from source',
            absentMissing: 'critic and audience scores (OMDb)',
            value: function (s) {
                return isNum(s.value)
                    ? [
                          pct(s.value),
                          'of the films where critics and audiences split side with the critics',
                      ]
                    : null;
            },
            intervalFmt: function (x) {
                return pct(x);
            },
            draw: function (v) {
                return table(
                    'Films where the scores split by 20 points or more',
                    [
                        { label: 'Film' },
                        { label: 'Year', num: true },
                        { label: 'My tier' },
                        { label: 'Critics', num: true },
                        { label: 'Audience', num: true },
                        { label: 'I side with' },
                    ],
                    list(v.films)
                        .filter(isObj)
                        .map(function (f) {
                            return [
                                String(f.title),
                                isNum(f.year) ? String(f.year) : '–',
                                String(f.tier),
                                isNum(f.critics) ? String(f.critics) : '–',
                                isNum(f.audience) ? String(f.audience) : '–',
                                String(f.sides_with),
                            ];
                        }),
                    { showCaption: true },
                );
            },
        },
        'watching.taste_profile': {
            n: 'titles',
            wide: true,
            value: function (s) {
                return isNum(s.value)
                    ? [pct(s.value), 'of tiers predicted from metadata, leave-one-out']
                    : null;
            },
            draw: function (v) {
                var rows = list(v.rows).filter(function (r) {
                    return isObj(r) && isNum(r.effect) && typeof r.name === 'string';
                });
                return [
                    rows.length ? effectBars('What do my tiers respond to?', rows) : null,
                    facts([
                        [
                            'always guessing the commonest tier',
                            isNum(v.baseline) ? pct(v.baseline) : null,
                        ],
                    ]),
                    disagreementLines(v.disagreements),
                ];
            },
        },
        'watching.tier_model': {
            n: 'titles',
            value: function (s) {
                return isNum(s.value)
                    ? [pct(s.value), 'of tiers predicted right, leave-one-out']
                    : null;
            },
            intervalFmt: function (x) {
                return pct(x);
            },
            draw: function (v) {
                var feats = list(v.features).filter(function (f) {
                    return isObj(f) && isNum(f.effect) && Array.isArray(f.interval);
                });
                return [
                    facts([
                        [
                            'always guessing the commonest tier',
                            isNum(v.baseline_accuracy) ? pct(v.baseline_accuracy) : null,
                        ],
                    ]),
                    feats.length
                        ? intervals(
                              'Which features move my tier, and by how much?',
                              feats.map(function (f) {
                                  return {
                                      label: String(f.name),
                                      value: f.effect,
                                      lo: f.interval[0],
                                      hi: f.interval[1],
                                      text:
                                          signed(f.effect, 2) +
                                          ' (' +
                                          signed(f.interval[0], 2) +
                                          ' to ' +
                                          signed(f.interval[1], 2) +
                                          ')',
                                  };
                              }),
                              { labelHeading: 'Feature' },
                          )
                        : null,
                ];
            },
        },
        'watching.taste_drift': {
            n: 'years',
            value: function (s) {
                return isNum(s.value)
                    ? [signed(s.value, 2), 'tier points a year (S = 5, D = 1)']
                    : null;
            },
            intervalFmt: function (x) {
                return signed(x, 2);
            },
            draw: function (v) {
                return columns(
                    'Are my tiers drifting, by the year I watched?',
                    list(v.years).map(function (y) {
                        return {
                            label: String(y.year),
                            title: y.year + ' (' + plural(y.n, 'titles') + ')',
                            value: y.mean_tier_score,
                            text: num(y.mean_tier_score, 1),
                        };
                    }),
                    { labelHeading: 'Year', valueHeading: 'Mean tier score' },
                );
            },
        },
        'watching.community_gap_by_genre': {
            n: 'titles',
            draw: function (v) {
                var gs = list(v.genres).filter(function (g) {
                    return isObj(g) && isNum(g.gap) && Array.isArray(g.interval);
                });
                return intervals(
                    'Where do I rate above or below the community, by genre?',
                    gs.map(function (g) {
                        return {
                            label: g.genre + ' · ' + plural(g.n, 'titles'),
                            value: g.gap,
                            lo: g.interval[0],
                            hi: g.interval[1],
                            text:
                                signed(g.gap, 2) +
                                ' (' +
                                signed(g.interval[0], 2) +
                                ' to ' +
                                signed(g.interval[1], 2) +
                                ')',
                        };
                    }),
                    { labelHeading: 'Genre' },
                );
            },
        },
        'watching.pace_vs_tier': {
            n: 'titles',
            draw: function (v) {
                var names = {
                    binge: 'binge (3+ episodes a week)',
                    steady: 'steady (1 to 3)',
                    slow: 'slow (under 1)',
                };
                return bars(
                    'Do the shows I binge earn higher tiers?',
                    list(v.buckets).map(function (b) {
                        return {
                            label:
                                (names[b.bucket] || String(b.bucket)) +
                                ' · ' +
                                plural(b.n, 'titles'),
                            value: b.mean_tier_score,
                            text: num(b.mean_tier_score, 1),
                        };
                    }),
                    { labelHeading: 'Pace', valueHeading: 'Mean tier score' },
                );
            },
        },
        'watching.tier_completion_pace': {
            n: 'titles',
            draw: function (v, s, ctx) {
                // Titles per tier come from tier_distribution, which counts the rankings file's
                // tiered titles; completion may cover fewer of them, and then says so.
                var titles = {},
                    total = 0,
                    dist =
                        ctx.analysis && isObj(ctx.analysis.watching)
                            ? ctx.analysis.watching.tier_distribution
                            : null;
                if (isObj(dist))
                    Object.keys(dist).forEach(function (k) {
                        if (!okStat(dist[k])) return;
                        list(dist[k].values.tiers).forEach(function (t) {
                            titles[t.tier] = (titles[t.tier] || 0) + t.titles;
                            total += t.titles;
                        });
                    });
                var covered = list(v.tiers).reduce(function (a, t) {
                    return a + t.finished + t.dropped;
                }, 0);
                return [
                    table(
                        'Completion and pace by tier',
                        [
                            { label: 'Tier' },
                            { label: 'Tiered titles', num: true },
                            { label: 'Finished', num: true },
                            { label: 'Dropped', num: true },
                            { label: 'Completion', num: true },
                            { label: 'Episodes a week', num: true },
                        ],
                        list(v.tiers).map(function (t) {
                            return [
                                t.tier,
                                t.tier in titles ? String(titles[t.tier]) : '–',
                                String(t.finished),
                                String(t.dropped),
                                pct(t.completion),
                                isNum(t.episodes_per_week) ? num(t.episodes_per_week, 1) : '–',
                            ];
                        }),
                    ),
                    total && covered !== total
                        ? h(
                              'p',
                              { class: 'ld-note' },
                              'Completion covers ' +
                                  covered +
                                  ' of the ' +
                                  total +
                                  ' tiered titles.',
                          )
                        : null,
                ];
            },
        },

        // ----- eating (Beli: cities may appear, dates never do) -----
        'eating.scores': {
            n: 'places',
            value: function (s) {
                return [num(s.values.overall.median, 2), 'median score'];
            },
            draw: function (v) {
                function ranges(title, o) {
                    var keys = isObj(o) ? Object.keys(o) : [];
                    if (!keys.length) return null;
                    var chart = h(
                        'div',
                        {
                            class: 'ld-ranges',
                            role: 'img',
                            'aria-label':
                                title +
                                ': ' +
                                keys
                                    .map(function (k) {
                                        return (
                                            k +
                                            ' median ' +
                                            num(o[k].median, 2) +
                                            ', middle half ' +
                                            num(o[k].q1, 2) +
                                            ' to ' +
                                            num(o[k].q3, 2)
                                        );
                                    })
                                    .join('; '),
                        },
                        keys.map(function (k) {
                            var g = o[k];
                            return h(
                                'div',
                                {
                                    class: 'ld-range-row',
                                    title:
                                        k +
                                        ': median ' +
                                        num(g.median, 2) +
                                        ', middle half ' +
                                        num(g.q1, 2) +
                                        ' to ' +
                                        num(g.q3, 2) +
                                        ', ' +
                                        plural(g.n, 'places'),
                                },
                                h('span', { class: 'bar-label' }, k),
                                h(
                                    'span',
                                    { class: 'ld-iv-track' },
                                    h('span', {
                                        class: 'ld-range-box',
                                        style: {
                                            left: g.q1 * 10 + '%',
                                            width: (g.q3 - g.q1) * 10 + '%',
                                        },
                                    }),
                                    h('span', {
                                        class: 'ld-iv-dot',
                                        style: { left: g.median * 10 + '%' },
                                    }),
                                ),
                                h('span', { class: 'bar-value' }, num(g.median, 2)),
                            );
                        }),
                        h(
                            'div',
                            { class: 'ld-range-row axis-row', 'aria-hidden': 'true' },
                            h('span'),
                            h(
                                'span',
                                { class: 'axis-ticks' },
                                [0, 5, 10].map(function (x) {
                                    return h('span', { style: { left: x * 10 + '%' } }, String(x));
                                }),
                            ),
                            h('span'),
                        ),
                    );
                    return charted(
                        title,
                        chart,
                        [
                            { label: '' },
                            { label: 'Median', num: true },
                            { label: 'Middle half', num: true },
                            { label: 'Places', num: true },
                        ],
                        keys.map(function (k) {
                            var g = o[k];
                            return [
                                k,
                                num(g.median, 2),
                                num(g.q1, 2) + ' to ' + num(g.q3, 2),
                                String(g.n),
                            ];
                        }),
                        h(
                            'p',
                            { class: 'legend legend--mono' },
                            h('span', { class: 'legend-dot', 'aria-hidden': 'true' }),
                            ' median   ',
                            h('span', { class: 'legend-box', 'aria-hidden': 'true' }),
                            ' middle half of scores',
                        ),
                    );
                }
                var o = v.overall;
                return [
                    facts([['middle half of scores', num(o.q1, 2) + ' to ' + num(o.q3, 2)]]),
                    ranges('How do my scores spread, by cuisine?', v.by_cuisine),
                    ranges('How do my scores spread, by city?', v.by_city),
                ];
            },
        },
        'eating.choice_vs_taste': {
            n: 'places',
            draw: function (v) {
                return [
                    facts([['my top quartile starts at', num(v.top_quartile_from, 2)]]),
                    bars(
                        'Do I try the cuisines I rate highest?',
                        list(v.cuisines).map(function (c) {
                            return {
                                label: c.cuisine,
                                value: c.tried,
                                text: pct(c.tried),
                                ref: c.top_quartile,
                                refText: pct(c.top_quartile),
                            };
                        }),
                        {
                            labelHeading: 'Cuisine',
                            valueHeading: 'share of places tried',
                            refHeading: 'share of my top quartile',
                        },
                    ),
                ];
            },
        },
        'eating.home_bias': effect('points at home against away, same cuisine', 2, function (v) {
            // The home city is never named: it's "my most-ranked city" in the how line.
            return [
                ['places at home', String(v.home_places)],
                ['places away', String(v.away_places)],
                ['cuisines in both', String(v.cuisines)],
            ];
        }),
        'eating.order_effect': effect('points per 100 places ranked', 3, function (v) {
            return [
                ['places', String(v.places)],
                ['cuisines', String(v.cuisines)],
            ];
        }),
        'eating.contrast_effect': effect(
            'change in score per point of the place before',
            3,
            function (v) {
                return [
                    ['pairs', String(v.pairs)],
                    ['cuisines', String(v.cuisines)],
                ];
            },
        ),
        'eating.contrarian': { n: 'places' },
        // Counts by month only; nothing ties a month to a place.
        'eating.new_cuisines': {
            n: 'months',
            draw: function (v) {
                return columns(
                    'How many new cuisines did I try each month?',
                    list(v.months).map(function (m) {
                        return {
                            label: monthText(m.month, true),
                            title: monthText(m.month),
                            value: m.new_cuisines,
                            text: String(m.new_cuisines),
                        };
                    }),
                    { labelHeading: 'Month', valueHeading: 'New cuisines' },
                );
            },
        },
        // Where new places land in my current ranking: the median percentile, the last 20 places as
        // dots on a 0 to 100 strip (1 = top), and by-month bars when the file has months.
        'eating.landing': {
            n: 'places',
            wide: true,
            value: function (s) {
                var p = isNum(s.value)
                    ? s.value
                    : isObj(s.values) && isNum(s.values.median_percentile)
                      ? s.values.median_percentile
                      : null;
                return p !== null
                    ? [pct(p), 'up my list is where a new place lands, median of the last 20']
                    : null;
            },
            draw: function (v) {
                var recent = list(v.recent).filter(function (r) {
                    return isObj(r) && isNum(r.percentile);
                });
                var med = isNum(v.median_percentile) ? v.median_percentile : null;
                var strip = null;
                if (recent.length) {
                    var chart = h(
                        'div',
                        {
                            class: 'ld-ranges ld-strip',
                            role: 'img',
                            'aria-label':
                                'The last ' +
                                plural(recent.length, 'places') +
                                ' I ranked, each at the percentile it sits at in my current ' +
                                'ranking' +
                                (med !== null ? ', median ' + pct(med) : '') +
                                ': ' +
                                recent
                                    .map(function (r) {
                                        return (
                                            (typeof r.place === 'string' ? r.place + ' ' : '') +
                                            pct(r.percentile)
                                        );
                                    })
                                    .join(', '),
                        },
                        h(
                            'div',
                            { class: 'ld-range-row' },
                            h('span', { class: 'bar-label' }, 'last ' + recent.length),
                            h(
                                'span',
                                { class: 'ld-iv-track' },
                                med !== null
                                    ? h('span', {
                                          class: 'ld-strip-median',
                                          style: { left: med * 100 + '%' },
                                          title: 'median ' + pct(med),
                                      })
                                    : null,
                                recent.map(function (r) {
                                    return h('span', {
                                        class: 'ld-iv-dot ld-strip-dot',
                                        style: { left: r.percentile * 100 + '%' },
                                        title:
                                            (typeof r.place === 'string' ? r.place + ': ' : '') +
                                            pct(r.percentile) +
                                            ' up my list',
                                    });
                                }),
                            ),
                            h(
                                'span',
                                { class: 'bar-value' },
                                med !== null ? 'median ' + pct(med) : '',
                            ),
                        ),
                        h(
                            'div',
                            { class: 'ld-range-row axis-row', 'aria-hidden': 'true' },
                            h('span'),
                            h(
                                'span',
                                { class: 'axis-ticks' },
                                [
                                    [0, '0 · bottom', 'axis-start'],
                                    [50, '50', ''],
                                    [100, 'top · 100', 'axis-end'],
                                ].map(function (t) {
                                    return h(
                                        'span',
                                        { class: t[2] || null, style: { left: t[0] + '%' } },
                                        t[1],
                                    );
                                }),
                            ),
                            h('span'),
                        ),
                    );
                    strip = charted(
                        'Where did the last 20 places I ranked land in my list?',
                        chart,
                        [{ label: 'Place' }, { label: 'Percentile', num: true }],
                        recent.map(function (r) {
                            return [typeof r.place === 'string' ? r.place : '', pct(r.percentile)];
                        }),
                        h(
                            'p',
                            { class: 'legend legend--mono' },
                            h('span', { class: 'legend-dot', 'aria-hidden': 'true' }),
                            ' one place   ',
                            h('span', { class: 'legend-median', 'aria-hidden': 'true' }),
                            ' median',
                        ),
                    );
                }
                var months = list(v.months).filter(function (m) {
                    return isObj(m) && isNum(m.median_percentile);
                });
                return [
                    strip,
                    months.length
                        ? columns(
                              'Where did new places land, by month of first ranking?',
                              months.map(function (m) {
                                  return {
                                      label: monthText(m.month, true),
                                      title:
                                          monthText(m.month) +
                                          (isNum(m.rankings)
                                              ? ' (' + plural(m.rankings, 'places') + ')'
                                              : ''),
                                      value: m.median_percentile,
                                      text: pct(m.median_percentile),
                                  };
                              }),
                              { labelHeading: 'Month', valueHeading: 'Median percentile' },
                          )
                        : null,
                ];
            },
        },
        // Which cuisines are a safe bet: a dot-and-range row per cuisine (the middle half of its
        // scores, the median as the dot), narrowest first, with its places; the sentence names the
        // safest and the widest.
        'eating.safe_bet': {
            n: 'places',
            wide: true,
            value: function (s) {
                return isNum(s.value)
                    ? [
                          num(s.value, 2),
                          "points across the middle half of the safest cuisine's scores",
                      ]
                    : null;
            },
            draw: function (v) {
                var rows = list(v.rows)
                    .filter(function (r) {
                        return (
                            isObj(r) &&
                            typeof r.cuisine === 'string' &&
                            isNum(r.q1) &&
                            isNum(r.q3) &&
                            isNum(r.median)
                        );
                    })
                    .map(function (r) {
                        return {
                            cuisine: r.cuisine,
                            n: isNum(r.n) ? r.n : null,
                            median: r.median,
                            q1: r.q1,
                            q3: r.q3,
                            spread: r.q3 - r.q1,
                        };
                    })
                    .sort(function (x, y) {
                        return x.spread - y.spread || y.median - x.median;
                    });
                if (!rows.length) return null;
                var safe = rows[0],
                    wide = rows[rows.length - 1];
                var sentence =
                    rows.length > 1
                        ? safe.cuisine +
                          ' is the safest bet: the middle half of its scores spans ' +
                          num(safe.spread, 2) +
                          ' points around a median of ' +
                          num(safe.median, 2) +
                          '. ' +
                          wide.cuisine +
                          ' is the widest at ' +
                          num(wide.spread, 2) +
                          ' points.'
                        : safe.cuisine +
                          ' is the only cuisine with enough places: the middle half of its ' +
                          'scores spans ' +
                          num(safe.spread, 2) +
                          ' points around a median of ' +
                          num(safe.median, 2) +
                          '.';
                var chart = h(
                    'div',
                    {
                        class: 'ld-ranges',
                        role: 'img',
                        'aria-label':
                            'Middle half of scores by cuisine, narrowest first: ' +
                            rows
                                .map(function (r) {
                                    return (
                                        r.cuisine +
                                        ' median ' +
                                        num(r.median, 2) +
                                        ', middle half ' +
                                        num(r.q1, 2) +
                                        ' to ' +
                                        num(r.q3, 2) +
                                        (r.n !== null ? ', ' + plural(r.n, 'places') : '')
                                    );
                                })
                                .join('; '),
                    },
                    rows.map(function (r) {
                        return h(
                            'div',
                            {
                                class: 'ld-range-row',
                                title:
                                    r.cuisine +
                                    ': median ' +
                                    num(r.median, 2) +
                                    ', middle half ' +
                                    num(r.q1, 2) +
                                    ' to ' +
                                    num(r.q3, 2) +
                                    (r.n !== null ? ', ' + plural(r.n, 'places') : ''),
                            },
                            h('span', { class: 'bar-label' }, r.cuisine),
                            h(
                                'span',
                                { class: 'ld-iv-track' },
                                h('span', {
                                    class: 'ld-range-box',
                                    style: { left: r.q1 * 10 + '%', width: r.spread * 10 + '%' },
                                }),
                                h('span', {
                                    class: 'ld-iv-dot',
                                    style: { left: r.median * 10 + '%' },
                                }),
                            ),
                            h(
                                'span',
                                { class: 'bar-value' },
                                num(r.spread, 2) + (r.n !== null ? ' · n = ' + r.n : ''),
                            ),
                        );
                    }),
                    h(
                        'div',
                        { class: 'ld-range-row axis-row', 'aria-hidden': 'true' },
                        h('span'),
                        h(
                            'span',
                            { class: 'axis-ticks' },
                            [0, 5, 10].map(function (x) {
                                return h('span', { style: { left: x * 10 + '%' } }, String(x));
                            }),
                        ),
                        h('span'),
                    ),
                );
                return [
                    h('p', { class: 'ld-sentence' }, sentence),
                    charted(
                        'Which cuisines are a safe bet, narrowest spread first?',
                        chart,
                        [
                            { label: 'Cuisine' },
                            { label: 'Median', num: true },
                            { label: 'Middle half', num: true },
                            { label: 'Spread', num: true },
                            { label: 'Places', num: true },
                        ],
                        rows.map(function (r) {
                            return [
                                r.cuisine,
                                num(r.median, 2),
                                num(r.q1, 2) + ' to ' + num(r.q3, 2),
                                num(r.spread, 2),
                                r.n !== null ? String(r.n) : '',
                            ];
                        }),
                        h(
                            'p',
                            { class: 'legend legend--mono' },
                            h('span', { class: 'legend-dot', 'aria-hidden': 'true' }),
                            ' median   ',
                            h('span', { class: 'legend-box', 'aria-hidden': 'true' }),
                            ' middle half, its width in points',
                        ),
                    ),
                ];
            },
        },
        'eating.rerank_drift': {
            n: 're-rankings',
            value: function (s) {
                return [signed(s.value, 2), 'points, mean change when I re-rank a place'];
            },
            intervalFmt: function (x) {
                return signed(x, 2);
            },
            draw: function (v) {
                return table(
                    'Change on re-ranking, by time since the first ranking',
                    [
                        { label: 'Since first ranking' },
                        { label: 'Re-rankings', num: true },
                        { label: 'Median change', num: true },
                        { label: 'Mean change', num: true },
                    ],
                    list(v.buckets).map(function (b) {
                        return [
                            String(b.since),
                            String(b.n),
                            signed(b.median_change, 2),
                            signed(b.mean_change, 2),
                        ];
                    }),
                    { showCaption: true },
                );
            },
        },
        'cross.rhythm.restaurants': {
            n: 'places',
            draw: function (v, s, ctx) {
                return weekdayColumns(
                    'On which weekdays do I rank places?',
                    ctx.weekdays,
                    v.by_weekday,
                    'Places',
                );
            },
        },
    };

    function completion(type) {
        return {
            n: 'titles',
            value: function (s) {
                return [pct(s.value), 'finished, of those finished or dropped'];
            },
            draw: function (v) {
                return facts([
                    ['finished', String(v.finished)],
                    ['dropped', String(v.dropped)],
                    ['on hold', String(v.on_hold)],
                    ['watching', String(v.watching)],
                    ['plan to watch', String(v.plan_to_watch)],
                ]);
            },
        };
    }
    function genres(type) {
        return {
            n: 'titles',
            draw: function (v) {
                var g = isObj(v.genres) ? v.genres : {};
                return bars(
                    'Which genres do I watch most?',
                    Object.keys(g).map(function (k) {
                        return {
                            label: k,
                            value: g[k],
                            text: pct(g[k]),
                            cls: 'fill--' + TYPE_CLASS[type],
                        };
                    }),
                    { labelHeading: 'Genre', valueHeading: 'Share' },
                );
            },
        };
    }
    function countries(type) {
        return {
            n: 'titles',
            draw: function (v) {
                var c = isObj(v.countries) ? v.countries : {},
                    ex = list(v.excluded);
                return [
                    bars(
                        'Where do the titles I watch come from?',
                        Object.keys(c).map(function (k) {
                            return {
                                label: k,
                                value: c[k],
                                text: pct(c[k]),
                                cls: 'fill--' + TYPE_CLASS[type],
                            };
                        }),
                        { labelHeading: 'Country', valueHeading: 'Share' },
                    ),
                    ex.length
                        ? h('p', { class: 'ld-small' }, 'Left out: ' + ex.join('; ') + '.')
                        : null,
                ];
            },
        };
    }
    function ordinal(n) {
        var r = n % 100,
            suffix = r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
        return n + suffix;
    }
    // 0.4 -> ".40": an all-play share without its leading zero.
    function share2(x) {
        return x.toFixed(2).replace(/^0\./, '.');
    }
    function pointsPerWeek(x) {
        return signed(x, 1) + ' pts/wk';
    }

    function survivalSpec(who) {
        return {
            n: 'artists',
            wide: true,
            value: function (s) {
                return isNum(s.value)
                    ? [
                          num(s.value, 2) + '×',
                          'hazard ratio: how much faster new artists leave rotation than catalog ' +
                              'ones',
                      ]
                    : null;
            },
            intervalFmt: function (x) {
                return num(x, 2);
            },
            draw: function (v, s) {
                var n = isObj(v.n) ? v.n : {},
                    med = isObj(v.medians) ? v.medians : {};
                return [
                    h(
                        'p',
                        { class: 'ld-sentence' },
                        hazardSentence(v.hr_a, med, v.curves) || who + '.',
                    ),
                    floorNote(v, s),
                    list(v.curves).length
                        ? survivalChart(null, v.curves, { bandToggle: true })
                        : null,
                    facts([
                        ['who is counted', typeof v.cohort === 'string' ? v.cohort : who],
                        [
                            'median rotation, overall',
                            isNum(med.overall) ? plural(med.overall, 'months') : null,
                        ],
                        [
                            'per five years of gap between release years and the year I added them',
                            isObj(v.hr_b) && isNum(v.hr_b.value)
                                ? num(v.hr_b.value, 2) +
                                  '×' +
                                  (interval(v.hr_b.interval, function (x) {
                                      return num(x, 2);
                                  })
                                      ? ' (' +
                                        interval(v.hr_b.interval, function (x) {
                                            return num(x, 2);
                                        }) +
                                        ')'
                                      : '')
                                : null,
                        ],
                        [
                            'log-rank',
                            isObj(v.logrank) && isNum(v.logrank.p)
                                ? 'p = ' + num(v.logrank.p, 3)
                                : null,
                        ],
                        [
                            'share of discoveries that are catalog',
                            isNum(v.share_catalog) ? pct(v.share_catalog) : null,
                        ],
                        [
                            'artists',
                            isNum(n.total)
                                ? big(n.total) +
                                  ' (' +
                                  big(n.catalog) +
                                  ' catalog, ' +
                                  (isNum(n.mid) ? big(n.mid) + ' in between, ' : '') +
                                  big(n.new) +
                                  ' new)'
                                : null,
                        ],
                    ]),
                    longestLine(v.longest_lived),
                ];
            },
        };
    }

    function managerComponent(label, what, raw) {
        return {
            n: WEEKS,
            label: label,
            raw: raw || pointsPerWeek,
            value: function (s) {
                return [signed(s.value, 1), 'points a week, ' + what];
            },
            intervalFmt: function (x) {
                return signed(x, 1);
            },
            draw: function (v) {
                return facts([
                    ['rank', rankText(v.rank, v.of, 'best')],
                    ['percentile', isNum(v.percentile) ? pct(v.percentile) : null],
                ]);
            },
        };
    }

    // S-tier share by type (three bars in the type colours) and by release decade.
    function sTierBars(v) {
        var types = list(v.by_type).filter(function (t) {
            return isObj(t) && isNum(t.share);
        });
        var decades = list(v.by_decade).filter(function (d) {
            return isObj(d) && isNum(d.share);
        });
        return [
            types.length
                ? bars(
                      'Which type earns an S most often?',
                      types.map(function (t) {
                          return {
                              label: nameOf(t.type),
                              value: t.share,
                              text: pct(t.share) + ' (' + t.s + ' of ' + t.titles + ')',
                              cls: TYPE_CLASS[t.type] ? 'fill--' + TYPE_CLASS[t.type] : null,
                          };
                      }),
                      { labelHeading: 'Type', valueHeading: 'S share' },
                  )
                : null,
            decades.length
                ? bars(
                      'Which decades earn an S most often?',
                      decades.map(function (d) {
                          return {
                              label: String(d.decade),
                              value: d.share,
                              text: pct(d.share) + ' (' + d.s + ' of ' + d.titles + ')',
                          };
                      }),
                      { labelHeading: 'Decade', valueHeading: 'S share' },
                  )
                : null,
        ];
    }

    var SPLIT_NAMES = {
        chest_back: 'chest and back',
        shoulders_arms: 'shoulders and arms',
        legs: 'legs',
    };
    // The split series aligned to the overall weeks, from values.splits; [] when absent.
    function splitSeries(v, weeks) {
        if (!isObj(v) || !isObj(v.splits)) return [];
        return Object.keys(SPLIT_NAMES)
            .filter(function (k) {
                return isObj(v.splits[k]) && list(v.splits[k].weeks).length;
            })
            .map(function (k) {
                var by = {};
                list(v.splits[k].weeks).forEach(function (w) {
                    if (isObj(w) && isNum(w.strength)) by[w.week_start] = w.strength;
                });
                return {
                    key: k,
                    name: SPLIT_NAMES[k],
                    values: weeks.map(function (w) {
                        return isNum(by[w.week_start]) ? by[w.week_start] : null;
                    }),
                    thin: true,
                    lifts: list(v.splits[k].lifts),
                };
            });
    }
    // Body weight and strength since the cut, both indexed to 100 at the cut's first week: body
    // weight on its own small panel above (one line through every weigh-in, a marker at each),
    // the strength index with the three splits under it, labelled in the legend only; both keep
    // the dashed 100 baseline.
    function indexedLines(weeks, opts, v) {
        opts = opts || {};
        var weighIns = weeks.filter(function (w) {
            return isNum(w.body_weight);
        }).length;
        var labels = weeks.map(function (w) {
            return dateText(w.week_start);
        });
        var common = {
            fmt: function (x) {
                return num(x, 1);
            },
            base: 100,
            baseText: '100 = cut start',
            labelHeading: 'Week of',
            endLabels: false,
        };
        var weight = multiLine(
            'How has my body weight moved since the cut started?',
            labels,
            [
                {
                    name: 'body weight · ' + plural(weighIns, WEEKS) + ' with a weigh-in',
                    values: weeks.map(function (w) {
                        return w.body_weight;
                    }),
                    points: true,
                },
            ],
            Object.assign({}, common, {
                height: Math.round((opts.height || 130) * 0.55),
                legend: true,
            }),
        );
        var strength = multiLine(
            'Has my strength held since the cut started?',
            labels,
            [
                {
                    name: 'strength index',
                    values: weeks.map(function (w) {
                        return w.strength;
                    }),
                },
            ].concat(splitSeries(v, weeks)),
            Object.assign({}, common, { height: opts.height || 130 }),
        );
        return h('div', { class: 'ld-stacked' }, weight, strength);
    }

    function effect(unit, dp, more) {
        return {
            n: 'places',
            value: function (s) {
                return [signed(s.value, dp), unit];
            },
            intervalFmt: function (x) {
                return signed(x, dp);
            },
            draw: function (v, s) {
                return [
                    Array.isArray(s.interval)
                        ? intervals('How big is the effect, and how sure is it?', [
                              {
                                  label: 'estimate',
                                  value: s.value,
                                  lo: s.interval[0],
                                  hi: s.interval[1],
                                  text:
                                      signed(s.value, dp) +
                                      ' (' +
                                      signed(s.interval[0], dp) +
                                      ' to ' +
                                      signed(s.interval[1], dp) +
                                      ')',
                              },
                          ])
                        : null,
                    facts(more(v)),
                ];
            },
        };
    }
    STATS['eating.contrast_effect'].n = 'pairs';

    // ---------- expanding a path into the statistics it names ----------

    function expand(analysis, path) {
        var out = [{ node: analysis, labels: [], keys: [] }];
        path.split('.').forEach(function (part) {
            var next = [];
            out.forEach(function (o) {
                var arr = /\[\]$/.test(part),
                    key = arr ? part.slice(0, -2) : part;
                if (key === '*') {
                    if (!isObj(o.node)) return;
                    Object.keys(o.node).forEach(function (k) {
                        next.push({
                            node: o.node[k],
                            labels: o.labels.concat(nameOf(k)),
                            keys: o.keys.concat(k),
                        });
                    });
                    return;
                }
                var v = isObj(o.node) ? o.node[key] : undefined;
                if (v === undefined) return;
                if (arr) {
                    list(v).forEach(function (item, idx) {
                        var label = isObj(item) && typeof item.name === 'string' ? item.name : '';
                        next.push({
                            node: item,
                            labels: o.labels.concat(label),
                            keys: o.keys.concat(key),
                            index: idx,
                        });
                    });
                } else
                    next.push({
                        node: v,
                        labels: o.labels,
                        keys: o.keys.concat(key),
                        index: o.index,
                    });
            });
            out = next;
        });
        return out.map(function (o) {
            // On a list item, the statistic lives under the last key; index is its place in the
            // list.
            return {
                stat: o.node,
                label: o.labels.filter(Boolean).join(' · '),
                key: o.keys[o.keys.length - 1],
                index: o.index,
            };
        });
    }

    // The label for a fixed key at the end of the path (watching.completion.show -> Shows).
    function leafLabel(path) {
        var last = path.split('.').pop();
        return NAMES[last] && /\.(completion|genre_mix|countries)\./.test(path) ? NAMES[last] : '';
    }

    // ---------- one statistic ----------

    function statBlock(entry, spec, analysis, ctx) {
        var s = entry.stat;
        need(isObj(s) && typeof s.status === 'string', 'statistic');
        var gate = spec.gate ? spec.gate(s, analysis) : null;
        var status = gate ? gate.status : s.status;
        var label = entry.label || spec.label || '';
        var block = h('div', {
            class: 'ld-block ld-block--' + status.replace(/\s+/g, '-'),
            'data-status': status,
        });
        if (label) block.appendChild(h('h3', { class: 'ld-block-title' }, label));

        if (status === 'not enough data yet') {
            block.appendChild(firstLine(s));
            return block;
        }
        if (status !== 'ok') {
            // "not available from source", "not configured": one line, with what is missing.
            block.appendChild(
                h(
                    'p',
                    { class: 'ld-note' },
                    h('b', null, status),
                    s.missing ? ': ' + s.missing : '',
                ),
            );
            return block;
        }
        var v = isObj(s.values) ? s.values : {};
        // A small sample may have no headline value yet (two sessions make no trend): the card then
        // draws its figures and tag without one, rather than failing on the missing number.
        var val = null;
        if (spec.value) {
            try {
                val = spec.value(s);
            } catch (err) {
                if (isNum(s.value) || s.small_sample !== true) throw err;
            }
        }
        var ivText = Array.isArray(s.interval)
            ? interval(
                  s.interval,
                  spec.intervalFmt ||
                      function (x) {
                          return num(x);
                      },
              )
            : null;
        if (val) {
            block.appendChild(
                h(
                    'p',
                    { class: 'ld-value' },
                    h('span', { class: 'ld-value-num' }, val[0]),
                    ' ',
                    h('span', { class: 'ld-value-unit' }, val[1]),
                    ivText ? h('span', { class: 'ld-interval' }, ivText) : null,
                ),
            );
        }
        if (spec.draw)
            append(
                block,
                spec.draw(v, s, {
                    label: label,
                    weekdays: ctx.weekdays,
                    analysis: analysis,
                    typeClass: TYPE_CLASS[entry.key] ? 'fill--' + TYPE_CLASS[entry.key] : null,
                }),
            );
        else if (!val)
            block.appendChild(
                h('p', { class: 'ld-note' }, "Computed, but this page doesn't draw it yet."),
            );
        block.appendChild(
            h(
                'p',
                { class: 'ld-n' },
                'n = ' +
                    plural(s.n, spec.n || '') +
                    (s.as_of && s.as_of !== analysis.as_of ? ' · as of ' + dateText(s.as_of) : ''),
                sampleTag(s) ? [' · ', sampleTag(s)] : null,
            ),
        );
        return block;
    }

    // A slot names one or more statistics (space-separated paths, e.g. completion of
    // shows, films and anime); they share one row of blocks and their "how" lines.
    // The status a statistic is shown with: its own, or its spec's gate's.
    function shownStatus(e, analysis) {
        var s = e.stat;
        if (!isObj(s) || typeof s.status !== 'string') return null;
        try {
            var gate = e.spec.gate ? e.spec.gate(s, analysis) : null;
            return gate ? gate.status : s.status;
        } catch (err) {
            return s.status;
        }
    }

    // Slots that draw several statistics as one block, keyed by the slot's data-stat.
    var GROUPS = {};
    GROUPS[
        'fantasy.manager_score.components.draft fantasy.manager_score.components.lineup ' +
            'fantasy.manager_score.components.moves fantasy.manager_score.components.strength'
    ] = {
        n: WEEKS,
        // The composite as the card's headline (percentile with its interval), then one bar per
        // component: its percentile among managers across my leagues, labelled with the raw
        // value and rank. A component still waiting is a row under the bars with a small-sample
        // tag ("Lineup · n = 0 weeks · small sample, threshold 2"), not a wait message.
        absorbs: 'fantasy.manager_score.composite',
        draw: function (entries, analysis) {
            var ok = entries.filter(function (e) {
                return (
                    okStat(e.stat) &&
                    isNum(e.stat.value) &&
                    isObj(e.stat.values) &&
                    isNum(e.stat.values.percentile)
                );
            });
            var waiting = entries.filter(function (e) {
                return isObj(e.stat) && e.stat.status === 'not enough data yet';
            });
            var comp =
                isObj(analysis.fantasy) && isObj(analysis.fantasy.manager_score)
                    ? analysis.fantasy.manager_score.composite
                    : null;
            var head = null;
            if (okStat(comp) && isNum(comp.value)) {
                var iv =
                    Array.isArray(comp.interval) &&
                    isNum(comp.interval[0]) &&
                    isNum(comp.interval[1])
                        ? '95% ' +
                          Math.round(comp.interval[0] * 100) +
                          '–' +
                          Math.round(comp.interval[1] * 100)
                        : null;
                head = h(
                    'p',
                    { class: 'ld-value' },
                    h(
                        'span',
                        { class: 'ld-value-num' },
                        ordinal(Math.round(comp.value * 100)) + ' percentile',
                    ),
                    ' ',
                    h(
                        'span',
                        { class: 'ld-value-unit' },
                        'composite of the four, among managers across my leagues',
                    ),
                    iv ? h('span', { class: 'ld-interval' }, iv) : null,
                );
            } else if (isObj(comp) && comp.status === 'not enough data yet') {
                head = firstLine(comp, 'Composite');
            }
            var items = ok.map(function (e) {
                var v = e.stat.values;
                return {
                    label: e.spec.label,
                    value: v.percentile * 100,
                    text:
                        e.spec.raw(e.stat.value) +
                        (isNum(v.rank) && isNum(v.of) ? ' · rank ' + v.rank + ' of ' + v.of : ''),
                };
            });
            return [
                head,
                items.length
                    ? bars('Where do I rank among managers across my leagues?', items, {
                          labelHeading: 'Component',
                          valueHeading: 'Percentile · raw value and rank',
                          subject: true,
                      })
                    : null,
                waiting.map(function (e) {
                    return h(
                        'p',
                        { class: 'ld-n ld-n--row' },
                        e.spec.label +
                            ' · n = ' +
                            plural(isNum(e.stat.n) ? e.stat.n : 0, WEEKS) +
                            ' · ',
                        h(
                            'span',
                            { class: 'ld-tag' },
                            'small sample, threshold ' +
                                (isNum(e.stat.min_n) ? big(e.stat.min_n) : '?'),
                        ),
                    );
                }),
            ];
        },
    };
    // Slots a group slot absorbs (drawn inside it) are hidden when that group is on the page.
    var ABSORBED = {};
    Object.keys(GROUPS).forEach(function (k) {
        if (GROUPS[k].absorbs) ABSORBED[GROUPS[k].absorbs] = k;
    });

    // Statistics still waiting for data ("not enough data yet"): in a "Why" card they are
    // drawn as the question over one line, "nothing to show yet: needs <first unit>"; elsewhere
    // they aren't drawn, and a slot left with nothing to show is hidden.
    function fillSlot(slot, analysis, ctx) {
        var entries = [],
            found = 0;
        var card = !!slot.closest('.ld-section--why');
        var group = GROUPS[slot.getAttribute('data-stat')];
        slot.textContent = '';
        slot.hidden = false;
        var absorbedBy = ABSORBED[slot.getAttribute('data-stat')];
        if (absorbedBy && document.querySelector('.ld-stat[data-stat="' + absorbedBy + '"]')) {
            slot.hidden = true;
            return;
        }
        slot.getAttribute('data-stat')
            .split(/\s+/)
            .forEach(function (path) {
                var spec = STATS[path],
                    leaf = leafLabel(path);
                if (!spec) return;
                expand(analysis, path).forEach(function (e) {
                    if (leaf) e.label = leaf;
                    e.spec = spec;
                    e.path = path;
                    found++;
                    if (!card && shownStatus(e, analysis) === 'not enough data yet') return;
                    entries.push(e);
                });
            });
        if (!entries.length && found) {
            slot.hidden = true;
            return;
        }
        if (!entries.length) {
            // A card whose statistic the file predates says so; elsewhere the slot says not
            // connected.
            var firstSpec = STATS[slot.getAttribute('data-stat').split(/\s+/)[0]];
            if (card && firstSpec && firstSpec.absentStatus) {
                slot.appendChild(
                    h(
                        'div',
                        { class: 'ld-blocks ld-blocks--one' },
                        h(
                            'div',
                            {
                                class: 'ld-block ld-block--not-available-from-source',
                                'data-status': firstSpec.absentStatus,
                            },
                            h(
                                'p',
                                { class: 'ld-note' },
                                h('b', null, firstSpec.absentStatus),
                                firstSpec.absentMissing ? ': ' + firstSpec.absentMissing : '',
                            ),
                        ),
                    ),
                );
                return;
            }
            slot.appendChild(
                card
                    ? h(
                          'div',
                          { class: 'ld-blocks ld-blocks--one' },
                          h(
                              'div',
                              {
                                  class: 'ld-block ld-block--not-enough-data-yet',
                                  'data-status': 'not in the data yet',
                              },
                              waitBox(null, firstSpec ? firstSpec.n : ''),
                          ),
                      )
                    : h('p', { class: 'panel-empty' }, NOT_CONNECTED),
            );
            return;
        }
        if (group) {
            // One block for the whole slot. Any entry still waiting makes the block wait too.
            var block = h('div', { class: 'ld-blocks ld-blocks--one' }),
                waiting = entries.filter(function (e) {
                    return shownStatus(e, analysis) === 'not enough data yet';
                });
            try {
                if (waiting.length === entries.length) {
                    block.appendChild(
                        h(
                            'div',
                            {
                                class: 'ld-block ld-block--not-enough-data-yet',
                                'data-status': 'not enough data yet',
                            },
                            firstLine(waiting[0].stat),
                        ),
                    );
                } else {
                    var b = h('div', { class: 'ld-block', 'data-status': 'ok' });
                    append(b, group.draw(entries, analysis, ctx));
                    var ns = entries
                        .filter(function (e) {
                            return okStat(e.stat);
                        })
                        .map(function (e) {
                            return e.stat.n;
                        })
                        .filter(isNum);
                    var small = entries.filter(function (e) {
                        return okStat(e.stat) && e.stat.small_sample === true;
                    })[0];
                    if (ns.length)
                        b.appendChild(
                            h(
                                'p',
                                { class: 'ld-n' },
                                'n = ' + plural(Math.min.apply(null, ns), group.n || ''),
                                small ? [' · ', sampleTag(small.stat)] : null,
                            ),
                        );
                    block.appendChild(b);
                }
            } catch (err) {
                if (window.console)
                    console.warn(
                        'lately-depth: ' + slot.getAttribute('data-stat') + ' not drawn:',
                        err.message,
                    );
                block.appendChild(
                    h('p', { class: 'panel-empty' }, "Couldn't draw this statistic right now."),
                );
            }
            slot.appendChild(block);
        } else {
            // One block, or blocks whose tables need the width: one to a row. Blocks that come one
            // per type (films, shows, anime) or one per fantasy team go under the section's tabs,
            // after anything that doesn't.
            var tabbed = entries.filter(function (e) {
                return tabSpec(e, analysis) !== null;
            });
            var plain = entries.filter(function (e) {
                return tabSpec(e, analysis) === null;
            });
            if (plain.length) {
                var one =
                    plain.length === 1 ||
                    plain.some(function (e) {
                        return e.spec.wide;
                    });
                var grid = h('div', { class: 'ld-blocks' + (one ? ' ld-blocks--one' : '') });
                slot.appendChild(grid);
                plain.forEach(function (e) {
                    drawInto(grid, e, analysis, ctx);
                });
            }
            if (tabbed.length) slot.appendChild(tabbedBlocks(slot, tabbed, analysis, ctx));
        }
        // The pipeline's "how" sentence: one per section, for its primary statistic, under the slot
        // that holds it (or the slot that absorbed it).
        var sec = slot.closest('.ld-section');
        if (sec && holdsPrimary(slot, sec)) append(slot, sectionHow(sec, analysis));
    }

    function drawInto(grid, e, analysis, ctx) {
        try {
            grid.appendChild(statBlock(e, e.spec, analysis, ctx));
        } catch (err) {
            if (window.console)
                console.warn('lately-depth: ' + e.path + ' not drawn:', err.message);
            grid.appendChild(
                h('p', { class: 'panel-empty' }, "Couldn't draw this statistic right now."),
            );
        }
    }

    // Which tab set an entry belongs to: the watching type (its key is show, film or anime, in
    // either number) or the fantasy team (a fantasy.teams[] path); null for anything else.
    var TYPE_KEY = { film: 'film', films: 'film', show: 'show', shows: 'show', anime: 'anime' };
    var TYPE_TABS = {
        sync: 'watching-type',
        keys: ['film', 'show', 'anime'],
        labels: ['Films', 'Shows', 'Anime'],
        label: 'Films, shows or anime',
    };
    function teamTabs(analysis) {
        var teams = isObj(analysis.fantasy) ? list(analysis.fantasy.teams).filter(isObj) : [];
        var labels = teams.map(function (t, i) {
            return typeof t.name === 'string' && t.name ? t.name : 'Team ' + (i + 1);
        });
        return {
            sync: 'fantasy-team',
            keys: labels.map(slug),
            labels: labels,
            label: 'My teams',
            onSelect: function (i, key) {
                setTeamHash(key);
            },
        };
    }
    function tabSpec(e, analysis) {
        if (/^fantasy\.teams\[\]/.test(e.path) && isNum(e.index)) return teamTabs(analysis);
        if (/^watching\./.test(e.path) && TYPE_KEY[e.key]) return TYPE_TABS;
        return null;
    }
    function tabIndex(e, spec) {
        return spec.sync === 'fantasy-team' ? e.index : spec.keys.indexOf(TYPE_KEY[e.key]);
    }
    // The entries of one slot under tabs: one panel per tab, the strip on the section's first
    // tabbed slot only; later slots in the section follow it.
    function tabbedBlocks(slot, entries, analysis, ctx) {
        var spec = tabSpec(entries[0], analysis);
        var panels = spec.labels.map(function () {
            return [];
        });
        entries.forEach(function (e) {
            var i = tabIndex(e, spec);
            if (i >= 0 && i < panels.length) panels[i].push(e);
        });
        var nodes = panels.map(function (es) {
            if (!es.length) return h('p', { class: 'ld-note' }, 'Nothing for this one yet.');
            var grid = h('div', { class: 'ld-blocks ld-blocks--one' });
            es.forEach(function (e) {
                drawInto(grid, e, analysis, ctx);
            });
            return grid;
        });
        var sec = slot.closest('.ld-section');
        var first = !(sec && sec.querySelector('.tab-strip[data-sync="' + spec.sync + '"]'));
        var g = tabs(spec.labels, nodes, {
            sync: spec.sync,
            keys: spec.keys,
            strip: first,
            label: spec.label,
            onSelect: spec.onSelect,
            selected: selectedIndex(spec.sync),
        });
        return g.root;
    }
    function selectedIndex(sync) {
        var g = list(TAB_GROUPS[sync])[0];
        return g ? g.selected : 0;
    }

    // A section's primary statistic: its data-how (a HOW: line in the content file), else the
    // first statistic listed. Its "how" sentence is folded under a "how" summary, closed unless
    // the section carries data-how-open. Component rows (the manager score) have none.
    function primaryPath(sec) {
        var p = sec.getAttribute('data-how');
        if (p) return p;
        var first = sec.querySelector('.ld-stat');
        return first ? first.getAttribute('data-stat').split(/\s+/)[0] : null;
    }
    function holdsPrimary(slot, sec) {
        var p = primaryPath(sec);
        if (!p) return false;
        var own = slot.getAttribute('data-stat');
        var holder = Array.prototype.filter.call(sec.querySelectorAll('.ld-stat'), function (s) {
            return s.getAttribute('data-stat').split(/\s+/).indexOf(p) >= 0;
        })[0];
        if (!holder) return false;
        var hs = holder.getAttribute('data-stat');
        return hs === own || ABSORBED[hs] === own;
    }
    function sectionHow(sec, analysis) {
        var p = primaryPath(sec);
        if (!p) return null;
        var e = expand(analysis, p).filter(function (x) {
            return (
                isObj(x.stat) &&
                typeof x.stat.how === 'string' &&
                x.stat.status !== 'not available from source' &&
                x.stat.status !== 'not configured'
            );
        })[0];
        if (!e) return null;
        return h(
            'details',
            { class: 'how', open: sec.hasAttribute('data-how-open') },
            h('summary', { class: 'control control--quiet' }, 'how'),
            h('p', { class: 'how-text' }, e.stat.how),
        );
    }

    // A FEED: slot holds a block of the feed itself (lineup grid, recent lists, lift tiles,
    // rankings), drawn by js/lately.js; nothing to draw hides the slot.
    function fillFeed(slot, data) {
        var LF = window.LatelyFeed,
            nodes = null;
        slot.textContent = '';
        try {
            nodes = LF && data ? LF.block(slot.getAttribute('data-block'), data) : null;
        } catch (err) {
            if (window.console)
                console.warn(
                    'lately-depth: ' + slot.getAttribute('data-block') + ' not drawn:',
                    err.message,
                );
        }
        slot.hidden = !nodes;
        append(slot, nodes);
    }

    // ---------- headline numbers (the pages and the main panels) ----------

    function okStat(s) {
        return isObj(s) && s.status === 'ok';
    }
    function waiting(label, s) {
        return { label: label, value: '–', note: isObj(s) ? s.status : 'not connected yet' };
    }

    // Two or three numbers per feed: [{label, value, note}].
    function headline(feed, a) {
        if (!isObj(a)) return [];
        var out = [];
        if (feed === 'fantasy' && isObj(a.fantasy)) {
            list(a.fantasy.teams)
                .slice(0, 3)
                .forEach(function (t) {
                    var s = t.playoff_odds;
                    out.push(
                        okStat(s)
                            ? {
                                  label: 'Playoff odds, ' + t.name,
                                  value: pct(s.values.playoffs),
                                  note: 'expected wins ' + num(s.values.expected_wins, 1),
                              }
                            : waiting('Playoff odds, ' + t.name, s),
                    );
                });
        } else if (feed === 'watching' && isObj(a.watching) && isObj(a.watching.completion)) {
            ['show', 'film', 'anime'].forEach(function (k) {
                var s = a.watching.completion[k];
                out.push(
                    okStat(s)
                        ? {
                              label: 'Completion, ' + nameOf(k).toLowerCase(),
                              value: pct(s.value),
                              note:
                                  s.values.finished + ' finished, ' + s.values.dropped + ' dropped',
                          }
                        : waiting('Completion, ' + nameOf(k).toLowerCase(), s),
                );
            });
        } else if (feed === 'listening' && isObj(a.listening)) {
            var l = a.listening,
                hl = l.album_half_life;
            var cur =
                okStat(hl) && isObj(hl.values.current) && hl.values.current.status === 'ok'
                    ? hl.values.current
                    : null;
            out.push(
                cur
                    ? {
                          label: "Half-life, this week's album",
                          value: num(cur.half_life_days, 1) + ' days',
                          note: cur.album + ' by ' + cur.artist,
                      }
                    : waiting("Half-life, this week's album", hl),
            );
            var d = l.discovery,
                last = okStat(d) ? list(d.values.months).slice(-1)[0] : null;
            out.push(
                last
                    ? {
                          label: 'Plays by new artists',
                          value: pct(last.share),
                          note: monthText(last.month),
                      }
                    : waiting('Plays by new artists', d),
            );
            var fr = l.first_repeat;
            out.push(
                okStat(fr)
                    ? {
                          label: 'First repeat, median',
                          value: hoursText(fr.values.median_hours),
                          note: "from a new track's first play to its second",
                      }
                    : waiting('First repeat, median', fr),
            );
        } else if (feed === 'eating' && isObj(a.eating)) {
            var e = a.eating,
                sc = e.scores;
            out.push(
                okStat(sc)
                    ? {
                          label: 'Median score',
                          value: num(sc.values.overall.median, 2),
                          note:
                              'middle half ' +
                              num(sc.values.overall.q1, 2) +
                              ' to ' +
                              num(sc.values.overall.q3, 2),
                      }
                    : waiting('Median score', sc),
            );
            var hb = e.home_bias;
            out.push(
                okStat(hb)
                    ? {
                          label: 'Home against away',
                          value: signed(hb.value, 2),
                          note: 'most-ranked city against elsewhere, same cuisine',
                      }
                    : waiting('Home against away', hb),
            );
        } else if (feed === 'lifting' && isObj(a.lifting)) {
            var lf = a.lifting,
                r = lf.body_weight_rate;
            out.push(
                okStat(r)
                    ? {
                          label: 'Body weight since the cut',
                          value: signed(r.value, 2) + ' lb/wk',
                          note:
                              interval(r.interval, function (x) {
                                  return signed(x, 2);
                              }) || '',
                      }
                    : waiting('Body weight since the cut', r),
            );
            if (okStat(r) && isNum(r.values.latest))
                out.push({
                    label: 'Body weight, latest',
                    value: num(r.values.latest, 1) + ' lb',
                    note: 'from ' + num(r.values.first, 1) + ' lb',
                });
            // Strength kept joins once any lift's interval excludes zero.
            var kept = isObj(lf.strength_kept)
                ? Object.keys(lf.strength_kept).filter(function (k) {
                      var s = lf.strength_kept[k];
                      return okStat(s) && excludesZero(s.interval);
                  })
                : [];
            if (kept.length) {
                var ks = lf.strength_kept[kept[0]];
                out.push({
                    label: kept[0] + ': e1RM kept per lb lost',
                    value: num(ks.value, 2),
                    note: interval(ks.interval, function (x) {
                        return num(x, 2);
                    }),
                });
            }
        }
        // A number still waiting for data isn't shown as a "–" tile; the page's line counts it.
        return out
            .filter(function (i) {
                return i.note !== 'not enough data yet';
            })
            .slice(0, 3);
    }

    function headlineRow(items, cls) {
        return h(
            'div',
            { class: 'stats stats--tight' + (cls ? ' ' + cls : '') },
            items.map(function (i) {
                return h(
                    'div',
                    { class: 'stat' },
                    h('div', { class: 'stat-label' }, i.label),
                    h('div', { class: 'stat-value' }, i.value),
                    i.note ? h('div', { class: 'stat-note' }, i.note) : null,
                );
            }),
        );
    }

    // Thin data. A statistic that is ok on fewer than min_n units carries
    // small_sample: it is drawn as usual with a mono tag beside its n, "small sample, threshold 10"
    // (the threshold is min_n; unit: added when the tag stands alone). One still waiting shows a
    // single line from values.first_unit, "nothing to show yet: needs one album with 10 plays in
    // its first week", and nothing else: no count of units needed and no date.
    function sampleTag(s, unit) {
        if (!isObj(s) || s.small_sample !== true) return null;
        return h(
            'span',
            { class: 'ld-tag' },
            'small sample, threshold ' +
                (isNum(s.min_n) ? big(s.min_n) : '?') +
                (unit ? ' ' + unit : ''),
        );
    }
    function firstUnitText(s) {
        var fu =
            isObj(s) && isObj(s.values) && typeof s.values.first_unit === 'string'
                ? s.values.first_unit.trim().replace(/\.$/, '')
                : '';
        if (!fu) return '';
        fu = fu.replace(/^nothing to show yet:?\s*/i, '');
        return /^needs?\b/i.test(fu) ? fu : 'needs ' + fu;
    }
    function firstLine(s, label) {
        var rest = firstUnitText(s);
        return h(
            'p',
            { class: 'ld-wait' },
            h('b', null, (label ? label + ': ' : '') + 'nothing to show yet'),
            rest ? ': ' + rest : '',
        );
    }
    // The line for a card or panel whose statistic isn't drawn: waiting (its first unit), another
    // status with what is missing, or "not in the data yet" when the file predates the statistic.
    function waitBox(s) {
        if (!isObj(s))
            return h(
                'p',
                { class: 'ld-wait' },
                h('b', null, 'not in the data yet'),
                ' · appears once the pipeline publishes it',
            );
        if (s.status === 'not enough data yet') return firstLine(s);
        return h(
            'p',
            { class: 'ld-wait' },
            h('b', null, String(s.status)),
            s.missing ? ': ' + s.missing : '',
        );
    }

    window.LatelyDepth = {
        headline: headline,
        headlineRow: headlineRow,
        waitBox: waitBox,
        okStat: okStat,
        sampleTag: sampleTag,
        firstUnitText: firstUnitText,
        collapseRows: collapseRows,
        collapsible: collapsible,
        tabs: tabs,
        selectTabs: selectTabs,
        selectTabKey: selectTabKey,
        slug: slug,
        charts: {
            multiLine: multiLine,
            quadrant: quadrant,
            indexedLines: indexedLines,
            sTierBars: sTierBars,
            bars: bars,
            columns: columns,
            tierBars: tierBars,
            effectBars: effectBars,
            survivalChart: survivalChart,
        },
        splitSeries: splitSeries,
        SPLIT_NAMES: SPLIT_NAMES,
        disagreementLines: disagreementLines,
        hazardSentence: hazardSentence,
        longestLine: longestLine,
        censorDays: censorDays,
        PRESYNC_NOTE: PRESYNC_NOTE,
        attributionNodes: attributionNodes,
        tierText: tierText,
        tierLetter: tierLetter,
        fmt: {
            num: num,
            signed: signed,
            pct: pct,
            big: big,
            plural: plural,
            dateText: dateText,
            monthText: monthText,
            record: record,
            interval: interval,
            hoursText: hoursText,
        },
    };

    // ---------- the page ----------

    function draw(data) {
        var feed = document.body.getAttribute('data-feed');
        var a = isObj(data) ? data.analysis : null;
        var slots = document.querySelectorAll('.ld-stat');
        if (!isObj(a)) {
            // No analysis block: the feed blocks still draw; every statistic slot is hidden.
            document.querySelector('.ld-missing').hidden = false;
            document.querySelector('.ld-asof').hidden = true;
            Array.prototype.forEach.call(slots, function (s) {
                s.hidden = true;
            });
            Array.prototype.forEach.call(document.querySelectorAll('.ld-feed'), function (slot) {
                fillFeed(slot, data);
            });
            hideEmpty();
            retime();
            return;
        }
        var asof = document.querySelector('.ld-asof-date');
        try {
            asof.textContent = dateText(a.as_of);
            asof.setAttribute('datetime', a.as_of);
        } catch (e) {
            asof.textContent = 'unknown';
        }
        var row = document.querySelector('.ld-headline');
        try {
            append(row, headlineRow(headline(feed, a)));
        } catch (e) {
            /* the sections still draw */
        }
        var weekdays =
            isObj(a.cross) && isObj(a.cross.rhythm) && list(a.cross.rhythm.weekdays).length === 7
                ? a.cross.rhythm.weekdays
                : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        var ctx = { weekdays: weekdays };
        Array.prototype.forEach.call(slots, function (slot) {
            fillSlot(slot, a, ctx);
        });
        Array.prototype.forEach.call(document.querySelectorAll('.ld-feed'), function (slot) {
            fillFeed(slot, data);
        });
        oneHeadline();
        hideEmpty();
        // The team in the hash (#team=key, from the main page or the lineup) picks the team tabs.
        function followHash() {
            var t = hashParts().team;
            if (t) selectTabKey('fantasy-team', t);
        }
        followHash();
        window.addEventListener('hashchange', followHash);
        // The credits in meta.attributions, while any of the statistics they cover is drawn.
        var attrs = isObj(a.meta)
            ? list(a.meta.attributions).filter(function (x) {
                  return isObj(x) && typeof x.text === 'string';
              })
            : [];
        Array.prototype.forEach.call(
            document.querySelectorAll('.ld-attributions[data-when-stats]'),
            function (p) {
                var any = p
                    .getAttribute('data-when-stats')
                    .split(/\s+/)
                    .some(function (path) {
                        return expand(a, path).some(function (e) {
                            return okStat(e.stat);
                        });
                    });
                p.textContent = '';
                p.hidden = !(any && attrs.length);
                if (!p.hidden) append(p, attributionNodes(attrs));
            },
        );
        // A credit shown only while its source is in the file (analysis.meta.sources_included).
        var included = isObj(a.meta) ? list(a.meta.sources_included) : [];
        Array.prototype.forEach.call(
            document.querySelectorAll('.ld-attribution[data-when-source]'),
            function (p) {
                p.hidden = included.indexOf(p.getAttribute('data-when-source')) < 0;
            },
        );
        attributionRow();
        retime();
    }

    // A "built with" row with nothing visible in its value is left out: the attribution row
    // shows while one of its licence lines does, and no row shows empty.
    function attributionRow() {
        Array.prototype.forEach.call(document.querySelectorAll('.tp-built-row'), function (row) {
            var dd = row.querySelector('dd');
            var shown = Array.prototype.filter.call(dd ? dd.childNodes : [], function (n) {
                return n.nodeType === 3 || !n.hidden;
            });
            var text = shown
                .map(function (n) {
                    return n.textContent;
                })
                .join('')
                .trim();
            row.hidden = !text;
        });
    }
    // The reading bar (js/track.js) measures the sections once they are drawn.
    function retime() {
        try {
            document.dispatchEvent(new CustomEvent('tp:retime'));
        } catch (e) {
            /* no CustomEvent: the bar keeps its first measure */
        }
    }

    // One headline number per section: the first value outside the tabs keeps its size, or, in a
    // section of tabbed blocks only, the first value in each tab panel; every other value in the
    // section is a mono fact line.
    function oneHeadline() {
        Array.prototype.forEach.call(document.querySelectorAll('.ld-section'), function (sec) {
            var values = Array.prototype.slice.call(sec.querySelectorAll('.ld-value'));
            var outside = values.filter(function (v) {
                return !v.closest('.tab-panel');
            });
            var kept = outside.slice(0, 1);
            if (!outside.length) {
                Array.prototype.forEach.call(sec.querySelectorAll('.tab-panel'), function (panel) {
                    var first = panel.querySelector('.ld-value');
                    if (first) kept.push(first);
                });
            }
            values.forEach(function (v) {
                if (kept.indexOf(v) < 0) v.classList.add('ld-value--line');
            });
        });
    }

    // A section whose every slot is hidden is hidden; the reading bar drops its segment when
    // it measures the page again (js/track.js).
    function hideEmpty() {
        Array.prototype.forEach.call(document.querySelectorAll('.ld-section'), function (sec) {
            sec.hidden = !Array.prototype.some.call(
                sec.querySelectorAll('.ld-stat, .ld-feed'),
                function (x) {
                    return !x.hidden;
                },
            );
        });
    }

    function load(url) {
        return fetch(url, { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error(url + ' ' + res.status);
                return res.json();
            })
            .then(function (d) {
                if (!isObj(d) || d.schema_version !== 1)
                    throw new Error(url + ' has an unexpected shape');
                return d;
            });
    }

    // #old-id (a card absorbed into another) becomes #new-id, scrolled to.
    function redirectAlias() {
        var id = hashParts().id;
        if (!id) return;
        var el = document.getElementById(id);
        if (!el || !el.classList.contains('ld-alias')) return;
        var to = el.getAttribute('data-to');
        if (to && document.getElementById(to)) {
            if (history.replaceState) history.replaceState(null, '', '#' + to);
            document.getElementById(to).scrollIntoView();
        }
    }

    // data/lately.json missing or unreadable: the page's main is one line and nothing else.
    function unavailable() {
        var main = document.getElementById('main');
        Array.prototype.forEach.call(main.children, function (c) {
            c.hidden = true;
            c.style.display = 'none';
        });
        main.appendChild(
            h('p', { class: 'panel-empty lately-updating' }, 'Lately is being updated.'),
        );
    }

    function start() {
        if (!document.body.classList.contains('ld-body') || !window.fetch) return;
        redirectAlias();
        var root = document.body.getAttribute('data-root') || '';
        load(root + 'data/lately.json')
            .then(draw)
            .catch(function (err) {
                if (window.console)
                    console.warn('lately: data/lately.json unavailable:', err.message);
                unavailable();
            })
            .catch(function () {
                /* never break the page */
            });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
