// Paper Trader demo, for this page only: every live decision from demo.json.
// A strip of sessions (a list at phone width); selecting one shows its rule, the
// paper book and orders, the twin's book and whether they matched. Equity appears
// only as a percentage from the clock start. No balances, cash or order sizes in dollars.
(function () {
  "use strict";
  var slot = document.querySelector(".tp-demo[data-src]");
  if (!slot) return;

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var narrow = window.matchMedia("(max-width: 640px)");

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function day(iso, weekday) {
    var p = iso.split("-");
    return (weekday ? weekday + " " : "") + Number(p[2]) + " " + MONTHS[Number(p[1]) - 1] + " " + p[0];
  }
  function pct(x, dp) { return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(dp) + "%"; }
  function bps(x) { return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2) + " bps"; }

  function fail() {
    slot.textContent = "";
    add(slot, h("p", "tp-demo-fallback", "The decision log could not be loaded. The figures and table below show the same run."));
  }

  if (!window.fetch) return fail();
  fetch(slot.getAttribute("data-src"))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.schema_version !== 1 || !data.decisions || !data.decisions.length) throw new Error("schema");
      build(data);
    })
    .catch(fail);

  function missed(d) {
    var o = d.paper.rebalance_outcome;
    return !!(o && o.submitted === false);
  }

  function build(data) {
    var ds = data.decisions;
    var voidLabel = (data.voided && data.voided.reason ? data.voided.reason.split(":")[0] : "Setup error");
    // Default: the latest decision that sent orders.
    var sel = ds.length - 1;
    for (var k = ds.length - 1; k >= 0; k--) if (ds[k].paper.orders.length) { sel = k; break; }

    slot.textContent = "";
    var root = add(h("div", "pt"));

    // ---- strip (wider screens) ----
    var strip = h("div", "pt-strip");
    strip.setAttribute("role", "toolbar");
    strip.setAttribute("aria-label", "Sessions, " + day(ds[0].date) + " to " + day(ds[ds.length - 1].date) + ". Use the arrow keys to move between them.");
    var cells = h("div", "pt-grid pt-cells");
    var squares = [];
    var nVoid = ds.filter(function (d) { return d.voided; }).length;
    strip.style.setProperty("--n", ds.length);
    var bandRow = h("div", "pt-grid pt-bandrow");
    bandRow.setAttribute("aria-hidden", "true");
    if (nVoid) {
      var band = add(h("span", "pt-band"), h("span", "pt-band-label", "voided"));
      band.style.gridColumn = "1 / span " + nVoid;
      bandRow.appendChild(band);
    }
    strip.appendChild(bandRow);
    ds.forEach(function (d, i) {
      var b = h("button", "pt-sq" + (d.rule.action === "rebalance" ? " is-signal" : "") + (d.voided ? " is-void" : ""));
      b.type = "button";
      b.tabIndex = -1;
      b.textContent = missed(d) ? "M" : "";
      var label = day(d.date, d.weekday) + ", " + (d.rule.action === "rebalance" ? "signal day" : "hold");
      if (d.voided) label += ", voided";
      if (missed(d)) label += ", missed fill";
      label += ", " + (d.match === true ? "matched the twin" : d.match === false ? "did not match the twin" : "no twin recorded");
      b.setAttribute("aria-label", label);
      b.addEventListener("click", function () { select(i, true); });
      squares.push(b);
      cells.appendChild(b);
    });
    strip.appendChild(cells);
    strip.addEventListener("keydown", function (e) {
      var to = { ArrowRight: sel + 1, ArrowLeft: sel - 1, Home: 0, End: ds.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(Math.max(0, Math.min(ds.length - 1, to)), true);
    });
    var months = h("div", "pt-grid pt-months");
    months.setAttribute("aria-hidden", "true");
    ds.forEach(function (d, i) {
      if (i === 0 || d.date.slice(5, 7) !== ds[i - 1].date.slice(5, 7)) {
        var m = h("span", null, MONTHS[Number(d.date.slice(5, 7)) - 1]);
        m.style.gridColumn = String(i + 1);
        months.appendChild(m);
      }
    });
    strip.appendChild(months);
    var legend = h("p", "pt-legend");
    add(legend,
      add(h("span"), h("span", "pt-key pt-key--signal"), document.createTextNode(" signal day (filled)")),
      add(h("span"), h("span", "pt-key"), document.createTextNode(" hold (outlined)")),
      add(h("span"), h("span", "pt-key pt-key--m", "M"), document.createTextNode(" missed fill")),
      nVoid ? add(h("span"), h("span", "pt-key pt-key--void"), document.createTextNode(" voided")) : null);

    // ---- list (phone width) ----
    var list = h("ol", "pt-list");
    list.setAttribute("aria-label", "Sessions");
    var items = ds.map(function (d, i) {
      var li = h("li", "pt-item");
      var b = h("button", "pt-row");
      b.type = "button";
      b.setAttribute("aria-expanded", "false");
      add(b,
        h("span", "pt-row-date", day(d.date, d.weekday)),
        h("span", "pt-row-what", d.rule.action === "rebalance" ? "signal day" : "hold"),
        h("span", "pt-row-match", d.match === true ? "match" : d.match === false ? "no match" : "no twin"));
      var flags = h("span", "pt-row-flags");
      if (d.voided) flags.appendChild(h("span", "tp-tag pt-hatch", "voided"));
      if (missed(d)) flags.appendChild(h("span", "tp-tag", "M · missed fill"));
      if (flags.childNodes.length) b.appendChild(flags);
      b.addEventListener("click", function () { select(i, true); });
      li.appendChild(b);
      list.appendChild(li);
      return li;
    });

    var detail = h("div", "pt-detail");
    detail.setAttribute("aria-live", "polite");
    add(root, strip, legend, list, detail);
    slot.appendChild(root);

    function place() {
      if (narrow.matches) items[sel].appendChild(detail);
      else root.appendChild(detail);
    }
    if (narrow.addEventListener) narrow.addEventListener("change", place);

    function select(i, focus) {
      sel = i;
      squares.forEach(function (b, k) {
        b.setAttribute("aria-pressed", String(k === i));
        b.tabIndex = k === i ? 0 : -1;
      });
      items.forEach(function (li, k) { li.firstChild.setAttribute("aria-expanded", String(k === i)); li.classList.toggle("is-open", k === i); });
      render(ds[i]);
      place();
      if (focus && !narrow.matches) squares[i].focus();
    }

    function row(label, content) {
      var r = h("div", "pt-field");
      add(r, h("div", "pt-field-label", label), content);
      return r;
    }
    function book(syms, weight) {
      var p = h("div", "pt-book");
      syms.forEach(function (s) { p.appendChild(h("span", "pt-sym", s)); });
      if (!syms.length) p.appendChild(h("span", null, "nothing held"));
      if (weight) p.appendChild(h("span", "pt-weight", syms.length + " ETFs, " + (weight * 100).toFixed(2) + "% each"));
      return p;
    }

    // A long ledger note shows its first sentence, with a control for the rest.
    function reason(text) {
      var m = text.match(/^(.+?\.)\s+(\S[\s\S]*)$/);
      if (!m || text.length < 160) return h("p", "pt-reason", text);
      var wrap = h("div", "pt-reason");
      var first = h("p", null, m[1]);
      var rest = h("p", "pt-reason-rest", m[2]);
      rest.hidden = true;
      rest.id = "pt-note-" + Math.random().toString(36).slice(2, 8);
      var btn = h("button", "pt-more", "show full note");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", rest.id);
      btn.addEventListener("click", function () {
        rest.hidden = !rest.hidden;
        btn.setAttribute("aria-expanded", String(!rest.hidden));
        btn.textContent = rest.hidden ? "show full note" : "hide full note";
      });
      return add(wrap, first, rest, btn);
    }

    function render(d) {
      detail.textContent = "";
      var head = h("div", "pt-head");
      add(head,
        h("h3", "pt-title", day(d.date, d.weekday)),
        h("span", "pt-eq", d.equity_pct_from_clock_start === null
          ? (d.voided ? "equity: not counted (voided week)" : "equity: before the clock start")
          : "equity since the clock start: " + pct(d.equity_pct_from_clock_start, 2)));
      detail.appendChild(head);

      if (d.voided) {
        detail.appendChild(h("p", "pt-flag pt-hatch",
          "Voided · " + voidLabel + ". This session is kept in the record but not counted; the clock restarted on the next fill, " +
          day(data.clock_start.first_fill) + "."));
      }

      var rule = h("div");
      add(rule,
        h("p", "pt-rule", d.rule.action === "rebalance" ? "rebalance" : "hold"),
        reason(d.rule.reason),
        h("p", "pt-sub", "Market trend: " + (d.rule.regime_confirmed_off ? "confirmed off, so go to cash" : d.rule.regime_on ? "on (SPY above its 200-day average)" : "off")));
      detail.appendChild(row("rule", rule));

      var rebalance = d.rule.action === "rebalance";
      detail.appendChild(row(rebalance ? "target book" : "book held", book(d.paper.target_book, rebalance ? d.paper.target_weight : 0)));

      var o = d.paper.rebalance_outcome;
      var orders;
      if (missed(d)) {
        orders = h("p", "pt-flag");
        add(orders, h("span", "pt-m", "M"), document.createTextNode(" Missed fill. " + o.why + (o.incident ? " (" + o.incident + ")" : "")));
      } else if (d.paper.orders.length) {
        orders = h("div", "pt-orders");
        var t = h("table");
        var cap = h("caption", "pt-sub", "Submitted " + day(d.paper.orders[0].submit_date, null) + ". Shares and prices only.");
        t.appendChild(cap);
        var thead = h("thead"), tr = h("tr");
        ["order", "shares", "filled", "open", "vs open", "at"].forEach(function (c) { var th = h("th", null, c); th.scope = "col"; tr.appendChild(th); });
        add(t, add(thead, tr));
        var tb = h("tbody");
        d.paper.orders.forEach(function (od) {
          od.fills.forEach(function (f) {
            var r = h("tr");
            var th = h("th", null, od.side + " " + od.symbol);
            th.scope = "row";
            add(r, th, h("td", null, f.shares.toFixed(6)), h("td", null, f.price.toFixed(2)), h("td", null, f.session_open.toFixed(2)),
              h("td", null, bps(f.deviation_vs_open_bps)), h("td", null, f.filled_at.slice(11, 16) + (f.recorded_by === "backfill" ? " (backfilled)" : "")));
            tb.appendChild(r);
          });
        });
        add(orders, add(t, tb));
      } else {
        orders = h("p", "pt-sub", rebalance ? "No orders." : "No orders on a hold day.");
      }
      detail.appendChild(row("orders and fills", orders));

      detail.appendChild(row("twin's book", d.twin
        ? add(book(d.twin.target_book, 0), h("span", "pt-weight", d.twin.inputs_identical ? "same inputs" : "different inputs"))
        : h("p", "pt-sub", "No twin recorded for this decision.")));

      var verdict = h("p", "pt-match");
      verdict.textContent = d.match === true ? "✓ match: the live book and the twin's book are the same"
        : d.match === false ? "✗ no match: the books differ"
        : "– no twin to compare";
      if (missed(d) && d.match === true) verdict.textContent += ". The orders were never sent.";
      detail.appendChild(row("match", verdict));
    }

    select(sel, false);
  }
})();
