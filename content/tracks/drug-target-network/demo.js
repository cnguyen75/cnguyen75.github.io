// Drug–target demo, for this page only: the model's top five suggestions for each
// demo drug in demo.json, with the drug's known targets. Scores are a ranking signal,
// not a probability; the file's score_note is always shown beside them.
(function () {
  "use strict";
  var slot = document.querySelector(".tp-demo[data-src]");
  if (!slot) return;
  var NS = "http://www.w3.org/2000/svg";

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
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function score(p) { return (p.score_tied ? "=" : "") + p.score.toFixed(2); }
  function gene(t) { return t.gene || t.uniprot; }

  function fail() {
    slot.textContent = "";
    slot.appendChild(h("p", "tp-demo-fallback", "The suggestions could not be loaded. The results below do not depend on them."));
  }

  if (!window.fetch) return fail();
  fetch(slot.getAttribute("data-src"))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.schema_version !== 1 || !data.drugs || !data.drugs.length) throw new Error("schema");
      build(data);
    })
    .catch(fail);

  function build(data) {
    // Imatinib first, then the file's order.
    var drugs = data.drugs.slice().sort(function (a, b) { return (b.name === "Imatinib") - (a.name === "Imatinib"); });
    var sel = 0;

    slot.textContent = "";
    var root = h("div", "dt");

    var chips = h("div", "dt-chips");
    chips.setAttribute("role", "toolbar");
    chips.setAttribute("aria-label", "Drugs. Use the arrow keys to move between them.");
    var buttons = drugs.map(function (d, i) {
      var b = h("button", "tp-pick dt-chip");
      b.type = "button";
      b.tabIndex = -1;
      b.appendChild(h("span", null, d.name));
      if (d.known_target_count === 0) b.appendChild(h("span", "dt-chip-note", "no known targets"));
      b.addEventListener("click", function () { select(i, true); });
      chips.appendChild(b);
      return b;
    });
    chips.addEventListener("keydown", function (e) {
      var to = { ArrowRight: sel + 1, ArrowDown: sel + 1, ArrowLeft: sel - 1, ArrowUp: sel - 1, Home: 0, End: drugs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select((to + drugs.length) % drugs.length, true);
    });

    var out = h("div", "dt-out");
    out.setAttribute("aria-live", "polite");
    add(root, chips, out);
    slot.appendChild(root);

    function select(i, focus) {
      sel = i;
      buttons.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      render(drugs[i]);
      if (focus) buttons[i].focus();
    }

    function render(d) {
      out.textContent = "";
      var head = h("div", "dt-head");
      add(head,
        h("h3", "dt-name", d.name),
        h("span", "dt-meta", d.id + " · " + (d.known_target_count === 0
          ? "no known human targets"
          : d.known_target_count + " known human target" + (d.known_target_count === 1 ? "" : "s"))));
      out.appendChild(head);
      out.appendChild(figure(d));

      var note = h("p", "dt-note");
      add(note, h("strong", null, "How to read a score: "), document.createTextNode(data.score_note));
      var tied = d.predicted.some(function (p) { return p.score_tied; });
      if (tied) note.appendChild(document.createTextNode(" “=” marks a tie: the model cannot order tied candidates."));
      out.appendChild(note);

      var list = h("ol", "dt-list");
      list.setAttribute("aria-label", "Top five suggested targets for " + d.name);
      d.predicted.forEach(function (p) {
        var li = h("li", "dt-item");
        var top = h("div", "dt-item-top");
        add(top,
          h("span", "dt-gene", gene(p)),
          h("span", "dt-score", "score " + score(p)),
          h("span", "dt-pop", p.target_known_drug_count + " known drug" + (p.target_known_drug_count === 1 ? "" : "s")));
        add(li, top, h("p", "dt-why" + (p.reason.kind === "none" ? " dt-why--none" : ""), p.reason.text));
        list.appendChild(li);
      });
      out.appendChild(add(h("div", "dt-sugg"), h("h4", "dt-sub", "Five suggestions"), list));
    }

    // Drug in the middle, known targets (solid squares) to the left, predicted (dashed) to the right.
    function figure(d) {
      var known = d.known_targets || [], pred = d.predicted;
      var W = 760, rowK = 22, rowP = 44;
      var H = Math.max(200, known.length * rowK + 30, pred.length * rowP + 30);
      var cx = W / 2, cy = H / 2, R = 54;
      var svg = s("svg", { viewBox: "0 0 " + W + " " + H, class: "dt-svg", role: "img",
        "aria-label": d.name + ": " + (known.length ? known.length + " known targets, " : "no known targets, ") +
          "and " + pred.length + " predicted targets, listed below." });

      function spread(n, i, gap) { return cy + (i - (n - 1) / 2) * gap; }
      function bulge(n, i) { var t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; return Math.cos(t * Math.PI / 2); }

      var lines = s("g"), nodes = s("g");
      known.forEach(function (t, i) {
        var y = spread(known.length, i, rowK), x = cx - 150 - 50 * bulge(known.length, i);
        lines.appendChild(s("line", { x1: cx, y1: cy, x2: x, y2: y, class: "dt-edge" }));
        nodes.appendChild(s("rect", { x: x - 7, y: y - 7, width: 14, height: 14, class: "dt-known" }));
        nodes.appendChild(s("text", { x: x - 13, y: y + 4.5, "text-anchor": "end", class: "dt-label" }, gene(t)));
      });
      if (!known.length) {
        nodes.appendChild(s("text", { x: cx - R - 24, y: cy + 4.5, "text-anchor": "end", class: "dt-label dt-label--soft" }, "no known human targets"));
      }
      pred.forEach(function (p, i) {
        var y = spread(pred.length, i, rowP), x = cx + 150 + 50 * bulge(pred.length, i);
        lines.appendChild(s("line", { x1: cx, y1: cy, x2: x, y2: y, class: "dt-edge dt-edge--pred" }));
        nodes.appendChild(s("rect", { x: x - 9, y: y - 9, width: 18, height: 18, class: "dt-pred" }));
        var label = s("text", { x: x + 16, y: y + 5, class: "dt-label" });
        label.appendChild(s("tspan", { class: "dt-label--bold" }, gene(p)));
        label.appendChild(s("tspan", { dx: 8 }, score(p)));
        nodes.appendChild(label);
      });
      add(svg, lines, nodes);
      svg.appendChild(s("circle", { cx: cx, cy: cy, r: R, class: "dt-drug" }));
      var words = d.name.length > 12 ? d.name.split(" ") : [d.name];
      words.forEach(function (w, k) {
        svg.appendChild(s("text", { x: cx, y: cy + 5 + (k - (words.length - 1) / 2) * 17, "text-anchor": "middle", class: "dt-drug-label" }, w));
      });

      var legend = h("p", "dt-legend");
      legend.setAttribute("aria-hidden", "true");
      add(legend,
        add(h("span"), h("span", "dt-key dt-key--known"), document.createTextNode(" known target (solid)")),
        add(h("span"), h("span", "dt-key dt-key--pred"), document.createTextNode(" predicted target (dashed), with its score")));
      return add(h("div", "dt-fig"), legend, svg);
    }

    select(0, false);
  }
})();
