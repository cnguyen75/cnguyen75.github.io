#!/usr/bin/env python3
"""Build the track pages. Python 3 standard library only.

    python3 build.py            pages marked ready only: what gets committed
    python3 build.py --drafts   also the drafts, with a "draft" marker, for local preview

Content lives in one Markdown file per track:

    content/tracks/NN-slug.md   ready pages (committed)
    content/drafts/NN-slug.md   drafts (git-ignored; nothing about them is committed)

with any files the page uses (SVG figures, demo data, audio) in a folder named
after the slug next to it. Each file becomes tracks/<slug>/index.html. The build
also writes sitemap.xml, tracks/.gitignore (so only ready pages can be committed)
and the links from the main page's track rows. See README.md, "Track pages".

The Lately pages use the "data" register: content/lately/<feed>.md, one per
feed, becomes lately/<feed>/index.html through the same page template as the
track pages (they are tracks 22 to 26). Those files name statistics, not
numbers; js/lately-depth.js draws them from data/lately.json in the browser, so
no data is ever written into the built pages. See README.md, "Lately in depth".
"""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import re
import shutil
import sys


ROOT = Path(__file__).resolve().parent
SITE = "https://cnguyen75.github.io/"
WPM = 230  # reading pace for timestamps and the play control
FIGURE_SECS = 6  # time given to each figure, code excerpt or demo; play holds still for part of it
REGISTERS = ("album", "plain", "progress")
REQUIRED = ("track", "slug", "title", "register", "ready")
REQUIRED_BY_REGISTER = {
    "album": ("one_line",),
    "plain": ("one_line",),
    "progress": ("with", "as_of"),
}
# The progress register (ongoing research) has fixed sections, in this order.
PROGRESS_SECTIONS = (
    "question",
    "approach",
    "where it stands",
    "results",
    "what's next",
    "log",
    "built with",
    "my role",
)
PROGRESS_OPTIONAL = (
    "results",
    "log",
    "built with",
    "my role",
)  # my role: only on pages about work led with others
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTHS_LONG = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
LIVE_DATA = "data/lately.json"  # written by the pipeline; the site is not built without it
OUT_MARK = ".built-by-build-py"  # marks folders this script may delete
SITE_DIR = "_site"  # a build assembles the publishable site here; git-ignored
PREVIEW_DIR = "_site-drafts"  # --drafts assembles it here instead, drafts included; git-ignored
# Everything the site is made of, by name at the repo root, plus data/lately.json. Nothing else
# is copied into _site or _site-drafts; a test checks their contents against this list.
SITE_FILES = (
    ".nojekyll",
    "index.html",
    "sitemap.xml",
    "favicon.svg",
    "favicon-32.png",
    "apple-touch-icon.png",
    "css",
    "js",
    "fonts",
    "images",
    "resume",
    "lately",
    "tracks",
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "08",
)
NOT_COPIED = {".gitignore", OUT_MARK, ".DS_Store", "__pycache__"}

# Plain-text component markers, as handoff drafts write them ("STEPS:", "FIGURE: path", ...).
# A marker starts a block that runs to the next blank line; the second group only
# ever follows one of the first.
MARKER = re.compile(r"([A-Z][A-Z-]*[A-Z]):\s*(.*)$")
MARKER_BLOCKS = (
    "STEPS",
    "EXCERPT",
    "DEMO",
    "STATS",
    "FIGURE",
    "TABLE",
    "BUILT-WITH",
    "LINKS",
    "PAPERS",
    "AUDIO-PAIR",
    "AUDIO-GRID",
)
# The rows a BUILT-WITH: block takes, in the order they are shown; "papers" is also where a
# PAPERS: block in the same section is drawn.
BUILT_WITH_ROWS = (
    "code",
    "languages and frameworks",
    "data",
    "compute",
    "papers",
    "attribution",
    "made with",
)
MARKER_FIELDS = (
    "CAPTION",
    "BEHAVIOUR",
    "DEMO-CAPTION",
    "ATTRIBUTION",
    "AUDIO-NOTE",
    "ALT",
    "OVERLAY",
)


# The data register (content/lately/<feed>.md -> lately/<feed>/)
DATA_FEEDS = ("fantasy", "watching", "listening", "eating", "lifting")
DATA_REQUIRED = ("register", "feed", "title", "source")
# Every page has these two groups ("# What's happening", "# Why"), in this order; each
# ## section sits in one. Cards in Why are questions and show "not enough data yet" with
# n and min_n; sections in What's happening are hidden until they have data.
DATA_GROUPS = ("What's happening", "Why")
DATA_GROUP_IDS = {"What's happening": "whats-happening", "Why": "why"}
# Blocks of the feed itself (not the analysis) that js/lately.js draws into a FEED: slot.
FEED_BLOCKS = (
    "fantasy.lineup",
    "fantasy.carry",
    "watching.hours",
    "watching.recent",
    "watching.rankings",
    "watching.tiers",
    "listening.recent",
    "eating.recent",
    "lifting.lifts",
    "lifting.training",
    "lifting.body_weight",
)
# Each page credits its source by name and link; these four require it.
DATA_ATTRIBUTION = {
    "watching": "Simkl",
    "listening": "Last.fm",
    "eating": "Beli",
    "lifting": "Hevy",
}
SHORT_WORDS = 2  # a data-page section's short: name, the reading bar's segment label
# Statistics in the analysis schema that no page shows, as {path: reason}. Every other
# statistic must be on exactly one page. The pages hold the cards that have data or a dated
# arrival and answer something no other card does; the pipeline keeps computing these.
DATA_LEFT_OUT = {
    "fantasy.teams[].record_vs_median": "the quadrant's all-play share says it",
    "fantasy.teams[].margins": "week-by-week results are in the lineup grid",
    "fantasy.teams[].position_share": "no question of its own",
    "fantasy.teams[].start_sit": "no question of its own",
    "fantasy.teams[].consistency": "no question of its own",
    "grading.playoff_odds[].odds_over_time": "the playoff-odds card shows the current odds",
    "watching.hours_by_month": "no question of its own",
    "watching.release_decades": "the S-by-decade bars under the taste profile say it",
    "watching.runtime": "no question of its own",
    "watching.countries.show": "no question of its own",
    "watching.countries.film": "no question of its own",
    "watching.countries.anime": "no question of its own",
    "watching.tier_distribution.*": "the tier board shows every tiered title",
    "watching.tier_genres_decades": "drawn as the tier board's row summaries",
    "watching.tier_model": "the taste profile's accuracy says it",
    "watching.language": "too few non-English films to answer",
    "watching.critics_vs_audience": "not available from the source",
    "watching.taste_drift": "no dated arrival",
    "watching.first_episode_drops": "completion answers it",
    "watching.pace": "no question of its own",
    "watching.pace_vs_tier": "no dated arrival",
    "watching.tier_completion_pace": "completion answers it",
    "watching.backlog": "no dated arrival",
    "listening.discovery": "dig back or keep up answers it",
    "listening.comebacks": "no question of its own",
    "listening.heatmap": "plays by weekday and hour says it (its n still dates the archive)",
    "listening.first_repeat": "no dated arrival",
    "listening.album_listener": "not available from the source",
    "lifting.progress.*": "the strength index's per-lift list says it",
    "lifting.retention.*": "the strength index's per-lift list says it",
    "lifting.lag_check": "no dated arrival",
    "lifting.volume_lag": "no question of its own",
    "lifting.consistency": "no question of its own",
    "cross.rhythm.restaurants": "no question of its own",
    "eating.contrarian": "not available from the source",
    "eating.rerank_drift": "replaced on the page by safe_bet (2026-10-18)",
}
SCHEMA_PATH = "data/lately.schema.json"


class ContentError(Exception):
    pass


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def new_tab(url: str) -> str:
    """Attributes for a link: one to another site opens in a new tab with rel="noopener";
    a link within the site (relative, #anchor, mailto:, or this site's own URL) stays put."""
    return (
        ' target="_blank" rel="noopener"'
        if re.match(r"https?://", url) and not url.startswith(SITE)
        else ""
    )


# ---------- reading content files ----------


