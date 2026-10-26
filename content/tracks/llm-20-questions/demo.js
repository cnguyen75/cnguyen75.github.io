// 20 Questions replay, for this page only: one recorded self-play game per tab (demo.json,
// then the files named in data-more), stepped through round by round: the question, the
// answer, the guess and whether the guess is a word on the agent's candidate list
// (guess_matched_candidate; the file's about.guess_matched_candidate says how it's judged). Each tab says which run and models it comes from, in the file's
// own words. Keyboard: left and right arrows step.
(function () {
  "use strict";
  var slot = document.querySelector(".tp-demo[data-src]");
  if (!slot) return;

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function tabName(d) {
    return /Qwen3/.test(d.about.model) ? "Qwen3-8B (2025)" : "2024 models";
  }

  // Whether a turn's guess is on the candidate list, in words; nothing claimed when the file has no flag.
  function onList(t) {
    if (t.guess_matched_candidate === true) return "on the candidate list";
    if (t.guess_matched_candidate === false) return "not on the candidate list";
    return "not recorded";
  }

  function fail() {
    slot.textContent = "";
    slot.appendChild(h("p", "tp-demo-fallback", "The replay could not be loaded. The results below do not depend on it."));
  }

  function draw(games) {
    var root = h("div", "q20");
    var tabs = h("div", "q20-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Recorded game");
    var panel = h("div", "q20-panel");
    panel.setAttribute("role", "tabpanel");
    panel.id = "q20-panel";
    root.appendChild(tabs);
    root.appendChild(panel);
    var buttons = [], game = 0, round = 0;

    games.forEach(function (d, i) {
      var b = h("button", "q20-tab", tabName(d));
      b.type = "button";
      b.id = "q20-tab-" + i;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "q20-panel");
      b.addEventListener("click", function () { show(i, 0); });
      b.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          var j = (i + (e.key === "ArrowRight" ? 1 : games.length - 1)) % games.length;
          show(j, 0);
          buttons[j].focus();
        }
      });
      buttons.push(tabs.appendChild(b));
    });

    var about = h("p", "q20-about");
    var word = h("p", "q20-word");
    var step = h("div", "q20-step");
    var prev = h("button", "q20-btn", "← previous");
    var next = h("button", "q20-btn", "next →");
    var where = h("span", "q20-where");
    where.setAttribute("aria-live", "polite");
    prev.type = next.type = "button";
    prev.addEventListener("click", function () { show(game, round - 1); });
    next.addEventListener("click", function () { show(game, round + 1); });
    var nav = h("div", "q20-nav");
    nav.appendChild(prev); nav.appendChild(where); nav.appendChild(next);
    var turn = h("dl", "q20-turn");
    var past = h("ol", "q20-past");
    var end = h("p", "q20-end");
    step.appendChild(nav); step.appendChild(turn); step.appendChild(end); step.appendChild(past);
    panel.appendChild(about); panel.appendChild(word); panel.appendChild(step);
    panel.tabIndex = 0;
    panel.addEventListener("keydown", function (e) {
      if (e.target.tagName === "BUTTON" && e.target.getAttribute("role") === "tab") return;
      if (e.key === "ArrowRight") { e.preventDefault(); show(game, round + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); show(game, round - 1); }
    });

    function row(dl, term, text) {
      dl.appendChild(h("dt", null, term));
      dl.appendChild(h("dd", null, text));
    }

    function show(g, r) {
      var d = games[g], rounds = d.rounds;
      game = g;
      round = Math.max(0, Math.min(rounds.length - 1, r));
      buttons.forEach(function (b, i) {
        b.setAttribute("aria-selected", String(i === g));
        b.tabIndex = i === g ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", buttons[g].id);
      about.textContent = d.about.what + " Models: " + d.about.model + ".";
      word.textContent = "";
      word.appendChild(document.createTextNode("Secret word: "));
      word.appendChild(h("strong", null, d.keyword));
      var t = rounds[round];
      where.textContent = "round " + t.round + " of " + d.rounds_played;
      prev.disabled = round === 0;
      next.disabled = round === rounds.length - 1;
      turn.textContent = "";
      row(turn, "question", t.question);
      row(turn, "answer", t.answer);
      row(turn, "guess", t.guess);
      row(turn, "candidate list", t.guess_matched_candidate === true ? "the guess is on it" : t.guess_matched_candidate === false ? "the guess is not on it" : "not recorded");
      end.textContent = round === rounds.length - 1
        ? (d.won ? "Guessed in round " + t.round + "." : "Not guessed in " + d.rounds_played + " rounds.")
        : "";
      past.textContent = "";
      for (var i = round - 1; i >= 0; i--) {
        var li = h("li", "q20-past-item");
        li.value = rounds[i].round;
        li.appendChild(h("span", "q20-past-q", rounds[i].question));
        li.appendChild(h("span", "q20-past-a", rounds[i].answer + " · guess: " + rounds[i].guess + " · " + onList(rounds[i])));
        past.appendChild(li);
      }
      past.hidden = round === 0;
    }

    slot.textContent = "";
    slot.appendChild(root);
    show(0, 0);
  }

  var srcs = [slot.getAttribute("data-src")].concat((slot.getAttribute("data-more") || "").split(" ").filter(Boolean));
  Promise.all(srcs.map(function (u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  })).then(draw).catch(fail);
})();
