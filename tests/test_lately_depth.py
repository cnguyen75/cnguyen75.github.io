"""Tests for the Lately in-depth pages: build.py's "data" register (content/lately/) and
how js/lately-depth.js draws the analysis block, there and on the main page's panels (the
analysis-first Side D: a question, a two-sentence answer, numbers and one chart per panel).

The register checks need nothing extra. The drawing checks load the pages in headless
Chrome through tools/node_modules (cd tools && npm install) and are skipped without them.
They use tests/fixtures/analysis.json, a copy of the pipeline's sample with every name
replaced. Run: python3 -m unittest discover tests
"""

from __future__ import annotations

import copy
import functools
import html
import http.server
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402


SCHEMA = json.loads((ROOT / build.SCHEMA_PATH).read_text(encoding="utf-8"))
SAMPLE = json.loads((ROOT / "tests/fixtures/lately.sample.json").read_text(encoding="utf-8"))
ANALYSIS = json.loads((ROOT / "tests/fixtures/analysis.json").read_text(encoding="utf-8"))[
    "analysis"
]
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
FEEDS = build.DATA_FEEDS
WIDTHS = (360, 390, 1280)
INK = "rgb(35, 31, 27)"
CLEAR = "rgba(0, 0, 0, 0)"


def content(feed: str) -> str:
    return (ROOT / "content/lately" / f"{feed}.md").read_text(encoding="utf-8")


