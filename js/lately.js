/*
 * Side D, lately. Draws the four data panels from data/lately.json, falling
 * back to data/lately.sample.json. Nothing here may break the rest of the
 * page: every failure ends in a "not connected yet" panel, never a throw.
 * Schema: data/lately.schema.json.
 */
(function () {
  "use strict";

  var LIVE_URL = "data/lately.json";
  var SAMPLE_URL = "data/lately.sample.json";
  var TZ = "America/Los_Angeles";
  var NOT_CONNECTED = "Not connected yet.";
  var BROKEN = "Couldn't draw this panel right now.";
  var NO_CHANCE = "not available this week";
  var MAX_CUISINES = 7; // six named plus "Other"

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
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(el, c); });
    else el.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function need(cond, what) { if (!cond) throw new Error("lately: bad " + what); }
  function num(v, what) { need(typeof v === "number" && isFinite(v), what); return v; }
  function str(v, what) { need(typeof v === "string", what); return v; }
  function arr(v, what) { need(Array.isArray(v), what); return v; }

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
      list, t.table);
  }

  function stat(label, value, note) {
    return h("div", { class: "stat" },
      h("div", { class: "stat-label" }, label),
      h("div", { class: "stat-value" }, value),
      note ? h("div", { class: "stat-note" }, note) : null);
  }

  // ---------- panels ----------

  // Text shown in place of a null win chance: the team's note, or a default.
  function winNote(t) {
    var n = t.win_probability_note;
    return typeof n === "string" && n.trim() ? n.trim() : NO_CHANCE;
  }

  function fantasyPanel(data) {
    var f = data.fantasy;
    need(isObj(f), "fantasy");
    var week = num(f.week, "fantasy.week");
    var hl = f.headline;
    need(isObj(hl), "fantasy.headline");
    var teams = arr(f.teams, "fantasy.teams");
    var players = arr(f.top_players, "fantasy.top_players");
    var srcKeys = arr(f.sources, "fantasy.sources");

    document.getElementById("fantasy-title").textContent = "Fantasy football, week " + week;
    document.getElementById("fantasy-meta").textContent = srcKeys.map(function (k) {
      var s = sourceOf(data, k);
      return s && s.label ? s.label : k;
    }).join(" + ");

    var shown = teams.map(function (t) {
      need(isObj(t), "team");
      return { team: t, src: sourceOf(data, t.source), state: sourceState(sourceOf(data, t.source), true) };
    });
    if (!shown.some(function (s) { return s.state.show; })) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];

    var out = [];
    var stale = shown.filter(function (s) { return s.state.show && s.state.asOf; });
    if (stale.length) {
      var oldest = stale.reduce(function (a, s) { return s.state.asOf < a ? s.state.asOf : a; }, stale[0].state.asOf);
      out.push(staleNote(oldest));
    }

    var teamWord = num(hl.team_count, "team_count") === 1 ? "team" : "teams";
    out.push(h("div", { class: "stats" },
      stat("Combined record", record(num(hl.wins, "wins"), num(hl.losses, "losses"), hl.ties || 0), "across " + hl.team_count + " " + teamWord),
      stat("Wins above expected", signed(num(hl.wins_above_expected, "wae")), "actual wins minus all-play wins"),
      stat("Favoured this week", num(hl.favoured, "favoured") + " of " + num(hl.favoured_of, "favoured_of"), "by projected points")));

    var played = week - 1;
    var weeksLabel = played > 1 ? "Weeks 1 to " + played : "Week 1";
    var luckMax = Math.max(2, Math.max.apply(null, teams.map(function (t) { return Math.abs(t.luck) || 0; })));

    var rows = shown.map(function (s) {
      var t = s.team;
      var name = str(t.name, "team.name");
      var srcLabel = s.src && s.src.label ? s.src.label : String(t.source);
      var platform = [srcLabel, t.league_label, isOk(s.src) ? null : (s.src && (s.src.message || s.src.status)) || "unknown"]
        .filter(Boolean).join(" · ");
      var nameCell = h("div", null, h("div", { class: "team-name" }, name), h("div", { class: "team-platform" }, platform));
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
    out.push(h("div", { class: "chart-block" }, h("div", { class: "chart-head chart-head--end" }, t.button), grid, t.table));

    out.push(barChart({
      title: "Who is carrying my teams: points above replacement, per game",
      wide: true,
      labelHeading: "Player",
      valueHeading: "Points above replacement, per game",
      items: players.map(function (p) { return { label: str(p.name, "player"), value: num(p.points_above_replacement, "par") }; }),
      text: function (v) { return short(v) + " points above replacement per game"; }
    }));
    return out;
  }

  function watchingPanel(data) {
    var w = data.watching;
    need(isObj(w), "watching");
    var state = sourceState(sourceOf(data, w.source), true);
    if (!state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var weeks = arr(w.weeks, "watching.weeks");
    need(weeks.length > 0, "watching.weeks");
    // "finished" items (bulk-completed on Simkl) always list after watched ones;
    // a missing status counts as watched. The sort is stable within each group.
    var recent = arr(w.recent, "watching.recent").map(function (r, i) {
      need(isObj(r), "recent item");
      return { item: r, finished: r.status === "finished", i: i };
    }).sort(function (a, b) { return (a.finished - b.finished) || (a.i - b.i); });
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

    function legendItem(cls, label) {
      return h("span", { class: "legend-item" }, h("span", { class: "legend-swatch " + cls, "aria-hidden": "true" }), label);
    }
    var types = { film: "film", show: "show", anime: "anime" };

    return [
      state.asOf ? staleNote(state.asOf) : null,
      stat("Hours watched, last " + n + " weeks", short(totalHours)),
      h("div", { class: "legend" }, legendItem("fill--films", "Films"), legendItem("fill--shows", "Shows"), legendItem("fill--anime", "Anime"), t.button),
      figure,
      t.table,
      h("div", { class: "list" },
        h("div", { class: "list-title" }, "Recently"),
        h("ul", { class: "list-items" }, recent.map(function (entry) {
          var r = entry.item;
          need(isObj(r), "recent item");
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
              : h("span", { class: "item-score" }));
        })))
    ];
  }

  // Bins plays into the six-step blue scale from the reference.
  function heatLevel(v, max) {
    if (max <= 0 || v <= 0) return 0;
    var r = v / max;
    if (r >= 1) return 5;
    if (r >= 0.8) return 4;
    if (r >= 0.6) return 3;
    if (r >= 0.4) return 2;
    if (r >= 0.25) return 1;
    return 0;
  }

  function listeningPanel(data) {
    var l = data.listening;
    need(isObj(l), "listening");
    var state = sourceState(sourceOf(data, l.source), true);
    if (!state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var artists = arr(l.top_artists, "top_artists");
    var hours = arr(l.plays_by_hour, "plays_by_hour");
    need(hours.length === 24, "plays_by_hour length");
    hours.forEach(function (v) { num(v, "hour"); });
    var max = Math.max.apply(null, hours);

    function hourText(v, i) { return i + ":00, " + plural(v, "play", "plays"); }
    var strip = h("div", { class: "heat", role: "img",
      "aria-label": "Plays by hour of day over the last 30 days: a strip of 24 cells, darker where more songs are played. " + hours.map(hourText).join("; ") },
      hours.map(function (v, i) { return h("div", { class: "heat-cell heat-" + heatLevel(v, max), title: hourText(v, i) }); }));
    var axis = h("div", { class: "axis-labels", "aria-hidden": "true" }, h("span", null, "midnight"), h("span", null, "noon"), h("span", null, "11pm"));
    var t = tableToggle("Plays by hour of day, last 30 days",
      [{ label: "Hour" }, { label: "Plays", num: true }],
      hours.map(function (v, i) { return [i + ":00", String(v)]; }), [strip, axis]);

    return [
      state.asOf ? staleNote(state.asOf) : null,
      stat("Plays this month", String(num(l.plays_this_month, "plays_this_month"))),
      barChart({
        title: "Top artists this month",
        labelHeading: "Artist",
        valueHeading: "Plays",
        items: artists.map(function (a) { return { label: str(a.name, "artist"), value: num(a.plays, "plays") }; }),
        text: function (v) { return plural(v, "play", "plays"); }
      }),
      h("div", { class: "chart-block chart-block--hours" },
        h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, "When I listen, by hour of day, last 30 days"), t.button),
        strip, axis, t.table)
    ];
  }

  // Keeps at most `max` bars: if there are more, the largest max - 1 stay
  // and the rest (plus any existing "Other") fold into one "Other" bar.
  function topWithOther(items, max) {
    if (items.length <= max) return items;
    var isOther = function (i) { return /^other$/i.test(i.label); };
    var named = items.filter(function (i) { return !isOther(i); })
      .sort(function (a, b) { return b.value - a.value; });
    var kept = named.slice(0, max - 1);
    var rest = named.slice(max - 1).concat(items.filter(isOther))
      .reduce(function (sum, i) { return sum + i.value; }, 0);
    return kept.concat([{ label: "Other", value: rest }]);
  }

  function eatingPanel(data) {
    var e = data.eating;
    need(isObj(e), "eating");
    var state = sourceState(sourceOf(data, e.source), true);
    if (!state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var top = arr(e.top, "eating.top");
    var cuisines = topWithOther(arr(e.cuisines, "eating.cuisines").map(function (c) {
      need(isObj(c), "cuisine");
      return { label: str(c.name, "cuisine"), value: num(c.count, "count") };
    }), MAX_CUISINES);

    return [
      state.asOf ? staleNote(state.asOf) : null,
      stat("Restaurants ranked", String(num(e.ranked_count, "ranked_count"))),
      h("div", { class: "list" },
        h("div", { class: "list-title" }, "Current top " + (["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][top.length] || top.length)),
        h("ol", { class: "list-items list-items--ranked" }, top.map(function (r) {
          need(isObj(r), "restaurant");
          return h("li", { class: "list-item" },
            h("span", { class: "item-rank" }, num(r.rank, "rank")),
            h("span", { class: "item-name" }, str(r.name, "restaurant name")),
            h("span", { class: "item-meta" }, typeof r.city === "string" ? r.city : ""),
            h("span", { class: "item-score" }, num(r.score, "score").toFixed(1)));
        }))),
      barChart({
        title: "What I rank most",
        labelHeading: "Cuisine",
        valueHeading: "Places",
        items: cuisines,
        text: function (v) { return plural(v, "place", "places"); }
      })
    ];
  }

  // ---------- assembly ----------

  var PANELS = [
    ["panel-fantasy", fantasyPanel],
    ["panel-watching", watchingPanel],
    ["panel-listening", listeningPanel],
    ["panel-eating", eatingPanel]
  ];

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
      var missing = data && err && /bad (fantasy|watching|listening|eating)$/.test(err.message);
      nodes = [h("p", { class: "panel-empty" }, missing ? NOT_CONNECTED : BROKEN)];
    }
    append(panel, nodes);
  }

  function render(data, isSample) {
    var sample = isSample || !!(data && data.sample === true);
    var badge = document.getElementById("lately-sample-badge");
    var note = document.getElementById("lately-sample-note");
    if (badge) badge.hidden = !sample;
    if (note) note.hidden = !sample;
    try { renderChips(data); } catch (e) { /* chips are decoration */ }
    PANELS.forEach(function (p) { fill(p[0], p[1], data); });
  }

  // The top level must be the right shape; panels validate their own parts.
  function looksValid(data) {
    return isObj(data) && data.schema_version === 1 && isObj(data.sources);
  }

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
