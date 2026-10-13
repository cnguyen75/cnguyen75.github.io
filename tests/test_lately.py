"""Tests for the Lately data shape (data/lately.schema.json) and how js/lately.js draws it.

The schema checks need nothing extra. The drawing checks load index.html in headless
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
SAMPLE = json.loads((ROOT / "data/lately.sample.json").read_text(encoding="utf-8"))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
WIDTHS = (360, 390, 1280)


def can_draw():
    return (shutil.which("node") and Path(CHROME).exists()
            and (ROOT / "tools/node_modules/playwright-core").is_dir())


def fixture():
    """The committed sample with ten films, seven shows, five anime; lift 1 with a best
    set, lift 2 with two sessions, lift 4 with a best set entered by hand."""
    d = copy.deepcopy(SAMPLE)
    d.pop("sample", None)
    r = d["watching"]["rankings"]
    r["films"] = [{"title": f"Film {i}", "year": 2000 + i, "url": f"https://simkl.com/movies/{i}"} for i in range(1, 11)]
    r["shows"] = [{"title": f"Show {i}", "year": None, "url": f"https://simkl.com/tv/{i}"} for i in range(1, 8)]
    lifts = d["lifting"]["main_lifts"]
    lifts[0]["best"]["best_set"] = {"weight_lb": 185, "reps": 4, "date": "2026-09-26"}
    lifts[1]["sessions"] = 2
    lifts[1]["history"] = lifts[1]["history"][-2:]
    lifts[3]["best"]["best_set"] = {"weight_lb": 225, "reps": 1, "date": "2026-06-06", "source": "manual"}
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
        out = subprocess.run(["node", str(ROOT / "tests/lately_render.js"), f"http://127.0.0.1:{server.server_port}", f.name, str(width)],
                             capture_output=True, text=True, timeout=60, check=True).stdout
        return json.loads(out)
    finally:
        server.shutdown()
        server.server_close()
        os.unlink(f.name)


class Schema(unittest.TestCase):
    def test_ranked_list_holds_ten(self):
        ranked = SCHEMA["$defs"]["ranked_list"]
        self.assertEqual(ranked["maxItems"], 10)
        self.assertNotIn("minItems", ranked)  # unchanged: an empty list is still allowed
        self.assertIn("2026-10-13", SCHEMA["properties"]["schema_version"]["description"])

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
    # Rankings: five shown, "show all ten" opens the rest in place; keyboard works; same on phones.
    def test_rankings_show_five_then_all(self):
        for w in WIDTHS:
            with self.subTest(width=w):
                d = draw(w)
                films, shows, anime = d["before"]["rankings"]
                self.assertEqual(films["visible"], [str(i) for i in range(1, 6)])
                self.assertEqual(films["button"], {"text": "show all ten", "expanded": "false", "controls": True})
                self.assertEqual(shows["button"]["text"], "show all seven")
                self.assertIsNone(anime["button"])  # five or fewer: no toggle
                opened = d["opened"]["rankings"][0]
                self.assertEqual(opened["visible"], [str(i) for i in range(1, 11)])
                self.assertEqual(opened["button"], {"text": "show top five", "expanded": "true", "controls": True})
                self.assertIn("ranking-more", d["focused"])  # focus stays on the button
                self.assertEqual(d["closed"]["rankings"][0], films)
                self.assertEqual(d["before"]["rankings"][1]["visible"], [str(i) for i in range(1, 6)])
                self.assertLessEqual(max(d["before"]["scrollX"], d["opened"]["scrollX"]), 0)

    # Lift tiles: best set under the best e1RM when present; under three sessions, a count, not a chart.
    def test_lift_best_set_and_few_sessions(self):
        for w in WIDTHS:
            with self.subTest(width=w):
                first, second, third = draw(w)["before"]["lifts"][:3]
                self.assertEqual(first["bestSet"], "best set 185 × 4 · 26 Sep")
                self.assertTrue(first["setUnderBest"])
                self.assertIsNone(third["bestSet"])
                self.assertEqual(second["few"], "2 sessions so far")
                self.assertFalse(second["chart"] or second["toggle"])
                self.assertTrue(first["chart"] and first["few"] is None)

    # A best set entered by hand carries a "logged by hand" tag after the best-set line; API sets never do.
    def test_manual_best_set_is_tagged(self):
        for w in WIDTHS:
            with self.subTest(width=w):
                lifts = draw(w)["before"]["lifts"]
                self.assertEqual(lifts[3]["bestSet"], "best set 225 × 1 · 6 Jun logged by hand")
                self.assertEqual(lifts[3]["handTag"], "logged by hand")
                self.assertIsNone(lifts[0]["handTag"])


if __name__ == "__main__":
    unittest.main()
