/*
 * Side D, lately. Draws the data panels from data/lately.json, falling
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
  var MAX_CUISINES = 6; // named bars; anything beyond goes in the "Other" line

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
      list, t.table, opts.after || null);
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
    var shown = teams.map(function (t) {
      need(isObj(t), "team");
      return { team: t, src: sourceOf(data, t.source), state: sourceState(sourceOf(data, t.source), true) };
    });
    // Header names only sources with at least one team drawn from them.
    document.getElementById("fantasy-meta").textContent = srcKeys.filter(function (k) {
      return shown.some(function (s) { return s.team.source === k && s.state.show; });
    }).map(function (k) {
      var s = sourceOf(data, k);
      return s && s.label ? s.label : k;
    }).join(" + ");
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

    // With no ratings at all, drop the score column instead of leaving a gap.
    var hasRatings = recent.some(function (e) { return typeof e.item.rating === "number"; });
    var empty = totalHours === 0;

    return [
      state.asOf ? staleNote(state.asOf) : null,
      empty ? null : stat("Hours watched, last " + n + " weeks", short(totalHours)),
      empty ? h("p", { class: "panel-empty" }, "No episodes or films logged in the last " + n + " weeks") : null,
      empty ? null : h("div", { class: "legend" }, legendItem("fill--films", "Films"), legendItem("fill--shows", "Shows"), legendItem("fill--anime", "Anime"), t.button),
      empty ? null : figure,
      empty ? null : t.table,
      watchingNow(w.currently_watching),
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
              : hasRatings ? h("span", { class: "item-score" }) : null);
        })))
    ];
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

  // Its own full-width card below the three panels. Returns null (card
  // hidden) when the field is absent or every list is empty, or when Simkl
  // has never produced good data.
  var RANKINGS = [["films", "Films"], ["shows", "Shows"], ["anime", "Anime"]];
  var RANK_SHOWN = 5, RANK_MAX = 10;
  var NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  // One ranking: the first five, and when there are more, a toggle that shows
  // the rest in the same list.
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

  function rankingsPanel(data) {
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
    var plays30 = hours.reduce(function (a, b) { return a + b; }, 0);

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
      stat("Plays, last 30 days", String(plays30)),
      barChart({
        title: "Top artists, last 30 days",
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

  function eatingPanel(data) {
    var e = data.eating;
    need(isObj(e), "eating");
    var state = sourceState(sourceOf(data, e.source), true);
    if (!state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];
    var recent = arr(e.recent, "eating.recent"); // newest first; order is the only signal
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
            h("span", { class: "item-meta" }, typeof r.city === "string" ? r.city : ""),
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

  // ---------- lifting ----------

  var MAX_MUSCLES = 8; // named bars; the rest are summed into one "Other" bar
  var MAX_PRS = 5;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  function liftingPanel(data) {
    var l = data.lifting;
    need(isObj(l), "lifting");
    var src = sourceOf(data, l.source);
    var srcLabel = src && typeof src.label === "string" && src.label ? src.label : String(l.source);
    var meta = document.getElementById("lifting-meta");
    var state = sourceState(src, true);
    if (meta) meta.textContent = srcLabel;
    if (!state.show) return [h("p", { class: "panel-empty" }, NOT_CONNECTED)];

    var unit = l.unit === "kg" ? "kg" : "lb";
    var through = l.data_through === null ? null : calDate(l.data_through, "data_through");
    var count = num(l.workout_count, "workout_count");
    if (count === 0 && meta && through) meta.textContent = srcLabel + " · data through " + dateText(through, true);
    if (count === 0) return [state.asOf ? staleNote(state.asOf) : null, h("p", { class: "panel-empty" }, "No workouts logged yet.")];

    var firstWorkout = l.first_workout === null ? null : calDate(l.first_workout, "first_workout");
    var weeks = arr(l.weeks, "lifting.weeks").map(function (w) {
      need(isObj(w), "lifting week");
      return { start: calDate(w.week_start, "week_start"), sessions: num(w.sessions, "week.sessions"), volume: num(w.volume, "week.volume") };
    });
    need(weeks.length > 0, "lifting.weeks");
    var recent4 = weeks.slice(-4).reduce(function (a, w) { return a + w.sessions; }, 0);
    var minSessions = num(l.streak_min_sessions, "streak_min_sessions");
    var lifts = arr(l.main_lifts, "main_lifts").map(function (lift) { return liftTile(lift, unit); });
    var active = weeks.some(function (w) { return w.sessions > 0 || w.volume > 0; });
    // Only once everything above has passed, so a broken panel doesn't claim a date.
    if (meta && through) meta.textContent = srcLabel + " · data through " + dateText(through, true);

    return [
      state.asOf ? staleNote(state.asOf) : null,
      h("div", { class: "stats" },
        stat("Workouts logged", thousands(count), firstWorkout ? "since " + dateText(firstWorkout, true) : null),
        stat("Current streak", String(num(l.streak_weeks, "streak_weeks")),
          minSessions === 1 ? "weeks with a workout" : "weeks at " + minSessions + "+ sessions"),
        stat("Sessions, last 4 weeks", String(recent4), "including this week so far")),
      lifts.length ? h("div", { class: "chart-block" },
        h("div", { class: "chart-head" }, h("div", { class: "chart-title" }, "Estimated one-rep max, main lifts")),
        h("div", { class: "lifts" }, lifts),
        h("p", { class: "chart-foot" }, EPLEY_NOTE)) : null,
      h("div", { class: "lift-grid" },
        active ? volumeChart(weeks, unit)
          : h("div", { class: "chart-block" },
              h("div", { class: "chart-title" }, "Sessions and volume, last " + weeks.length + " weeks"),
              h("p", { class: "panel-empty" }, "No workouts logged in the last " + weeks.length + " weeks")),
        muscleChart(l.muscle_sets),
        prList(l.recent_prs),
        bodyWeight(l.body_weight, unit))
    ];
  }

  // ---------- assembly ----------

  var PANELS = [
    ["panel-fantasy", fantasyPanel],
    ["panel-watching", watchingPanel],
    ["panel-listening", listeningPanel],
    ["panel-eating", eatingPanel],
    ["panel-rankings", rankingsPanel, { optional: true }],
    ["panel-lifting", liftingPanel]
  ];

  // Optional panels are hidden, not marked "not connected", when there is
  // nothing to draw or drawing fails.
  function fill(panelId, build, data, opts) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    if (opts && opts.optional) {
      while (panel.children.length > 1) panel.removeChild(panel.lastElementChild);
      var extra = null;
      try { extra = data ? build(data) : null; } catch (err) {
        if (window.console) console.warn("lately: " + panelId + " not drawn:", err.message);
      }
      panel.hidden = !extra;
      append(panel, extra);
      return;
    }
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
  }

  function render(data, isSample) {
    var sample = isSample || !!(data && data.sample === true);
    var badge = document.getElementById("lately-sample-badge");
    var note = document.getElementById("lately-sample-note");
    if (badge) badge.hidden = !sample;
    if (note) note.hidden = !sample;
    try { renderChips(data); } catch (e) { /* chips are decoration */ }
    PANELS.forEach(function (p) { fill(p[0], p[1], data, p[2]); });
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