def read_page(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        raise ContentError(f"{path.name}: no front matter")
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        k, sep, v = line.partition(":")
        if not sep:
            raise ContentError(f"{path.name}: bad front matter line {line!r}")
        meta[k.strip()] = v.strip()
    if meta.get("register") not in REGISTERS:
        raise ContentError(f"{path.name}: register must be album, plain or progress")
    missing = [k for k in REQUIRED + REQUIRED_BY_REGISTER[meta["register"]] if not meta.get(k)]
    if missing:
        raise ContentError(f"{path.name}: front matter is missing {', '.join(missing)}")
    if meta["ready"] not in ("true", "false"):
        raise ContentError(f"{path.name}: ready must be true or false")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", meta["slug"]):
        raise ContentError(f"{path.name}: slug must be lowercase words joined by hyphens")
    meta["ready"] = meta["ready"] == "true"
    meta["track"] = meta["track"].zfill(2)
    if meta.get("when") and ("—" in meta["when"] or not re.fullmatch(r"[a-z0-9 ,]+", meta["when"])):
        raise ContentError(
            f"{path.name}: when: is the months in words, lowercase, e.g. 'aug 2026 to present' or "
            f"'2025, rebuilt 2026'"
        )
    meta["source"] = path
    meta["assets"] = path.parent / meta["slug"]
    body = m.group(2)
    if meta.get("live"):  # {field:kind} placeholders read from a results file in the asset folder
        body = fill_live_lines(body, meta["assets"] / meta["live"], path.name)
    meta["sections"] = parse_sections(body, path.name)
    if meta.get("part"):
        # "part: part one · 2014–15 | 12": a page in a two-part story, and the number of the other
        # part.
        label, sep, other = (x.strip() for x in meta["part"].partition("|"))
        if not (label and sep and re.fullmatch(r"\d+", other)):
            raise ContentError(f"{path.name}: part must be 'label | number of the other part'")
        meta["part_label"], meta["part_other"] = label, other.zfill(2)
    if meta["register"] == "progress":
        check_progress(meta, path.name)
    return meta


def check_progress(meta: dict, name: str) -> None:
    """Front matter and section order for the progress register."""
    meta["as_of_date"] = parse_date(meta["as_of"], f"{name}: as_of", month_only=False)
    if meta.get("link"):
        label, sep, url = meta["link"].partition("|")
        if not sep or not label.strip() or not re.fullmatch(r"https://\S+", url.strip()):
            raise ContentError(f"{name}: link must be 'label | https://...'")
        meta["link_label"], meta["link_url"] = label.strip(), url.strip()
    titles = [s["title"] for s in meta["sections"]]
    expected = [t for t in PROGRESS_SECTIONS if t in titles or t not in PROGRESS_OPTIONAL]
    if titles != expected:
        raise ContentError(
            f"{name}: progress sections must be, in order: "
            + ", ".join(
                t + (" (optional)" if t in PROGRESS_OPTIONAL else "") for t in PROGRESS_SECTIONS
            )
            + f"; found: {', '.join(titles)}"
        )


def parse_date(s: str, what: str, month_only: bool = True) -> tuple[str, str]:
    """(datetime attribute, display text) for YYYY-MM-DD, or YYYY-MM when month_only is allowed."""
    m = re.fullmatch(r"(\d{4})-(\d{2})(?:-(\d{2}))?", s)
    if not m or (m.group(3) is None and not month_only):
        raise ContentError(
            f"{what} must be YYYY-MM-DD" + (" or YYYY-MM" if month_only else "") + f", not {s!r}"
        )
    y, mo = int(m.group(1)), int(m.group(2))
    if not 1 <= mo <= 12:
        raise ContentError(f"{what}: no month {mo}")
    if m.group(3) is None:
        return s, f"{MONTHS[mo - 1]} {y}"
    import datetime

    try:
        datetime.date(y, mo, int(m.group(3)))
    except ValueError:
        raise ContentError(f"{what}: {s} is not a date")
    return s, f"{int(m.group(3))} {MONTHS[mo - 1]} {y}"


def parse_sections(body: str, name: str) -> list[dict]:
    sections, cur = [], None
    for line in body.splitlines():
        h = re.match(r"## (.+?)(?:\s+\{#([a-z0-9-]+)\})?\s*$", line)
        if h:
            title = h.group(1).strip()
            cur = {"title": title, "id": h.group(2) or slugify(title), "lines": []}
            sections.append(cur)
        elif cur is not None:
            cur["lines"].append(line)
        elif line.strip():
            raise ContentError(f"{name}: text before the first ## section")
    if not sections:
        raise ContentError(f"{name}: no sections")
    ids = [s["id"] for s in sections]
    if len(set(ids)) != len(ids):
        raise ContentError(f"{name}: two sections share an id")
    return sections


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------- the data register ----------


def _schema_node(schema: dict, node: dict) -> dict:
    while "$ref" in node:
        node = schema["$defs"][node["$ref"].split("/")[-1]]
    return node


# A statistic: analysis_stat, or one of its fixed-shape variants (analysis_stat_quadrant...),
# which carry the same required fields.
STAT_FIELDS = {"status", "n", "min_n", "as_of", "how"}


def _is_stat(node: dict) -> bool:
    return isinstance(node.get("properties"), dict) and set(node["properties"]) >= STAT_FIELDS


def stat_paths(schema: dict, pattern: str | None = None) -> list[str]:
    """Every statistic under analysis, as paths such as fantasy.teams[].playoff_odds,
    lifting.progress.* (a map keyed by the data) or watching.completion.show. With a
    pattern, only the ones it names: "teams[]" steps into a list, and "*" takes a map's
    keys or every statistic among fixed properties. KeyError if it names nothing."""
    steps = (
        None
        if pattern is None
        else [
            x
            for part in pattern.split(".")
            for x in ([part[:-2], "[]"] if part.endswith("[]") else [part])
        ]
    )
    out = []

    def walk(node: dict, path: list[str], steps: list[str] | None) -> None:
        node = _schema_node(schema, node)
        if _is_stat(node):
            if steps:
                raise KeyError(".".join(path))
            out.append(".".join(path))
            return
        if node.get("type") == "array":
            if steps is not None and (not steps or steps[0] != "[]"):
                raise KeyError(".".join(path) + " is a list; write it with []")
            walk(node["items"], path[:-1] + [path[-1] + "[]"], None if steps is None else steps[1:])
            return
        props, extra = node.get("properties", {}), node.get("additionalProperties")
        if steps is None:  # everything
            for k, v in props.items():
                walk(v, path + [k], None)
            if isinstance(extra, dict):
                walk(extra, path + ["*"], None)
            return
        if not steps:
            raise KeyError(".".join(path) or "analysis")
        step, rest = steps[0], steps[1:]
        if step == "*" and isinstance(extra, dict):
            walk(extra, path + ["*"], rest)
        elif step == "*":
            for k, v in props.items():
                walk(v, path + [k], rest)
        elif step in props:
            walk(props[step], path + [step], rest)
        else:
            raise KeyError(".".join(path + [step]))

    walk(schema["properties"]["analysis"], [], steps)
    return out


def read_data_page(path: Path, schema: dict) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        raise ContentError(f"{path.name}: no front matter")
    meta = {}
    for line in m.group(1).splitlines():
        if line.strip():
            k, sep, v = line.partition(":")
            if not sep:
                raise ContentError(f"{path.name}: bad front matter line {line!r}")
            meta[k.strip()] = v.strip()
    missing = [k for k in DATA_REQUIRED if not meta.get(k)]
    if missing:
        raise ContentError(f"{path.name}: front matter is missing {', '.join(missing)}")
    if meta["register"] != "data":
        raise ContentError(f"{path.name}: content/lately/ pages use register: data")
    if meta["feed"] not in DATA_FEEDS or path.stem != meta["feed"]:
        raise ContentError(
            f"{path.name}: feed must be one of {', '.join(DATA_FEEDS)} and match the file name"
        )
    sources = []
    for part in meta["source"].split(","):
        name, sep, url = part.partition("|")
        if not sep or not name.strip() or not re.fullmatch(r"https://\S+", url.strip()):
            raise ContentError(f"{path.name}: source must be 'Name | https://...', comma-separated")
        sources.append((name.strip(), url.strip()))
    need = DATA_ATTRIBUTION.get(meta["feed"])
    if need and need not in [n for n, _ in sources]:
        raise ContentError(f"{path.name}: the {meta['feed']} page must credit {need}")
    meta["sources"] = sources
    meta["source_file"] = path
    # Shaped like a track page's front matter, so render() and write_pages() take it: always
    # ready, written to lately/<feed>/, no asset folder (so no preview card), the track number
    # from the main page's panel (set by read_data_pages()).
    meta["ready"] = True
    meta["slug"] = meta["feed"]
    meta["assets"] = path.parent / meta["feed"]
    meta["status_label"] = "live · updated daily"
    if meta.get("attribution_when"):
        # "attribution_when: yahoo | Fantasy data provided by Yahoo Fantasy | https://...": a credit
        # line shown only when that source is in analysis.meta.sources_included.
        parts = [x.strip() for x in meta["attribution_when"].split("|")]
        if (
            len(parts) != 3
            or not all(parts)
            or not re.fullmatch(r"[a-z]+", parts[0])
            or not re.fullmatch(r"https://\S+", parts[2])
        ):
            raise ContentError(
                f"{path.name}: attribution_when must be 'source | text | https://...'"
            )
        meta["attribution_when"] = tuple(parts)
    if meta.get("attributions_when"):
        # "attributions_when: watching.by_director, watching.crowd_agreement": the credits in
        # analysis.meta.attributions are printed in the footer while any of these statistics is ok.
        paths = [x.strip() for x in meta["attributions_when"].split(",") if x.strip()]
        for pth in paths:
            try:
                stat_paths(schema, pth)
            except KeyError as e:
                raise ContentError(
                    f"{path.name}: attributions_when: {pth} is not a statistic in {SCHEMA_PATH} "
                    f"({e.args[0]})"
                )
        meta["attributions_when"] = paths
    meta["groups"] = parse_data_body(m.group(2), path.name)
    meta["sections"] = [s for g in meta["groups"] for s in g["sections"]]
    meta["stats"] = []
    for sec in meta["sections"]:
        sec["stats"], sec["slots"], sec["notes"], sec["aliases"], sec["source"], sec["how"] = (
            [],
            [],
            [],
            [],
            None,
            None,
        )
        sec["short"] = None
        for line in sec["lines"]:
            if not line.strip():
                continue
            mm = re.fullmatch(r"(STAT|FEED|NOTE|ALIAS|SOURCE|HOW|short):\s*(\S.*?)\s*", line)
            if not mm:
                raise ContentError(
                    f"{path.name}: under '## {sec['title']}' only short:, STAT:, FEED:, NOTE:, "
                    f"ALIAS:, SOURCE: and HOW: lines are allowed, not {line.strip()!r}"
                )
            kind, arg = mm.group(1), mm.group(2)
            if kind == "short":
                # The section's name in the reading bar: at most two words, so the bar fits one row.
                if sec["short"] is not None:
                    raise ContentError(
                        f"{path.name}: under '## {sec['title']}' only one short: line is allowed"
                    )
                if len(arg.split()) > SHORT_WORDS or not re.fullmatch(r"[a-z0-9][a-z0-9' -]*", arg):
                    raise ContentError(
                        f"{path.name}: short: {arg!r} must be at most {SHORT_WORDS} lowercase words"
                    )
                sec["short"] = arg
                continue
            if kind == "NOTE":
                sec["notes"].append(arg)
                continue
            if kind == "HOW":
                # The section's primary statistic, whose "how" sentence is the one shown (the first
                # listed when there is no HOW: line), and "open" to unfold it by default.
                if sec["how"] is not None:
                    raise ContentError(
                        f"{path.name}: under '## {sec['title']}' only one HOW: line is allowed"
                    )
                hp, _, flag = arg.partition(" ")
                if flag.strip() not in ("", "open"):
                    raise ContentError(
                        f"{path.name}: HOW: takes a statistic path and, at most, the word open"
                    )
                sec["how"] = (hp.strip(), flag.strip() == "open")
                continue
            if kind == "SOURCE":
                # Where this section's data comes from when it isn't the page's credit (the survival
                # cards read the Apple Music library export, not Last.fm): one mono line under the
                # title.
                if sec["source"] is not None:
                    raise ContentError(
                        f"{path.name}: under '## {sec['title']}' only one SOURCE: line is allowed"
                    )
                sec["source"] = arg
                continue
            if kind == "ALIAS":
                # The id of a card this one absorbed: a deep link to it lands here.
                if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", arg):
                    raise ContentError(
                        f"{path.name}: ALIAS: {arg} must be a section id (lowercase words joined "
                        f"by hyphens)"
                    )
                sec["aliases"].append(arg)
                continue
            if kind == "FEED":
                if arg not in FEED_BLOCKS:
                    raise ContentError(
                        f"{path.name}: FEED: {arg} is not a block js/lately.js draws "
                        f"({', '.join(FEED_BLOCKS)})"
                    )
                sec["slots"].append(("feed", arg))
                continue
            try:
                leaves = stat_paths(schema, arg)
            except KeyError as e:
                raise ContentError(
                    f"{path.name}: STAT: {arg} is not a statistic in {SCHEMA_PATH} ({e.args[0]})"
                )
            sec["stats"].append(leaves)  # one slot per STAT: line, naming every statistic it covers
            sec["slots"].append(("stat", leaves))
            meta["stats"] += leaves
        if not sec["slots"]:
            raise ContentError(f"{path.name}: '## {sec['title']}' has no STAT: or FEED: line")
        if not sec["short"]:
            raise ContentError(
                f"{path.name}: '## {sec['title']}' lacks short: (its name in the reading bar, at "
                f"most two words)"
            )
        if sec["how"] and sec["how"][0] not in [leaf for leaves in sec["stats"] for leaf in leaves]:
            raise ContentError(
                f"{path.name}: HOW: {sec['how'][0]} is not one of the statistics '## "
                f"{sec['title']}' shows"
            )
    check_aliases(meta)
    return meta


def parse_data_body(body: str, name: str) -> list[dict]:
    """A data page's body: "# What's happening" and "# Why", each holding ## sections (a
    section may fix its id with {#id} so a retitled card keeps its deep link)."""
    groups, cur = [], None
    for line in body.splitlines():
        g = re.match(r"# (.+?)\s*$", line)
        if g:
            title = g.group(1).strip()
            if title not in DATA_GROUPS:
                raise ContentError(
                    f"{name}: groups are '# {DATA_GROUPS[0]}' and '# {DATA_GROUPS[1]}', not '# "
                    f"{title}'"
                )
            cur = {"title": title, "id": DATA_GROUP_IDS[title], "lines": []}
            groups.append(cur)
        elif cur is not None:
            cur["lines"].append(line)
        elif line.strip():
            raise ContentError(f"{name}: text before the first # group")
    if [g["title"] for g in groups] != list(DATA_GROUPS):
        raise ContentError(
            f"{name}: a data page has the groups '# {DATA_GROUPS[0]}' then '# {DATA_GROUPS[1]}', "
            f"once each"
        )
    ids = set()
    for g in groups:
        g["sections"] = parse_sections("\n".join(g["lines"]), name)
        for s in g["sections"]:
            s["group"] = g["id"]
            if s["id"] in ids:
                raise ContentError(f"{name}: two sections share an id")
            ids.add(s["id"])
    return groups


def check_aliases(meta: dict) -> None:
    """An alias never repeats a section id or another alias."""
    ids = {s["id"] for s in meta["sections"]}
    seen = set()
    for s in meta["sections"]:
        for a in s["aliases"]:
            if a in ids or a in seen:
                raise ContentError(
                    f"{meta['source_file'].name}: ALIAS: {a} is already a section id or alias"
                )
            seen.add(a)


def check_data_coverage(pages: list[dict], schema: dict) -> None:
    """Every statistic is on exactly one page, or listed in DATA_LEFT_OUT."""
    seen = {}
    for meta in pages:
        for leaf in meta["stats"]:
            if leaf in seen:
                raise ContentError(f"{leaf} is on both {seen[leaf]} and {meta['feed']}")
            seen[leaf] = meta["feed"]
    for leaf in stat_paths(schema):
        if leaf in seen and leaf in DATA_LEFT_OUT:
            raise ContentError(f"{leaf} is in DATA_LEFT_OUT but {seen[leaf]} shows it")
        if leaf not in seen and leaf not in DATA_LEFT_OUT:
            raise ContentError(
                f"{leaf} is in the analysis schema but on no page; add it to a page or to "
                f"DATA_LEFT_OUT"
            )


def lately_numbers(index_html: str) -> dict[str, int]:
    """Side D's panels are tracks too: {feed: the number on its panel}."""
    return {
        feed: num
        for feed, num in re.findall(
            r'id="panel-(\w+)"[^>]*>\s*<div class="panel-head">\s*<span '
            r'class="track-no">(\d\d)</span>',
            index_html,
        )
    }


def read_data_pages(schema: dict, index_html: str) -> list[dict]:
    """The data pages, numbered from the main page's panels and checked for coverage."""
    pages = [read_data_page(p, schema) for p in sorted((ROOT / "content" / "lately").glob("*.md"))]
    check_data_coverage(pages, schema)
    numbers = lately_numbers(index_html)
    for m in pages:
        if m["feed"] not in numbers:
            raise ContentError(f"the {m['feed']} panel on the main page has no track number")
        m["track"] = m["number"] = numbers[m["feed"]]
    return pages


def ready_track_pages() -> dict[int, dict]:
    """The ready track pages' front matter, {number: meta}, for previous and next links."""
    return {
        m["track"]: m
        for m in (read_page(p) for p in sorted((ROOT / "content" / "tracks").glob("*.md")))
    }


def build_data_pages(schema: dict) -> list[dict]:
    """Writes lately/<feed>/ from content/lately/ against the committed main page and ready
    track pages (main() does the same inside the full build). Returns the pages."""
    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    tracklist = read_tracklist(index_html)
    pages = read_data_pages(schema, index_html)
    pages_here = dict(ready_track_pages(), **{m["track"]: m for m in pages})
    write_pages(ROOT / "lately", pages, tracklist, pages_here, False, len(tracklist))
    (ROOT / "lately" / ".gitignore").write_text(
        f"# Written by build.py.\n{OUT_MARK}\n", encoding="utf-8"
    )
    return pages


def render_data_page(meta: dict) -> str:
    """One data page's document against the committed main page (tests and tools)."""
    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    tracklist = read_tracklist(index_html)
    numbers = lately_numbers(index_html)
    if meta["feed"] not in numbers:
        raise ContentError(f"the {meta['feed']} panel on the main page has no track number")
    meta["track"] = meta["number"] = numbers[meta["feed"]]
    return render(meta, tracklist, {meta["track"]: meta}, False, len(tracklist))[0]


# ---------- Markdown subset ----------
# Paragraphs, "> " lead paragraph (or a page's opening paragraph if bold throughout), "- " lists,
# **bold**, *italic*, `code`, [text](https://...), component blocks fenced by
# "::: name args" ... ":::", and the plain-text markers above.

# Track pages a [text](track:NN) link may point at from the page being rendered:
# {number: href}, set by render() with the same rule as previous and next.
TRACK_LINKS = {}


def page_folder(meta: dict) -> str:
    return "lately" if meta.get("register") == "data" else "tracks"


def href_to(frm: dict, to: dict) -> str:
    """The relative link from one built page to another: both sit two levels deep, in
    tracks/<slug>/ or lately/<feed>/."""
    if page_folder(frm) == page_folder(to):
        return f"../{to['slug']}/"
    return f"../../{page_folder(to)}/{to['slug']}/"


def inline(s: str) -> str:
    out, last = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)\s]+)\)", s):
        out.append(inline_text(s[last : m.start()]))
        url = m.group(2)
        last = m.end()
        track = re.fullmatch(r"track:(\d+)", url)
        if track:
            # Another track's page: a link only when that page is linkable from this one,
            # otherwise the text alone.
            href = TRACK_LINKS.get(track.group(1).zfill(2))
            out.append(
                f'<a href="{href}">{inline_text(m.group(1))}</a>'
                if href
                else inline_text(m.group(1))
            )
            continue
        if not re.match(r"(https://|mailto:|#|\.\./)", url):
            raise ContentError(f"link {url!r} must be https://, mailto:, #anchor or relative")
        out.append(f'<a href="{esc(url)}"{new_tab(url)}>{inline_text(m.group(1))}</a>')
    out.append(inline_text(s[last:]))
    return "".join(out)


