"""Tests for the Lately data shape (data/lately.schema.json) and how js/lately.js draws the
feed blocks: my rankings (lately/watching/) and the lift tiles (lately/lifting/), both under
"What's happening" since the main page became analysis-first.

The schema checks need nothing extra. The drawing checks load the pages in headless
Chrome through tools/node_modules (cd tools && npm install) and are skipped without them.
Run: python3 -m unittest discover tests
"""

import copy
import functools
import http.server
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "data/lately.schema.json").read_text(encoding="utf-8"))
SAMPLE = json.loads((ROOT / "tests/fixtures/lately.sample.json").read_text(encoding="utf-8"))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
WIDTHS = (360, 390, 1280)


def can_draw():
    return (shutil.which("node") and Path(CHROME).exists()
            and (ROOT / "tools/node_modules/playwright-core").is_dir())


def fixture():
    """The committed sample with twelve films, seven shows, five anime; lift 1 with a best
    set, lift 2 with two sessions."""
    d = copy.deepcopy(SAMPLE)
    d.pop("sample", None)
    r = d["watching"]["rankings"]
    r["films"] = [{"title": f"Film {i}", "year": 2000 + i, "url": f"https://simkl.com/movies/{i}"} for i in range(1, 13)]
    r["shows"] = [{"title": f"Show {i}", "year": None, "url": f"https://simkl.com/tv/{i}"} for i in range(1, 8)]
    lifts = d["lifting"]["main_lifts"]
    lifts[0]["best"]["best_set"] = {"weight_lb": 185, "reps": 4, "date": "2026-09-26"}
    lifts[1]["sessions"] = 2
    lifts[1]["history"] = lifts[1]["history"][-2:]
    return d


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@functools.lru_cache(maxsize=None)
def draw(width):
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(fixture(), f)
        r = subprocess.run(["node", str(ROOT / "tests/lately_render.js"), f"http://127.0.0.1:{server.server_port}", f.name, str(width)],
                             capture_output=True, text=True, timeout=200)
        if r.returncode:
            raise AssertionError("render helper failed:\n" + r.stderr[-2000:])
        return json.loads(r.stdout)
    finally:
        server.shutdown()
        server.server_close()
        os.unlink(f.name)


HANDOFF = Path.home() / "Personal/site-handoff/lately-analysis"
# The statistics added on 2026-10-17, as (definition, property); every one is optional.
ADDED_2026_10_17 = [("analysis_fantasy", "quadrant"), ("analysis_fantasy", "manager_score"),
                    ("analysis_fantasy_team", "acquisition_split"), ("analysis_fantasy_team", "draft"),
                    ("analysis_watching", "s_tier"), ("analysis_watching", "tier_model"), ("analysis_watching", "taste_drift"),
                    ("analysis_watching", "community_gap_by_genre"), ("analysis_watching", "pace_vs_tier"),
                    ("analysis_lifting", "strength_index"), ("analysis_lifting", "retention"), ("analysis_lifting", "volume_lag"),
                    ("analysis_lifting", "consistency"),
                    ("analysis_listening", "entropy"), ("analysis_listening", "nostalgia"), ("analysis_listening", "enduring"),
                    ("analysis_listening", "retention_new_artists"),
                    ("analysis_eating", "landing"), ("analysis_eating", "rerank_drift"),
                    ("analysis_cross", "time_budget"), ("analysis", "meta")]


