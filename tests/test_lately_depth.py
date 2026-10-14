"""Tests for the Lately in-depth pages: build.py's "data" register (content/lately/) and
how js/lately-depth.js draws the analysis block, there and on the main page's panels.

The register checks need nothing extra. The drawing checks load the pages in headless
Chrome through tools/node_modules (cd tools && npm install) and are skipped without them.
They use tests/fixtures/analysis.json, a copy of the pipeline's sample with every name
replaced. Run: python3 -m unittest discover tests
"""

import copy
import functools
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
        self.assertIn('data from <a href="https://sleeper.com">Sleeper</a> and <a href="https://www.espn.com/fantasy/football/">ESPN</a>', doc)
        self.assertIn('as of <time class="ld-asof-date">', doc)
        self.assertRegex(doc, r'<h2 class="ld-section-title" id="is-the-win-chance-honest-h">Is the win chance honest\?</h2>'
                              r'<div class="ld-stat" data-stat="grading\.win_chance">')
        self.assertEqual(len(re.findall(r'<section class="ld-section"', doc)), content("fantasy").count("\n## "))
        doc = build.render_data_page(self.read("watching", content("watching")))
        self.assertIn('data-stat="watching.completion.show watching.completion.film watching.completion.anime"', doc)
        for feed in FEEDS:
            doc = build.render_data_page(self.read(feed, content(feed)))
            visible = re.sub(r"<[^>]+>", " ", re.sub(r"<head>.*?</head>", "", doc, flags=re.S))
            self.assertNotRegex(visible, r"\d", feed)  # no data in the committed page

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
        head = "---\nregister: data\nfeed: lifting\ntitle: T\nsource: Hevy | https://www.hevyapp.com\n---\n\n"
        for body, err in (("## A\nSTAT: lifting.nope\n", "not a statistic"),
                          ("## A\nSTAT: lifting.progress\n", "not a statistic"),
                          ("## A\nSTAT: fantasy.teams.margins\n", "write it with \\[\\]"),
                          ("## A\nSome words.\n", "only STAT: lines"),
                          ("## A\n\n## B\nSTAT: lifting.lag_check\n", "has no STAT"),
                          ("## A\nSTAT: lifting.lag_check\n## A\nSTAT: lifting.lag_check\n", "share an id")):
            with self.subTest(body=body), self.assertRaisesRegex(build.ContentError, err):
                self.read("lifting", head + body)
        with self.assertRaisesRegex(build.ContentError, "match the file name"):
            self.read("eating", head + "## A\nSTAT: lifting.lag_check\n")
        meta = self.read("lifting", head + "## A\nSTAT: lifting.progress.*\nSTAT: cross.rhythm.workouts\n")
        self.assertEqual(meta["sections"][0]["stats"], [["lifting.progress.*"], ["cross.rhythm.workouts"]])

    # Every statistic in the schema is on exactly one page, or left out on purpose.
    def test_every_statistic_placed(self):
        pages = [self.read(f, content(f)) for f in FEEDS]
        build.check_data_coverage(pages, SCHEMA)
        self.assertEqual(set(build.DATA_LEFT_OUT), {"eating.new_cuisines"})
        self.assertIn("grading.win_chance", pages[FEEDS.index("fantasy")]["stats"])
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
    a["eating"]["scores"]["values"]["last_ranked"] = "2026-09-14"
    a["eating"]["home_bias"]["values"]["date"] = "2026-09-14"
    if name == "few predictions":
        a["grading"]["predictions_stored"] = 19
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
        out = subprocess.run(["node", str(ROOT / "tests/depth_render.js"), f"http://127.0.0.1:{server.server_port}", page, f.name, str(width)],
                             capture_output=True, text=True, timeout=90, check=True).stdout
        return json.loads(out)
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

    # "not enough data yet": that line and the n needed, never an empty chart.
    def test_not_enough_data(self):
        d = draw("lately/lifting/")
        b = next(b for b in blocks(d, "lifting.progress.*") if b["title"] == "Hack squat")
        self.assertEqual(b["wait"], "not enough data yet · 0 of 6 sessions needed")
        self.assertEqual((b["charts"], b["value"], b["n"]), (0, None, None))
        (w,) = blocks(draw("lately/watching/"), "watching.backlog")
        self.assertEqual(w["wait"], "not enough data yet · 0 of 5 titles needed")

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

    # "Is the win chance honest?" lives on lately/fantasy: the calibration table and Brier
    # score from twenty predictions, "not enough data yet" before that.
    def test_grading(self):
        sec = next(s for s in draw("lately/fantasy/")["sections"] if s["title"] == "Is the win chance honest?")
        (b,) = sec["slots"][0]["blocks"]
        self.assertEqual(b["value"], "0.210")
        self.assertIn("Brier score", b["text"])
        self.assertIn("Predicted win chance against how often I won", b["text"])
        (few,) = blocks(draw("lately/fantasy/", name="few predictions"), "grading.win_chance")
        self.assertEqual(few["wait"], "not enough data yet · 19 of 20 predictions needed")
        self.assertEqual(few["charts"], 0)

    # The main page: each panel keeps its content and gains its headline numbers and "more →".
    def test_main_page_panels(self):
        d = draw("index.html")
        panels = {p["id"]: p for p in d["panels"]}
        first = {"fantasy": "Playoff odds, ", "watching": "Completion, shows", "listening": "Half-life, this week's album",
                 "eating": "Median score", "lifting": "Body weight since the cut"}
        for feed, label in first.items():
            with self.subTest(feed=feed):
                p = panels[f"panel-{feed}"]
                self.assertEqual(p["more"], f"lately/{feed}/")
                self.assertTrue(2 <= len(p["headline"]) <= 3, p["headline"])
                self.assertTrue(p["headline"][0][0].startswith(label), p["headline"])
        self.assertEqual([h[1] for h in panels["panel-fantasy"]["headline"]], ["4%", "45%", "95%"])
        self.assertIsNone(panels["panel-rankings"]["more"])
        self.assertIn("Restaurants ranked", d["bodyText"])  # the panels' own content stays

    # Lifting's headline adds strength kept per pound lost once any lift's interval excludes zero.
    def test_strength_kept_joins_the_headline(self):
        def lifting(name):
            return next(p for p in draw("index.html", name=name)["panels"] if p["id"] == "panel-lifting")["headline"]
        self.assertEqual(lifting("base")[-1], ["Bench: e1RM kept per lb lost", "2.39"])
        self.assertFalse(any("kept" in h[0] for h in lifting("kept includes zero")))
        self.assertFalse(any("kept" in h[0] for h in draw("lately/lifting/", name="kept includes zero")["headline"]))

    # No other managers' names; no Beli dates (cities are fine).
    def test_nothing_the_page_does_not_know(self):
        for page in ["index.html"] + [f"lately/{f}/" for f in FEEDS]:
            self.assertNotIn("Rival Manager", draw(page)["bodyText"], page)
        eating = draw("lately/eating/")["bodyText"]
        self.assertNotRegex(eating, r"\d{4}-\d{2}")
        self.assertNotRegex(eating, r"14 Sep|Sep 2026")  # the injected ranking date, in any form
        self.assertIn("City 1", eating)

    # No sideways scroll and nothing undrawn, on every page at phone and desktop widths.
    def test_widths(self):
        for feed in FEEDS:
            for w in WIDTHS:
                with self.subTest(feed=feed, width=w):
                    d = draw(f"lately/{feed}/", w)
                    self.assertLessEqual(d["scrollX"], 0)
                    self.assertNotIn("Couldn't draw", d["bodyText"])
                    self.assertNotIn("doesn't draw it yet", d["bodyText"])
                    self.assertEqual(d["errors"], [])


if __name__ == "__main__":
    unittest.main()