def inline_text(s: str) -> str:
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    return s


def words(s: str) -> int:
    return len(re.findall(r"[\w’'–-]+", re.sub(r"<[^>]+>", " ", s)))


def stat_row(cells: list[tuple[str, str, str]]) -> str:
    """The stat tiles of a track page, (value, label, note) each, in the shared .stats component."""
    items = "".join(
        f'<div class="stat"><div class="stat-label">{inline(label)}</div><div '
        f'class="stat-value">{inline(value)}</div>'
        + (f'<div class="stat-note">{inline(note)}</div>' if note else "")
        + "</div>"
        for value, label, note in cells
    )
    return f'<div class="stats stats--row">{items}</div>'


class Page:
    """Renders one page's body and keeps what the page head needs."""

    def __init__(self, meta: dict) -> None:
        self.meta = meta
        self.figures = 0
        self.scripts = []  # page-only scripts (demo slots)
        self.styles = []  # page-only stylesheets (demo.css next to demo.js)
        self.copies = []  # asset files to copy next to the page
        self.held = 0  # HELD: notes (content waiting on a collaborator); a ready page may have none

    def asset(self, name: str, inline_svg: bool = False, copy: bool = True) -> str:
        """A file in the page's asset folder. Marker drafts name it as <slug>/path."""
        if name.startswith(self.meta["slug"] + "/"):
            name = name[len(self.meta["slug"]) + 1 :]
        if name.startswith(("/", ".")) or ".." in name.split("/") or "\\" in name:
            raise ContentError(f"asset {name!r} must be a path inside the page's folder")
        path = self.meta["assets"] / name
        if not path.is_file():
            raise ContentError(
                f"{self.meta['source'].name}: missing asset {path.relative_to(ROOT)}"
            )
        if inline_svg:
            svg = path.read_text(encoding="utf-8")
            svg = re.sub(r"<\?xml[^>]*\?>\s*|<!DOCTYPE[^>]*>\s*", "", svg).strip()
            if not svg.startswith("<svg") or re.search(r"<script|\son\w+=", svg, re.I):
                raise ContentError(f"{name}: must be a plain <svg> with no scripts")
            return svg
        if copy and name not in [c[1] for c in self.copies]:
            self.copies.append((path, name))
        return name

    def blocks(self, lines: list[str], first: bool = False) -> list[tuple[str, int, str]]:
        """Returns [(html, words, kind)] for one section; kind marks figures for the play
        control."""
        out, i = [], 0
        para = []

        def flush() -> None:
            if para:
                text = " ".join(l.strip() for l in para)
                if " HELD:" in text:
                    # Held text inside a paragraph: flagged from HELD: to the paragraph's end.
                    before, _, held = text.partition(" HELD:")
                    self.held += 1
                    out.append(
                        (
                            f"<p>{inline(before)} {self.held_note(held, 'span')}</p>",
                            words(text),
                            "text",
                        )
                    )
                    para.clear()
                    return
                bold = first and not out and re.fullmatch(r"\*\*([^*]+)\*\*", text)
                if text.startswith("> ") or bold:
                    lead = bold.group(1) if bold else text[2:]
                    out.append((f'<p class="tp-lead">{inline(lead)}</p>', words(text), "text"))
                else:
                    out.append((f"<p>{inline(text)}</p>", words(text), "text"))
                para.clear()

        while i < len(lines):
            line = lines[i]
            if not line.strip():
                flush()
                i += 1
            elif line.startswith(":::"):
                flush()
                head = line[3:].strip()
                j = i + 1
                while j < len(lines) and lines[j].strip() != ":::":
                    j += 1
                if j == len(lines):
                    raise ContentError(f"{self.meta['source'].name}: unclosed ::: {head}")
                out.append(self.component(head, lines[i + 1 : j]))
                i = j + 1
            elif re.match(r"- ", line):
                flush()
                items = []
                while i < len(lines) and (
                    lines[i].startswith("- ") or (lines[i].startswith("  ") and items)
                ):
                    if lines[i].startswith("- "):
                        items.append(lines[i][2:].strip())
                    else:
                        items[-1] += " " + lines[i].strip()
                    i += 1
                lis = "".join(f"<li>{inline(t)}</li>" for t in items)
                out.append((f"<ul>{lis}</ul>", sum(words(t) for t in items), "text"))
            elif line.startswith("HELD:"):
                flush()
                self.held += 1
                out.append(
                    (
                        f'<p class="tp-held">{self.held_note(line[5:], "span")}</p>',
                        words(line),
                        "text",
                    )
                )
                i += 1
            elif line.startswith("DIAGRAM:"):
                raise ContentError(
                    f"{self.meta['source'].name}: a DIAGRAM: line must be replaced by a ::: figure "
                    f"block"
                )
            elif MARKER.match(line):
                flush()
                j = i
                while j < len(lines) and lines[j].strip():
                    j += 1
                out.append(self.marker(lines[i:j]))
                i = j
            else:
                para.append(line)
                i += 1
        flush()
        return out

    @staticmethod
    def held_note(text: str, tag: str) -> str:
        return (
            f'<{tag} class="tp-held-note"><span class="tp-held-flag">held: needs a collaborator\'s '
            f"agreement</span> "
            f"{inline(text.strip())}</{tag}>"
        )

    def log(self, lines: list[str]) -> list[tuple[str, int, str]]:
        """A progress page's ## log: 'YYYY-MM-DD | text' or 'YYYY-MM | text' per line, in file
        order."""
        name = self.meta["source"].name
        items, n = "", 0
        for line in lines:
            if not line.strip():
                continue
            m = re.fullmatch(r"(\d{4}-\d{2}(?:-\d{2})?) \| (\S.*)", line.strip())
            if not m:
                raise ContentError(
                    f"{name}: log lines are 'YYYY-MM-DD | text' or 'YYYY-MM | text', not "
                    f"{line.strip()!r}"
                )
            iso, shown = parse_date(m.group(1), f"{name}: log date")
            items += (
                f'<li class="tp-log-item"><time class="tp-log-date" '
                f'datetime="{iso}">{shown}</time><span '
                f'class="tp-log-text">{inline(m.group(2))}</span></li>'
            )
            n += words(m.group(2))
        if not items:
            raise ContentError(f"{name}: ## log has no entries")
        return [(f'<ol class="tp-log">{items}</ol>', n, "text")]

    def caption(self, text: str) -> str:
        self.figures += 1
        return f'<figcaption class="tp-caption">fig. {self.figures} · {inline(text)}</figcaption>'

    @staticmethod
    def given_caption(text: str) -> str:
        """A caption written in full by the draft, numbering included."""
        return f'<figcaption class="tp-caption">{inline(text)}</figcaption>' if text else ""

    def marker(self, group: list[str]) -> tuple[str, int, str]:
        name = self.meta["source"].name
        head = MARKER.match(group[0])
        kind, arg = head.group(1), head.group(2).strip()
        if kind not in MARKER_BLOCKS:
            where = (
                "must follow a component marker"
                if kind in MARKER_FIELDS
                else "is not a known marker"
            )
            raise ContentError(f"{name}: {kind}: {where}")
        rows, fields = [], {}
        for l in group[1:]:
            m = MARKER.match(l)
            if m and m.group(1) in MARKER_FIELDS:
                if m.group(1) in fields:
                    raise ContentError(f"{name}: two {m.group(1)}: lines in one {kind}: block")
                fields[m.group(1)] = m.group(2).strip()
            elif m and m.group(1) in MARKER_BLOCKS:
                raise ContentError(f"{name}: {m.group(1)}: needs a blank line before it")
            elif kind != "EXCERPT" and fields:
                raise ContentError(f"{name}: {kind}: has text after its {', '.join(fields)} line")
            else:
                rows.append(l)
        allowed = {
            "EXCERPT": {"CAPTION"},
            "FIGURE": {"CAPTION", "ALT", "OVERLAY"},
            "AUDIO-PAIR": {"CAPTION"},
            "DEMO": {"BEHAVIOUR", "DEMO-CAPTION", "ATTRIBUTION"},
            "AUDIO-GRID": {"BEHAVIOUR", "AUDIO-NOTE", "ATTRIBUTION", "CAPTION"},
        }.get(kind, set())
        extra = set(fields) - allowed
        if extra:
            raise ContentError(f"{name}: {kind}: does not take {', '.join(sorted(extra))}:")
        cells = [[c.strip() for c in r.split("|")] for r in rows]
        cap = self.given_caption(fields.get("CAPTION"))
        notes = "".join(
            f'<p class="tp-{cls}">{inline(fields[f])}</p>'
            for f, cls in (("AUDIO-NOTE", "note"), ("ATTRIBUTION", "attribution"))
            if fields.get(f)
        )

        def need(ok: bool, what: str) -> None:
            if not ok:
                raise ContentError(f"{name}: {kind}: {what}")

        if kind == "STEPS":
            items = ""
            for c in cells:
                m = re.match(r"(\d+)\.\s+(.*)$", c[0])
                need(m and len(c) == 2, "rows are 'N. title | text'")
                items += (
                    f'<div class="tp-step"><div class="tp-step-no">step {m.group(1)}</div>'
                    f'<div class="tp-step-title">{inline(m.group(2))}</div><div '
                    f'class="tp-step-text">{inline(c[1])}</div></div>'
                )
            return (
                f'<div class="tp-steps">{items}</div>',
                sum(words(" ".join(c)) for c in cells),
                "text",
            )

        if kind == "STATS":
            need(cells and all(2 <= len(c) <= 3 for c in cells), "rows are 'value | label | note'")
            return (
                stat_row([(c[0], c[1], c[2] if len(c) > 2 else "") for c in cells]),
                sum(words(" ".join(c)) for c in cells),
                "text",
            )

        if kind == "BUILT-WITH":
            # "Built with": a two-column grid, 'label | text [| https://link]' per row, the labels
            # fixed and in BUILT_WITH_ROWS order (code, languages and frameworks, data, compute,
            # papers, attribution, made with), each at most once; rows not given are left out.
            need(
                cells and all(2 <= len(c) <= 3 and c[0] in BUILT_WITH_ROWS and c[1] for c in cells),
                "rows are 'label | text [| https://link]' with a label among "
                + ", ".join(BUILT_WITH_ROWS),
            )
            need(len({c[0] for c in cells}) == len(cells), "has a label twice")
            need(
                all(len(c) < 3 or re.fullmatch(r"https://\S+", c[2]) for c in cells),
                "a link is https://",
            )
            order = {l: i for i, l in enumerate(BUILT_WITH_ROWS)}
            items = ""
            for c in sorted(cells, key=lambda c: order[c[0]]):
                text = (
                    f'<a href="{esc(c[2])}"{new_tab(c[2])}>{inline_text(c[1])}</a>'
                    if len(c) > 2
                    else inline(c[1])
                )
                items += (
                    f'<div class="tp-built-row '
                    f'tp-built-row--{slugify(c[0])}"><dt>{esc(c[0])}</dt><dd>{text}</dd></div>'
                )
            return (
                f'<dl class="tp-built">{items}</dl>',
                sum(words(" ".join(c[:2])) for c in cells),
                "text",
            )

        if kind == "LINKS":
            # A short list of labelled links, e.g. under the credits: 'label | https://...' per row.
            need(
                cells
                and all(len(c) == 2 and c[0] and re.fullmatch(r"https://\S+", c[1]) for c in cells),
                "rows are 'label | https://...'",
            )
            items = "".join(
                f'<li><a href="{esc(c[1])}"{new_tab(c[1])}>{inline_text(c[0])} →</a></li>'
                for c in cells
            )
            return (f'<ul class="tp-links">{items}</ul>', sum(words(c[0]) for c in cells), "text")

        if kind == "PAPERS":
            # Papers this builds on: 'arXiv id | authors | year | title [| note]' per row, the title
            # and authors as the arXiv abstract page gives them; the id links to the abstract. The
            # block sits in the "built with" section and is drawn as that grid's "papers" row.
            need(
                cells
                and all(
                    4 <= len(c) <= 5
                    and re.fullmatch(r"\d{4}\.\d{4,5}", c[0])
                    and c[1]
                    and re.fullmatch(r"\d{4}", c[2])
                    and c[3]
                    for c in cells
                ),
                "rows are 'arXiv id | authors | year | title [| note]'",
            )
            items = ""
            for c in cells:
                url = f"https://arxiv.org/abs/{c[0]}"
                note = (
                    f' <span class="tp-paper-note">{inline(c[4])}</span>'
                    if len(c) > 4 and c[4]
                    else ""
                )
                items += (
                    f"<li>{inline(c[1])} ({esc(c[2])}). <cite>{inline(c[3])}</cite>. "
                    f'<a href="{url}"{new_tab(url)}>arXiv:{esc(c[0])}</a>.{note}</li>'
                )
            return (
                f'<ul class="tp-papers-list">{items}</ul>',
                sum(words(" ".join(c)) for c in cells),
                "papers",
            )

        if kind == "TABLE":
            need(
                len(cells) >= 2 and len({len(c) for c in cells}) == 1,
                "needs a header row and rows with the same number of cells",
            )
            head_html = "".join(f'<th scope="col">{inline(c)}</th>' for c in cells[0])
            numeric = re.compile(r"^[+\u2212-]?[\d,]+(\.\d+)?%?$")

            def cell(h: str, x: str) -> str:
                num_class = ' class="num"' if numeric.match(x.strip()) else ""
                return f'<td data-label="{esc(h)}"{num_class}>{inline(x)}</td>'

            body_html = "".join(
                "<tr>"
                + f'<th scope="row">{inline(c[0])}</th>'
                + "".join(cell(h, x) for h, x in zip(cells[0][1:], c[1:]))
                + "</tr>"
                for c in cells[1:]
            )
            return (
                f'<div class="table table--stack" role="region" aria-label="Table: '
                f'{esc(" · ".join(cells[0]))}">'
                f"<table><thead><tr>{head_html}</tr></thead>"
                f"<tbody>{body_html}</tbody></table></div>",
                sum(words(" ".join(c)) for c in cells),
                "figure",
            )

        if kind == "EXCERPT":
            need(rows, "has no lines")
            text = "\n".join(rows)
            return (
                f'<figure class="tp-figure"><pre class="tp-code" '
                f'tabindex="0">{esc(text)}</pre>{cap}</figure>',
                words(text) // 2,
                "figure",
            )

        if kind == "FIGURE":
            need(arg.endswith(".svg") and cap, "needs an .svg path and a CAPTION: line")
            svg = self.asset(arg, inline_svg=True)  # checked as a plain SVG; published as a file
            # The text alternative is the SVG's <title>, or an ALT: line for a file without one.
            title = re.search(r"<title[^>]*>(.*?)</title>", svg, re.S)
            need(
                title or fields.get("ALT"),
                f"{arg} has no <title>; give its text alternative on an ALT: line",
            )
            alt = fields.get("ALT") or html.unescape(title.group(1).strip())
            size = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
            dims = f' width="{size.group(1)}" height="{size.group(2)}"' if size else ""
            chart = (
                f'<div class="tp-chart" tabindex="0" role="region" aria-label="Figure: {esc(alt)}">'
            )
            if fields.get("OVERLAY"):
                # OVERLAY: another SVG whose contents are drawn on top of this one, for a
                # correction to a label in a figure file that is not edited. The figure is
                # then inlined (not published as a file) so the overlay's style can hide the
                # original label; the overlay's own <style> and shapes go in after it.
                over = self.asset(fields["OVERLAY"], inline_svg=True, copy=False)
                inner = re.search(r"<svg[^>]*>(.*)</svg>", over, re.S)
                need(inner, f"{fields['OVERLAY']} is not an SVG")
                body = re.sub(
                    r"\s(width|height)=\"[^\"]*\"", "", svg[: svg.index(">") + 1], count=2
                )
                body = re.sub(
                    r"^<svg",
                    f'<svg class="tp-chart-svg" role="img" aria-label="{esc(alt)}" '
                    f'focusable="false"',
                    body,
                    count=1,
                )
                svg = (
                    body
                    + svg[svg.index(">") + 1 : svg.rindex("</svg>")]
                    + inner.group(1)
                    + "</svg>"
                )
                return (f'<figure class="tp-figure">{chart}{svg}</div>{cap}</figure>', 0, "figure")
            src = self.asset(arg)
            return (
                f'<figure class="tp-figure">{chart}'
                f'<img src="{esc(src)}" alt="{esc(alt)}"{dims} '
                f'decoding="async"></div>{cap}</figure>',
                0,
                "figure",
            )

        if kind == "DEMO":
            files = arg.split()
            need(
                files and all(f.endswith(".json") for f in files) and not rows,
                "needs one or more .json paths and nothing else on its lines",
            )
            data = self.asset(files[0])
            more = " ".join(self.asset(f) for f in files[1:])
            self.scripts.append(self.asset("demo.js"))
            if (self.meta["assets"] / "demo.css").is_file():
                self.styles.append(self.asset("demo.css"))
            dcap = (
                f'<figcaption class="tp-caption">{inline(fields["DEMO-CAPTION"])}</figcaption>'
                if fields.get("DEMO-CAPTION")
                else ""
            )
            return (
                f'<figure class="tp-figure"><div class="tp-demo" data-src="{esc(data)}"'
                + (f' data-more="{esc(more)}"' if more else "")
                + ' aria-live="polite">'
                f'<p class="tp-demo-fallback">This demo needs '
                f"JavaScript.</p></div>{dcap}{notes}</figure>",
                0,
                "figure",
            )

        if kind == "AUDIO-PAIR":
            need(cells and all(2 <= len(c) <= 3 for c in cells), "rows are 'file | label | tags'")
            manifest = self.audio_manifest(cells[0][0])
            clips = ""
            for c in cells:
                f, label = self.asset(c[0]), c[1]
                tags = [t.strip() for t in c[2].split(",")] if len(c) > 2 and c[2] else []
                bad = set(tags) - {"synthetic", "failed to stop"}
                need(not bad, f"unknown tag {', '.join(bad)}")
                if manifest is not None:
                    entry = manifest.get(Path(f).name)
                    need(entry is not None, f"{f} is not in the audio manifest")
                    need(
                        ("synthetic" in tags) == (entry["system"] != "ground_truth")
                        and ("failed to stop" in tags) == bool(entry.get("stop_failure")),
                        f"the tags for {f} disagree with the audio manifest",
                    )
                clips += self.clip(f, label, tags, label)
            return (
                f'<figure class="tp-figure"><div '
                f'class="tp-clips">{clips}</div>{cap}{notes}</figure>',
                0,
                "figure",
            )

        if kind == "AUDIO-GRID":
            need(arg.endswith(".json") and not rows, "needs the manifest's path")
            return (self.audio_grid(arg, cap, notes), 0, "figure")

        raise ContentError(
            f"{name}: {kind}: has no renderer"
        )  # unreachable: MARKER_BLOCKS is complete

    def clip(self, f: dict, label: str, tags: str, aria: str) -> str:
        kinds = "".join(
            f'<span class="tp-clip-kind">{esc(t)}</span>'
            if t == "synthetic"
            else f'<span class="tp-tag">{esc(t)}</span>'
            for t in tags
        )
        return (
            f'<div class="tp-clip"><div class="tp-clip-label">{inline(label)}</div>'
            + (f'<div class="tp-clip-tags">{kinds}</div>' if kinds else "")
            + f'<audio controls preload="none" src="{esc(f)}" '
            f'aria-label="{esc(", ".join([aria] + tags))}"></audio></div>'
        )

    def audio_manifest(self, any_clip: bool) -> dict[str, dict] | None:
        """{file name: clip} from manifest.json next to the clips, if there is one. Only the
        fields the page needs are read; the manifest itself is never published."""
        import json

        path = (
            self.meta["assets"]
            / Path(
                any_clip.split("/", 1)[1]
                if any_clip.startswith(self.meta["slug"] + "/")
                else any_clip
            ).parent
            / "manifest.json"
        )
        if not path.is_file():
            return None
        return {c["file"]: c for c in json.loads(path.read_text(encoding="utf-8"))["clips"]}

    def audio_grid(self, arg: str, cap: str, notes: list[str]) -> str:
        """Sentences as rows, systems as columns. Column labels come from grid-columns.txt
        next to the manifest: 'system | label | real or synthetic' per line, in order."""
        import json

        name = self.meta["source"].name
        rel = self.asset(arg, copy=False)
        folder = Path(rel).parent
        manifest = json.loads((self.meta["assets"] / rel).read_text(encoding="utf-8"))
        cols_path = self.meta["assets"] / folder / "grid-columns.txt"
        if not cols_path.is_file():
            raise ContentError(f"{name}: AUDIO-GRID: needs {cols_path.relative_to(ROOT)}")
        cols = [
            [x.strip() for x in l.split("|")]
            for l in cols_path.read_text(encoding="utf-8").splitlines()
            if l.strip()
        ]
        if not all(len(c) == 3 and c[2] in ("real", "synthetic") for c in cols):
            raise ContentError(
                f"{name}: grid-columns.txt lines are 'system | label | real or synthetic'"
            )
        by = {(c["sentence"], c["system"]): c for c in manifest["clips"]}
        sentences = sorted({c["sentence"] for c in manifest["clips"]})
        head = '<th scope="col"><span class="sr-only">Sentence</span></th>' + "".join(
            f'<th scope="col">{esc(c[1])}</th>' for c in cols
        )
        body = ""
        for n in sentences:
            tds = ""
            for system, label, kind in cols:
                c = by.get((n, system))
                if not c:
                    raise ContentError(
                        f"{name}: the manifest has no clip for sentence {n}, {system}"
                    )
                tags = (["synthetic"] if kind == "synthetic" else []) + (
                    ["failed to stop"] if c.get("stop_failure") else []
                )
                f = self.asset(str(folder / c["file"]))
                kinds = "".join(
                    f'<span class="tp-clip-kind">{esc(t)}</span>'
                    if t == "synthetic"
                    else f'<span class="tp-tag">{esc(t)}</span>'
                    for t in tags
                )
                tds += (
                    f'<td><span class="tp-grid-col" aria-hidden="true">{esc(label)}</span>'
                    f'<audio controls preload="none" src="{esc(f)}" '
                    f'aria-label="{esc(", ".join([f"Sentence {n}", label] + tags))}"></audio>'
                    + (f'<span class="tp-clip-tags">{kinds}</span>' if kinds else "")
                    + "</td>"
                )
            body += f'<tr data-sentence="{n}"><th scope="row">sentence {n}</th>{tds}</tr>'
        grid = (
            f'<div class="tp-grid" role="region" aria-label="Every clip, by sentence" tabindex="0">'
            f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>"
        )
        return (
            f'<figure class="tp-figure tp-figure--wide tp-figure--grid">{grid}{cap}{notes}</figure>'
        )

    def component(self, head: str, body: list[str]) -> tuple[str, int, str]:
        name, _, args = head.partition(" ")
        fields, rows = {}, []
        for l in body:
            m = re.match(r"(caption|description|alt):\s*(.*)$", l)
            if m and name != "code":
                fields.setdefault(m.group(1), []).append(m.group(2))
            elif name == "code" and l.startswith("caption:"):
                fields["caption"] = [l[8:].strip()]
            elif l.strip() or name == "code":
                rows.append(l)
        cap = " ".join(fields.get("caption", [])) or None
        cells = [[c.strip() for c in r.split("|")] for r in rows]

        if name == "figure":
            files = args.split()
            if not files or not cap or not fields.get("alt"):
                raise ContentError("::: figure needs a file, a caption: and an alt: line")
            alt = " ".join(fields["alt"])
            svgs = []
            for k, f in enumerate(files):
                svg = self.asset(f, inline_svg=True)
                cls = (
                    ("tp-svg tp-svg--wide" if k == 0 else "tp-svg tp-svg--narrow")
                    if len(files) > 1
                    else "tp-svg tp-svg--single"
                )
                svg = re.sub(
                    r"^<svg",
                    f'<svg class="{cls}" role="img" aria-label="{esc(alt)}" focusable="false"',
                    svg,
                    count=1,
                )
                svgs.append(svg)
            desc = fields.get("description")
            details = ""
            if desc:
                lis = "".join(f"<li>{inline(d)}</li>" for d in desc)
                # The text alternative stays in the DOM for screen readers, visually hidden, with no
                # control.
                details = (
                    f'<div class="tp-text-alt sr-only"><p>The diagram as '
                    f"text</p><ol>{lis}</ol></div>"
                )
            return (
                f'<figure class="tp-figure">{"".join(svgs)}{self.caption(cap)}{details}</figure>',
                0,
                "figure",
            )

        if name == "code":
            text = "\n".join(rows).strip("\n")
            figure = f'<pre class="tp-code" tabindex="0">{esc(text)}</pre>'
            return (
                f'<figure class="tp-figure">{figure}{self.caption(cap) if cap else ""}</figure>',
                words(text) // 2,
                "figure",
            )

        if name == "stats":
            return (
                stat_row([(c[1], c[0], c[2] if len(c) > 2 else "") for c in cells]),
                sum(words(" ".join(c)) for c in cells),
                "text",
            )

        if name == "bars":
            if not args:
                raise ContentError("::: bars needs a title")
            vals = []
            for c in cells:
                try:
                    vals.append(float(c[1]))
                except (IndexError, ValueError):
                    raise ContentError(f"::: bars row {c!r} needs label | number")
            top = max(vals + [0]) or 1
            rows_html = "".join(
                f'<div class="bar{" bar--neg" if len(c) > 2 and c[2] == "orange" else ""}"><span '
                f'class="bar-label">{inline(c[0])}</span>'
                f'<span class="bar-track"><span class="bar-fill" '
                f'style="width:{v / top * 100:.1f}%"></span></span>'
                f'<span class="bar-value">{esc(c[1])}</span></div>'
                for c, v in zip(cells, vals)
            )
            summary = "; ".join(f"{c[0]} {c[1]}" for c in cells)
            return (
                f'<figure class="tp-figure chart chart--card"><div '
                f'class="chart-title">{inline(args)}</div>'
                f'<div class="bars bars--track" role="img" aria-label="{esc(args)}: '
                f'{esc(summary)}">{rows_html}</div>'
                f"{self.caption(cap) if cap else ''}</figure>",
                words(args),
                "figure",
            )

        if name == "steps":
            items = "".join(
                f'<div class="tp-step"><div class="tp-step-no">{inline(c[0])}</div>'
                f'<div class="tp-step-title">{inline(c[1])}</div><div '
                f'class="tp-step-text">{inline(c[2])}</div></div>'
                for c in cells
            )
            return (
                f'<div class="tp-steps">{items}</div>',
                sum(words(" ".join(c)) for c in cells),
                "text",
            )

        if name == "audio":
            if len(cells) != 2 or not cap:
                raise ContentError(
                    "::: audio needs exactly two clips (real, synthetic) and a caption:"
                )
            clips = ""
            for c in cells:
                kind, label, f = c[0], c[1], self.asset(c[2])
                if kind not in ("real", "synthetic"):
                    raise ContentError("::: audio rows start with real or synthetic")
                clips += (
                    f'<div class="tp-clip"><div class="tp-clip-kind">{esc(kind)}</div>'
                    f'<div class="tp-clip-label">{inline(label)}</div>'
                    f'<audio controls preload="none" src="{esc(f)}" aria-label="{esc(kind)}: '
                    f'{esc(label)}"></audio></div>'
                )
            return (
                f'<figure class="tp-figure"><div '
                f'class="tp-clips">{clips}</div>{self.caption(cap)}</figure>',
                0,
                "figure",
            )

        if name == "demo":
            files = args.split()
            if len(files) != 2 or not files[0].endswith(".json") or not files[1].endswith(".js"):
                raise ContentError("::: demo needs a .json and a .js file")
            data, script = self.asset(files[0]), self.asset(files[1])
            self.scripts.append(script)
            fallback = " ".join(inline(r) for r in rows) or "This demo needs JavaScript."
            return (
                f'<figure class="tp-figure"><div class="tp-demo" data-src="{esc(data)}"><p '
                f'class="tp-demo-fallback">{fallback}</p></div>'
                f"{self.caption(cap) if cap else ''}</figure>",
                0,
                "figure",
            )

        raise ContentError(f"unknown component ::: {name}")


