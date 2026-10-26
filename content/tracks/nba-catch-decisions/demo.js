// Exchange-rate map, for this page only: what a foot of space at the catch is worth to
// each player in shot-clock seconds, from demo.json (built from results.json →
// stage8_exchange_rate_pooled.all). One dot per player, sorted by rate, with its interval
// as a thin bar; players the clock doesn't resolve are hollow and sorted to the end.
// Hovering, tapping or arrow keys pick a player for the readout. Below 640px the chart
// gives way to a list: the ten highest and ten lowest resolved players and the three.
(function () {
    'use strict';
    var slot = document.querySelector('.tp-demo[data-src]');
    if (!slot) return;
    var NS = 'http://www.w3.org/2000/svg';
    // The three players the page discusses, by their name in the data, with their label.
    var MARKED = [
        ['Stephen Curry', 'Curry'],
        ['LeBron James', 'LeBron'],
        ['James Harden', 'Harden'],
    ];
    var LO = 0,
        HI = 30; // the rate axis, in s/ft; anything beyond is drawn at the edge

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
    function f1(x) {
        return (Math.round(x * 10) / 10).toFixed(1).replace('-', '−');
    }
    function num(n) {
        return n.toLocaleString('en-US');
    }
    function label(p) {
        for (var i = 0; i < MARKED.length; i++) if (MARKED[i][0] === p.name) return MARKED[i][1];
        return null;
    }
    function describe(p) {
        return (
            p.name +
            ': ' +
            (p.unresolved ? 'not resolved by the clock; point estimate ' : '') +
            f1(p.ER) +
            ' s per foot, interval ' +
            f1(p.ER_ci[0]) +
            ' to ' +
            f1(p.ER_ci[1]) +
            ', ' +
            num(p.n) +
            ' catches'
        );
    }

    function fail() {
        slot.textContent = '';
        slot.appendChild(
            h(
                'p',
                'tp-demo-fallback',
                'The exchange-rate map could not be loaded. The results below do not depend on it.',
            ),
        );
    }

    function draw(data) {
        var players = data.players.slice().sort(function (a, b) {
            return a.unresolved - b.unresolved || a.ER - b.ER;
        });
        var resolved = players.filter(function (p) {
            return !p.unresolved;
        });
        var root = h('div', 'er');

        // readout: the picked player
        var out = h('p', 'er-readout');
        out.setAttribute('aria-live', 'polite');
        root.appendChild(out);

        // ---- chart (640px and up)
        var W = 760,
            H = 342,
            L = 40,
            R = 12,
            T = 26,
            B = 34;
        var n = players.length,
            step = (W - L - R) / n;
        var y = function (v) {
            return T + (H - T - B) * (1 - (Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO));
        };
        var x = function (i) {
            return L + step * (i + 0.5);
        };
        var svg = s('svg', {
            viewBox: '0 0 ' + W + ' ' + H,
            class: 'er-svg',
            role: 'img',
            tabindex: '0',
            'aria-label':
                'Exchange rate for each of ' +
                n +
                ' players, sorted, with intervals; league median ' +
                f1(data.league_median) +
                ' s per foot. Arrow keys move between players.',
        });
        for (var t = LO; t <= HI; t += 5) {
            svg.appendChild(s('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: 'er-grid' }));
            svg.appendChild(
                s(
                    'text',
                    { x: L - 6, y: y(t) + 4, class: 'er-tick', 'text-anchor': 'end' },
                    String(t),
                ),
            );
        }
        svg.appendChild(
            s('text', { x: L, y: H - 8, class: 'er-tick' }, 'players, lowest rate to highest'),
        );
        var split = x(resolved.length) - step / 2;
        svg.appendChild(s('line', { x1: split, x2: split, y1: T, y2: H - B, class: 'er-split' }));
        svg.appendChild(
            s(
                'text',
                { x: split + 4, y: H - 8, class: 'er-tick' },
                "clock doesn't resolve (" + (n - resolved.length) + ') →',
            ),
        );
        svg.appendChild(
            s('text', { x: L - 6, y: 12, class: 'er-tick', 'text-anchor': 'end' }, 's/ft'),
        );

        var med = y(data.league_median);
        svg.appendChild(s('line', { x1: L, x2: W - R, y1: med, y2: med, class: 'er-median' }));
        svg.appendChild(
            s(
                'text',
                { x: W - R, y: med - 5, class: 'er-median-label', 'text-anchor': 'end' },
                'league median ' + f1(data.league_median),
            ),
        );

        var marks = [],
            hits = [];
        players.forEach(function (p, i) {
            var cx = x(i),
                lo = y(p.ER_ci[0]),
                hi = y(p.ER_ci[1]);
            svg.appendChild(
                s('line', {
                    x1: cx,
                    x2: cx,
                    y1: lo,
                    y2: hi,
                    class: 'er-ci' + (p.unresolved ? ' er-ci--open' : ''),
                }),
            );
            var off = p.ER < LO || p.ER > HI;
            marks.push(
                svg.appendChild(
                    s('circle', {
                        cx: cx,
                        cy: y(p.ER),
                        r: label(p) ? 4 : 2.6,
                        class:
                            'er-dot' +
                            (p.unresolved ? ' er-dot--open' : '') +
                            (label(p) ? ' er-dot--marked' : '') +
                            (off ? ' er-dot--off' : ''),
                    }),
                ),
            );
        });
        MARKED.forEach(function (m) {
            var i = players.findIndex(function (p) {
                return p.name === m[0];
            });
            if (i < 0) return;
            var p = players[i],
                cy = y(p.ER),
                right = i < n * 0.7;
            svg.appendChild(
                s(
                    'text',
                    {
                        x: x(i) + (right ? 7 : -7),
                        y: cy - 7,
                        class: 'er-name',
                        'text-anchor': right ? 'start' : 'end',
                    },
                    m[1],
                ),
            );
        });
        // invisible full-height strips for pointer picking
        players.forEach(function (p, i) {
            var r = s('rect', {
                x: x(i) - step / 2,
                y: T,
                width: step,
                height: H - T - B,
                class: 'er-hit',
            });
            r.addEventListener('pointerenter', function () {
                pick(i);
            });
            r.addEventListener('click', function () {
                pick(i);
            });
            hits.push(svg.appendChild(r));
        });
        var cursor = s('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'er-cursor' });
        svg.insertBefore(cursor, svg.firstChild);

        var cur = -1;
        function pick(i) {
            if (cur >= 0) marks[cur].classList.remove('er-dot--picked');
            cur = i;
            marks[i].classList.add('er-dot--picked');
            cursor.setAttribute('x1', x(i));
            cursor.setAttribute('x2', x(i));
            var p = players[i];
            out.textContent = '';
            out.appendChild(h('strong', null, p.name));
            out.appendChild(
                document.createTextNode(
                    p.unresolved
                        ? " · clock doesn't resolve · point estimate " +
                              f1(p.ER) +
                              ' s/ft, interval ' +
                              f1(p.ER_ci[0]) +
                              ' to ' +
                              f1(p.ER_ci[1]) +
                              ' · ' +
                              num(p.n) +
                              ' catches'
                        : ' · ' +
                              f1(p.ER) +
                              ' s/ft, interval ' +
                              f1(p.ER_ci[0]) +
                              ' to ' +
                              f1(p.ER_ci[1]) +
                              ' · ' +
                              num(p.n) +
                              ' catches',
                ),
            );
        }
        svg.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                pick(Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
            }
        });
        var fig = h('div', 'er-fig');
        fig.appendChild(svg);
        root.appendChild(fig);
        var key = h('p', 'er-key');
        key.innerHTML =
            '<span class="er-key-dot"></span> resolved by the clock · ' +
            '<span class="er-key-dot er-key-dot--open"></span> not resolved · ' +
            'bars are intervals; values beyond 0 to 30 are drawn at the edge';
        root.appendChild(key);

        // ---- list (below 640px)
        var list = h('div', 'er-list');
        function section(title, rows) {
            list.appendChild(h('h4', 'er-list-title', title));
            var ol = h('ol', 'er-rows');
            rows.forEach(function (p) {
                var li = h('li', 'er-row' + (p.unresolved ? ' er-row--open' : ''));
                li.appendChild(h('span', 'er-row-name', p.name));
                li.appendChild(h('span', 'er-row-rate', f1(p.ER) + ' s/ft'));
                li.appendChild(
                    h(
                        'span',
                        'er-row-ci',
                        (p.unresolved ? 'not resolved · ' : '') +
                            f1(p.ER_ci[0]) +
                            ' to ' +
                            f1(p.ER_ci[1]) +
                            ' · ' +
                            num(p.n) +
                            ' catches',
                    ),
                );
                ol.appendChild(li);
            });
            list.appendChild(ol);
        }
        var three = MARKED.map(function (m) {
            return players.find(function (p) {
                return p.name === m[0];
            });
        }).filter(Boolean);
        section('The three', three);
        section('Ten highest resolved', resolved.slice(-10).reverse());
        section('Ten lowest resolved', resolved.slice(0, 10));
        list.appendChild(
            h(
                'p',
                'er-key',
                'League median ' +
                    f1(data.league_median) +
                    ' s per foot, across all ' +
                    n +
                    ' players.',
            ),
        );
        root.appendChild(list);

        slot.textContent = '';
        slot.appendChild(root);
        pick(
            players.findIndex(function (p) {
                return p.name === MARKED[0][0];
            }),
        );
    }

    fetch(slot.getAttribute('data-src'))
        .then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.json();
        })
        .then(draw)
        .catch(fail);
})();
