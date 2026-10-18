"""Tests for the Lately in-depth pages: build.py's "data" register (content/lately/) and
how js/lately-depth.js draws the analysis block, there and on the main page's panels (the
analysis-first Side D: a question, a two-sentence answer, numbers and one chart per panel).

The register checks need nothing extra. The drawing checks load the pages in headless
Chrome through tools/node_modules (cd tools && npm install) and are skipped without them.
They use tests/fixtures/analysis.json, a copy of the pipeline's sample with every name
replaced. Run: python3 -m unittest discover tests
"""

import copy
import functools
import html
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402

SCHEMA = json.loads((ROOT / build.SCHEMA_PATH).read_text(encoding="utf-8"))
SAMPLE = json.loads((ROOT / "data/lately.sample.json").read_text(encoding="utf-8"))
ANALYSIS = json.loads((ROOT / "tests/fixtures/analysis.json").read_text(encoding="utf-8"))["analysis"]
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
FEEDS = build.DATA_FEEDS
WIDTHS = (360, 390, 1280)
INK = "rgb(35, 31, 27)"
CLEAR = "rgba(0, 0, 0, 0)"


def content(feed):
    return (ROOT / "content/lately" / f"{feed}.md").read_text(encoding="utf-8")


class Register(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def read(self, feed, text):
        path = self.dir / f"{feed}.md"
        path.write_text(text, encoding="utf-8")
        return build.read_data_page(path, SCHEMA)

    # A page is a frame: headline row, the source with its as_of slot, one section per
    # STAT: line with a slot naming its statistics. No numbers are written into it.
    def test_page_frame(self):
        doc = build.render_data_page(self.read("fantasy", content("fantasy")))
        self.assertIn('<div class="ld-headline" data-feed="fantasy"', doc)
        self.assertIn('data from <a href="https://sleeper.com" target="_blank" rel="noopener">Sleeper</a> and <a href="https://www.espn.com/fantasy/football/" target="_blank" rel="noopener">ESPN</a>', doc)
        self.assertIn('as of <time class="ld-asof-date">', doc)
        self.assertRegex(doc, r'<h3 class="ld-section-title" id="is-the-win-chance-honest-h">Is the win chance honest\?</h3>'
                              r'<div class="ld-stat" data-stat="grading\.win_chance">')
        self.assertEqual(len(re.findall(r'<section class="ld-section ', doc)), content("fantasy").count("\n## "))
        # Two groups, in order, each section inside one; the contents list is grouped the same way.
        self.assertRegex(doc, r'<section class="ld-group ld-group--whats-happening" id="whats-happening".*?<h2 class="ld-group-title" id="whats-happening-h">What&#x27;s happening</h2>'
                              r'.*</section><section class="ld-group ld-group--why" id="why".*?<h2 class="ld-group-title" id="why-h">Why</h2>')
        self.assertRegex(doc, r'<li class="ld-toc-group" data-group="whats-happening"><span class="ld-toc-label">What&#x27;s happening</span><ol><li><a href="#my-teams-week-by-week">')
        # Feed blocks, the conditional credit, and the feed script the blocks need.
        self.assertIn('<div class="ld-feed" data-block="fantasy.lineup"></div>', doc)
        self.assertIn('<p class="ld-attribution" data-when-source="yahoo" hidden><a href="https://sports.yahoo.com/fantasy/" target="_blank" rel="noopener">Fantasy data provided by Yahoo Fantasy</a></p>', doc)
        self.assertIn('<script src="../../js/lately.js" defer></script>', doc)
        doc = build.render_data_page(self.read("watching", content("watching")))
        self.assertIn('data-stat="watching.completion.show watching.completion.film watching.completion.anime"', doc)
        self.assertIn('<h3 class="ld-section-title" id="completion-h">Do I finish what I start?</h3><p class="ld-section-note">Only finished titles are logged as a rule', doc)
        self.assertNotIn("ld-attribution", doc)
        for feed in FEEDS:
            doc = build.render_data_page(self.read(feed, content(feed)))
            visible = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<head>.*?</head>", "", doc, flags=re.S)))
            self.assertNotRegex(visible, r"\d", feed)  # no data in the committed page

    # Retitled cards keep their ids, so deep links from before the regrouping still land.
    def test_deep_links_unchanged(self):
        kept = {"fantasy": ["playoff-odds", "record-against-the-median", "margins", "the-schedule-replayed", "strength-of-schedule",
                            "points-left-on-the-bench", "close-start-or-sit-calls", "consistency", "draft-value", "waiver-pickups",
                            "waiver-adds", "points-by-position", "projection-accuracy", "is-the-win-chance-honest", "playoff-odds-as-they-stood"],
                "watching": ["completion", "hours-by-month", "pace", "keeping-up", "dropped-after-one-episode", "backlog", "genres",
                             "release-decades", "runtime", "countries", "my-top-ten-against-the-community", "tiers",
                             "tiers-genres-and-decades", "tiers-against-the-community", "tiers-completion-and-pace"],
                "listening": ["album-half-life", "new-artists", "first-repeat", "concentration", "genres-by-month", "comebacks",
                              "when-i-listen", "plays-by-weekday-and-hour", "whole-albums"],
                "eating": ["scores", "what-i-try-against-what-i-rate-highest", "home-against-away", "does-the-order-i-rank-in-move-the-score",
                           "does-the-place-before-change-the-score", "new-cuisines-by-month", "places-ranked-by-weekday", "against-the-community"],
                "lifting": ["body-weight-since-the-cut", "strength-kept-per-pound-lost", "progress-by-lift", "strength-for-body-weight",
                            "weight-change-and-strength-weeks-later", "music-during-workouts", "workouts-by-weekday"]}
        for feed, ids in kept.items():
            doc = build.render_data_page(self.read(feed, content(feed)))
            for i in ids:
                with self.subTest(feed=feed, id=i):
                    self.assertIn(f'<section class="ld-section ld-section--', doc)
                    self.assertRegex(doc, rf'<section class="ld-section ld-section--(whats-happening|why)" id="{i}" ')

    # Watching, listening, eating and lifting must credit Simkl, Last.fm, Beli and Hevy, by link.
    def test_required_attribution(self):
        for feed, name in build.DATA_ATTRIBUTION.items():
            with self.subTest(feed=feed):
                self.assertIn(f"source: {name} | https://", content(feed))
                text = re.sub(r"source: .*", "source: Someone | https://example.com", content(feed))
                with self.assertRaisesRegex(build.ContentError, f"must credit {re.escape(name)}"):
                    self.read(feed, text)
                with self.assertRaisesRegex(build.ContentError, "source must be"):
                    self.read(feed, re.sub(r"source: .*", f"source: {name}", content(feed)))

    # STAT: paths must name statistics in the merged schema; sections hold nothing else.
    def test_stat_lines(self):
        head = "---\nregister: data\nfeed: lifting\ntitle: T\nsource: Hevy | https://www.hevyapp.com\n---\n\n# What's happening\n\n"
        why = "\n# Why\n\n## Z\nSTAT: lifting.volume_lag\n"
        for body, err in (("## A\nSTAT: lifting.nope\n", "not a statistic"),
                          ("## A\nSTAT: lifting.progress\n", "not a statistic"),
                          ("## A\nSTAT: fantasy.teams.margins\n", "write it with \\[\\]"),
                          ("## A\nSome words.\n", "only STAT:, FEED: and NOTE: lines"),
                          ("## A\nFEED: lifting.nope\n", "not a block js/lately.js draws"),
                          ("## A\nNOTE: only a note\n", "has no STAT: or FEED: line"),
                          ("## A\n\n## B\nSTAT: lifting.lag_check\n", "has no STAT"),
                          ("## A\nSTAT: lifting.lag_check\n## A\nSTAT: lifting.lag_check\n", "share an id"),
                          ("## A\nSTAT: lifting.lag_check\n\n# Why\n\n## A\nSTAT: lifting.volume_lag\n", "share an id"),
                          ("# Extra\n## A\nSTAT: lifting.lag_check\n", "groups are")):
            with self.subTest(body=body), self.assertRaisesRegex(build.ContentError, err):
                self.read("lifting", head + body + ("" if "# Why" in body else why))
        with self.assertRaisesRegex(build.ContentError, "once each"):
            self.read("lifting", head + "## A\nSTAT: lifting.lag_check\n")  # no Why group
        with self.assertRaisesRegex(build.ContentError, "match the file name"):
            self.read("eating", head + "## A\nSTAT: lifting.lag_check\n" + why)
        meta = self.read("lifting", head + "## A\nNOTE: a line under the title\nSTAT: lifting.progress.*\nFEED: lifting.lifts\nSTAT: cross.rhythm.workouts\n" + why)
        self.assertEqual(meta["sections"][0]["stats"], [["lifting.progress.*"], ["cross.rhythm.workouts"]])
        self.assertEqual(meta["sections"][0]["slots"], [("stat", ["lifting.progress.*"]), ("feed", "lifting.lifts"), ("stat", ["cross.rhythm.workouts"])])
        self.assertEqual(meta["sections"][0]["notes"], ["a line under the title"])
        self.assertEqual([g["id"] for g in meta["groups"]], ["whats-happening", "why"])
        self.assertEqual(meta["sections"][1]["group"], "why")
        bad = head.replace("source: Hevy | https://www.hevyapp.com", "source: Hevy | https://www.hevyapp.com\nattribution_when: yahoo | text")
        with self.assertRaisesRegex(build.ContentError, "attribution_when must be"):
            self.read("lifting", bad + "## A\nSTAT: lifting.lag_check\n" + why)

    # Every statistic in the schema is on exactly one page, or left out on purpose.
    def test_every_statistic_placed(self):
        pages = [self.read(f, content(f)) for f in FEEDS]
        build.check_data_coverage(pages, SCHEMA)
        self.assertEqual(build.DATA_LEFT_OUT, {})
        self.assertIn("eating.new_cuisines", pages[FEEDS.index("eating")]["stats"])
        self.assertIn("grading.win_chance", pages[FEEDS.index("fantasy")]["stats"])
        self.assertIn("fantasy.quadrant", pages[FEEDS.index("fantasy")]["stats"])
        self.assertIn("fantasy.manager_score.composite", pages[FEEDS.index("fantasy")]["stats"])
        self.assertIn("cross.time_budget", pages[FEEDS.index("lifting")]["stats"])
        self.assertNotIn("eating.top_ten_churn", pages[FEEDS.index("eating")]["stats"])
        dropped = copy.deepcopy(pages)
        dropped[0]["stats"].remove("fantasy.teams[].margins")
        with self.assertRaisesRegex(build.ContentError, "on no page"):
            build.check_data_coverage(dropped, SCHEMA)
        twice = copy.deepcopy(pages)
        twice[1]["stats"].append("fantasy.teams[].margins")
        with self.assertRaisesRegex(build.ContentError, "on both"):
            build.check_data_coverage(twice, SCHEMA)

    def test_sitemap_lists_the_pages(self):
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        for feed in FEEDS:
            self.assertIn(f"<loc>{build.SITE}lately/{feed}/</loc>", sitemap)


# ---------- drawing ----------

def can_draw():
    return (shutil.which("node") and Path(CHROME).exists()
            and (ROOT / "tools/node_modules/playwright-core").is_dir())


def variant(name):
    d = copy.deepcopy(SAMPLE)
    d.pop("sample", None)
    a = d["analysis"] = copy.deepcopy(ANALYSIS)
    # Fields the page doesn't know are never drawn: an opponent's name, a Beli date.
    a["fantasy"]["teams"][0]["margins"]["values"]["opponent"] = "Rival Manager"
    a["fantasy"]["teams"][0]["playoff_odds"]["values"]["manager_name"] = "Rival Manager"
    a["fantasy"]["teams"][0]["waiver_adds"]["values"]["worst"][0]["dropped_to"] = "Rival Team FC"
    a["fantasy"]["teams"][0]["waiver_adds"]["values"]["worst"][0]["claimed_from"] = "Rival Manager"
    a["fantasy"]["teams"][0]["waiver_adds"]["values"]["all"][1]["dropped_to"] = "Rival Team FC"
    a["fantasy"]["teams"][0]["waiver_adds"]["values"]["all"][1]["claimed_from"] = "Rival Manager"
    # The quadrant's other teams, and anything else, must never show a name even if one slipped in.
    a["fantasy"]["quadrant"]["values"]["others"][0]["team_name"] = "Rival Team FC"
    a["fantasy"]["quadrant"]["values"]["others"][1]["manager"] = "Rival Manager"
    a["fantasy"]["quadrant"]["values"]["mine"][0]["opponent"] = "Rival Manager"
    if name == "yahoo":
        a["meta"]["sources_included"].append("yahoo")
    if name == "old file":
        # A lately.json from before 2026-10-17: none of the new statistics, top_ten_churn still there.
        for k in ("quadrant", "manager_score"):
            del a["fantasy"][k]
        for t in a["fantasy"]["teams"]:
            del t["acquisition_split"], t["draft"]
        for k in ("s_tier", "tier_model", "taste_drift", "community_gap_by_genre", "pace_vs_tier"):
            del a["watching"][k]
        for k in ("strength_index", "retention", "volume_lag", "consistency"):
            del a["lifting"][k]
        for k in ("entropy", "nostalgia", "enduring", "retention_new_artists"):
            del a["listening"][k]
        for k in ("landing", "rerank_drift"):
            del a["eating"][k]
        del a["cross"]["time_budget"], a["meta"]
        a["eating"]["top_ten_churn"] = {"status": "not enough data yet", "n": 0, "min_n": 4, "as_of": a["as_of"], "how": "Old."}
    if name == "waiting":
        # The new statistics present but not yet computable.
        for st in (a["fantasy"]["quadrant"], a["watching"]["s_tier"], a["lifting"]["strength_index"], a["listening"]["retention_new_artists"], a["eating"]["scores"]):
            st.update(status="not enough data yet", n=2)
            st.pop("values", None)
            st.pop("value", None)
            st.pop("interval", None)
        a["fantasy"]["manager_score"]["components"]["moves"].update(status="not enough data yet", n=2)
        a["fantasy"]["manager_score"]["components"]["moves"].pop("values")
    if name == "no all list":
        for team in a["fantasy"]["teams"]:
            del team["waiver_adds"]["values"]["all"]
    a["eating"]["scores"].setdefault("values", {})["last_ranked"] = "2026-09-14"
    a["eating"]["home_bias"]["values"]["date"] = "2026-09-14"
    if name == "few predictions":
        a["grading"]["predictions_stored"] = 19
    if name == "young archive":
        # Three days of listening: everything but the not-available statistic waits for data.
        for k, st in a["listening"].items():
            if isinstance(st, dict) and st.get("status") == "ok":
                st.update(status="not enough data yet", n=3 if k == "heatmap" else 0)
                st.pop("values", None)
                st.pop("value", None)
    if name in ("no hours", "nothing logged"):
        for wk in d["watching"]["weeks"]:
            wk.update(films=0, shows=0, anime=0)
    if name == "nothing logged":
        d["watching"]["recent"] = []
        d["watching"]["currently_watching"] = []
    if name == "places":
        d["eating"]["recent"] = [{"name": "Zeta Noodle", "city": "City 9", "score": 8.1},
                                 {"name": "alpha Cafe", "city": "City 8", "score": 9.2},
                                 {"name": "Mid Grill", "city": "City 7", "score": 7.0}]
    if name == "no bids":
        for add in a["fantasy"]["teams"][0]["waiver_adds"]["values"]["all"]:
            add["spent"] = {"kind": "free agent", "amount": 0}
    if name == "per week":
        a["cross"]["time_budget"]["values"]["to"] = a["as_of"]
    if name == "bench":
        lift = d["lifting"]["main_lifts"][0]
        lift["name"] = "Bench"
        lift["best"] = {"date": "2026-06-06", "e1rm": 225.0, "best_set": {"weight_lb": 225, "reps": 1, "date": "2026-06-06", "source": "manual"}}
    if name == "kept includes zero":
        for s in a["lifting"]["strength_kept"].values():
            if s["status"] == "ok":
                s["interval"] = [-0.4, s["interval"][1]]
    return d


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@functools.lru_cache(maxsize=None)
def draw(page, width=1280, name="base"):
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(variant(name), f)
        r = subprocess.run(["node", str(ROOT / "tests/depth_render.js"), f"http://127.0.0.1:{server.server_port}", page, f.name, str(width)],
                             capture_output=True, text=True, timeout=200)
        if r.returncode:
            raise AssertionError("render helper failed:\n" + r.stderr[-2000:])
        return json.loads(r.stdout)
    finally:
        server.shutdown()
        server.server_close()
        os.unlink(f.name)


def blocks(facts, stat):
    return [b for s in facts["sections"] for sl in s["slots"] if stat in sl["stat"].split() for b in sl["blocks"]]


def slot(facts, stat):
    return next(sl for s in facts["sections"] for sl in s["slots"] if stat in sl["stat"].split())


@unittest.skipUnless(can_draw(), "needs node, Chrome and tools/node_modules")
class Drawing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build.build_data_pages(SCHEMA)  # the frames the browser loads

    # Each statistic: value and interval, its chart or table, its n, and the "how" sentence in the label face.
    def test_ok_statistic(self):
        d = draw("lately/lifting/")
        (b,) = blocks(d, "lifting.body_weight_rate")
        self.assertEqual((b["status"], b["value"]), ("ok", "−0.59"))
        self.assertEqual(b["interval"], "95% interval −0.63 to −0.56")
        self.assertTrue(b["n"].startswith("n = 20 weigh-ins"))
        self.assertGreater(b["charts"], 0)
        sl = slot(d, "lifting.body_weight_rate")
        self.assertEqual(sl["hows"], ["how: " + ANALYSIS["lifting"]["body_weight_rate"]["how"]])
        self.assertIn("Courier Prime", sl["howFont"])

    # "not enough data yet": under What's happening the statistic isn't drawn; one line per
    # page counts them and a section with nothing else is hidden with its contents entry. A
    # card under Why keeps its question and shows the box with n and min_n instead. No
    # headline tile shows a "–" for either.
    def test_not_enough_data(self):
        for feed in FEEDS:
            with self.subTest(feed=feed):
                d = draw(f"lately/{feed}/")
                for s in d["sections"]:
                    for sl in s["slots"]:
                        for b in sl["blocks"]:
                            if b["status"] == "not enough data yet":
                                self.assertEqual(s["group"], "why", s["id"])
                                self.assertRegex(b["wait"], r"^not enough data yet · \d+ of \d+ .+ needed$")
                if d["waiting"]:
                    self.assertRegex(d["waiting"], r"^(1 more statistic appears|\d+ more statistics appear) as data accrues\.$")
        lifting = draw("lately/lifting/")
        self.assertNotIn("Hack squat", [b["title"] for b in blocks(lifting, "lifting.progress.*")])  # gated: 0 of 6 sessions
        # retention is a Why card: the lifts without data wait in place, with their n.
        waits = [b for b in blocks(lifting, "lifting.retention.*") if b["status"] == "not enough data yet"]
        self.assertTrue(waits)
        self.assertEqual(waits[0]["wait"], "not enough data yet · 0 of 6 sessions needed")
        backlog = slot(draw("lately/watching/"), "watching.backlog")
        self.assertFalse(backlog["hidden"])
        self.assertEqual(backlog["blocks"][0]["wait"], "not enough data yet · 0 of 5 titles needed")
        young = draw("lately/listening/", name="young archive")
        self.assertEqual(young["waiting"], "4 more statistics appear as data accrues.")  # the What's-happening ones
        for s in young["sections"]:
            with self.subTest(section=s["id"]):
                if not s["slots"]:
                    continue  # a feed block, drawn from the feed itself
                if s["group"] == "whats-happening":
                    self.assertEqual(s["hidden"], not any(sl["blocks"] for sl in s["slots"]))
                else:
                    self.assertFalse(s["hidden"])
        self.assertIn("new-artists", young["hiddenSections"])
        self.assertEqual(sorted(young["hiddenToc"]), sorted("#" + i for i in young["hiddenSections"]))
        self.assertEqual(young["headline"], [])
        listening = next(p for p in draw("index.html", name="young archive")["panels"] if p["id"] == "panel-listening")
        self.assertFalse([h for h in listening["headline"] if h[1] == "–"])
        self.assertTrue(listening["wait"])

    # Each page opens with whose numbers these are and which apps they come from.
    def test_lede(self):
        want = {"fantasy": "Sleeper and ESPN accounts", "watching": "Simkl account", "listening": "Last.fm account",
                "eating": "Beli account", "lifting": "Hevy account"}
        for feed, apps in want.items():
            self.assertEqual(draw(f"lately/{feed}/")["lede"], f"These are my own numbers, from my {apps}.")

    # A window shorter than its label is labelled by its real start: "since 11 Oct".
    def test_listening_window(self):
        young, base = draw("lately/listening/", name="young archive")["bodyText"], draw("lately/listening/")["bodyText"]
        for label in ("Plays, ", "Top artists, ", "When I listen, by hour of day, "):
            self.assertIn(label + "since 11 Oct", young)
            self.assertIn(label + "last 30 days", base)
        self.assertNotIn("last 30 days", young)
        home_young, home = draw("index.html", name="young archive"), draw("index.html")
        self.assertIn("Plays, since 11 Oct", home_young["bodyText"])
        self.assertIn("Plays, last 30 days", home["bodyText"])
        self.assertNotIn("Top artists", home["bodyText"])  # the list left the main page

    # "No episodes or films logged" only when nothing is: not beside something being watched.
    def test_watching_nothing_logged(self):
        self.assertIsNone(draw("lately/watching/", name="no hours")["watchingEmpty"])
        self.assertEqual(draw("lately/watching/", name="nothing logged")["watchingEmpty"], "No episodes or films logged in the last 12 weeks")

    # Tier counts are the rankings file's (tier_distribution); completion says what it covers.
    def test_tier_counts(self):
        (b,) = blocks(draw("lately/watching/"), "watching.tier_completion_pace")
        totals = {}
        for st in ANALYSIS["watching"]["tier_distribution"].values():
            for t in st["values"]["tiers"]:
                totals[t["tier"]] = totals.get(t["tier"], 0) + t["titles"]
        self.assertIn("Tiered titles", b["text"])
        self.assertEqual({r[0]: int(r[1]) for r in b["cells"]}, totals)
        self.assertIn(f"Completion covers 273 of the {sum(totals.values())} tiered titles.", b["text"])

    # Eating: "Recently tried" in alphabetical order without cities, so it carries no dates;
    # the home city is never named (it's "my most-ranked city").
    def test_eating_places(self):
        self.assertEqual(draw("lately/eating/", name="places")["places"], [["alpha Cafe", "9.20", None], ["Mid Grill", "7.00", None], ["Zeta Noodle", "8.10", None]])
        (hb,) = blocks(draw("lately/eating/"), "eating.home_bias")
        self.assertNotIn("City 1", hb["text"])
        eating = next(p for p in draw("index.html")["panels"] if p["id"] == "panel-eating")
        self.assertNotIn("City 1", eating["answer"] + " " + " ".join(" ".join(x or "" for x in h) for h in eating["headline"]) + " " + (eating["legend"] or ""))

    # "not available from source": a one-line note, nothing else.
    def test_not_available(self):
        d = draw("lately/listening/")
        (b,) = blocks(d, "listening.album_listener")
        self.assertEqual(b["note"], "not available from source: " + ANALYSIS["listening"]["album_listener"]["missing"])
        self.assertEqual((b["lines"], b["charts"]), (1, 0))
        self.assertEqual(slot(d, "listening.album_listener")["hows"], [])

    # Every page states its source, with the required attribution linked, and the as_of date.
    def test_source_and_as_of(self):
        names = dict(build.DATA_ATTRIBUTION, fantasy="Sleeper")
        for feed in FEEDS:
            with self.subTest(feed=feed):
                d = draw(f"lately/{feed}/")
                self.assertTrue(d["source"].startswith("data from "))
                self.assertIn("as of 13 Oct 2026", d["source"])
                self.assertIn(names[feed], [a for a, _ in d["sourceLinks"]])
                self.assertTrue(all(u.startswith("https://") for _, u in d["sourceLinks"]))
                note = "Beli dates are used only as counts, never tied to a place"
                (self.assertIn if feed == "eating" else self.assertNotIn)(note, d["source"])
                self.assertEqual(d["errors"], [])

    # Wins and losses by filled and outlined marks with their letter, never colour alone.
    def test_wins_and_losses(self):
        d = draw("lately/fantasy/")
        wins = [s for s in d["squares"] if s["letter"] == "W"]
        losses = [s for s in d["squares"] if s["letter"] == "L"]
        self.assertTrue(wins and losses)
        self.assertTrue(all(s["bg"] == INK for s in wins))
        self.assertTrue(all(s["bg"] == CLEAR and s["border"] == "solid" for s in losses))
        parts = {p["cls"]: p for p in d["recordParts"]}
        self.assertEqual(parts["ld-record-w"]["bg"], INK)
        self.assertEqual((parts["ld-record-l"]["bg"], parts["ld-record-l"]["border"]), (CLEAR, "solid"))

    # Waiver adds: hit rate with its interval, net points available against captured, adds a
    # week, then every add with the best and worst three marked, and the how-line under it.
    def test_waiver_adds(self):
        d = draw("lately/fantasy/")
        teams = ANALYSIS["fantasy"]["teams"]
        wa = teams[0]["waiver_adds"]
        first, second = blocks(d, "fantasy.teams[].waiver_adds")[:2]
        self.assertEqual((first["value"], first["interval"]), ("50%", "95% interval 19% to 81%"))
        for bit in ("net points available+8.48", "net points captured−3.24", "adds a week1.2",
                    "Every add, best and worst three markedWeekAddedDroppedBidClass", "$11", "hit, left on the bench"):
            self.assertIn(bit, first["text"])
        for b, team in ((first, teams[0]), (second, teams[1])):
            adds = team["waiver_adds"]["values"]["all"]
            self.assertEqual(b["rows"], len(adds))  # every add, not only the six
            self.assertEqual(b["text"].count("▲ best"), sum(a["best"] for a in adds))
            self.assertEqual(b["text"].count("▽ worst"), sum(a["worst"] for a in adds))
            self.assertNotIn("aren't in it", b["text"])
        self.assertEqual(second["rows"], 14)
        self.assertEqual(slot(d, "fantasy.teams[].waiver_adds")["hows"], ["how: " + wa["how"]])
        # A league whose adds carry no bid has no Bid column.
        nobid = blocks(draw("lately/fantasy/", name="no bids"), "fantasy.teams[].waiver_adds")
        self.assertNotIn("Bid", nobid[0]["text"])
        self.assertEqual(len(nobid[0]["cells"][0]), 4)
        self.assertIn("Bid", first["text"])
        self.assertEqual(len(first["cells"][0]), 5)
        # An older file without the full list shows its best and worst three, and says so.
        old = blocks(draw("lately/fantasy/", name="no all list"), "fantasy.teams[].waiver_adds")[1]
        self.assertEqual(old["rows"], 6)
        self.assertIn("The data lists the best and worst three of 14 adds; the other 8 aren't in it.", old["text"])

    # Lineup efficiency gains the bench-hit line: waiver hits that sat on my bench.
    def test_bench_hit_line(self):
        le = blocks(draw("lately/fantasy/"), "fantasy.teams[].lineup_efficiency")
        self.assertIn("Hit, left on the bench: 1 add, 26.6 points on my bench, +12.88 net points available.", le[0]["text"])
        self.assertIn("Hit, left on the bench: no waiver adds.", le[1]["text"])

    # "Is the win chance honest?" lives on lately/fantasy: the calibration table and Brier
    # score from twenty predictions, "not enough data yet" before that.
    def test_grading(self):
        sec = next(s for s in draw("lately/fantasy/")["sections"] if s["title"] == "Is the win chance honest?")
        (b,) = sec["slots"][0]["blocks"]
        self.assertEqual(b["value"], "0.210")
        self.assertIn("Brier score", b["text"])
        self.assertIn("Predicted win chance against how often I won", b["text"])
        # With fewer than 20 predictions stored the gate holds it back: the card (it is under
        # Why) keeps its question over the box, with the gate's n and min_n.
        few = draw("lately/fantasy/", name="few predictions")
        (fb,) = blocks(few, "grading.win_chance")
        self.assertEqual((fb["status"], fb["wait"]), ("not enough data yet", "not enough data yet · 19 of 20 predictions needed"))
        self.assertFalse(slot(few, "grading.win_chance")["hidden"])

    QUESTIONS = {"fantasy": "Good, or lucky?", "watching": "What earns an S?", "listening": "Do I keep playing what's new?",
                 "eating": "What biases my scores?", "lifting": "Is the cut costing strength?"}

    # The main page: fantasy across the width, then watching | listening, then eating | lifting.
    # Each panel: title, source line in the label face, the question in bold, a two-sentence
    # answer, two or three numbers, one chart and "more about <feed> →". The lists and grids
    # that used to be here are gone (they live under What's happening on the feed pages).
    def test_main_page_panels(self):
        d = draw("index.html")
        self.assertEqual(d["panelOrder"], ["panel-fantasy", ["panel-watching", "panel-listening"], ["panel-eating", "panel-lifting"]])
        panels = {p["id"]: p for p in d["panels"]}
        self.assertNotIn("panel-rankings", panels)
        for feed, q in self.QUESTIONS.items():
            with self.subTest(feed=feed):
                p = panels[f"panel-{feed}"]
                self.assertEqual(p["more"], [f"lately/{feed}/", f"more about {feed} →"])
                self.assertEqual(p["question"], q)
                self.assertEqual(p["questionWeight"], "700")
                self.assertIn("Courier Prime", p["metaFont"])
                self.assertEqual(len(re.findall(r"[.!?](\s|$)", p["answer"])), 2, p["answer"])
                self.assertTrue(2 <= len(p["headline"]) <= 3, p["headline"])
                self.assertFalse([h for h in p["headline"] if h[1] in ("–", "", None)], p["headline"])
                self.assertEqual(p["charts"], 1, (feed, p["charts"]))
                self.assertIsNone(p["wait"])
                self.assertEqual(p["removed"], 0)
        f = panels["panel-fantasy"]
        self.assertEqual([h[1] for h in f["headline"]], ["13–7", "+1.8", "3 of 4"])
        self.assertEqual(f["quadCorners"], ["bad and lucky", "good and lucky", "bad and unlucky", "good and unlucky"])
        self.assertEqual(sorted(f["quadMine"]), sorted(t["name"] for t in ANALYSIS["fantasy"]["teams"]))
        self.assertEqual(f["quadOthers"], len(ANALYSIS["fantasy"]["quadrant"]["values"]["others"]))
        for t in f["quadTitles"]:  # hover: record and all-play only
            self.assertRegex(t, r"^\d+–\d+(–\d+)? · all-play \d+%$")
        w = panels["panel-watching"]
        self.assertEqual(w["headline"][0][0], "S tier, all titles")
        self.assertEqual(w["headline"][1][:2], ["Most over-indexed in S", "Drama"])
        li = panels["panel-listening"]
        self.assertEqual([h[0] for h in li["headline"]], ["Still played after 30 days", "Still played after 90 days", "Plays, last 30 days"])
        e = panels["panel-eating"]
        self.assertEqual(e["headline"][0][:2], ["Median score", "7.97"])
        self.assertIn("minus my overall median of 7.97", e["legend"])
        self.assertIn("home against away", d["bodyText"])
        lf = panels["panel-lifting"]
        self.assertEqual([h[0] for h in lf["headline"]], ["Body weight since the cut", "Strength index since the cut"])  # the sample has no bench
        bench = next(p for p in draw("index.html", name="bench")["panels"] if p["id"] == "panel-lifting")["headline"][2]
        self.assertEqual(bench[:2], ["Bench best, e1RM", "225 lb"])
        self.assertIn("logged by hand", bench[2])
        for gone in ("Restaurants ranked", "Recently tried", "Who is carrying my teams", "Estimated one-rep max, main lifts", "Sets by muscle group", "My rankings", "Recently"):
            self.assertNotIn(gone, d["bodyText"], gone)
        self.assertIn("Restaurants ranked", draw("lately/eating/")["bodyText"])  # moved, not deleted

    # Every panel still stands when its statistic is "not enough data yet" or the file predates
    # it: the question, the box with n and min_n (or "not in the data yet"), the numbers, the link.
    def test_main_page_panels_waiting(self):
        for name, box in (("waiting", r"^not enough data yet · 2 of \d+ \w+ needed"), ("old file", r"^not in the data yet · appears once the pipeline publishes it$")):
            d = draw("index.html", name=name)
            for p in d["panels"]:
                with self.subTest(variant=name, panel=p["id"]):
                    self.assertEqual(p["question"], self.QUESTIONS[p["id"][len("panel-"):]])
                    self.assertEqual(len(re.findall(r"[.!?](\s|$)", p["answer"])), 2, p["answer"])
                    self.assertTrue(2 <= len(p["headline"]) <= 3, p["headline"])
                    self.assertFalse([h for h in p["headline"] if h[1] in ("–", "", None)], p["headline"])
                    if name == "old file" and p["id"] == "panel-eating":
                        self.assertEqual(p["charts"], 1)  # its chart comes from scores, which old files have
                        continue
                    self.assertRegex(p["wait"], box)
                    self.assertEqual(p["charts"], 0)
                    self.assertTrue(p["more"])
            self.assertEqual(d["errors"], [])
        # The listening box says what the archive covers.
        li = next(p for p in draw("index.html", name="waiting")["panels"] if p["id"] == "panel-listening")
        self.assertRegex(li["wait"], r"months needed · plays from \d+ \w+( \d{4})? to \d+ \w+( \d{4})?$")
        # An old file's feed pages: the new cards say the statistic isn't in the data yet; the rest draws.
        old = draw("lately/lifting/", name="old file")
        (si,) = blocks(old, "lifting.strength_index")
        self.assertEqual(si["wait"], "not in the data yet · appears once the pipeline publishes it")
        self.assertTrue(blocks(old, "lifting.body_weight_rate")[0]["value"])
        self.assertEqual(old["errors"], [])

    # The main page is far shorter than before the regrouping (about 8,800px at 1280).
    def test_main_page_height(self):
        self.assertLess(draw("index.html")["pageHeight"], 7600)
        self.assertLess(draw("index.html", name="old file")["pageHeight"], 7000)

    # The feed page's headline adds strength kept per pound lost once any lift's interval excludes zero.
    def test_strength_kept_joins_the_headline(self):
        self.assertEqual(draw("lately/lifting/")["headline"][-1], ["Bench: e1RM kept per lb lost", "2.39"])
        self.assertFalse(any("kept" in h[0] for h in draw("lately/lifting/", name="kept includes zero")["headline"]))

    # Fantasy page, Why: the manager-score card is four bars with rank and of, and the composite;
    # the acquisition split and the draft table follow. The Yahoo credit appears only when
    # the file includes yahoo.
    def test_fantasy_cards(self):
        d = draw("lately/fantasy/")
        sec = next(s for s in d["sections"] if s["id"] == "manager-score")
        self.assertEqual(sec["group"], "why")
        bars, composite = sec["slots"]
        (b,) = bars["blocks"]
        # Bars are percentiles; each label is the raw value and the rank; the composite heads the card.
        for bit in ("Draft", "+3.4 pts/wk · rank 9 of 32", "Lineup", "−2.1 pts/wk · rank 24 of 32", "Moves", "+1.6 pts/wk · rank 12 of 32",
                    "Strength", ".58 all-play · rank 6 of 32", "Percentile among managers"):
            self.assertIn(bit, b["text"])
        self.assertEqual((b["value"], b["interval"]), ("61st percentile", "95% 41–78"))
        self.assertEqual(len(bars["hows"]), 5)  # the four components and the composite
        self.assertTrue(composite["hidden"])  # drawn inside the card instead
        split = blocks(d, "fantasy.teams[].acquisition_split")
        self.assertEqual(len(split), len(ANALYSIS["fantasy"]["teams"]))
        self.assertIn("draft", split[0]["text"])
        self.assertIn("league median", split[0]["text"])
        draft = blocks(d, "fantasy.teams[].draft")
        self.assertEqual(draft[0]["rows"], 15)
        self.assertEqual(draft[0]["cells"][0][:3], ["1", "7", "Player A1"])
        (q,) = blocks(d, "fantasy.quadrant")
        self.assertEqual(q["quadOthers"], len(ANALYSIS["fantasy"]["quadrant"]["values"]["others"]))
        # Trails: weeks 3 to 5 of the fixture's five, two segments a team, with the fading dots in between.
        self.assertEqual(q["quadTrails"], 6)
        self.assertIn("my trail, last 5 weeks", q["text"])
        self.assertEqual(sorted(q["quadLabels"]), sorted(t["name"] for t in ANALYSIS["fantasy"]["teams"]))
        self.assertEqual(d["attribution"], [{"source": "yahoo", "hidden": True, "text": "Fantasy data provided by Yahoo Fantasy",
                                             "link": ["https://sports.yahoo.com/fantasy/", "_blank", "noopener"]}])
        self.assertEqual(draw("lately/fantasy/", name="yahoo")["attribution"][0]["hidden"], False)
        # A waiting component is named under the bars of the others, with its n and min_n.
        waiting = next(s for s in draw("lately/fantasy/", name="waiting")["sections"] if s["id"] == "manager-score")
        (wb,) = waiting["slots"][0]["blocks"]
        self.assertEqual(wb["status"], "ok")
        self.assertEqual(wb["wait"], "Moves: not enough data yet · 2 of 4 weeks needed")
        self.assertIn("Draft", wb["text"])
        self.assertNotIn("+1.6", wb["text"])
        # Under 600px my teams are numbered markers with a key naming them; no label in the plot.
        narrow = next(p for p in draw("index.html", 390)["panels"] if p["id"] == "panel-fantasy")
        self.assertEqual(narrow["quadMine"], [])
        self.assertEqual(narrow["quadNums"], ["1", "2", "3"])
        def rec(t):
            r = t["schedule_what_if"]["values"]["real"]
            return f"{r['wins']}–{r['losses']}"
        self.assertEqual(narrow["quadKey"], [f"{i + 1}{t['name']} · {rec(t)}" for i, t in enumerate(ANALYSIS["fantasy"]["teams"])])
        wide = next(p for p in draw("index.html")["panels"] if p["id"] == "panel-fantasy")
        self.assertEqual(wide["quadNums"], [])
        self.assertEqual(wide["quadKey"], [])

    # Watching page: My rankings leads What's happening; completion and drops sit in Why with
    # the note that only finished titles are logged as a rule; the new cards draw.
    def test_watching_regrouped(self):
        d = draw("lately/watching/")
        groups = {g["id"]: g for g in d["groups"]}
        self.assertEqual(groups["whats-happening"]["sections"][:3], ["my-rankings", "hours-watched", "recently"])
        self.assertIn("completion", groups["why"]["sections"])
        self.assertIn("dropped-after-one-episode", groups["why"]["sections"])
        for sid in ("completion", "dropped-after-one-episode"):
            sec = next(s for s in d["sections"] if s["id"] == sid)
            self.assertEqual(sec["notes"], ["Only finished titles are logged as a rule, so completion and drop counts cover what I chose to record."])
            self.assertTrue(all(b["n"].startswith("n = ") for sl in sec["slots"] for b in sl["blocks"]))
        feeds = {f["block"]: f for f in d["feeds"]}
        self.assertFalse(feeds["watching.rankings"]["hidden"])
        self.assertIn("Films", feeds["watching.rankings"]["text"])
        (s,) = blocks(d, "watching.s_tier")
        self.assertEqual(s["value"], "12%")
        self.assertIn("S-tier share by type", s["text"])
        self.assertIn("Drama", s["text"])
        (tm,) = blocks(d, "watching.tier_model")
        self.assertEqual(tm["value"], "46%")
        self.assertEqual(len(blocks(d, "watching.taste_drift")), 1)
        self.assertEqual(len(blocks(d, "watching.community_gap_by_genre")), 1)
        self.assertEqual(len(blocks(d, "watching.pace_vs_tier")), 1)
        self.assertEqual(d["toc"][0]["group"], "whats-happening")
        self.assertEqual(d["toc"][1]["links"][0][:2], ["#completion", "Do I finish what I start?"])

    # Every feed block that left the main page draws on its feed page.
    def test_feed_blocks(self):
        want = {"fantasy": ["fantasy.lineup", "fantasy.carry"], "watching": ["watching.rankings", "watching.hours", "watching.recent"],
                "listening": ["listening.recent"], "eating": ["eating.recent"], "lifting": ["lifting.lifts", "lifting.training", "lifting.body_weight"]}
        for feed, names in want.items():
            d = draw(f"lately/{feed}/")
            feeds = {f["block"]: f for f in d["feeds"]}
            self.assertEqual(sorted(feeds), sorted(names), feed)
            for n in names:
                with self.subTest(block=n):
                    self.assertFalse(feeds[n]["hidden"])
                    self.assertTrue(feeds[n]["text"])
        # The time budget: an older file holds totals and is labelled so; a file with the window's
        # "to" date holds mean hours per week.
        (tb,) = blocks(draw("lately/lifting/"), "cross.time_budget")
        self.assertIn("Hours by weekday, total over the last 8 weeks", tb["text"])
        self.assertIn("totals over the window", tb["text"])
        (tbw,) = blocks(draw("lately/lifting/", name="per week"), "cross.time_budget")
        self.assertIn("Hours per week by weekday, last 8 weeks", tbw["text"])
        self.assertIn("mean hours per week", tbw["text"])
        lifting = {f["block"]: f for f in draw("lately/lifting/")["feeds"]}
        self.assertEqual(lifting["lifting.training"]["lists"], ["Recent personal records"])
        self.assertIn("Body weight", lifting["lifting.body_weight"]["text"])
        # The strength-index card and its two indexed lines, with the dashed 100 line in the legend.
        (si,) = blocks(draw("lately/lifting/"), "lifting.strength_index")
        self.assertIn("100 = cut start", si["text"])
        self.assertIn("body weight · 20 weeks with a weigh-in", si["text"])  # every fixture week has one

    # No other managers' names; no Beli dates (cities are fine; new cuisines are counted by
    # month, which ties no date to a place).
    def test_nothing_the_page_does_not_know(self):
        for page in ["index.html"] + [f"lately/{f}/" for f in FEEDS]:
            d = draw(page)
            for text in [d["bodyText"]] + d["titles"]:
                self.assertNotIn("Rival Manager", text, page)
                self.assertNotIn("Rival Team", text, page)
            self.assertNotIn("sleeper-1", d["bodyText"], page)  # a league key is never shown either
        eating = draw("lately/eating/")["bodyText"]
        self.assertNotRegex(eating, r"\d{4}-\d{2}")
        self.assertNotRegex(eating, r"14 Sep")  # the injected ranking date, in any form
        self.assertIn("City 1", eating)
        (b,) = blocks(draw("lately/eating/"), "eating.new_cuisines")
        self.assertEqual(b["status"], "ok")
        self.assertNotRegex(b["text"], r"\d{4}-\d{2}-\d{2}|\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b")

    # Every statistic the fixture holds is drawn: no slot falls back to "not in the data yet"
    # (which only an older file should produce) and no spec is missing from the script.
    def test_every_statistic_has_a_renderer(self):
        for feed in FEEDS:
            with self.subTest(feed=feed):
                d = draw(f"lately/{feed}/")
                for s in d["sections"]:
                    for sl in s["slots"]:
                        for b in sl["blocks"]:
                            self.assertNotEqual(b["status"], "not in the data yet", (s["id"], sl["stat"]))
                            self.assertNotIn("doesn't draw it yet", b["text"], sl["stat"])
                self.assertIsNone(d["waiting"] and re.search(r"\d{2,}", d["waiting"]))  # a two-digit count means slots went undrawn
        lifting = draw("lately/lifting/")
        self.assertTrue(blocks(lifting, "lifting.relative_strength.*"))
        self.assertTrue(blocks(lifting, "lifting.lag_check"))
        self.assertTrue(blocks(lifting, "cross.lifting_soundtrack"))
        self.assertTrue(blocks(lifting, "cross.rhythm.workouts"))

    # No sideways scroll and nothing undrawn, on every page at phone and desktop widths.
    def test_widths(self):
        for feed in FEEDS + ("index",):
            for w in WIDTHS:
                with self.subTest(feed=feed, width=w):
                    d = draw("index.html" if feed == "index" else f"lately/{feed}/", w)
                    self.assertLessEqual(d["scrollX"], 0)
                    self.assertNotIn("Couldn't draw", d["bodyText"])
                    self.assertNotIn("doesn't draw it yet", d["bodyText"])
                    self.assertEqual(d["errors"], [])


if __name__ == "__main__":
    unittest.main()
