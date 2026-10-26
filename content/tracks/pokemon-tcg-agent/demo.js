// Pokémon TCG demo, for this page only: a decision-by-decision replay of one game
// from demo.json. Names and numbers only; energy symbols are printed as words.
// Left and right arrow keys step through the decisions.
(function () {
  "use strict";
  var slot = document.querySelector(".tp-demo[data-src]");
  if (!slot) return;

  var ENERGY = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting",
    D: "Darkness", M: "Metal", N: "Dragon", C: "Colorless", Y: "Fairy" };
  var narrow = window.matchMedia("(max-width: 640px)");

  function words(s) {
    return String(s).replace(/\{([A-Z])\}/g, function (m, k) { return ENERGY[k] || k; });
  }
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = words(text);
    return el;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  // Search values are 0–1000 in the file; shown as a 0–100 position estimate.
  function est(v) { return (v / 10).toFixed(1); }

  function fail() {
    slot.textContent = "";
    slot.appendChild(h("p", "tp-demo-fallback", "The game record could not be loaded. The results below do not depend on it."));
  }

  if (!window.fetch) return fail();
  fetch(slot.getAttribute("data-src"))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.schema !== "ptcg-replay/1" || !data.turns || !data.turns.length) throw new Error("schema");
      build(data);
    })
    .catch(fail);

  function build(data) {
    var me = data.about.agent_seat, them = 1 - me;
    var all = [];
    data.turns.forEach(function (t) { t.decisions.forEach(function (d) { all.push({ turn: t.turn, d: d }); }); });
    // Start at the first decision where the search overrode the policy.
    var cur = 0;
    for (var k = 0; k < all.length; k++) if (all[k].d.search && all[k].d.search.overrode_policy) { cur = k; break; }
    var showAll = false;

    slot.textContent = "";
    var root = h("div", "pk");
    root.tabIndex = 0;
    root.setAttribute("role", "group");
    root.setAttribute("aria-roledescription", "replay");
    root.setAttribute("aria-label", "Replay of one game, " + all.length + " decisions. Left and right arrow keys step.");

    // ---- stepper ----
    var bar = h("div", "pk-bar");
    var prev = h("button", "tp-pick pk-step", "← previous");
    var next = h("button", "tp-pick pk-step", "next →");
    prev.type = next.type = "button";
    var where = h("p", "pk-where");
    where.setAttribute("aria-live", "polite");
    add(bar, prev, where, next);

    var strip = h("div", "pk-strip");
    var dots = [];
    data.turns.forEach(function (t) {
      var g = h("div", "pk-turn");
      g.appendChild(h("span", "pk-turn-label", t.turn === 0 ? "setup" : "turn " + t.turn));
      var row = h("div", "pk-dots");
      t.decisions.forEach(function (d) {
        var i = dots.length;
        var s = d.search;
        var b = h("button", "pk-dot" + (s ? " is-search" : "") + (s && s.overrode_policy ? " is-override" : ""),
          s ? (s.overrode_policy ? "O" : "S") : "");
        b.type = "button";
        b.tabIndex = -1;
        b.setAttribute("aria-label", "Decision " + (i + 1) + (s ? (s.overrode_policy ? ", search overrode the policy" : ", search ran") : ""));
        b.addEventListener("click", function () { go(i); });
        dots.push(b);
        row.appendChild(b);
      });
      g.appendChild(row);
      strip.appendChild(g);
    });
    var legend = h("p", "pk-legend");
    legend.setAttribute("aria-hidden", "true");
    add(legend,
      add(h("span"), h("span", "pk-key"), document.createTextNode(" decision")),
      add(h("span"), h("span", "pk-key pk-key--s", "S"), document.createTextNode(" search ran")),
      add(h("span"), h("span", "pk-key pk-key--o", "O"), document.createTextNode(" search overrode the policy")));

    var view = h("div", "pk-view");
    add(root, bar, strip, legend, view);
    slot.appendChild(root);

    prev.addEventListener("click", function () { go(cur - 1); });
    next.addEventListener("click", function () { go(cur + 1); });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.target.closest && e.target.closest("input, select, textarea")) return;
      e.preventDefault();
      go(cur + (e.key === "ArrowRight" ? 1 : -1));
    });
    if (narrow.addEventListener) narrow.addEventListener("change", function () { render(); });

    function go(i) {
      if (i < 0 || i >= all.length) return;
      cur = i;
      showAll = false;
      render();
    }

    function mon(m, active) {
      var el = h("div", "pk-mon" + (active ? " pk-mon--active" : ""));
      add(el, h("span", "pk-mon-name", m.name),
        h("span", "pk-mon-hp", "HP " + m.hp + "/" + m.maxHp),
        h("span", "pk-mon-en", m.energy + " energy"));
      if (m.tools && m.tools.length) el.appendChild(h("span", "pk-mon-tool", "tool: " + m.tools.join(", ")));
      return el;
    }

    function side(st, who) {
      var el = h("section", "pk-side");
      el.setAttribute("aria-label", who);
      el.appendChild(h("h4", "pk-side-title", who));
      el.appendChild(h("div", "pk-label", "active"));
      el.appendChild(st.active ? mon(st.active, true) : h("p", "pk-none", "none"));
      el.appendChild(h("div", "pk-label", "bench (" + st.bench.length + ")"));
      if (st.bench.length) {
        var b = h("div", "pk-bench");
        st.bench.forEach(function (m) { b.appendChild(mon(m, false)); });
        el.appendChild(b);
      } else el.appendChild(h("p", "pk-none", "empty"));
      var counts = h("p", "pk-counts", "prizes " + st.prizes + " · hand " + st.hand + " · deck " + st.deck + " · discard " + st.discard);
      el.appendChild(counts);
      if (st.conditions && st.conditions.length) el.appendChild(h("p", "pk-counts", "conditions: " + st.conditions.join(", ")));
      if (st.hand_cards) {
        el.appendChild(h("div", "pk-label", "hand"));
        var hand = h("div", "pk-hand");
        st.hand_cards.forEach(function (c) { hand.appendChild(h("span", "pk-card", c)); });
        if (!st.hand_cards.length) hand.appendChild(h("span", "pk-none", "empty"));
        el.appendChild(hand);
      }
      return el;
    }

    function owner(w) { return w === "agent" ? "the agent's" : "the opponent's"; }
    function event(e) {
      var who = e.who === "agent" ? "Agent" : "Opponent";
      switch (e.e) {
        case "turn_start": return who + "'s turn begins";
        case "play": return who + " plays " + e.card;
        case "attach": return who + " attaches " + e.card + " to " + e.to;
        case "evolve": return who + " evolves " + e.from + " into " + e.into;
        case "switch": return who + " switches: " + e.active + " to the active spot, " + e.bench + " to the bench";
        case "attack": return who + "'s " + e.by + " uses " + e.attack;
        case "hp": return owner(e.who).replace(/^t/, "T") + " " + e.card + ": HP " + (e.change > 0 ? "+" : "−") + Math.abs(e.change);
        case "knocked_out": return owner(e.who).replace(/^t/, "T") + " " + e.card + " is knocked out";
        case "prize": return who + " takes a prize card";
        case "coin": return "Coin: " + (e.heads ? "heads" : "tails");
        default: return owner(e.who).replace(/^t/, "T") + " Pokémon is " + e.e;
      }
    }

    function render() {
      var step = all[cur], d = step.d, s = d.search;
      prev.disabled = cur === 0;
      next.disabled = cur === all.length - 1;
      where.textContent = "decision " + (cur + 1) + " of " + all.length + " · " + (step.turn === 0 ? "setup" : "turn " + step.turn) +
        " · choosing: " + d.context.replace(/_/g, " ");
      dots.forEach(function (b, i) { b.setAttribute("aria-current", i === cur ? "step" : "false"); b.classList.toggle("is-current", i === cur); });

      view.textContent = "";
      if (s && s.overrode_policy) {
        view.appendChild(h("p", "pk-override", "The search overrode the policy here: it played a different option from the one the policy scored highest."));
      }

      var board = h("div", "pk-board");
      add(board, side(d.state[me], "agent"), side(d.state[them], "opponent"));
      view.appendChild(board);

      var evs = h("div", "pk-block");
      evs.appendChild(h("h4", "pk-h", "since the last decision"));
      if (d.events_before.length) {
        var ul = h("ul", "pk-events");
        d.events_before.forEach(function (e) { ul.appendChild(h("li", null, event(e))); });
        evs.appendChild(ul);
      } else evs.appendChild(h("p", "pk-none", "nothing new"));
      view.appendChild(evs);

      // Options: every legal option and the policy's score. At phone width, the top five plus the one played.
      var opts = d.options.map(function (o, i) { return { o: o, i: i, played: d.chosen.indexOf(i) >= 0 }; });
      var ranked = opts.slice().sort(function (a, b) { return (b.o.score === null ? -1e9 : b.o.score) - (a.o.score === null ? -1e9 : a.o.score); });
      var shown = opts;
      if (narrow.matches && !showAll && opts.length > 6) {
        var keep = ranked.slice(0, 5).map(function (x) { return x.i; });
        shown = opts.filter(function (x) { return keep.indexOf(x.i) >= 0 || x.played; });
      }
      var ob = h("div", "pk-block");
      ob.appendChild(h("h4", "pk-h", "options (" + d.options.length + ") and the policy's score"));
      var ol = h("ol", "pk-opts");
      shown.forEach(function (x) {
        var li = h("li", "pk-opt" + (x.played ? " is-played" : ""));
        li.value = x.i + 1;
        add(li, h("span", "pk-opt-label", x.o.label),
          h("span", "pk-opt-score", x.o.score === null ? "not scored" : "score " + x.o.score),
          x.played ? h("span", "tp-tag", "played") : null);
        ol.appendChild(li);
      });
      ob.appendChild(ol);
      if (shown.length < opts.length) {
        var more = h("button", "tp-pick pk-more", "show all " + opts.length + " options");
        more.type = "button";
        more.addEventListener("click", function () { showAll = true; render(); });
        ob.appendChild(more);
      }
      view.appendChild(ob);

      var sb = h("div", "pk-block");
      sb.appendChild(h("h4", "pk-h", "search"));
      if (s) {
        sb.appendChild(h("p", "pk-sub", "Compared " + s.candidates.length + " candidates over " + s.worlds +
          " sampled versions of the hidden cards. Bars show each one's position estimate, 0 to 100: the agent's own score for the position, not a probability."));
        var bars = h("ul", "pk-bars");
        s.candidates.forEach(function (ci, k) {
          var li = h("li", "pk-bar-row");
          var lab = h("span", "pk-bar-label", d.options[ci].label);
          var track = h("span", "pk-bar-track");
          var fill = h("span", "pk-bar-fill" + (ci === s.picked ? " is-picked" : ""));
          fill.style.width = (s.mean_value[k] / 10) + "%";
          track.appendChild(fill);
          track.setAttribute("aria-hidden", "true");
          var tags = h("span", "pk-bar-tags");
          if (k === 0) tags.appendChild(h("span", "tp-tag pk-tag-soft", "policy's pick"));
          if (ci === s.picked) tags.appendChild(h("span", "tp-tag", "played"));
          add(li, lab, track, h("span", "pk-bar-value", est(s.mean_value[k])), tags);
          bars.appendChild(li);
        });
        sb.appendChild(bars);
      } else {
        sb.appendChild(h("p", "pk-none", "The search did not run for this decision; the policy's choice was played."));
      }
      view.appendChild(sb);

      if (cur === all.length - 1 && data.result) {
        view.appendChild(h("p", "pk-result", "After this decision: " + (data.result.winner === "draw" ? "a draw." : "the " + data.result.winner + " wins.")));
      }
    }

    render();
  }
})();
