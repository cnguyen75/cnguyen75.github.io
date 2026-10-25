"""The rule-book's checker (rules_check.py, from CODING-RULES.md) runs as part of the suite: any
finding in a tracked file fails it. Prose rules apply to content/, index.html, README.md, DESIGN.md
and HANDOFF.md; the "as of" pattern is allowed only inside the lately templates, whose built-with
row carries it. The judgement items the rule-book leaves to the reader (function length, nesting,
parameters) are listed here by file and function, and any new one fails too.
Run: python3 -m unittest discover tests"""

from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import rules_check  # noqa: E402


HANDOFF = Path.home() / "Personal" / "site-handoff" / "HANDOFF.md"
PROSE_RULES = {"banned-word", "banned-pattern", "heading-case"}
PROSE_SCOPE = ("content/", "index.html", "README.md", "DESIGN.md")
AS_OF_ALLOWED = "content/lately/"
# Judgement items left open on purpose: (file, function, rule). Each is a function that does one
# job in one pass over a page or a fixture; splitting it would add names without adding meaning.
JUDGEMENT = {
    ("build.py", "parse_sections", "nesting"),
    ("build.py", "read_data_page", "function-length"),
    ("build.py", "read_data_page", "nesting"),
    ("build.py", "parse_data_body", "nesting"),
    ("build.py", "blocks", "function-length"),
    ("build.py", "blocks", "nesting"),
    ("build.py", "marker", "function-length"),
    ("build.py", "marker", "nesting"),
    ("build.py", "audio_grid", "function-length"),
    ("build.py", "component", "function-length"),
    ("build.py", "component", "nesting"),
    ("build.py", "link_rows", "function-length"),
    ("build.py", "render", "function-length"),
    ("build.py", "render", "parameters"),
    ("build.py", "render", "nesting"),
    ("build.py", "built_with_grid", "function-length"),
    ("build.py", "write_pages", "parameters"),
    ("build.py", "main", "function-length"),
    ("tests/run.py", "main", "function-length"),
    ("tests/test_build.py", "test_main_page_parts", "function-length"),
    ("tests/test_build.py", "test_main_page_work_rows", "function-length"),
    ("tests/test_build.py", "test_fill_live", "function-length"),
    ("tests/test_build.py", "test_papers", "function-length"),
    ("tests/test_build.py", "test_main_page_rows", "function-length"),
    ("tests/test_build.py", "test_drafts_preview", "function-length"),
    ("tests/test_lately_depth.py", "test_page_frame", "function-length"),
    ("tests/test_lately_depth.py", "test_deep_links_unchanged", "function-length"),
    ("tests/test_lately_depth.py", "test_stat_lines", "function-length"),
    ("tests/test_lately_depth.py", "variant", "function-length"),
    ("tests/test_lately_depth.py", "test_not_enough_data", "function-length"),
    ("tests/test_lately_depth.py", "test_not_enough_data", "nesting"),
    ("tests/test_lately_depth.py", "test_small_sample", "function-length"),
    ("tests/test_lately_depth.py", "test_lede", "function-length"),
    ("tests/test_lately_depth.py", "test_tabs", "function-length"),
    ("tests/test_lately_depth.py", "test_main_page_panels", "function-length"),
    ("tests/test_lately_depth.py", "test_main_page_panels_waiting", "function-length"),
    ("tests/test_lately_depth.py", "test_main_page_panels_waiting", "nesting"),
    ("tests/test_lately_depth.py", "test_fantasy_cards", "function-length"),
    ("tests/test_lately_depth.py", "test_watching_regrouped", "function-length"),
    ("tests/test_lately_depth.py", "test_film_cards", "function-length"),
    ("tests/test_lately_depth.py", "test_profile_cards", "function-length"),
    ("tests/test_lately_depth.py", "test_every_statistic_has_a_renderer", "nesting"),
}
# The main page's live rows are filled from a results file at build time (build.py, fill_live), so
# their text is the file's, not prose written here.
LIVE_TEXT = re.compile(r'(<span class="track-live"[^>]*>)[^<]*(</span>)')
FINDING = re.compile(r"^(?P<path>.+?):(?P<line>\d+): (?P<rule>[\w-]+): (?P<detail>.*)$")


def tracked_files() -> set[str]:
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True)
    return set(out.stdout.split())


def checker_findings() -> list[dict]:
    """Every finding `python3 rules_check.py .` prints, as dicts with a repo-relative path."""
    run = subprocess.run(
        [sys.executable, "rules_check.py", "."], cwd=ROOT, capture_output=True, text=True
    )
    findings = []
    for line in run.stdout.splitlines():
        m = FINDING.match(line)
        if not m:
            continue
        path = Path(m["path"])
        rel = str(path.relative_to(ROOT)) if path.is_absolute() else str(path)
        findings.append(dict(m.groupdict(), path=rel, line=int(m["line"])))
    return findings


def judgement_key(finding: dict) -> tuple[str, str, str]:
    detail = finding["detail"]
    name = detail.split(" ")[0]
    return (finding["path"], name, finding["rule"])


class RuleBook(unittest.TestCase):
    def test_checker_is_clean(self) -> None:
        tracked = tracked_files()
        left = []
        for f in checker_findings():
            if f["path"] not in tracked:
                continue
            if f["rule"] in PROSE_RULES and not f["path"].startswith(PROSE_SCOPE):
                continue
            if f["detail"].startswith("'as of'") and f["path"].startswith(AS_OF_ALLOWED):
                continue
            if judgement_key(f) in JUDGEMENT:
                continue
            left.append(f"{f['path']}:{f['line']}: {f['rule']}: {f['detail']}")
        self.assertEqual(left, [], "\n".join(left))

    def test_judgement_list_is_current(self) -> None:
        open_items = {
            judgement_key(f)
            for f in checker_findings()
            if f["rule"] in {"function-length", "nesting", "parameters"}
        }
        stale = sorted(JUDGEMENT - open_items)
        self.assertEqual(stale, [], f"no longer flagged, drop from JUDGEMENT: {stale}")

    def test_prose_rules_on_the_main_page_and_the_handoff(self) -> None:
        pages = [ROOT / "index.html"] + ([HANDOFF] if HANDOFF.is_file() else [])
        found = []
        for page in pages:
            text = LIVE_TEXT.sub(r"\1\2", page.read_text(encoding="utf-8"))
            for f in rules_check.check_prose(page, text):
                if f.rule == "heading-case":
                    continue
                found.append(str(f))
        self.assertEqual(found, [], "\n".join(found))

    def test_handoff_names_the_writing_rules(self) -> None:
        if not HANDOFF.is_file():
            self.skipTest("HANDOFF.md is not on this machine")
        self.assertIn(
            "Writing on this site follows CODING-RULES.md, section Writing for repos.",
            HANDOFF.read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