class Schema(unittest.TestCase):
    def test_ranked_list_holds_ten(self):
        ranked = SCHEMA["$defs"]["ranked_list"]
        self.assertEqual(ranked["maxItems"], 10)
        self.assertNotIn("minItems", ranked)  # unchanged: an empty list is still allowed
        self.assertIn("2026-10-13", SCHEMA["properties"]["schema_version"]["description"])

    # 2026-10-17: the analysis-first statistics, all optional so older files still validate;
    # top_ten_churn is gone; a sample for each is in the handoff folder for the pipeline.
    def test_analysis_first_statistics(self):
        defs = SCHEMA["$defs"]
        for d, prop in ADDED_2026_10_17:
            with self.subTest(prop=prop):
                self.assertIn(prop, defs[d]["properties"])
                self.assertNotIn(prop, defs[d].get("required", []))
        self.assertNotIn("top_ten_churn", defs["analysis_eating"]["properties"])
        self.assertNotIn("top_ten_churn", defs["analysis_eating"]["required"])
        self.assertIn("2026-10-17", SCHEMA["properties"]["schema_version"]["description"])
        self.assertIn("top_ten_churn is removed", SCHEMA["properties"]["schema_version"]["description"])
        # The quadrant's other teams carry no names: only these keys are allowed.
        others = defs["analysis_stat_quadrant"]["properties"]["values"]["anyOf"][0]["properties"]["others"]["items"]
        self.assertEqual(sorted(others["properties"]), ["all_play", "league_key", "luck", "record"])
        self.assertFalse(others["additionalProperties"])
        self.assertEqual(defs["analysis_fantasy"]["properties"]["quadrant"]["$ref"], "#/$defs/analysis_stat_quadrant")
        # Every fixed-shape variant keeps the statistic's fields.
        for name, d in defs.items():
            if name.startswith("analysis_stat"):
                self.assertTrue({"status", "n", "min_n", "as_of", "how", "value", "values", "interval"} <= set(d["properties"]), name)
                self.assertEqual(d["required"], ["status", "n", "min_n", "as_of", "how"], name)
        self.assertEqual(sorted(defs["analysis_fantasy"]["properties"]["manager_score"]["properties"]["components"]["properties"]),
                         ["draft", "lineup", "moves", "strength"])
        self.assertEqual(defs["analysis"]["properties"]["meta"]["properties"]["sources_included"]["items"], {"type": "string"})

    # 2026-10-18, policy: small_sample on every statistic shape, first_unit in its values, no available_from;
    # eating.safe_bet beside the landing's current-ranking version.
    def test_sample_policy_fields(self):
        defs = SCHEMA["$defs"]
        for name, d in defs.items():
            if name.startswith("analysis_stat"):
                self.assertEqual(d["properties"]["small_sample"]["type"], "boolean", name)
                self.assertNotIn("small_sample", d["required"], name)
                v = d["properties"]["values"]
                if name == "analysis_stat":
                    self.assertIn("first_unit", v["description"])
                else:
                    # Fixed shapes validate at zero units: the full shape, or just first_unit.
                    full, zero = v["anyOf"]
                    self.assertTrue(full.get("required"), name)
                    self.assertNotIn("first_unit", full["properties"], name)
                    self.assertEqual((zero["required"], sorted(zero["properties"]), zero["additionalProperties"]), (["first_unit"], ["first_unit"], False), name)
        self.assertNotIn("available_from", json.dumps(defs).replace("(available_from is removed.)", ""))
        self.assertIn("safe_bet", defs["analysis_eating"]["properties"])
        self.assertNotIn("safe_bet", defs["analysis_eating"]["required"])
        self.assertIn("median_percentile", defs["analysis_eating"]["properties"]["landing"]["description"])
        self.assertIn("small_sample", SCHEMA["properties"]["schema_version"]["description"])

    # The handoff fragment (what the pipeline syncs from) must not drift from the site's copy.
    def test_handoff_fragment_matches(self):
        frag_path = HANDOFF / "analysis.schema.json"
        if not frag_path.is_file():
            self.skipTest("handoff folder not present")
        frag = json.loads(frag_path.read_text(encoding="utf-8"))
        for name, d in frag["$defs"].items():
            with self.subTest(definition=name):
                self.assertEqual(d, SCHEMA["$defs"][name])
        for name in SCHEMA["$defs"]:
            if name.startswith("analysis"):
                self.assertIn(name, frag["$defs"])
        sample = json.loads((HANDOFF / "analysis.sample.json").read_text(encoding="utf-8"))["analysis"]
        for d, prop in ADDED_2026_10_17:
            with self.subTest(sample=prop):
                holders = [sample] if d == "analysis" else [sample["fantasy"]] if d == "analysis_fantasy" else \
                    sample["fantasy"]["teams"] if d == "analysis_fantasy_team" else [sample[d[len("analysis_"):]]]
                for holder in holders:
                    self.assertIn(prop, holder)
        self.assertNotIn("top_ten_churn", sample["eating"])
        others = sample["fantasy"]["quadrant"]["values"]["others"]
        self.assertTrue(others)
        self.assertTrue(all(set(o) == {"all_play", "league_key", "luck", "record"} for o in others))

    def test_best_set_is_optional(self):
        best = SCHEMA["$defs"]["lifting"]["properties"]["main_lifts"]["items"]["properties"]["best"]
        self.assertEqual(best["required"], ["date", "e1rm"])
        bs = best["properties"]["best_set"]
        self.assertEqual(sorted(bs["required"]), ["date", "reps", "weight_lb"])
        self.assertEqual(bs["properties"]["weight_lb"]["type"], "number")
        self.assertEqual(bs["properties"]["reps"]["type"], "integer")
        self.assertEqual(bs["properties"]["date"], {"$ref": "#/$defs/date"})
        self.assertFalse(bs["additionalProperties"])


