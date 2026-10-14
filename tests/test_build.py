"""Tests for build.py's progress register. Run: python3 -m unittest discover tests"""

import json
import re
import shutil
import subprocess
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
                               r'<p class="tp-link"><a href="https://osf\.io/example" target="_blank" rel="noopener">pre-registration →</a></p>')
        self.assertIn('<span class="tp-badge">status: manuscript in preparation</span>', doc)
        self.assertNotIn("tp-link", self.render(front={"link": None}))
        # one_line, when given, is the page description and the hero's first line, above with:.
        doc = self.render(front={"one_line": "A one-line summary."})
        self.assertIn('<meta name="description" content="A one-line summary.">', doc)
        self.assertIn('</h1></div>\n<p class="tp-lede">A one-line summary.</p>\n<p class="tp-with">', doc)
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

    # [text](track:NN) links another track's page under the previous/next rule: a draft
    # links any page built with it; a ready page links only ready pages; otherwise text.
    def test_track_links(self):
        line = "See [the other page](track:15) for more."
        other = {"slug": "other-page", "ready": False}
        def render_with(ready_self, pages):
            meta = self.read(sections={"what's next": line}, front={"ready": "true" if ready_self else "false"})
            tl = TRACKLIST + [("15", "Other", "side b. research", "research")]
            doc, _ = build.render(meta, tl, dict(pages, **{"04": meta}), True, len(tl))
            return doc
        self.assertIn('<a href="../other-page/">the other page</a>', render_with(False, {"15": other}))
        self.assertIn("See the other page for more.", render_with(True, {"15": other}))
        self.assertIn('<a href="../other-page/">the other page</a>', render_with(True, {"15": dict(other, ready=True)}))
        self.assertIn("See the other page for more.", render_with(False, {}))  # not built: text only

    # FIGURE: ALT: gives the text alternative for an SVG without a <title>; OVERLAY: inlines
    # the figure and draws a second SVG's contents over it, leaving the figure file as it is.
    def test_figure_alt_and_overlay(self):
        assets = self.dir / "demo-page" / "f"
        assets.mkdir(parents=True)
        (assets / "plot.svg").write_text('<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"\n  "x.dtd">\n'
                                         '<svg width="10pt" height="5pt" viewBox="0 0 10 5"><g id="old">old label</g></svg>')
        (assets / "fix.svg").write_text('<svg viewBox="0 0 10 5"><style>#old { display: none; }</style><text>new label</text></svg>')
        fig = "FIGURE: demo-page/f/plot.svg\nALT: A plot.\nCAPTION: fig. 1 · a plot."
        doc = self.render(sections={"results": fig})
        self.assertIn('<img src="f/plot.svg" alt="A plot." width="10" height="5"', doc)
        with self.assertRaisesRegex(build.ContentError, "ALT"):
            self.render(sections={"results": "FIGURE: demo-page/f/plot.svg\nCAPTION: fig. 1 · a plot."})
        doc = self.render(sections={"results": fig.replace("CAPTION", "OVERLAY: demo-page/f/fix.svg\nCAPTION")})
        self.assertRegex(doc, r'<svg class="tp-chart-svg" role="img" aria-label="A plot\." focusable="false" viewBox="0 0 10 5">'
                              r'<g id="old">old label</g><style>#old \{ display: none; \}</style><text>new label</text></svg>')
        self.assertNotIn("<img", doc.split('id="results"')[1])
        self.assertIn("old label", (assets / "plot.svg").read_text())  # the file itself is untouched

    # DEMO: takes one or more data files; the first is data-src, the rest data-more.
    def test_demo_files(self):
        assets = self.dir / "demo-page"
        assets.mkdir()
        for f in ("a.json", "b.json", "demo.js"):
            (assets / f).write_text("{}")
        doc = self.render(sections={"results": "DEMO: demo-page/a.json demo-page/b.json\nATTRIBUTION: Data from somewhere."})
        self.assertIn('<div class="tp-demo" data-src="a.json" data-more="b.json"', doc)
        self.assertIn('<p class="tp-attribution">Data from somewhere.</p>', doc)
        self.assertIn('data-src="a.json" aria-live', self.render(sections={"results": "DEMO: demo-page/a.json"}))

    # LINKS: rows 'label | https://...' become a short list of links.
    def test_links(self):
        doc = self.render(sections={"my role": "All of it.\n\nLINKS:\nCode | https://example.com/code\nThe record | https://example.com/r"})
        self.assertRegex(doc, r'<ul data-secs="[\d.]+" class="tp-links"><li><a href="https://example\.com/code" target="_blank" rel="noopener">Code →</a></li>'
                              r'<li><a href="https://example\.com/r" target="_blank" rel="noopener">The record →</a></li></ul>')
        for bad in ("Code | http://example.com", "https://example.com", " | https://example.com"):
            with self.subTest(bad=bad), self.assertRaisesRegex(build.ContentError, "LINKS"):
                self.render(sections={"my role": "LINKS:\n" + bad})

    # Main-page rows: a row whose page is built is one link (number, title, description,
    # status); others stay plain <div>s with no label. Idempotent; an external-link row
    # can't be linked to a page.
    def test_main_page_rows(self):
        index = ('<div class="track track--wrap">\n<span class="track-no">04</span>\n<div class="track-body">'
                 '<h3 class="track-title">A study</h3><span class="track-desc">About it.</span></div>\n'
                 '<span class="track-meta track-meta--status">in progress</span>\n</div>\n'
                 '<div class="track track--wrap">\n<span class="track-no">05</span>\n<div class="track-body">'
                 '<h3 class="track-title">Another</h3></div>\n</div>\n')
        linked = build.link_rows(index, {"04": "demo-page"})
        self.assertIn('<a class="track track--wrap" href="tracks/demo-page/" data-page="demo-page">\n<span class="track-no">04</span>', linked)
        self.assertIn('<span class="track-meta track-meta--status">in progress</span>\n</a>', linked)
        self.assertEqual(linked.count("<a "), 1)  # one anchor for the whole row; 05 stays plain
        self.assertNotIn("→", linked)
        self.assertEqual(build.link_rows(linked, {"04": "demo-page"}), linked)
        self.assertEqual(build.link_rows(linked, {}), index)
        # A row's secondary external link shows while it has no page, waits in data
        # attributes while the row is linked, and comes back unchanged.
        ext = '<span class="track-ext"><a href="https://github.com/x/y" target="_blank" rel="noopener">github →</a></span>'
        with_ext = index.replace('<span class="track-desc">About it.</span></div>', '<span class="track-desc">About it.</span>' + ext + '</div>')
        linked = build.link_rows(with_ext, {"04": "demo-page"})
        self.assertNotIn("track-ext", linked)
        self.assertIn('data-page="demo-page" data-ext-href="https://github.com/x/y" data-ext-label="github →">', linked)
        self.assertEqual(build.link_rows(linked, {}), with_ext)
        with self.assertRaisesRegex(build.ContentError, "track-ext"):
            build.link_rows(index.replace('<div class="track track--wrap">\n<span class="track-no">05',
                                          '<div class="track track--wrap" href="https://x.example">\n<span class="track-no">05'), {"05": "x"})

