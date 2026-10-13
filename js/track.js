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
  "use strict";

  var main = document.querySelector(".tp-main");
  if (!main || !window.requestAnimationFrame) return;

  var SPEEDS = [1, 1.5, 2];
  var GLIDE = 3;    // seconds from the top of the page to the first section (not counted in the clock)
  var HOLD = 0.6;   // share of a figure's time spent holding still at it
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var sections = [].slice.call(document.querySelectorAll(".tp-section"));
  var segs = [].slice.call(document.querySelectorAll(".tp-seg"));
  var stopEl = document.querySelector("[data-stop]") || document.querySelector(".tp-other");
  var player = document.querySelector(".tp-player");
  var controls = document.querySelector(".tp-controls");
  var help = document.getElementById("tp-play-help");
  var status = document.querySelector(".tp-status");
  var speedBtn = document.querySelector(".tp-speed");
  var clockNow = document.querySelector(".tp-clock-now");
  if (!sections.length || !segs.length) return;

  // ---------- timeline ----------

  var starts = [], durs = [], total = 0;
  sections.forEach(function (s, i) {
    starts.push(total);
    var d = parseFloat(segs[i] && segs[i].getAttribute("data-secs")) || 0;
    durs.push(d);
    total += d;
  });

  var keys = [];      // [{t, y}] with t and y never decreasing
  var offset = 72;    // the reading line: how far below the top of the window the text being read sits

  function docTop(el) { return el.getBoundingClientRect().top + window.pageYOffset; }
  function maxScroll() { return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); }

  function buildKeys() {
    var mini = document.querySelector(".tp-mini");
    offset = (mini ? mini.offsetHeight : 0) + 24;
    var end = Math.min(maxScroll(), Math.max(0, docTop(stopEl) + stopEl.offsetHeight - window.innerHeight + 32));
    keys = [{ t: -GLIDE, y: 0 }];
    sections.forEach(function (s, i) {
      var t = starts[i];
      var blocks = [].slice.call(s.querySelectorAll(".tp-section-body > *"));
      var secs = blocks.map(function (b) { return parseFloat(b.getAttribute("data-secs")) || 0; });
      var sum = secs.reduce(function (a, b) { return a + b; }, 0);
      var scale = sum > 0 ? durs[i] / sum : 0; // keep the section on the build's clock exactly
      keys.push({ t: t, y: docTop(s) - offset });
      blocks.forEach(function (b, k) {
        var d = secs[k] * scale;
        var y = docTop(b) - offset;
        if (k > 0) keys.push({ t: t, y: y });
        if (b.hasAttribute("data-pause")) keys.push({ t: t + d * HOLD, y: y });
        t += d;
      });
    });
    keys.push({ t: total, y: end });
    var y = 0;
    keys.forEach(function (k) { y = Math.max(y, Math.min(k.y, end)); k.y = y; });
  }

  function yAt(t) {
    if (t <= keys[0].t) return keys[0].y;
    for (var i = 1; i < keys.length; i++) {
      var a = keys[i - 1], b = keys[i];
      if (t <= b.t) return b.t > a.t ? a.y + (b.y - a.y) * (t - a.t) / (b.t - a.t) : b.y;
    }
    return keys[keys.length - 1].y;
  }

  function tAt(y) {
    for (var i = 1; i < keys.length; i++) {
      var a = keys[i - 1], b = keys[i];
      if (y < b.y || (i === keys.length - 1 && y <= b.y)) {
        return b.y > a.y ? a.t + (b.t - a.t) * (y - a.y) / (b.y - a.y) : a.t;
      }
    }
    return total;
  }

  // ---------- display ----------

  function clock(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  var current = -1;
  function show(t) {
    // The current section is the one under the reading line.
    var line = window.pageYOffset + offset + 4;
    var idx = 0;
    sections.forEach(function (s, i) { if (docTop(s) <= line) idx = i; });
    if (window.pageYOffset >= maxScroll() - 2) idx = sections.length - 1;
    segs.forEach(function (a, i) {
      var f = t >= starts[i] + durs[i] ? 1 : t <= starts[i] ? 0 : (t - starts[i]) / durs[i];
      a.style.setProperty("--fill", f);
      a.classList.toggle("is-current", i === idx);
      if (i === idx) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
    if (clockNow) clockNow.textContent = clock(t);
    if (mini) {
      mini.fill.style.width = (Math.max(0, Math.min(1, t / total)) * 100) + "%";
      if (idx !== current) mini.name.textContent = segs[idx].querySelector(".tp-seg-name").textContent;
    }
    current = idx;
  }

  // ---------- compact bar, shown once the full bar has scrolled away ----------

  var mini = null;
  function makeMini() {
    var bar = document.createElement("div");
    bar.className = "tp-mini";
    bar.hidden = true;
    var btn = playButton(true);
    var name = document.createElement("span");
    name.className = "tp-mini-name";
    var track = document.createElement("span");
    track.className = "tp-mini-track";
    track.setAttribute("aria-hidden", "true");
    var fill = document.createElement("span");
    fill.className = "tp-mini-fill";
    track.appendChild(fill);
    starts.slice(1).forEach(function (s) {
      var tick = document.createElement("span");
      tick.className = "tp-mini-tick";
      tick.style.left = (s / total) * 100 + "%";
      track.appendChild(tick);
    });
    var label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = "Now reading: ";
    var wrap = document.createElement("span");
    wrap.className = "tp-mini-now";
    wrap.appendChild(label);
    wrap.appendChild(name);
    bar.appendChild(btn);
    bar.appendChild(wrap);
    bar.appendChild(track);
    document.body.appendChild(bar);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        bar.hidden = entries[0].isIntersecting || entries[0].boundingClientRect.top > 0;
      }).observe(player);
    }
    return { bar: bar, name: name, fill: fill };
  }

  var buttons = [];
  function playButton(compact) {
    var b = compact ? document.createElement("button") : document.querySelector(".tp-play");
    if (compact) {
      b.type = "button";
      b.className = "tp-play tp-play--mini";
      b.setAttribute("aria-describedby", "tp-play-help");
      b.innerHTML = '<span class="tp-play-icon" aria-hidden="true"></span><span class="tp-play-text">play</span>';
    }
    b.addEventListener("click", function () { if (playing) pause("Paused."); else play(); });
    buttons.push(b);
    return b;
  }

  // ---------- playing ----------

  var playing = false, t = 0, speed = 1, lastY = null, lastFrame = 0, timer = null;
  var endedAt = null; // where the last play finished; pressing play there starts again from the top

  function setButtons() {
    buttons.forEach(function (b) {
      b.classList.toggle("is-playing", playing);
      b.querySelector(".tp-play-text").textContent = playing ? "pause" : "play";
      b.setAttribute("aria-label", playing ? "Pause automatic scrolling" : "Play: scroll through this page automatically");
    });
  }
  function say(s) { if (status) status.textContent = s; }

  function scrollToY(y) {
    y = Math.round(Math.min(y, maxScroll()));
    lastY = y;
    window.scrollTo({ top: y, left: 0, behavior: "instant" });
  }

  function play() {
    buildKeys();
    t = tAt(window.pageYOffset);
    if (endedAt !== null && Math.abs(window.pageYOffset - endedAt) < 4) { t = -GLIDE; scrollToY(0); }
    endedAt = null;
    playing = true;
    setButtons();
    say("Playing at " + speed + "×.");
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
    starts.forEach(function (s, k) { if (t >= s - 0.01) i = k; });
    var wait = Math.max(0.5, starts[i] + durs[i] - Math.max(t, starts[i])) / speed;
    timer = setTimeout(function () {
      if (!playing) return;
      if (i + 1 >= sections.length) { t = total; scrollToY(yAt(total)); show(t); return finish(); }
      t = starts[i + 1];
      scrollToY(docTop(sections[i + 1]) - offset);
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
    pause("Stopped at the end of the page.");
  }

  // Anything the reader does to the page pauses play.
  function userInput(e) {
    if (!playing) return;
    if (e.target && e.target.closest && e.target.closest(".tp-play, .tp-speed")) return;
    pause("Paused.");
  }
  ["wheel", "touchstart", "pointerdown"].forEach(function (type) {
    window.addEventListener(type, userInput, { passive: true });
  });
  window.addEventListener("keydown", function (e) {
    if (!playing || e.altKey || e.ctrlKey || e.metaKey) return;
    var control = e.target && e.target.closest && e.target.closest("button, a, audio, input, select, textarea, summary");
    if (e.key === " " && !control) {
      e.preventDefault(); // space pauses instead of scrolling
      pause("Paused.");
    } else if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End)$/.test(e.key)) {
      pause("Paused.");
    }
  });

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (playing && lastY !== null && Math.abs(window.pageYOffset - lastY) > 3) pause("Paused.");
    if (playing || ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; show(tAt(window.pageYOffset)); });
  }, { passive: true });
  window.addEventListener("resize", function () {
    buildKeys();
    if (!playing) show(tAt(window.pageYOffset));
  });

  if (speedBtn) {
    speedBtn.addEventListener("click", function () {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      speedBtn.textContent = "speed " + speed + "×";
      speedBtn.setAttribute("aria-label", "Playback speed, " + speed + "×");
      if (playing) say("Playing at " + speed + "×.");
    });
  }

  // ---------- start ----------

  controls.hidden = false;
  help.hidden = false;
  playButton(false);
  mini = makeMini();
  setButtons();
  function ready() { buildKeys(); show(tAt(window.pageYOffset)); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready); else ready();
  window.addEventListener("load", ready);
  ready();

})();
