/*
 * Lately, in depth. Draws the lately/<feed>/ pages from the "analysis" block of
 * data/lately.json (falling back to data/lately.sample.json), and gives the main
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
  "use strict";

  var MINUS = "−";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NOT_CONNECTED = "Not connected yet.";
  var NAMES = { sleeper: "Sleeper", espn: "ESPN", yahoo: "Yahoo", show: "Shows", film: "Films", anime: "Anime",
    shows: "Shows", films: "Films" };
  var TYPE_CLASS = { show: "shows", film: "films", anime: "anime", shows: "shows", films: "films" };

  // ---------- small helpers ----------

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "style") Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? "" : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(el, c); });
    else el.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function list(v) { return Array.isArray(v) ? v : []; }
  function need(cond, what) { if (!cond) throw new Error("lately-depth: bad " + what); }

  // Numbers: a real minus sign, and the data's own precision unless dp is given.
  function num(x, dp) {
    need(isNum(x), "number");
    var s = dp === undefined ? String(Math.round(x * 1000) / 1000) : x.toFixed(dp);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.charAt(0) === "-" ? MINUS + s.slice(1) : s;
  }
  function signed(x, dp) { var s = num(x, dp); return x > 0 && s !== num(0, dp) ? "+" + s : s; }
  function big(x) { return Math.round(x).toLocaleString("en-US"); }
  function pct(x) {
    need(isNum(x), "share");
    var r = Math.round(x * 100);
    if (x > 0 && r === 0) return "<1%";
    if (x < 1 && r === 100) return ">99%";
    return r + "%";
  }
  function plural(n, unit) {
    var one = { weeks: "week", plays: "play", sessions: "session", places: "place", titles: "title", films: "film",
      months: "month", albums: "album", tracks: "track", days: "day", years: "year", tiers: "tier", pairs: "pair",
      predictions: "prediction", seasons: "season", workouts: "workout", "weigh-ins": "weigh-in", "adds judged": "add judged",
      artists: "artist", "re-rankings": "re-ranking", picks: "pick" }[unit];
    return big(n) + " " + (n === 1 && one ? one : unit);
  }
  function record(r) {
    need(isObj(r), "record");
    return r.wins + "–" + r.losses + (r.ties ? "–" + r.ties : "");
  }
  function dateText(s, withYear) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    need(m, "date");
    return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + (withYear === false ? "" : " " + m[1]);
  }
  function monthText(s, short) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(s));
    need(m, "month");
    return MONTHS[Number(m[2]) - 1] + (short ? "" : " " + m[1]);
  }
  function hoursText(x) {
    return x < 48 ? num(x, 0) + " hours" : num(x / 24, x / 24 < 10 ? 1 : 0).replace(/\.0$/, "") + " days";
  }
  function interval(iv, f) {
    if (!Array.isArray(iv) || iv.length !== 2 || !isNum(iv[0]) || !isNum(iv[1])) return null;
    return "95% interval " + f(iv[0]) + " to " + f(iv[1]);
  }
  function excludesZero(iv) { return Array.isArray(iv) && iv.length === 2 && (iv[0] > 0 || iv[1] < 0); }
  function nameOf(key) { return NAMES[key] || key; }

  // ---------- building blocks ----------

  function facts(rows) {
    rows = rows.filter(function (r) { return r && r[1] !== null && r[1] !== undefined && r[1] !== ""; });
    if (!rows.length) return null;
    return h("dl", { class: "ld-facts" }, rows.map(function (r) {
      return h("div", { class: "ld-fact" }, h("dt", null, r[0]), h("dd", null, r[1]));
    }));
  }

  function table(caption, cols, rows, opts) {
    return h("div", { class: "data-table ld-table" + (opts && opts.cls ? " " + opts.cls : ""), hidden: opts && opts.hidden },
      h("table", null,
        h("caption", { class: opts && opts.showCaption ? "ld-caption" : "sr-only" }, caption),
        h("thead", null, h("tr", null, cols.map(function (c) {
          return h("th", { scope: "col", class: c.num ? "num" : null }, c.label);
        }))),
        h("tbody", null, rows.map(function (r) {
          return h("tr", null, r.map(function (cell, i) {
            return i === 0 ? h("th", { scope: "row" }, cell) : h("td", { class: cols[i].num ? "num" : null }, cell);
          }));
        }))));
  }

  var uid = 0;
  // A chart with its "view as table" toggle; the table holds the same numbers.
  function charted(title, chart, cols, rows, after) {
    var t = table(title, cols, rows, { hidden: true });
    var id = "ld-table-" + ++uid;
    t.id = id;
    var button = h("button", { type: "button", class: "table-toggle", "aria-controls": id, "aria-expanded": "false" }, "view as table");
    button.addEventListener("click", function () {
      var show = t.hidden;
      t.hidden = !show;
      chart.hidden = show;
      button.setAttribute("aria-expanded", String(show));
      button.textContent = show ? "view as chart" : "view as table";
    });
    return h("div", { class: "chart-block ld-chart" },
      h("div", { class: "chart-head" }, h("div", { class: "ld-chart-title" }, title), button),
      chart, t, after || null);
  }

  // Vertical columns, e.g. months or weekdays. items: {label, value, text, title}
  function columns(title, items, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat(0));
    var chart = h("div", { class: "ld-cols" + (items.length > 12 ? " ld-cols--dense" : ""), role: "img",
      "aria-label": title + ": " + items.map(function (i) { return (i.title || i.label) + " " + i.text; }).join("; "),
      style: { gridTemplateColumns: "repeat(" + items.length + ", minmax(0, 1fr))" } },
      items.map(function (i, k) {
        return h("div", { class: "ld-col", title: (i.title || i.label) + ": " + i.text },
          h("span", { class: "ld-col-value" }, items.length > 12 ? "" : i.text),
          h("div", { class: "ld-col-bar", style: { height: max > 0 ? "calc((100% - 18px) * " + (i.value / max).toFixed(4) + ")" : "0" } }),
          h("span", { class: "ld-col-label", "aria-hidden": "true" }, opts.every && k % opts.every ? "" : i.label));
      }));
    return charted(title, chart, [{ label: opts.labelHeading || "" }, { label: opts.valueHeading || "", num: true }],
      items.map(function (i) { return [i.title || i.label, i.text]; }));
  }

  // Horizontal bars. items: {label, value, text, ref, cls}; ref draws an outlined marker
  // (a comparison value) on the same scale. Negative values grow left in orange and keep
  // their minus sign in the text, so colour is never the only cue.
  function bars(title, items, opts) {
    opts = opts || {};
    var vals = items.map(function (i) { return i.value; }).concat(items.map(function (i) { return isNum(i.ref) ? i.ref : 0; }));
    var max = Math.max.apply(null, vals.concat(0)), min = Math.min.apply(null, vals.concat(0));
    var span = max - min || 1, zero = (-min / span) * 100;
    var chart = h("div", { class: "ld-bars", role: "img",
      "aria-label": title + ": " + items.map(function (i) { return i.label + " " + i.text + (i.refText ? " (" + i.refText + ")" : ""); }).join("; ") },
      items.map(function (i) {
        var w = Math.abs(i.value) / span * 100;
        return h("div", { class: "ld-bar-row", title: i.label + ": " + i.text + (i.refText ? " (" + i.refText + ")" : "") },
          h("span", { class: "ld-bar-label" }, i.label),
          h("span", { class: "ld-bar-track" },
            min < 0 ? h("span", { class: "ld-bar-zero", style: { left: zero + "%" } }) : null,
            h("span", { class: "ld-bar-fill" + (i.value < 0 ? " ld-bar-fill--neg" : "") + (i.cls ? " " + i.cls : ""),
              style: { left: (i.value < 0 ? zero - w : zero) + "%", width: w + "%" } }),
            isNum(i.ref) ? h("span", { class: "ld-bar-ref", style: { left: ((i.ref - min) / span * 100) + "%" } }) : null),
          h("span", { class: "ld-bar-value" }, i.text + (i.refText ? " / " + i.refText : "")));
      }));
    var cols = [{ label: opts.labelHeading || "" }, { label: opts.valueHeading || "", num: true }];
    if (opts.refHeading) cols.push({ label: opts.refHeading, num: true });
    var legend = opts.refHeading ? h("p", { class: "ld-legend" },
      h("span", { class: "ld-key-bar", "aria-hidden": "true" }), " " + opts.valueHeading + " (first number)   ",
      h("span", { class: "ld-key-ref", "aria-hidden": "true" }), " " + opts.refHeading + " (second)") : null;
    return charted(title, chart, cols, items.map(function (i) {
      var r = [i.label, i.text];
      if (opts.refHeading) r.push(i.refText || "");
      return r;
    }), legend);
  }

  // Points with 95% intervals on one scale that includes zero. rows: {label, value, lo, hi, text}
  function intervals(title, rows, opts) {
    opts = opts || {};
    var lo = Math.min.apply(null, rows.map(function (r) { return r.lo; }).concat(opts.min !== undefined ? opts.min : 0));
    var hi = Math.max.apply(null, rows.map(function (r) { return r.hi; }).concat(opts.max !== undefined ? opts.max : 0));
    var pad = (hi - lo) * 0.06 || 1;
    if (opts.min === undefined) lo -= pad;
    if (opts.max === undefined) hi += pad;
    function x(v) { return ((v - lo) / (hi - lo)) * 100 + "%"; }
    var chart = h("div", { class: "ld-ivs", role: "img",
      "aria-label": title + ": " + rows.map(function (r) { return r.label + " " + r.text; }).join("; ") },
      rows.map(function (r) {
        return h("div", { class: "ld-iv-row", title: r.label + ": " + r.text },
          h("span", { class: "ld-iv-label" }, r.label),
          h("span", { class: "ld-iv-track" },
            h("span", { class: "ld-iv-zero", style: { left: x(0) } }),
            h("span", { class: "ld-iv-line", style: { left: x(r.lo), width: "calc(" + x(r.hi) + " - " + x(r.lo) + ")" } }),
            h("span", { class: "ld-iv-dot", style: { left: x(r.value) } })),
          h("span", { class: "ld-iv-value" }, r.text));
      }),
      h("div", { class: "ld-iv-axis", "aria-hidden": "true" }, h("span", null, ""),
        h("span", { class: "ld-iv-axis-track" },
          h("span", { style: { left: x(0) } }, "0")), h("span", null, "")));
    return charted(title, chart, [{ label: opts.labelHeading || "" }, { label: "value and 95% interval", num: true }],
      rows.map(function (r) { return [r.label, r.text]; }));
  }

  // Wins as filled squares, losses outlined, ties dashed; each carries its letter.
  function resultSquare(kind, title) {
    return h("span", { class: "result" + (kind === "W" ? " result--win" : kind === "T" ? " result--tie" : ""), title: title }, kind);
  }
  // A record as a split bar: filled for wins, outlined for losses, with the counts in words.
  function recordBar(label, r) {
    need(isObj(r), "record");
    var total = r.wins + r.losses + (r.ties || 0);
    return h("div", { class: "ld-record" },
      h("span", { class: "ld-record-label" }, label),
      h("span", { class: "ld-record-bar", "aria-hidden": "true" },
        h("span", { class: "ld-record-w", style: { flexGrow: r.wins } }),
        r.ties ? h("span", { class: "ld-record-t", style: { flexGrow: r.ties } }) : null,
        h("span", { class: "ld-record-l", style: { flexGrow: r.losses } })),
      h("span", { class: "ld-record-text" }, record(r) + (total ? " (" + pct(r.wins / total) + " won)" : "")));
  }

  function lineChart(title, points, fmt) {
    var ys = points.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    var pad = hi > lo ? (hi - lo) * 0.1 : Math.abs(hi) * 0.05 || 1;
    lo -= pad; hi += pad;
    var n = points.length;
    function x(i) { return n > 1 ? (i / (n - 1)) * 100 : 100; }
    function y(v) { return (1 - (v - lo) / (hi - lo)) * 100; }
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "line-svg");
    svg.setAttribute("aria-hidden", "true");
    var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", points.map(function (p, i) { return x(i).toFixed(2) + "," + y(p.value).toFixed(2); }).join(" "));
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(line);
    var last = points[n - 1], first = points[0];
    var chart = h("div", { class: "ld-line", role: "img",
      "aria-label": title + ", " + n + " points from " + first.label + " to " + last.label + ": " + fmt(first.value) + " to " + fmt(last.value) },
      h("div", { class: "line-chart", style: { height: "90px" } },
        h("div", { class: "line-area" }, h("div", { class: "line-plot" }, svg,
          h("span", { class: "line-dot line-dot--last", style: { left: "100%", top: y(last.value) + "%" } }))),
        h("div", { class: "line-end", style: { width: (fmt(last.value).length * 0.62 + 0.4) + "em" } },
          h("span", { class: "line-end-label", style: { top: Math.min(Math.max(y(last.value), 10), 90) + "%" } }, fmt(last.value)))),
      h("div", { class: "axis-labels", "aria-hidden": "true" }, h("span", null, first.label), h("span", null, last.label)));
    return charted(title, chart, [{ label: "Date" }, { label: "Value", num: true }],
      points.map(function (p) { return [p.label, fmt(p.value)]; }));
  }

  function heatLevel(v, max) {
    if (!v || max <= 0) return 0;
    return Math.min(5, 2 + Math.floor((v / max) * 3.999));
  }

  // ---------- SVG charts shared with the main page (window.LatelyDepth.charts) ----------
  // Geometry is SVG stretched to its box (vector-effect keeps strokes 2px); dots, labels and
  // legends are HTML placed in percentages, so text keeps its size at any width.

  var NS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, String(attrs[k])); });
    return el;
  }
  function plotSvg() {
    return sv("svg", { class: "line-svg", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
  }
  function polyline(pts, cls) {
    return sv("polyline", { class: cls || "", points: pts.map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" "),
      "vector-effect": "non-scaling-stroke" });
  }
  function legendItem(cls, text) {
    return h("span", { class: "legend-item" }, h("span", { class: "legend-swatch " + cls, "aria-hidden": "true" }), text);
  }
  var SERIES = ["s-blue", "s-orange", "s-purple"]; // one hue for one series, a second for two

  // Lines over the same x positions. series: [{name, values: [number|null]}]; labels: x labels
  // (first and last are shown); opts: {fmt, base (a dashed reference line, e.g. 100), height,
  // endLabels (true: each series' last value at the right), title}. Returns the chart with its
  // "view as table" toggle and, for two or more series, a legend.
  function multiLine(title, labels, series, opts) {
    opts = opts || {};
    var fmt = opts.fmt || function (x) { return num(x, 1); };
    var all = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) all.push(v); }); });
    if (isNum(opts.base)) all.push(opts.base);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = hi > lo ? (hi - lo) * 0.12 : Math.abs(hi) * 0.05 || 1;
    lo -= pad; hi += pad;
    var n = labels.length;
    function x(i) { return n > 1 ? (i / (n - 1)) * 100 : 100; }
    function y(v) { return (1 - (v - lo) / (hi - lo)) * 100; }
    var svg = plotSvg();
    if (isNum(opts.base)) svg.appendChild(sv("line", { class: "line-base", x1: 0, x2: 100, y1: y(opts.base).toFixed(2), y2: y(opts.base).toFixed(2), "vector-effect": "non-scaling-stroke" }));
    var ends = [];
    series.forEach(function (s, k) {
      var pts = [];
      s.values.forEach(function (v, i) { if (isNum(v)) pts.push([x(i), y(v)]); });
      if (pts.length > 1) svg.appendChild(polyline(pts, SERIES[k % SERIES.length]));
      var lastIdx = -1;
      s.values.forEach(function (v, i) { if (isNum(v)) lastIdx = i; });
      if (lastIdx >= 0) ends.push({ k: k, v: s.values[lastIdx], top: y(s.values[lastIdx]) });
    });
    var plot = h("div", { class: "line-plot" }, svg, ends.map(function (e) {
      return h("span", { class: "line-dot line-dot--last " + SERIES[e.k % SERIES.length], style: { left: "100%", top: e.top + "%" } });
    }));
    // End labels: nudged apart when two sit within 14% of each other.
    ends.sort(function (a, b) { return a.top - b.top; });
    for (var i = 1; i < ends.length; i++) if (ends[i].top - ends[i - 1].top < 14) ends[i].top = ends[i - 1].top + 14;
    var endText = ends.map(function (e) { return fmt(e.v); });
    var width = Math.max.apply(null, endText.map(function (t) { return t.length; }).concat(1));
    var summary = series.map(function (s) {
      var vals = s.values.filter(isNum);
      return s.name + " from " + fmt(vals[0]) + " to " + fmt(vals[vals.length - 1]);
    }).join("; ");
    var chart = h("div", { class: "ld-line", role: "img", "aria-label": title + ", " + n + " points from " + labels[0] + " to " + labels[n - 1] + ": " + summary },
      h("div", { class: "line-chart", style: { height: (opts.height || 120) + "px" } },
        h("div", { class: "line-area" }, plot),
        h("div", { class: "line-end", style: { width: (width * 0.62 + 0.4) + "em" } }, ends.map(function (e) {
          return h("span", { class: "line-end-label " + SERIES[e.k % SERIES.length], style: { top: Math.min(Math.max(e.top, 6), 94) + "%" } }, fmt(e.v));
        }))),
      h("div", { class: "axis-labels", "aria-hidden": "true" }, h("span", null, labels[0]), h("span", null, n > 1 ? labels[n - 1] : "")));
    var legend = series.length > 1 ? h("p", { class: "ld-legend" }, series.map(function (s, k) { return legendItem(SERIES[k % SERIES.length], s.name); }),
      isNum(opts.base) ? legendItem("s-base", opts.baseText || String(opts.base)) : null) : null;
    var cols = [{ label: opts.labelHeading || "" }].concat(series.map(function (s) { return { label: s.name, num: true }; }));
    return charted(title, chart, cols, labels.map(function (l, i) {
      return [l].concat(series.map(function (s) { return isNum(s.values[i]) ? fmt(s.values[i]) : "–"; }));
    }), legend);
  }

  // Strength against luck: every team in my leagues as a point, mine in blue with their
  // labels and a faint trail from week 1, the others grey and unlabelled. Hover on any
  // point shows its record and all-play share only; no name of another team ever appears.
  function quadrant(v) {
    var mine = list(v.mine).filter(function (t) { return isObj(t) && isNum(t.all_play) && isNum(t.luck); });
    var others = list(v.others).filter(function (t) { return isObj(t) && isNum(t.all_play) && isNum(t.luck); });
    var xs = mine.concat(others).map(function (t) { return t.all_play; });
    mine.forEach(function (t) { list(t.trail).forEach(function (p) { if (isObj(p) && isNum(p.all_play)) xs.push(p.all_play); }); });
    var ys = mine.concat(others).map(function (t) { return Math.abs(t.luck); });
    mine.forEach(function (t) { list(t.trail).forEach(function (p) { if (isObj(p) && isNum(p.luck)) ys.push(Math.abs(p.luck)); }); });
    // 0.25 to 0.75 is shown; the range widens only when a team sits outside it.
    var x0 = Math.min(0.25, Math.min.apply(null, xs.concat(0.25)) - 0.03), x1 = Math.max(0.75, Math.max.apply(null, xs.concat(0.75)) + 0.03);
    var yMax = Math.max(1.5, Math.max.apply(null, ys.concat(0)) + 0.4);
    function x(a) { return ((a - x0) / (x1 - x0)) * 100; }
    function y(l) { return (1 - (l + yMax) / (2 * yMax)) * 100; }
    function hover(t) { return record(t.record) + " · all-play " + pct(t.all_play); }
    var svg = plotSvg();
    svg.appendChild(sv("line", { class: "quad-axis", x1: x(0.5).toFixed(2), x2: x(0.5).toFixed(2), y1: 0, y2: 100, "vector-effect": "non-scaling-stroke" }));
    svg.appendChild(sv("line", { class: "quad-axis", x1: 0, x2: 100, y1: 50, y2: 50, "vector-effect": "non-scaling-stroke" }));
    mine.forEach(function (t) {
      var pts = list(t.trail).filter(function (p) { return isObj(p) && isNum(p.all_play) && isNum(p.luck); }).map(function (p) { return [x(p.all_play), y(p.luck)]; });
      if (pts.length > 1) svg.appendChild(polyline(pts, "quad-trail"));
    });
    var plot = h("div", { class: "quad-plot" }, svg,
      others.map(function (t) {
        return h("span", { class: "quad-dot quad-dot--other", title: hover(t), style: { left: x(t.all_play) + "%", top: y(t.luck) + "%" } },
          h("span", { class: "sr-only" }, "another team, " + hover(t)));
      }),
      mine.map(function (t) {
        return h("span", { class: "quad-dot quad-dot--mine", title: hover(t), style: { left: x(t.all_play) + "%", top: y(t.luck) + "%" } },
          h("span", { class: "quad-label" + (x(t.all_play) > 60 ? " quad-label--left" : "") }, String(t.label)),
          h("span", { class: "sr-only" }, ", " + hover(t)));
      }),
      [["quad-corner--tl", "bad and lucky"], ["quad-corner--tr", "good and lucky"], ["quad-corner--bl", "bad and unlucky"], ["quad-corner--br", "good and unlucky"]].map(function (c) {
        return h("span", { class: "quad-corner " + c[0], "aria-hidden": "true" }, c[1]);
      }));
    var chart = h("div", { class: "quad", role: "img", "aria-label": "Strength against luck, week " + (isNum(v.week) ? v.week : "") + ": " +
      mine.map(function (t) { return t.label + " " + hover(t) + ", " + signed(t.luck, 1) + " wins above expected"; }).join("; ") +
      "; and " + others.length + " other teams as unlabelled points" },
      h("div", { class: "quad-y", "aria-hidden": "true" }, "wins above expected ↑"),
      plot,
      h("div", { class: "quad-x", "aria-hidden": "true" }, [0.25, 0.5, 0.75].map(function (a) {
        return h("span", { style: { left: x(a) + "%" } }, pct(a));
      }), h("span", { class: "quad-x-label" }, "all-play win share →")));
    var rows = mine.map(function (t) { return [String(t.label), record(t.record), pct(t.all_play), signed(t.luck, 1)]; })
      .concat(others.map(function (t) { return ["another team", record(t.record), pct(t.all_play), signed(t.luck, 1)]; }));
    return charted("Strength against luck", chart, [{ label: "Team" }, { label: "Record" }, { label: "All-play", num: true }, { label: "Wins above expected", num: true }], rows,
      h("p", { class: "ld-legend" }, legendItem("s-blue", "my teams"), legendItem("s-grey", "other teams in my leagues"), legendItem("s-trail", "my trail from week 1")));
  }

  // ---------- statistics ----------
  // Each entry: n (what n counts), value(stat) -> [text, unit] or null, intervalFmt,
  // draw(values, stat, ctx) -> nodes. Keys are the paths build.py writes.

  var WEEKS = "weeks";

  function weeklyBench(v) {
    return columns("Points left on the bench by week", list(v.weekly).map(function (w) {
      return { label: "wk " + w.week, title: "Week " + w.week, value: w.bench_points, text: num(w.bench_points, 1) };
    }), { labelHeading: "Week", valueHeading: "Points on the bench" });
  }

  function rankText(rank, size, oneIs) {
    return isNum(rank) && isNum(size) ? rank + " of " + size + " (1 = " + oneIs + ")" : null;
  }

  function weekdayColumns(title, weekdays, counts, unit) {
    return columns(title, list(counts).map(function (c, i) {
      return { label: weekdays[i] || String(i), value: c, text: big(c) };
    }), { labelHeading: "Weekday", valueHeading: unit });
  }

  var STATS = {
    // ----- fantasy, per team -----
    "fantasy.teams[].playoff_odds": {
      n: WEEKS,
      value: function (s) { return [pct(s.values.playoffs), "chance to make the playoffs"]; },
      draw: function (v) {
        return [
          h("div", { class: "meter" }, h("div", { class: "chance-track", "aria-hidden": "true" },
            h("div", { class: "chance-bar", style: { width: (v.playoffs * 100) + "%" } }))),
          facts([["top seed", pct(v.top_seed)], ["first-round bye", isNum(v.bye) ? pct(v.bye) : null],
            ["expected wins", num(v.expected_wins, 1)], ["weeks left", v.remaining_weeks],
            ["playoff spots", v.playoff_teams], ["simulated seasons", big(v.simulations)]])
        ];
      }
    },
    "fantasy.teams[].record_vs_median": {
      n: WEEKS,
      draw: function (v) {
        return h("div", { class: "ld-records" }, recordBar("against the week's median", v.vs_median), recordBar("all-play", v.all_play));
      }
    },
    "fantasy.teams[].margins": {
      n: WEEKS,
      value: function (s) { return [signed(s.values.median, 1), "points, median margin"]; },
      draw: function (v) {
        var rows = list(v.margins);
        var max = Math.max.apply(null, rows.map(function (m) { return Math.abs(m.margin); }).concat(1));
        var chart = h("div", { class: "ld-margins", role: "img",
          "aria-label": "Margin each week: " + rows.map(function (m) {
            return "week " + m.week + " " + (m.margin > 0 ? "won" : m.margin < 0 ? "lost" : "tied") + " by " + num(Math.abs(m.margin), 1);
          }).join("; ") },
          rows.map(function (m) {
            var kind = m.margin > 0 ? "W" : m.margin < 0 ? "L" : "T";
            var w = Math.abs(m.margin) / max * 50;
            return h("div", { class: "ld-margin-row", title: "Week " + m.week + ": " + signed(m.margin, 2) },
              h("span", { class: "ld-margin-week" }, "wk " + m.week),
              resultSquare(kind),
              h("span", { class: "ld-margin-track" },
                h("span", { class: "ld-bar-zero", style: { left: "50%" } }),
                h("span", { class: "ld-bar-fill" + (m.margin < 0 ? " ld-bar-fill--neg" : ""),
                  style: { left: (m.margin < 0 ? 50 - w : 50) + "%", width: w + "%" } })),
              h("span", { class: "ld-bar-value" }, signed(m.margin, 1)));
          }));
        return [charted("Margin by week", chart, [{ label: "Week" }, { label: "Result" }, { label: "Margin", num: true }],
          rows.map(function (m) { return ["Week " + m.week, m.margin > 0 ? "W" : m.margin < 0 ? "L" : "T", signed(m.margin, 2)]; })),
          facts([["close games (under 5 points)", String(v.under_5)], ["record in close games", v.under_5 ? record(v.under_5_record) : null]])];
      }
    },
    "fantasy.teams[].schedule_what_if": {
      n: WEEKS,
      value: function (s) { return [record(s.values.real), "my real record"]; },
      draw: function (v) {
        var real = record(v.real);
        return [
          bars("Records from the other schedules", list(v.distribution).map(function (d) {
            var r = record(d);
            return { label: r + (r === real ? " (mine)" : ""), value: d.schedules, text: plural(d.schedules, "schedules").replace(/^1 schedules$/, "1 schedule") };
          }), { labelHeading: "Record", valueHeading: "Schedules" }),
          facts([["schedules with a better record", String(v.better)], ["the same", String(v.same)], ["worse", String(v.worse)]])
        ];
      }
    },
    "fantasy.teams[].strength_of_schedule": {
      n: WEEKS,
      value: function (s) { return [signed(s.value, 2), "points a week above the league average"]; },
      draw: function (v) {
        return facts([["my opponents' average", num(v.opponents_average, 2)], ["league average", num(v.league_average, 2)],
          ["rank", rankText(v.league_rank, v.league_size, "hardest")]]);
      }
    },
    "fantasy.teams[].lineup_efficiency": {
      n: WEEKS,
      value: function (s) { return [num(s.value, 1), "points left on the bench this season"]; },
      draw: function (v) {
        var slots = isObj(v.regret_by_slot) ? Object.keys(v.regret_by_slot) : [];
        var hits = isObj(v.waiver_hits_left_on_bench) ? v.waiver_hits_left_on_bench : null;
        return [
          facts([["rank", rankText(v.league_rank, v.league_size, "fewest left on the bench")], ["league average", num(v.league_average, 1)]]),
          // Apart from the lineup total: adds that beat their baseline but sat on my bench.
          hits ? h("p", { class: "ld-sentence" }, h("b", null, "Hit, left on the bench: "),
            hits.adds === 0 ? "no waiver adds." : plural(hits.adds, "adds").replace(/^1 adds$/, "1 add") + ", " + num(hits.benched_points, 1) +
              " points on my bench, " + signed(hits.points_available, 2) + " net points available.") : null,
          weeklyBench(v),
          slots.length ? bars("Points left on the bench by slot", slots.map(function (k) {
            return { label: k, value: v.regret_by_slot[k], text: num(v.regret_by_slot[k], 1) };
          }), { labelHeading: "Slot", valueHeading: "Points" }) : null
        ];
      }
    },
    "fantasy.teams[].start_sit": {
      n: WEEKS,
      value: function (s) { return [pct(s.value), "of close calls right"]; },
      draw: function (v) { return facts([["close calls right", v.right + " of " + v.total]]); }
    },
    "fantasy.teams[].consistency": {
      n: WEEKS,
      value: function (s) { return [num(s.value, 3), "spread of weekly scores (lower = steadier)"]; },
      draw: function (v) {
        return facts([["rank", rankText(v.league_rank, v.league_size, "steadiest")], ["league average", num(v.league_average, 3)]]);
      }
    },
    "fantasy.teams[].draft_value": {
      n: WEEKS,
      wide: true,
      draw: function (v) {
        var cols = [{ label: "Player" }, { label: "Pos" }, { label: "Pick", num: true }, { label: "Rank, points per game", num: true },
          { label: "Difference", num: true }, { label: "Points per game", num: true }];
        function rows(xs) {
          return list(xs).map(function (p) {
            return [p.player, p.position, String(p.pick), String(p.ppg_rank), signed(p.difference, 0), num(p.points_per_game, 2)];
          });
        }
        return [
          facts([["picks ranked", v.ranked + " of " + v.my_picks]]),
          table("Best value for where they were drafted", cols, rows(v.best), { showCaption: true }),
          table("Worst value for where they were drafted", cols, rows(v.worst), { showCaption: true })
        ];
      }
    },
    "fantasy.teams[].waiver_impact": {
      n: WEEKS,
      value: function (s) { return [num(s.value, 1), "points from players I didn't draft"]; },
      draw: function (v) {
        return [facts([["share of my starters' points", pct(v.share)], ["players", String(v.players)]]),
          list(v.top).length ? table("Most points from players I didn't draft", [{ label: "Player" }, { label: "Points", num: true }],
            list(v.top).map(function (p) { return [p.player, num(p.points, 1)]; }), { showCaption: true }) : null];
      }
    },
    "fantasy.teams[].waiver_adds": {
      n: "adds judged",
      wide: true,
      value: function (s) { return [pct(s.value), "hit rate"]; },
      intervalFmt: function (x) { return pct(x); },
      draw: function (v) {
        // Every add (values.all, in the file's order), the best and worst three marked by
        // their flags, in words and by a filled or outlined triangle, never colour alone.
        // An older file has only the best and worst lists, so those are shown. Only
        // players are named: the team a dropped player went to is never shown.
        var rows = [], seen = {};
        if (Array.isArray(v.all)) {
          rows = v.all.map(function (a) {
            return { add: a, marks: [a.best === true ? "best" : null, a.worst === true ? "worst" : null].filter(Boolean) };
          });
        } else [["best", list(v.best)], ["worst", list(v.worst)]].forEach(function (g) {
          g[1].forEach(function (a) {
            var key = a.week + "|" + a.added;
            if (seen[key]) { seen[key].marks.push(g[0]); return; }
            seen[key] = { add: a, marks: [g[0]] };
            rows.push(seen[key]);
          });
        });
        rows.sort(function (a, b) { return a.add.week - b.add.week; });
        function bid(sp) {
          return isObj(sp) && sp.kind === "faab" && isNum(sp.amount) ? "$" + sp.amount : "–";
        }
        function mark(m) {
          if (!m.length) return null;
          return h("span", { class: "ld-mark ld-mark--" + m[0] }, h("span", { "aria-hidden": "true" }, m[0] === "best" ? "▲ " : "▽ "), m.join(" and "));
        }
        var counts = isObj(v.counts) ? v.counts : {};
        var t = h("div", { class: "data-table ld-table" },
          h("table", null,
            h("caption", { class: "ld-caption" }, (Array.isArray(v.all) ? "Every add" : "Adds") + ", best and worst three marked"),
            h("thead", null, h("tr", null, ["Week", "Added", "Dropped", "Bid", "Class"].map(function (c, i) {
              return h("th", { scope: "col", class: i === 0 || i === 3 ? "num" : null }, c);
            }))),
            h("tbody", null, rows.map(function (r) {
              var a = r.add;
              return h("tr", null,
                h("td", { class: "num" }, String(a.week)),
                h("th", { scope: "row" }, a.added + (a.position ? " (" + a.position + ")" : ""), r.marks.length ? [h("br"), mark(r.marks)] : null),
                h("td", null, a.dropped || "–"),
                h("td", { class: "num" }, bid(a.spent)),
                h("td", null, String(a["class"])));
            }))));
        return [
          facts([["net points available", signed(v.net_points_available, 2)], ["net points captured", signed(v.net_points_captured, 2)],
            ["adds a week", num(v.adds_per_week, 1)], ["adds", String(v.adds)], ["judged", String(v.judged)]]),
          facts(["hit, captured", "hit, left on the bench", "miss", "stash", "insurance"].map(function (k) {
            return [k, isNum(counts[k]) ? String(counts[k]) : null];
          })),
          t,
          isNum(v.adds) && v.adds > rows.length ? h("p", { class: "ld-small" },
            "The data lists the best and worst three of " + v.adds + " adds; the other " + (v.adds - rows.length) + " aren't in it.") : null
        ];
      }
    },
    "fantasy.teams[].position_share": {
      n: WEEKS,
      draw: function (v) {
        need(isObj(v.mine) && isObj(v.league), "position_share");
        return bars("Share of my starters' points by position", Object.keys(v.mine).map(function (k) {
          return { label: k, value: v.mine[k], text: pct(v.mine[k]), ref: v.league[k], refText: isNum(v.league[k]) ? pct(v.league[k]) : null };
        }), { labelHeading: "Position", valueHeading: "mine", refHeading: "league average" });
      }
    },
    "fantasy.quadrant": {
      n: WEEKS,
      wide: true,
      draw: function (v) { return quadrant(v); }
    },
    "fantasy.manager_score.components.draft": managerComponent("Draft", "my drafted starters against the median player taken in the same round"),
    "fantasy.manager_score.components.lineup": managerComponent("Lineup", "my lineup against the best possible one from my roster"),
    "fantasy.manager_score.components.moves": managerComponent("Moves", "adds, drops and trades against keeping my drafted roster"),
    "fantasy.manager_score.components.strength": managerComponent("Strength", "my starters against the league average"),
    "fantasy.manager_score.composite": {
      n: WEEKS,
      label: "Composite",
      value: function (s) { return [pct(s.value), "of managers across my leagues score lower"]; },
      intervalFmt: function (x) { return pct(x); },
      draw: function (v, s) {
        return h("div", { class: "meter" }, h("div", { class: "chance-track", "aria-hidden": "true" },
          h("div", { class: "chance-bar", style: { width: (Math.max(0, Math.min(1, s.value)) * 100) + "%" } })));
      }
    },
    "fantasy.teams[].acquisition_split": {
      n: WEEKS,
      draw: function (v) {
        var keys = ["draft", "waiver", "trade", "other"].filter(function (k) { return isObj(v[k]) && isNum(v[k].mine); });
        return bars("Points to date by how the player arrived", keys.map(function (k) {
          return { label: k, value: v[k].mine, text: num(v[k].mine, 1), ref: v[k].league_median, refText: isNum(v[k].league_median) ? num(v[k].league_median, 1) : null };
        }), { labelHeading: "Arrived by", valueHeading: "mine", refHeading: "league median" });
      }
    },
    "fantasy.teams[].draft": {
      n: WEEKS,
      wide: true,
      value: function (s) { return isNum(s.value) ? [signed(s.value, 1), "points above the round baseline, all picks together"] : null; },
      draw: function (v) {
        var picks = list(v.picks).filter(isObj);
        var best = null, worst = null;
        picks.forEach(function (p) {
          if (!isNum(p.residual)) return;
          if (!best || p.residual > best.residual) best = p;
          if (!worst || p.residual < worst.residual) worst = p;
        });
        return [facts([["best value", best ? best.player + " (round " + best.round + ", " + signed(best.residual, 1) + ")" : null],
          ["worst value", worst ? worst.player + " (round " + worst.round + ", " + signed(worst.residual, 1) + ")" : null]]),
          table("Every pick against the median for its round", [{ label: "Round", num: true }, { label: "Pick", num: true }, { label: "Player" },
            { label: "Points to date", num: true }, { label: "Round baseline", num: true }, { label: "Residual", num: true }],
            picks.map(function (p) {
              return [String(p.round), String(p.pick), String(p.player), num(p.points_to_date, 1), num(p.round_baseline, 1), signed(p.residual, 1)];
            }), { showCaption: true })];
      }
    },
    "fantasy.platforms.*.projection_accuracy": {
      n: WEEKS,
      value: function (s) { return [signed(s.value, 2), "points per player-week (bias)"]; },
      intervalFmt: function (x) { return signed(x, 2); },
      draw: function (v) {
        var pos = isObj(v.by_position) ? Object.keys(v.by_position) : [];
        return [facts([["mean absolute error", num(v.mae, 2) + " points"], ["player-weeks", big(v.player_weeks)]]),
          pos.length ? table("By position", [{ label: "Position" }, { label: "Bias", num: true }, { label: "Mean absolute error", num: true }, { label: "Player-weeks", num: true }],
            pos.map(function (k) { var p = v.by_position[k]; return [k, signed(p.bias, 2), num(p.mae, 2), String(p.n)]; }), { showCaption: true }) : null];
      }
    },

    // ----- grading -----
    "grading.win_chance": {
      n: "predictions",
      // Not enough until twenty predictions are stored, whatever the block's status says.
      gate: function (s, a) {
        var stored = isObj(a.grading) && isNum(a.grading.predictions_stored) ? a.grading.predictions_stored : 0;
        return stored < 20 ? { status: "not enough data yet", n: stored, min_n: 20 } : null;
      },
      value: function (s) { return [num(s.values.brier, 3), "Brier score (always saying 50% scores 0.25)"]; },
      draw: function (v) {
        return table("Predicted win chance against how often I won", [{ label: "Predicted chance" }, { label: "Predictions", num: true },
          { label: "Mean predicted", num: true }, { label: "Won", num: true }],
          list(v.bins).map(function (b) {
            return [pct(b.from) + " to " + pct(b.to), String(b.n), isNum(b.predicted) ? pct(b.predicted) : "–", isNum(b.observed) ? pct(b.observed) : "–"];
          }), { showCaption: true });
      }
    },
    "grading.playoff_odds[].odds_over_time": {
      n: "seasons",
      draw: function (v) {
        return [facts([["made the playoffs", v.made_playoffs === true ? "yes" : v.made_playoffs === false ? "no" : null],
          ["final seed", isNum(v.final_seed) ? String(v.final_seed) : null]]),
          table("Odds before each week", [{ label: "Week" }, { label: "Playoffs", num: true }, { label: "Top seed", num: true },
            { label: "Bye", num: true }, { label: "Expected wins", num: true }],
            list(v.weeks).map(function (w) {
              return ["Week " + w.week, pct(w.playoffs), pct(w.top_seed), isNum(w.bye) ? pct(w.bye) : "–", num(w.expected_wins, 1)];
            }), { showCaption: true })];
      }
    },

    // ----- listening -----
    "listening.album_half_life": {
      n: "albums",
      value: function (s) { return [num(s.values.median_half_life_days, 1) + " days", "median half-life of an album's plays"]; },
      draw: function (v) {
        var c = v.current;
        if (!isObj(c)) return null;
        var ok = c.status === "ok" && isNum(c.half_life_days);
        return h("div", { class: "ld-callout" },
          h("p", { class: "ld-callout-title" }, "This week's most-played album"),
          h("p", { class: "ld-callout-body" }, h("b", null, String(c.album)), " by " + c.artist),
          facts([["half-life so far", ok ? num(c.half_life_days, 1) + " days" : String(c.status)],
            ["interval", ok ? interval(c.half_life_interval, function (x) { return num(x, 1); }) : null],
            ["plays, last 7 days", String(c.plays_last_7_days)], ["days since its first play", String(c.days_so_far)]]));
      }
    },
    "listening.discovery": {
      n: "months",
      draw: function (v) {
        return columns("Share of plays by artists new that month", list(v.months).map(function (m) {
          return { label: monthText(m.month, true), title: monthText(m.month), value: m.share, text: pct(m.share) };
        }), { labelHeading: "Month", valueHeading: "Share by new artists" });
      }
    },
    "listening.album_listener": { n: "plays", value: function (s) { return isNum(s.value) ? [pct(s.value), "of plays follow the album's previous track"] : null; } },
    "listening.concentration": {
      n: "months",
      draw: function (v) {
        var d = v.most_in_a_day;
        return [columns("Top five artists' share of plays", list(v.months).map(function (m) {
          return { label: monthText(m.month, true), title: monthText(m.month), value: m.top_five_share, text: pct(m.top_five_share) };
        }), { labelHeading: "Month", valueHeading: "Top five's share" }),
          isObj(d) ? facts([["most plays of one track in a day", d.plays + ", “" + d.track + "” by " + d.artist + ", " + dateText(d.date)]]) : null];
      }
    },
    "listening.heatmap": {
      n: "days",
      draw: function (v) {
        var days = list(v.weekdays), grid = list(v.grid);
        var max = Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, list(r).concat(0)); }).concat(0));
        var chart = h("div", { class: "ld-heat", role: "img", "aria-label": "Plays by weekday and hour, Pacific. " +
          days.map(function (d, i) { return d + ": " + list(grid[i]).reduce(function (a, b) { return a + b; }, 0) + " plays"; }).join("; ") },
          days.map(function (d, i) {
            return h("div", { class: "ld-heat-row" }, h("span", { class: "ld-heat-day" }, d),
              h("span", { class: "ld-heat-cells" }, list(grid[i]).map(function (c, hr) {
                return h("span", { class: "heat-cell heat-" + heatLevel(c, max), title: d + " " + hr + ":00, " + c + " plays" });
              })));
          }),
          h("div", { class: "ld-heat-row ld-heat-axis", "aria-hidden": "true" }, h("span", { class: "ld-heat-day" }),
            h("span", { class: "ld-heat-cells" }, [0, 6, 12, 18].map(function (hr) { return h("span", { style: { gridColumn: (hr + 1) + " / span 6" } }, hr + ":00"); }))));
        var hours = [];
        for (var hr = 0; hr < 24; hr++) hours.push({ label: hr + ":00", num: true });
        var t = charted("Plays by weekday and hour", chart, [{ label: "Weekday" }].concat(hours),
          days.map(function (d, i) { return [d].concat(list(grid[i]).map(String)); }));
        return [t, facts([["plays a weekday", num(v.per_weekday, 1)], ["plays a weekend day", num(v.per_weekend_day, 1)]])];
      }
    },
    "listening.genre_mix": {
      n: "months",
      draw: function (v) {
        var months = list(v.months), totals = {};
        months.forEach(function (m) { Object.keys(m.genres || {}).forEach(function (g) { totals[g] = (totals[g] || 0) + m.genres[g] * m.plays; }); });
        var genres = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
        return table("Share of each month's plays by genre", [{ label: "Month" }, { label: "Plays", num: true }].concat(genres.map(function (g) { return { label: g, num: true }; })),
          months.map(function (m) {
            return [monthText(m.month), big(m.plays)].concat(genres.map(function (g) { return isNum((m.genres || {})[g]) ? pct(m.genres[g]) : "–"; }));
          }), { showCaption: true, cls: "ld-table--wide" });
      }
    },
    "listening.comebacks": {
      n: "months",
      draw: function (v) {
        var xs = list(v.comebacks);
        return xs.length ? table("Comebacks, newest first", [{ label: "Artist" }, { label: "Month" }, { label: "Plays", num: true }, { label: "Months away", num: true }],
          xs.map(function (c) { return [c.artist, monthText(c.month), String(c.plays), String(c.months_away)]; }), { showCaption: true })
          : h("p", { class: "panel-empty" }, "None so far.");
      }
    },
    "listening.first_repeat": {
      n: "tracks",
      value: function (s) { return [hoursText(s.values.median_hours), "median from a new track's first play to its second"]; },
      draw: function (v) { return facts([["new tracks played twice", v.repeated + " of " + v.new_tracks]]); }
    },
    "cross.rhythm.plays": {
      n: "plays",
      draw: function (v, s, ctx) {
        var hours = list(v.by_hour);
        return [weekdayColumns("Plays by weekday", ctx.weekdays, v.by_weekday, "Plays"),
          hours.length ? columns("Plays by hour, Pacific", hours.map(function (c, i) { return { label: String(i), title: i + ":00", value: c, text: big(c) }; }),
            { labelHeading: "Hour", valueHeading: "Plays", every: 6 }) : null];
      }
    },
    "listening.entropy": {
      n: "months",
      value: function (s) { return isNum(s.value) ? [num(s.value, 2) + " bits", "entropy of plays across artists, latest month"] : null; },
      draw: function (v) {
        return columns("Entropy across artists by month (months with 50 or more plays)", list(v.months).map(function (m) {
          return { label: monthText(m.month, true), title: monthText(m.month) + " (" + plural(m.plays, "plays") + ", " + plural(m.artists, "artists") + ")", value: m.entropy_bits, text: num(m.entropy_bits, 2) };
        }), { labelHeading: "Month", valueHeading: "Entropy (bits)" });
      }
    },
    "listening.nostalgia": {
      n: "months",
      value: function (s) { return isNum(s.value) ? [String(Math.round(s.value)), "median release year of what I played, latest month"] : null; },
      draw: function (v) {
        var months = list(v.months);
        return months.length ? lineChart("Median release year by month", months.map(function (m) {
          return { label: monthText(m.month), value: m.median_release_year };
        }), function (x) { return String(Math.round(x)); }) : null;
      }
    },
    "listening.enduring": {
      n: "artists",
      draw: function (v) {
        var lib = isObj(v.library) ? v.library : {};
        return [facts([["artists in the library", isNum(lib.artists) ? big(lib.artists) : null], ["lifetime plays", isNum(lib.plays) ? big(lib.plays) : null],
          ["library since", typeof lib.since === "string" ? monthText(lib.since) : null]]),
          bars("Plays a year since first added", list(v.artists).map(function (a) {
            return { label: a.artist, value: a.plays_per_year, text: big(a.plays_per_year) + " (" + big(a.plays) + " over " + num(a.years, 1) + " years)" };
          }), { labelHeading: "Artist", valueHeading: "Plays a year" })];
      }
    },
    "listening.retention_new_artists": {
      n: "months",
      value: function (s) { return isNum(s.value) ? [pct(s.value), "of a month's new artists played again within 30 days, latest"] : null; },
      draw: function (v) {
        var months = list(v.months);
        return months.length ? multiLine("New artists still played 30 and 90 days later", months.map(function (m) { return monthText(m.month); }),
          [{ name: "after 30 days", values: months.map(function (m) { return m.share_30d; }) },
           { name: "after 90 days", values: months.map(function (m) { return m.share_90d; }) }],
          { fmt: pct, labelHeading: "Month", height: 110 }) : null;
      }
    },

    // ----- lifting -----
    "lifting.body_weight_rate": {
      n: "weigh-ins",
      value: function (s) { return [signed(s.value, 2), "lb a week since the cut started"]; },
      intervalFmt: function (x) { return signed(x, 2); },
      draw: function (v) {
        return facts([["cut started", v.cut_start ? dateText(v.cut_start) : null], ["first weigh-in", num(v.first, 1) + " lb"],
          ["latest", num(v.latest, 1) + " lb"], ["weigh-ins", String(v.weigh_ins)]]);
      }
    },
    "lifting.strength_kept.*": {
      n: "weigh-ins",
      value: function (s) { return [num(s.value, 2), "lb of e1RM kept per lb lost"]; },
      intervalFmt: function (x) { return num(x, 2); },
      draw: function (v) {
        function iv(x) { return interval(x, function (y) { return signed(y, 1); }); }
        return facts([["e1RM change", signed(v.e1rm_change, 1) + " lb" + (iv(v.e1rm_change_interval) ? " (" + iv(v.e1rm_change_interval) + ")" : "")],
          ["body weight change", signed(v.weight_change, 1) + " lb" + (iv(v.weight_change_interval) ? " (" + iv(v.weight_change_interval) + ")" : "")],
          ["days since the cut started", String(v.days)], ["sessions", String(v.sessions)]]);
      }
    },
    "lifting.progress.*": {
      n: "sessions",
      value: function (s) { return [signed(s.value, 1), "lb a month, estimated one-rep max"]; },
      intervalFmt: function (x) { return signed(x, 1); },
      draw: function (v) {
        // A lift with too few recent sessions has nulls here; those rows are left out.
        var l8 = isObj(v.last_8_weeks) && isNum(v.last_8_weeks.lb_per_month) ? v.last_8_weeks : null;
        return facts([["last 8 weeks", l8 ? (v.plateau ? "plateau" : String(l8.direction)) + ", " + signed(l8.lb_per_month, 1) + " lb a month" : null],
          ["its interval", l8 ? interval(l8.interval, function (x) { return signed(x, 1); }) : null],
          ["sessions in those weeks", l8 ? String(l8.sessions) : null],
          ["sessions a week", isNum(v.sessions_per_week) ? num(v.sessions_per_week, 1) : null]]);
      }
    },
    "lifting.strength_index": {
      n: WEEKS,
      value: function (s) { return isNum(s.value) ? [num(s.value, 1), "strength index (the cut's first week = 100)"] : null; },
      draw: function (v) {
        // A week without a weigh-in has a null body weight; each line skips those points.
        var weeks = list(v.weeks).filter(function (w) { return isObj(w) && (isNum(w.strength) || isNum(w.body_weight)); });
        function latest(key) {
          if (isObj(v.current) && isNum(v.current[key])) return v.current[key];
          for (var i = weeks.length - 1; i >= 0; i--) if (isNum(weeks[i][key])) return weeks[i][key];
          return null;
        }
        var bw = latest("body_weight"), st = latest("strength");
        return [weeks.length > 1 ? indexedLines(weeks) : null,
          facts([["cut started", v.cut_start ? dateText(v.cut_start) : null],
            ["body weight", isNum(bw) ? signed(bw - 100, 1) + "%" : null], ["strength", isNum(st) ? signed(st - 100, 1) + "%" : null],
            ["lifts in the index", list(v.lifts).length ? list(v.lifts).join(", ") : null],
            ["not tracked", list(v.untracked).length ? list(v.untracked).join(", ") : null]])];
      }
    },
    "lifting.retention.*": {
      n: "sessions",
      value: function (s) { return [signed(s.value, 1), "lb of e1RM since the cut started"]; },
      intervalFmt: function (x) { return signed(x, 1); },
      draw: function (v) {
        return facts([["before the cut", isNum(v.start) ? num(v.start, 1) + " lb" : null], ["latest", isNum(v.latest) ? num(v.latest, 1) + " lb" : null],
          ["change", isNum(v.change_pct) ? signed(v.change_pct * 100, 1) + "%" : null]]);
      }
    },
    "lifting.volume_lag": {
      n: WEEKS,
      value: function (s) { return ["r " + num(s.value, 2), "a week's volume against the next week's e1RM change"]; },
      intervalFmt: function (x) { return num(x, 2); },
      draw: function (v) {
        var pts = list(v.points).filter(function (p) { return isObj(p) && isNum(p.volume) && isNum(p.next_e1rm_change); });
        return [facts([["lag", isNum(v.lag_weeks) ? plural(v.lag_weeks, WEEKS) : null], ["weeks paired", isNum(v.weeks) ? String(v.weeks) : null]]),
          pts.length ? table("Each week's volume and the next week's change", [{ label: "Week of" }, { label: "Volume (lb)", num: true }, { label: "Next week's e1RM change", num: true }],
            pts.map(function (p) { return [dateText(p.week_start), big(p.volume), signed(p.next_e1rm_change, 1)]; }), { showCaption: true }) : null];
      }
    },
    "lifting.consistency": {
      n: WEEKS,
      value: function (s) { return ["r " + num(s.value, 2), "sessions a week against the next week's e1RM change"]; },
      intervalFmt: function (x) { return num(x, 2); },
      draw: function (v) {
        // A bucket with no following week has a null mean and is left out.
        var rows = list(v.buckets).filter(function (b) { return isObj(b) && isNum(b.mean_e1rm_change); });
        return rows.length ? bars("Mean e1RM change by sessions a week", rows.map(function (b) {
          return { label: String(b.sessions_per_week) + (String(b.sessions_per_week) === "1" ? " session" : " sessions") + " · " + plural(b.weeks, WEEKS),
            value: b.mean_e1rm_change, text: signed(b.mean_e1rm_change, 1) + " lb" };
        }), { labelHeading: "Sessions a week", valueHeading: "Mean e1RM change" }) : null;
      }
    },
    "cross.time_budget": {
      n: WEEKS,
      draw: function (v, s, ctx) {
        var hrs = isObj(v.hours) ? v.hours : {}, kinds = ["watching", "listening", "training"];
        var days = list(v.weekdays).length === 7 ? v.weekdays : ctx.weekdays;
        var span = isNum(v.weeks) ? v.weeks : 8;
        // The pipeline now writes each weekday's mean hours per week (and the window's "to"
        // date); an older file holds the window's totals, and says so. Nothing is divided here.
        var perWeek = typeof v.to === "string";
        var title = perWeek ? "Hours per week by weekday, last " + span + " weeks" : "Hours by weekday, total over the last " + span + " weeks";
        var unit = perWeek ? "hours a week" : "hours in total";
        var totals = days.map(function (d, i) { return kinds.reduce(function (a, k) { return a + (isNum(list(hrs[k])[i]) ? hrs[k][i] : 0); }, 0); });
        var max = Math.max.apply(null, totals.concat(0));
        var chart = h("div", { class: "ld-cols", role: "img", style: { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
          "aria-label": title + ": " + days.map(function (d, i) {
            return d + " " + num(totals[i], 1) + " " + unit + " (" + kinds.map(function (k) { return k + " " + num(list(hrs[k])[i] || 0, 1); }).join(", ") + ")";
          }).join("; ") },
          days.map(function (d, i) {
            return h("div", { class: "ld-col", title: d + ": " + num(totals[i], 1) + " " + unit },
              h("span", { class: "ld-col-value" }, num(totals[i], 1)),
              h("div", { class: "ld-col-stack", style: { height: max > 0 ? "calc((100% - 18px) * " + (totals[i] / max).toFixed(4) + ")" : "0" } },
                kinds.map(function (k) { var x = list(hrs[k])[i]; return isNum(x) && x > 0 ? h("span", { class: "fill--" + k, style: { flexGrow: x } }) : null; }).reverse()),
              h("span", { class: "ld-col-label", "aria-hidden": "true" }, d));
          }));
        return [charted(title, chart,
          [{ label: "Weekday" }, { label: perWeek ? "Hours a week" : "Hours, total", num: true }].concat(kinds.map(function (k) { return { label: k, num: true }; })),
          days.map(function (d, i) { return [d, num(totals[i], 1)].concat(kinds.map(function (k) { return num(list(hrs[k])[i] || 0, 1); })); }),
          h("p", { class: "ld-legend" }, kinds.map(function (k) { return legendItem("fill--" + k, k); }))),
          facts([["window", v.from ? dateText(v.from) + (perWeek ? " to " + dateText(v.to) : "") : null],
            ["figures", perWeek ? "mean hours per week" : "totals over the window (per-week means arrive with the next pipeline run)"]])];
      }
    },

    "lifting.relative_strength.*": {
      n: "sessions",
      value: function (s) { return [signed(s.value, 3), "a month, e1RM per lb of body weight"]; },
      intervalFmt: function (x) { return signed(x, 3); },
      draw: function (v, s, ctx) {
        var series = list(v.series);
        return [facts([["latest", isNum(v.latest) ? num(v.latest, 3) + " lb e1RM per lb" : null]]),
          series.length > 1 ? lineChart(ctx.label + ": e1RM per lb of body weight", series.map(function (p) {
            return { label: dateText(p.date), value: p.ratio };
          }), function (x) { return num(x, 3); }) : null];
      }
    },
    "lifting.lag_check": {
      n: WEEKS,
      draw: function (v) {
        return intervals("Correlation, weight change against e1RM change", list(v.lags).map(function (l) {
          return { label: l.lag_weeks + (l.lag_weeks === 1 ? " week" : " weeks") + " later", value: l.r, lo: l.interval[0], hi: l.interval[1],
            text: "r " + num(l.r, 2) + " (" + num(l.interval[0], 2) + " to " + num(l.interval[1], 2) + "), n " + l.n };
        }), { min: -1, max: 1, labelHeading: "Lag" });
      }
    },
    "cross.lifting_soundtrack": {
      n: "plays",
      draw: function (v) {
        var top = list(v.top_artists_this_month), bests = list(v.artists_at_bests);
        return [facts([["plays during workouts", big(v.plays_in_workouts)],
          ["workouts with music", v.workouts_with_music + " of " + v.workouts_since_first_play + " since my first play"],
          ["sessions with a best e1RM and music", isNum(v.best_sessions_with_music) ? String(v.best_sessions_with_music) : null]]),
          top.length ? bars("Most played in workouts this month", top.map(function (a) { return { label: a.artist, value: a.plays, text: String(a.plays) }; }),
            { labelHeading: "Artist", valueHeading: "Plays" }) : h("p", { class: "panel-empty" }, "No plays during workouts this month."),
          bests.length ? bars("Played in sessions where a best was set", bests.map(function (a) { return { label: a.artist, value: a.plays, text: String(a.plays) }; }),
            { labelHeading: "Artist", valueHeading: "Plays" }) : null];
      }
    },
    "cross.rhythm.workouts": {
      n: "workouts",
      draw: function (v, s, ctx) { return weekdayColumns("Workouts by weekday", ctx.weekdays, v.by_weekday, "Workouts"); }
    },

    // ----- watching -----
    "watching.completion.show": completion("show"),
    "watching.completion.film": completion("film"),
    "watching.completion.anime": completion("anime"),
    "watching.hours_by_month": {
      n: "months",
      draw: function (v) {
        var months = list(v.months), types = ["film", "show", "anime"];
        var max = Math.max.apply(null, months.map(function (m) { return m.hours; }).concat(0));
        var chart = h("div", { class: "ld-cols", role: "img", style: { gridTemplateColumns: "repeat(" + Math.max(months.length, 3) + ", minmax(0, 1fr))" },
          "aria-label": "Hours watched by month: " + months.map(function (m) {
            return monthText(m.month) + " " + num(m.hours, 1) + " hours (" + types.map(function (t) { return nameOf(t).toLowerCase() + " " + pct(m.share[t] || 0); }).join(", ") + ")";
          }).join("; ") },
          months.map(function (m) {
            return h("div", { class: "ld-col", title: monthText(m.month) + ": " + num(m.hours, 1) + " hours" },
              h("span", { class: "ld-col-value" }, num(m.hours, 1)),
              h("div", { class: "ld-col-stack", style: { height: max > 0 ? "calc((100% - 18px) * " + (m.hours / max).toFixed(4) + ")" : "0" } },
                types.map(function (t) { return m.share[t] ? h("span", { class: "fill--" + TYPE_CLASS[t], style: { flexGrow: m.share[t] } }) : null; }).reverse()),
              h("span", { class: "ld-col-label", "aria-hidden": "true" }, monthText(m.month, true)));
          }));
        return charted("Hours watched by month", chart,
          [{ label: "Month" }, { label: "Hours", num: true }].concat(types.map(function (t) { return { label: nameOf(t), num: true }; })),
          months.map(function (m) { return [monthText(m.month), num(m.hours, 1)].concat(types.map(function (t) { return pct(m.share[t] || 0); })); }),
          h("p", { class: "ld-legend" }, types.map(function (t) {
            return h("span", { class: "legend-item" }, h("span", { class: "legend-swatch fill--" + TYPE_CLASS[t], "aria-hidden": "true" }), nameOf(t));
          })));
      }
    },
    "watching.pace": {
      n: "titles",
      value: function (s) { return [num(s.value, 1), "episodes a week, median"]; },
      draw: function (v) {
        return table("Finished titles with dated episodes", [{ label: "Title" }, { label: "Type" }, { label: "Episodes", num: true }, { label: "Weeks", num: true }, { label: "A week", num: true }],
          list(v.titles).map(function (t) { return [t.title, String(t.type), String(t.episodes), num(t.weeks, 1), num(t.episodes_per_week, 1)]; }), { showCaption: true });
      }
    },
    "watching.keeping_up": {
      n: "titles",
      draw: function (v) {
        return [table("Still airing", [{ label: "Title" }, { label: "Type" }, { label: "Watched", num: true }, { label: "Released", num: true }, { label: "Behind", num: true }],
          list(v.titles).map(function (t) { return [t.title, String(t.type), String(t.watched), String(t.released), String(t.behind)]; }), { showCaption: true }),
          facts([["caught up", String(v.caught_up)], ["left out (no episodes logged)", String(v.left_out_unknown)]])];
      }
    },
    "watching.first_episode_drops": {
      n: "titles",
      value: function (s) { return [pct(s.value), "dropped after one episode at most"]; },
      draw: function (v) {
        var bt = isObj(v.by_type) ? v.by_type : {};
        return facts([["dropped", v.dropped_after_one + " of " + v.started + " started"]].concat(Object.keys(bt).map(function (k) {
          return [nameOf(k).toLowerCase(), bt[k].dropped_after_one + " of " + bt[k].started];
        })).concat([["left out (no episodes logged)", String(v.left_out_unknown)]]));
      }
    },
    "watching.backlog": { n: "titles", value: function (s) { return isNum(s.value) ? [num(s.value, 0), "days from the list to a first watch, median"] : null; } },
    "watching.genre_mix.show": genres("show"),
    "watching.genre_mix.film": genres("film"),
    "watching.genre_mix.anime": genres("anime"),
    "watching.genre_mix.by_year": {
      n: "years",
      label: "By the year I watched them",
      draw: function (v) {
        var ys = isObj(v.years) ? Object.keys(v.years) : [];
        return table("Genres by the year watched", [{ label: "Year" }, { label: "Titles", num: true }, { label: "Genres" }],
          ys.map(function (y) {
            var g = v.years[y].genres || {};
            return [y, String(v.years[y].titles), Object.keys(g).map(function (k) { return k + " " + pct(g[k]); }).join(", ")];
          }));
      }
    },
    "watching.release_decades": {
      n: "films",
      draw: function (v) {
        return columns("Films finished by decade of release", list(v.decades).map(function (d) {
          return { label: d.decade, value: d.films, text: String(d.films), title: d.decade + " (" + pct(d.share) + ")" };
        }), { labelHeading: "Decade", valueHeading: "Films" });
      }
    },
    "watching.runtime": {
      n: "films",
      value: function (s) { return [num(s.values.median_minutes) + " minutes", "median film"]; },
      draw: function (v) { return facts([["over 120 minutes", pct(v.over_120_share)]]); }
    },
    "watching.countries.show": countries("show"),
    "watching.countries.film": countries("film"),
    "watching.countries.anime": countries("anime"),
    "watching.contrarian.*": {
      n: "titles",
      wide: true,
      value: function (s) { return [num(s.value, 2), "rank correlation with Simkl's community"]; },
      intervalFmt: function (x) { return num(x, 2); },
      draw: function (v) {
        function gap(t) { return isObj(t) ? t.title + " (" + signed(t.gap, 0) + " places)" : null; }
        return [facts([["placed furthest above the community", gap(v.i_rate_higher)], ["furthest below", gap(v.i_rate_lower)]]),
          table("My top ten and Simkl's ratings", [{ label: "My rank", num: true }, { label: "Title" }, { label: "Simkl rating", num: true },
            { label: "Simkl's order", num: true }, { label: "Gap", num: true }],
            list(v.titles).map(function (t) { return [String(t.my_rank), t.title, num(t.community, 1), String(t.community_rank), signed(t.gap, 0)]; }))];
      }
    },
    "watching.tier_distribution.*": {
      n: "titles",
      draw: function (v, s, ctx) {
        return bars("Titles by tier", list(v.tiers).map(function (t) {
          return { label: t.tier, value: t.titles, text: t.titles + " (" + pct(t.share) + ")", cls: ctx.typeClass };
        }), { labelHeading: "Tier", valueHeading: "Titles" });
      }
    },
    "watching.tier_genres_decades": {
      n: "tiers",
      draw: function (v) {
        function shares(o) { return isObj(o) ? Object.keys(o).map(function (k) { return k + " " + pct(o[k]); }).join(", ") : ""; }
        return table("Each tier's genres and decades", [{ label: "Tier" }, { label: "Titles", num: true }, { label: "Genres" }, { label: "Decades" }],
          list(v.tiers).map(function (t) { return [t.tier, String(t.titles), shares(t.genres), shares(t.decades)]; }), { cls: "ld-table--wide" });
      }
    },
    "watching.tier_contrarian.*": {
      n: "titles",
      wide: true,
      value: function (s) { return [num(s.value, 2), "rank correlation, my tier against Simkl's rating"]; },
      intervalFmt: function (x) { return num(x, 2); },
      draw: function (v) {
        var cols = [{ label: "Title" }, { label: "Tier" }, { label: "Simkl rating", num: true }, { label: "Gap", num: true }];
        function rows(xs) { return list(xs).map(function (t) { return [t.title, t.tier, num(t.community, 1), signed(t.gap, 2)]; }); }
        return [table("Tiered above their rating", cols, rows(v.i_rate_higher), { showCaption: true }),
          table("Tiered below their rating", cols, rows(v.i_rate_lower), { showCaption: true })];
      }
    },
    "watching.s_tier": {
      n: "titles",
      value: function (s) { return isNum(s.value) ? [pct(s.value), "of my tiered titles are S"] : null; },
      draw: function (v) {
        var top = list(v.over_indexed).filter(function (g) { return isObj(g) && isNum(g.ratio); }).slice().sort(function (a, b) { return b.ratio - a.ratio; });
        return [sTierBars(v),
          top.length ? table("Genres in S against B", [{ label: "Genre" }, { label: "S share ÷ B share", num: true }, { label: "Titles", num: true }],
            top.map(function (g) { return [String(g.genre), num(g.ratio, 1) + "×", String(g.n)]; }), { showCaption: true }) : null];
      }
    },
    "watching.tier_model": {
      n: "titles",
      value: function (s) { return isNum(s.value) ? [pct(s.value), "of tiers predicted right, leave-one-out"] : null; },
      intervalFmt: function (x) { return pct(x); },
      draw: function (v) {
        var feats = list(v.features).filter(function (f) { return isObj(f) && isNum(f.effect) && Array.isArray(f.interval); });
        return [facts([["always guessing the commonest tier", isNum(v.baseline_accuracy) ? pct(v.baseline_accuracy) : null]]),
          feats.length ? intervals("Each feature's effect on my tier, with 95% intervals", feats.map(function (f) {
            return { label: String(f.name), value: f.effect, lo: f.interval[0], hi: f.interval[1],
              text: signed(f.effect, 2) + " (" + signed(f.interval[0], 2) + " to " + signed(f.interval[1], 2) + ")" };
          }), { labelHeading: "Feature" }) : null];
      }
    },
    "watching.taste_drift": {
      n: "years",
      value: function (s) { return isNum(s.value) ? [signed(s.value, 2), "tier points a year (S = 4, D = 0)"] : null; },
      intervalFmt: function (x) { return signed(x, 2); },
      draw: function (v) {
        return columns("Mean tier score by the year I watched", list(v.years).map(function (y) {
          return { label: String(y.year), title: y.year + " (" + plural(y.n, "titles") + ")", value: y.mean_tier_score, text: num(y.mean_tier_score, 1) };
        }), { labelHeading: "Year", valueHeading: "Mean tier score" });
      }
    },
    "watching.community_gap_by_genre": {
      n: "titles",
      draw: function (v) {
        var gs = list(v.genres).filter(function (g) { return isObj(g) && isNum(g.gap) && Array.isArray(g.interval); });
        return intervals("My tier against the community's, by genre (tier points; positive = I rate higher)", gs.map(function (g) {
          return { label: g.genre + " · " + plural(g.n, "titles"), value: g.gap, lo: g.interval[0], hi: g.interval[1],
            text: signed(g.gap, 2) + " (" + signed(g.interval[0], 2) + " to " + signed(g.interval[1], 2) + ")" };
        }), { labelHeading: "Genre" });
      }
    },
    "watching.pace_vs_tier": {
      n: "titles",
      draw: function (v) {
        var names = { binge: "binge (3+ episodes a week)", steady: "steady (1 to 3)", slow: "slow (under 1)" };
        return bars("Mean tier score by pace", list(v.buckets).map(function (b) {
          return { label: (names[b.bucket] || String(b.bucket)) + " · " + plural(b.n, "titles"), value: b.mean_tier_score, text: num(b.mean_tier_score, 1) };
        }), { labelHeading: "Pace", valueHeading: "Mean tier score" });
      }
    },
    "watching.tier_completion_pace": {
      n: "titles",
      draw: function (v, s, ctx) {
        // Titles per tier come from tier_distribution, which counts the rankings file's
        // tiered titles; completion may cover fewer of them, and then says so.
        var titles = {}, total = 0, dist = ctx.analysis && isObj(ctx.analysis.watching) ? ctx.analysis.watching.tier_distribution : null;
        if (isObj(dist)) Object.keys(dist).forEach(function (k) {
          if (!okStat(dist[k])) return;
          list(dist[k].values.tiers).forEach(function (t) { titles[t.tier] = (titles[t.tier] || 0) + t.titles; total += t.titles; });
        });
        var covered = list(v.tiers).reduce(function (a, t) { return a + t.finished + t.dropped; }, 0);
        return [table("Completion and pace by tier", [{ label: "Tier" }, { label: "Tiered titles", num: true }, { label: "Finished", num: true },
          { label: "Dropped", num: true }, { label: "Completion", num: true }, { label: "Episodes a week", num: true }],
          list(v.tiers).map(function (t) {
            return [t.tier, t.tier in titles ? String(titles[t.tier]) : "–", String(t.finished), String(t.dropped), pct(t.completion),
              isNum(t.episodes_per_week) ? num(t.episodes_per_week, 1) : "–"];
          })),
          total && covered !== total ? h("p", { class: "ld-note" }, "Completion covers " + covered + " of the " + total + " tiered titles.") : null];
      }
    },

    // ----- eating (Beli: cities may appear, dates never do) -----
    "eating.scores": {
      n: "places",
      value: function (s) { return [num(s.values.overall.median, 2), "median score"]; },
      draw: function (v) {
        function ranges(title, o) {
          var keys = isObj(o) ? Object.keys(o) : [];
          if (!keys.length) return null;
          var chart = h("div", { class: "ld-ranges", role: "img", "aria-label": title + ": " + keys.map(function (k) {
            return k + " median " + num(o[k].median, 2) + ", middle half " + num(o[k].q1, 2) + " to " + num(o[k].q3, 2);
          }).join("; ") },
            keys.map(function (k) {
              var g = o[k];
              return h("div", { class: "ld-range-row", title: k + ": median " + num(g.median, 2) + ", middle half " + num(g.q1, 2) + " to " + num(g.q3, 2) + ", " + plural(g.n, "places") },
                h("span", { class: "ld-bar-label" }, k),
                h("span", { class: "ld-iv-track" },
                  h("span", { class: "ld-range-box", style: { left: g.q1 * 10 + "%", width: (g.q3 - g.q1) * 10 + "%" } }),
                  h("span", { class: "ld-iv-dot", style: { left: g.median * 10 + "%" } })),
                h("span", { class: "ld-bar-value" }, num(g.median, 2)));
            }),
            h("div", { class: "ld-range-row ld-range-axis", "aria-hidden": "true" }, h("span"),
              h("span", { class: "ld-iv-axis-track" }, [0, 5, 10].map(function (x) { return h("span", { style: { left: x * 10 + "%" } }, String(x)); })), h("span")));
          return charted(title, chart, [{ label: "" }, { label: "Median", num: true }, { label: "Middle half", num: true }, { label: "Places", num: true }],
            keys.map(function (k) { var g = o[k]; return [k, num(g.median, 2), num(g.q1, 2) + " to " + num(g.q3, 2), String(g.n)]; }),
            h("p", { class: "ld-legend" }, h("span", { class: "ld-key-dot", "aria-hidden": "true" }), " median   ",
              h("span", { class: "ld-key-box", "aria-hidden": "true" }), " middle half of scores"));
        }
        var o = v.overall;
        return [facts([["middle half of scores", num(o.q1, 2) + " to " + num(o.q3, 2)]]),
          ranges("By cuisine", v.by_cuisine), ranges("By city", v.by_city)];
      }
    },
    "eating.choice_vs_taste": {
      n: "places",
      draw: function (v) {
        return [facts([["my top quartile starts at", num(v.top_quartile_from, 2)]]),
          bars("Share of places tried, against share of my top quartile", list(v.cuisines).map(function (c) {
            return { label: c.cuisine, value: c.tried, text: pct(c.tried), ref: c.top_quartile, refText: pct(c.top_quartile) };
          }), { labelHeading: "Cuisine", valueHeading: "share of places tried", refHeading: "share of my top quartile" })];
      }
    },
    "eating.home_bias": effect("points at home against away, same cuisine", 2, function (v) {
      // The home city is never named: it's "my most-ranked city" in the how line.
      return [["places at home", String(v.home_places)], ["places away", String(v.away_places)], ["cuisines in both", String(v.cuisines)]];
    }),
    "eating.order_effect": effect("points per 100 places ranked", 3, function (v) {
      return [["places", String(v.places)], ["cuisines", String(v.cuisines)]];
    }),
    "eating.contrast_effect": effect("change in score per point of the place before", 3, function (v) {
      return [["pairs", String(v.pairs)], ["cuisines", String(v.cuisines)]];
    }),
    "eating.contrarian": { n: "places" },
    // Counts by month only; nothing ties a month to a place.
    "eating.new_cuisines": {
      n: "months",
      draw: function (v) {
        return columns("Cuisines ranked for the first time, by month", list(v.months).map(function (m) {
          return { label: monthText(m.month, true), title: monthText(m.month), value: m.new_cuisines, text: String(m.new_cuisines) };
        }), { labelHeading: "Month", valueHeading: "New cuisines" });
      }
    },
    "eating.landing": {
      n: "months",
      value: function (s) { return isNum(s.value) ? [pct(s.value), "up my list is where a first ranking lands, latest month"] : null; },
      draw: function (v) {
        return columns("Median landing percentile of first rankings, by month", list(v.months).map(function (m) {
          return { label: monthText(m.month, true), title: monthText(m.month) + " (" + plural(m.rankings, "places") + ")", value: m.median_percentile, text: pct(m.median_percentile) };
        }), { labelHeading: "Month", valueHeading: "Median percentile" });
      }
    },
    "eating.rerank_drift": {
      n: "re-rankings",
      value: function (s) { return [signed(s.value, 2), "points, mean change when I re-rank a place"]; },
      intervalFmt: function (x) { return signed(x, 2); },
      draw: function (v) {
        return table("Change on re-ranking, by time since the first ranking", [{ label: "Since first ranking" }, { label: "Re-rankings", num: true },
          { label: "Median change", num: true }, { label: "Mean change", num: true }],
          list(v.buckets).map(function (b) { return [String(b.since), String(b.n), signed(b.median_change, 2), signed(b.mean_change, 2)]; }), { showCaption: true });
      }
    },
    "cross.rhythm.restaurants": {
      n: "places",
      draw: function (v, s, ctx) { return weekdayColumns("Places ranked by weekday", ctx.weekdays, v.by_weekday, "Places"); }
    }
  };

  function completion(type) {
    return {
      n: "titles",
      value: function (s) { return [pct(s.value), "finished, of those finished or dropped"]; },
      draw: function (v) {
        return facts([["finished", String(v.finished)], ["dropped", String(v.dropped)], ["on hold", String(v.on_hold)],
          ["watching", String(v.watching)], ["plan to watch", String(v.plan_to_watch)]]);
      }
    };
  }
  function genres(type) {
    return {
      n: "titles",
      draw: function (v) {
        var g = isObj(v.genres) ? v.genres : {};
        return bars("Share carrying each genre", Object.keys(g).map(function (k) {
          return { label: k, value: g[k], text: pct(g[k]), cls: "fill--" + TYPE_CLASS[type] };
        }), { labelHeading: "Genre", valueHeading: "Share" });
      }
    };
  }
  function countries(type) {
    return {
      n: "titles",
      draw: function (v) {
        var c = isObj(v.countries) ? v.countries : {}, ex = list(v.excluded);
        return [bars("Share by country of origin", Object.keys(c).map(function (k) {
          return { label: k, value: c[k], text: pct(c[k]), cls: "fill--" + TYPE_CLASS[type] };
        }), { labelHeading: "Country", valueHeading: "Share" }),
          ex.length ? h("p", { class: "ld-small" }, "Left out: " + ex.join("; ") + ".") : null];
      }
    };
  }
  function managerComponent(label, what) {
    return {
      n: WEEKS,
      label: label,
      value: function (s) { return [signed(s.value, 1), "points a week, " + what]; },
      intervalFmt: function (x) { return signed(x, 1); },
      draw: function (v) { return facts([["rank", rankText(v.rank, v.of, "best")], ["percentile", isNum(v.percentile) ? pct(v.percentile) : null]]); }
    };
  }

  // S-tier share by type (three bars in the type colours) and by release decade.
  function sTierBars(v) {
    var types = list(v.by_type).filter(function (t) { return isObj(t) && isNum(t.share); });
    var decades = list(v.by_decade).filter(function (d) { return isObj(d) && isNum(d.share); });
    return [types.length ? bars("S-tier share by type", types.map(function (t) {
      return { label: nameOf(t.type), value: t.share, text: pct(t.share) + " (" + t.s + " of " + t.titles + ")", cls: TYPE_CLASS[t.type] ? "fill--" + TYPE_CLASS[t.type] : null };
    }), { labelHeading: "Type", valueHeading: "S share" }) : null,
      decades.length ? bars("S-tier share by release decade", decades.map(function (d) {
        return { label: String(d.decade), value: d.share, text: pct(d.share) + " (" + d.s + " of " + d.titles + ")" };
      }), { labelHeading: "Decade", valueHeading: "S share" }) : null];
  }

  // Body weight and strength since the cut, both indexed to 100 at the cut's first week.
  function indexedLines(weeks, opts) {
    return multiLine("Body weight and strength since the cut, indexed to 100", weeks.map(function (w) { return dateText(w.week_start); }),
      [{ name: "body weight", values: weeks.map(function (w) { return w.body_weight; }) },
       { name: "strength index", values: weeks.map(function (w) { return w.strength; }) }],
      Object.assign({ fmt: function (x) { return num(x, 1); }, base: 100, baseText: "100 = cut start", labelHeading: "Week of", height: 130 }, opts || {}));
  }

  function effect(unit, dp, more) {
    return {
      n: "places",
      value: function (s) { return [signed(s.value, dp), unit]; },
      intervalFmt: function (x) { return signed(x, dp); },
      draw: function (v, s) {
        return [Array.isArray(s.interval) ? intervals("Estimate and 95% interval", [{ label: "estimate", value: s.value, lo: s.interval[0], hi: s.interval[1],
          text: signed(s.value, dp) + " (" + signed(s.interval[0], dp) + " to " + signed(s.interval[1], dp) + ")" }]) : null,
          facts(more(v))];
      }
    };
  }
  STATS["eating.contrast_effect"].n = "pairs";

  // ---------- expanding a path into the statistics it names ----------

  function expand(analysis, path) {
    var out = [{ node: analysis, labels: [], keys: [] }];
    path.split(".").forEach(function (part) {
      var next = [];
      out.forEach(function (o) {
        var arr = /\[\]$/.test(part), key = arr ? part.slice(0, -2) : part;
        if (key === "*") {
          if (!isObj(o.node)) return;
          Object.keys(o.node).forEach(function (k) { next.push({ node: o.node[k], labels: o.labels.concat(nameOf(k)), keys: o.keys.concat(k) }); });
          return;
        }
        var v = isObj(o.node) ? o.node[key] : undefined;
        if (v === undefined) return;
        if (arr) {
          list(v).forEach(function (item) {
            var label = isObj(item) && typeof item.name === "string" ? item.name : "";
            next.push({ node: item, labels: o.labels.concat(label), keys: o.keys.concat(key) });
          });
        } else next.push({ node: v, labels: o.labels, keys: o.keys.concat(key) });
      });
      out = next;
    });
    return out.map(function (o) {
      // On a list item, the statistic lives under the last key.
      return { stat: o.node, label: o.labels.filter(Boolean).join(" · "), key: o.keys[o.keys.length - 1] };
    });
  }

  // The label for a fixed key at the end of the path (watching.completion.show -> Shows).
  function leafLabel(path) {
    var last = path.split(".").pop();
    return NAMES[last] && /\.(completion|genre_mix|countries)\./.test(path) ? NAMES[last] : "";
  }

  // ---------- one statistic ----------

  function statBlock(entry, spec, analysis, ctx) {
    var s = entry.stat;
    need(isObj(s) && typeof s.status === "string", "statistic");
    var gate = spec.gate ? spec.gate(s, analysis) : null;
    var status = gate ? gate.status : s.status;
    var n = gate ? gate.n : s.n, minN = gate ? gate.min_n : s.min_n;
    var label = entry.label || spec.label || "";
    var block = h("div", { class: "ld-block ld-block--" + status.replace(/\s+/g, "-"), "data-status": status });
    if (label) block.appendChild(h("h3", { class: "ld-block-title" }, label));

    if (status === "not enough data yet") {
      block.appendChild(h("p", { class: "ld-wait" }, h("b", null, "not enough data yet"),
        " · " + (isNum(n) ? big(n) + " of " : "") + plural(minN, spec.n || "") + " needed"));
      return block;
    }
    if (status !== "ok") {
      // "not available from source", "not configured": one line, with what is missing.
      block.appendChild(h("p", { class: "ld-note" }, h("b", null, status), s.missing ? ": " + s.missing : ""));
      return block;
    }
    var v = isObj(s.values) ? s.values : {};
    var val = spec.value ? spec.value(s) : null;
    var ivText = Array.isArray(s.interval) ? interval(s.interval, spec.intervalFmt || function (x) { return num(x); }) : null;
    if (val) {
      block.appendChild(h("p", { class: "ld-value" }, h("span", { class: "ld-value-num" }, val[0]), " ",
        h("span", { class: "ld-value-unit" }, val[1]),
        ivText ? h("span", { class: "ld-interval" }, ivText) : null));
    }
    if (spec.draw) append(block, spec.draw(v, s, { label: label, weekdays: ctx.weekdays, analysis: analysis, typeClass: TYPE_CLASS[entry.key] ? "fill--" + TYPE_CLASS[entry.key] : null }));
    else if (!val) block.appendChild(h("p", { class: "ld-note" }, "Computed, but this page doesn't draw it yet."));
    block.appendChild(h("p", { class: "ld-n" }, "n = " + plural(s.n, spec.n || "") +
      (s.as_of && s.as_of !== analysis.as_of ? " · as of " + dateText(s.as_of) : "")));
    return block;
  }

  // A slot names one or more statistics (space-separated paths, e.g. completion of
  // shows, films and anime); they share one row of blocks and their "how" lines.
  // The status a statistic is shown with: its own, or its spec's gate's.
  function shownStatus(e, analysis) {
    var s = e.stat;
    if (!isObj(s) || typeof s.status !== "string") return null;
    try {
      var gate = e.spec.gate ? e.spec.gate(s, analysis) : null;
      return gate ? gate.status : s.status;
    } catch (err) { return s.status; }
  }

  // Slots that draw several statistics as one block, keyed by the slot's data-stat.
  var GROUPS = {};
  GROUPS["fantasy.manager_score.components.draft fantasy.manager_score.components.lineup fantasy.manager_score.components.moves fantasy.manager_score.components.strength"] = {
    n: WEEKS,
    // Four bars, points a week against each baseline, with rank and of; the composite is its
    // own slot below. A component still waiting is named under the bars with its n of min_n.
    draw: function (entries) {
      var ok = entries.filter(function (e) { return okStat(e.stat) && isNum(e.stat.value); });
      var waiting = entries.filter(function (e) { return isObj(e.stat) && e.stat.status === "not enough data yet"; });
      var items = ok.map(function (e) {
        var v = isObj(e.stat.values) ? e.stat.values : {};
        return { label: e.spec.label, value: e.stat.value, text: signed(e.stat.value, 1) + (isNum(v.rank) && isNum(v.of) ? " · " + v.rank + " of " + v.of : "") };
      });
      return [items.length ? bars("Points a week against each baseline", items, { labelHeading: "Component", valueHeading: "Points a week · rank" }) : null,
        ok.length ? h("p", { class: "ld-small" }, ok.map(function (e) {
          var v = isObj(e.stat.values) ? e.stat.values : {};
          var iv = interval(e.stat.interval, function (x) { return signed(x, 1); });
          return e.spec.label + ": " + (isNum(v.percentile) ? pct(v.percentile) + " of managers score lower" : "") + (iv ? ", " + iv : "");
        }).join(". ") + ".") : null,
        waiting.map(function (e) {
          return h("p", { class: "ld-wait" }, h("b", null, e.spec.label + ": not enough data yet"),
            " · " + (isNum(e.stat.n) ? big(e.stat.n) + " of " : "") + plural(e.stat.min_n, WEEKS) + " needed");
        })];
    }
  };

  // Statistics still waiting for data ("not enough data yet"): in a "Why" card they are
  // drawn as the question with a "not enough data yet · n of min_n" box; elsewhere they
  // aren't drawn, they're counted in ctx.waiting for the page's one line, and a slot left
  // with nothing to show is hidden.
  function fillSlot(slot, analysis, ctx) {
    var entries = [], found = 0;
    var card = !!slot.closest(".ld-section--why");
    var group = GROUPS[slot.getAttribute("data-stat")];
    slot.textContent = "";
    slot.hidden = false;
    slot.getAttribute("data-stat").split(/\s+/).forEach(function (path) {
      var spec = STATS[path], leaf = leafLabel(path);
      if (!spec) return;
      expand(analysis, path).forEach(function (e) {
        if (leaf) e.label = leaf;
        e.spec = spec;
        e.path = path;
        found++;
        if (!card && shownStatus(e, analysis) === "not enough data yet") { ctx.waiting = (ctx.waiting || 0) + 1; return; }
        entries.push(e);
      });
    });
    if (!entries.length && found) { slot.hidden = true; return; }
    if (!entries.length) {
      // A card whose statistic the file predates says so; elsewhere the slot says not connected.
      var firstSpec = STATS[slot.getAttribute("data-stat").split(/\s+/)[0]];
      slot.appendChild(card ? h("div", { class: "ld-blocks ld-blocks--one" }, h("div", { class: "ld-block ld-block--not-enough-data-yet", "data-status": "not in the data yet" },
        waitBox(null, firstSpec ? firstSpec.n : ""))) : h("p", { class: "panel-empty" }, NOT_CONNECTED));
      return;
    }
    var hows = [];
    function noteHow(s) {
      if (s.status !== "not available from source" && s.status !== "not configured" && typeof s.how === "string" && hows.indexOf(s.how) < 0) hows.push(s.how);
    }
    if (group) {
      // One block for the whole slot. Any entry still waiting makes the block wait too.
      var block = h("div", { class: "ld-blocks ld-blocks--one" }), waiting = entries.filter(function (e) { return shownStatus(e, analysis) === "not enough data yet"; });
      try {
        if (waiting.length === entries.length) {
          var w = waiting[0].stat;
          block.appendChild(h("div", { class: "ld-block ld-block--not-enough-data-yet", "data-status": "not enough data yet" },
            h("p", { class: "ld-wait" }, h("b", null, "not enough data yet"), " · " + (isNum(w.n) ? big(w.n) + " of " : "") + plural(w.min_n, group.n || "") + " needed")));
        } else {
          var b = h("div", { class: "ld-block", "data-status": "ok" });
          append(b, group.draw(entries, analysis, ctx));
          var ns = entries.filter(function (e) { return okStat(e.stat); }).map(function (e) { return e.stat.n; }).filter(isNum);
          if (ns.length) b.appendChild(h("p", { class: "ld-n" }, "n = " + plural(Math.min.apply(null, ns), group.n || "")));
          block.appendChild(b);
        }
        entries.forEach(function (e) { noteHow(e.stat); });
      } catch (err) {
        if (window.console) console.warn("lately-depth: " + slot.getAttribute("data-stat") + " not drawn:", err.message);
        block.appendChild(h("p", { class: "panel-empty" }, "Couldn't draw this statistic right now."));
      }
      slot.appendChild(block);
    } else {
      // One block, or blocks whose tables need the width: one to a row.
      var one = entries.length === 1 || entries.some(function (e) { return e.spec.wide; });
      var grid = h("div", { class: "ld-blocks" + (one ? " ld-blocks--one" : "") });
      slot.appendChild(grid);
      entries.forEach(function (e) {
        var spec = e.spec, path = e.path;
        try {
          grid.appendChild(statBlock(e, spec, analysis, ctx));
          noteHow(e.stat);
        } catch (err) {
          if (window.console) console.warn("lately-depth: " + path + " not drawn:", err.message);
          grid.appendChild(h("p", { class: "panel-empty" }, "Couldn't draw this statistic right now."));
        }
      });
    }
    // The pipeline's "how" sentence, once per slot when every entry shares it.
    hows.forEach(function (t) { slot.appendChild(h("p", { class: "ld-how" }, h("span", { class: "ld-how-label" }, "how: "), t)); });
  }

  // A FEED: slot holds a block of the feed itself (lineup grid, recent lists, lift tiles,
  // rankings), drawn by js/lately.js; nothing to draw hides the slot.
  function fillFeed(slot, data) {
    var LF = window.LatelyFeed, nodes = null;
    slot.textContent = "";
    try { nodes = LF && data ? LF.block(slot.getAttribute("data-block"), data) : null; } catch (err) {
      if (window.console) console.warn("lately-depth: " + slot.getAttribute("data-block") + " not drawn:", err.message);
    }
    slot.hidden = !nodes;
    append(slot, nodes);
  }

  // ---------- headline numbers (the pages and the main panels) ----------

  function okStat(s) { return isObj(s) && s.status === "ok"; }
  function waiting(label, s) {
    return { label: label, value: "–", note: isObj(s) ? s.status : "not connected yet" };
  }

  // Two or three numbers per feed: [{label, value, note}].
  function headline(feed, a) {
    if (!isObj(a)) return [];
    var out = [];
    if (feed === "fantasy" && isObj(a.fantasy)) {
      list(a.fantasy.teams).slice(0, 3).forEach(function (t) {
        var s = t.playoff_odds;
        out.push(okStat(s) ? { label: "Playoff odds, " + t.name, value: pct(s.values.playoffs), note: "expected wins " + num(s.values.expected_wins, 1) }
          : waiting("Playoff odds, " + t.name, s));
      });
    } else if (feed === "watching" && isObj(a.watching) && isObj(a.watching.completion)) {
      ["show", "film", "anime"].forEach(function (k) {
        var s = a.watching.completion[k];
        out.push(okStat(s) ? { label: "Completion, " + nameOf(k).toLowerCase(), value: pct(s.value), note: s.values.finished + " finished, " + s.values.dropped + " dropped" }
          : waiting("Completion, " + nameOf(k).toLowerCase(), s));
      });
    } else if (feed === "listening" && isObj(a.listening)) {
      var l = a.listening, hl = l.album_half_life;
      var cur = okStat(hl) && isObj(hl.values.current) && hl.values.current.status === "ok" ? hl.values.current : null;
      out.push(cur ? { label: "Half-life, this week's album", value: num(cur.half_life_days, 1) + " days", note: cur.album + " by " + cur.artist }
        : waiting("Half-life, this week's album", hl));
      var d = l.discovery, last = okStat(d) ? list(d.values.months).slice(-1)[0] : null;
      out.push(last ? { label: "Plays by new artists", value: pct(last.share), note: monthText(last.month) } : waiting("Plays by new artists", d));
      var fr = l.first_repeat;
      out.push(okStat(fr) ? { label: "First repeat, median", value: hoursText(fr.values.median_hours), note: "from a new track's first play to its second" }
        : waiting("First repeat, median", fr));
    } else if (feed === "eating" && isObj(a.eating)) {
      var e = a.eating, sc = e.scores;
      out.push(okStat(sc) ? { label: "Median score", value: num(sc.values.overall.median, 2), note: "middle half " + num(sc.values.overall.q1, 2) + " to " + num(sc.values.overall.q3, 2) }
        : waiting("Median score", sc));
      var hb = e.home_bias;
      out.push(okStat(hb) ? { label: "Home against away", value: signed(hb.value, 2), note: "most-ranked city against elsewhere, same cuisine" }
        : waiting("Home against away", hb));
    } else if (feed === "lifting" && isObj(a.lifting)) {
      var lf = a.lifting, r = lf.body_weight_rate;
      out.push(okStat(r) ? { label: "Body weight since the cut", value: signed(r.value, 2) + " lb/wk",
        note: interval(r.interval, function (x) { return signed(x, 2); }) || "" } : waiting("Body weight since the cut", r));
      if (okStat(r) && isNum(r.values.latest)) out.push({ label: "Body weight, latest", value: num(r.values.latest, 1) + " lb", note: "from " + num(r.values.first, 1) + " lb" });
      // Strength kept joins once any lift's interval excludes zero.
      var kept = isObj(lf.strength_kept) ? Object.keys(lf.strength_kept).filter(function (k) {
        var s = lf.strength_kept[k];
        return okStat(s) && excludesZero(s.interval);
      }) : [];
      if (kept.length) {
        var ks = lf.strength_kept[kept[0]];
        out.push({ label: kept[0] + ": e1RM kept per lb lost", value: num(ks.value, 2), note: interval(ks.interval, function (x) { return num(x, 2); }) });
      }
    }
    // A number still waiting for data isn't shown as a "–" tile; the page's line counts it.
    return out.filter(function (i) { return i.note !== "not enough data yet"; }).slice(0, 3);
  }

  function headlineRow(items, cls) {
    return h("div", { class: "stats ld-stats" + (cls ? " " + cls : "") }, items.map(function (i) {
      return h("div", { class: "stat" }, h("div", { class: "stat-label" }, i.label), h("div", { class: "stat-value" }, i.value),
        i.note ? h("div", { class: "stat-note" }, i.note) : null);
    }));
  }

  // Not-enough-data box for a card or panel: the statistic's n of min_n, or "not in the
  // data yet" when the file predates the statistic. unit: what n counts.
  function waitBox(s, unit, extra) {
    if (!isObj(s)) return h("p", { class: "ld-wait" }, h("b", null, "not in the data yet"), " · appears once the pipeline publishes it");
    var text = " · " + (isNum(s.n) ? big(s.n) + " of " : "") + plural(s.min_n, unit) + " needed" + (extra ? " · " + extra : "");
    return h("p", { class: "ld-wait" }, h("b", null, String(s.status)), text);
  }

  window.LatelyDepth = { headline: headline, headlineRow: headlineRow, waitBox: waitBox, okStat: okStat,
    charts: { multiLine: multiLine, quadrant: quadrant, indexedLines: indexedLines, sTierBars: sTierBars, bars: bars, columns: columns },
    fmt: { num: num, signed: signed, pct: pct, big: big, plural: plural, dateText: dateText, monthText: monthText, record: record, interval: interval, hoursText: hoursText } };

  // ---------- the page ----------

  function draw(data, isSample) {
    var feed = document.body.getAttribute("data-feed");
    var a = isObj(data) ? data.analysis : null;
    var sample = document.querySelector(".ld-sample");
    if (sample) sample.hidden = !(isSample || (data && data.sample === true));
    var slots = document.querySelectorAll(".ld-stat");
    if (!isObj(a)) {
      // No analysis block: the feed blocks still draw; every statistic slot is hidden.
      document.querySelector(".ld-missing").hidden = false;
      document.querySelector(".ld-asof").hidden = true;
      Array.prototype.forEach.call(slots, function (s) { s.hidden = true; });
      Array.prototype.forEach.call(document.querySelectorAll(".ld-feed"), function (slot) { fillFeed(slot, data); });
      hideEmpty();
      return;
    }
    var asof = document.querySelector(".ld-asof-date");
    try { asof.textContent = dateText(a.as_of); asof.setAttribute("datetime", a.as_of); } catch (e) { asof.textContent = "unknown"; }
    var row = document.querySelector(".ld-headline");
    try { append(row, headlineRow(headline(feed, a))); } catch (e) { /* the sections still draw */ }
    var weekdays = isObj(a.cross) && isObj(a.cross.rhythm) && list(a.cross.rhythm.weekdays).length === 7 ? a.cross.rhythm.weekdays
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var ctx = { weekdays: weekdays, waiting: 0 };
    Array.prototype.forEach.call(slots, function (slot) { fillSlot(slot, a, ctx); });
    Array.prototype.forEach.call(document.querySelectorAll(".ld-feed"), function (slot) { fillFeed(slot, data); });
    hideEmpty();
    // A credit shown only while its source is in the file (analysis.meta.sources_included).
    var included = isObj(a.meta) ? list(a.meta.sources_included) : [];
    Array.prototype.forEach.call(document.querySelectorAll(".ld-attribution[data-when-source]"), function (p) {
      p.hidden = included.indexOf(p.getAttribute("data-when-source")) < 0;
    });
    var more = document.querySelector(".ld-waiting");
    if (more) {
      more.hidden = !ctx.waiting;
      more.textContent = ctx.waiting === 1 ? "1 more statistic appears as data accrues."
        : ctx.waiting + " more statistics appear as data accrues.";
    }
  }

  // A section whose every slot is hidden is hidden, with its contents entry; a group with
  // no open section is hidden too.
  function hideEmpty() {
    Array.prototype.forEach.call(document.querySelectorAll(".ld-section"), function (sec) {
      var open = Array.prototype.some.call(sec.querySelectorAll(".ld-stat, .ld-feed"), function (x) { return !x.hidden; });
      sec.hidden = !open;
      var link = document.querySelector('.ld-toc a[href="#' + sec.id + '"]');
      if (link) link.parentNode.hidden = !open;
    });
    Array.prototype.forEach.call(document.querySelectorAll(".ld-group"), function (g) {
      var open = Array.prototype.some.call(g.querySelectorAll(".ld-section"), function (s) { return !s.hidden; });
      g.hidden = !open;
      var entry = document.querySelector('.ld-toc-group[data-group="' + g.id + '"]');
      if (entry) entry.hidden = !open;
    });
  }

  function load(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(url + " " + res.status);
      return res.json();
    }).then(function (d) {
      if (!isObj(d) || d.schema_version !== 1) throw new Error(url + " has an unexpected shape");
      return d;
    });
  }

  function start() {
    if (!document.body.classList.contains("ld-body") || !window.fetch) return;
    var root = document.body.getAttribute("data-root") || "";
    load(root + "data/lately.json")
      .then(function (d) { draw(d, false); })
      .catch(function () {
        return load(root + "data/lately.sample.json").then(function (d) { draw(d, true); }).catch(function () { draw(null, false); });
      })
      .catch(function () { /* never break the page */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
