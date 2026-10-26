// NBA shot demo, for this page only: one player's shots by distance band, the learned
// choice model's factor importance over five seeds, and the held-out comparison, all
// from demo.json (aggregates only). The data has distance but no court position, so the
// bands are drawn as concentric arcs around the basket and nothing else.
(function () {
    'use strict';
    var slot = document.querySelector('.tp-demo[data-src]');
    if (!slot) return;
    var NS = 'http://www.w3.org/2000/svg';

    // Held-out methods shown, in order. The chosen network is the one the importance comes from.
    var METHODS = [
        ['logistic_regression', 'linear model (logistic regression)'],
        ['model_repo', "network, the course's own loss"],
        ['model_bce', 'network, plain cross-entropy (chosen)'],
    ];

    function h(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined && text !== null) el.textContent = text;
        return el;
    }
    function s(tag, attrs, text) {
        var el = document.createElementNS(NS, tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function add(parent) {
        for (var i = 1; i < arguments.length; i++)
            if (arguments[i]) parent.appendChild(arguments[i]);
        return parent;
    }
    function pct(x, dp) {
        return (x * 100).toFixed(dp === undefined ? 0 : dp) + '%';
    }
    function num(n) {
        return n.toLocaleString('en-US');
    }

    function fail() {
        slot.textContent = '';
        slot.appendChild(
            h(
                'p',
                'tp-demo-fallback',
                'The shot summaries could not be loaded. The results below do not depend on them.',
            ),
        );
    }

    if (!window.fetch) return fail();
    fetch(slot.getAttribute('data-src'))
        .then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.json();
        })
        .then(function (data) {
            if (data.schema !== 'nba-shot-decisions/1' || !data.players || !data.players.length)
                throw new Error('schema');
            build(data);
        })
        .catch(fail);

    function build(data) {
        var players = data.players,
            sel = 0;
        slot.textContent = '';
        var root = h('div', 'nb');

        var chips = h('div', 'nb-chips');
        chips.setAttribute('role', 'toolbar');
        chips.setAttribute('aria-label', 'Players. Use the arrow keys to move between them.');
        var buttons = players.map(function (p, i) {
            var b = h('button', 'tp-pick nb-chip', p.name);
            b.type = 'button';
            b.tabIndex = -1;
            b.addEventListener('click', function () {
                select(i, true);
            });
            chips.appendChild(b);
            return b;
        });
        chips.addEventListener('keydown', function (e) {
            var to = {
                ArrowRight: sel + 1,
                ArrowDown: sel + 1,
                ArrowLeft: sel - 1,
                ArrowUp: sel - 1,
                Home: 0,
                End: players.length - 1,
            }[e.key];
            if (to === undefined) return;
            e.preventDefault();
            select((to + players.length) % players.length, true);
        });

        var out = h('div', 'nb-out');
        out.setAttribute('aria-live', 'polite');
        add(root, chips, out);
        slot.appendChild(root);

        function select(i, focus) {
            sel = i;
            buttons.forEach(function (b, k) {
                b.setAttribute('aria-pressed', String(k === i));
                b.tabIndex = k === i ? 0 : -1;
            });
            render(players[i]);
            if (focus) buttons[i].focus();
        }

        function render(p) {
            out.textContent = '';
            add(
                out,
                add(
                    h('div', 'nb-head'),
                    h('h3', 'nb-name', p.name),
                    h(
                        'span',
                        'nb-meta',
                        num(p.attempts) + ' shots in 2014–15 · ' + pct(p.fg_pct, 1) + ' made',
                    ),
                ),
            );

            var b = bands(p);
            add(out, add(h('div', 'nb-grid'), b.chart, importance(p)), b.detail, comparison(p));
        }

        // ---- distance bands: concentric arcs, plus the same numbers as a list ----
        function bands(p) {
            var z = p.zones,
                edges = [0, 4, 14, 22, 28];
            var R = 230,
                k = R / 28,
                cx = 250,
                cy = 250;
            var svg = s('svg', {
                viewBox: '0 0 500 270',
                class: 'nb-svg',
                role: 'img',
                'aria-label':
                    p.name +
                    "'s shots by distance from the basket, in four bands. " +
                    'The same numbers are listed below.',
            });
            var top = Math.max.apply(
                null,
                z.map(function (b) {
                    return b.share_of_attempts;
                }),
            );
            for (var i = z.length - 1; i >= 0; i--) {
                var r1 = edges[i + 1] * k,
                    r0 = edges[i] * k;
                var d =
                    'M' +
                    (cx - r1) +
                    ',' +
                    cy +
                    ' A' +
                    r1 +
                    ',' +
                    r1 +
                    ' 0 0 1 ' +
                    (cx + r1) +
                    ',' +
                    cy +
                    (r0
                        ? ' L' +
                          (cx + r0) +
                          ',' +
                          cy +
                          ' A' +
                          r0 +
                          ',' +
                          r0 +
                          ' 0 0 0 ' +
                          (cx - r0) +
                          ',' +
                          cy +
                          ' Z'
                        : ' Z');
                svg.appendChild(
                    s('path', {
                        d: d,
                        class: 'nb-band',
                        style:
                            'fill-opacity:' +
                            (0.12 + (0.6 * z[i].share_of_attempts) / top).toFixed(2),
                    }),
                );
            }
            for (var j = 1; j < edges.length - 1; j++) {
                svg.appendChild(
                    s(
                        'text',
                        { x: cx + edges[j] * k + 3, y: cy + 14, class: 'nb-tick' },
                        edges[j] + ' ft',
                    ),
                );
            }
            svg.appendChild(
                s('text', { x: cx - R, y: cy + 14, class: 'nb-tick' }, '22+ ft continues'),
            );
            svg.appendChild(
                s('line', { x1: cx - R - 6, y1: cy, x2: cx + R + 6, y2: cy, class: 'nb-base' }),
            );
            svg.appendChild(s('circle', { cx: cx, cy: cy, r: 4, class: 'nb-hoop' }));
            // labels on the vertical axis, inside each band
            z.forEach(function (b, i) {
                var mid = (i === 0 ? 2.1 : (edges[i] + edges[i + 1]) / 2) * k,
                    y = cy - mid;
                var t = s('text', {
                    x: cx,
                    y: y - 2,
                    'text-anchor': 'middle',
                    class: 'nb-band-label' + (i === 0 ? ' nb-band-label--small' : ''),
                });
                t.appendChild(s('tspan', { x: cx, class: 'nb-strong' }, num(b.attempts)));
                t.appendChild(
                    s('tspan', { x: cx, dy: i === 0 ? 11 : 15 }, pct(b.fg_pct) + ' made'),
                );
                svg.appendChild(t);
            });

            var list = h('table', 'nb-table');
            list.setAttribute('aria-label', p.name + ': shots by distance band');
            var head = h('tr');
            ['band', 'shots', 'share', 'made', 'threes', 'defender, median'].forEach(function (c) {
                var th = h('th', null, c);
                th.scope = 'col';
                head.appendChild(th);
            });
            add(list, add(h('thead'), head));
            var body = h('tbody');
            z.forEach(function (b) {
                var tr = h('tr');
                var th = h('th', null, b.label);
                th.scope = 'row';
                tr.appendChild(th);
                [
                    num(b.attempts),
                    pct(b.share_of_attempts),
                    pct(b.fg_pct, 1),
                    num(b.three_point_attempts),
                    b.median_defender_ft.toFixed(1) + ' ft',
                ].forEach(function (v, k) {
                    var td = h('td', null, v);
                    td.setAttribute(
                        'data-label',
                        ['shots', 'share', 'made', 'threes', 'defender, median'][k],
                    );
                    tr.appendChild(td);
                });
                body.appendChild(tr);
            });
            list.appendChild(body);

            var deep = z[z.length - 1];
            var note = h('p', 'nb-note');
            add(
                note,
                h('strong', null, 'The 22+ ft band is not the three-point line. '),
                document.createTextNode(
                    'Most of it is threes (' +
                        num(deep.three_point_attempts) +
                        ' of ' +
                        num(deep.attempts) +
                        ' here), but the line is 23 ft 9 in from the basket at the top of the ' +
                        'arc and 22 ft only in the corners, ' +
                        'so the band also holds long twos. The data has distance only, so the ' +
                        'arcs are bands, not places on the court.',
                ),
            );

            // The arcs sit beside the importance chart; the numbers and the note run under both.
            var chart = h('div', 'nb-panel');
            add(
                chart,
                h('h4', 'nb-sub', 'where the shots came from'),
                add(h('div', 'nb-fig'), svg),
            );
            var detail = h('div', 'nb-panel');
            add(
                detail,
                h('h4', 'nb-sub nb-sub--table', 'where the shots came from, by band'),
                list,
                note,
            );
            return { chart: chart, detail: detail };
        }

        // ---- factor importance, mean and range over five seeds ----
        function importance(p) {
            var v = p.importance.values;
            var names = Object.keys(v).sort(function (a, b) {
                return v[b].mean - v[a].mean;
            });
            var top = Math.max.apply(
                null,
                names.map(function (n) {
                    return v[n].max;
                }),
            );
            var box = h('div', 'nb-panel');
            box.appendChild(h('h4', 'nb-sub', 'what the choice model leans on'));
            box.appendChild(
                h(
                    'p',
                    'nb-small',
                    "Share of the model's sensitivity, by factor: the dot is the mean over " +
                        'five training seeds, the bar the lowest to highest.',
                ),
            );
            var ul = h('ul', 'nb-imp');
            names.forEach(function (n) {
                var x = v[n];
                var li = h('li', 'nb-imp-row');
                var track = h('span', 'nb-imp-track');
                track.setAttribute('aria-hidden', 'true');
                var range = h('span', 'nb-imp-range');
                range.style.left = (x.min / top) * 100 + '%';
                range.style.width = Math.max(0.6, ((x.max - x.min) / top) * 100) + '%';
                var dot = h('span', 'nb-imp-dot');
                dot.style.left = (x.mean / top) * 100 + '%';
                add(track, range, dot);
                add(
                    li,
                    h('span', 'nb-imp-label', n),
                    track,
                    h(
                        'span',
                        'nb-imp-value',
                        pct(x.mean, 1) +
                            ' (' +
                            (x.min * 100).toFixed(1) +
                            '–' +
                            pct(x.max, 1) +
                            ')',
                    ),
                );
                ul.appendChild(li);
            });
            box.appendChild(ul);
            box.appendChild(
                h(
                    'p',
                    'nb-note',
                    'Defender distance partly reflects the shot generator, which proposed more ' +
                        'open shots than the players actually got.',
                ),
            );
            return box;
        }

        // ---- held-out comparison: real shot ranked first among its alternatives ----
        function comparison(p) {
            var box = h('div', 'nb-panel nb-panel--wide');
            box.appendChild(
                h('h4', 'nb-sub', 'held-out shots: how often the real shot is ranked first'),
            );
            var chance = p.test.logistic_regression.top1_chance;
            box.appendChild(
                h(
                    'p',
                    'nb-small',
                    'Each real shot competes with its generated alternatives. Lines are 95% ' +
                        'bootstrap intervals; chance is ' +
                        pct(chance) +
                        '.',
                ),
            );
            var ul = h('ul', 'nb-cmp');
            METHODS.forEach(function (m) {
                var t = p.test[m[0]],
                    ci = (p.test_ci95[m[0]] || {}).top1_within_shot;
                if (!t || t.top1_within_shot === null) return;
                var li = h('li', 'nb-cmp-row');
                var track = h('span', 'nb-cmp-track');
                track.setAttribute('aria-hidden', 'true');
                var chanceMark = h('span', 'nb-cmp-chance');
                chanceMark.style.left = chance * 100 + '%';
                track.appendChild(chanceMark);
                if (ci) {
                    var r = h('span', 'nb-cmp-ci');
                    r.style.left = ci[0] * 100 + '%';
                    r.style.width = (ci[1] - ci[0]) * 100 + '%';
                    track.appendChild(r);
                }
                var dot = h('span', 'nb-cmp-dot');
                dot.style.left = t.top1_within_shot * 100 + '%';
                track.appendChild(dot);
                add(
                    li,
                    h('span', 'nb-cmp-label', m[1]),
                    track,
                    h(
                        'span',
                        'nb-cmp-value',
                        pct(t.top1_within_shot) +
                            (ci ? ' (' + pct(ci[0]) + ' to ' + pct(ci[1]) + ')' : ''),
                    ),
                );
                ul.appendChild(li);
            });
            box.appendChild(ul);
            var scale = h('p', 'nb-scale');
            scale.setAttribute('aria-hidden', 'true');
            add(
                scale,
                h('span', null, '0%'),
                h('span', null, 'dashed line: chance'),
                h('span', null, '100%'),
            );
            box.appendChild(scale);
            return box;
        }

        select(0, false);
    }
})();
