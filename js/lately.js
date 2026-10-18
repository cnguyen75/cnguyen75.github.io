/*
 * Side D, lately. Draws the main page's five panels from data/lately.json, falling
 * back to data/lately.sample.json, and the feed blocks (lineup grid, recent lists,
 * lift tiles, rankings...) that the lately/<feed>/ pages hold under "What's happening",
 * through window.LatelyFeed.block(name, data). Nothing here may break the rest of the
 * page: every failure ends in a "not connected yet" panel, never a throw.
 * Schema: data/lately.schema.json. Charts and number formats shared with the pages
 * come from js/lately-depth.js (window.LatelyDepth).
 */
(function () {
  "use strict";

  var LIVE_URL = "data/lately.json";
  var SAMPLE_URL = "data/lately.sample.json";
  var TZ = "America/Los_Angeles";
  var NOT_CONNECTED = "Not connected yet.";
  var BROKEN = "Couldn't draw this panel right now.";
  var NO_CHANCE = "not available this week";
  var MAX_CUISINES = 6; // named bars; anything beyond goes in the "Other" line
  var MIN_CUISINE_PLACES = 15; // a cuisine's median is compared with the overall median from this many places
  var ENRICHMENT = ["tmdb", "omdb"]; // sources with section "enrichment", by name until the pipeline writes the section

  // ---------- small helpers ----------

  // h("div", {class: "x", title: "y"}, child, "text", [more])
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
    // A link to another site opens in a new tab; links within the site stay put.
    if (tag === "a" && /^https?:\/\//.test(el.getAttribute("href") || "")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
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
  function need(cond, what) { if (!cond) throw new Error("lately: bad " + what); }
  function num(v, what) { need(isNum(v), what); return v; }
  function str(v, what) { need(typeof v === "string", what); return v; }
  function arr(v, what) { need(Array.isArray(v), what); return v; }
  function list(v) { return Array.isArray(v) ? v : []; }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  // 31 -> "31", 38.4 -> "38.4", 12.25 -> "12.3"
  function short(n) { return String(Math.round(n * 10) / 10); }
  function signed(n) { return (n > 0 ? "+" : "") + n.toFixed(1); }
  function pct(n, max) { return max > 0 ? (n / max) * 100 + "%" : "0%"; }
  function record(w, l, t) { return w + "–" + l + (t ? "–" + t : ""); }

  function parseTime(s) {
    if (typeof s !== "string") return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmt(d, opts) {
    try {
      return new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: TZ }, opts)).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  }
  function clock(d) { return fmt(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  function weekday(d) { return fmt(d, { weekday: "short" }).toLowerCase(); }
  function day(d) { return fmt(d, { day: "numeric", month: "short" }); }

  function safeUrl(u) {
    return typeof u === "string" && /^https:\/\//i.test(u) ? u : null;
  }

  // The shared chart kit and number formats (js/lately-depth.js), when it loaded.
  function LD() { return isObj(window.LatelyDepth) ? window.LatelyDepth : null; }
  function F() { var d = LD(); return d && d.fmt ? d.fmt : null; }
  // Formats with a real minus sign and the data's precision, falling back to the local ones.
  function fnum(x, dp) { var f = F(); return f ? f.num(x, dp) : (dp === undefined ? String(x) : x.toFixed(dp)); }
  function fsigned(x, dp) { var f = F(); return f ? f.signed(x, dp) : (x > 0 ? "+" : "") + (dp === undefined ? String(x) : x.toFixed(dp)); }
  function fpct(x) { var f = F(); return f ? f.pct(x) : Math.round(x * 100) + "%"; }
  function okStat(s) { return isObj(s) && s.status === "ok"; }
  function analysisOf(data) { return isObj(data) && isObj(data.analysis) ? data.analysis : null; }

  // ---------- source status ----------

  function sourceOf(data, key) {
    var s = data && isObj(data.sources) ? data.sources[key] : null;
    return isObj(s) ? s : null;
  }
  function isOk(src) { return !!src && src.status === "ok"; }

  // What a panel or team should do given its source:
  //   {show: true}                       fresh data
  //   {show: true, asOf: Date}           not ok, showing last good data
  //   {show: false}                      nothing good to show
  function sourceState(src, hasData) {
    if (!hasData || !src) return { show: false };
    if (isOk(src)) return { show: true };
    var lastOk = parseTime(src.last_ok_at);
    return lastOk ? { show: true, asOf: lastOk } : { show: false };
  }
  function staleNote(asOf) {
    return h("p", { class: "panel-note" }, "last good data from " + day(asOf) + ", " + clock(asOf));
  }

  function chipText(src, key) {
    var label = typeof src.label === "string" && src.label ? src.label : key;
    if (!isOk(src)) return label + " · " + (typeof src.message === "string" && src.message ? src.message : String(src.status || "unknown"));
    var at = parseTime(src.updated_at) || parseTime(src.last_ok_at);
    if (!at) return label + " · ok";
    return src.schedule === "weekly"
      ? label + " · weekly · " + weekday(at) + " " + clock(at)
      : label + " · ok · " + clock(at);
  }

  function renderChips(data) {
    var list = document.getElementById("lately-sources");
    if (!list) return;
    list.textContent = "";
    if (!data || !isObj(data.sources)) return;
    Object.keys(data.sources).forEach(function (key) {
      var src = data.sources[key];
      if (!isObj(src)) return;
      // Enrichment sources (film credits and scores) are credited in the footer, not shown as feeds.
      if (src.section === "enrichment" || ENRICHMENT.indexOf(key) >= 0) return;
      list.appendChild(h("li", { class: "chip" },
        h("span", { class: "chip-dot", "aria-hidden": "true" }),
        chipText(src, key)));
    });
  }

  // ---------- "view as table" ----------

  var uid = 0;
  // Wires a toggle button to swap `chart` (an element or list of elements)
  // with a table built from `columns` and `rows`.
  function tableToggle(caption, columns, rows, chart) {
    var id = "lately-table-" + ++uid;
    var charts = Array.isArray(chart) ? chart : [chart];
    var table = h("div", { class: "data-table", id: id, hidden: true },
      h("table", null,
        h("caption", { class: "sr-only" }, caption),
        h("thead", null, h("tr", null, columns.map(function (c) {
          return h("th", { scope: "col", class: c.num ? "num" : null }, c.label);
        }))),
        h("tbody", null, rows.map(function (r) {
          return h("tr", null, r.map(function (cell, i) {
            return i === 0
              ? h("th", { scope: "row" }, cell)
              : h("td", { class: columns[i].num ? "num" : null }, cell);
          }));
        }))));
    var button = h("button", { type: "button", class: "table-toggle", "aria-controls": id, "aria-expanded": "false" }, "view as table");
    button.addEventListener("click", function () {
      var showTable = table.hidden;
      table.hidden = !showTable;
      charts.forEach(function (c) { c.hidden = showTable; });
      button.setAttribute("aria-expanded", String(showTable));
      button.textContent = showTable ? "view as chart" : "view as table";
    });
    return { button: button, table: table };
  }

  // A horizontal bar list with a title, as used for players, artists and cuisines.
  function barChart(opts) {
    var items = opts.items;
    var values = items.map(function (i) { return i.value; });
    var max = Math.max.apply(null, values.concat(0));
    var min = Math.min.apply(null, values.concat(0));
    var span = max - min;
    var zero = span > 0 ? (-min / span) * 100 : 0; // % from the left where 0 sits
    function fill(v) {
      if (min >= 0) return h("div", { class: "bar-fill", style: { width: pct(v, max) } });
      var w = span > 0 ? (Math.abs(v) / span) * 100 : 0;
      return [
        h("div", { class: "bar-zero", "aria-hidden": "true", style: { left: zero + "%" } }),
        h("div", { class: "bar-fill " + (v < 0 ? "bar-fill--neg" : "bar-fill--pos"),
          style: { left: (v < 0 ? zero - w : zero) + "%", width: w + "%" } })
      ];
    }
    var summary = items.map(function (i) { return i.label + " " + opts.text(i.value); }).join("; ");
    var list = h("div", { class: "bar-list" + (opts.wide ? " bar-list--wide" : ""), role: "img", "aria-label": opts.title + ": " + summary },
      items.map(function (i) {
        return h("div", { class: "bar-row", title: i.label + ": " + opts.text(i.value) },
          h("div", { class: "bar-label" }, i.label),
          h("div", { class: "bar-track" + (min < 0 ? " bar-track--diverging" : "") }, fill(i.value)),
          h("div", { class: "bar-value" }, short(i.value)));
      }));
    var t = tableToggle(opts.title, [{ label: opts.labelHeading }, { label: opts.valueHeading, num: true }],
      items.map(function (i) { return [i.label, short(i.value)]; }), list);
    return h("div", { class: "chart-block" },
      h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, opts.title), t.button),
      list, t.table, opts.after || null);
  }

  function stat(label, value, note) {
    return h("div", { class: "stat" },
      h("div", { class: "stat-label" }, label),
      h("div", { class: "stat-value" }, value),
      note ? h("div", { class: "stat-note" }, note) : null);
  }

  // ---------- feed blocks: fantasy ----------

  // Text shown in place of a null win chance: the team's note, or a default.
  function winNote(t) {
    var n = t.win_probability_note;
    return typeof n === "string" && n.trim() ? n.trim() : NO_CHANCE;
  }

  // The teams with their source state; the panel's heading and source line are set when
  // the page has them (the main page), so a feed page can call this too.
  function fantasyTeams(data) {
    var f = data.fantasy;
    need(isObj(f), "fantasy");
    var week = num(f.week, "fantasy.week");
    var teams = arr(f.teams, "fantasy.teams");
    var srcKeys = arr(f.sources, "fantasy.sources");
    var shown = teams.map(function (t) {
      need(isObj(t), "team");
      return { team: t, src: sourceOf(data, t.source), state: sourceState(sourceOf(data, t.source), true) };
    });
    var ft = document.getElementById("fantasy-title");
    if (ft) (ft.querySelector("a") || ft).textContent = "Fantasy football, week " + week;
    var meta = document.getElementById("fantasy-meta");
    // Header names only sources with at least one team drawn from them.
    if (meta) meta.textContent = srcKeys.filter(function (k) {
      return shown.some(function (s) { return s.team.source === k && s.state.show; });
    }).map(function (k) {
      var s = sourceOf(data, k);
      return s && s.label ? s.label : k;
    }).join(" + ");
    return { f: f, week: week, teams: teams, shown: shown, any: shown.some(function (s) { return s.state.show; }) };
  }

  function fantasyStale(shown) {
    var stale = shown.filter(function (s) { return s.state.show && s.state.asOf; });
    if (!stale.length) return null;
    var oldest = stale.reduce(function (a, s) { return s.state.asOf < a ? s.state.asOf : a; }, stale[0].state.asOf);
    return staleNote(oldest);
  }

  // My teams, week by week: record, results, luck and this week's win chance, with its table.
  function fantasyLineup(data) {
    var ctx = fantasyTeams(data);
    if (!ctx.any) return null;
    var week = ctx.week, teams = ctx.teams, shown = ctx.shown;
    var played = week - 1;
    var weeksLabel = played > 1 ? "Weeks 1 to " + played : "Week 1";
    var luckMax = Math.max(2, Math.max.apply(null, teams.map(function (t) { return Math.abs(t.luck) || 0; })));

    var rows = shown.map(function (s) {
      var t = s.team;
      var name = str(t.name, "team.name");
      var srcLabel = s.src && s.src.label ? s.src.label : String(t.source);
      var platform = [srcLabel, t.league_label, isOk(s.src) ? null : (s.src && (s.src.message || s.src.status)) || "unknown"]
        .filter(Boolean).join(" · ");
      var repeats = platform === srcLabel && new RegExp("(^|\\W)" + srcLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\W|$)", "i").test(name);
      var nameCell = h("div", null, h("div", { class: "team-name" }, name), repeats ? null : h("div", { class: "team-platform" }, platform));
      if (!s.state.show) return h("div", { class: "team-row" }, nameCell, h("div", { class: "team-missing" }, NOT_CONNECTED));

      var results = arr(t.results, "team.results");
      var words = { W: "win", L: "loss", T: "tie" };
      var luck = num(t.luck, "team.luck");
      var p = t.win_probability === null ? null : num(t.win_probability, "team.win_probability");
      var luckText = name + ": " + signed(luck) + " wins versus expected";
      var chance = p === null ? null : Math.round(p * 100);
      var chanceNote = p === null ? winNote(t) : null;
      var chanceText = p === null
        ? name + ", win chance for week " + week + ": " + chanceNote
        : name + ": " + chance + "% to win week " + week;
      var half = Math.min(Math.abs(luck) / luckMax, 1) * 50;

      return h("div", { class: "team-row" },
        nameCell,
        h("div", { class: "team-record" }, record(num(t.wins, "w"), num(t.losses, "l"), t.ties || 0)),
        h("div", { class: "results", role: "img", "aria-label": name + ", " + weeksLabel.toLowerCase() + ": " + results.map(function (r) { return words[r] || r; }).join(", ") },
          results.map(function (r, i) {
            return h("span", { class: "result" + (r === "W" ? " result--win" : ""), title: "Week " + (i + 1) + ": " + (words[r] || r) }, r);
          })),
        h("div", { class: "meter", title: luckText },
          h("div", { class: "luck-track", role: "img", "aria-label": luckText },
            h("div", { class: "luck-zero", "aria-hidden": "true" }),
            h("div", { class: "luck-bar " + (luck < 0 ? "luck-bar--neg" : "luck-bar--pos"), style: { left: (luck < 0 ? 50 - half : 50) + "%", width: half + "%" } })),
          h("div", { class: "meter-value" }, signed(luck))),
        chance === null
          ? h("div", { class: "meter-note", title: chanceText }, chanceNote)
          : h("div", { class: "meter", title: chanceText },
              h("div", { class: "chance-track", role: "img", "aria-label": chanceText },
                h("div", { class: "chance-bar", style: { width: chance + "%" } })),
              h("div", { class: "meter-value" }, chance + "%")));
    });

    var grid = h("div", { class: "scroll-x", tabindex: "0", role: "region", "aria-label": "Fantasy teams, scrolls sideways" },
      h("div", { class: "teams" },
        h("div", { class: "teams-head", "aria-hidden": "true" },
          h("div", null, "Team"), h("div", null, "Record"), h("div", null, weeksLabel),
          h("div", null, "Luck (wins vs expected)"), h("div", null, "Win chance, week " + week)),
        rows));

    var tableRows = shown.map(function (s) {
      var t = s.team;
      var srcLabel = s.src && s.src.label ? s.src.label : String(t.source);
      if (!s.state.show) return [t.name, srcLabel, NOT_CONNECTED, "", "", ""];
      return [t.name, [srcLabel, t.league_label].filter(Boolean).join(" · "), record(t.wins, t.losses, t.ties || 0),
        t.results.join(" "), signed(t.luck), t.win_probability === null ? winNote(t) : Math.round(t.win_probability * 100) + "%"];
    });
    var t = tableToggle("Fantasy teams, week " + week,
      [{ label: "Team" }, { label: "Platform" }, { label: "Record" }, { label: weeksLabel }, { label: "Luck", num: true }, { label: "Win chance", num: true }],
      tableRows, grid);
    return [fantasyStale(shown), h("div", { class: "chart-block" }, h("div", { class: "chart-head chart-head--end" }, t.button), grid, t.table)];
  }

  // Who is carrying my teams: points above replacement per game.
  function fantasyCarry(data) {
    var ctx = fantasyTeams(data);
    if (!ctx.any) return null;
    var players = arr(ctx.f.top_players, "fantasy.top_players");
    if (!players.length) return null;
    return barChart({
      title: "Who is carrying my teams: points above replacement, per game",
      wide: true,
      labelHeading: "Player",
      valueHeading: "Points above replacement, per game",
      items: players.map(function (p) { return { label: str(p.name, "player"), value: num(p.points_above_replacement, "par") }; }),
      text: function (v) { return short(v) + " points above replacement per game"; }
    });
  }

  // ---------- feed blocks: watching ----------

  function watchingState(data) {
    var w = data.watching;
    need(isObj(w), "watching");
    return { w: w, state: sourceState(sourceOf(data, w.source), true) };
  }

  function legendItem(cls, label) {
    return h("span", { class: "legend-item" }, h("span", { class: "legend-swatch " + cls, "aria-hidden": "true" }), label);
  }

  // Hours watched a week as stacked bars, and what I'm watching now.
  function watchingHours(data) {
    var ws = watchingState(data), w = ws.w, state = ws.state;
    if (!state.show) return null;
    var weeks = arr(w.weeks, "watching.weeks");
    need(weeks.length > 0, "watching.weeks");
    var n = weeks.length;
    var totals = weeks.map(function (wk) {
      need(isObj(wk), "week");
      return num(wk.films, "films") + num(wk.shows, "shows") + num(wk.anime, "anime");
    });
    var totalHours = totals.reduce(function (a, b) { return a + b; }, 0);
    var maxTotal = Math.max.apply(null, totals.concat(1));
    var pxPerHour = Math.min(14, 142 / maxTotal); // 150px plot, minus the 2px gaps
    function weekText(wk, i) {
      return "Week " + (i + 1) + ": films " + short(wk.films) + "h, shows " + short(wk.shows) + "h, anime " + short(wk.anime) + "h";
    }
    var chart = h("div", { class: "stack-chart", role: "img",
      "aria-label": "Stacked bars of weekly hours watched over the last " + n + " weeks, oldest first, split into films, shows and anime. " + weeks.map(weekText).join(". ") },
      weeks.map(function (wk, i) {
        return h("div", { class: "stack", title: weekText(wk, i) },
          h("div", { class: "seg--anime", style: { height: wk.anime * pxPerHour + "px" } }),
          h("div", { class: "seg--shows", style: { height: wk.shows * pxPerHour + "px" } }),
          h("div", { class: "seg--films", style: { height: wk.films * pxPerHour + "px" } }));
      }));
    var axis = h("div", { class: "axis-labels", "aria-hidden": "true" }, h("span", null, n + " weeks ago"), h("span", null, "this week"));
    var figure = h("div", { class: "chart-figure" }, chart, axis);
    var t = tableToggle("Hours watched per week, last " + n + " weeks",
      [{ label: "Week" }, { label: "Films", num: true }, { label: "Shows", num: true }, { label: "Anime", num: true }],
      weeks.map(function (wk, i) {
        var ago = n - 1 - i;
        return [ago === 0 ? "this week" : plural(ago, "week ago", "weeks ago"), short(wk.films), short(wk.shows), short(wk.anime)];
      }), figure);
    var empty = totalHours === 0;
    var recent = list(w.recent);
    // "Nothing logged" only when nothing is: no hours, nothing in progress, nothing recent.
    var logged = recent.length > 0 || (Array.isArray(w.currently_watching) && w.currently_watching.length > 0);
    return [
      state.asOf ? staleNote(state.asOf) : null,
      empty ? null : stat("Hours watched, last " + n + " weeks", short(totalHours)),
      empty && !logged ? h("p", { class: "panel-empty" }, "No episodes or films logged in the last " + n + " weeks") : null,
      empty ? null : h("div", { class: "legend" }, legendItem("fill--films", "Films"), legendItem("fill--shows", "Shows"), legendItem("fill--anime", "Anime"), t.button),
      empty ? null : figure,
      empty ? null : t.table,
      watchingNow(w.currently_watching)
    ];
  }

  // Recently: finished and watched titles.
  function watchingRecent(data) {
    var ws = watchingState(data), w = ws.w, state = ws.state;
    if (!state.show) return null;
    // "finished" items (bulk-completed on Simkl) always list after watched ones;
    // a missing status counts as watched. The sort is stable within each group.
    var recent = arr(w.recent, "watching.recent").map(function (r, i) {
      need(isObj(r), "recent item");
      return { item: r, finished: r.status === "finished", i: i };
    }).sort(function (a, b) { return (a.finished - b.finished) || (a.i - b.i); });
    if (!recent.length) return null;
    var types = { film: "film", show: "show", anime: "anime" };
    // With no ratings at all, drop the score column instead of leaving a gap.
    var hasRatings = recent.some(function (e) { return typeof e.item.rating === "number"; });
    return h("div", { class: "list" },
      h("div", { class: "list-title" }, "Recently"),
      h("ul", { class: "list-items" }, recent.map(function (entry) {
        var r = entry.item;
        var type = types[r.type] || "film";
        var title = str(r.title, "title") + (!entry.finished && typeof r.season === "number" ? ", season " + r.season : "");
        var url = safeUrl(r.url);
        return h("li", { class: "list-item" },
          h("span", { class: "swatch fill--" + type, "aria-hidden": "true" }),
          h("span", { class: "item-name" }, url ? h("a", { href: url }, title) : title,
            entry.finished ? [" ", h("span", { class: "item-status" }, "finished")] : null),
          h("span", { class: "item-meta" }, type),
          typeof r.rating === "number"
            ? h("span", { class: "item-score", title: "Rated " + short(r.rating) + " out of 10" },
                h("span", { class: "sr-only" }, "rated "), short(r.rating), h("span", { class: "sr-only" }, " out of 10"))
            : hasRatings ? h("span", { class: "item-score" }) : null);
      })));
  }

  // Optional extras below are lenient: a malformed entry is skipped, and a
  // missing or empty field hides its block, without failing the panel.
  function titled(it) { return isObj(it) && typeof it.title === "string" && it.title !== ""; }
  function titleLink(it) {
    var url = safeUrl(it.url);
    return url ? h("a", { href: url }, it.title) : it.title;
  }

  // "S2 · E5", "E5" or "S2"; null when neither is known.
  function progress(c) {
    var s = typeof c.season === "number", e = typeof c.episode === "number";
    if (!s && !e) return null;
    var short = [s ? "S" + c.season : null, e ? "E" + c.episode : null].filter(Boolean).join(" · ");
    var long = [s ? "season " + c.season : null, e ? "episode " + c.episode : null].filter(Boolean).join(", ");
    return h("span", { class: "item-meta", title: long.charAt(0).toUpperCase() + long.slice(1) },
      h("span", { "aria-hidden": "true" }, short), h("span", { class: "sr-only" }, long));
  }

  function watchingNow(list) {
    var items = Array.isArray(list) ? list.filter(titled) : [];
    if (!items.length) return null;
    return h("div", { class: "list" },
      h("div", { class: "list-title" }, "Watching now"),
      h("ul", { class: "list-items" }, items.map(function (c) {
        var type = c.type === "anime" ? "anime" : "show";
        return h("li", { class: "list-item" },
          h("span", { class: "swatch fill--" + type, "aria-hidden": "true" }),
          h("span", { class: "item-name" }, titleLink(c)),
          progress(c));
      })));
  }

  // My rankings: Films, Shows and Anime, the first five with a toggle for the rest.
  var RANKINGS = [["films", "Films"], ["shows", "Shows"], ["anime", "Anime"]];
  var RANK_SHOWN = 5, RANK_MAX = 10;
  var NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  function ranking(g) {
    var listId = "lately-ranking-" + g.key;
    var list = h("ol", { class: "list-items list-items--numbered", id: listId, "aria-label": "My top " + g.label.toLowerCase() },
      g.items.map(function (it, i) {
        return h("li", { class: "list-item", hidden: i >= RANK_SHOWN },
          h("span", { class: "item-rank", "aria-hidden": "true" }, i + 1),
          h("span", { class: "item-name" }, titleLink(it)),
          typeof it.year === "number" ? h("span", { class: "item-meta" }, it.year) : null);
      }));
    var button = null;
    if (g.items.length > RANK_SHOWN) {
      var more = "show all " + NUMBER_WORDS[g.items.length], less = "show top " + NUMBER_WORDS[RANK_SHOWN];
      button = h("button", { type: "button", class: "table-toggle ranking-more", "aria-controls": listId, "aria-expanded": "false" }, more);
      button.addEventListener("click", function () {
        var open = button.getAttribute("aria-expanded") !== "true";
        Array.prototype.forEach.call(list.children, function (li, i) { if (i >= RANK_SHOWN) li.hidden = !open; });
        button.setAttribute("aria-expanded", String(open));
        button.textContent = open ? less : more;
      });
    }
    return h("div", { class: "ranking" },
      h("div", { class: "ranking-head" }, h("span", { class: "legend-swatch fill--" + g.key, "aria-hidden": "true" }), g.label),
      list, button);
  }

  function watchingRankings(data) {
    var w = data.watching;
    if (!isObj(w) || !isObj(w.rankings)) return null;
    var state = sourceState(sourceOf(data, w.source), true);
    if (!state.show) return null;
    var r = w.rankings;
    var groups = RANKINGS.map(function (g) {
      return { key: g[0], label: g[1], items: Array.isArray(r[g[0]]) ? r[g[0]].filter(titled).slice(0, RANK_MAX) : [] };
    }).filter(function (g) { return g.items.length; });
    if (!groups.length) return null;
    return [state.asOf ? staleNote(state.asOf) : null, h("div", { class: "rankings" }, groups.map(ranking))];
  }

  // ---------- feed blocks: listening ----------

  // Bins plays into the blue scale from the reference. Any hour with a play
  // starts at the second shade (heat-2), so it is clearly different from zero.
  function heatLevel(v, max) {
    if (max <= 0 || v <= 0) return 0;
    var r = v / max;
    if (r >= 1) return 5;
    if (r >= 0.8) return 4;
    if (r >= 0.6) return 3;
    return 2;
  }

  // The listening window's label: "last 30 days", or "since 11 Oct" while the archive is
  // younger than that. The archive's age comes from the analysis: the heatmap statistic
  // counts days since the first play (n, in days, up to its as_of date).
  function listeningWindow(data) {
    var a = isObj(data.analysis) && isObj(data.analysis.listening) ? data.analysis.listening.heatmap : null;
    if (!isObj(a) || typeof a.n !== "number" || a.n >= 30 || typeof a.as_of !== "string") return "last 30 days";
    var end = new Date(a.as_of + "T00:00:00Z");
    if (isNaN(end.getTime()) || a.n < 1) return "last 30 days";
    return "since " + dateText(new Date(end.getTime() - (a.n - 1) * 86400000));
  }
  // The archive's first and last day, from the same statistic, or null.
  function listeningRange(data) {
    var a = isObj(data.analysis) && isObj(data.analysis.listening) ? data.analysis.listening.heatmap : null;
    if (!isObj(a) || !isNum(a.n) || a.n < 1 || typeof a.as_of !== "string") return null;
    var end = new Date(a.as_of + "T00:00:00Z");
    if (isNaN(end.getTime())) return null;
    return { days: a.n, from: dateText(new Date(end.getTime() - (a.n - 1) * 86400000)), to: dateText(end) };
  }

  // "last 30 days" -> " in the last 30 days"; "since 11 Oct" -> " since 11 Oct".
  function windowText(win) { return /^since /.test(win) ? " " + win : " in the " + win; }

  function listeningBasics(data) {
    var l = data.listening;
    need(isObj(l), "listening");
    var state = sourceState(sourceOf(data, l.source), true);
    var hours = arr(l.plays_by_hour, "plays_by_hour");
    need(hours.length === 24, "plays_by_hour length");
    hours.forEach(function (v) { num(v, "hour"); });
    return { l: l, state: state, hours: hours, plays: hours.reduce(function (a, b) { return a + b; }, 0), win: listeningWindow(data) };
  }

  // Plays, top artists and the by-hour strip for the window.
  function listeningRecent(data) {
    var b = listeningBasics(data);
    if (!b.state.show) return null;
    var artists = arr(b.l.top_artists, "top_artists");
    var hours = b.hours, max = Math.max.apply(null, hours), win = b.win;
    function hourText(v, i) { return i + ":00, " + plural(v, "play", "plays"); }
    var strip = h("div", { class: "heat", role: "img",
      "aria-label": "Plays by hour of day, " + win + ": a strip of 24 cells, darker where more songs are played. " + hours.map(hourText).join("; ") },
      hours.map(function (v, i) { return h("div", { class: "heat-cell heat-" + heatLevel(v, max), title: hourText(v, i) }); }));
    var axis = h("div", { class: "axis-labels", "aria-hidden": "true" }, h("span", null, "midnight"), h("span", null, "noon"), h("span", null, "11pm"));
    var t = tableToggle("Plays by hour of day, " + win,
      [{ label: "Hour" }, { label: "Plays", num: true }],
      hours.map(function (v, i) { return [i + ":00", String(v)]; }), [strip, axis]);
    return [
      b.state.asOf ? staleNote(b.state.asOf) : null,
      stat("Plays, " + win, String(b.plays)),
      barChart({
        title: "Top artists, " + win,
        labelHeading: "Artist",
        valueHeading: "Plays",
        items: artists.map(function (a) { return { label: str(a.name, "artist"), value: num(a.plays, "plays") }; }),
        text: function (v) { return plural(v, "play", "plays"); }
      }),
      h("div", { class: "chart-block chart-block--hours" },
        h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, "When I listen, by hour of day, " + win), t.button),
        strip, axis, t.table)
    ];
  }

  // ---------- feed blocks: eating ----------

  // Splits cuisines into at most `max` named bars and an "Other" remainder.
  // otherCount is how many cuisines the remainder covers, or null when the
  // data already lumped some into an "Other" entry and the count is unknown.
  function splitOther(items, max) {
    var isOther = function (i) { return /^other$/i.test(i.label); };
    var named = items.filter(function (i) { return !isOther(i); });
    var lumped = items.filter(isOther);
    if (named.length > max) named = named.slice().sort(function (a, b) { return b.value - a.value; });
    var folded = named.slice(max);
    var sum = function (list) { return list.reduce(function (s, i) { return s + i.value; }, 0); };
    return {
      bars: named.slice(0, max),
      otherTotal: sum(folded) + sum(lumped),
      otherCount: lumped.length ? null : folded.length
    };
  }
  function otherLine(split) {
    if (!split.otherTotal) return null;
    var text = split.otherCount === null
      ? "Other: " + split.otherTotal
      : "plus " + split.otherTotal + " across " + plural(split.otherCount, "other cuisine", "other cuisines");
    return h("p", { class: "chart-foot" }, text);
  }

  // Restaurants ranked, recently tried (alphabetical, no cities) and what I rank most.
  function eatingRecent(data) {
    var e = data.eating;
    need(isObj(e), "eating");
    var state = sourceState(sourceOf(data, e.source), true);
    if (!state.show) return null;
    // Shown in alphabetical order, without cities, so the list carries no date information
    // (the file lists them newest first). Cities stay in the depth page's score-by-city.
    var recent = arr(e.recent, "eating.recent").slice().sort(function (a, b) {
      return String(a && a.name).localeCompare(String(b && b.name), "en", { sensitivity: "base" });
    });
    var cuisines = splitOther(arr(e.cuisines, "eating.cuisines").map(function (c) {
      need(isObj(c), "cuisine");
      return { label: str(c.name, "cuisine"), value: num(c.count, "count") };
    }), MAX_CUISINES);
    return [
      state.asOf ? staleNote(state.asOf) : null,
      stat("Restaurants ranked", String(num(e.ranked_count, "ranked_count"))),
      h("div", { class: "list" },
        h("div", { class: "list-title" }, "Recently tried"),
        h("ul", { class: "list-items list-items--places" }, recent.map(function (r) {
          need(isObj(r), "restaurant");
          return h("li", { class: "list-item" },
            h("span", { class: "item-name" }, str(r.name, "restaurant name")),
            h("span", { class: "item-score item-score--wide" }, num(r.score, "score").toFixed(2)));
        }))),
      barChart({
        title: "What I rank most",
        labelHeading: "Cuisine",
        valueHeading: "Places",
        items: cuisines.bars,
        after: otherLine(cuisines),
        text: function (v) { return plural(v, "place", "places"); }
      })
    ];
  }

  // ---------- feed blocks: lifting ----------

  var MAX_MUSCLES = 8; // named bars; the rest are summed into one "Other" bar
  var MAX_PRS = 5;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MIN_TREND_SESSIONS = 3; // fewer than this shows "n sessions so far" instead of a line
  var EPLEY_NOTE = "Estimated with the Epley formula from sets of 1 to 10 reps. Machine and cable lifts are not comparable with barbell lifts.";

  // Calendar dates (YYYY-MM-DD, already Pacific) are read as UTC midnight so
  // no time zone can move them to another day.
  function calDate(s, what) {
    need(typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s), what);
    var d = new Date(s + "T00:00:00Z");
    need(!isNaN(d.getTime()), what);
    return d;
  }
  function dateText(d, withYear) {
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + (withYear ? " " + d.getUTCFullYear() : "");
  }
  function dayNumber(d) { return d.getTime() / 864e5; }
  function thousands(n) { return Math.round(n).toLocaleString("en-US"); }
  // "upper_back" -> "Upper back"
  function muscleName(s) {
    var t = String(s).replace(/_/g, " ").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, String(attrs[k])); });
    return el;
  }

  // A small line chart over time: points [{date: Date, value, title}], oldest
  // first. The line is SVG stretched to the box; dots and the end label are
  // HTML placed in percentages, so they keep their shape at any width.
  // opts: {label (aria), endText, dots (mark every point), height}
  function lineChart(points, opts) {
    var xs = points.map(function (p) { return dayNumber(p.date); });
    var ys = points.map(function (p) { return p.value; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    var pad = hi > lo ? (hi - lo) * 0.12 : Math.max(hi * 0.05, 1);
    lo -= pad; hi += pad;
    function x(i) { return x1 > x0 ? ((xs[i] - x0) / (x1 - x0)) * 100 : 100; }
    function y(i) { return (1 - (ys[i] - lo) / (hi - lo)) * 100; }

    var plot = h("div", { class: "line-plot" });
    if (points.length > 1) {
      var line = svg("svg", { class: "line-svg", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
      line.appendChild(svg("polyline", {
        points: points.map(function (p, i) { return x(i).toFixed(3) + "," + y(i).toFixed(3); }).join(" "),
        "vector-effect": "non-scaling-stroke"
      }));
      plot.appendChild(line);
    }
    points.forEach(function (p, i) {
      var last = i === points.length - 1;
      if (!last && !opts.dots) return;
      plot.appendChild(h("span", { class: "line-dot" + (last ? " line-dot--last" : ""), title: p.title,
        style: { left: x(i) + "%", top: y(i) + "%" } }));
    });
    var end = Math.min(Math.max(y(points.length - 1), 10), 90);
    return h("div", { class: "line-chart", role: "img", "aria-label": opts.label, style: { height: (opts.height || 64) + "px" } },
      h("div", { class: "line-area" }, plot),
      h("div", { class: "line-end", style: { width: (opts.endText.length * 0.62 + 0.4) + "em" } },
        h("span", { class: "line-end-label", style: { top: end + "%" } }, opts.endText)));
  }

  function axisDates(first, last) {
    var withYear = first.getUTCFullYear() !== last.getUTCFullYear();
    var same = first.getTime() === last.getTime(); // one point: one date, under it
    return h("div", { class: "axis-labels", "aria-hidden": "true" },
      h("span", null, same ? "" : dateText(first, withYear)), h("span", null, dateText(last, withYear)));
  }

  function liftTile(lift, unit) {
    need(isObj(lift), "main lift");
    var name = str(lift.name, "lift.name");
    var exercise = str(lift.exercise, "lift.exercise");
    var cur = lift.current, best = lift.best;
    need(isObj(cur) && isObj(best), "lift.current/best");
    var curDate = calDate(cur.date, "lift.current.date"), bestDate = calDate(best.date, "lift.best.date");
    var curText = short(num(cur.e1rm, "current.e1rm")) + " " + unit;
    var bestText = short(num(best.e1rm, "best.e1rm")) + " " + unit;
    var setText = short(num(cur.weight, "current.weight")) + " " + unit + " × " + num(cur.reps, "current.reps");
    var points = arr(lift.history, "lift.history").map(function (p) {
      need(isObj(p), "history point");
      var d = calDate(p.date, "history.date");
      return { date: d, value: num(p.e1rm, "history.e1rm"), title: dateText(d, true) + ": " + short(p.e1rm) + " " + unit };
    });

    var bestSet = null, byHand = false;
    if (best.best_set != null) {
      var bs = best.best_set;
      need(isObj(bs), "best.best_set");
      need(bs.source === undefined || bs.source === "manual", "best_set.source");
      byHand = bs.source === "manual";
      bestSet = "best set " + short(num(bs.weight_lb, "best_set.weight_lb")) + " × " + num(bs.reps, "best_set.reps") +
        " · " + dateText(calDate(bs.date, "best_set.date"), false);
    }

    // Fewer than three sessions make no trend: say how many instead of drawing one or two points.
    var sessions = num(lift.sessions, "lift.sessions");
    var block = null, toggle = null;
    if (sessions < MIN_TREND_SESSIONS) {
      block = h("p", { class: "lift-few" }, plural(sessions, "session", "sessions") + " so far");
    } else if (points.length) {
      var first = points[0], last = points[points.length - 1];
      var figure = h("div", { class: "lift-figure" },
        lineChart(points, {
          endText: short(last.value),
          label: name + " (" + exercise + "), estimated one-rep max over " + plural(points.length, "session", "sessions") + " from " +
            dateText(first.date, true) + " to " + dateText(last.date, true) + ": " + short(first.value) + " to " + short(last.value) + " " + unit +
            "; best " + bestText + " on " + dateText(bestDate, true)
        }),
        axisDates(first.date, last.date));
      var t = tableToggle(name + ", estimated one-rep max by session",
        [{ label: "Date" }, { label: "Estimated one-rep max (" + unit + ")", num: true }],
        points.slice().reverse().map(function (p) { return [dateText(p.date, true), short(p.value)]; }), figure);
      block = [figure, t.table];
      toggle = t.button;
    }

    return h("div", { class: "lift" },
      h("div", { class: "lift-head" }, h("div", { class: "lift-name" }, name), toggle),
      block,
      h("div", { class: "lift-exercise" }, exercise, lift.machine === true ? [" ", h("span", { class: "tag" }, "machine")] : null),
      h("div", { class: "lift-figures" },
        h("span", { title: "From " + setText + " on " + dateText(curDate, true) }, "current ", h("b", null, curText)),
        h("span", { class: "lift-best" },
          h("span", { title: "On " + dateText(bestDate, true) }, "best ", h("b", null, bestText)),
          bestSet ? h("span", { class: "lift-best-set" }, bestSet,
            byHand ? [" ", h("span", { class: "tag" }, "logged by hand")] : null) : null)));
  }

  function volumeChart(weeks, unit) {
    var n = weeks.length;
    var max = Math.max.apply(null, weeks.map(function (w) { return w.volume; }).concat(1));
    function weekText(w, i) {
      var when = i === n - 1 ? "This week so far" : "Week of " + dateText(w.start, false);
      return when + ": " + plural(w.sessions, "session", "sessions") + ", " + thousands(w.volume) + " " + unit;
    }
    var chart = h("div", { class: "vol-chart", role: "img",
      "aria-label": "Bars of weekly training volume over the last " + n + " weeks, oldest first, each labelled with its number of sessions. The last bar is this week, still in progress. " +
        weeks.map(weekText).join(". ") },
      weeks.map(function (w, i) {
        return h("div", { class: "vol-col", title: weekText(w, i) },
          h("span", { class: "vol-count" }, w.sessions),
          h("div", { class: "vol-bar" + (i === n - 1 ? " vol-bar--partial" : ""), style: { height: "calc((100% - 15px) * " + (w.volume / max).toFixed(4) + ")" } }));
      }));
    var axis = h("div", { class: "axis-labels", "aria-hidden": "true" },
      h("span", null, "week of " + dateText(weeks[0].start, false)), h("span", null, "this week"));
    var figure = h("div", { class: "chart-figure chart-figure--tight" }, chart, axis);
    var t = tableToggle("Sessions and volume per week, last " + n + " weeks",
      [{ label: "Week" }, { label: "Sessions", num: true }, { label: "Volume (" + unit + ")", num: true }],
      weeks.map(function (w, i) {
        return [i === n - 1 ? "this week (so far)" : "week of " + dateText(w.start, true), String(w.sessions), thousands(w.volume)];
      }), figure);
    return h("div", { class: "chart-block" },
      h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, "Sessions and volume, last " + n + " weeks"), t.button),
      figure, t.table,
      h("p", { class: "chart-foot" }, "Bar height is volume (weight × reps over working sets, in " + unit + "); the number on each bar is sessions. The lighter bar is this week, still in progress."));
  }

  function muscleChart(ms) {
    if (!isObj(ms) || !Array.isArray(ms.groups)) return null;
    var groups = ms.groups.filter(function (g) { return isObj(g) && typeof g.muscle === "string" && Array.isArray(g.sets); })
      .map(function (g) {
        return { label: muscleName(g.muscle), value: g.sets.reduce(function (a, b) { return a + (typeof b === "number" && isFinite(b) ? b : 0); }, 0) };
      })
      .filter(function (g) { return g.value > 0; });
    if (!groups.length) return null;
    // Sorted largest first; the "Other" bar always comes last.
    var split = splitOther(groups, MAX_MUSCLES);
    var named = split.bars.slice().sort(function (a, b) { return b.value - a.value; });
    var folded = groups.filter(function (g) { return named.indexOf(g) < 0 && !/^other$/i.test(g.label); });
    var items = split.otherTotal ? named.concat([{ label: "Other", value: split.otherTotal }]) : named;
    var foot = folded.length
      ? h("p", { class: "chart-foot" }, "Other: " + folded.map(function (g) { return g.label.toLowerCase(); }).join(", ") + ".")
      : null;
    return barChart({
      title: "Sets by muscle group, last 4 weeks",
      labelHeading: "Muscle group",
      valueHeading: "Working sets",
      items: items,
      after: foot,
      text: function (v) { return plural(v, "set", "sets"); }
    });
  }

  var PR_KINDS = { weight: "heaviest weight", e1rm: "best estimated one-rep max", set_volume: "best set volume",
    reps: "most reps", duration: "longest", distance: "farthest" };
  function prValue(p) {
    var v = p.value;
    if (p.measure === "reps") return plural(v, "rep", "reps");
    if (p.measure === "seconds") {
      var m = Math.floor(v / 60), s = Math.round(v % 60);
      return m ? m + ":" + (s < 10 ? "0" : "") + s : s + " s";
    }
    if (p.measure === "metres") return v >= 1000 ? short(v / 1000) + " km" : Math.round(v) + " m";
    var text = (p.kind === "set_volume" ? thousands(v) : short(v)) + " " + p.measure;
    return p.kind === "weight" && typeof p.reps === "number" && p.reps > 0 ? text + " × " + p.reps : text;
  }

  function prList(prs) {
    if (!Array.isArray(prs)) return null;
    var items = prs.map(function (p, i) {
      if (!isObj(p) || typeof p.exercise !== "string" || typeof p.value !== "number" || !PR_KINDS[p.kind]) return null;
      try { return { pr: p, date: calDate(p.date, "pr.date"), i: i }; } catch (e) { return null; }
    }).filter(Boolean)
      .sort(function (a, b) { return (b.date - a.date) || (a.i - b.i); })
      .slice(0, MAX_PRS);
    if (!items.length) return null;
    return h("div", { class: "list" },
      h("div", { class: "list-title" }, "Recent personal records"),
      h("ul", { class: "list-items list-items--prs" }, items.map(function (it) {
        var p = it.pr;
        return h("li", { class: "list-item" },
          h("span", { class: "item-name" }, p.exercise,
            h("span", { class: "item-sub" }, PR_KINDS[p.kind] + " · ", h("span", { class: "nowrap" }, dateText(it.date, false)))),
          h("span", { class: "item-value" }, prValue(p)));
      })));
  }

  function bodyWeight(bw, unit) {
    if (!isObj(bw)) return null;
    var points = (Array.isArray(bw.history) ? bw.history : []).map(function (p) {
      if (!isObj(p) || typeof p.weight !== "number") return null;
      try { return { date: calDate(p.date, "bw.date"), value: p.weight }; } catch (e) { return null; }
    }).filter(Boolean);
    if (!points.length && isObj(bw.latest) && typeof bw.latest.weight === "number") {
      try { points = [{ date: calDate(bw.latest.date, "bw.latest"), value: bw.latest.weight }]; } catch (e) { /* skip */ }
    }
    if (!points.length) return null;
    points.forEach(function (p) { p.title = dateText(p.date, true) + ": " + short(p.value) + " " + unit; });
    var title = "Body weight";

    if (points.length < 3) {
      return h("div", { class: "list" },
        h("div", { class: "list-title" }, title),
        h("ul", { class: "list-items list-items--places" }, points.slice().reverse().map(function (p) {
          return h("li", { class: "list-item" },
            h("span", { class: "item-name" }, dateText(p.date, true)),
            h("span", { class: "item-value" }, short(p.value) + " " + unit));
        })));
    }
    var first = points[0], last = points[points.length - 1];
    var figure = h("div", { class: "lift-figure" },
      lineChart(points, {
        dots: true,
        height: 96,
        endText: short(last.value) + " " + unit,
        label: "Body weight, " + plural(points.length, "measurement", "measurements") + " from " + dateText(first.date, true) + " to " +
          dateText(last.date, true) + ": " + points.map(function (p) { return p.title; }).join("; ")
      }),
      axisDates(first.date, last.date));
    var t = tableToggle("Body weight measurements",
      [{ label: "Date" }, { label: "Weight (" + unit + ")", num: true }],
      points.slice().reverse().map(function (p) { return [dateText(p.date, true), short(p.value)]; }), figure);
    return h("div", { class: "chart-block" },
      h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, title), t.button),
      figure, t.table);
  }

  // The lifting feed's source and unit; sets the panel's source line when the page has it.
  function liftingBasics(data) {
    var l = data.lifting;
    need(isObj(l), "lifting");
    var src = sourceOf(data, l.source);
    var srcLabel = src && typeof src.label === "string" && src.label ? src.label : String(l.source);
    var meta = document.getElementById("lifting-meta");
    var state = sourceState(src, true);
    if (meta) meta.textContent = srcLabel;
    var unit = l.unit === "kg" ? "kg" : "lb";
    var through = l.data_through === null || l.data_through === undefined ? null : calDate(l.data_through, "data_through");
    var count = num(l.workout_count, "workout_count");
    if (meta && through && state.show) meta.textContent = srcLabel + " · data through " + dateText(through, true);
    return { l: l, state: state, unit: unit, through: through, count: count, src: src };
  }

  // Workouts logged, streak, sessions, and the main lifts' tiles.
  function liftingLifts(data) {
    var b = liftingBasics(data), l = b.l;
    if (!b.state.show) return null;
    if (b.count === 0) return [b.state.asOf ? staleNote(b.state.asOf) : null, h("p", { class: "panel-empty" }, "No workouts logged yet.")];
    var firstWorkout = l.first_workout === null ? null : calDate(l.first_workout, "first_workout");
    var weeks = arr(l.weeks, "lifting.weeks");
    var recent4 = weeks.slice(-4).reduce(function (a, w) { need(isObj(w), "lifting week"); return a + num(w.sessions, "week.sessions"); }, 0);
    var minSessions = num(l.streak_min_sessions, "streak_min_sessions");
    var lifts = arr(l.main_lifts, "main_lifts").map(function (lift) { return liftTile(lift, b.unit); });
    return [
      b.state.asOf ? staleNote(b.state.asOf) : null,
      h("div", { class: "stats" },
        stat("Workouts logged", thousands(b.count), firstWorkout ? "since " + dateText(firstWorkout, true) : null),
        stat("Current streak", String(num(l.streak_weeks, "streak_weeks")),
          minSessions === 1 ? "weeks with a workout" : "weeks at " + minSessions + "+ sessions"),
        stat("Sessions, last 4 weeks", String(recent4), "including this week so far")),
      lifts.length ? h("div", { class: "chart-block" },
        h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, "Estimated one-rep max, main lifts")),
        h("div", { class: "lifts" }, lifts),
        h("p", { class: "chart-foot" }, EPLEY_NOTE)) : null
    ];
  }

  // Sessions and volume by week, sets by muscle group, recent personal records.
  function liftingTraining(data) {
    var b = liftingBasics(data), l = b.l;
    if (!b.state.show || b.count === 0) return null;
    var weeks = arr(l.weeks, "lifting.weeks").map(function (w) {
      need(isObj(w), "lifting week");
      return { start: calDate(w.week_start, "week_start"), sessions: num(w.sessions, "week.sessions"), volume: num(w.volume, "week.volume") };
    });
    need(weeks.length > 0, "lifting.weeks");
    var active = weeks.some(function (w) { return w.sessions > 0 || w.volume > 0; });
    return h("div", { class: "lift-grid" },
      active ? volumeChart(weeks, b.unit)
        : h("div", { class: "chart-block" },
            h("div", { class: "chart-title" }, "Sessions and volume, last " + weeks.length + " weeks"),
            h("p", { class: "panel-empty" }, "No workouts logged in the last " + weeks.length + " weeks")),
      muscleChart(l.muscle_sets),
      prList(l.recent_prs));
  }

  function liftingBodyWeight(data) {
    var b = liftingBasics(data);
    if (!b.state.show || b.count === 0) return null;
    return bodyWeight(b.l.body_weight, b.unit);
  }

  // The blocks a lately/<feed>/ page can hold (build.py's FEED_BLOCKS).
  var BLOCKS = {
    "fantasy.lineup": fantasyLineup, "fantasy.carry": fantasyCarry,
    "watching.hours": watchingHours, "watching.recent": watchingRecent, "watching.rankings": watchingRankings,
    "listening.recent": listeningRecent, "eating.recent": eatingRecent,
    "lifting.lifts": liftingLifts, "lifting.training": liftingTraining, "lifting.body_weight": liftingBodyWeight
  };

  // ---------- the main page's panels ----------
  // Each: a question in bold, a two-sentence answer from a fixed template, two or three
  // numbers, one chart, and the link to the feed's page. A statistic that is "not
  // enough data yet" or not in the file leaves the question standing over a box that
  // says so, with its n and min_n; the numbers still show.

  function question(text, sentences) {
    return h("div", { class: "panel-lead" }, h("p", { class: "panel-question" }, text), h("p", { class: "panel-answer" }, sentences.join(" ")));
  }
  function numbers(items) {
    items = items.filter(Boolean).slice(0, 3);
    var d = LD();
    if (d && d.headlineRow) return d.headlineRow(items, "ld-stats--panel");
    return h("div", { class: "stats ld-stats ld-stats--panel" }, items.map(function (i) { return stat(i.label, i.value, i.note); }));
  }
  function waitBox(s, unit, extra) {
    var d = LD();
    var inner = d && d.waitBox ? d.waitBox(s, unit, extra)
      : h("p", { class: "ld-wait" }, h("b", null, isObj(s) ? String(s.status) : "not in the data yet"));
    return h("div", { class: "panel-wait" }, inner);
  }
  function chartOr(fn) {
    var d = LD();
    if (!d || !d.charts) return h("p", { class: "panel-empty" }, "Couldn't draw this chart right now.");
    return fn(d.charts);
  }
  function more(feed) { return h("a", { class: "ld-more", href: "lately/" + feed + "/" }, "more about " + feed + " →"); }
  function nOf(s) { return isNum(s.n) ? s.n + " of " + s.min_n : String(s.min_n); }
  function plus(x, dp) { return fsigned(x, dp); }

  function fantasyPanel(data) {
    var ctx = fantasyTeams(data);
    if (!ctx.any) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var hl = ctx.f.headline;
    need(isObj(hl), "fantasy.headline");
    var a = analysisOf(data);
    var q = a && isObj(a.fantasy) ? a.fantasy.quadrant : null;
    var teamCount = num(hl.team_count, "team_count"), wae = num(hl.wins_above_expected, "wae");
    var rec = record(num(hl.wins, "wins"), num(hl.losses, "losses"), hl.ties || 0);
    var nums = [
      { label: "Combined record", value: rec, note: "across " + plural(teamCount, "team", "teams") },
      { label: "Wins above expected", value: plus(wae, 1), note: "actual wins minus all-play wins" },
      { label: "Favoured this week", value: num(hl.favoured, "favoured") + " of " + num(hl.favoured_of, "favoured_of"), note: "by projected points" }
    ];
    var sentences, chart;
    var mine = okStat(q) ? list(q.values.mine).filter(function (t) { return isObj(t) && isNum(t.all_play) && isNum(t.luck) && typeof t.label === "string"; }) : [];
    if (mine.length) {
      var good = mine.filter(function (t) { return t.all_play >= 0.5; }).length;
      var byLuck = mine.slice().sort(function (x, y) { return y.luck - x.luck; });
      var L = byLuck[0], U = byLuck[byLuck.length - 1];
      sentences = [
        good + " of my " + plural(mine.length, "team", "teams") + (good === 1 ? " sits" : " sit") + " in the good half by all-play, and together they have won " +
          fnum(Math.abs(wae), 1) + " " + (wae >= 0 ? "more" : "fewer") + " games than that strength predicts.",
        mine.length > 1 ? "The luckiest is " + L.label + " at " + plus(L.luck, 1) + "; the least lucky is " + U.label + " at " + plus(U.luck, 1) + "."
          : L.label + " is at " + plus(L.luck, 1) + " wins above expected."
      ];
      chart = chartOr(function (c) { return c.quadrant(q.values); });
    } else {
      sentences = [
        "Across " + plural(teamCount, "team", "teams") + " I'm " + rec + ", " + fnum(Math.abs(wae), 1) + " " + (Math.abs(wae) === 1 ? "win" : "wins") + " " +
          (wae >= 0 ? "above" : "below") + " what all-play says I should have.",
        "The strength-and-luck chart waits for the league-wide statistic" + (isObj(q) && isNum(q.min_n) ? " (" + nOf(q) + " weeks)" : "") + "."
      ];
      chart = waitBox(q, "weeks");
    }
    return [fantasyStale(ctx.shown), question("Good, or lucky?", sentences), numbers(nums), chart, more("fantasy")];
  }

  var TYPE_NAMES = { film: "films", show: "shows", anime: "anime", films: "films", shows: "shows" };

  function watchingPanel(data) {
    var ws = watchingState(data), w = ws.w;
    if (!ws.state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var a = analysisOf(data), aw = a && isObj(a.watching) ? a.watching : {};
    var tp = aw.taste_profile, ca = aw.crowd_agreement, st = aw.s_tier;
    var d = LD();
    // Share of films that are S: from s_tier, else the films' tier distribution.
    var filmS = null;
    var byType = okStat(st) ? list(st.values.by_type).filter(function (t) { return isObj(t) && t.type === "film" && isNum(t.share); })[0] : null;
    if (byType) filmS = { share: byType.share, s: byType.s, titles: byType.titles };
    else if (isObj(aw.tier_distribution) && okStat(aw.tier_distribution.films)) {
      var tiers = list(aw.tier_distribution.films.values.tiers).filter(isObj), sN = 0, tN = 0;
      tiers.forEach(function (x) { tN += isNum(x.titles) ? x.titles : 0; if (x.tier === "S") sN += isNum(x.titles) ? x.titles : 0; });
      if (tN) filmS = { share: sN / tN, s: sN, titles: tN };
    }
    var sNum = filmS ? { label: "Films that are S", value: fpct(filmS.share), note: filmS.s + " of " + plural(filmS.titles, "film", "films") } : null;
    var crowd = okStat(ca) && isNum(ca.value) ? { label: "Agreement with the crowd", value: fnum(ca.value, 2), note: "rank correlation, my tier against the community score" }
      : isObj(aw.tier_contrarian) && okStat(aw.tier_contrarian.films) && isNum(aw.tier_contrarian.films.value)
        ? { label: "My film tiers against Simkl", value: fnum(aw.tier_contrarian.films.value, 2), note: "rank correlation" } : null;
    var sentences, chart, nums;
    var rows = okStat(tp) ? list(tp.values.rows).filter(function (r) { return isObj(r) && isNum(r.effect) && typeof r.name === "string"; }) : [];
    if (rows.length) {
      var v = tp.values;
      var pos = rows.filter(function (r) { return r.clear !== false && r.effect > 0; }).sort(function (x, y) { return y.effect - x.effect; }).map(function (r) { return r.name; });
      var neg = rows.filter(function (r) { return r.clear !== false && r.effect < 0; }).sort(function (x, y) { return x.effect - y.effect; }).map(function (r) { return r.name; });
      var unclear = rows.filter(function (r) { return r.clear === false; }).sort(function (x, y) { return Math.abs(x.effect) - Math.abs(y.effect); }).map(function (r) { return r.name; });
      function names(xs) { xs = xs.slice(0, 3); return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }
      sentences = [
        (pos.length ? names(pos) + (pos.length === 1 ? " lifts" : " lift") + " my tiers" : "No genre clearly lifts my tiers") +
          (neg.length ? "; " + names(neg) + (neg.length === 1 ? " lowers" : " lower") + " them." : "."),
        unclear.length ? names(unclear) + (unclear.length === 1 ? " doesn't" : " don't") + " move me." : "Every feature's effect is clear of zero."
      ];
      nums = [crowd, isNum(v.model_accuracy) ? { label: "Predictable from metadata", value: fpct(v.model_accuracy), note: isNum(v.baseline) ? "vs " + fpct(v.baseline) + " baseline guessing" : "leave-one-out" } : null, sNum];
      chart = chartOr(function (c) {
        var block = c.effectBars("What my tiers respond to", rows);
        append(block, d.disagreementLines(v.disagreements));
        return block;
      });
    } else {
      sentences = [
        filmS ? fpct(filmS.share) + " of my finished films are S (" + filmS.s + " of " + filmS.titles + ")." : "Tiers are not in the data yet.",
        "What my tiers respond to waits for the taste model" + (isObj(tp) && isNum(tp.min_n) ? " (" + nOf(tp) + " titles)" : "") + "."
      ];
      var comp = isObj(aw.completion) ? aw.completion.show : null;
      nums = [crowd, sNum, okStat(comp) ? { label: "Completion, shows", value: fpct(comp.value), note: comp.values.finished + " finished, " + comp.values.dropped + " dropped" } : null];
      chart = waitBox(tp, "titles");
    }
    return [ws.state.asOf ? staleNote(ws.state.asOf) : null, question("What does my taste look like?", sentences), numbers(nums), chart, more("watching")];
  }

  function listeningPanel(data) {
    var b = listeningBasics(data);
    if (!b.state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var a = analysisOf(data), al = a && isObj(a.listening) ? a.listening : {};
    var sv = al.artist_survival, conc = al.concentration;
    var d = LD(), f = F();
    var month = f ? f.monthText : function (m) { return String(m); };
    var concLast = okStat(conc) ? list(conc.values.months).filter(isObj).slice(-1)[0] : null;
    var top5 = concLast && isNum(concLast.top_five_share) ? concLast.top_five_share : null;
    var plays = { label: "Plays, " + b.win, value: String(b.plays), note: "from Last.fm" };
    var sentences, chart, nums;
    var v = okStat(sv) ? sv.values : null;
    var curves = v ? list(v.curves).filter(function (c) { return isObj(c) && list(c.points).length; }) : [];
    if (curves.length && d) {
      var med = isObj(v.medians) ? v.medians : {}, hr = isObj(v.hr_a) ? v.hr_a : null;
      var medianNum = isNum(med.overall) ? { label: "Median rotation length, all artists", value: plural(med.overall, "month", "months"), note: "from first play to 90 days without one" }
        : isNum(med.catalog) ? { label: "Median rotation length, catalog artists", value: plural(med.catalog, "month", "months"), note: "the overall median is not reached yet" } : null;
      var hrNum = hr && isNum(hr.value) ? { label: "Hazard ratio, new vs catalog", value: fnum(hr.value, 2) + "×", note: f && f.interval(hr.interval, function (x) { return f.num(x, 2); }) || "how much faster new artists leave" } : null;
      var shareNum = isNum(v.share_catalog) ? { label: "Discoveries that are catalog", value: fpct(v.share_catalog), note: "artists over 5 years old when first played" } : null;
      sentences = [d.hazardSentence(hr, med) || "The survival curves are drawn below.", "Note: " + d.PRESYNC_NOTE];
      nums = [medianNum, hrNum, shareNum];
      chart = chartOr(function (c) {
        var block = c.survivalChart("Share of artists still in rotation, by months since first play", curves);
        append(block, d.longestLine(v.longest_lived));
        return block;
      });
    } else {
      var range = listeningRange(data);
      sentences = [
        (range ? "The archive holds " + plural(range.days, "day", "days") + " of plays, from " + range.from + " to " + range.to : "The archive is young") +
          "; whether old music lasts longer needs " + (isObj(sv) && isNum(sv.min_n) ? plural(sv.min_n, "artist", "artists") + " with a first play" : "more discoveries") + ".",
        "So far: " + plural(b.plays, "play", "plays") + windowText(b.win) + (top5 !== null ? ", " + fpct(top5) + " of them by my top five artists" : "") + "."
      ];
      var topFive = top5 !== null ? { label: "Top five artists' share", value: fpct(top5), note: month(concLast.month) } : null;
      var topArtist = list(b.l.top_artists).filter(function (x) { return isObj(x) && typeof x.name === "string" && isNum(x.plays); })[0];
      nums = [plays, topFive, topArtist ? { label: "Top artist, " + b.win, value: topArtist.name, note: plural(topArtist.plays, "play", "plays") } : null];
      chart = waitBox(sv, "artists", range ? "plays from " + range.from + " to " + range.to : null);
    }
    return [b.state.asOf ? staleNote(b.state.asOf) : null, question("Does old music last longer than new?", sentences), numbers(nums), chart, more("listening")];
  }

  function eatingPanel(data) {
    var e = data.eating;
    need(isObj(e), "eating");
    var state = sourceState(sourceOf(data, e.source), true);
    if (!state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var a = analysisOf(data), ae = a && isObj(a.eating) ? a.eating : {};
    var sc = ae.scores, hb = ae.home_bias, oe = ae.order_effect;
    var home = okStat(hb) && isNum(hb.value) ? { label: "Home against away", value: plus(hb.value, 2), note: "points, same cuisine" } : null;
    var order = okStat(oe) && isNum(oe.value) ? { label: "Order effect", value: plus(oe.value, 2), note: "points per 100 places ranked" } : null;
    var sentences, chart, nums;
    var med = okStat(sc) && isObj(sc.values.overall) && isNum(sc.values.overall.median) ? sc.values.overall.median : null;
    if (med !== null) {
      var byC = isObj(sc.values.by_cuisine) ? sc.values.by_cuisine : {};
      var items = Object.keys(byC).filter(function (k) { return isObj(byC[k]) && isNum(byC[k].median) && isNum(byC[k].n) && byC[k].n >= MIN_CUISINE_PLACES && !/^other$/i.test(k); })
        .map(function (k) { return { label: k, value: byC[k].median - med, text: plus(byC[k].median - med, 2) + " (" + plural(byC[k].n, "place", "places") + ")" }; })
        .sort(function (x, y) { return y.value - x.value; });
      var hi = items[0], lo = items[items.length - 1];
      if (home) items.push({ label: "home against away", value: hb.value, text: plus(hb.value, 2) + " (same cuisine)" });
      sentences = [
        "Against my median of " + fnum(med, 2) + (hi && lo && hi !== lo ? ", " + hi.label + " runs " + plus(hi.value, 2) + " and " + lo.label + " " + plus(lo.value, 2) : ", no cuisine with " + MIN_CUISINE_PLACES + " places stands apart") + ".",
        home ? "At home I score " + fnum(Math.abs(hb.value), 2) + " points " + (hb.value < 0 ? "lower" : "higher") + " than away for the same cuisine" +
          (order ? ", and each 100 places ranked moves a score " + plus(oe.value, 2) + " points" : "") + "."
          : "Home against away waits for " + (isObj(hb) && isNum(hb.min_n) ? nOf(hb) + " places" : "more places") + (order ? "; each 100 places ranked moves a score " + plus(oe.value, 2) + " points" : "") + "."
      ];
      nums = [{ label: "Median score", value: fnum(med, 2), note: "middle half " + fnum(sc.values.overall.q1, 2) + " to " + fnum(sc.values.overall.q3, 2) }, home, order];
      chart = chartOr(function (c) {
        var block = c.bars("Median score against my overall median, by cuisine", items, { labelHeading: "Cuisine", valueHeading: "Points against the median" });
        block.appendChild(h("p", { class: "chart-foot" }, "Bars are each cuisine's median minus my overall median of " + fnum(med, 2) +
          " (cuisines with " + MIN_CUISINE_PLACES + " or more places)" + (home ? "; the last bar is home against away, same cuisine" : "") + "."));
        return block;
      });
    } else {
      sentences = [
        "Scores by cuisine wait for " + (isObj(sc) && isNum(sc.min_n) ? nOf(sc) + " places" : "more places") + ".",
        home ? "At home I score " + fnum(Math.abs(hb.value), 2) + " points " + (hb.value < 0 ? "lower" : "higher") + " than away for the same cuisine."
          : "Home against away waits too."
      ];
      nums = [{ label: "Restaurants ranked", value: String(num(e.ranked_count, "ranked_count")), note: "on Beli" }, home, order];
      chart = waitBox(sc, "places");
    }
    return [state.asOf ? staleNote(state.asOf) : null, question("What biases my scores?", sentences), numbers(nums), chart, more("eating")];
  }

  function liftingPanel(data) {
    var b = liftingBasics(data), l = b.l;
    if (!b.state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    if (b.count === 0) return [b.state.asOf ? staleNote(b.state.asOf) : null, h("p", { class: "panel-empty" }, "No workouts logged yet."), more("lifting")];
    var a = analysisOf(data), al = a && isObj(a.lifting) ? a.lifting : {};
    var si = al.strength_index, bwr = al.body_weight_rate, ret = isObj(al.retention) ? al.retention : {}, kept = isObj(al.strength_kept) ? al.strength_kept : {};
    var f = F();
    var date = f ? f.dateText : function (s) { return String(s); };
    // The best-held lift: analysis.lifting.best_held_lift, else the largest change in the index's lifts_change.
    var held = isObj(al.best_held_lift) && typeof al.best_held_lift.name === "string" && isNum(al.best_held_lift.change_pct) ? al.best_held_lift : null;
    if (!held && okStat(si) && isObj(si.values.lifts_change)) {
      Object.keys(si.values.lifts_change).forEach(function (k) {
        var c = si.values.lifts_change[k];
        if (isObj(c) && isNum(c.change_pct) && (!held || c.change_pct > held.change_pct)) held = { name: k, change_pct: c.change_pct };
      });
    }
    var benchNum = held ? { label: "Best-held lift", value: held.name, note: plus(held.change_pct * 100, 1) + "% since the cut" } : null;
    var weeks = okStat(si) ? list(si.values.weeks).filter(function (w) { return isObj(w) && (isNum(w.strength) || isNum(w.body_weight)); }) : [];
    function latest(key) {
      var cur = okStat(si) && isObj(si.values.current) ? si.values.current[key] : null;
      if (isNum(cur)) return cur;
      for (var i = weeks.length - 1; i >= 0; i--) if (isNum(weeks[i][key])) return weeks[i][key];
      return null;
    }
    var last = weeks.length ? { strength: latest("strength"), body_weight: latest("body_weight") } : null;
    var bwPct = last && isNum(last.body_weight) ? last.body_weight - 100 : okStat(bwr) && isNum(bwr.values.first) && isNum(bwr.values.latest) && bwr.values.first ? (bwr.values.latest / bwr.values.first - 1) * 100 : null;
    var cutStart = okStat(si) && si.values.cut_start ? si.values.cut_start : okStat(bwr) ? bwr.values.cut_start : al.cut_start;
    var bwNum = bwPct !== null ? { label: "Body weight since the cut", value: plus(bwPct, 1) + "%",
      note: okStat(bwr) && isNum(bwr.values.first) ? "from " + fnum(bwr.values.first, 1) + " to " + fnum(bwr.values.latest, 1) + " " + b.unit : null } : null;
    var sentences, chart, nums;
    // The lift that held up best and least since the cut: the strength index's per-lift change
    // (largest and smallest change_pct), else retention, else strength kept.
    function extremes(map, value, unit) {
      var ks = Object.keys(map).filter(function (k) { return isNum(value(map[k])); }).sort(function (x, y) { return value(map[y]) - value(map[x]); });
      if (!ks.length) return null;
      var hi = ks[0], lo = ks[ks.length - 1];
      if (hi === lo) return hi + " is at " + unit(value(map[hi])) + " since the cut.";
      return hi + " has held up best at " + unit(value(map[hi])) + " since the cut, " + lo + " least at " + unit(value(map[lo])) + ".";
    }
    function pctUnit(x) { return plus(x * 100, 1) + "%"; }
    var change = okStat(si) && isObj(si.values.lifts_change) ? si.values.lifts_change : {};
    var second = extremes(change, function (c) { return isObj(c) ? c.change_pct : null; }, pctUnit)
      || extremes(ret, function (st) { return okStat(st) && isObj(st.values) ? st.values.change_pct : null; }, pctUnit)
      || extremes(kept, function (st) { return okStat(st) ? st.value : null; }, function (x) { return plus(x, 1) + " lb of e1RM kept per lb lost"; });
    if (weeks.length > 1 && last && isNum(last.strength)) {
      // When the index has fallen more than 2 points from its peak, say so, with the peak's month.
      var peak = null;
      weeks.forEach(function (w) { if (isNum(w.strength) && (!peak || w.strength > peak.strength)) peak = w; });
      var peakClause = peak && peak.strength - last.strength > 2
        ? ", down from a peak of " + fnum(peak.strength, 0) + " in " + MONTH_NAMES[calDate(peak.week_start, "week_start").getUTCMonth()] : "";
      sentences = [
        "Since the cut started" + (cutStart ? " on " + date(cutStart) : "") + ", " + (isNum(last.body_weight) ? "body weight is " + plus(last.body_weight - 100, 1) + "% and " : "") +
          "the strength index is " + plus(last.strength - 100, 1) + "%" + peakClause + ".",
        second || "Per-lift retention appears once each lift has enough sessions."
      ];
      nums = [bwNum, { label: "Strength index since the cut", value: plus(last.strength - 100, 1) + "%", note: "mean best e1RM, main lifts" }, benchNum];
      chart = chartOr(function (c) { return c.indexedLines(weeks, { height: 150 }); });
    } else {
      var waits = "The strength index waits for " + (isObj(si) && isNum(si.min_n) ? nOf(si) + " weeks" : "the pipeline");
      sentences = [
        okStat(bwr) && isNum(bwr.value) ? "Since the cut started" + (cutStart ? " on " + date(cutStart) : "") + " I've gone from " + fnum(bwr.values.first, 1) + " to " + fnum(bwr.values.latest, 1) + " " + b.unit +
          (bwPct !== null ? " (" + plus(bwPct, 1) + "%)" : "") + ", " + (bwr.value < 0 ? "losing" : "gaining") + " " + fnum(Math.abs(bwr.value), 2) + " " + b.unit + " a week." : "Body weight since the cut waits for weigh-ins.",
        second ? waits + "; meanwhile " + second.charAt(0).toLowerCase() + second.slice(1) : waits + "."
      ];
      nums = [bwNum, benchNum, okStat(bwr) && isNum(bwr.value) ? { label: "Body weight a week", value: plus(bwr.value, 2) + " " + b.unit, note: f ? f.interval(bwr.interval, function (x) { return f.signed(x, 2); }) || "since the cut started" : "since the cut started" } : null];
      chart = waitBox(si, "weeks");
    }
    return [b.state.asOf ? staleNote(b.state.asOf) : null, question("Is the cut costing strength?", sentences), numbers(nums), chart, more("lifting")];
  }

  // ---------- assembly ----------

  var PANELS = [
    ["panel-fantasy", fantasyPanel],
    ["panel-watching", watchingPanel],
    ["panel-listening", listeningPanel],
    ["panel-eating", eatingPanel],
    ["panel-lifting", liftingPanel]
  ];
  var FEEDS = { "panel-fantasy": "fantasy", "panel-watching": "watching", "panel-listening": "listening",
    "panel-eating": "eating", "panel-lifting": "lifting" };

  function fill(panelId, build, data) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    // Keep the static heading row; replace everything after it.
    while (panel.children.length > 1) panel.removeChild(panel.lastElementChild);
    var nodes;
    try {
      nodes = data ? build(data) : [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    } catch (err) {
      if (window.console) console.warn("lately: " + panelId + " not drawn:", err.message);
      var missing = data && err && /bad (fantasy|watching|listening|eating|lifting)$/.test(err.message);
      nodes = [h("p", { class: "panel-empty" }, missing ? NOT_CONNECTED : BROKEN)];
    }
    append(panel, nodes);
    // The link to the feed's page, even when the panel could not be drawn.
    if (!panel.querySelector(".ld-more")) panel.appendChild(more(FEEDS[panelId]));
  }

  function render(data, isSample) {
    var sample = isSample || !!(data && data.sample === true);
    var badge = document.getElementById("lately-sample-badge");
    var note = document.getElementById("lately-sample-note");
    if (badge) badge.hidden = !sample;
    if (note) note.hidden = !sample;
    try { renderChips(data); } catch (e) { /* chips are decoration */ }
    PANELS.forEach(function (p) { fill(p[0], p[1], data); });
    try { renderAttributions(data); } catch (e) { /* credits are a footer line */ }
  }

  // analysis.meta.attributions (TMDB, OMDb) under the section while the watching panel draws from them.
  function renderAttributions(data) {
    var slot = document.getElementById("lately-attributions");
    if (!slot) return;
    var a = analysisOf(data), d = LD();
    var attrs = a && isObj(a.meta) ? list(a.meta.attributions).filter(function (x) { return isObj(x) && typeof x.text === "string"; }) : [];
    var drawn = a && isObj(a.watching) && okStat(a.watching.by_director);
    slot.textContent = "";
    slot.hidden = !(drawn && attrs.length && d && d.attributionNodes);
    if (!slot.hidden) append(slot, [" · ", d.attributionNodes(attrs)]);
  }

  // The top level must be the right shape; panels validate their own parts.
  function looksValid(data) {
    return isObj(data) && data.schema_version === 1 && isObj(data.sources);
  }

  // The feed blocks for the lately/<feed>/ pages: nodes, or null when there is nothing to draw.
  window.LatelyFeed = {
    block: function (name, data) {
      var fn = BLOCKS[name];
      if (!fn || !looksValid(data)) return null;
      return fn(data);
    }
  };

  function load(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(url + " " + res.status);
      return res.json();
    }).then(function (data) {
      if (!looksValid(data)) throw new Error(url + " has an unexpected shape");
      return data;
    });
  }

  function start() {
    if (!window.fetch || !document.getElementById("lately")) return;
    load(LIVE_URL)
      .then(function (data) { render(data, false); })
      .catch(function (err) {
        if (window.console && !/ 404$/.test(err.message)) console.warn("lately: using sample data:", err.message);
        return load(SAMPLE_URL)
          .then(function (data) { render(data, true); })
          .catch(function () { render(null, false); });
      })
      .catch(function () { /* never let this section break the page */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