# ---------- the tracklist on the main page ----------


def read_tracklist(index_html: str) -> list[tuple[int, str, str, str]]:
    """[(number, title, side_label, side_id)] in page order: sides A to C, then side D's panels."""
    tracks, side, side_id = [], None, None
    pat = re.compile(
        r'<(?:h2 class="side-label"|p class="lately-label") '
        r'id="(\w+)-label">([^<]+)</(?:h2|p)>|<span class="track-no">(\d\d)</span>\s*'
        r'<div class="track-body"><h3 class="track-title"(?: id="[^"]*")?>(.*?)</h3>'
    )
    for m in pat.finditer(index_html):
        if m.group(1):
            side_id, side = m.group(1), html.unescape(m.group(2))
        elif side:
            tracks.append(
                (m.group(3), html.unescape(re.sub(r"<[^>]+>", "", m.group(4))), side, side_id)
            )
    return tracks


def find_close(s: str, start: int, tag: str) -> int:
    """Index just past the tag that closes the element opening at `start`."""
    depth, pat = 0, re.compile(rf"<(/?){tag}\b[^>]*>")
    for m in pat.finditer(s, start):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.end()
    raise ContentError(f"unclosed <{tag}> in index.html")


# A row's secondary external link (e.g. "github →"), shown while it has no ready page.
EXT_LINK = re.compile(
    r'<span class="track-ext"><a href="([^"]+)" target="_blank" rel="noopener">([^<]+)</a></span>'
)


