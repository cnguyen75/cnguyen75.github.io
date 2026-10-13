"""Tests for build.py's progress register. Run: python3 -m unittest discover tests"""

import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402

FRONT = {
    "track": "04", "slug": "demo-page", "title": "A study", "register": "progress", "ready": "false",
    "status_label": "manuscript in preparation", "with": "With Dr. Someone (Somewhere)",
    "link": "pre-registration | https://osf.io/example", "as_of": "2026-10-13",
}
SECTIONS = {
    "question": "What is the question?",
    "approach": "STEPS:\n1. First | Do the first thing.\n2. Second | Do the second.\n\nSTATS:\n3 | cohorts | one primary",
    "where it stands": "Running.",
    "results": "Something shareable.",
    "what's next": "Finish.",
    "log": "2026-08-17 | First commit.\n2026-05 | A month-only entry.",
    "my role": "All of it.",
}
TRACKLIST = [("04", "A study", "side b. research", "research")]


def page_text(front=None, sections=None, order=None, drop=()):
    f = dict(FRONT, **(front or {}))
    s = dict(SECTIONS, **(sections or {}))
    names = [n for n in (order or build.PROGRESS_SECTIONS) if n not in drop]
    head = "\n".join(f"{k}: {v}" for k, v in f.items() if v is not None)
    return f"---\n{head}\n---\n\n" + "\n\n".join(f"## {n}\n\n{s[n]}" for n in names) + "\n"


class Progress(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def read(self, **kw):
        path = self.dir / "04-demo-page.md"
        path.write_text(page_text(**kw), encoding="utf-8")
        return build.read_page(path)

    def render(self, **kw):
        meta = self.read(**kw)
        doc, _ = build.render(meta, list(TRACKLIST), {"04": meta}, True, len(TRACKLIST))
        return doc

    # Sections, in order: question, approach, where it stands, results (optional),
    # what's next, log, my role.
    def test_sections_must_come_in_order(self):
        self.render()  # the full set, in order, builds
        swapped = list(build.PROGRESS_SECTIONS)
        swapped[2], swapped[3] = swapped[3], swapped[2]
        with self.assertRaisesRegex(build.ContentError, "in order"):
            self.read(order=swapped)
        with self.assertRaisesRegex(build.ContentError, "in order"):
            self.read(drop=("my role",))  # a required section is missing

    # "where it stands" carries the as_of stamp next to its heading.
    def test_where_it_stands_shows_as_of(self):
        doc = self.render()
        label = re.search(r'<h2 class="tp-section-label" id="where-it-stands-h">(.*?)</h2>', doc).group(1)
        self.assertIn('as of <time datetime="2026-10-13">13 Oct 2026</time>', label)
        with self.assertRaisesRegex(build.ContentError, "as_of"):
            self.read(front={"as_of": "13 October 2026"})

    # ## results is optional; when absent there is no empty block and no placeholder.
    def test_results_omitted_when_absent(self):
        self.assertIn('id="results"', self.render())
        doc = self.render(drop=("results",))
        self.assertNotIn('id="results"', doc)
        self.assertNotIn(">results<", doc)
        self.assertNotIn("results", re.sub(r"<head>.*?</head>", "", doc, flags=re.S).lower())

    # ## log: "YYYY-MM-DD | text" or "YYYY-MM | text", a dated list in file order; nothing else.
    def test_log_lines(self):
        doc = self.render()
        items = re.findall(r'<time class="tp-log-date" datetime="([^"]+)">([^<]+)</time><span class="tp-log-text">([^<]+)</span>', doc)
        self.assertEqual(items, [("2026-08-17", "17 Aug 2026", "First commit."), ("2026-05", "May 2026", "A month-only entry.")])
        for bad in ("17 Aug 2026 | wrong date format", "2026-08-17 - no bar", "Just a sentence.",
                    "2026-13 | no such month", "2026-02-30 | no such day", "- 2026-08-17 | a list item"):
            with self.subTest(bad=bad), self.assertRaisesRegex(build.ContentError, "log"):
                self.render(sections={"log": "2026-08-17 | Fine.\n" + bad})

    # Front matter: with (under the title), link "label | url" (optional), status_label, as_of.
    def test_front_matter(self):
        doc = self.render()
        hero = re.search(r'<section class="tp-hero".*?</section>', doc, re.S).group(0)
        self.assertRegex(hero, r'</h1></div>\n<p class="tp-with">With Dr\. Someone \(Somewhere\)</p>\n'
                               r'<p class="tp-link"><a href="https://osf\.io/example">pre-registration →</a></p>')
        self.assertIn('<span class="tp-badge">status: manuscript in preparation</span>', doc)
        self.assertNotIn("tp-link", self.render(front={"link": None}))
        # one_line, when given, is the page description; the hero still shows the with: line.
        doc = self.render(front={"one_line": "A one-line summary."})
        self.assertIn('<meta name="description" content="A one-line summary.">', doc)
        self.assertNotIn('class="tp-lede"', doc)
        self.assertIn('<meta name="description" content="What is the question?">', self.render())
        with self.assertRaisesRegex(build.ContentError, "link"):
            self.read(front={"link": "https://osf.io/example"})
        for key in ("with", "as_of"):
            with self.subTest(key=key), self.assertRaisesRegex(build.ContentError, f"missing {key}"):
                self.read(front={key: None})

    # A line beginning HELD: is a flagged note in drafts and fails the build when ready: true.
    def test_held(self):
        held = {"where it stands": "Running.\n\nHELD: a number waiting on sign-off."}
        doc = self.render(sections=held)
        self.assertRegex(doc, r'<p data-secs="[\d.]+" class="tp-held"><span class="tp-held-note"><span class="tp-held-flag">held: '
                              r"needs a collaborator's agreement</span> a number waiting on sign-off\.</span></p>")
        with self.assertRaisesRegex(build.ContentError, "HELD"):
            self.render(sections=held, front={"ready": "true"})
        self.render(front={"ready": "true"})  # the same page without the note builds as ready
        # Held text that starts mid-paragraph is flagged from HELD: on, and blocks ready too.
        inline_held = {"where it stands": "Shareable part. HELD: the rest waits."}
        self.assertRegex(self.render(sections=inline_held),
                         r'<p data-secs="[\d.]+">Shareable part\. <span class="tp-held-note"><span class="tp-held-flag">')
        with self.assertRaisesRegex(build.ContentError, "HELD"):
            self.render(sections=inline_held, front={"ready": "true"})

    # Everything else works as in the other registers: components, the reading bar,
    # the play control and reading-time stamps.
    def test_shared_features(self):
        doc = self.render()
        self.assertRegex(doc, r'<div data-secs="[\d.]+" class="tp-steps">')
        self.assertRegex(doc, r'<div data-secs="[\d.]+" class="tp-stats">')
        self.assertEqual(len(re.findall(r'<a class="tp-seg" href="#', doc)), len(build.PROGRESS_SECTIONS))
        self.assertIn('<button type="button" class="tp-play"', doc)
        self.assertIn('<span class="tp-clock">', doc)
        self.assertRegex(doc, r'<span class="tp-seg-time">0:00</span><span class="tp-seg-name">question</span>')
        self.assertRegex(doc, r'id="approach-h">\d+:\d\d · approach</h2>')


if __name__ == "__main__":
    unittest.main()
