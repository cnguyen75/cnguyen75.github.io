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
      predictions: "prediction", seasons: "season", workouts: "workout", "weigh-ins": "weigh-in", "adds judged": "add judged" }[unit];
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
        // The file lists the best and worst three adds; each is marked in words and by a
        // filled or outlined triangle, never colour alone. Only players are named: the
        // team a dropped player went to is never shown.
        var rows = [], seen = {};
        [["best", list(v.best)], ["worst", list(v.worst)]].forEach(function (g) {
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
          return h("span", { class: "ld-mark ld-mark--" + m[0] }, h("span", { "aria-hidden": "true" }, m[0] === "best" ? "▲ " : "▽ "), m.join(" and "));
        }
        var counts = isObj(v.counts) ? v.counts : {};
        var t = h("div", { class: "data-table ld-table" },
          h("table", null,
            h("caption", { class: "ld-caption" }, "Adds, best and worst three marked"),
            h("thead", null, h("tr", null, ["Week", "Added", "Dropped", "Bid", "Class"].map(function (c, i) {
              return h("th", { scope: "col", class: i === 0 || i === 3 ? "num" : null }, c);
            }))),
            h("tbody", null, rows.map(function (r) {
              var a = r.add;
              return h("tr", null,
                h("td", { class: "num" }, String(a.week)),
                h("th", { scope: "row" }, a.added + (a.position ? " (" + a.position + ")" : ""), h("br"), mark(r.marks)),
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
        var l8 = isObj(v.last_8_weeks) ? v.last_8_weeks : null;
        return facts([["last 8 weeks", l8 ? (v.plateau ? "plateau" : l8.direction) + ", " + signed(l8.lb_per_month, 1) + " lb a month" : null],
          ["its interval", l8 ? interval(l8.interval, function (x) { return signed(x, 1); }) : null],
          ["sessions in those weeks", l8 ? String(l8.sessions) : null],
          ["sessions a week", isNum(v.sessions_per_week) ? num(v.sessions_per_week, 1) : null]]);
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
    "watching.tier_completion_pace": {
      n: "titles",
      draw: function (v) {
        return table("Completion and pace by tier", [{ label: "Tier" }, { label: "Finished", num: true }, { label: "Dropped", num: true },
          { label: "Completion", num: true }, { label: "Episodes a week", num: true }],
          list(v.tiers).map(function (t) {
            return [t.tier, String(t.finished), String(t.dropped), pct(t.completion), isNum(t.episodes_per_week) ? num(t.episodes_per_week, 1) : "–"];
          }));
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
      return [["home city", v.home_city], ["places at home", String(v.home_places)], ["places away", String(v.away_places)], ["cuisines in both", String(v.cuisines)]];
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
    "eating.top_ten_churn": { n: WEEKS, value: function (s) { return isNum(s.value) ? [num(s.value, 1), "places entering my top ten a week"] : null; } },
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
    if (spec.draw) append(block, spec.draw(v, s, { label: label, weekdays: ctx.weekdays, typeClass: TYPE_CLASS[entry.key] ? "fill--" + TYPE_CLASS[entry.key] : null }));
    else if (!val) block.appendChild(h("p", { class: "ld-note" }, "Computed, but this page doesn't draw it yet."));
    block.appendChild(h("p", { class: "ld-n" }, "n = " + plural(s.n, spec.n || "") +
      (s.as_of && s.as_of !== analysis.as_of ? " · as of " + dateText(s.as_of) : "")));
    return block;
  }

  // A slot names one or more statistics (space-separated paths, e.g. completion of
  // shows, films and anime); they share one row of blocks and their "how" lines.
  function fillSlot(slot, analysis, ctx) {
    var entries = [];
    slot.textContent = "";
    slot.getAttribute("data-stat").split(/\s+/).forEach(function (path) {
      var spec = STATS[path], leaf = leafLabel(path);
      if (!spec) return;
      expand(analysis, path).forEach(function (e) {
        if (leaf) e.label = leaf;
        e.spec = spec;
        e.path = path;
        entries.push(e);
      });
    });
    if (!entries.length) { slot.appendChild(h("p", { class: "panel-empty" }, NOT_CONNECTED)); return; }
    // One block, or blocks whose tables need the width: one to a row.
    var one = entries.length === 1 || entries.some(function (e) { return e.spec.wide; });
    var hows = [], grid = h("div", { class: "ld-blocks" + (one ? " ld-blocks--one" : "") });
    slot.appendChild(grid);
    entries.forEach(function (e) {
      var spec = e.spec, path = e.path;
      try {
        grid.appendChild(statBlock(e, spec, analysis, ctx));
        if (e.stat.status !== "not available from source" && e.stat.status !== "not configured" &&
            typeof e.stat.how === "string" && hows.indexOf(e.stat.how) < 0) hows.push(e.stat.how);
      } catch (err) {
        if (window.console) console.warn("lately-depth: " + path + " not drawn:", err.message);
        grid.appendChild(h("p", { class: "panel-empty" }, "Couldn't draw this statistic right now."));
      }
    });
    // The pipeline's "how" sentence, once per slot when every entry shares it.
    hows.forEach(function (t) { slot.appendChild(h("p", { class: "ld-how" }, h("span", { class: "ld-how-label" }, "how: "), t)); });
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
      out.push(okStat(hb) ? { label: "Home against away", value: signed(hb.value, 2), note: hb.values.home_city + ", same cuisine" }
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
    return out.slice(0, 3);
  }

  function headlineRow(items, cls) {
    return h("div", { class: "stats ld-stats" + (cls ? " " + cls : "") }, items.map(function (i) {
      return h("div", { class: "stat" }, h("div", { class: "stat-label" }, i.label), h("div", { class: "stat-value" }, i.value),
        i.note ? h("div", { class: "stat-note" }, i.note) : null);
    }));
  }

  window.LatelyDepth = { headline: headline, headlineRow: headlineRow };

  // ---------- the page ----------

  function draw(data, isSample) {
    var feed = document.body.getAttribute("data-feed");
    var a = isObj(data) ? data.analysis : null;
    var sample = document.querySelector(".ld-sample");
    if (sample) sample.hidden = !(isSample || (data && data.sample === true));
    var slots = document.querySelectorAll(".ld-stat");
    if (!isObj(a)) {
      document.querySelector(".ld-missing").hidden = false;
      document.querySelector(".ld-asof").hidden = true;
      Array.prototype.forEach.call(document.querySelectorAll(".ld-section, .ld-toc"), function (s) { s.hidden = true; });
      return;
    }
    var asof = document.querySelector(".ld-asof-date");
    try { asof.textContent = dateText(a.as_of); asof.setAttribute("datetime", a.as_of); } catch (e) { asof.textContent = "unknown"; }
    var row = document.querySelector(".ld-headline");
    try { append(row, headlineRow(headline(feed, a))); } catch (e) { /* the sections still draw */ }
    var weekdays = isObj(a.cross) && isObj(a.cross.rhythm) && list(a.cross.rhythm.weekdays).length === 7 ? a.cross.rhythm.weekdays
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    Array.prototype.forEach.call(slots, function (slot) { fillSlot(slot, a, { weekdays: weekdays }); });
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