def ext_link(href: str, label: str) -> str:
    return (
        f'<span class="track-ext"><a href="{href}" target="_blank" '
        f'rel="noopener">{label}</a></span>'
    )


def link_rows(index_html: str, pages: dict[int, str]) -> str:
    """Makes each track row whose page is built ({number: slug}) one link to that page:
    number, title, description and status together. A row's secondary external link
    (span.track-ext, inside the track body) can't sit inside that link, so it is kept in
    data attributes while the row is linked and put back when it isn't. Rows without a
    page are plain. Idempotent: it first undoes its own earlier changes (data-page)."""
    s = index_html
    while True:
        m = re.search(r'<a class="(track[^"]*)" href="[^"]*" data-page="[^"]*"([^>]*)>', s)
        if not m:
            break
        end = find_close(s, m.start(), "a")
        inner = s[m.end() : end - len("</a>")]
        ext = dict(re.findall(r'data-ext-(href|label)="([^"]*)"', m.group(2)))
        if ext:
            inner = inner.replace("</div>", ext_link(ext["href"], ext["label"]) + "</div>", 1)
        inner = re.sub(
            r'<span class="track-part-link" data-href="([^"]+)">([^<]+)</span>',
            r'<a class="track-part-link" href="\1">\2</a>',
            inner,
        )
        kept = re.search(r' id="[^"]*"', m.group(2))  # a row's own anchor stays with it
        s = (
            s[: m.start()]
            + f'<div class="{m.group(1)}"{kept.group(0) if kept else ""}>'
            + inner
            + "</div>"
            + s[end:]
        )

    for number, slug in pages.items():
        m = re.search(
            rf'<(div|a) class="(track[^"]*)"([^>]*)>\s*<span class="track-no">{number}</span>', s
        )
        if not m:
            raise ContentError(f"track {number} is not on the main page")
        attrs = m.group(3).strip()  # only an id (the row's anchor) may sit beside the class
        if m.group(1) != "div" or (attrs and not re.fullmatch(r'id="[^"]+"', attrs)):
            raise ContentError(
                f'track {number}\'s row on the main page must be a plain <div class="track ..."> '
                "(an external link goes in a span.track-ext inside it, or on the track page)"
            )
        end = find_close(s, m.start(), "div")
        inner = s[s.index(">", m.start()) + 1 : end - len("</div>")]
        extra = ""
        e = EXT_LINK.search(inner)
        if e:
            extra = f' data-ext-href="{e.group(1)}" data-ext-label="{e.group(2)}"'
            inner = inner[: e.start()] + inner[e.end() :]
        # A two-part row's "continues in 11 →" link can't sit inside the row's link: it is text
        # (with its target kept) while the row is linked, and a link again when it isn't.
        inner = re.sub(
            r'<a class="track-part-link" href="([^"]+)">([^<]+)</a>',
            r'<span class="track-part-link" data-href="\1">\2</span>',
            inner,
        )
        if "<a " in inner:
            raise ContentError(
                f"track {number}'s row has a link other than its span.track-ext; a linked row "
                f"can't hold one"
            )
        s = (
            s[: m.start()] + f'<a class="{m.group(2)}" href="tracks/{slug}/" '
            f'data-page="{slug}"{extra}{" " + attrs if attrs else ""}>' + inner + "</a>" + s[end:]
        )
    return s


