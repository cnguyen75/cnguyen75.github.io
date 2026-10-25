"""One component family (DESIGN.md, "Components"): the class names retired on 2026-10-25, when the
parallel .ld-* and .tp-* versions of the bars, tables, stat tiles, legends, axes, charts, tabs and
how line were folded into one set, never come back in the stylesheets, the scripts, the build
or the built pages. Run: python3 -m unittest discover tests"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parent.parent

RETIRED = [
    # bars
    "bar-list",
    "bar-list--wide",
    "bar-row",
    "bar-fill--neg",
    "bar-fill--pos",
    "bar-track--diverging",
    "ld-bars",
    "ld-bars--tier",
    "ld-bars--effects",
    "ld-bar-row",
    "ld-bar-row--unclear",
    "ld-bar-label",
    "ld-bar-track",
    "ld-bar-fill",
    "ld-bar-fill--neg",
    "ld-bar-value",
    "ld-bar-ref",
    "ld-bar-zero",
    "tp-bars",
    "tp-bar",
    "tp-bar-label",
    "tp-bar-track",
    "tp-bar-fill",
    "tp-bar-fill--blue",
    "tp-bar-fill--orange",
    "tp-bar-value",
    "tp-panel",
    "tp-panel-title",
    # tables
    "data-table",
    "ld-table",
    "ld-table--wide",
    "ld-caption",
    "tp-table",
    # stat tiles
    "tp-stats",
    "tp-stat",
    "tp-stat-label",
    "tp-stat-value",
    "ld-stats",
    "ld-stats--panel",
    # legend keys, axes, charts, tabs, how
    "ld-legend",
    "ld-key-bar",
    "ld-key-ref",
    "ld-key-dot",
    "ld-key-box",
    "ld-key-median",
    "axis-labels",
    "ld-iv-axis-track",
    "ld-axis-start",
    "ld-axis-end",
    "ld-iv-axis",
    "ld-range-axis",
    "chart-block",
    "chart-block--hours",
    "chart-block--pair",
    "chart-figure",
    "chart-figure--tight",
    "ld-chart",
    "ld-chart-title",
    "tier-tabs",
    "tier-tab",
    "ld-how",
    "ld-how-text",
]
CURRENT = [
    "bars",
    "bar",
    "bar-label",
    "bar-track",
    "bar-fill",
    "bar-value",
    "bar--neg",
    "bar--faded",
    "bar-ref",
    "table",
    "stats",
    "stat",
    "legend",
    "axis",
    "chart",
    "chart-title",
    "tabs",
    "tab-strip",
    "tab",
    "control",
    "how",
]


def sources() -> list[Path]:
    files = (
        [ROOT / "build.py", ROOT / "index.html"]
        + sorted((ROOT / "css").glob("*.css"))
        + sorted((ROOT / "js").glob("*.js"))
    )
    files += sorted(ROOT.glob("lately/*/index.html")) + sorted(ROOT.glob("tracks/*/index.html"))
    return [p for p in files if p.is_file()]


class OneFamily(unittest.TestCase):
    def test_retired_class_names_are_gone(self) -> None:
        found = []
        for path in sources():
            text = path.read_text(encoding="utf-8")
            for name in RETIRED:
                for m in re.finditer(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])", text):
                    line = text.count("\n", 0, m.start()) + 1
                    found.append(f"{path.relative_to(ROOT)}:{line}: {name}")
        self.assertEqual(found, [], "\n".join(found))

    def test_the_family_is_in_use(self) -> None:
        css = (ROOT / "css/site.css").read_text(encoding="utf-8")
        for name in CURRENT:
            with self.subTest(name=name):
                self.assertRegex(css, r"\." + re.escape(name) + r"(?![\w-])")


if __name__ == "__main__":
    unittest.main()