def site_links():
    """(page, href, attributes) for every link the build writes or the main page holds:
    the committed index.html, a progress page with every kind of link, and a Lately page."""
    out = []
    pages = {"index.html": (build.ROOT / "index.html").read_text(encoding="utf-8")}
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "04-demo-page.md"
        path.write_text(page_text(sections=dict(SECTIONS, **{
            "results": "See [the code](https://github.com/x/y), [a section](#log), [another page](track:04) and [mail](mailto:a@b.c).\n\n"
                       "CREDITS:\nsource | https://github.com/x/y\n\nLINKS:\nCode and README | https://github.com/x/y"})), encoding="utf-8")
        meta = build.read_page(path)
        pages["track page"] = build.render(meta, list(TRACKLIST), {"04": meta}, True, len(TRACKLIST))[0]
    data_meta = build.read_data_page(build.ROOT / "content/lately/watching.md", json.loads((build.ROOT / build.SCHEMA_PATH).read_text()))
    pages["lately page"] = build.render_data_page(data_meta)
    for name, doc in pages.items():
        for m in re.finditer(r"<a\b([^>]*)>", doc):
            href = re.search(r'href="([^"]*)"', m.group(1))
            if href:
                out.append((name, href.group(1), m.group(1)))
    return out


class Links(unittest.TestCase):
    # A link to another site (or a résumé PDF) opens in a new tab, with rel="noopener".
    def test_external_links_open_in_a_new_tab(self):
        ext = [(n, h, a) for n, h, a in site_links() if re.match(r"https?://", h) or h.endswith(".pdf")]
        self.assertGreater(len({n for n, _, _ in ext}), 2)
        for name, href, attrs in ext:
            with self.subTest(page=name, href=href):
                self.assertIn('target="_blank"', attrs)
                self.assertRegex(attrs, r'rel="[^"]*\bnoopener\b')

    # A link within the site (relative, #anchor, mailto:) stays in the same tab.
    def test_internal_links_stay_in_the_same_tab(self):
        internal = [(n, h, a) for n, h, a in site_links() if not (re.match(r"https?://", h) or h.endswith(".pdf"))]
        self.assertTrue(any(h.startswith("#") for _, h, _ in internal) and any(h.startswith("../") for _, h, _ in internal))
        for name, href, attrs in internal:
            with self.subTest(page=name, href=href):
                self.assertNotIn("target=", attrs)


class Preview(unittest.TestCase):
    # build.py --drafts writes the whole site to _site-drafts/ with every page built and
    # linked; the site itself (tracks/, index.html) only ever holds ready pages, and a
    # plain build removes the preview. Run on a copy of the site, never the real one.
    def test_drafts_preview(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "site"
            shutil.copytree(build.ROOT, site, ignore=shutil.ignore_patterns(".git", "node_modules", "_site-drafts", "tracks", "drafts"))
            (site / "tracks").mkdir()
            drafts = site / "content" / "drafts"
            drafts.mkdir(parents=True, exist_ok=True)
            num = build.read_tracklist((site / "index.html").read_text(encoding="utf-8"))[0][0]
            (drafts / "x-demo-page.md").write_text(page_text(front={"track": num}), encoding="utf-8")
            index_before = (site / "index.html").read_text(encoding="utf-8")

            def run(*args):
                r = subprocess.run([sys.executable, str(site / "build.py"), *args], capture_output=True, text=True, timeout=120)
                self.assertEqual(r.returncode, 0, r.stderr)

            run("--drafts")
            prev = site / build.PREVIEW_DIR
            self.assertTrue((prev / "tracks" / "demo-page" / "index.html").is_file())
            self.assertIn('href="tracks/demo-page/" data-page="demo-page"', (prev / "index.html").read_text(encoding="utf-8"))
            for part in ("lately/watching/index.html", "css/site.css", "js/lately.js", "sitemap.xml"):
                self.assertTrue((prev / part).is_file(), part)
            for part in ("content", "tests", "tools", "build.py", "README.md"):
                self.assertFalse((prev / part).exists(), part)
            self.assertFalse((site / "tracks" / "demo-page").exists())
            self.assertEqual((site / "index.html").read_text(encoding="utf-8"), index_before)
            self.assertFalse((site / "index.drafts.html").exists())
            run()
            self.assertFalse(prev.exists())


if __name__ == "__main__":
    unittest.main()