def when_rows(
    index_html: str, metas: list[dict], tracklist: list[tuple[int, str, str, str]]
) -> str:
    """Writes each side B or C track's months (when:) onto its row on the main page, as
    span.track-when right after the title. Idempotent: an existing span is replaced; a row
    whose content file is not here (a draft on another machine) keeps the span it has.
    Rows on other sides are left alone."""
    s = index_html
    sides = {t[0]: t[3] for t in tracklist}
    for m in metas:
        if not m.get("when") or sides.get(m["track"]) not in ("research", "projects"):
            continue
        pat = re.compile(
            rf'(<span class="track-no">{m["track"]}</span>\s*<div class="track-body"><h3 '
            rf'class="track-title"[^>]*>.*?</h3>)(<span class="track-when">[^<]*</span>)?'
        )
        if not pat.search(s):
            raise ContentError(f"track {m['track']} is not on the main page")
        s = pat.sub(
            lambda mm: mm.group(1) + f'<span class="track-when">{esc(m["when"])}</span>', s, count=1
        )
    return s


# ---------- text read from a track's results file ----------
# A main-page row (span.track-live with data-template) or a page with "live:" in its front
# matter fills {field:kind} placeholders from a JSON results file at build time, so that
# regenerating the file before a build updates the text.

LIVE = re.compile(
    r'<span class="track-live" data-src="([^"]+)" data-template="([^"]*)">[^<]*</span>'
)
PLACEHOLDER = re.compile(
    r"\{(\w+):(count|matched|ratio|unchecked|matched_count|unchecked_count|total|voided|"
    r"ratio_all|asof|asofnote|date)\}"
)
COUNT_KINDS = (
    "count",
    "matched",
    "ratio",
    "unchecked",
    "matched_count",
    "unchecked_count",
    "total",
    "voided",
    "ratio_all",
)  # need the list; without it the sentence goes


def entries(data: dict, field: str) -> list[dict] | None:
    """Every entry of a list, voided ones included. None without the list."""
    value = data.get(field)
    return [x for x in value if isinstance(x, dict)] if isinstance(value, list) else None


def counted(data: dict, field: str) -> list[dict] | None:
    """The entries of a list that count: not voided and, when the file has a clock_start,
    dated on or after it (its equity_base_snapshot, else its first_fill). None without the list."""
    value = entries(data, field)
    if value is None:
        return None
    clock = data.get("clock_start") if isinstance(data.get("clock_start"), dict) else {}
    since = clock.get("equity_base_snapshot") or clock.get("first_fill")
    return [
        x
        for x in value
        if not x.get("voided") and not (since and str(x.get("date", "")) < str(since))
    ]


def live_value(data: dict, field: str, kind: str) -> str | None:
    """One placeholder's text, or None when the field is missing.
    count: how many entries count. matched: "all 26" when every counted entry's match is
    true, else "25 of 26" (true ones of counted). ratio: always "25 of 26".
    unchecked: ", 1 not yet checked" for entries whose match is null, else "".
    matched_count and unchecked_count: those numbers alone. total: every entry, voided ones
    included; voided: how many are voided; ratio_all: "28 of 29", matched of every entry.
    asof: a YYYY-MM-DD date as the clause "as of 12 October 2026, "; asofnote: "as of 12 October
    2026" with no punctuation, for a cell that may be left empty; date: the date alone."""
    if kind in COUNT_KINDS:
        items = counted(data, field)
        if items is None:
            return None
        n, ok = len(items), sum(1 for x in items if x.get("match") is True)
        unchecked = sum(1 for x in items if x.get("match") is None)
        every = entries(data, field)
        if kind == "count":
            return f"{n:,}"
        if kind == "matched":
            return f"all {n:,}" if ok == n else f"{ok:,} of {n:,}"
        if kind == "ratio":
            return f"{ok:,} of {n:,}"
        if kind == "matched_count":
            return f"{ok:,}"
        if kind == "unchecked_count":
            return f"{unchecked:,}"
        if kind == "total":
            return f"{len(every):,}"
        if kind == "voided":
            return f"{sum(1 for x in every if x.get('voided')):,}"
        if kind == "ratio_all":
            return f"{sum(1 for x in every if x.get('match') is True):,} of {len(every):,}"
        return f", {unchecked:,} not yet checked" if unchecked else ""
    d = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(data.get(field) or ""))
    if not (d and 1 <= int(d.group(2)) <= 12):
        return None
    text = f"{int(d.group(3))} {MONTHS_LONG[int(d.group(2)) - 1]} {int(d.group(1))}"
    return f"as of {text}, " if kind == "asof" else f"as of {text}" if kind == "asofnote" else text


def live_data(path: Path, what: str) -> dict | None:
    """The results file as a dict, or None with a warning."""
    if not path.is_file():
        print(f"warning: {what} is missing; its live text is left out", file=sys.stderr)
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("not an object")
        return data
    except ValueError as e:
        print(f"warning: {what} is unreadable ({e}); its live text is left out", file=sys.stderr)
        return None


def fill_template(template: str, data: dict) -> tuple[str | None, list[str]]:
    """(text, missing fields): the template with its placeholders filled; text is None when a
    count placeholder's list is missing (the whole sentence goes), and a missing date leaves
    its clause out."""
    text, missing = template, []
    for field, kind in PLACEHOLDER.findall(template):
        value = live_value(data, field, kind)
        if value is None:
            missing.append(field)
            if kind in COUNT_KINDS:
                return None, missing
        text = text.replace("{" + field + ":" + kind + "}", value or "")
    return text, missing


def fill_live(index_html: str, content: Path | None = None) -> str:
    """The main page's live rows: data-src is a path under content/tracks or content/drafts,
    the template stays in the attribute, and the rendered sentence is the span's text."""
    content = content or ROOT / "content"

    def fill(m: re.Match[str]) -> str:
        src, template = m.group(1), html.unescape(m.group(2))
        path = next(
            (content / f / src for f in ("tracks", "drafts") if (content / f / src).is_file()), None
        )
        data = (
            live_data(path or content / "tracks" / src, src)
            if path
            else live_data(
                content / "tracks" / src, f"{src} (under content/tracks or content/drafts)"
            )
        )
        text = ""
        if data is not None:
            text, missing = fill_template(template, data)
            if missing:
                print(
                    f"warning: {src} has no {', '.join(missing)}; "
                    + ("the sentence" if text is None else "that clause")
                    + " is left out",
                    file=sys.stderr,
                )
            text = text or ""
        return (
            f'<span class="track-live" data-src="{src}" '
            f'data-template="{m.group(2)}">{esc(text)}</span>'
        )

    return LIVE.sub(fill, index_html)


def fill_live_lines(body: str, path: Path, name: str) -> str:
    """A page's body with its placeholders filled from the page's results file (front matter
    "live:", a file in the asset folder). A line whose count placeholder cannot be filled is
    dropped; a missing date leaves its text out."""
    data = live_data(path, f"{name}: live file {path.name}")
    out = []
    for line in body.split("\n"):
        if not PLACEHOLDER.search(line):
            out.append(line)
            continue
        text, missing = (None, []) if data is None else fill_template(line, data)
        if missing:
            print(
                f"warning: {name}: {path.name} has no {', '.join(missing)}; "
                + ("a line" if text is None else "that text")
                + " is left out",
                file=sys.stderr,
            )
        if text is not None:
            out.append(text)
    return "\n".join(out)


def check_live_data() -> None:
    """The Lately data file must exist for a build (a deploy can't go out without it); one
    that is present but unreadable only warns, and the site then shows "Lately is being
    updated."."""
    live = ROOT / LIVE_DATA
    if not live.is_file():
        raise ContentError(
            f"{LIVE_DATA} is missing; the site is not built without it "
            "(the publish workflow commits it with git add -f; it is never written by hand)"
        )
    try:
        d = json.loads(live.read_text(encoding="utf-8"))
        if not (
            isinstance(d, dict)
            and d.get("schema_version") == 1
            and isinstance(d.get("sources"), dict)
        ):
            raise ValueError("not schema_version 1 with a sources object")
    except ValueError as e:
        print(
            f"warning: {LIVE_DATA} is unreadable ({e}); the Lately section and pages will show "
            f"'Lately is being updated.'",
            file=sys.stderr,
        )


# ---------- page output ----------


def clock(seconds: int) -> str:
    seconds = int(round(seconds / 10.0) * 10)
    return f"{seconds // 60}:{seconds % 60:02d}"


def side_for(tracklist: list[tuple[int, str, str, str]], letter: str) -> tuple[str, str]:
    """(side label, side id) for a draft's "side: c", for tracks not on the main page yet."""
    for _, _, label, side_id in tracklist:
        if label.lower().startswith(f"side {letter.lower()}."):
            return label, side_id
    raise ContentError(f"no side {letter!r} on the main page")