class Register(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def read(self, feed: str, text: str) -> dict:
        path = self.dir / f"{feed}.md"
        path.write_text(text, encoding="utf-8")
        return build.read_data_page(path, SCHEMA)

    # A page is a track page (the template render() writes for every track): kicker, number
    # and title, the feed nav in the part line's slot, the lede and the headline row, the
    # reading bar with one segment per section, one section per ## entry (What's happening,
    # then Why) with a slot naming its statistics, "built with" last, previous and next, and
    # the foot. No numbers are written into it beyond its track number.
    def test_page_frame(self) -> None:
        doc = build.render_data_page(self.read("fantasy", content("fantasy")))
        self.assertIn('<p class="tp-kicker">side d. lately · track 22 of 26</p>', doc)
        self.assertIn(
            '<div class="tp-heading"><span class="tp-no" aria-hidden="true">22</span><h1 class="tp-title" id="tp-title"><span class="sr-only">Track 22: </span>Fantasy football</h1></div>',
            doc,
        )
        self.assertIn(
            '<nav class="tp-part ld-feeds" aria-label="Lately pages"><a href="../fantasy/" aria-current="page">fantasy</a> · <a href="../watching/">watching</a>',
            doc,
        )
        self.assertIn(
            '<p class="tp-lede">My fantasy leagues, judged on strength against luck.</p>\n<p class="ld-own">These are my own numbers, from my Sleeper and ESPN accounts.</p>',
            doc,
        )
        self.assertIn('<div class="ld-headline" data-feed="fantasy"', doc)
        self.assertIn('<section class="tp-player" aria-label="Now reading">', doc)
        self.assertIn('<span class="tp-badge">status: live · updated daily</span>', doc)
        self.assertIn(
            '<span class="tp-clock"><span class="tp-clock-now">0:00</span> / <span class="tp-clock-total">',
            doc,
        )
        self.assertIn(
            '<main id="main" class="tp-main" data-total="0.0" data-live-timing>', doc
        )  # the sections are timed in the browser
        shorts = re.findall(r"^short: (.+)$", content("fantasy"), re.M)
        self.assertEqual(
            shorts,
            [
                "teams",
                "carrying",
                "odds",
                "draft",
                "waivers",
                "luck",
                "manager",
                "points",
                "bench",
                "projections",
            ],
        )
        self.assertEqual(
            re.findall(r'<span class="tp-seg-name">([^<]+)</span>', doc), shorts + ["built with"]
        )
        self.assertRegex(
            doc,
            r'<section class="tp-section ld-section ld-section--why" id="projection-accuracy" aria-labelledby="projection-accuracy-h">'
            r'<h2 class="tp-section-label" id="projection-accuracy-h"><span class="tp-label-time"></span>are the projections honest\?</h2>'
            r'<div class="tp-section-body"><span data-secs="[\d.]+" class="ld-alias" id="is-the-win-chance-honest" data-to="projection-accuracy"></span>'
            r'<div data-secs="[\d.]+" class="ld-stat" data-stat="fantasy\.platforms\.\*\.projection_accuracy"></div><div data-secs="[\d.]+" class="ld-stat" data-stat="grading\.win_chance">',
        )
        self.assertEqual(
            len(re.findall(r'<section class="tp-section(?: tp-section--first)? ld-section ', doc)),
            content("fantasy").count("\n## "),
        )
        # What's happening first, then Why; no contents list and no group headings.
        ids = re.findall(
            r'<section class="tp-section(?: tp-section--first)? ld-section ld-section--(whats-happening|why)"',
            doc,
        )
        self.assertEqual(ids, sorted(ids, key=["whats-happening", "why"].index))
        self.assertNotIn("ld-toc", doc)
        self.assertNotIn("ld-group", doc)
        self.assertNotIn("ld-hero", doc)
        # An absorbed card's id is an anchor inside the card that holds it now.
        self.assertIn(
            '<span class="ld-alias" id="strength-of-schedule" data-to="good-or-lucky"></span>',
            doc.replace(' data-secs="0.00"', ""),
        )
        self.assertIn(
            'id="manager-score" data-how="fantasy.manager_score.composite" aria-labelledby',
            (build.ROOT / "lately/fantasy/index.html").read_text(encoding="utf-8"),
        )
        # Feed blocks, the scripts the page needs, and "built with" last: data, the conditional
        # credit, the pipeline, the as-of date the browser fills.
        self.assertIn('class="ld-feed" data-block="fantasy.lineup"></div>', doc)
        self.assertIn('<script src="../../js/track.js" defer></script>', doc)
        self.assertIn(
            '<script src="../../js/lately-depth.js" defer></script>\n<script src="../../js/lately.js" defer></script>',
            doc,
        )
        self.assertIn(
            '<body class="tp-body tp-body--data ld-body" data-feed="fantasy" data-root="../../">',
            doc,
        )
        self.assertRegex(
            doc,
            r'<section class="tp-section" id="built-with" aria-labelledby="built-with-h"><h2 class="tp-section-label" id="built-with-h"><span class="tp-label-time"></span>built with</h2>'
            r'<div class="tp-section-body"><dl data-secs="0.00" class="tp-built">'
            r'<div class="tp-built-row tp-built-row--data"><dt>data</dt><dd><a href="https://sleeper.com" target="_blank" rel="noopener">Sleeper</a> and <a href="https://www.espn.com/fantasy/football/" target="_blank" rel="noopener">ESPN</a></dd></div>'
            r'<div class="tp-built-row tp-built-row--when" hidden><dt>attribution</dt><dd><p class="ld-attribution" data-when-source="yahoo" hidden><a href="https://sports.yahoo.com/fantasy/" target="_blank" rel="noopener">Fantasy data provided by Yahoo Fantasy</a></p></dd></div>'
            r'<div class="tp-built-row tp-built-row--made-with"><dt>made with</dt><dd>a nightly pipeline I wrote; the pipeline is private</dd></div>'
            r'<div class="tp-built-row tp-built-row--as-of ld-asof"><dt>as of</dt><dd><time class="ld-asof-date">…</time></dd></div></dl></div></section>',
        )
        self.assertIn(
            '<footer class="page-foot"><p class="views-note">Views are my own.</p></footer>', doc
        )
        doc = build.render_data_page(self.read("watching", content("watching")))
        self.assertIn(
            'data-stat="watching.completion.show watching.completion.film watching.completion.anime"',
            doc,
        )
        self.assertRegex(
            doc,
            r'<h2 class="tp-section-label" id="completion-h"><span class="tp-label-time"></span>do i finish what i start\?</h2><div class="tp-section-body"><p data-secs="[\d.]+" class="ld-section-note">Only finished titles are logged as a rule',
        )
        self.assertIn('class="ld-feed" data-block="watching.tiers"></div>', doc)
        self.assertNotIn(
            'class="ld-attribution"', doc
        )  # only fantasy carries the conditional Yahoo credit
        self.assertIn(
            '<dd><p class="ld-attributions" data-when-stats="watching.by_director watching.by_studio',
            doc,
        )
        for feed in FEEDS:
            doc = build.render_data_page(self.read(feed, content(feed)))
            for d in (doc, (ROOT / "lately" / feed / "index.html").read_text(encoding="utf-8")):
                d = re.sub(
                    r"track \d\d of \d\d|<span class=\"tp-no\"[^>]*>\d\d</span>|Track \d\d: |(?:previous|next) · \d\d|\d:\d\d|speed 1×",
                    "",
                    d,
                )  # track numbers, the empty clock and the speed control are the only figures
                self.assertNotRegex(
                    html.unescape(
                        re.sub(r"<[^>]+>", " ", re.sub(r"<head>.*?</head>", "", d, flags=re.S))
                    ),
                    r"\d",
                    feed,
                )  # no data in the committed page

    # Kept cards keep their ids; a removed card's id is an alias inside the card that absorbed it.
    def test_deep_links_unchanged(self) -> None:
        kept = {
            "fantasy": [
                "my-teams-week-by-week",
                "who-is-carrying-my-teams",
                "playoff-odds",
                "draft-value",
                "waiver-adds",
                "good-or-lucky",
                "manager-score",
                "acquisition-split",
                "points-left-on-the-bench",
                "projection-accuracy",
            ],
            "watching": [
                "my-rankings",
                "tiers",
                "recently",
                "keeping-up",
                "genres",
                "taste-profile",
                "whose-films",
                "crowd-agreement",
                "blockbuster",
                "sequels",
                "completion",
            ],
            "listening": [
                "right-now",
                "genres-by-month",
                "plays-by-weekday-and-hour",
                "artist-survival",
                "album-listening",
                "discovery-direction",
                "enduring",
                "entropy",
                "retention-new-artists",
                "album-half-life",
            ],
            "eating": [
                "recently-tried",
                "scores",
                "new-cuisines-by-month",
                "home-against-away",
                "does-the-order-i-rank-in-move-the-score",
                "does-the-place-before-change-the-score",
                "what-i-try-against-what-i-rate-highest",
                "landing",
                "safe-bet",
            ],
            "lifting": [
                "main-lifts",
                "body-weight",
                "training",
                "hours-by-weekday-watching-listening-training",
                "music-during-workouts",
                "strength-index",
                "body-weight-since-the-cut",
                "strength-for-body-weight",
            ],
        }
        aliases = {
            "fantasy": {
                "draft": "draft-value",
                "strength-of-schedule": "good-or-lucky",
                "the-schedule-replayed": "good-or-lucky",
                "waiver-pickups": "manager-score",
                "is-the-win-chance-honest": "projection-accuracy",
            },
            "watching": {
                "tiers-genres-and-decades": "tiers",
                "s-tier": "taste-profile",
                "community-gap-by-genre": "crowd-agreement",
                "tiers-against-the-community": "crowd-agreement",
                "my-top-ten-against-the-community": "crowd-agreement",
            },
            "listening": {
                "artist-survival-all": "artist-survival",
                "nostalgia": "discovery-direction",
                "concentration": "enduring",
            },
            "lifting": {
                "workouts-by-weekday": "training",
                "strength-kept-per-pound-lost": "strength-for-body-weight",
            },
        }
        for feed, ids in kept.items():
            doc = build.render_data_page(self.read(feed, content(feed)))
            found = re.findall(
                r'<section class="tp-section(?: tp-section--first)? ld-section ld-section--(?:whats-happening|why)" id="([a-z0-9-]+)"',
                doc,
            )
            self.assertEqual(found, ids, feed)  # the kept cards, in order, and nothing else
            for old, new in aliases.get(feed, {}).items():
                with self.subTest(feed=feed, alias=old):
                    self.assertIn(f'class="ld-alias" id="{old}" data-to="{new}"></span>', doc)
            self.assertEqual(
                re.findall(r'<a class="tp-seg" href="#([a-z0-9-]+)"', doc), ids + ["built-with"]
            )  # the reading bar lists the kept cards, then built with

    # Watching, listening, eating and lifting must credit Simkl, Last.fm, Beli and Hevy, by link.
    def test_required_attribution(self) -> None:
        for feed, name in build.DATA_ATTRIBUTION.items():
            with self.subTest(feed=feed):
                self.assertIn(f"source: {name} | https://", content(feed))
                text = re.sub(r"source: .*", "source: Someone | https://example.com", content(feed))
                with self.assertRaisesRegex(build.ContentError, f"must credit {re.escape(name)}"):
                    self.read(feed, text)
                with self.assertRaisesRegex(build.ContentError, "source must be"):
                    self.read(feed, re.sub(r"source: .*", f"source: {name}", content(feed)))

    # STAT: paths must name statistics in the merged schema; sections hold nothing else.
    def test_stat_lines(self) -> None:
        head = "---\nregister: data\nfeed: lifting\ntitle: T\nsource: Hevy | https://www.hevyapp.com\n---\n\n# What's happening\n\n"
        why = "\n# Why\n\n## Z\nshort: z\nSTAT: lifting.volume_lag\n"
        for body, err in (
            ("## A\nSTAT: lifting.nope\n", "not a statistic"),
            ("## A\nSTAT: lifting.progress\n", "not a statistic"),
            ("## A\nSTAT: fantasy.teams.margins\n", "write it with \\[\\]"),
            (
                "## A\nSome words.\n",
                "only short:, STAT:, FEED:, NOTE:, ALIAS:, SOURCE: and HOW: lines",
            ),
            ("## A\nSTAT: lifting.lag_check\n", "lacks short:"),
            (
                "## A\nshort: three word name\nSTAT: lifting.lag_check\n",
                "at most 2 lowercase words",
            ),
            ("## A\nshort: Caps\nSTAT: lifting.lag_check\n", "at most 2 lowercase words"),
            ("## A\nshort: a\nshort: b\nSTAT: lifting.lag_check\n", "only one short: line"),
            (
                "## A\nshort: a\nSTAT: lifting.lag_check\nHOW: lifting.volume_lag\n",
                "HOW: lifting.volume_lag is not one of the statistics",
            ),
            (
                "## A\nSTAT: lifting.lag_check\nHOW: lifting.lag_check\nHOW: lifting.lag_check\n",
                "only one HOW: line",
            ),
            (
                "## A\nSTAT: lifting.lag_check\nHOW: lifting.lag_check shut\n",
                "at most, the word open",
            ),
            ("## A\nFEED: lifting.nope\n", "not a block js/lately.js draws"),
            ("## A\nNOTE: only a note\n", "has no STAT: or FEED: line"),
            ("## A\n\n## B\nSTAT: lifting.lag_check\n", "has no STAT"),
            ("## A\nSTAT: lifting.lag_check\n## A\nSTAT: lifting.lag_check\n", "share an id"),
            (
                "## A\nshort: a\nSTAT: lifting.lag_check\n\n# Why\n\n## A\nshort: a\nSTAT: lifting.volume_lag\n",
                "share an id",
            ),
            ("## A\nALIAS: Not An Id\nSTAT: lifting.lag_check\n", "must be a section id"),
            (
                "## A\nshort: a\nALIAS: z\nSTAT: lifting.lag_check\n",
                "already a section id or alias",
            ),
            ("# Extra\n## A\nSTAT: lifting.lag_check\n", "groups are"),
        ):
            with self.subTest(body=body), self.assertRaisesRegex(build.ContentError, err):
                self.read("lifting", head + body + ("" if "# Why" in body else why))
        with self.assertRaisesRegex(build.ContentError, "once each"):
            self.read("lifting", head + "## A\nshort: a\nSTAT: lifting.lag_check\n")  # no Why group
        with self.assertRaisesRegex(build.ContentError, "match the file name"):
            self.read("eating", head + "## A\nshort: a\nSTAT: lifting.lag_check\n" + why)
        meta = self.read(
            "lifting",
            head
            + "## A\nshort: two words\nNOTE: a line under the title\nALIAS: an-old-card\nSTAT: lifting.progress.*\nFEED: lifting.lifts\nSTAT: cross.rhythm.workouts\n"
            + why,
        )
        self.assertEqual(meta["sections"][0]["short"], "two words")
        self.assertIn('<span class="tp-seg-name">two words</span>', build.render_data_page(meta))
        self.assertEqual(meta["sections"][0]["aliases"], ["an-old-card"])
        self.assertEqual(
            meta["sections"][0]["stats"], [["lifting.progress.*"], ["cross.rhythm.workouts"]]
        )
        self.assertEqual(
            meta["sections"][0]["slots"],
            [
                ("stat", ["lifting.progress.*"]),
                ("feed", "lifting.lifts"),
                ("stat", ["cross.rhythm.workouts"]),
            ],
        )
        self.assertEqual(meta["sections"][0]["notes"], ["a line under the title"])
        self.assertIsNone(
            meta["sections"][0]["how"]
        )  # no HOW: line: the first statistic's how is shown
        self.assertEqual([g["id"] for g in meta["groups"]], ["whats-happening", "why"])
        # HOW: names the section's primary statistic, and "open" unfolds its line by default.
        meta = self.read(
            "lifting",
            head
            + "## A\nshort: a\nSTAT: lifting.lag_check\nSTAT: lifting.progress.*\nHOW: lifting.progress.* open\n"
            + why,
        )
        self.assertEqual(meta["sections"][0]["how"], ("lifting.progress.*", True))
        self.assertIn(
            'id="a" data-how="lifting.progress.*" data-how-open aria-labelledby="a-h"',
            build.render_data_page(meta),
        )
        self.assertIn(
            '<section class="tp-section ld-section ld-section--why" id="z"',
            build.render_data_page(meta),
        )
        self.assertEqual(meta["sections"][1]["group"], "why")
        bad = head.replace(
            "source: Hevy | https://www.hevyapp.com",
            "source: Hevy | https://www.hevyapp.com\nattribution_when: yahoo | text",
        )
        with self.assertRaisesRegex(build.ContentError, "attribution_when must be"):
            self.read("lifting", bad + "## A\nshort: a\nSTAT: lifting.lag_check\n" + why)

    # Every statistic in the schema is on exactly one page, or left out on purpose.
    def test_every_statistic_placed(self) -> None:
        pages = [self.read(f, content(f)) for f in FEEDS]
        build.check_data_coverage(pages, SCHEMA)
        # The trimmed pages leave statistics out on purpose, each with a reason; none is shown anywhere.
        shown = {leaf for p in pages for leaf in p["stats"]}
        for leaf, reason in build.DATA_LEFT_OUT.items():
            with self.subTest(leaf=leaf):
                self.assertTrue(reason)
                self.assertIn(leaf, build.stat_paths(SCHEMA))
                self.assertNotIn(leaf, shown)
        self.assertIn("eating.new_cuisines", pages[FEEDS.index("eating")]["stats"])
        self.assertIn("grading.win_chance", pages[FEEDS.index("fantasy")]["stats"])
        self.assertIn("watching.s_tier", pages[FEEDS.index("watching")]["stats"])
        self.assertIn("fantasy.quadrant", pages[FEEDS.index("fantasy")]["stats"])
        self.assertIn("fantasy.manager_score.composite", pages[FEEDS.index("fantasy")]["stats"])
        self.assertIn("cross.time_budget", pages[FEEDS.index("lifting")]["stats"])
        self.assertNotIn("eating.top_ten_churn", pages[FEEDS.index("eating")]["stats"])
        dropped = copy.deepcopy(pages)
        dropped[0]["stats"].remove("fantasy.teams[].playoff_odds")
        with self.assertRaisesRegex(build.ContentError, "on no page"):
            build.check_data_coverage(dropped, SCHEMA)
        twice = copy.deepcopy(pages)
        twice[1]["stats"].append("fantasy.teams[].playoff_odds")
        with self.assertRaisesRegex(build.ContentError, "on both"):
            build.check_data_coverage(twice, SCHEMA)

    def test_sitemap_lists_the_pages(self) -> None:
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        for feed in FEEDS:
            self.assertIn(f"<loc>{build.SITE}lately/{feed}/</loc>", sitemap)


# ---------- drawing ----------


def can_draw() -> bool:
    return (
        shutil.which("node")
        and Path(CHROME).exists()
        and (ROOT / "tools/node_modules/playwright-core").is_dir()
    )


def variant(name: str) -> dict:
    d = copy.deepcopy(SAMPLE)
    d.pop("sample", None)
    a = d["analysis"] = copy.deepcopy(ANALYSIS)
    # The sample's lifts take the fixture's tracked names, so the strength index's rows (session counts,
    # splits) apply to the tiles as they do with a real file.
    for lift, lift_name in zip(
        d["lifting"]["main_lifts"], ("Bench", "Shoulder press", "Hack squat", "RDL")
    ):
        lift["name"] = lift_name
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
        # An older lately.json: none of the analysis-first statistics, top_ten_churn still there.
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
        for k in ("landing", "rerank_drift", "safe_bet"):
            del a["eating"][k]
        del a["cross"]["time_budget"], a["meta"]
        for k in (
            "by_director",
            "by_studio",
            "by_lead",
            "blockbuster",
            "sequels",
            "language",
            "critics_vs_audience",
            "crowd_agreement",
        ):
            del a["watching"][k]
        del a["lifting"]["best_held_lift"]
        del a["watching"]["taste_profile"]
        for k in (
            "artist_survival",
            "artist_survival_all",
            "album_listening",
            "discovery_direction",
        ):
            del a["listening"][k]
        a["eating"]["top_ten_churn"] = {
            "status": "not enough data yet",
            "n": 0,
            "min_n": 4,
            "as_of": a["as_of"],
            "how": "Old.",
        }
    if name == "no censor days":
        # A how line that doesn't state the censoring window: the pipeline's 60 days is used.
        a["listening"]["artist_survival"]["how"] = (
            "Kaplan–Meier curves of how long an artist stays in rotation, catalog against new."
        )
    if name == "not available":
        a["listening"]["enduring"] = {
            "status": "not available from source",
            "n": 0,
            "min_n": 20,
            "as_of": a["as_of"],
            "how": "x",
            "missing": "Apple Music lifetime counts",
        }
    if name == "one clear":
        for r in a["watching"]["taste_profile"]["values"]["rows"]:
            r["clear"] = r["name"] == "Horror"
    if name == "none clear":
        for r in a["watching"]["taste_profile"]["values"]["rows"]:
            r["clear"] = False
    if name == "hr crosses":
        a["listening"]["artist_survival"]["values"]["hr_a"] = {
            "value": 1.08,
            "interval": [0.8, 1.45],
        }
    if name == "hr below":
        a["listening"]["artist_survival"]["values"]["hr_a"] = {
            "value": 0.71,
            "interval": [0.52, 0.96],
        }
    if name == "director pair":
        rows = a["watching"]["by_director"]["values"]["rows"]
        rows[0]["name"] = "Anthony Russo & Joe Russo"
        rows[-1]["name"] = "Phil Lord & Christopher Miller"
    if name == "films waiting":
        # The film statistics present but waiting, the critics one absent; retention says when it starts.
        for k in (
            "by_director",
            "by_studio",
            "by_lead",
            "blockbuster",
            "sequels",
            "language",
            "crowd_agreement",
        ):
            a["watching"][k].update(status="not enough data yet", n=12)
            a["watching"][k].pop("values", None)
            a["watching"][k].pop("value", None)
            a["watching"][k].pop("interval", None)
        del a["watching"]["critics_vs_audience"]
        a["listening"]["retention_new_artists"].update(status="not enough data yet", n=0)
        a["listening"]["retention_new_artists"]["values"] = {
            "first_unit": "one month whose 90 days are up"
        }
        a["listening"]["entropy"]["values"]["months"] = a["listening"]["entropy"]["values"][
            "months"
        ][:1]
        a["listening"]["entropy"]["values"]["weeks"] = a["listening"]["entropy"]["values"]["weeks"][
            :1
        ]
        a["listening"]["nostalgia"]["values"]["months"] = a["listening"]["nostalgia"]["values"][
            "months"
        ][:1]
        a["listening"]["nostalgia"]["values"]["weeks"] = a["listening"]["nostalgia"]["values"][
            "weeks"
        ][:1]
    if name == "waiting":
        # The new statistics present but not yet computable.
        for st in (
            a["fantasy"]["quadrant"],
            a["watching"]["taste_profile"],
            a["lifting"]["strength_index"],
            a["listening"]["artist_survival"],
            a["eating"]["scores"],
        ):
            st.update(status="not enough data yet", n=2)
            st.pop("values", None)
            st.pop("value", None)
            st.pop("interval", None)
        a["fantasy"]["manager_score"]["components"]["moves"].update(
            status="not enough data yet", n=2
        )
        a["fantasy"]["manager_score"]["components"]["moves"].pop("values")
        a["fantasy"]["manager_score"]["components"]["lineup"].update(
            status="not enough data yet", n=0, min_n=2
        )
        a["fantasy"]["manager_score"]["components"]["lineup"].pop("values")
        a["fantasy"]["quadrant"]["values"] = {
            "first_unit": "three weeks of results across my leagues"
        }
    if name == "panel small":
        a["lifting"]["strength_index"].update(n=3, small_sample=True)
    if name == "small no value":
        # A lift with two sessions, small_sample, no value or interval yet.
        a["eating"]["contrast_effect"].pop("value")
        a["eating"]["contrast_effect"].pop("interval", None)
        rs = a["lifting"]["relative_strength"]["Incline press"]
        rs.update(
            status="ok",
            n=2,
            small_sample=True,
            values={
                "latest": 0.548,
                "series": [
                    {"date": "2026-07-01", "ratio": 0.514},
                    {"date": "2026-07-14", "ratio": 0.548},
                ],
            },
        )
        rs.pop("value", None)
        rs.pop("interval", None)
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
        d["eating"]["recent"] = [
            {"name": "Zeta Noodle", "city": "City 9", "score": 8.1},
            {"name": "alpha Cafe", "city": "City 8", "score": 9.2},
            {"name": "Mid Grill", "city": "City 7", "score": 7.0},
        ]
    if name == "two genre months":
        a["listening"]["genre_mix"]["values"]["months"] = a["listening"]["genre_mix"]["values"][
            "months"
        ][:2]
    if name == "better schedules":
        a["fantasy"]["teams"][0]["schedule_what_if"]["values"].update(better=3, same=1, worse=7)
    if name == "labelled others":
        a["fantasy"]["quadrant"]["values"]["others"][0]["label"] = "Team C"
    if name == "crowded tier":
        # Twenty more S-tier films, so the S row folds to fifteen chips and a "+N more" chip.
        pts = a["watching"]["crowd_agreement"]["values"]["points"]
        pts += [
            {
                "title": f"Extra film {i}",
                "type": "film",
                "year": 2000 + i,
                "tier": "S",
                "tier_score": 5,
                "community": 8.0,
            }
            for i in range(20)
        ]
    if name == "no bids":
        for add in a["fantasy"]["teams"][0]["waiver_adds"]["values"]["all"]:
            add["spent"] = {"kind": "free agent", "amount": 0}
    if name == "per week":
        a["cross"]["time_budget"]["values"]["to"] = a["as_of"]
    if name == "no splits":
        del a["lifting"]["strength_index"]["values"]["splits"]
    if name == "weigh-in gap":  # six weeks without a weigh-in in the middle of the series
        for w in a["lifting"]["strength_index"]["values"]["weeks"][2:8]:
            w["body_weight"] = None
    if name == "kept includes zero":
        for s in a["lifting"]["strength_kept"].values():
            if s["status"] == "ok":
                s["interval"] = [-0.4, s["interval"][1]]
    return d


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args: str) -> None:
        pass