@unittest.skipUnless(can_draw(), "needs node, Chrome and tools/node_modules")
class Drawing(unittest.TestCase):
    # Rankings, under "What's happening" on lately/watching/: one tab group (Films first), the
    # selected type's list with ten shown and "show all N" for the rest, which opens in place;
    # keyboard works; same on phones.
    def test_rankings_tabs_then_all(self):
        for w in WIDTHS:
            with self.subTest(width=w):
                d = draw(w)
                self.assertEqual(d["before"]["rankingsSection"], ["whats-happening", "my-rankings"])
                self.assertEqual(d["before"]["tabs"], [["Films", "true"], ["Shows", "false"], ["Anime", "false"]])
                films, shows, anime = d["before"]["rankings"]
                self.assertEqual(films["visible"], [str(i) for i in range(1, 11)])
                self.assertEqual(films["button"], {"text": "show all 12", "expanded": "false", "controls": True})
                self.assertEqual(shows["visible"], [])  # the other types' panels are hidden until their tab is pressed
                self.assertIsNone(shows["button"])  # ten or fewer: no toggle
                self.assertIsNone(anime["button"])
                opened = d["opened"]["rankings"][0]
                self.assertEqual(opened["visible"], [str(i) for i in range(1, 13)])
                self.assertEqual(opened["button"], {"text": "show fewer", "expanded": "true", "controls": True})
                self.assertIn("ranking-more", d["focused"])  # focus stays on the button
                self.assertEqual(d["closed"]["rankings"][0], films)
                self.assertLessEqual(max(d["before"]["scrollX"], d["opened"]["scrollX"], d["before"]["liftsScrollX"]), 0)

    # Lift tiles (lately/lifting/): best set under the best e1RM when present; under three sessions, a count, not a chart.
    def test_lift_best_set_and_few_sessions(self):
        for w in WIDTHS:
            with self.subTest(width=w):
                first, second, third = draw(w)["before"]["lifts"][:3]
                self.assertEqual(first["bestSet"], "best set 185 × 4 · 26 Sep")
                self.assertTrue(first["setUnderBest"])
                self.assertIsNone(third["bestSet"])
                self.assertEqual(second["few"], "2 sessions so far")
                self.assertFalse(second["chart"] or second["table"])
                self.assertTrue(first["chart"] and first["table"] and first["few"] is None)  # the chart's numbers as a hidden table
                self.assertFalse(first["toggle"])  # no "view as table" control anywhere

    # The lifts are grouped by split (chest and back, shoulders and arms, legs); no hand-entered best is shown.
    def test_lifts_grouped_by_split(self):
        d = draw(1280)["before"]
        self.assertEqual(d["splits"], ["Chest and back", "Shoulders and arms", "Legs"])
        self.assertEqual(d["splitCounts"], [1, 1, 2])
        self.assertIsNone(d["lifts"][0]["handTag"])
        self.assertIn("sessions", d["lifts"][0]["figures"])


if __name__ == "__main__":
    unittest.main()
