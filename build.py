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

The Lately pages use a separate "data" register: content/lately/<feed>.md, one
per feed, becomes lately/<feed>/index.html. Those files name statistics, not
numbers; js/lately-depth.js draws them from data/lately.json in the browser, so
no data is ever written into the built pages. See README.md, "Lately in depth".
"""

import argparse
import html
import json
import math
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = "https://cnguyen75.github.io/"
WPM = 230  # reading pace for timestamps and the play control
FIGURE_SECS = 6  # time given to each figure, code excerpt or demo; play holds still for part of it
REGISTERS = ("album", "plain", "progress")
REQUIRED = ("track", "slug", "title", "register", "ready")
REQUIRED_BY_REGISTER = {"album": ("one_line",), "plain": ("one_line",), "progress": ("with", "as_of")}
# The progress register (ongoing research) has fixed sections, in this order.
PROGRESS_SECTIONS = ("question", "approach", "where it stands", "results", "what's next", "log", "built with", "my role")
PROGRESS_OPTIONAL = ("results", "log", "built with", "my role")  # my role: only on pages about work led with others
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTHS_LONG = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
LIVE_DATA = "data/lately.json"  # written by the pipeline; the site is not built without it
OUT_MARK = ".built-by-build-py"  # marks folders this script may delete
PREVIEW_DIR = "_site-drafts"  # --drafts writes the whole site here, drafts included and linked; git-ignored
# What isn't part of the site, so isn't copied into the preview.
PREVIEW_SKIP = {".git", "content", "tests", "tools", PREVIEW_DIR, "build.py", "README.md", ".gitignore",
                "index.drafts.html"}

# Plain-text component markers, as handoff drafts write them ("STEPS:", "FIGURE: path", ...).
# A marker starts a block that runs to the next blank line; the second group only
# ever follows one of the first.
MARKER = re.compile(r"([A-Z][A-Z-]*[A-Z]):\s*(.*)$")
MARKER_BLOCKS = ("STEPS", "EXCERPT", "DEMO", "STATS", "FIGURE", "TABLE", "BUILT-WITH", "LINKS", "PAPERS", "AUDIO-PAIR", "AUDIO-GRID")
BUILT_WITH_ROWS = ("languages and frameworks", "data", "compute", "attribution")  # the only rows a BUILT-WITH: block takes
MARKER_FIELDS = ("CAPTION", "BEHAVIOUR", "DEMO-CAPTION", "ATTRIBUTION", "AUDIO-NOTE", "ALT", "OVERLAY")


# The data register (content/lately/<feed>.md -> lately/<feed>/)
DATA_FEEDS = ("fantasy", "watching", "listening", "eating", "lifting")
DATA_REQUIRED = ("register", "feed", "title", "source")
# Every page has these two groups ("# What's happening", "# Why"), in this order; each
# ## section sits in one. Cards in Why are questions and show "not enough data yet" with
# n and min_n; sections in What's happening are hidden until they have data.
DATA_GROUPS = ("What's happening", "Why")
DATA_GROUP_IDS = {"What's happening": "whats-happening", "Why": "why"}
# Blocks of the feed itself (not the analysis) that js/lately.js draws into a FEED: slot.
FEED_BLOCKS = ("fantasy.lineup", "fantasy.carry", "watching.hours", "watching.recent", "watching.rankings", "watching.tiers",
               "listening.recent", "eating.recent", "lifting.lifts", "lifting.training", "lifting.body_weight")
# Each page credits its source by name and link; these four require it.
DATA_ATTRIBUTION = {"watching": "Simkl", "listening": "Last.fm", "eating": "Beli", "lifting": "Hevy"}
# Statistics in the analysis schema that no page shows, as {path: reason}. Every other
# statistic must be on exactly one page. 2026-10-18: the pages were trimmed to the cards
# that have data or a dated arrival and answer something no other card does; the pipeline
# keeps computing these.
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


def esc(s):
    return html.escape(str(s), quote=True)


def new_tab(url):
    """Attributes for a link: one to another site opens in a new tab with rel="noopener";
    a link within the site (relative, #anchor, mailto:, or this site's own URL) stays put."""
    return ' target="_blank" rel="noopener"' if re.match(r"https?://", url) and not url.startswith(SITE) else ""


# ---------- reading content files ----------

def read_page(path):
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
    meta["source"] = path
    meta["assets"] = path.parent / meta["slug"]
    body = m.group(2)
    if meta.get("live"):  # {field:kind} placeholders read from a results file in the asset folder
        body = fill_live_lines(body, meta["assets"] / meta["live"], path.name)
    meta["sections"] = parse_sections(body, path.name)
    if meta.get("part"):
        # "part: part one · 2014–15 | 12": a page in a two-part story, and the number of the other part.
        label, sep, other = (x.strip() for x in meta["part"].partition("|"))
        if not (label and sep and re.fullmatch(r"\d+", other)):
            raise ContentError(f"{path.name}: part must be 'label | number of the other part'")
        meta["part_label"], meta["part_other"] = label, other.zfill(2)
    if meta["register"] == "progress":
        check_progress(meta, path.name)
    return meta


def check_progress(meta, name):
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
        raise ContentError(f"{name}: progress sections must be, in order: " + ", ".join(
            t + (" (optional)" if t in PROGRESS_OPTIONAL else "") for t in PROGRESS_SECTIONS)
            + f"; found: {', '.join(titles)}")


def parse_date(s, what, month_only=True):
    """(datetime attribute, display text) for YYYY-MM-DD, or YYYY-MM when month_only is allowed."""
    m = re.fullmatch(r"(\d{4})-(\d{2})(?:-(\d{2}))?", s)
    if not m or (m.group(3) is None and not month_only):
        raise ContentError(f"{what} must be YYYY-MM-DD" + (" or YYYY-MM" if month_only else "") + f", not {s!r}")
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


def parse_sections(body, name):
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


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------- the data register ----------

def _schema_node(schema, node):
    while "$ref" in node:
        node = schema["$defs"][node["$ref"].split("/")[-1]]
    return node


# A statistic: analysis_stat, or one of its fixed-shape variants (analysis_stat_quadrant...),
# which carry the same required fields.
STAT_FIELDS = {"status", "n", "min_n", "as_of", "how"}


def _is_stat(node):
    return isinstance(node.get("properties"), dict) and STAT_FIELDS <= set(node["properties"])


def stat_paths(schema, pattern=None):
    """Every statistic under analysis, as paths such as fantasy.teams[].playoff_odds,
    lifting.progress.* (a map keyed by the data) or watching.completion.show. With a
    pattern, only the ones it names: "teams[]" steps into a list, and "*" takes a map's
    keys or every statistic among fixed properties. KeyError if it names nothing."""
    steps = None if pattern is None else [x for part in pattern.split(".")
                                          for x in ([part[:-2], "[]"] if part.endswith("[]") else [part])]
    out = []

    def walk(node, path, steps):
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


def read_data_page(path, schema):
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
        raise ContentError(f"{path.name}: feed must be one of {', '.join(DATA_FEEDS)} and match the file name")
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
    if meta.get("attribution_when"):
        # "attribution_when: yahoo | Fantasy data provided by Yahoo Fantasy | https://...": a credit
        # line shown only when that source is in analysis.meta.sources_included.
        parts = [x.strip() for x in meta["attribution_when"].split("|")]
        if len(parts) != 3 or not all(parts) or not re.fullmatch(r"[a-z]+", parts[0]) or not re.fullmatch(r"https://\S+", parts[2]):
            raise ContentError(f"{path.name}: attribution_when must be 'source | text | https://...'")
        meta["attribution_when"] = tuple(parts)
    if meta.get("attributions_when"):
        # "attributions_when: watching.by_director, watching.crowd_agreement": the credits in
        # analysis.meta.attributions are printed in the footer while any of these statistics is ok.
        paths = [x.strip() for x in meta["attributions_when"].split(",") if x.strip()]
        for pth in paths:
            try:
                stat_paths(schema, pth)
            except KeyError as e:
                raise ContentError(f"{path.name}: attributions_when: {pth} is not a statistic in {SCHEMA_PATH} ({e.args[0]})")
        meta["attributions_when"] = paths
    meta["groups"] = parse_data_body(m.group(2), path.name)
    meta["sections"] = [s for g in meta["groups"] for s in g["sections"]]
    meta["stats"] = []
    for sec in meta["sections"]:
        sec["stats"], sec["slots"], sec["notes"], sec["aliases"], sec["source"] = [], [], [], [], None
        for line in sec["lines"]:
            if not line.strip():
                continue
            mm = re.fullmatch(r"(STAT|FEED|NOTE|ALIAS|SOURCE):\s*(\S.*?)\s*", line)
            if not mm:
                raise ContentError(f"{path.name}: under '## {sec['title']}' only STAT:, FEED:, NOTE:, ALIAS: and SOURCE: lines are allowed, not {line.strip()!r}")
            kind, arg = mm.group(1), mm.group(2)
            if kind == "NOTE":
                sec["notes"].append(arg)
                continue
            if kind == "SOURCE":
                # Where this section's data comes from when it isn't the page's credit (the survival
                # cards read the Apple Music library export, not Last.fm): one mono line under the title.
                if sec["source"] is not None:
                    raise ContentError(f"{path.name}: under '## {sec['title']}' only one SOURCE: line is allowed")
                sec["source"] = arg
                continue
            if kind == "ALIAS":
                # The id of a card this one absorbed: a deep link to it lands here.
                if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", arg):
                    raise ContentError(f"{path.name}: ALIAS: {arg} must be a section id (lowercase words joined by hyphens)")
                sec["aliases"].append(arg)
                continue
            if kind == "FEED":
                if arg not in FEED_BLOCKS:
                    raise ContentError(f"{path.name}: FEED: {arg} is not a block js/lately.js draws ({', '.join(FEED_BLOCKS)})")
                sec["slots"].append(("feed", arg))
                continue
            try:
                leaves = stat_paths(schema, arg)
            except KeyError as e:
                raise ContentError(f"{path.name}: STAT: {arg} is not a statistic in {SCHEMA_PATH} ({e.args[0]})")
            sec["stats"].append(leaves)  # one slot per STAT: line, naming every statistic it covers
            sec["slots"].append(("stat", leaves))
            meta["stats"] += leaves
        if not sec["slots"]:
            raise ContentError(f"{path.name}: '## {sec['title']}' has no STAT: or FEED: line")
    check_aliases(meta)
    return meta


def parse_data_body(body, name):
    """A data page's body: "# What's happening" and "# Why", each holding ## sections (a
    section may fix its id with {#id} so a retitled card keeps its deep link)."""
    groups, cur = [], None
    for line in body.splitlines():
        g = re.match(r"# (.+?)\s*$", line)
        if g:
            title = g.group(1).strip()
            if title not in DATA_GROUPS:
                raise ContentError(f"{name}: groups are '# {DATA_GROUPS[0]}' and '# {DATA_GROUPS[1]}', not '# {title}'")
            cur = {"title": title, "id": DATA_GROUP_IDS[title], "lines": []}
            groups.append(cur)
        elif cur is not None:
            cur["lines"].append(line)
        elif line.strip():
            raise ContentError(f"{name}: text before the first # group")
    if [g["title"] for g in groups] != list(DATA_GROUPS):
        raise ContentError(f"{name}: a data page has the groups '# {DATA_GROUPS[0]}' then '# {DATA_GROUPS[1]}', once each")
    ids = set()
    for g in groups:
        g["sections"] = parse_sections("\n".join(g["lines"]), name)
        for s in g["sections"]:
            s["group"] = g["id"]
            if s["id"] in ids:
                raise ContentError(f"{name}: two sections share an id")
            ids.add(s["id"])
    return groups


def check_aliases(meta):
    """An alias never repeats a section id or another alias."""
    ids = {s["id"] for s in meta["sections"]}
    seen = set()
    for s in meta["sections"]:
        for a in s["aliases"]:
            if a in ids or a in seen:
                raise ContentError(f"{meta['source_file'].name}: ALIAS: {a} is already a section id or alias")
            seen.add(a)


def check_data_coverage(pages, schema):
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
            raise ContentError(f"{leaf} is in the analysis schema but on no page; add it to a page or to DATA_LEFT_OUT")


def render_data_page(meta):
    feed = meta["feed"]
    url = f"{SITE}lately/{feed}/"
    title = meta["title"]
    desc = f"{title}: statistics from my {feed} data, drawn from the same nightly file as the Lately section."
    # source_note: optional text after the credit, e.g. how a source's dates are used
    note = f' · <span class="ld-source-note">{esc(meta["source_note"])}</span>' if meta.get("source_note") else ""
    credit = " and ".join(f'<a href="{esc(u)}"{new_tab(u)}>{esc(n)}</a>' for n, u in meta["sources"])
    # The page's first line: whose numbers these are and which apps they come from.
    apps = " and ".join(esc(n) for n, _ in meta["sources"])
    lede = f"These are my own numbers, from my {apps} {'accounts' if len(meta['sources']) > 1 else 'account'}."
    nav, groups = [], []
    for g in meta["groups"]:
        links = "".join(f'<li><a href="#{s["id"]}">{esc(s["title"])}</a></li>' for s in g["sections"])
        nav.append(f'<li class="ld-toc-group" data-group="{g["id"]}"><span class="ld-toc-label">{esc(g["title"])}</span><ol>{links}</ol></li>')
        secs = []
        for s in g["sections"]:
            notes = "".join(f'<p class="ld-section-note">{inline(n)}</p>' for n in s["notes"])
            notes = (f'<p class="ld-section-source">{esc(s["source"])}</p>' if s["source"] else "") + notes
            notes = "".join(f'<span class="ld-alias" id="{a}" data-to="{s["id"]}"></span>' for a in s["aliases"]) + notes
            slots = "".join(f'<div class="ld-stat" data-stat="{esc(" ".join(arg))}"></div>' if kind == "stat"
                            else f'<div class="ld-feed" data-block="{esc(arg)}"></div>' for kind, arg in s["slots"])
            secs.append(f'<section class="ld-section ld-section--{g["id"]}" id="{s["id"]}" aria-labelledby="{s["id"]}-h">'
                        f'<h3 class="ld-section-title" id="{s["id"]}-h">{esc(s["title"])}</h3>{notes}{slots}</section>')
        groups.append(f'<section class="ld-group ld-group--{g["id"]}" id="{g["id"]}" aria-labelledby="{g["id"]}-h">'
                      f'<h2 class="ld-group-title" id="{g["id"]}-h">{esc(g["title"])}</h2>{"".join(secs)}</section>')
    attribution = ""
    if meta.get("attribution_when"):
        src, text, link = meta["attribution_when"]
        attribution = (f'\n<p class="ld-attribution" data-when-source="{esc(src)}" hidden>'
                       f'<a href="{esc(link)}"{new_tab(link)}>{esc(text)}</a></p>')
    if meta.get("attributions_when"):
        attribution += f'\n<p class="ld-attributions" data-when-stats="{esc(" ".join(meta["attributions_when"]))}" hidden></p>'
    current = ' aria-current="page"'
    others = " · ".join(f'<a href="../{f}/"{current if f == feed else ""}>{f}</a>' for f in DATA_FEEDS)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · Colin Nguyen</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#E8E2D3">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Colin Nguyen">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{SITE}images/og-image.png">
<meta property="og:image:alt" content="Colin Nguyen's site">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<link rel="icon" href="../../favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="../../apple-touch-icon.png">
<link rel="preload" href="../../fonts/archivo-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../../fonts/courier-prime-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../../css/site.css">
<script src="../../js/lately-depth.js" defer></script>
<script src="../../js/lately.js" defer></script>
</head>
<body class="ld-body" data-feed="{feed}" data-root="../../">
<a class="skip-link" href="#main">Skip to content</a>
<div class="wrap">
<div class="page ld-page">
<header class="site-header">
<a class="site-name ld-home" href="../../">colin nguyen</a>
<a class="ld-back" href="../../#panel-{feed}">← back to lately</a>
</header>
<main id="main" class="ld-main">
<section class="ld-hero" aria-labelledby="ld-title">
<p class="ld-kicker">side d. lately · in depth</p>
<h1 class="ld-title" id="ld-title">{esc(title)}</h1>
<nav class="ld-feeds" aria-label="Lately pages">{others}</nav>
<p class="ld-lede">{lede}</p>
<p class="ld-source">data from {credit}{note} · <span class="ld-asof">as of <time class="ld-asof-date">…</time></span></p>
<div class="ld-headline" data-feed="{feed}" aria-label="Headline numbers"></div>
<noscript><p class="panel-empty">This page draws its statistics with JavaScript, which is turned off.</p></noscript>
<p class="panel-empty ld-missing" hidden>The statistics are not connected yet.</p>
</section>
<nav class="ld-toc" aria-label="On this page"><ol>{"".join(nav)}</ol></nav>
{"".join(groups)}{attribution}
</main>
<footer class="page-foot"><p class="views-note">Views are my own.</p></footer>
</div>
</div>
</body>
</html>
"""


def build_data_pages(schema):
    pages = [read_data_page(p, schema) for p in sorted((ROOT / "content" / "lately").glob("*.md"))]
    check_data_coverage(pages, schema)
    out_root = ROOT / "lately"
    out_root.mkdir(exist_ok=True)
    keep = {m["feed"] for m in pages}
    for d in out_root.iterdir():
        if d.is_dir() and (d / OUT_MARK).exists() and d.name not in keep:
            shutil.rmtree(d)
    (out_root / ".gitignore").write_text(f"# Written by build.py.\n{OUT_MARK}\n", encoding="utf-8")
    for m in pages:
        out = out_root / m["feed"]
        if out.exists() and not (out / OUT_MARK).exists():
            raise ContentError(f"{out.relative_to(ROOT)} exists but was not made by build.py; not touching it")
        out.mkdir(exist_ok=True)
        (out / OUT_MARK).write_text("")
        (out / "index.html").write_text(render_data_page(m), encoding="utf-8")
    return pages


# ---------- Markdown subset ----------
# Paragraphs, "> " lead paragraph (or a page's opening paragraph if bold throughout), "- " lists,
# **bold**, *italic*, `code`, [text](https://...), component blocks fenced by
# "::: name args" ... ":::", and the plain-text markers above.

# Track pages a [text](track:NN) link may point at from the page being rendered:
# {number: slug}, set by render() with the same rule as previous and next.
TRACK_LINKS = {}


def inline(s):
    out, last = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)\s]+)\)", s):
        out.append(inline_text(s[last:m.start()]))
        url = m.group(2)
        last = m.end()
        track = re.fullmatch(r"track:(\d+)", url)
        if track:
            # Another track's page: a link only when that page is linkable from this one,
            # otherwise the text alone.
            slug = TRACK_LINKS.get(track.group(1).zfill(2))
            out.append(f'<a href="../{slug}/">{inline_text(m.group(1))}</a>' if slug else inline_text(m.group(1)))
            continue
        if not re.match(r"(https://|mailto:|#|\.\./)", url):
            raise ContentError(f"link {url!r} must be https://, mailto:, #anchor or relative")
        out.append(f'<a href="{esc(url)}"{new_tab(url)}>{inline_text(m.group(1))}</a>')
    out.append(inline_text(s[last:]))
    return "".join(out)


def inline_text(s):
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    return s


def words(s):
    return len(re.findall(r"[\w’'–-]+", re.sub(r"<[^>]+>", " ", s)))


class Page:
    """Renders one page's body and keeps what the page head needs."""

    def __init__(self, meta):
        self.meta = meta
        self.figures = 0
        self.scripts = []   # page-only scripts (demo slots)
        self.styles = []    # page-only stylesheets (demo.css next to demo.js)
        self.copies = []    # asset files to copy next to the page
        self.held = 0       # HELD: notes (content waiting on a collaborator); a ready page may have none

    def asset(self, name, inline_svg=False, copy=True):
        """A file in the page's asset folder. Marker drafts name it as <slug>/path."""
        if name.startswith(self.meta["slug"] + "/"):
            name = name[len(self.meta["slug"]) + 1:]
        if name.startswith(("/", ".")) or ".." in name.split("/") or "\\" in name:
            raise ContentError(f"asset {name!r} must be a path inside the page's folder")
        path = self.meta["assets"] / name
        if not path.is_file():
            raise ContentError(f"{self.meta['source'].name}: missing asset {path.relative_to(ROOT)}")
        if inline_svg:
            svg = path.read_text(encoding="utf-8")
            svg = re.sub(r"<\?xml[^>]*\?>\s*|<!DOCTYPE[^>]*>\s*", "", svg).strip()
            if not svg.startswith("<svg") or re.search(r"<script|\son\w+=", svg, re.I):
                raise ContentError(f"{name}: must be a plain <svg> with no scripts")
            return svg
        if copy and name not in [c[1] for c in self.copies]:
            self.copies.append((path, name))
        return name

    def blocks(self, lines, first=False):
        """Returns [(html, words, kind)] for one section; kind marks figures for the play control."""
        out, i = [], 0
        para = []

        def flush():
            if para:
                text = " ".join(l.strip() for l in para)
                if " HELD:" in text:
                    # Held text inside a paragraph: flagged from HELD: to the paragraph's end.
                    before, _, held = text.partition(" HELD:")
                    self.held += 1
                    out.append((f'<p>{inline(before)} {self.held_note(held, "span")}</p>', words(text), "text"))
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
                out.append(self.component(head, lines[i + 1:j]))
                i = j + 1
            elif re.match(r"- ", line):
                flush()
                items = []
                while i < len(lines) and (lines[i].startswith("- ") or (lines[i].startswith("  ") and items)):
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
                out.append((f'<p class="tp-held">{self.held_note(line[5:], "span")}</p>', words(line), "text"))
                i += 1
            elif line.startswith("DIAGRAM:"):
                raise ContentError(f"{self.meta['source'].name}: a DIAGRAM: line must be replaced by a ::: figure block")
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
    def held_note(text, tag):
        return (f'<{tag} class="tp-held-note"><span class="tp-held-flag">held: needs a collaborator\'s agreement</span> '
                f'{inline(text.strip())}</{tag}>')

    def log(self, lines):
        """A progress page's ## log: 'YYYY-MM-DD | text' or 'YYYY-MM | text' per line, in file order."""
        name = self.meta["source"].name
        items, n = "", 0
        for line in lines:
            if not line.strip():
                continue
            m = re.fullmatch(r"(\d{4}-\d{2}(?:-\d{2})?) \| (\S.*)", line.strip())
            if not m:
                raise ContentError(f"{name}: log lines are 'YYYY-MM-DD | text' or 'YYYY-MM | text', not {line.strip()!r}")
            iso, shown = parse_date(m.group(1), f"{name}: log date")
            items += f'<li class="tp-log-item"><time class="tp-log-date" datetime="{iso}">{shown}</time><span class="tp-log-text">{inline(m.group(2))}</span></li>'
            n += words(m.group(2))
        if not items:
            raise ContentError(f"{name}: ## log has no entries")
        return [(f'<ol class="tp-log">{items}</ol>', n, "text")]

    def caption(self, text):
        self.figures += 1
        return f'<figcaption class="tp-caption">fig. {self.figures} · {inline(text)}</figcaption>'

    @staticmethod
    def given_caption(text):
        """A caption written in full by the draft, numbering included."""
        return f'<figcaption class="tp-caption">{inline(text)}</figcaption>' if text else ""

    def marker(self, group):
        name = self.meta["source"].name
        head = MARKER.match(group[0])
        kind, arg = head.group(1), head.group(2).strip()
        if kind not in MARKER_BLOCKS:
            where = "must follow a component marker" if kind in MARKER_FIELDS else "is not a known marker"
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
        allowed = {"EXCERPT": {"CAPTION"}, "FIGURE": {"CAPTION", "ALT", "OVERLAY"}, "AUDIO-PAIR": {"CAPTION"},
                   "DEMO": {"BEHAVIOUR", "DEMO-CAPTION", "ATTRIBUTION"},
                   "AUDIO-GRID": {"BEHAVIOUR", "AUDIO-NOTE", "ATTRIBUTION", "CAPTION"}}.get(kind, set())
        extra = set(fields) - allowed
        if extra:
            raise ContentError(f"{name}: {kind}: does not take {', '.join(sorted(extra))}:")
        cells = [[c.strip() for c in r.split("|")] for r in rows]
        cap = self.given_caption(fields.get("CAPTION"))
        notes = "".join(f'<p class="tp-{cls}">{inline(fields[f])}</p>'
                        for f, cls in (("AUDIO-NOTE", "note"), ("ATTRIBUTION", "attribution")) if fields.get(f))

        def need(ok, what):
            if not ok:
                raise ContentError(f"{name}: {kind}: {what}")

        if kind == "STEPS":
            items = ""
            for c in cells:
                m = re.match(r"(\d+)\.\s+(.*)$", c[0])
                need(m and len(c) == 2, "rows are 'N. title | text'")
                items += (f'<div class="tp-step"><div class="tp-step-no">step {m.group(1)}</div>'
                          f'<div class="tp-step-title">{inline(m.group(2))}</div><div class="tp-step-text">{inline(c[1])}</div></div>')
            return (f'<div class="tp-steps">{items}</div>', sum(words(" ".join(c)) for c in cells), "text")

        if kind == "STATS":
            need(cells and all(2 <= len(c) <= 3 for c in cells), "rows are 'value | label | note'")
            items = "".join(
                f'<div class="tp-stat"><div class="tp-stat-label">{inline(c[1])}</div>'
                f'<div class="tp-stat-value">{inline(c[0])}</div>'
                + (f'<div class="tp-stat-label">{inline(c[2])}</div>' if len(c) > 2 and c[2] else "") + "</div>"
                for c in cells)
            return (f'<div class="tp-stats">{items}</div>', sum(words(" ".join(c)) for c in cells), "text")

        if kind == "BUILT-WITH":
            # "Built with": up to four rows, 'label | text [| https://link]', the labels fixed
            # (languages and frameworks, data, compute, attribution), each at most once.
            need(cells and all(2 <= len(c) <= 3 and c[0] in BUILT_WITH_ROWS and c[1] for c in cells),
                 "rows are 'label | text [| https://link]' with a label among " + ", ".join(BUILT_WITH_ROWS))
            need(len({c[0] for c in cells}) == len(cells), "has a label twice")
            need(all(len(c) < 3 or re.fullmatch(r"https://\S+", c[2]) for c in cells), "a link is https://")
            order = {l: i for i, l in enumerate(BUILT_WITH_ROWS)}
            items = ""
            for c in sorted(cells, key=lambda c: order[c[0]]):
                text = f'<a href="{esc(c[2])}"{new_tab(c[2])}>{inline_text(c[1])}</a>' if len(c) > 2 else inline(c[1])
                items += f'<div class="tp-built-row"><dt>{esc(c[0])}</dt><dd>{text}</dd></div>'
            return (f'<dl class="tp-built">{items}</dl>', sum(words(" ".join(c[:2])) for c in cells), "text")

        if kind == "LINKS":
            # A short list of labelled links, e.g. under the credits: 'label | https://...' per row.
            need(cells and all(len(c) == 2 and c[0] and re.fullmatch(r"https://\S+", c[1]) for c in cells),
                 "rows are 'label | https://...'")
            items = "".join(f'<li><a href="{esc(c[1])}"{new_tab(c[1])}>{inline_text(c[0])} →</a></li>' for c in cells)
            return (f'<ul class="tp-links">{items}</ul>', sum(words(c[0]) for c in cells), "text")

        if kind == "PAPERS":
            # "Papers this builds on": 'arXiv id | authors | year | title [| note]' per row, the title
            # and authors as the arXiv abstract page gives them; the id links to the abstract.
            need(cells and all(4 <= len(c) <= 5 and re.fullmatch(r"\d{4}\.\d{4,5}", c[0]) and c[1] and re.fullmatch(r"\d{4}", c[2]) and c[3]
                               for c in cells), "rows are 'arXiv id | authors | year | title [| note]'")
            items = ""
            for c in cells:
                url = f"https://arxiv.org/abs/{c[0]}"
                note = f' <span class="tp-paper-note">{inline(c[4])}</span>' if len(c) > 4 and c[4] else ""
                items += (f'<li>{inline(c[1])} ({esc(c[2])}). <cite>{inline(c[3])}</cite>. '
                          f'<a href="{url}"{new_tab(url)}>arXiv:{esc(c[0])}</a>.{note}</li>')
            return (f'<div class="tp-papers"><div class="tp-papers-title">Papers this builds on</div><ul class="tp-papers-list">{items}</ul></div>',
                    sum(words(" ".join(c)) for c in cells), "text")

        if kind == "TABLE":
            need(len(cells) >= 2 and len({len(c) for c in cells}) == 1, "needs a header row and rows with the same number of cells")
            head_html = "".join(f'<th scope="col">{inline(c)}</th>' for c in cells[0])
            body_html = "".join("<tr>" + f'<th scope="row">{inline(c[0])}</th>' + "".join(f'<td data-label="{esc(h)}">{inline(x)}</td>' for h, x in zip(cells[0][1:], c[1:])) + "</tr>"
                                for c in cells[1:])
            return (f'<div class="tp-table" role="region" aria-label="Table: {esc(" · ".join(cells[0]))}">'
                    f'<table><thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table></div>',
                    sum(words(" ".join(c)) for c in cells), "figure")

        if kind == "EXCERPT":
            need(rows, "has no lines")
            text = "\n".join(rows)
            return (f'<figure class="tp-figure"><pre class="tp-code" tabindex="0">{esc(text)}</pre>{cap}</figure>', words(text) // 2, "figure")

        if kind == "FIGURE":
            need(arg.endswith(".svg") and cap, "needs an .svg path and a CAPTION: line")
            svg = self.asset(arg, inline_svg=True)  # checked as a plain SVG; published as a file
            # The text alternative is the SVG's <title>, or an ALT: line for a file without one.
            title = re.search(r"<title[^>]*>(.*?)</title>", svg, re.S)
            need(title or fields.get("ALT"), f"{arg} has no <title>; give its text alternative on an ALT: line")
            alt = fields.get("ALT") or html.unescape(title.group(1).strip())
            size = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
            dims = f' width="{size.group(1)}" height="{size.group(2)}"' if size else ""
            chart = f'<div class="tp-chart" tabindex="0" role="region" aria-label="Figure: {esc(alt)}">'
            if fields.get("OVERLAY"):
                # OVERLAY: another SVG whose contents are drawn on top of this one, for a
                # correction to a label in a figure file that is not edited. The figure is
                # then inlined (not published as a file) so the overlay's style can hide the
                # original label; the overlay's own <style> and shapes go in after it.
                over = self.asset(fields["OVERLAY"], inline_svg=True, copy=False)
                inner = re.search(r"<svg[^>]*>(.*)</svg>", over, re.S)
                need(inner, f"{fields['OVERLAY']} is not an SVG")
                body = re.sub(r"\s(width|height)=\"[^\"]*\"", "", svg[:svg.index(">") + 1], count=2)
                body = re.sub(r"^<svg", f'<svg class="tp-chart-svg" role="img" aria-label="{esc(alt)}" focusable="false"', body, count=1)
                svg = body + svg[svg.index(">") + 1:svg.rindex("</svg>")] + inner.group(1) + "</svg>"
                return (f'<figure class="tp-figure">{chart}{svg}</div>{cap}</figure>', 0, "figure")
            src = self.asset(arg)
            return (f'<figure class="tp-figure">{chart}'
                    f'<img src="{esc(src)}" alt="{esc(alt)}"{dims} decoding="async"></div>{cap}</figure>', 0, "figure")

        if kind == "DEMO":
            files = arg.split()
            need(files and all(f.endswith(".json") for f in files) and not rows,
                 "needs one or more .json paths and nothing else on its lines")
            data = self.asset(files[0])
            more = " ".join(self.asset(f) for f in files[1:])
            self.scripts.append(self.asset("demo.js"))
            if (self.meta["assets"] / "demo.css").is_file():
                self.styles.append(self.asset("demo.css"))
            dcap = f'<figcaption class="tp-caption">{inline(fields["DEMO-CAPTION"])}</figcaption>' if fields.get("DEMO-CAPTION") else ""
            return (f'<figure class="tp-figure"><div class="tp-demo" data-src="{esc(data)}"'
                    + (f' data-more="{esc(more)}"' if more else "") + ' aria-live="polite">'
                    f'<p class="tp-demo-fallback">This demo needs JavaScript.</p></div>{dcap}{notes}</figure>', 0, "figure")

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
                    need(("synthetic" in tags) == (entry["system"] != "ground_truth")
                         and ("failed to stop" in tags) == bool(entry.get("stop_failure")),
                         f"the tags for {f} disagree with the audio manifest")
                clips += self.clip(f, label, tags, label)
            return (f'<figure class="tp-figure"><div class="tp-clips">{clips}</div>{cap}{notes}</figure>', 0, "figure")

        if kind == "AUDIO-GRID":
            need(arg.endswith(".json") and not rows, "needs the manifest's path")
            return (self.audio_grid(arg, cap, notes), 0, "figure")

        raise ContentError(f"{name}: {kind}: has no renderer")  # unreachable: MARKER_BLOCKS is complete

    def clip(self, f, label, tags, aria):
        kinds = "".join(f'<span class="tp-clip-kind">{esc(t)}</span>' if t == "synthetic" else f'<span class="tp-tag">{esc(t)}</span>' for t in tags)
        return (f'<div class="tp-clip"><div class="tp-clip-label">{inline(label)}</div>'
                + (f'<div class="tp-clip-tags">{kinds}</div>' if kinds else "")
                + f'<audio controls preload="none" src="{esc(f)}" aria-label="{esc(", ".join([aria] + tags))}"></audio></div>')

    def audio_manifest(self, any_clip):
        """{file name: clip} from manifest.json next to the clips, if there is one. Only the
        fields the page needs are read; the manifest itself is never published."""
        import json
        path = self.meta["assets"] / Path(any_clip.split("/", 1)[1] if any_clip.startswith(self.meta["slug"] + "/") else any_clip).parent / "manifest.json"
        if not path.is_file():
            return None
        return {c["file"]: c for c in json.loads(path.read_text(encoding="utf-8"))["clips"]}

    def audio_grid(self, arg, cap, notes):
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
        cols = [[x.strip() for x in l.split("|")] for l in cols_path.read_text(encoding="utf-8").splitlines() if l.strip()]
        if not all(len(c) == 3 and c[2] in ("real", "synthetic") for c in cols):
            raise ContentError(f"{name}: grid-columns.txt lines are 'system | label | real or synthetic'")
        by = {(c["sentence"], c["system"]): c for c in manifest["clips"]}
        sentences = sorted({c["sentence"] for c in manifest["clips"]})
        head = '<th scope="col"><span class="sr-only">Sentence</span></th>' + "".join(f'<th scope="col">{esc(c[1])}</th>' for c in cols)
        body = ""
        for n in sentences:
            tds = ""
            for system, label, kind in cols:
                c = by.get((n, system))
                if not c:
                    raise ContentError(f"{name}: the manifest has no clip for sentence {n}, {system}")
                tags = (["synthetic"] if kind == "synthetic" else []) + (["failed to stop"] if c.get("stop_failure") else [])
                f = self.asset(str(folder / c["file"]))
                kinds = "".join(f'<span class="tp-clip-kind">{esc(t)}</span>' if t == "synthetic" else f'<span class="tp-tag">{esc(t)}</span>' for t in tags)
                tds += (f'<td><span class="tp-grid-col" aria-hidden="true">{esc(label)}</span>'
                        f'<audio controls preload="none" src="{esc(f)}" aria-label="{esc(", ".join([f"Sentence {n}", label] + tags))}"></audio>'
                        + (f'<span class="tp-clip-tags">{kinds}</span>' if kinds else "") + "</td>")
            body += f'<tr data-sentence="{n}"><th scope="row">sentence {n}</th>{tds}</tr>'
        grid = (f'<div class="tp-grid" role="region" aria-label="Every clip, by sentence" tabindex="0">'
                f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')
        return f'<figure class="tp-figure tp-figure--wide tp-figure--grid">{grid}{cap}{notes}</figure>'

    def component(self, head, body):
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
                cls = ("tp-svg tp-svg--wide" if k == 0 else "tp-svg tp-svg--narrow") if len(files) > 1 else "tp-svg tp-svg--single"
                svg = re.sub(r"^<svg", f'<svg class="{cls}" role="img" aria-label="{esc(alt)}" focusable="false"', svg, count=1)
                svgs.append(svg)
            desc = fields.get("description")
            details = ""
            if desc:
                lis = "".join(f"<li>{inline(d)}</li>" for d in desc)
                details = f'<details class="tp-text-alt"><summary>The diagram as text</summary><ol>{lis}</ol></details>'
            return (f'<figure class="tp-figure">{"".join(svgs)}{self.caption(cap)}{details}</figure>', 0, "figure")

        if name == "code":
            text = "\n".join(rows).strip("\n")
            figure = f'<pre class="tp-code" tabindex="0">{esc(text)}</pre>'
            return (f'<figure class="tp-figure">{figure}{self.caption(cap) if cap else ""}</figure>', words(text) // 2, "figure")

        if name == "stats":
            items = "".join(
                f'<div class="tp-stat"><div class="tp-stat-label">{inline(c[0])}</div>'
                f'<div class="tp-stat-value">{inline(c[1])}</div>'
                + (f'<div class="tp-stat-label">{inline(c[2])}</div>' if len(c) > 2 and c[2] else "") + "</div>"
                for c in cells)
            return (f'<div class="tp-stats">{items}</div>', sum(words(" ".join(c)) for c in cells), "text")

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
                f'<div class="tp-bar"><span class="tp-bar-label">{inline(c[0])}</span>'
                f'<span class="tp-bar-track"><span class="tp-bar-fill tp-bar-fill--{"orange" if len(c) > 2 and c[2] == "orange" else "blue"}" style="width:{v / top * 100:.1f}%"></span></span>'
                f'<span class="tp-bar-value">{esc(c[1])}</span></div>'
                for c, v in zip(cells, vals))
            summary = "; ".join(f"{c[0]} {c[1]}" for c in cells)
            return (f'<figure class="tp-figure tp-panel"><div class="tp-panel-title">{inline(args)}</div>'
                    f'<div class="tp-bars" role="img" aria-label="{esc(args)}: {esc(summary)}">{rows_html}</div>'
                    f'{self.caption(cap) if cap else ""}</figure>', words(args), "figure")

        if name == "steps":
            items = "".join(
                f'<div class="tp-step"><div class="tp-step-no">{inline(c[0])}</div>'
                f'<div class="tp-step-title">{inline(c[1])}</div><div class="tp-step-text">{inline(c[2])}</div></div>'
                for c in cells)
            return (f'<div class="tp-steps">{items}</div>', sum(words(" ".join(c)) for c in cells), "text")

        if name == "audio":
            if len(cells) != 2 or not cap:
                raise ContentError("::: audio needs exactly two clips (real, synthetic) and a caption:")
            clips = ""
            for c in cells:
                kind, label, f = c[0], c[1], self.asset(c[2])
                if kind not in ("real", "synthetic"):
                    raise ContentError("::: audio rows start with real or synthetic")
                clips += (f'<div class="tp-clip"><div class="tp-clip-kind">{esc(kind)}</div>'
                          f'<div class="tp-clip-label">{inline(label)}</div>'
                          f'<audio controls preload="none" src="{esc(f)}" aria-label="{esc(kind)}: {esc(label)}"></audio></div>')
            return (f'<figure class="tp-figure"><div class="tp-clips">{clips}</div>{self.caption(cap)}</figure>', 0, "figure")

        if name == "demo":
            files = args.split()
            if len(files) != 2 or not files[0].endswith(".json") or not files[1].endswith(".js"):
                raise ContentError("::: demo needs a .json and a .js file")
            data, script = self.asset(files[0]), self.asset(files[1])
            self.scripts.append(script)
            fallback = " ".join(inline(r) for r in rows) or "This demo needs JavaScript."
            return (f'<figure class="tp-figure"><div class="tp-demo" data-src="{esc(data)}"><p class="tp-demo-fallback">{fallback}</p></div>'
                    f'{self.caption(cap) if cap else ""}</figure>', 0, "figure")

        raise ContentError(f"unknown component ::: {name}")


# ---------- the tracklist on the main page ----------

def read_tracklist(index_html):
    """[(number, title, side_label, side_id)] in page order."""
    tracks, side, side_id = [], None, None
    pat = re.compile(r'<h2 class="side-label" id="(\w+)-label">([^<]+)</h2>|<span class="track-no">(\d\d)</span>\s*'
                     r'<div class="track-body"><h3 class="track-title">(.*?)</h3>')
    for m in pat.finditer(index_html):
        if m.group(1):
            side_id, side = m.group(1), html.unescape(m.group(2))
        elif side:
            tracks.append((m.group(3), html.unescape(re.sub(r"<[^>]+>", "", m.group(4))), side, side_id))
    return tracks


def find_close(s, start, tag):
    """Index just past the tag that closes the element opening at `start`."""
    depth, pat = 0, re.compile(rf"<(/?){tag}\b[^>]*>")
    for m in pat.finditer(s, start):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.end()
    raise ContentError(f"unclosed <{tag}> in index.html")


# A row's secondary external link (e.g. "github →"), shown while it has no ready page.
EXT_LINK = re.compile(r'<span class="track-ext"><a href="([^"]+)" target="_blank" rel="noopener">([^<]+)</a></span>')


def ext_link(href, label):
    return f'<span class="track-ext"><a href="{href}" target="_blank" rel="noopener">{label}</a></span>'


def link_rows(index_html, pages):
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
        inner = s[m.end():end - len("</a>")]
        ext = dict(re.findall(r'data-ext-(href|label)="([^"]*)"', m.group(2)))
        if ext:
            inner = inner.replace("</div>", ext_link(ext["href"], ext["label"]) + "</div>", 1)
        kept = re.search(r' id="[^"]*"', m.group(2))  # a row's own anchor stays with it
        s = s[:m.start()] + f'<div class="{m.group(1)}"{kept.group(0) if kept else ""}>' + inner + "</div>" + s[end:]

    for number, slug in pages.items():
        m = re.search(rf'<(div|a) class="(track[^"]*)"([^>]*)>\s*<span class="track-no">{number}</span>', s)
        if not m:
            raise ContentError(f"track {number} is not on the main page")
        attrs = m.group(3).strip()  # only an id (the row's anchor) may sit beside the class
        if m.group(1) != "div" or (attrs and not re.fullmatch(r'id="[^"]+"', attrs)):
            raise ContentError(f"track {number}'s row on the main page must be a plain <div class=\"track ...\"> "
                               "(an external link goes in a span.track-ext inside it, or on the track page)")
        end = find_close(s, m.start(), "div")
        inner = s[s.index(">", m.start()) + 1:end - len("</div>")]
        extra = ""
        e = EXT_LINK.search(inner)
        if e:
            extra = f' data-ext-href="{e.group(1)}" data-ext-label="{e.group(2)}"'
            inner = inner[:e.start()] + inner[e.end():]
        if "<a " in inner:
            raise ContentError(f"track {number}'s row has a link other than its span.track-ext; a linked row can't hold one")
        s = s[:m.start()] + f'<a class="{m.group(2)}" href="tracks/{slug}/" data-page="{slug}"{extra}{" " + attrs if attrs else ""}>' + inner + "</a>" + s[end:]
    return s


# ---------- text read from a track's results file ----------
# A main-page row (span.track-live with data-template) or a page with "live:" in its front
# matter fills {field:kind} placeholders from a JSON results file at build time, so that
# regenerating the file before a build updates the text.

LIVE = re.compile(r'<span class="track-live" data-src="([^"]+)" data-template="([^"]*)">[^<]*</span>')
PLACEHOLDER = re.compile(r"\{(\w+):(count|matched|ratio|unchecked|matched_count|unchecked_count|total|voided|ratio_all|asof|asofnote|date)\}")
COUNT_KINDS = ("count", "matched", "ratio", "unchecked", "matched_count", "unchecked_count", "total", "voided", "ratio_all")  # need the list; without it the sentence goes


def entries(data, field):
    """Every entry of a list, voided ones included. None without the list."""
    value = data.get(field)
    return [x for x in value if isinstance(x, dict)] if isinstance(value, list) else None


def counted(data, field):
    """The entries of a list that count: not voided and, when the file has a clock_start,
    dated on or after it (its equity_base_snapshot, else its first_fill). None without the list."""
    value = entries(data, field)
    if value is None:
        return None
    clock = data.get("clock_start") if isinstance(data.get("clock_start"), dict) else {}
    since = clock.get("equity_base_snapshot") or clock.get("first_fill")
    return [x for x in value if not x.get("voided") and not (since and str(x.get("date", "")) < str(since))]


def live_value(data, field, kind):
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


def live_data(path, what):
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


def fill_template(template, data):
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


def fill_live(index_html, content=None):
    """The main page's live rows: data-src is a path under content/tracks or content/drafts,
    the template stays in the attribute, and the rendered sentence is the span's text."""
    content = content or ROOT / "content"

    def fill(m):
        src, template = m.group(1), html.unescape(m.group(2))
        path = next((content / f / src for f in ("tracks", "drafts") if (content / f / src).is_file()), None)
        data = live_data(path or content / "tracks" / src, src) if path else live_data(content / "tracks" / src, f"{src} (under content/tracks or content/drafts)")
        text = ""
        if data is not None:
            text, missing = fill_template(template, data)
            if missing:
                print(f"warning: {src} has no {', '.join(missing)}; " + ("the sentence" if text is None else "that clause") + " is left out", file=sys.stderr)
            text = text or ""
        return f'<span class="track-live" data-src="{src}" data-template="{m.group(2)}">{esc(text)}</span>'
    return LIVE.sub(fill, index_html)


def fill_live_lines(body, path, name):
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
            print(f"warning: {name}: {path.name} has no {', '.join(missing)}; " + ("a line" if text is None else "that text") + " is left out", file=sys.stderr)
        if text is not None:
            out.append(text)
    return "\n".join(out)


def check_live_data():
    """The Lately data file must exist for a build (a deploy can't go out without it); one
    that is present but unreadable only warns, and the site then shows "Lately is being updated."."""
    live = ROOT / LIVE_DATA
    if not live.is_file():
        raise ContentError(f"{LIVE_DATA} is missing; the site is not built without it "
                           "(the publish workflow commits it with git add -f; it is never written by hand)")
    try:
        d = json.loads(live.read_text(encoding="utf-8"))
        if not (isinstance(d, dict) and d.get("schema_version") == 1 and isinstance(d.get("sources"), dict)):
            raise ValueError("not schema_version 1 with a sources object")
    except ValueError as e:
        print(f"warning: {LIVE_DATA} is unreadable ({e}); the Lately section and pages will show 'Lately is being updated.'", file=sys.stderr)


# ---------- page output ----------

def clock(seconds):
    seconds = int(round(seconds / 10.0) * 10)
    return f"{seconds // 60}:{seconds % 60:02d}"


def side_for(tracklist, letter):
    """(side label, side id) for a draft's "side: c", for tracks not on the main page yet."""
    for _, _, label, side_id in tracklist:
        if label.lower().startswith(f"side {letter.lower()}."):
            return label, side_id
    raise ContentError(f"no side {letter!r} on the main page")


def render(meta, tracklist, pages_here, drafts_build, listed):
    page = Page(meta)
    home = "../../"
    album = meta["register"] == "album"
    progress = meta["register"] == "progress"
    stamped = album or progress  # reading-time stamps and the clock
    num = meta["track"]
    by_no = {t[0]: t for t in tracklist}
    if num not in by_no:
        raise ContentError(f"track {num} is not on the main page")
    _, _, side_label, side_id = by_no[num]
    on_list = num in {t[0] for t in tracklist[:listed]}
    side_short = side_label.split(",")[0]

    # Links to other track pages follow the previous/next rule below: a ready page links
    # only ready pages; a draft, in a --drafts build, links any page built with it.
    TRACK_LINKS.clear()
    TRACK_LINKS.update({n: m["slug"] for n, m in pages_here.items() if m["ready"] or not meta["ready"]})

    # sections, their reading time, and the blocks the play control pauses at
    sections, t = [], 0.0
    for s in meta["sections"]:
        if progress and s["title"] == "log":
            blocks = page.log(s["lines"])
        else:
            blocks = page.blocks(s["lines"], first=s is meta["sections"][0] and not progress)
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
        raise ContentError(f"{meta['source'].name}: ready: true but {page.held} HELD: note(s) remain; "
                           "held content needs a collaborator's agreement before it is published")

    seg_html, sec_html = [], []
    for k, s in enumerate(sections):
        stamp = f'<span class="tp-seg-time">{clock(s["start"])}</span>' if stamped else ""
        grow = max(1, round(s["secs"] / 20))
        seg_html.append(f'<a class="tp-seg" href="#{s["id"]}" style="flex-grow:{grow}" data-secs="{s["secs"]:.1f}">'
                        f'<span class="tp-seg-fill" aria-hidden="true"></span>{stamp}<span class="tp-seg-name">{esc(s["title"].lower())}</span></a>')
        label = (f"{clock(s['start'])} · " if stamped else "") + esc(s["title"].lower())
        if progress and s["title"] == "where it stands":
            iso, shown = meta["as_of_date"]
            label += f' <span class="tp-asof">as of <time datetime="{iso}">{shown}</time></span>'
        # A wide block (the audio grid) takes the section's full width, label column included;
        # anything after it continues in a second body.
        parts, cur = [], []
        for b, _ in s["blocks"]:
            if 'tp-figure--wide' in b[:120]:
                if cur:
                    parts.append(f'<div class="tp-section-body{" tp-section-body--after" if parts else ""}">{"".join(cur)}</div>')
                    cur = []
                parts.append(f'<div class="tp-section-wide">{b}</div>')
            else:
                cur.append(b)
        if cur or not parts:
            parts.append(f'<div class="tp-section-body{" tp-section-body--after" if parts else ""}">{"".join(cur)}</div>')
        body = "".join(parts)
        sec_html.append(f'<section class="tp-section{" tp-section--first" if k == 0 else ""}" id="{s["id"]}" aria-labelledby="{s["id"]}-h">'
                        f'<h2 class="tp-section-label" id="{s["id"]}-h">{label}</h2>'
                        f'{body}</section>')

    # previous and next among pages in this build. Ready pages only ever link ready
    # pages, so they come out the same with or without --drafts.
    linkable = [t for t in tracklist if t[0] in pages_here and (pages_here[t[0]]["ready"] or not meta["ready"])]
    order = [t[0] for t in linkable]
    pos = order.index(num)
    nav = []
    if pos > 0:
        p = by_no[order[pos - 1]]
        nav.append(f'<a class="tp-prev" href="../{pages_here[p[0]]["slug"]}/"><span class="tp-other-label">← previous · {p[0]}</span>'
                   f'<span class="tp-other-title">{esc(p[1])}</span></a>')
    if pos < len(order) - 1:
        n = by_no[order[pos + 1]]
        nav.append(f'<a class="tp-next" href="../{pages_here[n[0]]["slug"]}/" data-stop><span class="tp-other-label">next · {n[0]} →</span>'
                   f'<span class="tp-other-title">{esc(n[1])}</span></a>')
    else:
        nav.append(f'<a class="tp-next" href="{home}#{side_id}" data-stop><span class="tp-other-label">back to the tracklist →</span>'
                   f'<span class="tp-other-title">All tracks</span></a>')

    title = meta["title"]
    if progress:
        # one_line: is optional in this register; without it the question's opening paragraph describes the page.
        first = next((l for l in meta["sections"][0]["lines"] if l.strip()), "")
        desc = meta.get("description") or meta.get("one_line") or re.sub(r"<[^>]+>", "", html.unescape(inline(first.strip())))
    else:
        desc = meta.get("description") or meta["one_line"]
    if progress:
        # A progress page's hero: its one_line (when given), then who it's with, then the link.
        lede = (f'<p class="tp-lede">{inline(meta["one_line"])}</p>\n' if meta.get("one_line") else "")
        lede += f'<p class="tp-with">{inline(meta["with"])}</p>'
        if meta.get("link_url"):
            lede += f'\n<p class="tp-link"><a href="{esc(meta["link_url"])}"{new_tab(meta["link_url"])}>{esc(meta["link_label"])} →</a></p>'
    else:
        lede = f'<p class="tp-lede">{inline(meta["one_line"])}</p>'
    # A two-part story: this page's part, and a link to the other part under the same
    # rule as previous and next (a ready page links it only once it is ready too).
    part = ""
    if meta.get("part_label"):
        part = esc(meta["part_label"])
        other = pages_here.get(meta["part_other"])
        if other and meta["part_other"] in TRACK_LINKS:
            part += (f' · <a href="../{other["slug"]}/">{esc(other.get("part_label") or other["title"])} →</a>')
        part = f'<p class="tp-part">{part}</p>\n'
    url = f"{SITE}tracks/{meta['slug']}/"
    own_og = (meta["assets"] / "og.png").is_file()  # made by the optional tools/og.js
    if own_og:
        page.copies.append((meta["assets"] / "og.png", "og.png"))
    og = f"{url}og.png" if own_og else f"{SITE}images/og-image.png"
    og_alt = f"{title}: track {num} on Colin Nguyen's site" if own_og else "Colin Nguyen's site"
    draft = not meta["ready"]
    badge = meta.get("badge") or meta.get("status_label")
    scripts = "".join(f'\n<script src="{esc(s)}" defer></script>' for s in page.scripts)
    scripts += "".join(f'\n<link rel="stylesheet" href="{esc(s)}">' for s in page.styles)

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · Colin Nguyen</title>
<meta name="description" content="{esc(desc)}">
{'<meta name="robots" content="noindex, nofollow">' + chr(10) if draft else ''}<link rel="canonical" href="{url}">
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
<link rel="preload" href="../../fonts/archivo-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../../fonts/courier-prime-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../../css/site.css">
<link rel="stylesheet" href="../../css/track.css">
<script src="../../js/track.js" defer></script>{scripts}
</head>
<body class="tp-body tp-body--{meta['register']}">
<a class="skip-link" href="#main">Skip to content</a>
<div class="wrap">
<div class="page tp-page">
<header class="site-header">
<a class="site-name tp-home" href="{home}">colin nguyen</a>
<a class="tp-back" href="{home}#{side_id}">← back to the tracklist</a>
</header>
<main id="main" class="tp-main" data-total="{total:.1f}">
{'<p class="tp-draft">draft · not ready to publish · only built with --drafts</p>' + chr(10) if draft else ''}<section class="tp-hero" aria-labelledby="tp-title">
<p class="tp-kicker">{esc(side_short)} · track {num}{f" of {listed}" if on_list else " · not on the tracklist yet"}</p>
<div class="tp-heading"><span class="tp-no" aria-hidden="true">{num}</span><h1 class="tp-title" id="tp-title"><span class="sr-only">Track {num}: </span>{esc(title)}</h1></div>
{part}{lede}
</section>
<section class="tp-player" aria-label="Now reading">
<div class="tp-controls" hidden>
<span class="tp-controls-main">
<button type="button" class="tp-play" aria-describedby="tp-play-help"><span class="tp-play-icon" aria-hidden="true"></span><span class="tp-play-text">play</span></button>
{f'<span class="tp-clock"><span class="tp-clock-now">0:00</span> / {clock(total)}</span>' if stamped else ''}
<button type="button" class="tp-speed" aria-label="Playback speed, 1×">speed 1×</button>
</span>
{f'<span class="tp-badge">status: {esc(badge)}</span>' if badge else ''}
</div>
<p class="tp-help" id="tp-play-help" hidden>Play scrolls the page for you at reading pace. Scroll, tap or press space to pause.</p>
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


def write_pages(out_root, metas, tracklist, pages_here, drafts_build, listed):
    """Writes each page in metas to out_root/<slug>/, removing earlier output there that
    this build doesn't produce. Only folders build.py made (with OUT_MARK) are touched."""
    out_root.mkdir(exist_ok=True)
    keep = {m["slug"] for m in metas}
    for d in out_root.iterdir():
        if d.is_dir() and (d / OUT_MARK).exists() and d.name not in keep:
            shutil.rmtree(d)
    for m in metas:
        doc, copies = render(m, tracklist, pages_here, drafts_build, listed)
        out = out_root / m["slug"]
        if out.exists():
            if not (out / OUT_MARK).exists():
                raise ContentError(f"{out.relative_to(ROOT)} exists but was not made by build.py; not touching it")
            shutil.rmtree(out)
        out.mkdir()
        (out / OUT_MARK).write_text("")
        (out / "index.html").write_text(doc, encoding="utf-8")
        for src, rel in copies:
            (out / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out / rel)


def main():
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
                raise ContentError(f"{path.name}: marked ready but still in content/drafts; move it to content/tracks")
            if not meta["ready"] and not is_draft_dir:
                raise ContentError(f"{path.name}: not ready, so it belongs in content/drafts (git-ignored)")
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
                raise ContentError(f"{m['source'].name}: track {m['track']} is not on the main page, so it needs side:")
            tracklist.append((m["track"], m["title"], *side_for(tracklist[:listed], m["side"])))

    ready = sorted((m for m in metas if m["ready"]), key=lambda m: m["track"])
    building = [m for m in metas if m["ready"] or args.drafts]

    # The site itself only ever holds ready pages, with or without --drafts.
    out_root = ROOT / "tracks"
    write_pages(out_root, ready, tracklist, {m["track"]: m for m in ready}, False, listed)
    (out_root / ".gitignore").write_text(
        "# Written by build.py. Only pages marked ready may be committed; drafts stay local.\n*\n!.gitignore\n"
        + "".join(f"!/{m['slug']}/\n" for m in ready) + f"{OUT_MARK}\n", encoding="utf-8")

    schema = json.loads((ROOT / SCHEMA_PATH).read_text(encoding="utf-8"))
    data_pages = build_data_pages(schema)

    urls = [SITE] + [f"{SITE}lately/{m['feed']}/" for m in data_pages] + [f"{SITE}tracks/{m['slug']}/" for m in ready]
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"<url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")

    new_index = link_rows(index_html, {m["track"]: m["slug"] for m in ready})
    if new_index != index_before:
        index_path.write_text(new_index, encoding="utf-8")
    if (ROOT / "index.drafts.html").exists():  # the old preview file
        (ROOT / "index.drafts.html").unlink()

    # --drafts: the whole site again in _site-drafts/ (git-ignored), with every page built
    # and linked from its main page. A plain build removes it.
    preview = ROOT / PREVIEW_DIR
    if preview.exists():
        if not (preview / OUT_MARK).exists():
            raise ContentError(f"{PREVIEW_DIR}/ exists but was not made by build.py; not touching it")
        shutil.rmtree(preview)
    if args.drafts:
        shutil.copytree(ROOT, preview, ignore=lambda d, names: [
            n for n in names if (Path(d) == ROOT and n in PREVIEW_SKIP) or n in (".DS_Store", "__pycache__")])
        (preview / OUT_MARK).write_text("")
        write_pages(preview / "tracks", building, tracklist, {m["track"]: m for m in building}, True, listed)
        (preview / "index.html").write_text(link_rows(new_index, {m["track"]: m["slug"] for m in building}), encoding="utf-8")

    print(f"built {len(data_pages)} lately page(s): " + ", ".join(m["feed"] for m in data_pages))
    drafts = [m for m in metas if not m["ready"]]
    print(f"built {len(ready)} page(s): " + ", ".join(f"{m['track']} {m['slug']}" for m in ready))
    if args.drafts:
        print(f"preview with {len(drafts)} draft(s) in {PREVIEW_DIR}/: python3 -m http.server -d {PREVIEW_DIR} 8765 --bind 127.0.0.1")
    elif drafts:
        print(f"skipped {len(drafts)} draft(s); run with --drafts to preview them")


if __name__ == "__main__":
    try:
        main()
    except ContentError as e:
        sys.exit(f"build.py: {e}")