def render(
    meta: dict,
    tracklist: list[tuple[int, str, str, str]],
    pages_here: dict[int, dict],
    drafts_build: bool,
    listed: int,
) -> tuple[str, list[tuple[Path, str]]]:
    page = Page(meta)
    home = "../../"
    album = meta["register"] == "album"
    progress = meta["register"] == "progress"
    data = meta["register"] == "data"  # a Lately page: its statistics are drawn in the browser
    stamped = (
        album or progress or data
    )  # reading-time stamps and the clock (data: filled in the browser)
    num = meta["track"]
    by_no = {t[0]: t for t in tracklist}
    if num not in by_no:
        raise ContentError(f"track {num} is not on the main page")
    _, _, side_label, side_id = by_no[num]
    on_list = num in {t[0] for t in tracklist[:listed]}
    side_short = side_label.split(",")[0]
    # Sides B and C carry their months (when:) under the title on the card and in the kicker.
    if side_id in ("research", "projects") and not meta.get("when"):
        raise ContentError(
            f"{meta['source'].name}: a side B or C page needs when: (its months, e.g. 'aug 2026 to "
            f"present')"
        )
    when = (
        f' · <span class="track-when">{esc(meta["when"])}</span>'
        if meta.get("when") and side_id in ("research", "projects")
        else ""
    )

    # Links to other track pages follow the previous/next rule below: a ready page links
    # only ready pages, so it builds the same with or without --drafts; a draft, in a
    # --drafts build, links any page built with it.
    def linkable_page(m: re.Match[str]) -> bool:
        return m["ready"] or not meta["ready"]

    TRACK_LINKS.clear()
    TRACK_LINKS.update({n: href_to(meta, m) for n, m in pages_here.items() if linkable_page(m)})

    # sections, their reading time, and the blocks the play control pauses at
    sections, t = [], 0.0
    for s in data_sections(meta) if data else meta["sections"]:
        if data:
            blocks = s["blocks"]  # slots the browser fills; their reading time is measured there
        elif progress and s["title"] == "log":
            blocks = page.log(s["lines"])
        else:
            blocks = page.blocks(s["lines"], first=s is meta["sections"][0] and not progress)
            blocks = built_with_grid(blocks, s["title"], meta["source"].name)
        timed = []
        for b, w, kind in blocks:
            secs = w / WPM * 60 + (FIGURE_SECS if kind == "figure" else 0)
            attrs = f' data-secs="{secs:.2f}"' + (" data-pause" if kind == "figure" else "")
            timed.append((re.sub(r"^<(\w+)", lambda m: f"<{m.group(1)}{attrs}", b, count=1), secs))
        secs = sum(x for _, x in timed)
        sections.append(dict(s, blocks=timed, start=t, secs=secs))
        t += secs
    total = t
    if meta["ready"] and page.held:
        raise ContentError(
            f"{meta['source'].name}: ready: true but {page.held} HELD: note(s) remain; "
            "held content needs a collaborator's agreement before it is published"
        )

    seg_html, sec_html = [], []
    for k, s in enumerate(sections):
        # Data pages: the times are measured in the browser once the statistics are drawn.
        stamp = (
            f'<span class="tp-seg-time">{"" if data else clock(s["start"])}</span>'
            if stamped
            else ""
        )
        grow = max(1, round(s["secs"] / 20))
        seg_name = s.get("short") or s["title"].lower()
        seg_html.append(
            f'<a class="tp-seg" href="#{s["id"]}" style="flex-grow:{grow}" '
            f'data-secs="{s["secs"]:.1f}">'
            f'<span class="tp-seg-fill" aria-hidden="true"></span>{stamp}<span '
            f'class="tp-seg-name">{esc(seg_name)}</span></a>'
        )
        label = (
            '<span class="tp-label-time"></span>'
            if data
            else f"{clock(s['start'])} · "
            if stamped
            else ""
        ) + esc(s["title"].lower())
        if progress and s["title"] == "where it stands":
            iso, shown = meta["as_of_date"]
            label += f' <span class="tp-asof">as of <time datetime="{iso}">{shown}</time></span>'
        # A wide block (the audio grid) takes the section's full width, label column included;
        # anything after it continues in a second body.
        parts, cur = [], []
        for b, _ in s["blocks"]:
            if "tp-figure--wide" in b[:120]:
                if cur:
                    parts.append(
                        f"<div "
                        f'class="tp-section-body{" tp-section-body--after" if parts else ""}">'
                        f"{''.join(cur)}</div>"
                    )
                    cur = []
                parts.append(f'<div class="tp-section-wide">{b}</div>')
            else:
                cur.append(b)
        if cur or not parts:
            parts.append(
                f"<div "
                f'class="tp-section-body{" tp-section-body--after" if parts else ""}">'
                f"{''.join(cur)}</div>"
            )
        body = "".join(parts)
        cls = f"tp-section{' tp-section--first' if k == 0 else ''}" + (
            f" ld-section ld-section--{s['group']}" if data and s.get("group") else ""
        )
        how = (
            (f' data-how="{esc(s["how"][0])}"' + (" data-how-open" if s["how"][1] else ""))
            if data and s.get("how")
            else ""
        )
        sec_html.append(
            f'<section class="{cls}" id="{s["id"]}"{how} aria-labelledby="{s["id"]}-h">'
            f'<h2 class="tp-section-label" id="{s["id"]}-h">{label}</h2>'
            f"{body}</section>"
        )

    # previous and next among pages in this build. Ready pages only ever link ready
    # pages, so they come out the same with or without --drafts.
    linkable = [t for t in tracklist if t[0] in pages_here and linkable_page(pages_here[t[0]])]
    order = [t[0] for t in linkable]
    pos = order.index(num)
    nav = []
    if pos > 0:
        p = by_no[order[pos - 1]]
        nav.append(
            f'<a class="tp-prev" href="{href_to(meta, pages_here[p[0]])}"><span '
            f'class="tp-other-label">← previous · {p[0]}</span>'
            f'<span class="tp-other-title">{esc(p[1])}</span></a>'
        )
    if pos < len(order) - 1:  # the last page (26, lifting) has no next
        n = by_no[order[pos + 1]]
        nav.append(
            f'<a class="tp-next" href="{href_to(meta, pages_here[n[0]])}" data-stop><span '
            f'class="tp-other-label">next · {n[0]} →</span>'
            f'<span class="tp-other-title">{esc(n[1])}</span></a>'
        )

    title = (
        by_no[num][1] if data else meta["title"]
    )  # a Lately page is titled as its panel is ("Fantasy football")
    if progress:
        # one_line: is optional in this register; without it the question's opening paragraph
        # describes the page.
        first = next((l for l in meta["sections"][0]["lines"] if l.strip()), "")
        desc = (
            meta.get("description")
            or meta.get("one_line")
            or re.sub(r"<[^>]+>", "", html.unescape(inline(first.strip())))
        )
    elif data:
        desc = (
            meta.get("one_line")
            or f"{title}: statistics from my {meta['feed']} data, drawn from the same nightly file "
            f"as the Lately section."
        )
    else:
        desc = meta.get("description") or meta["one_line"]
    if data:
        # The one-line description, whose numbers these are, then the headline row and the
        # notes the script shows when the data is missing.
        apps = " and ".join(esc(n) for n, _ in meta["sources"])
        own = (
            f"These are my own numbers, from my {apps} "
            f"{'accounts' if len(meta['sources']) > 1 else 'account'}."
        )
        lede = (
            f'<p class="tp-lede">{inline(meta["one_line"])}</p>\n' if meta.get("one_line") else ""
        ) + f'<p class="ld-own">{own}</p>\n'
        lede += (
            f'<div class="ld-headline" data-feed="{meta["feed"]}" aria-label="Headline '
            f'numbers"></div>\n'
            '<noscript><p class="panel-empty">This page draws its statistics with JavaScript, '
            "which is turned off.</p></noscript>\n"
            '<p class="panel-empty ld-missing" hidden>The statistics are not connected yet.</p>'
        )
    elif progress:
        # A progress page's hero: its one_line (when given), then who it's with, then the link.
        lede = (
            f'<p class="tp-lede">{inline(meta["one_line"])}</p>\n' if meta.get("one_line") else ""
        )
        lede += f'<p class="tp-with">{inline(meta["with"])}</p>'
        if meta.get("link_url"):
            lede += (
                f'\n<p class="tp-link"><a '
                f'href="{esc(meta["link_url"])}"{new_tab(meta["link_url"])}>'
                f"{esc(meta['link_label'])} "
                f"→</a></p>"
            )
    else:
        lede = f'<p class="tp-lede">{inline(meta["one_line"])}</p>'
    # A two-part story: this page's part, and a link to the other part under the same
    # rule as previous and next (a ready page links it only once it is ready too).
    part = ""
    if data:
        # The Lately pages' own nav, in the part line's slot.
        current = ' aria-current="page"'
        others = " · ".join(
            f'<a href="../{f}/"{current if f == meta["feed"] else ""}>{f}</a>' for f in DATA_FEEDS
        )
        part = f'<nav class="tp-part ld-feeds" aria-label="Lately pages">{others}</nav>\n'
    elif meta.get("part_label"):
        # A two-segment bar under the title: part one, part two; this page's segment filled,
        # the other one a link under the same rule as previous and next.
        label = meta["part_label"]
        other_label = "part two" if label == "part one" else "part one"
        href = TRACK_LINKS.get(meta["part_other"])
        mine = (
            f'<span class="tp-part-seg is-current" aria-current="page">{esc(label)} of two</span>'
        )
        theirs = (
            f'<a class="tp-part-seg" href="{href}">{esc(other_label)} of two</a>'
            if href
            else f'<span class="tp-part-seg">{esc(other_label)} of two</span>'
        )
        segs = (mine, theirs) if label == "part one" else (theirs, mine)
        part = f'<nav class="tp-part tp-part-bar" aria-label="Two parts">{segs[0]}{segs[1]}</nav>\n'
    url = f"{SITE}{page_folder(meta)}/{meta['slug']}/"
    own_og = (meta["assets"] / "og.png").is_file()  # made by the optional tools/og.js
    if own_og:
        page.copies.append((meta["assets"] / "og.png", "og.png"))
    og = f"{url}og.png" if own_og else f"{SITE}images/og-image.png"
    og_alt = f"{title}: track {num} on Colin Nguyen's site" if own_og else "Colin Nguyen's site"
    draft = not meta["ready"]
    badge = meta.get("badge") or meta.get("status_label")
    scripts = "".join(f'\n<script src="{esc(s)}" defer></script>' for s in page.scripts)
    scripts += "".join(f'\n<link rel="stylesheet" href="{esc(s)}">' for s in page.styles)
    if data:
        scripts += (
            '\n<script src="../../js/lately-depth.js" defer></script>\n<script '
            'src="../../js/lately.js" defer></script>'
        )
    body_attrs = f' data-feed="{meta["feed"]}" data-root="{home}"' if data else ""
    body_class = f"tp-body tp-body--{meta['register']}" + (" ld-body" if data else "")
    robots = '<meta name="robots" content="noindex, nofollow">\n' if draft else ""
    draft_note = (
        '<p class="tp-draft">draft · not ready to publish · only built with --drafts</p>\n'
        if draft
        else ""
    )
    track_of = f" of {listed}" if on_list else " · not on the tracklist yet"
    clock_html = (
        f'<span class="tp-clock"><span class="tp-clock-now">0:00</span> / '
        f'<span class="tp-clock-total">{clock(total)}</span></span>'
        if stamped
        else ""
    )

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · Colin Nguyen</title>
<meta name="description" content="{esc(desc)}">
{robots}<link rel="canonical" href="{url}">
<meta name="theme-color" content="#E8E2D3">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Colin Nguyen">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(og_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{og}">
<meta name="twitter:image:alt" content="{esc(og_alt)}">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<link rel="icon" href="../../favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="../../apple-touch-icon.png">
<link rel="preload" href="../../fonts/archivo-latin-var.woff2" \
as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../../fonts/courier-prime-400-latin.woff2" \
as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../../css/site.css">
<link rel="stylesheet" href="../../css/track.css">
<script src="../../js/track.js" defer></script>{scripts}
</head>
<body class="{body_class}"{body_attrs}>
<a class="skip-link" href="#main">Skip to content</a>
<div class="wrap">
<div class="page tp-page">
<header class="site-header">
<a class="site-name tp-home" href="{home}">colin nguyen</a>
<a class="tp-back" href="{home}#{side_id}">← back to the tracklist</a>
</header>
<main id="main" class="tp-main" data-total="{total:.1f}"{" data-live-timing" if data else ""}>
{draft_note}<section class="tp-hero" aria-labelledby="tp-title">
<p class="tp-kicker">{esc(side_short)} · track {num}{track_of}{when}</p>
<div class="tp-heading"><span class="tp-no" aria-hidden="true">{num}</span>\
<h1 class="tp-title" id="tp-title"><span class="sr-only">Track {num}: </span>{esc(title)}</h1></div>
{part}{lede}
</section>
<section class="tp-player" aria-label="Now reading">
<div class="tp-controls" hidden>
<span class="tp-controls-main">
<button type="button" class="tp-play control" aria-describedby="tp-play-help">\
<span class="tp-play-icon" aria-hidden="true"></span><span class="tp-play-text">play</span></button>
{clock_html}
<button type="button" class="tp-speed control" aria-label="Playback speed, 1×">speed 1×</button>
</span>
{f'<span class="tp-badge">status: {esc(badge)}</span>' if badge else ""}
</div>
<p class="tp-help" id="tp-play-help" hidden>Play scrolls the page for you at reading pace. \
Scroll, tap or press space to pause.</p>
<p class="tp-status sr-only" role="status" aria-live="polite"></p>
<nav class="tp-segs" aria-label="Sections of this page">
{"".join(seg_html)}
</nav>
</section>
{"".join(sec_html)}
<nav class="tp-other" aria-label="Other tracks">
{"".join(nav)}
</nav>
</main>
<footer class="page-foot"><p class="views-note">Views are my own.</p></footer>
</div>
</div>
</body>
</html>
"""
    return doc, page.copies


def built_with_grid(
    blocks: list[tuple[str, int, str]], title: str, name: str
) -> list[tuple[str, int, str]]:
    """The "built with" section is one grid: a PAPERS: block there becomes the grid's papers row
    (after a papers | text row's text, when both are given), and the section may hold nothing
    else but the grid and a LINKS: list. A PAPERS: block anywhere else stops the build."""
    papers = [b for b in blocks if b[2] == "papers"]
    if title.lower() != "built with":
        if papers:
            raise ContentError(f"{name}: a PAPERS: block belongs in the built with section")
        return blocks
    rest = [b for b in blocks if b[2] != "papers"]
    if len(papers) > 1:
        raise ContentError(f"{name}: built with takes one PAPERS: block")
    grids = [b for b in rest if b[0].startswith('<dl class="tp-built">')]
    if len(grids) > 1 or any(
        not (b[0].startswith('<dl class="tp-built">') or b[0].startswith('<ul class="tp-links">'))
        for b in rest
    ):
        raise ContentError(
            f"{name}: built with holds one BUILT-WITH: block, an optional PAPERS: block and an "
            f"optional LINKS: list, nothing else"
        )
    if not papers:
        return blocks
    html_list, n, _ = papers[0]
    if grids:
        dl, dn, _ = grids[0]
        m = re.search(
            r'<div class="tp-built-row tp-built-row--papers"><dt>papers</dt><dd>(.*?)</dd></div>',
            dl,
        )
        if m:  # a papers | text row: the list, then the text
            dl = dl.replace(
                m.group(0),
                f'<div class="tp-built-row '
                f'tp-built-row--papers"><dt>papers</dt><dd>{html_list}'
                f"<p>{m.group(1)}</p></dd></div>",
            )
        else:  # before attribution and made with, after the rest
            row = (
                f'<div class="tp-built-row '
                f'tp-built-row--papers"><dt>papers</dt><dd>{html_list}</dd></div>'
            )
            at = re.search(
                r'<div class="tp-built-row tp-built-row--(?:attribution|made-with)">', dl
            )
            dl = (
                dl[: at.start()] + row + dl[at.start() :]
                if at
                else dl.replace("</dl>", row + "</dl>")
            )
        merged = (dl, dn + n, "text")
        return [merged if b is grids[0] else b for b in rest]
    return [
        (
            f'<dl class="tp-built"><div class="tp-built-row '
            f'tp-built-row--papers"><dt>papers</dt><dd>{html_list}</dd></div></dl>',
            n,
            "text",
        )
    ] + rest


def data_sections(meta: dict) -> list[dict]:
    """A data page's sections as render() takes them: one per ## entry under What's happening
    then Why, each a list of (html, words, kind) blocks the browser fills, then a "built with"
    section (data, attribution, made with, as of) in the track pages' grid."""
    out = []
    for s in meta["sections"]:
        notes = "".join(
            f'<span class="ld-alias" id="{a}" data-to="{s["id"]}"></span>' for a in s["aliases"]
        )
        notes += f'<p class="ld-section-source">{esc(s["source"])}</p>' if s["source"] else ""
        notes += "".join(f'<p class="ld-section-note">{inline(n)}</p>' for n in s["notes"])
        blocks = [(notes, sum(words(n) for n in s["notes"]), "text")] if notes else []
        for kind, arg in s["slots"]:
            blocks.append(
                (
                    f'<div class="ld-stat" data-stat="{esc(" ".join(arg))}"></div>'
                    if kind == "stat"
                    else f'<div class="ld-feed" data-block="{esc(arg)}"></div>',
                    0,
                    "text",
                )
            )
        out.append(dict(s, blocks=blocks))
    out.append(
        {
            "title": "built with",
            "short": "built with",
            "id": "built-with",
            "group": None,
            "how": None,
            "blocks": [(data_built_with(meta), 0, "text")],
        }
    )
    return out


def data_built_with(meta: dict) -> str:
    """The Lately page's "built with" rows: the feed's sources (linked), the licence lines the
    page needs (filled in the browser while the data calls for them), the pipeline, and the
    data's as-of date (from the file, in the browser)."""
    credit = " and ".join(
        f'<a href="{esc(u)}"{new_tab(u)}>{esc(n)}</a>' for n, u in meta["sources"]
    )
    if meta.get("source_note"):
        credit += f' · <span class="ld-source-note">{esc(meta["source_note"])}</span>'
    rows = [f'<div class="tp-built-row tp-built-row--data"><dt>data</dt><dd>{credit}</dd></div>']
    when = ""
    if meta.get("attribution_when"):
        src, text, link = meta["attribution_when"]
        when += (
            f'<p class="ld-attribution" data-when-source="{esc(src)}" hidden><a '
            f'href="{esc(link)}"{new_tab(link)}>{esc(text)}</a></p>'
        )
    if meta.get("attributions_when"):
        when += (
            f'<p class="ld-attributions" '
            f'data-when-stats="{esc(" ".join(meta["attributions_when"]))}" hidden></p>'
        )
    if when:
        rows.append(
            f'<div class="tp-built-row tp-built-row--when" '
            f"hidden><dt>attribution</dt><dd>{when}</dd></div>"
        )
    rows.append(
        '<div class="tp-built-row tp-built-row--made-with"><dt>made with</dt><dd>my own '
        "nightly pipeline (private)</dd></div>"
    )
    rows.append(
        '<div class="tp-built-row tp-built-row--as-of ld-asof"><dt>as of</dt><dd><time '
        'class="ld-asof-date">…</time></dd></div>'
    )
    return f'<dl class="tp-built">{"".join(rows)}</dl>'


def write_pages(
    out_root: Path,
    metas: list[dict],
    tracklist: list[tuple[int, str, str, str]],
    pages_here: dict[int, dict],
    drafts_build: bool,
    listed: int,
) -> None:
    """Writes each page in metas to out_root/<slug>/, removing earlier output there that
    this build doesn't produce. Only folders build.py made (with OUT_MARK, or inside a site
    folder it assembled) are touched."""
    out_root.mkdir(exist_ok=True)
    owned = (out_root.parent / OUT_MARK).exists()
    keep = {m["slug"] for m in metas}
    for d in out_root.iterdir():
        if d.is_dir() and (d / OUT_MARK).exists() and d.name not in keep:
            shutil.rmtree(d)
    for m in metas:
        doc, copies = render(m, tracklist, pages_here, drafts_build, listed)
        out = out_root / m["slug"]
        if out.exists():
            if not owned and not (out / OUT_MARK).exists():
                raise ContentError(
                    f"{out.relative_to(ROOT)} exists but was not made by build.py; not touching it"
                )
            shutil.rmtree(out)
        out.mkdir()
        (out / OUT_MARK).write_text("")
        (out / "index.html").write_text(doc, encoding="utf-8")
        for src, rel in copies:
            (out / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out / rel)


def assemble_site(out: Path) -> None:
    """Copies the site's files (SITE_FILES and data/lately.json) into out, replacing an earlier
    copy made by build.py; a folder there that build.py did not make stops the build."""
    if out.exists():
        if not (out / OUT_MARK).exists():
            raise ContentError(f"{out.name}/ exists but was not made by build.py; not touching it")
        shutil.rmtree(out)
    out.mkdir()
    (out / OUT_MARK).write_text("")
    for name in SITE_FILES:
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(
                src, out / name, ignore=lambda d, names: [n for n in names if n in NOT_COPIED]
            )
        elif src.is_file():
            shutil.copy2(src, out / name)
    (out / "data").mkdir()
    shutil.copy2(ROOT / LIVE_DATA, out / LIVE_DATA)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--drafts", action="store_true", help="also build drafts, for local preview")
    args = ap.parse_args()

    check_live_data()
    index_path = ROOT / "index.html"
    index_before = index_path.read_text(encoding="utf-8")
    index_html = fill_live(index_before)  # sentences read from results files
    tracklist = read_tracklist(index_html)
    if not tracklist:
        raise ContentError("no tracks found on the main page")

    metas = []
    for folder, is_draft_dir in (("tracks", False), ("drafts", True)):
        for path in sorted((ROOT / "content" / folder).glob("*.md")):
            meta = read_page(path)
            if meta["ready"] and is_draft_dir:
                raise ContentError(
                    f"{path.name}: marked ready but still in content/drafts; move it to "
                    f"content/tracks"
                )
            if not meta["ready"] and not is_draft_dir:
                raise ContentError(
                    f"{path.name}: not ready, so it belongs in content/drafts (git-ignored)"
                )
            metas.append(meta)
    for key in ("track", "slug"):
        seen = [m[key] for m in metas]
        if len(set(seen)) != len(seen):
            raise ContentError(f"two content files share a {key}")

    # A draft may be for a track that is not on the main page yet; it sorts after the
    # listed tracks. A ready page must be on the main page.
    listed = len(tracklist)
    on_page = {t[0] for t in tracklist}
    for m in sorted(metas, key=lambda m: m["track"]):
        if m["track"] not in on_page:
            if m["ready"]:
                raise ContentError(f"track {m['track']} is ready but not on the main page")
            if not m.get("side"):
                raise ContentError(
                    f"{m['source'].name}: track {m['track']} is not on the main page, so it needs "
                    f"side:"
                )
            tracklist.append((m["track"], m["title"], *side_for(tracklist[:listed], m["side"])))

    ready = sorted((m for m in metas if m["ready"]), key=lambda m: m["track"])
    building = [m for m in metas if m["ready"] or args.drafts]
    schema = json.loads((ROOT / SCHEMA_PATH).read_text(encoding="utf-8"))
    data_pages = read_data_pages(schema, index_html)  # tracks 22 to 26, always ready
    by_track = {m["track"]: m for m in data_pages}

    # The site itself only ever holds ready pages, with or without --drafts.
    out_root = ROOT / "tracks"
    write_pages(
        out_root, ready, tracklist, dict(by_track, **{m["track"]: m for m in ready}), False, listed
    )
    (out_root / ".gitignore").write_text(
        "# Written by build.py. Only pages marked ready may be committed; drafts stay "
        "local.\n*\n!.gitignore\n" + "".join(f"!/{m['slug']}/\n" for m in ready) + f"{OUT_MARK}\n",
        encoding="utf-8",
    )

    write_pages(
        ROOT / "lately",
        data_pages,
        tracklist,
        dict(by_track, **{m["track"]: m for m in ready}),
        False,
        listed,
    )
    (ROOT / "lately" / ".gitignore").write_text(
        f"# Written by build.py.\n{OUT_MARK}\n", encoding="utf-8"
    )

    urls = (
        [SITE]
        + [f"{SITE}lately/{m['feed']}/" for m in data_pages]
        + [f"{SITE}tracks/{m['slug']}/" for m in ready]
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"<url><loc>{u}</loc></url>\n" for u in urls)
        + "</urlset>\n",
        encoding="utf-8",
    )

    index_html = when_rows(index_html, metas, tracklist)
    new_index = link_rows(index_html, {m["track"]: m["slug"] for m in ready})
    if new_index != index_before:
        index_path.write_text(new_index, encoding="utf-8")
    if (ROOT / "index.drafts.html").exists():  # the old preview file
        (ROOT / "index.drafts.html").unlink()

    # The publishable site, assembled from SITE_FILES in _site/ (git-ignored); the workflow
    # publishes that folder. --drafts: the site again in _site-drafts/ with every page built
    # and linked from its main page. A plain build removes the preview.
    assemble_site(ROOT / SITE_DIR)
    preview = ROOT / PREVIEW_DIR
    if preview.exists():
        if not (preview / OUT_MARK).exists():
            raise ContentError(
                f"{PREVIEW_DIR}/ exists but was not made by build.py; not touching it"
            )
        shutil.rmtree(preview)
    if args.drafts:
        assemble_site(preview)
        here = dict(by_track, **{m["track"]: m for m in building})
        write_pages(preview / "tracks", building, tracklist, here, True, listed)
        write_pages(preview / "lately", data_pages, tracklist, here, True, listed)
        (preview / "index.html").write_text(
            link_rows(new_index, {m["track"]: m["slug"] for m in building}), encoding="utf-8"
        )

    print(f"built {len(data_pages)} lately page(s): " + ", ".join(m["feed"] for m in data_pages))
    drafts = [m for m in metas if not m["ready"]]
    print(f"built {len(ready)} page(s): " + ", ".join(f"{m['track']} {m['slug']}" for m in ready))
    if args.drafts:
        print(
            f"preview with {len(drafts)} draft(s) in {PREVIEW_DIR}/: python3 -m http.server -d {PREVIEW_DIR} 8765 --bind 127.0.0.1"
        )
    elif drafts:
        print(f"skipped {len(drafts)} draft(s); run with --drafts to preview them")


if __name__ == "__main__":
    try:
        main()
    except ContentError as e:
        sys.exit(f"build.py: {e}")