@functools.cache
def draw(page: str, width: int = 1280, name: str = "base", body: str | None = None) -> dict:
    """body: the raw text served as data/lately.json instead of the named variant."""
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            if body is None:
                json.dump(variant(name), f)
            else:
                f.write(body)
        r = subprocess.run(
            [
                "node",
                str(ROOT / "tests/depth_render.js"),
                f"http://127.0.0.1:{server.server_port}",
                page,
                f.name,
                str(width),
            ],
            capture_output=True,
            text=True,
            timeout=200,
        )
        if r.returncode:
            raise AssertionError("render helper failed:\n" + r.stderr[-2000:])
        return json.loads(r.stdout)
    finally:
        server.shutdown()
        server.server_close()
        os.unlink(f.name)


def blocks(facts: dict, stat: str) -> list[dict]:
    return [
        b
        for s in facts["sections"]
        for sl in s["slots"]
        if stat in sl["stat"].split()
        for b in sl["blocks"]
    ]


def slot(facts: dict, stat: str) -> dict:
    return next(sl for s in facts["sections"] for sl in s["slots"] if stat in sl["stat"].split())


@unittest.skipUnless(can_draw(), "needs node, Chrome and tools/node_modules")
class Drawing(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        build.build_data_pages(SCHEMA)  # the frames the browser loads

    # Each statistic: value and interval, its chart or table, its n, and the "how" sentence in the label face.
    def test_ok_statistic(self) -> None:
        d = draw("lately/lifting/")
        (b,) = blocks(d, "lifting.body_weight_rate")
        self.assertEqual((b["status"], b["value"]), ("ok", "−0.59"))
        self.assertEqual(b["interval"], "95% interval −0.63 to −0.56")
        self.assertTrue(b["n"].startswith("n = 20 weigh-ins"))
        self.assertGreater(b["charts"], 0)
        sl = slot(d, "lifting.body_weight_rate")
        self.assertEqual(sl["hows"], ["how: " + ANALYSIS["lifting"]["body_weight_rate"]["how"]])
        self.assertEqual(
            (sl["howSummary"], sl["howOpen"]), (["how"], [False])
        )  # folded under "how", closed by default
        self.assertIn("Courier Prime", sl["howFont"])

    # "not enough data yet": under What's happening the statistic isn't drawn and a section with
    # nothing else is hidden with its contents entry. A card under Why keeps its question over one
    # line, "nothing to show yet: needs <first unit>". No count of units needed, no "available from"
    # date and no "more statistics" line anywhere; no headline tile shows a "–".
    def test_not_enough_data(self) -> None:
        for feed in FEEDS:
            for name in ("base", "films waiting", "waiting", "young archive"):
                with self.subTest(feed=feed, variant=name):
                    d = draw(f"lately/{feed}/", name=name)
                    for s in d["sections"]:
                        for sl in s["slots"]:
                            for b in sl["blocks"]:
                                if b["status"] == "not enough data yet":
                                    self.assertEqual(s["group"], "why", s["id"])
                                    self.assertRegex(
                                        b["wait"], r"^nothing to show yet(: needs [^.]+)?$"
                                    )
                                    self.assertEqual(b["charts"], 0)
                    self.assertIsNone(d["waiting"])
                    self.assertNotRegex(
                        d["bodyText"],
                        r"\bneeded\b|available from|as data accrues|not enough data yet",
                    )
        lifting = draw("lately/lifting/")
        # Relative strength is a Why card: the lifts without data wait in place, each naming its first unit.
        waits = [
            b
            for b in blocks(lifting, "lifting.relative_strength.*")
            if b["status"] == "not enough data yet"
        ]
        self.assertTrue(waits)
        self.assertEqual(
            waits[0]["wait"],
            "nothing to show yet: needs four sessions of Incline press in weeks with a weigh-in",
        )
        # A statistic the pipeline left without a first unit shows the bare line.
        young = draw("lately/listening/", name="young archive")
        self.assertEqual(
            blocks(young, "listening.artist_survival")[0]["wait"], "nothing to show yet"
        )
        for s in young["sections"]:
            with self.subTest(section=s["id"]):
                if not s["slots"]:
                    continue  # a feed block, drawn from the feed itself
                if s["group"] == "whats-happening":
                    self.assertEqual(s["hidden"], not any(sl["blocks"] for sl in s["slots"]))
                else:
                    self.assertFalse(s["hidden"])
        self.assertIn("genres-by-month", young["hiddenSections"])
        self.assertEqual(
            sorted(seg[0] for seg in young["segs"] if seg[2]),
            sorted("#" + i for i in young["hiddenSections"]),
        )  # hidden sections leave the reading bar
        self.assertEqual(young["headline"], [])
        listening = next(
            p
            for p in draw("index.html", name="young archive")["panels"]
            if p["id"] == "panel-listening"
        )
        self.assertFalse([h for h in listening["headline"] if h[1] == "–"])
        self.assertTrue(listening["wait"])

    # Eating: "Which cuisines are a safe bet?" (dot-and-range rows, narrowest first, the safest and the
    # widest named) replaces re-rank drift; "Where do new places land?" is the current-ranking version.
    def test_eating_cards(self) -> None:
        d = draw("lately/eating/")
        self.assertEqual(
            [s["id"] for s in d["sections"] if s["group"] == "why"][-2:], ["landing", "safe-bet"]
        )
        self.assertNotIn("Do scores drift when I re-rank?", d["bodyText"])
        (sb,) = blocks(d, "eating.safe_bet")
        self.assertEqual(sb["value"], "1.70")
        self.assertIn(
            "Vietnamese is the safest bet: the middle half of its scores spans 1.70 points around a median of 8.91. Korean is the widest at 3.56 points.",
            sb["text"],
        )
        self.assertEqual(
            [c[0] for c in sb["cells"]],
            ["Vietnamese", "Japanese", "Chinese", "Poke", "Ramen", "Korean"],
        )  # narrowest first
        self.assertEqual(sb["cells"][0][3:], ["1.70", "22"])
        self.assertIn("1.70 · n = 22", sb["text"])
        (ld,) = blocks(d, "eating.landing")
        self.assertTrue(ld["value"].endswith("%"))
        self.assertEqual(
            ld["rows"], 20 + len(ANALYSIS["eating"]["landing"]["values"]["months"])
        )  # the 20 places' table and the months' table
        self.assertEqual(len([t for t in d["titles"] if t and t.endswith("% up my list")]), 20)
        self.assertIn("Where did the last 20 places I ranked land in my list?", ld["text"])
        self.assertIn("Where did new places land, by month of first ranking?", ld["text"])

    # small_sample: the card draws as usual with the tag beside its n; a waiting manager-score
    # component is a row with the tag; a panel on a small sample carries the tag under its numbers.
    def test_small_sample(self) -> None:
        (ce,) = blocks(draw("lately/eating/"), "eating.contrast_effect")
        self.assertEqual(ce["status"], "ok")
        self.assertEqual(ce["tags"], ["small sample, threshold 30"])
        self.assertTrue(ce["n"].startswith("n = 20 pairs"))
        self.assertEqual(ce["n"], "n = 20 pairs · small sample, threshold 30")
        self.assertGreater(ce["charts"], 0)
        (sq,) = blocks(draw("lately/watching/"), "watching.sequels")
        self.assertEqual(sq["tags"], ["small sample, threshold 3"])
        self.assertTrue(sq["value"])
        # A small sample without a headline value still draws its figures and tag, and the slot's other lifts draw too.
        nv = draw("lately/eating/", name="small no value")
        (ce2,) = blocks(nv, "eating.contrast_effect")
        self.assertEqual(
            (ce2["status"], ce2["value"], ce2["tags"]), ("ok", None, ["small sample, threshold 30"])
        )
        self.assertGreater(ce2["charts"], 0)
        lv = draw("lately/lifting/", name="small no value")
        rs = [
            b
            for b in blocks(lv, "lifting.relative_strength.*")
            if b["status"] == "ok" and b["tags"]
        ]
        self.assertEqual(
            [(b["value"], b["tags"]) for b in rs], [(None, ["small sample, threshold 4"])]
        )
        self.assertIn("0.548 lb e1RM per lb", rs[0]["text"])
        self.assertEqual(lv["errors"], [])
        # Cards without the flag carry no tag.
        self.assertEqual(blocks(draw("lately/eating/"), "eating.home_bias")[0]["tags"], [])
        waiting = next(
            s
            for s in draw("lately/fantasy/", name="waiting")["sections"]
            if s["id"] == "manager-score"
        )
        (wb,) = waiting["slots"][0]["blocks"]
        self.assertEqual(
            wb["tagRows"],
            [
                "Lineup · n = 0 weeks · small sample, threshold 2",
                "Moves · n = 2 weeks · small sample, threshold 4",
            ],
        )
        self.assertIsNone(wb["wait"])
        lifting = next(
            p
            for p in draw("index.html", name="panel small")["panels"]
            if p["id"] == "panel-lifting"
        )
        self.assertEqual(lifting["tagLine"], "small sample, threshold 4")
        self.assertEqual(lifting["charts"], 2)  # body weight over strength
        base = next(p for p in draw("index.html")["panels"] if p["id"] == "panel-lifting")
        self.assertIsNone(base["tagLine"])

    # Each page opens with whose numbers these are and which apps they come from.
    # Every lately page has the track header: side, number and title, the panel's one-line
    # description, then whose numbers these are. The main page's panels carry the same number
    # and description; the track pages count side D in their "of".
    def test_lede(self) -> None:
        want = {
            "fantasy": "Sleeper and ESPN accounts",
            "watching": "Simkl account",
            "listening": "Last.fm account",
            "eating": "Beli account",
            "lifting": "Hevy account",
        }
        numbers = {
            "fantasy": "22",
            "watching": "23",
            "listening": "24",
            "eating": "25",
            "lifting": "26",
        }
        schema = json.loads((ROOT / build.SCHEMA_PATH).read_text(encoding="utf-8"))
        panels = {p["id"]: p for p in draw("index.html")["panels"]}
        for feed, apps in want.items():
            d = draw(f"lately/{feed}/")
            one_line = build.read_data_page(ROOT / "content/lately" / f"{feed}.md", schema)[
                "one_line"
            ]
            self.assertEqual(
                (d["kicker"], d["no"], d["lede"], d["own"]),
                (
                    f"side d. lately · track {numbers[feed]} of 26",
                    numbers[feed],
                    one_line,
                    f"These are my own numbers, from my {apps}.",
                ),
            )
            self.assertEqual(
                d["title"],
                f"Track {numbers[feed]}: "
                + {
                    "fantasy": "Fantasy football",
                    "watching": "Watching",
                    "listening": "Listening",
                    "eating": "Eating",
                    "lifting": "Lifting",
                }[feed],
            )
            self.assertEqual(d["badge"], "status: live · updated daily")
            self.assertEqual([f for f, _ in d["feedsNav"]], list(FEEDS))
            self.assertEqual([f for f, cur in d["feedsNav"] if cur == "page"], [feed])
            self.assertEqual(
                (panels[f"panel-{feed}"]["no"], panels[f"panel-{feed}"]["desc"]),
                (numbers[feed], one_line),
            )
        self.assertIn(
            "track 09 of 26",
            (ROOT / "tracks/receptivity-evaluation/index.html").read_text(encoding="utf-8"),
        )

    # A window shorter than its label is labelled by its real start: "since 11 Oct".
    def test_listening_window(self) -> None:
        young, base = (
            draw("lately/listening/", name="young archive")["bodyText"],
            draw("lately/listening/")["bodyText"],
        )
        for label in ("Plays, ", "Who did I play most, ", "When do I listen, by hour of day, "):
            self.assertIn(label + "since 11 Oct", young)
            self.assertIn(label + "last 30 days", base)
        self.assertNotIn("last 30 days", young)
        home_young, home = draw("index.html", name="young archive"), draw("index.html")
        self.assertIn(
            "Plays, since 11 Oct", home_young["bodyText"]
        )  # entropy is waiting there: the window's plays
        self.assertIn(
            "Hazard ratio, new vs catalog", home["bodyText"]
        )  # the panel asks about rotation now
        self.assertNotIn("Who did I play most", home["bodyText"])  # the list left the main page

    # The tier board: films by default, five rows, every row open; a row with more than fifteen
    # titles shows fifteen and a "+N more" chip that opens the rest; chips carry the year and a
    # hover with type, year and community score; a summary per row.
    def test_tier_board(self) -> None:
        d = draw("lately/watching/")
        pts = [
            p
            for p in ANALYSIS["watching"]["crowd_agreement"]["values"]["points"]
            if p["type"] == "film"
        ]
        board = d["board"]
        self.assertEqual(board["tabs"], ["Films · " + str(len(pts)), "Shows · 0", "Anime · 0"])
        self.assertEqual(board["pressed"], "film")
        self.assertEqual([r["tier"] for r in board["rows"]], ["S", "A", "B", "C", "D"])
        self.assertEqual(
            [r["chips"] for r in board["rows"]],
            [len([p for p in pts if p["tier"] == t]) for t in "SABCD"],
        )
        for r in board["rows"]:
            with self.subTest(tier=r["tier"]):
                self.assertEqual(r["shown"], min(r["chips"], 15))
                self.assertEqual(r["more"], f"+{r['chips'] - 15} more" if r["chips"] > 15 else None)
        crowded = draw("lately/watching/", name="crowded tier")["board"]["rows"][0]
        self.assertGreater(crowded["chips"], 15)
        self.assertEqual(
            (crowded["shown"], crowded["more"], crowded["moreExpanded"]),
            (15, f"+{crowded['chips'] - 15} more", "false"),
        )
        s_row = board["rows"][0]
        self.assertTrue(s_row["summary"].startswith("mostly "), s_row["summary"])
        self.assertRegex(s_row["hover"][0], r"^film · \d{4} · community \d\.\d$")
        self.assertTrue(all(c for c in s_row["years"]))
        self.assertEqual(d["sections"][1]["id"], "tiers")

    # Tabs. Fantasy: every section with per-team statistics has one strip of team tabs (the
    # team's name as the pipeline labels it), the selected team's blocks shown and the rest
    # hidden; the strips switch together, and #team=<key> in the hash (as the main page's team
    # links write it) picks the team, with a section anchor kept beside it. Watching: My rankings,
    # the tier board and every per-type section share Films / Shows / Anime tabs, films first.
    def test_tabs(self) -> None:
        d = draw("lately/fantasy/")
        teams = [t["name"] for t in ANALYSIS["fantasy"]["teams"]]
        secs = {s["id"]: s for s in d["tabSections"]}
        for sid, panels in (
            ("playoff-odds", 3),
            ("draft-value", 6),
            ("waiver-adds", 3),
            ("good-or-lucky", 6),
            ("manager-score", 3),
            ("acquisition-split", 3),
            ("points-left-on-the-bench", 3),
        ):
            with self.subTest(section=sid):
                s = secs[sid]
                self.assertEqual((s["strips"], s["tabs"], s["pressed"]), (1, teams, [teams[0]]))
                self.assertEqual((s["panels"], s["hiddenPanels"]), (panels, panels - panels // 3))
        for sid in ("my-teams-week-by-week", "projection-accuracy"):  # cross-league: no tabs
            self.assertEqual(secs[sid]["strips"], 0)
        picked = draw("lately/fantasy/#good-or-lucky&team=espn-10-team-1-flex")
        self.assertEqual(picked["hash"], "#good-or-lucky&team=espn-10-team-1-flex")
        self.assertTrue(
            all(s["pressed"] == [teams[2]] for s in picked["tabSections"] if s["strips"])
        )
        home = draw("index.html")
        self.assertEqual(
            home["teamLinks"],
            [
                [teams[0], "lately/fantasy/#team=sleeper-12-team-ppr"],
                [teams[1], "lately/fantasy/#team=espn-10-team-2-flex"],
            ],
        )
        w = draw("lately/watching/")
        wsecs = {s["id"]: s for s in w["tabSections"]}
        for sid, panels in (
            ("my-rankings", 3),
            ("genres", 3),
            ("crowd-agreement", 6),
            ("completion", 3),
        ):
            with self.subTest(section=sid):
                self.assertEqual(
                    (wsecs[sid]["strips"], wsecs[sid]["tabs"], wsecs[sid]["pressed"]),
                    (1, ["Films", "Shows", "Anime"], ["Films"]),
                )
                self.assertEqual(
                    (wsecs[sid]["panels"], wsecs[sid]["hiddenPanels"]),
                    (panels, panels - panels // 3),
                )
        self.assertEqual(
            wsecs["tiers"]["pressed"],
            [
                "Films · "
                + str(
                    len(
                        [
                            p
                            for p in ANALYSIS["watching"]["crowd_agreement"]["values"]["points"]
                            if p["type"] == "film"
                        ]
                    )
                )
            ],
        )
        for sid in ("taste-profile", "whose-films", "blockbuster", "sequels"):
            self.assertEqual(wsecs[sid]["strips"], 0)

    # The listening page's survival card keeps its 95% bands behind a "show 95% bands" button,
    # off by default; "Genres by month" waits until three months are in the file.
    def test_survival_bands_and_genre_months(self) -> None:
        l = draw("lately/listening/")
        (sv,) = blocks(l, "listening.artist_survival")
        self.assertEqual(
            (sv["kmBands"], sv["kmBandsShown"], sv["kmToggle"], sv["kmGuide"]),
            (2, 0, "show 95% bands", 0),
        )
        self.assertEqual(
            sv["chartTitles"],
            ["Of the artists I start playing, how many am I still playing 24 months later?"],
        )
        self.assertNotIn("genres-by-month", l["hiddenSections"])
        two = draw("lately/listening/", name="two genre months")
        self.assertIn("genres-by-month", two["hiddenSections"])

    # Eating: "Recently tried" in alphabetical order without cities, so it carries no dates;
    # the home city is never named (it's "my most-ranked city").
    def test_eating_places(self) -> None:
        self.assertEqual(
            draw("lately/eating/", name="places")["places"],
            [
                ["alpha Cafe", "9.20", None],
                ["Mid Grill", "7.00", None],
                ["Zeta Noodle", "8.10", None],
            ],
        )
        (hb,) = blocks(draw("lately/eating/"), "eating.home_bias")
        self.assertNotIn("City 1", hb["text"])
        eating = next(p for p in draw("index.html")["panels"] if p["id"] == "panel-eating")
        self.assertNotIn(
            "City 1",
            eating["answer"]
            + " "
            + " ".join(" ".join(x or "" for x in h) for h in eating["headline"])
            + " "
            + (eating["legend"] or ""),
        )

    # "not available from source": a one-line note, nothing else.
    def test_not_available(self) -> None:
        d = draw("lately/listening/", name="not available")
        (b,) = blocks(d, "listening.enduring")
        self.assertEqual(b["note"], "not available from source: Apple Music lifetime counts")
        self.assertEqual((b["lines"], b["charts"]), (1, 0))
        self.assertEqual(slot(d, "listening.enduring")["hows"], [])

    # Every page states its source, with the required attribution linked, and the as_of date.
    def test_source_and_as_of(self) -> None:
        names = dict(build.DATA_ATTRIBUTION, fantasy="Sleeper")
        for feed in FEEDS:
            with self.subTest(feed=feed):
                d = draw(f"lately/{feed}/")
                self.assertEqual(d["asof"], "13 Oct 2026")
                self.assertIn(names[feed], [a for a, _ in d["sourceLinks"]])
                self.assertTrue(all(u.startswith("https://") for _, u in d["sourceLinks"]))
                note = "Beli dates are used only as counts, never tied to a place"
                (self.assertIn if feed == "eating" else self.assertNotIn)(note, d["source"])
                # The rows of "built with": data, the licence lines while the data calls for them, the pipeline, as of.
                rows = [(label, hidden) for label, _, hidden in d["builtRows"]]
                self.assertEqual(
                    [l for l, h in rows if not h],
                    ["data"]
                    + (["attribution"] if feed == "watching" else [])
                    + ["made with", "as of"],
                    feed,
                )
                self.assertEqual(
                    next(v for l, v, _ in d["builtRows"] if l == "made with"),
                    "a nightly pipeline I wrote; the pipeline is private",
                )
                self.assertEqual(d["errors"], [])

    # Wins and losses (the lineup grid) by filled and outlined marks with their letter, never colour alone.
    def test_wins_and_losses(self) -> None:
        d = draw("lately/fantasy/")
        wins = [s for s in d["squares"] if s["letter"] == "W"]
        losses = [s for s in d["squares"] if s["letter"] == "L"]
        self.assertTrue(wins and losses)
        self.assertTrue(all(s["bg"] == INK for s in wins))
        self.assertTrue(all(s["bg"] == CLEAR and s["border"] == "solid" for s in losses))

    # Waiver adds: hit rate with its interval, net points available against captured, adds a
    # week, then every add with the best and worst three marked, and the how-line under it.
    def test_waiver_adds(self) -> None:
        d = draw("lately/fantasy/")
        teams = ANALYSIS["fantasy"]["teams"]
        wa = teams[0]["waiver_adds"]
        first, second = blocks(d, "fantasy.teams[].waiver_adds")[:2]
        self.assertEqual((first["value"], first["interval"]), ("50%", "95% interval 19% to 81%"))
        for bit in (
            "net points available+8.48",
            "net points captured−3.24",
            "adds a week1.2",
            "Every add, best and worst three markedWeekAddedDroppedBidClass",
            "$11",
            "hit, left on the bench",
        ):
            self.assertIn(bit, first["text"])
        for b, team in ((first, teams[0]), (second, teams[1])):
            adds = team["waiver_adds"]["values"]["all"]
            self.assertEqual(b["rows"], len(adds))  # every add, not only the six
            self.assertEqual(b["text"].count("▲ best"), sum(a["best"] for a in adds))
            self.assertEqual(b["text"].count("▽ worst"), sum(a["worst"] for a in adds))
            self.assertNotIn("aren't in it", b["text"])
        self.assertEqual(second["rows"], 14)
        # More than ten rows: ten shown, the rest hidden behind "show all N" (aria-controls names the table).
        self.assertEqual(
            (second["hiddenRows"], second["more"]), (4, [["show all 14", "false", True]])
        )
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
        self.assertIn(
            "The data lists the best and worst three of 14 adds; the other 8 aren't in it.",
            old["text"],
        )

    # Lineup efficiency gains the bench-hit line: waiver hits that sat on my bench.
    def test_bench_hit_line(self) -> None:
        le = blocks(draw("lately/fantasy/"), "fantasy.teams[].lineup_efficiency")
        self.assertIn(
            "Hit, left on the bench: 1 add, 26.6 points on my bench, +12.88 net points available.",
            le[0]["text"],
        )
        self.assertIn("Hit, left on the bench: no waiver adds.", le[1]["text"])

    # The win-chance calibration (Brier score from twenty predictions) sits inside "Are the
    # projections honest?", "not enough data yet" before that.
    def test_grading(self) -> None:
        sec = next(
            s
            for s in draw("lately/fantasy/")["sections"]
            if s["title"] == "are the projections honest?"
        )
        (b,) = slot(draw("lately/fantasy/"), "grading.win_chance")["blocks"]
        self.assertEqual(b["value"], "0.210")
        self.assertIn("Brier score", b["text"])
        self.assertIn("Predicted win chance against how often I won", b["text"])
        # With fewer than 20 predictions stored the gate holds it back: the card (it is under
        # Why) keeps its question over the box, with the gate's n and min_n.
        few = draw("lately/fantasy/", name="few predictions")
        (fb,) = blocks(few, "grading.win_chance")
        self.assertEqual((fb["status"], fb["wait"]), ("not enough data yet", "nothing to show yet"))
        self.assertFalse(slot(few, "grading.win_chance")["hidden"])

    QUESTIONS = {
        "fantasy": "Good, or lucky?",
        "watching": "What does my taste look like?",
        "listening": "Does old music last longer than new?",
        "eating": "What biases my scores?",
        "lifting": "Is the cut costing strength?",
    }

    # The main page: fantasy across the width, then watching | listening, then eating | lifting.
    # Each panel: title, source line in the label face, the question in bold, a two-sentence
    # answer, two or three numbers, one chart and "more about <feed> →"; the lists and grids
    # live under What's happening on the feed pages.
    def test_main_page_panels(self) -> None:
        d = draw("index.html")
        self.assertEqual(
            d["panelOrder"],
            [
                "panel-fantasy",
                ["panel-watching", "panel-listening"],
                ["panel-eating", "panel-lifting"],
            ],
        )
        # The source-status chips sit below the last panel, above the attribution footer; the intro stays in the head.
        self.assertEqual(
            d["latelyChildren"],
            [
                "lately-head",
                "panel-fantasy",
                "panel-grid panel-grid--two",
                "panel-grid panel-grid--two",
                "lately-sources",
                "lately-foot",
            ],
        )
        self.assertTrue(d["chips"] and all(" · " in c for c in d["chips"]), d["chips"])
        self.assertIn("A nightly job pulls my fantasy leagues", d["bodyText"])
        panels = {p["id"]: p for p in d["panels"]}
        self.assertNotIn("panel-rankings", panels)
        for feed, q in self.QUESTIONS.items():
            with self.subTest(feed=feed):
                p = panels[f"panel-{feed}"]
                # The header is the track card's: number, title, one-line description, the "more →" control.
                self.assertEqual(
                    p["more"], [f"lately/{feed}/", "more →", f"more about {feed}", "panel-head"]
                )
                self.assertEqual(
                    sorted(p["headChildren"]),
                    ["ld-more control", "track-body", "track-desc", "track-no", "track-title"],
                )
                self.assertFalse(p["titleLink"])
                self.assertEqual(p["question"], q)
                self.assertEqual(p["questionWeight"], "700")
                self.assertEqual(len(re.findall(r"[.!?](\s|$)", p["answer"])), 2, p["answer"])
                self.assertTrue(2 <= len(p["headline"]) <= 3, p["headline"])
                self.assertFalse(
                    [h for h in p["headline"] if h[1] in ("–", "", None)], p["headline"]
                )
                self.assertEqual(
                    p["charts"], 2 if feed == "lifting" else 1, (feed, p["charts"])
                )  # lifting: body weight over strength
                self.assertIsNone(p["wait"])
                self.assertEqual(p["removed"], 0)
        f = panels["panel-fantasy"]
        self.assertEqual([h[1] for h in f["headline"]], ["13–7", "+1.8", "3 of 4"])
        self.assertEqual(
            f["quadCorners"],
            ["bad and lucky", "good and lucky", "bad and unlucky", "good and unlucky"],
        )
        self.assertEqual(
            sorted(f["quadMine"]), sorted(t["name"] for t in ANALYSIS["fantasy"]["teams"])
        )
        self.assertEqual(f["quadOthers"], len(ANALYSIS["fantasy"]["quadrant"]["values"]["others"]))
        for t in f["quadTitles"]:  # hover: record and all-play only
            self.assertRegex(t, r"^\d+–\d+(–\d+)? · all-play \d+%$")
        w = panels["panel-watching"]
        tp = ANALYSIS["watching"]["taste_profile"]["values"]
        self.assertEqual(
            [h[0] for h in w["headline"]],
            ["Agreement with the crowd", "Predictable from metadata", "Films that are S"],
        )
        self.assertEqual(w["headline"][1][1:], ["44%", "vs 33% baseline guessing"])
        self.assertEqual(
            w["answer"],
            "Drama, Crime and Romance lift my tiers; Horror and Action lower them. Release year, Animation and Runtime don't move me.",
        )
        self.assertEqual(w["effectRows"], len(tp["rows"]))
        self.assertEqual(w["effectUnclear"], len([r for r in tp["rows"] if not r["clear"]]))
        self.assertEqual(w["effectValues"][0], "+0.44")
        self.assertIn(
            "Above the crowd: "
            + tp["disagreements"]["above"][0]["title"]
            + " ("
            + tp["disagreements"]["above"][0]["tier"]
            + ", ",
            d["bodyText"],
        )
        self.assertIn("Below: ", d["bodyText"])
        one = next(
            p for p in draw("index.html", name="one clear")["panels"] if p["id"] == "panel-watching"
        )["answer"]
        self.assertEqual(
            one,
            "Beyond the crowd's score, only Horror clearly moves my tiers, downward. Nothing else is distinguishable from noise at 276 titles.",
        )
        none = next(
            p
            for p in draw("index.html", name="none clear")["panels"]
            if p["id"] == "panel-watching"
        )["answer"]
        self.assertEqual(
            none,
            "Beyond the crowd's score, nothing clearly moves my tiers. No feature is distinguishable from noise at 276 titles.",
        )
        for gone in ("by director?", "Anime studios: ", "really listening to, by week?"):
            self.assertNotIn(gone, d["bodyText"], gone)  # these live on the track pages now
        li = panels["panel-listening"]
        sv = ANALYSIS["listening"]["artist_survival"]["values"]
        self.assertEqual(
            [h[0] for h in li["headline"]],
            [
                "Median rotation length, all artists",
                "Hazard ratio, new vs catalog",
                "Discoveries that are catalog",
            ],
        )
        self.assertEqual(li["headline"][1][1], "1.62×")
        # The censoring window comes from the how line (60 days in the fixture, as the pipeline writes it);
        # the source line names the library export beside Last.fm.
        self.assertEqual(li["headline"][0][2], "from first play to 60 days without one")
        self.assertEqual(
            next(
                p
                for p in draw("index.html", name="no censor days")["panels"]
                if p["id"] == "panel-listening"
            )["headline"][0][2],
            "from first play to 60 days without one",
        )
        # The answer leads with the plain reading; the hazard ratio is a tile, not in the sentence.
        self.assertTrue(
            li["answer"].startswith(
                "Half of my catalog discoveries are still in rotation after 16 months, against 12 for new ones: new music fades faster."
            ),
            li["answer"],
        )
        self.assertNotIn("1.62", li["answer"])
        # The panel's chart: the question as its title, "still in rotation" on the y axis, no bands, one 50% guide
        # with each curve's crossing point marked and labelled from its median.
        self.assertEqual(
            li["chartTitles"],
            ["Of the artists I start playing, how many am I still playing 24 months later?"],
        )
        self.assertEqual(
            (li["kmYLabel"], li["kmBands"], li["kmGuide"], li["kmCross"]),
            ("still in rotation", 0, 1, ["catalog 16 mo", "new 12 mo"]),
        )
        self.assertTrue(
            li["answer"].endswith(
                "of my discoveries are catalog artists, over five years old when first played."
            ),
            li["answer"],
        )
        self.assertNotIn("Note:", li["answer"])
        self.assertEqual(li["tags"], ["pre-sync artists excluded"])
        self.assertEqual(
            li["tagLine"],
            "pre-sync artists excluded · see the listening page for the version that includes them",
        )
        self.assertEqual(li["kmCurves"], 2)
        self.assertEqual(li["kmMedians"], len([c for c in sv["curves"] if c["median"] is not None]))
        self.assertIn("catalog · n = " + str(sv["n"]["catalog"]), d["bodyText"])
        self.assertIn(
            "Longest in rotation: "
            + sv["longest_lived"][0]["artist"]
            + " ("
            + str(sv["longest_lived"][0]["months"])
            + " months, still playing)",
            d["bodyText"],
        )
        self.assertIn("This product uses the TMDB API", d["bodyText"])
        # The other two hazard cases.
        cross = next(
            p
            for p in draw("index.html", name="hr crosses")["panels"]
            if p["id"] == "panel-listening"
        )["answer"]
        self.assertTrue(
            cross.startswith(
                "After 16 months I'm still playing about half of both groups; no real difference yet."
            ),
            cross,
        )
        below = next(
            p for p in draw("index.html", name="hr below")["panels"] if p["id"] == "panel-listening"
        )["answer"]
        self.assertTrue(
            below.startswith(
                "Half of my catalog discoveries are still in rotation after 16 months, against 12 for new ones: new music lasts longer."
            ),
            below,
        )
        e = panels["panel-eating"]
        self.assertEqual(e["headline"][0][:2], ["Median score", "7.97"])
        self.assertIn("minus my overall median of 7.97", e["legend"])
        self.assertIn("home against away", d["bodyText"])
        lf = panels["panel-lifting"]
        self.assertEqual(
            [h[0] for h in lf["headline"]],
            ["Body weight since the cut", "Strength index since the cut", "Best-held lift"],
        )
        self.assertEqual(
            lf["headline"][2][1:],
            [ANALYSIS["lifting"]["best_held_lift"]["name"], "+12.4% since the cut"],
        )
        self.assertNotIn("logged by hand", d["bodyText"])  # no hand-entered best anywhere
        # Body weight on its own small panel above the strength panel (one thin line through every
        # weigh-in, a marker at each), the strength index and three thin split lines under it,
        # every series labelled in the legend only, both with the dashed 100 baseline.
        self.assertEqual(
            lf["chartTitles"],
            [
                "How has my body weight moved since the cut started?",
                "Has my strength held since the cut started?",
            ],
        )
        self.assertEqual(lf["lineCount"], 5)
        self.assertEqual(lf["thinCount"], 4)  # body weight (points) and the three splits
        weeks = ANALYSIS["lifting"]["strength_index"]["values"]["weeks"]
        # Every point is marked: the strength index and its three splits every week, body weight at each weigh-in.
        full = 4 * len(weeks)
        self.assertEqual(
            lf["pointDots"], full + len([w for w in weeks if w["body_weight"] is not None])
        )
        # Six weeks without a weigh-in: still one connected line, a marker at each weigh-in that is there.
        gap = next(
            p
            for p in draw("index.html", name="weigh-in gap")["panels"]
            if p["id"] == "panel-lifting"
        )
        self.assertEqual(
            (gap["lineCount"], gap["thinCount"], gap["pointDots"]), (5, 4, full + len(weeks) - 6)
        )
        self.assertEqual(lf["endLabels"], 0)
        for name in (
            "chest and back",
            "shoulders and arms",
            "legs",
            "body weight",
            "100 = cut start",
        ):
            self.assertIn(name, lf["legendAll"] or "")
        self.assertEqual(panels["panel-fantasy"]["quadTrails"], 0)  # no trails on the panel
        self.assertRegex(
            lf["answer"],
            r"; legs are (up|down) \d+\.\d%, shoulders and arms [+−]\d+\.\d%, chest and back [+−]\d+\.\d%\.$",
        )
        self.assertEqual(len(re.findall(r"[.!?](\s|$)", lf["answer"])), 2)
        # Without splits (an older file) the overall line only.
        old = next(
            p for p in draw("index.html", name="no splits")["panels"] if p["id"] == "panel-lifting"
        )
        self.assertEqual(
            (old["lineCount"], old["thinCount"]), (2, 1)
        )  # body weight (thin, points) and strength
        self.assertNotIn("legs are", old["answer"])
        for gone in (
            "Restaurants ranked",
            "Recently tried",
            "Who is carrying my teams",
            "Estimated one-rep max, main lifts",
            "Which muscle groups got the work",
            "My rankings",
            "Recently",
        ):
            self.assertNotIn(gone, d["bodyText"], gone)
        self.assertIn(
            "Restaurants ranked", draw("lately/eating/")["bodyText"]
        )  # moved, not deleted

    # Every panel still stands when its statistic is "not enough data yet" or the file predates
    # it: the question, one line ("nothing to show yet…" or "not in the data yet"), the numbers, the link.
    def test_main_page_panels_waiting(self) -> None:
        for name, box in (
            ("waiting", r"^nothing to show yet(: needs [^.]+)?$"),
            ("old file", r"^not in the data yet · appears once the pipeline publishes it$"),
        ):
            d = draw("index.html", name=name)
            for p in d["panels"]:
                with self.subTest(variant=name, panel=p["id"]):
                    self.assertEqual(p["question"], self.QUESTIONS[p["id"][len("panel-") :]])
                    self.assertEqual(len(re.findall(r"[.!?](\s|$)", p["answer"])), 2, p["answer"])
                    self.assertTrue(2 <= len(p["headline"]) <= 3, p["headline"])
                    self.assertFalse(
                        [h for h in p["headline"] if h[1] in ("–", "", None)], p["headline"]
                    )
                    if name == "old file" and p["id"] == "panel-eating":
                        self.assertEqual(
                            p["charts"], 1
                        )  # its chart comes from scores, which old files have
                        continue
                    self.assertRegex(p["wait"], box)
                    self.assertEqual(p["charts"], 0)
                    self.assertTrue(p["more"])
                    # No count of units needed, no "available from", no date in the wait line; none of the first two in the answer.
                    self.assertNotRegex(p["wait"], r"\bneeded\b|available|\d{4}")
                    self.assertNotRegex(
                        p["answer"], r"\bneeded\b|available from|\(\d+ of \d+ \w+\)"
                    )
            self.assertEqual(d["errors"], [])
        # The fantasy sentence and line name the first unit; listening's, without one, says only that.
        ws = {p["id"]: p for p in draw("index.html", name="waiting")["panels"]}
        self.assertTrue(
            ws["panel-fantasy"]["answer"].endswith(
                "The strength-and-luck chart has nothing to show yet: it needs three weeks of results across my leagues."
            ),
            ws["panel-fantasy"]["answer"],
        )
        self.assertEqual(
            ws["panel-fantasy"]["wait"],
            "nothing to show yet: needs three weeks of results across my leagues",
        )
        self.assertEqual(ws["panel-listening"]["wait"], "nothing to show yet")
        self.assertIn(
            "whether old music lasts longer has nothing to show yet.",
            ws["panel-listening"]["answer"],
        )
        # Entropy by week lives on the listening page ("Is my taste narrowing?").
        one = next(
            s
            for s in draw("lately/listening/", name="films waiting")["sections"]
            if s["id"] == "entropy"
        )
        self.assertEqual(one["title"], "is my taste narrowing?")
        self.assertIn("by week", one["slots"][0]["blocks"][0]["text"])
        # An old file's feed pages: the new cards say the statistic isn't in the data yet; the rest draws.
        old = draw("lately/lifting/", name="old file")
        (si,) = blocks(old, "lifting.strength_index")
        self.assertEqual(si["wait"], "not in the data yet · appears once the pipeline publishes it")
        self.assertTrue(blocks(old, "lifting.body_weight_rate")[0]["value"])
        self.assertEqual(old["errors"], [])

    # data/lately.json unreadable (here: not JSON): the section, and each page's main, is
    # one line, "Lately is being updated.", and nothing else. There is no sample data.
    def test_unreadable_data_is_one_line(self) -> None:
        for page in ("index.html", "lately/watching/"):
            with self.subTest(page=page):
                facts = draw(page, body="not json")
                self.assertEqual(facts["updating"], "Lately is being updated.")
                self.assertEqual(facts["shown"], ["panel-empty lately-updating"])
        self.assertFalse((ROOT / "data/lately.sample.json").exists())

    # The main page's height budget at 1280px, with the live file and with an old one: the 21
    # track rows with side A as three employers, the panel heads as tracks 22 to 26, three bullets
    # on each of the six Athena rows and the months under the title on the thirteen cards of
    # sides B and C measure 9,167 and 8,181, with a little room over that.
    def test_main_page_height(self) -> None:
        self.assertLess(draw("index.html")["pageHeight"], 9398)
        self.assertLess(draw("index.html", name="old file")["pageHeight"], 8498)

    # The feed page's headline adds strength kept per pound lost once any lift's interval excludes zero.
    def test_strength_kept_joins_the_headline(self) -> None:
        self.assertEqual(
            draw("lately/lifting/")["headline"][-1], ["Bench: e1RM kept per lb lost", "2.39"]
        )
        self.assertFalse(
            any(
                "kept" in h[0]
                for h in draw("lately/lifting/", name="kept includes zero")["headline"]
            )
        )

    # Fantasy page, Why: the manager-score card is four bars with rank and of, and the composite;
    # the acquisition split and the draft table follow. The Yahoo credit appears only when
    # the file includes yahoo.
    def test_fantasy_cards(self) -> None:
        d = draw("lately/fantasy/")
        sec = next(s for s in d["sections"] if s["id"] == "manager-score")
        self.assertEqual(sec["group"], "why")
        bars, composite, pickups = sec["slots"]
        self.assertEqual(
            pickups["stat"], "fantasy.teams[].waiver_impact"
        )  # absorbed into this card
        (b,) = bars["blocks"]
        # Bars are percentiles; each label is the raw value and the rank; the composite heads the card.
        for bit in (
            "Draft",
            "+3.4 pts/wk · rank 9 of 32",
            "Lineup",
            "−2.1 pts/wk · rank 24 of 32",
            "Moves",
            "+1.6 pts/wk · rank 12 of 32",
            "Strength",
            ".58 all-play · rank 6 of 32",
            "Where do I rank among managers",
        ):
            self.assertIn(bit, b["text"])
        self.assertEqual((b["value"], b["interval"]), ("61st percentile", "95% 41–78"))
        # One how line per section, the composite's (HOW: in fantasy.md); the component rows have none.
        self.assertEqual(
            bars["hows"], ["how: " + ANALYSIS["fantasy"]["manager_score"]["composite"]["how"]]
        )
        self.assertEqual(composite["hows"], [])
        self.assertTrue(composite["hidden"])  # drawn inside the card instead
        split = blocks(d, "fantasy.teams[].acquisition_split")
        self.assertEqual(len(split), len(ANALYSIS["fantasy"]["teams"]))
        self.assertIn("draft", split[0]["text"])
        self.assertIn("league median", split[0]["text"])
        draft = blocks(d, "fantasy.teams[].draft")
        self.assertEqual(draft[0]["rows"], 15)
        self.assertEqual(
            (draft[0]["hiddenRows"], draft[0]["more"]), (5, [["show all 15", "false", True]])
        )
        self.assertEqual(draft[0]["cells"][0][:3], ["1", "7", "Player A1"])
        # The schedule replayed: one sentence from the distribution, never a bar chart.
        sw = blocks(d, "fantasy.teams[].schedule_what_if")[0]
        self.assertIn(
            "With any other team's schedule I'd be 3–2 once, 2–3 once, 1–4 eight times and 0–5 once; no schedule would have done better than my own.",
            sw["text"],
        )
        self.assertEqual(sw["charts"], 0)
        better = blocks(
            draw("lately/fantasy/", name="better schedules"), "fantasy.teams[].schedule_what_if"
        )[0]
        self.assertIn("; 3 of 11 schedules would have done better.", better["text"])
        # Another team shows its label when the file gives one, else "another team"; never a name.
        (q,) = blocks(d, "fantasy.quadrant")
        self.assertEqual(
            q["quadTrails"], 6
        )  # the page keeps the trails, dotted and faded, behind a control
        self.assertEqual((q["quadTrailsShown"], q["quadToggle"]), (0, "show trail"))
        self.assertEqual(q["quadTrailsOn"], 6)  # pressing the control shows every segment
        self.assertEqual(q["cells"][len(ANALYSIS["fantasy"]["teams"])][0], "another team")
        lq = blocks(draw("lately/fantasy/", name="labelled others"), "fantasy.quadrant")[0]
        self.assertEqual(lq["cells"][len(ANALYSIS["fantasy"]["teams"])][0], "Team C")
        self.assertIn("Team C · ", lq["quadTitles"][0])
        self.assertNotIn("Rival", lq["text"] + " ".join(lq["quadTitles"]))
        self.assertEqual(q["quadOthers"], len(ANALYSIS["fantasy"]["quadrant"]["values"]["others"]))
        # Trails: weeks 3 to 5 of the fixture's five, two segments a team, with the fading dots in between.
        self.assertEqual(q["quadTrails"], 6)
        self.assertIn("my trail, last 5 weeks", q["text"])
        self.assertEqual(
            sorted(q["quadLabels"]), sorted(t["name"] for t in ANALYSIS["fantasy"]["teams"])
        )
        self.assertEqual(
            d["attribution"],
            [
                {
                    "source": "yahoo",
                    "hidden": True,
                    "text": "Fantasy data provided by Yahoo Fantasy",
                    "link": ["https://sports.yahoo.com/fantasy/", "_blank", "noopener"],
                }
            ],
        )
        self.assertEqual(draw("lately/fantasy/", name="yahoo")["attribution"][0]["hidden"], False)
        # A waiting component is a row under the bars of the others, with a small-sample tag.
        waiting = next(
            s
            for s in draw("lately/fantasy/", name="waiting")["sections"]
            if s["id"] == "manager-score"
        )
        (wb,) = waiting["slots"][0]["blocks"]
        self.assertEqual(wb["status"], "ok")
        self.assertIn("Moves · n = 2 weeks · small sample, threshold 4", wb["tagRows"])
        self.assertIn("Draft", wb["text"])
        self.assertNotIn("+1.6", wb["text"])
        # Under 600px my teams are numbered markers with a key naming them; no label in the plot.
        narrow = next(p for p in draw("index.html", 390)["panels"] if p["id"] == "panel-fantasy")
        self.assertEqual(narrow["quadMine"], [])
        self.assertEqual(narrow["quadNums"], ["1", "2", "3"])

        def rec(t: dict) -> str:
            r = t["schedule_what_if"]["values"]["real"]
            return f"{r['wins']}–{r['losses']}"

        self.assertEqual(
            narrow["quadKey"],
            [f"{i + 1}{t['name']} · {rec(t)}" for i, t in enumerate(ANALYSIS["fantasy"]["teams"])],
        )
        wide = next(p for p in draw("index.html")["panels"] if p["id"] == "panel-fantasy")
        self.assertEqual(wide["quadNums"], [])
        self.assertEqual(wide["quadKey"], [])

    # Watching page: My rankings leads What's happening; completion and drops sit in Why with
    # the note that only finished titles are logged as a rule; the new cards draw.
    def test_watching_regrouped(self) -> None:
        d = draw("lately/watching/")
        groups = {g["id"]: g for g in d["groups"]}
        self.assertEqual(
            groups["whats-happening"]["sections"],
            ["my-rankings", "tiers", "recently", "keeping-up", "genres"],
        )
        self.assertEqual(
            groups["why"]["sections"],
            [
                "taste-profile",
                "whose-films",
                "crowd-agreement",
                "blockbuster",
                "sequels",
                "completion",
            ],
        )
        sec = next(s for s in d["sections"] if s["id"] == "completion")
        self.assertEqual(
            sec["notes"],
            [
                "Only finished titles are logged as a rule, so completion counts cover what I chose to record."
            ],
        )
        self.assertTrue(all(b["n"].startswith("n = ") for sl in sec["slots"] for b in sl["blocks"]))
        # The S-by-type and S-by-decade bars sit under the taste profile.
        taste = next(s for s in d["sections"] if s["id"] == "taste-profile")
        self.assertEqual(
            [sl["stat"] for sl in taste["slots"]], ["watching.taste_profile", "watching.s_tier"]
        )
        self.assertIn("Which decades earn an S most often?", taste["slots"][1]["blocks"][0]["text"])
        self.assertNotIn("Genres in S against B", taste["slots"][1]["blocks"][0]["text"])
        feeds = {f["block"]: f for f in d["feeds"]}
        self.assertFalse(feeds["watching.rankings"]["hidden"])
        self.assertIn("Films", feeds["watching.rankings"]["text"])
        (s,) = blocks(d, "watching.s_tier")
        self.assertEqual(s["value"], "12%")
        self.assertIn("Which type earns an S most often?", s["text"])
        self.assertEqual(
            len(blocks(d, "watching.community_gap_by_genre")), 1
        )  # inside the crowd card
        # The reading bar's segments are the contents list: one per section, in order, plus "built with".
        self.assertEqual(
            [s[0] for s in d["segs"]],
            ["#" + i for i in groups["whats-happening"]["sections"] + groups["why"]["sections"]]
            + ["#built-with"],
        )
        self.assertEqual(d["segs"][5][:3], ["#taste-profile", "taste", False])
        self.assertTrue(
            all(re.fullmatch(r"\d+:\d\d", s[3]) for s in d["segs"]), d["segs"]
        )  # every segment is timed once the page is drawn
        self.assertEqual([s["time"] for s in d["sections"]][0], "0:00 ·")
        self.assertTrue(re.fullmatch(r"\d+:\d\d / \d+:\d\d", d["clock"]), d["clock"])
        self.assertNotEqual(d["clock"], "0:00 / 0:00")
        self.assertEqual(d["playText"], "play")
        self.assertEqual(
            [o[:2] for o in d["other"]], [["tp-prev", "../fantasy/"], ["tp-next", "../listening/"]]
        )

    # The film cards on the watching page: the crowd plot, the tier bars and tables, the credits
    # in the footer; and their waiting, absent and not-available states.
    def test_film_cards(self) -> None:
        d = draw("lately/watching/")
        (cr,) = blocks(d, "watching.crowd_agreement")
        self.assertEqual(cr["value"], "0.41")
        self.assertEqual(
            cr["quadOthers"], len(ANALYSIS["watching"]["crowd_agreement"]["values"]["points"])
        )
        dis = ANALYSIS["watching"]["crowd_agreement"]["values"]["disagreements"]
        self.assertEqual(
            cr["quadLabels"], [p["title"] for p in dis["above"] + dis["below"]]
        )  # the three furthest above, then below
        self.assertTrue(
            all(re.search(r"\(\d{4}\) · [SABCD] · \d\.\d$", t) for t in cr["quadTitles"])
        )
        self.assertIn("Comedy", cr["text"])
        whose = next(s for s in d["sections"] if s["id"] == "whose-films")
        self.assertEqual(
            [sl["stat"] for sl in whose["slots"]],
            ["watching.by_director", "watching.by_studio", "watching.by_lead"],
        )
        self.assertIn(
            "Whose films earn the highest tiers, by lead actor?",
            whose["slots"][2]["blocks"][0]["text"],
        )
        (bb,) = blocks(d, "watching.blockbuster")
        self.assertEqual(bb["value"], "+0.12")
        self.assertIn("most popular quarter", bb["text"])
        (sq,) = blocks(d, "watching.sequels")
        self.assertEqual(sq["rows"], 5)
        # The crowd card absorbed the genre gaps, the tier correlations and the top-ten tables.
        crowd = next(s for s in d["sections"] if s["id"] == "crowd-agreement")
        self.assertEqual(
            [sl["stat"] for sl in crowd["slots"]],
            [
                "watching.crowd_agreement",
                "watching.community_gap_by_genre",
                "watching.tier_contrarian.*",
                "watching.contrarian.*",
            ],
        )
        self.assertEqual(
            [x["text"] for x in d["attributions"]],
            [
                "This product uses the TMDB API but is not endorsed or certified by TMDB. · Rotten Tomatoes scores from OMDb"
            ],
        )
        self.assertEqual(
            d["attributions"][0]["links"],
            [
                ["https://www.themoviedb.org/", "_blank", "noopener"],
                ["https://www.omdbapi.com/", "_blank", "noopener"],
            ],
        )
        # Waiting: every card shows its box; the absent critics card is "not available from source"; no credits.
        w = draw("lately/watching/", name="films waiting")
        for stat in (
            "watching.by_director",
            "watching.crowd_agreement",
            "watching.blockbuster",
            "watching.sequels",
        ):
            with self.subTest(stat=stat):
                (b,) = blocks(w, stat)
                self.assertEqual(b["wait"], "nothing to show yet")
        self.assertEqual(
            w["attributions"], []
        )  # the taste profile is ok there, but it is not a credited statistic
        # Retention names its first unit; entropy and nostalgia draw by week while months are few.
        lw = draw("lately/listening/", name="films waiting")
        (rt,) = blocks(lw, "listening.retention_new_artists")
        self.assertEqual(rt["wait"], "nothing to show yet: needs one month whose 90 days are up")
        self.assertIn(
            "How many artists was I really listening to, by week?",
            blocks(lw, "listening.entropy")[0]["text"],
        )
        self.assertIn(
            "How old was the music I played, by week?", blocks(lw, "listening.nostalgia")[0]["text"]
        )
        self.assertIn("by month", blocks(draw("lately/listening/"), "listening.entropy")[0]["text"])
        # Under 600px the disagreements are numbered markers with a key.
        narrow = blocks(draw("lately/watching/", 390), "watching.crowd_agreement")[0]
        self.assertEqual(narrow["quadLabels"], [])
        self.assertEqual(len(narrow["quadKey"]), 6)
        self.assertTrue(
            narrow["quadKey"][0].startswith(
                "1"
                + ANALYSIS["watching"]["crowd_agreement"]["values"]["disagreements"]["above"][0][
                    "title"
                ]
            )
        )
        # Tier scale: axes read D to S at 1 to 5, and a mean tier shows its letter.
        self.assertIn("4.0 (A)", whose["slots"][0]["blocks"][0]["text"] + bb["text"] + " 4.0 (A)")
        self.assertRegex(
            blocks(d, "watching.by_director")[0]["text"], r"\d\.\d \([SABCD]\) · \d+ films"
        )
        # An old file: the cards say the statistics are not in the data yet.
        old = draw("lately/watching/", name="old file")
        self.assertEqual(blocks(old, "watching.by_director")[0]["status"], "not in the data yet")
        self.assertEqual(old["attributions"], [])

    # Profile cards on the track pages: the taste profile with the crowd lines, both survival
    # cohorts, albums or songs, dig back or keep up; and their absent state in an old file.
    def test_profile_cards(self) -> None:
        d = draw("lately/watching/")
        (tp,) = blocks(d, "watching.taste_profile")
        self.assertEqual(tp["value"], "44%")
        self.assertIn("What do my tiers respond to?", tp["text"])
        self.assertIn("Above the crowd: ", tp["text"])
        l = draw("lately/listening/")
        (sv,) = blocks(l, "listening.artist_survival")
        self.assertEqual(sv["value"], "1.62×")
        self.assertIn(
            "Half of my catalog discoveries are still in rotation after 16 months, against 12 for new ones: new music fades faster.",
            sv["text"],
        )
        self.assertIn("Longest in rotation: ", sv["text"])
        (sv2,) = blocks(l, "listening.artist_survival_all")
        self.assertEqual(sv2["value"], "1.41×")
        self.assertEqual(
            sv2["title"], "Counting the artists from before the 2023 sync too"
        )  # a labelled second row in the same card
        self.assertEqual(
            next(s for s in l["sections"] if s["id"] == "artist-survival")["slots"][1]["stat"],
            "listening.artist_survival_all",
        )
        # The survival card's own source line, in mono: the Apple Music library export, not the page's Last.fm credit.
        surv = next(s for s in l["sections"] if s["id"] == "artist-survival")
        self.assertEqual(surv["source"], "apple music library")
        self.assertEqual(surv["sourceFont"], surv["slots"][0]["howFont"])
        self.assertEqual(
            [s["source"] for s in l["sections"] if s["source"]], ["apple music library"]
        )
        # Absorbed: the median release year under dig back or keep up, the top-five share under who lasts.
        self.assertEqual(
            [
                sl["stat"]
                for sl in next(s for s in l["sections"] if s["id"] == "discovery-direction")[
                    "slots"
                ]
            ],
            ["listening.discovery_direction", "listening.nostalgia"],
        )
        self.assertEqual(
            [sl["stat"] for sl in next(s for s in l["sections"] if s["id"] == "enduring")["slots"]],
            ["listening.enduring", "listening.concentration"],
        )
        rows = ANALYSIS["listening"]["album_listening"]["values"]["rows"]
        (al,) = blocks(l, "listening.album_listening")
        self.assertEqual(
            al["value"], f"{round(100 * len([r for r in rows if r['gini'] < 0.4]) / len(rows))}%"
        )
        self.assertIn("get played through", al["text"])
        self.assertEqual(al["rows"], len(rows))
        (dd,) = blocks(l, "listening.discovery_direction")
        self.assertEqual(dd["value"], "58%")
        self.assertIn("Was I digging back or keeping up, by the year I found them?", dd["text"])
        self.assertIn("2023 · 40 additions", dd["text"])
        self.assertIn("per five years of gap between release years", sv["text"])
        self.assertIn(
            "The export records no play before 2023-03-01 (its earliest last_played), so an end before that day is invisible.",
            sv["text"],
        )  # the how line's floor statement, quoted
        self.assertEqual(
            next(s for s in l["sections"] if s["id"] == "entropy")["title"],
            "is my taste narrowing?",
        )
        old = draw("lately/listening/", name="old file")
        for stat in (
            "listening.artist_survival",
            "listening.artist_survival_all",
            "listening.album_listening",
            "listening.discovery_direction",
        ):
            self.assertEqual(blocks(old, stat)[0]["status"], "not in the data yet", stat)
        self.assertEqual(
            blocks(draw("lately/watching/", name="old file"), "watching.taste_profile")[0][
                "status"
            ],
            "not in the data yet",
        )

    # Every feed block that left the main page draws on its feed page.
    def test_feed_blocks(self) -> None:
        want = {
            "fantasy": ["fantasy.lineup", "fantasy.carry"],
            "watching": ["watching.rankings", "watching.tiers", "watching.recent"],
            "listening": ["listening.recent"],
            "eating": ["eating.recent"],
            "lifting": ["lifting.lifts", "lifting.training", "lifting.body_weight"],
        }
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
        self.assertIn(
            "How do my hours fall across the week, in total over the last 8 weeks?", tb["text"]
        )
        self.assertIn("totals over the window", tb["text"])
        (tbw,) = blocks(draw("lately/lifting/", name="per week"), "cross.time_budget")
        self.assertIn(
            "How do my hours fall across the week, per week over the last 8 weeks?", tbw["text"]
        )
        self.assertIn("mean hours per week", tbw["text"])
        lifting = {f["block"]: f for f in draw("lately/lifting/")["feeds"]}
        self.assertEqual(lifting["lifting.training"]["lists"], ["Recent personal records"])
        self.assertIn("Where is my body weight heading?", lifting["lifting.body_weight"]["text"])
        # The strength-index card and its two indexed lines, with the dashed 100 line in the legend.
        (si,) = blocks(draw("lately/lifting/"), "lifting.strength_index")
        self.assertIn("100 = cut start", si["text"])
        self.assertIn(
            "body weight · 20 weeks with a weigh-in", si["text"]
        )  # every fixture week has one

    # No other managers' names; no Beli dates (cities are fine; new cuisines are counted by
    # month, which ties no date to a place).
    def test_nothing_the_page_does_not_know(self) -> None:
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
        self.assertNotRegex(
            b["text"],
            r"\d{4}-\d{2}-\d{2}|\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b",
        )

    # Every statistic the fixture holds is drawn: no slot falls back to "not in the data yet"
    # (which only an older file should produce) and no spec is missing from the script.
    def test_every_statistic_has_a_renderer(self) -> None:
        for feed in FEEDS:
            with self.subTest(feed=feed):
                d = draw(f"lately/{feed}/")
                for s in d["sections"]:
                    for sl in s["slots"]:
                        for b in sl["blocks"]:
                            self.assertNotEqual(
                                b["status"], "not in the data yet", (s["id"], sl["stat"])
                            )
                            self.assertNotIn("doesn't draw it yet", b["text"], sl["stat"])
                self.assertIsNone(d["waiting"])  # the "more statistics" line is gone
        lifting = draw("lately/lifting/")
        self.assertTrue(blocks(lifting, "lifting.relative_strength.*"))
        self.assertTrue(
            blocks(lifting, "lifting.strength_kept.*")
        )  # absorbed into "Am I stronger for my size?"
        self.assertTrue(blocks(lifting, "cross.lifting_soundtrack"))
        self.assertTrue(blocks(lifting, "cross.rhythm.workouts"))  # absorbed into Training
        self.assertEqual(
            [
                sl["stat"]
                for sl in next(s for s in lifting["sections"] if s["id"] == "training")["slots"]
            ],
            ["cross.rhythm.workouts"],
        )
        # The strength index keeps the per-lift change list inside its card, draws the split lines, and its how line quotes the rule.
        (sidx,) = blocks(lifting, "lifting.strength_index")
        self.assertIn("Which lifts have held up since the cut started?", sidx["text"])
        self.assertIn("legs", sidx["text"])
        self.assertIn(
            "at least 12 sessions in the last 26 weeks",
            slot(lifting, "lifting.strength_index")["hows"][0],
        )
        # Main lifts: the tracked set grouped by split, with sessions; the tracking rule under them.
        main = {f["block"]: f for f in lifting["feeds"]}["lifting.lifts"]
        self.assertIn("How are my tracked lifts moving?", main["text"])
        self.assertIn("Chest and back", main["text"])
        self.assertIn("at least 12 sessions in the last 26 weeks", main["text"])
        # Each tile shows the rule's session count (values.tracked[].sessions, 14 for the first lift), not the
        # lift's working-set count (11 in the sample).
        self.assertIn("14 sessions", main["text"])
        self.assertNotIn("11 sessions", main["text"])

    # No sideways scroll and nothing undrawn, on every page at phone and desktop widths.
    def test_widths(self) -> None:
        for feed in FEEDS + ("index",):
            for w in WIDTHS:
                with self.subTest(feed=feed, width=w):
                    d = draw("index.html" if feed == "index" else f"lately/{feed}/", w)
                    self.assertLessEqual(d["scrollX"], 0)
                    # No "view as table" control; the tables stay in the DOM, visually hidden, not display: none.
                    self.assertEqual(d["toggles"], 0)
                    self.assertNotIn("view as table", d["bodyText"])
                    self.assertTrue(d["srTables"], feed)
                    self.assertTrue(
                        all(
                            shown and pos == "absolute" and rows > 0
                            for shown, pos, rows in d["srTables"]
                        ),
                        d["srTables"],
                    )
                    self.assertNotIn("Couldn't draw", d["bodyText"])
                    self.assertNotIn("doesn't draw it yet", d["bodyText"])
                    self.assertEqual(d["errors"], [])


if __name__ == "__main__":
    unittest.main()
