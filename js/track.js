/*
 * Track pages: the "now reading" bar and the play control.
 * Without JavaScript the section links still work; the play control stays hidden.
 *
 * Play scrolls the page at reading pace along a timeline built from each block's
 * reading time (data-secs, written by build.py), holding at figures (data-pause).
 * Scrolling, tapping or pressing space pauses; play resumes from where the page
 * is. It stops when the "next" link is in view and never follows it. With
 * prefers-reduced-motion it steps from section to section instead of gliding.
 */
(function () {
    'use strict';

    var main = document.querySelector('.tp-main');
    if (!main || !window.requestAnimationFrame) return;

    var SPEEDS = [1, 1.5, 2];
    // seconds from the top of the page to the first section (not counted in the clock)
    var GLIDE = 3;
    var HOLD = 0.6; // share of a figure's time spent holding still at it
    var reduce = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };

    var sections = [].slice.call(document.querySelectorAll('.tp-section'));
    var segs = [].slice.call(document.querySelectorAll('.tp-seg'));
    var stopEl = document.querySelector('[data-stop]') || document.querySelector('.tp-other');
    var player = document.querySelector('.tp-player');
    var controls = document.querySelector('.tp-controls');
    var help = document.getElementById('tp-play-help');
    var status = document.querySelector('.tp-status');
    var speedBtn = document.querySelector('.tp-speed');
    var clockNow = document.querySelector('.tp-clock-now');
    var clockTotal = document.querySelector('.tp-clock-total');
    // a Lately page: the sections are drawn in the browser
    var live = main.hasAttribute('data-live-timing');
    if (!sections.length || !segs.length) return;

    // ---------- timeline ----------

    var WPM = 230,
        FIGURE_SECS = 6; // as build.py counts them
    var starts = [],
        durs = [],
        total = 0;
    function timeline() {
        starts = [];
        durs = [];
        total = 0;
        sections.forEach(function (s, i) {
            starts.push(total);
            var d = s.hidden ? 0 : parseFloat(segs[i] && segs[i].getAttribute('data-secs')) || 0;
            durs.push(d);
            total += d;
        });
    }
    function clockText(s) {
        s = Math.round(s / 10) * 10;
        return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }
    // Live timing: each block's reading time from the words it holds (plus a figure's time per
    // chart or table), written onto the blocks and segments as build.py would have, then the
    // stamps and the clock. Only what is visible by default counts: not the tables behind the
    // charts, collapsed rows or inactive tabs. Hidden sections (nothing to draw) leave the bar.
    var UNREAD = '.sr-only, [hidden]';
    function visibleWords(b) {
        var count = function (el) {
            return (el.textContent.match(/[\w\u2019'\u2013-]+/g) || []).length;
        };
        if (b.closest(UNREAD)) return 0;
        var w = count(b);
        [].forEach.call(b.querySelectorAll(UNREAD), function (el) {
            var outer = el.parentElement.closest(UNREAD);
            if (!outer || !b.contains(outer)) w -= count(el);
        });
        return Math.max(0, w);
    }
    function visibleFigures(b) {
        return [].filter.call(
            b.querySelectorAll('.chart, table, .meter, .ld-records'),
            function (c) {
                return !c.closest(UNREAD);
            },
        ).length;
    }
    function retime() {
        if (!live) return;
        sections.forEach(function (s, i) {
            var blocks = [].slice.call(
                s.querySelectorAll('.tp-section-body > *, .tp-section-wide > *'),
            );
            var secs = 0;
            blocks.forEach(function (b) {
                var charts = visibleFigures(b);
                var d = (visibleWords(b) / WPM) * 60 + charts * FIGURE_SECS;
                b.setAttribute('data-secs', d.toFixed(2));
                if (charts) b.setAttribute('data-pause', '');
                else b.removeAttribute('data-pause');
                secs += d;
            });
            if (segs[i]) {
                segs[i].setAttribute('data-secs', secs.toFixed(1));
                segs[i].hidden = s.hidden;
            }
        });
        timeline();
        sections.forEach(function (s, i) {
            var stamp = segs[i] && segs[i].querySelector('.tp-seg-time');
            if (stamp) stamp.textContent = clockText(starts[i]);
            var label = s.querySelector('.tp-label-time');
            if (label) label.textContent = clockText(starts[i]) + ' · ';
        });
        if (clockTotal) clockTotal.textContent = clockText(total);
        if (mini) {
            [].forEach.call(mini.bar.querySelectorAll('.tp-mini-tick'), function (t) {
                t.parentNode.removeChild(t);
            });
            ticks(mini.bar.querySelector('.tp-mini-track'));
        }
        buildKeys();
        if (!playing) show(tAt(window.pageYOffset));
    }
    timeline();

    var keys = []; // [{t, y}] with t and y never decreasing
    // the reading line: how far below the top of the window the text being read sits
    var offset = 72;

    function docTop(el) {
        return el.getBoundingClientRect().top + window.pageYOffset;
    }
    function maxScroll() {
        return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function buildKeys() {
        var mini = document.querySelector('.tp-mini');
        offset = (mini ? mini.offsetHeight : 0) + 24;
        var end = Math.min(
            maxScroll(),
            Math.max(0, docTop(stopEl) + stopEl.offsetHeight - window.innerHeight + 32),
        );
        keys = [{ t: -GLIDE, y: 0 }];
        sections.forEach(function (s, i) {
            if (s.hidden) return;
            var t = starts[i];
            var blocks = [].slice.call(
                s.querySelectorAll('.tp-section-body > *, .tp-section-wide > *'),
            );
            var secs = blocks.map(function (b) {
                return parseFloat(b.getAttribute('data-secs')) || 0;
            });
            var sum = secs.reduce(function (a, b) {
                return a + b;
            }, 0);
            // Keep the section on the build's clock exactly.
            var scale = sum > 0 ? durs[i] / sum : 0;
            keys.push({ t: t, y: docTop(s) - offset });
            blocks.forEach(function (b, k) {
                var d = secs[k] * scale;
                var y = docTop(b) - offset;
                if (k > 0) keys.push({ t: t, y: y });
                if (b.hasAttribute('data-pause')) keys.push({ t: t + d * HOLD, y: y });
                t += d;
            });
        });
        keys.push({ t: total, y: end });
        var y = 0;
        keys.forEach(function (k) {
            y = Math.max(y, Math.min(k.y, end));
            k.y = y;
        });
    }

    function yAt(t) {
        if (t <= keys[0].t) return keys[0].y;
        for (var i = 1; i < keys.length; i++) {
            var a = keys[i - 1],
                b = keys[i];
            if (t <= b.t) return b.t > a.t ? a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t) : b.y;
        }
        return keys[keys.length - 1].y;
    }

    function tAt(y) {
        for (var i = 1; i < keys.length; i++) {
            var a = keys[i - 1],
                b = keys[i];
            if (y < b.y || (i === keys.length - 1 && y <= b.y)) {
                return b.y > a.y ? a.t + ((b.t - a.t) * (y - a.y)) / (b.y - a.y) : a.t;
            }
        }
        return total;
    }

    // ---------- display ----------

    function clock(s) {
        s = Math.max(0, Math.floor(s));
        return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    var current = -1;
    function show(t) {
        // The current section is the one under the reading line.
        var line = window.pageYOffset + offset + 4;
        var idx = -1,
            last = -1;
        sections.forEach(function (s, i) {
            if (s.hidden) return;
            last = i;
            if (docTop(s) <= line) idx = i;
        });
        if (idx < 0)
            idx = sections.findIndex
                ? Math.max(
                      0,
                      sections.findIndex(function (s) {
                          return !s.hidden;
                      }),
                  )
                : 0;
        if (window.pageYOffset >= maxScroll() - 2 && last >= 0) idx = last;
        segs.forEach(function (a, i) {
            var f =
                durs[i] <= 0
                    ? t >= starts[i]
                        ? 1
                        : 0
                    : t >= starts[i] + durs[i]
                      ? 1
                      : t <= starts[i]
                        ? 0
                        : (t - starts[i]) / durs[i];
            a.style.setProperty('--fill', f);
            a.classList.toggle('is-current', i === idx);
            if (i === idx) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
        });
        if (clockNow) clockNow.textContent = clock(t);
        if (mini) {
            mini.fill.style.width =
                (total > 0 ? Math.max(0, Math.min(1, t / total)) * 100 : 0) + '%';
            if (idx !== current && segs[idx])
                mini.name.textContent = segs[idx].querySelector('.tp-seg-name').textContent;
        }
        current = idx;
    }

    // ---------- compact bar, shown once the full bar has scrolled away ----------

    var mini = null;
    function makeMini() {
        var bar = document.createElement('div');
        bar.className = 'tp-mini';
        bar.hidden = true;
        var btn = playButton(true);
        var name = document.createElement('span');
        name.className = 'tp-mini-name';
        var track = document.createElement('span');
        track.className = 'tp-mini-track';
        track.setAttribute('aria-hidden', 'true');
        var fill = document.createElement('span');
        fill.className = 'tp-mini-fill';
        track.appendChild(fill);
        ticks(track);
        var label = document.createElement('span');
        label.className = 'sr-only';
        label.textContent = 'Now reading: ';
        var wrap = document.createElement('span');
        wrap.className = 'tp-mini-now';
        wrap.appendChild(label);
        wrap.appendChild(name);
        bar.appendChild(btn);
        bar.appendChild(wrap);
        bar.appendChild(track);
        document.body.appendChild(bar);
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                bar.hidden = entries[0].isIntersecting || entries[0].boundingClientRect.top > 0;
            }).observe(player);
        }
        return { bar: bar, name: name, fill: fill };
    }

    function ticks(track) {
        if (!(total > 0)) return;
        starts.slice(1).forEach(function (s, i) {
            if (!(durs[i + 1] > 0)) return;
            var tick = document.createElement('span');
            tick.className = 'tp-mini-tick';
            tick.style.left = (s / total) * 100 + '%';
            track.appendChild(tick);
        });
    }

    var buttons = [];
    function playButton(compact) {
        var b = compact ? document.createElement('button') : document.querySelector('.tp-play');
        if (compact) {
            b.type = 'button';
            b.className = 'tp-play tp-play--mini control';
            b.setAttribute('aria-describedby', 'tp-play-help');
            b.innerHTML =
                '<span class="tp-play-icon" aria-hidden="true"></span><span ' +
                'class="tp-play-text">play</span>';
        }
        b.addEventListener('click', function () {
            if (playing) pause('Paused.');
            else play();
        });
        buttons.push(b);
        return b;
    }

    // ---------- playing ----------

    var playing = false,
        t = 0,
        speed = 1,
        lastY = null,
        lastFrame = 0,
        timer = null;
    // where the last play finished; pressing play there starts again from the top
    var endedAt = null;

    function setButtons() {
        buttons.forEach(function (b) {
            b.classList.toggle('is-playing', playing);
            b.querySelector('.tp-play-text').textContent = playing ? 'pause' : 'play';
            b.setAttribute(
                'aria-label',
                playing
                    ? 'Pause automatic scrolling'
                    : 'Play: scroll through this page automatically',
            );
        });
    }
    function say(s) {
        if (status) status.textContent = s;
    }

    function scrollToY(y) {
        y = Math.round(Math.min(y, maxScroll()));
        lastY = y;
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    }

    function play() {
        buildKeys();
        t = tAt(window.pageYOffset);
        if (endedAt !== null && Math.abs(window.pageYOffset - endedAt) < 4) {
            t = -GLIDE;
            scrollToY(0);
        }
        endedAt = null;
        playing = true;
        setButtons();
        say('Playing at ' + speed + '×.');
        if (reduce.matches) return step();
        lastFrame = 0;
        requestAnimationFrame(frame);
    }

    function frame(now) {
        if (!playing) return;
        if (lastFrame) t = Math.min(total, t + Math.min(0.1, (now - lastFrame) / 1000) * speed);
        lastFrame = now;
        scrollToY(yAt(t));
        show(t);
        if (t >= total) return finish();
        requestAnimationFrame(frame);
    }

    // Reduced motion: jump to the next section after the current one's reading time.
    function step() {
        var i = 0;
        starts.forEach(function (s, k) {
            if (t >= s - 0.01 && !sections[k].hidden) i = k;
        });
        var wait = Math.max(0.5, starts[i] + durs[i] - Math.max(t, starts[i])) / speed;
        timer = setTimeout(function () {
            if (!playing) return;
            var next = i + 1;
            while (next < sections.length && sections[next].hidden) next++;
            if (next >= sections.length) {
                t = total;
                scrollToY(yAt(total));
                show(t);
                return finish();
            }
            t = starts[next];
            scrollToY(docTop(sections[next]) - offset);
            show(t);
            step();
        }, wait * 1000);
    }

    function pause(message) {
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        setButtons();
        say(message);
    }
    function finish() {
        endedAt = window.pageYOffset;
        pause('Stopped at the end of the page.');
    }

    // Anything the reader does to the page pauses play.
    function userInput(e) {
        if (!playing) return;
        if (e.target && e.target.closest && e.target.closest('.tp-play, .tp-speed')) return;
        pause('Paused.');
    }
    ['wheel', 'touchstart', 'pointerdown'].forEach(function (type) {
        window.addEventListener(type, userInput, { passive: true });
    });
    window.addEventListener('keydown', function (e) {
        if (!playing || e.altKey || e.ctrlKey || e.metaKey) return;
        var control =
            e.target &&
            e.target.closest &&
            e.target.closest('button, a, audio, input, select, textarea, summary');
        if (e.key === ' ' && !control) {
            e.preventDefault(); // space pauses instead of scrolling
            pause('Paused.');
        } else if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End)$/.test(e.key)) {
            pause('Paused.');
        }
    });

    var ticking = false;
    window.addEventListener(
        'scroll',
        function () {
            if (playing && lastY !== null && Math.abs(window.pageYOffset - lastY) > 3)
                pause('Paused.');
            if (playing || ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                ticking = false;
                show(tAt(window.pageYOffset));
            });
        },
        { passive: true },
    );
    window.addEventListener('resize', function () {
        buildKeys();
        if (!playing) show(tAt(window.pageYOffset));
    });

    if (speedBtn) {
        speedBtn.addEventListener('click', function () {
            speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
            speedBtn.textContent = 'speed ' + speed + '×';
            speedBtn.setAttribute('aria-label', 'Playback speed, ' + speed + '×');
            if (playing) say('Playing at ' + speed + '×.');
        });
    }

    // ---------- audio: one clip at a time ----------

    document.addEventListener(
        'play',
        function (e) {
            [].forEach.call(document.querySelectorAll('audio'), function (a) {
                if (a !== e.target) a.pause();
            });
        },
        true,
    );

    // A grid of clips shows one sentence at a time at phone width, with a selector.
    [].forEach.call(document.querySelectorAll('.tp-grid'), function (grid) {
        var rows = [].slice.call(grid.querySelectorAll('tbody tr'));
        if (rows.length < 2) return;
        var pick = document.createElement('div');
        pick.className = 'tp-grid-pick';
        pick.setAttribute('role', 'group');
        pick.setAttribute('aria-label', 'Show one sentence');
        function show(k) {
            rows.forEach(function (r, i) {
                r.classList.toggle('is-other', i !== k);
                if (i !== k)
                    [].forEach.call(r.querySelectorAll('audio'), function (a) {
                        a.pause();
                    });
            });
            [].forEach.call(pick.children, function (b, i) {
                b.setAttribute('aria-pressed', String(i === k));
            });
        }
        rows.forEach(function (r, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'control tp-pick';
            b.textContent = r.querySelector('th').textContent;
            b.addEventListener('click', function () {
                show(i);
            });
            pick.appendChild(b);
        });
        grid.parentNode.insertBefore(pick, grid);
        show(0);
    });

    // ---------- long lists and tables ----------

    // More than ten rows show ten and a "show all N" button that opens the rest in place;
    // the rows stay in the DOM, hidden, and the button carries aria-expanded and aria-controls.
    var SHOW_ROWS = 10,
        listId = 0;
    [].forEach.call(
        document.querySelectorAll('.tp-section-body ul, .tp-section-body ol, .table--stack tbody'),
        function (el) {
            var rows = [].slice.call(el.children).filter(function (c) {
                return /^(li|tr)$/i.test(c.tagName);
            });
            if (rows.length <= SHOW_ROWS) return;
            if (!el.id) el.id = 'tp-rows-' + ++listId;
            var more = 'show all ' + rows.length,
                less = 'show fewer';
            function set(open) {
                rows.forEach(function (r, i) {
                    if (i >= SHOW_ROWS) r.hidden = !open;
                });
            }
            set(false);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'control control--quiet rows-more';
            btn.setAttribute('aria-controls', el.id);
            btn.setAttribute('aria-expanded', 'false');
            btn.textContent = more;
            btn.addEventListener('click', function () {
                var open = btn.getAttribute('aria-expanded') !== 'true';
                set(open);
                btn.setAttribute('aria-expanded', String(open));
                btn.textContent = open ? less : more;
            });
            var host = el.closest('.table--stack') || el;
            host.parentNode.insertBefore(btn, host.nextSibling);
        },
    );

    // ---------- start ----------

    controls.hidden = false;
    help.hidden = false;
    playButton(false);
    mini = makeMini();
    setButtons();
    function ready() {
        if (live) retime();
        else {
            buildKeys();
            show(tAt(window.pageYOffset));
        }
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready);
    else ready();
    window.addEventListener('load', ready);
    ready();
    // A Lately page's sections fill in later: the script that draws them asks for the times once,
    // and "show all" asks again. A tab switch does not: the bar is computed from the default tabs.
    if (live) {
        document.addEventListener('tp:retime', function () {
            requestAnimationFrame(retime);
        });
        document.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('.rows-more, .tier-more'))
                requestAnimationFrame(retime);
        });
    }
})();
