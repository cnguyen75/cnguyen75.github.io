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
"""

import argparse
import html
import math
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = "https://cnguyen75.github.io/"
WPM = 230  # reading pace for timestamps and the play control
FIGURE_SECS = 6  # time given to each figure, code excerpt or demo; play holds still for part of it
REGISTERS = ("album", "plain")
REQUIRED = ("track", "slug", "title", "register", "ready", "one_line")
OUT_MARK = ".built-by-build-py"  # marks folders this script may delete

# Plain-text component markers, as handoff drafts write them ("STEPS:", "FIGURE: path", ...).
# A marker starts a block that runs to the next blank line; the second group only
# ever follows one of the first.
MARKER = re.compile(r"([A-Z][A-Z-]*[A-Z]):\s*(.*)$")
MARKER_BLOCKS = ("STEPS", "EXCERPT", "DEMO", "STATS", "FIGURE", "TABLE", "CREDITS", "AUDIO-PAIR", "AUDIO-GRID")
MARKER_FIELDS = ("CAPTION", "BEHAVIOUR", "DEMO-CAPTION", "ATTRIBUTION", "AUDIO-NOTE")


class ContentError(Exception):
    pass


def esc(s):
    return html.escape(str(s), quote=True)


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
    missing = [k for k in REQUIRED if not meta.get(k)]
    if missing:
        raise ContentError(f"{path.name}: front matter is missing {', '.join(missing)}")
    if meta["register"] not in REGISTERS:
        raise ContentError(f"{path.name}: register must be album or plain")
    if meta["ready"] not in ("true", "false"):
        raise ContentError(f"{path.name}: ready must be true or false")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", meta["slug"]):
        raise ContentError(f"{path.name}: slug must be lowercase words joined by hyphens")
    meta["ready"] = meta["ready"] == "true"
    meta["track"] = meta["track"].zfill(2)
    meta["source"] = path
    meta["assets"] = path.parent / meta["slug"]
    meta["sections"] = parse_sections(m.group(2), path.name)
    return meta


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


# ---------- Markdown subset ----------
# Paragraphs, "> " lead paragraph (or a page's opening paragraph if bold throughout), "- " lists,
# **bold**, *italic*, `code`, [text](https://...), component blocks fenced by
# "::: name args" ... ":::", and the plain-text markers above.

def inline(s):
    out, last = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)\s]+)\)", s):
        out.append(inline_text(s[last:m.start()]))
        url = m.group(2)
        if not re.match(r"(https://|mailto:|#|\.\./)", url):
            raise ContentError(f"link {url!r} must be https://, mailto:, #anchor or relative")
        out.append(f'<a href="{esc(url)}">{inline_text(m.group(1))}</a>')
        last = m.end()
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
            svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg).strip()
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
        allowed = {"EXCERPT": {"CAPTION"}, "FIGURE": {"CAPTION"}, "AUDIO-PAIR": {"CAPTION"},
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

        if kind == "CREDITS":
            need(cells and all(len(c) == 2 for c in cells), "rows are 'role | name'")
            def value(v):
                return f'<a href="{esc(v)}">{esc(v)}</a>' if re.fullmatch(r"https://\S+", v) else inline(v)
            items = "".join(f'<div class="tp-credit"><dt>{inline(c[0])}</dt><dd>{value(c[1])}</dd></div>' for c in cells)
            # The page's attribution line, if any, is repeated with the credits.
            attribution = f'<p class="tp-attribution">{inline(self.meta["attribution"])}</p>' if self.meta.get("attribution") else ""
            return (f'<div class="tp-credits-block"><dl class="tp-credits">{items}</dl>{attribution}</div>',
                    sum(words(" ".join(c)) for c in cells) + words(self.meta.get("attribution", "")), "text")

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
            title = re.search(r"<title[^>]*>(.*?)</title>", svg, re.S)
            need(title, f"{arg} has no <title> to use as its text alternative")
            alt = html.unescape(title.group(1).strip())
            size = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
            dims = f' width="{size.group(1)}" height="{size.group(2)}"' if size else ""
            src = self.asset(arg)
            return (f'<figure class="tp-figure"><div class="tp-chart" tabindex="0" role="region" aria-label="Figure: {esc(alt)}">'
                    f'<img src="{esc(src)}" alt="{esc(alt)}"{dims} decoding="async"></div>{cap}</figure>', 0, "figure")

        if kind == "DEMO":
            need(arg.endswith(".json") and not rows, "needs a .json path and nothing else on its lines")
            data = self.asset(arg)
            self.scripts.append(self.asset("demo.js"))
            if (self.meta["assets"] / "demo.css").is_file():
                self.styles.append(self.asset("demo.css"))
            dcap = f'<figcaption class="tp-caption">{inline(fields["DEMO-CAPTION"])}</figcaption>' if fields.get("DEMO-CAPTION") else ""
            return (f'<figure class="tp-figure"><div class="tp-demo" data-src="{esc(data)}" aria-live="polite">'
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

        if name == "credits":
            items = "".join(
                f'<div class="tp-credit"><dt>{inline(c[0])}</dt><dd>{inline(c[1])}</dd></div>' for c in cells)
            return (f'<dl class="tp-credits">{items}</dl>', sum(words(" ".join(c)) for c in cells), "text")

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
        elif side and side_id != "previously":
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


def link_rows(index_html, ready):
    """Points each track row with a ready page at it; restores rows whose page went away.
    Idempotent: it first undoes its own earlier changes (marked with data-page)."""
    def restore(m):
        attrs = dict(re.findall(r'(data-[\w-]+)="([^"]*)"', m.group(0)))
        tag = attrs.get("data-orig-tag", "div")
        href = f' href="{attrs["data-orig-href"]}"' if attrs.get("data-orig-href") else ""
        cls = m.group(1).replace(" track--wrap", "") if attrs.get("data-orig-class") else m.group(1)
        return f'<{tag} class="{cls}"{href}>'

    s = index_html
    while True:
        m = re.search(r'<a class="(track[^"]*)" href="[^"]*" data-page="[^"]*"[^>]*>', s)
        if not m:
            break
        end = find_close(s, m.start(), "a")
        opening = restore(m)
        tag = re.match(r"<(\w+)", opening).group(1)
        inner = s[m.end():end - len("</a>")]
        meta_orig = re.search(r'data-orig-meta="([^"]*)"', m.group(0))
        if meta_orig:
            inner = re.sub(r'(<span class="track-meta">)[^<]*(</span>)', lambda x: x.group(1) + meta_orig.group(1) + x.group(2), inner, count=1)
        else:
            inner = re.sub(r'\s*<span class="track-meta" data-added>[^<]*</span>', "", inner)
        s = s[:m.start()] + opening + inner + f"</{tag}>" + s[end:]

    for number, slug in ready.items():
        m = re.search(rf'<(div|a) class="(track[^"]*)"( href="([^"]*)")?>\s*<span class="track-no">{number}</span>', s)
        if not m:
            raise ContentError(f"track {number} is not on the main page")
        tag, cls, orig_href = m.group(1), m.group(2), m.group(4) or ""
        end = find_close(s, m.start(), tag)
        inner = s[s.index(">", m.start()) + 1:end - len(f"</{tag}>")]
        meta = re.search(r'<span class="track-meta">([^<]*)</span>', inner)
        extra = ""
        if meta:
            extra = f' data-orig-meta="{meta.group(1)}"'
            inner = inner.replace(meta.group(0), '<span class="track-meta">track page →</span>', 1)
        else:
            inner = inner.rstrip("\n") + '\n<span class="track-meta" data-added>track page →</span>\n'
        if "track--wrap" not in cls:
            cls += " track--wrap"
            extra += ' data-orig-class="1"'
        opening = (f'<a class="{cls}" href="tracks/{slug}/" data-page="{slug}" data-orig-tag="{tag}"'
                   + (f' data-orig-href="{orig_href}"' if orig_href else "") + extra + ">")
        s = s[:m.start()] + opening + inner + "</a>" + s[end:]
    return s


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
    album = meta["register"] == "album"
    num = meta["track"]
    by_no = {t[0]: t for t in tracklist}
    if num not in by_no:
        raise ContentError(f"track {num} is not on the main page")
    _, _, side_label, side_id = by_no[num]
    on_list = num in {t[0] for t in tracklist[:listed]}
    side_short = side_label.split(",")[0]

    # sections, their reading time, and the blocks the play control pauses at
    sections, t = [], 0.0
    for s in meta["sections"]:
        blocks = page.blocks(s["lines"], first=s is meta["sections"][0])
        timed = []
        for b, w, kind in blocks:
            secs = w / WPM * 60 + (FIGURE_SECS if kind == "figure" else 0)
            attrs = f' data-secs="{secs:.2f}"' + (" data-pause" if kind == "figure" else "")
            timed.append((re.sub(r"^<(\w+)", lambda m: f"<{m.group(1)}{attrs}", b, count=1), secs))
        secs = sum(x for _, x in timed)
        sections.append(dict(s, blocks=timed, start=t, secs=secs))
        t += secs
    total = t

    seg_html, sec_html = [], []
    for k, s in enumerate(sections):
        stamp = f'<span class="tp-seg-time">{clock(s["start"])}</span>' if album else ""
        grow = max(1, round(s["secs"] / 20))
        seg_html.append(f'<a class="tp-seg" href="#{s["id"]}" style="flex-grow:{grow}" data-secs="{s["secs"]:.1f}">'
                        f'<span class="tp-seg-fill" aria-hidden="true"></span>{stamp}<span class="tp-seg-name">{esc(s["title"].lower())}</span></a>')
        label = (f"{clock(s['start'])} · " if album else "") + esc(s["title"].lower())
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
        nav.append(f'<a class="tp-next" href="../../#{side_id}" data-stop><span class="tp-other-label">back to the tracklist →</span>'
                   f'<span class="tp-other-title">All tracks</span></a>')

    title = meta["title"]
    desc = meta.get("description") or meta["one_line"]
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
<a class="site-name tp-home" href="../../">colin nguyen</a>
<a class="tp-back" href="../../#{side_id}">← back to the tracklist</a>
</header>
<main id="main" class="tp-main" data-total="{total:.1f}">
{'<p class="tp-draft">draft · not ready to publish · only built with --drafts</p>' + chr(10) if draft else ''}<section class="tp-hero" aria-labelledby="tp-title">
<p class="tp-kicker">{esc(side_short)} · track {num}{f" of {listed}" if on_list else " · not on the tracklist yet"}</p>
<div class="tp-heading"><span class="tp-no" aria-hidden="true">{num}</span><h1 class="tp-title" id="tp-title"><span class="sr-only">Track {num}: </span>{esc(title)}</h1></div>
<p class="tp-lede">{inline(meta['one_line'])}</p>
</section>
<section class="tp-player" aria-label="Now reading">
<div class="tp-controls" hidden>
<span class="tp-controls-main">
<button type="button" class="tp-play" aria-describedby="tp-play-help"><span class="tp-play-icon" aria-hidden="true"></span><span class="tp-play-text">play</span></button>
{f'<span class="tp-clock"><span class="tp-clock-now">0:00</span> / {clock(total)}</span>' if album else ''}
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
</div>
</div>
</body>
</html>
"""
    return doc, page.copies


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--drafts", action="store_true", help="also build drafts, for local preview")
    args = ap.parse_args()

    index_path = ROOT / "index.html"
    index_html = index_path.read_text(encoding="utf-8")
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

    building = [m for m in metas if m["ready"] or args.drafts]
    pages_here = {m["track"]: m for m in building}
    out_root = ROOT / "tracks"
    out_root.mkdir(exist_ok=True)

    # Remove earlier output that this build does not produce (e.g. drafts after a --drafts build).
    keep = {m["slug"] for m in building}
    for d in out_root.iterdir():
        if d.is_dir() and (d / OUT_MARK).exists() and d.name not in keep:
            shutil.rmtree(d)

    for m in building:
        doc, copies = render(m, tracklist, pages_here, args.drafts, listed)
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

    ready = sorted((m for m in metas if m["ready"]), key=lambda m: m["track"])
    (out_root / ".gitignore").write_text(
        "# Written by build.py. Only pages marked ready may be committed; drafts stay local.\n*\n!.gitignore\n"
        + "".join(f"!/{m['slug']}/\n" for m in ready) + f"{OUT_MARK}\n", encoding="utf-8")

    urls = [SITE] + [f"{SITE}tracks/{m['slug']}/" for m in ready]
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"<url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")

    new_index = link_rows(index_html, {m["track"]: m["slug"] for m in ready})
    if new_index != index_html:
        index_path.write_text(new_index, encoding="utf-8")

    drafts = [m for m in metas if not m["ready"]]
    print(f"built {len(building)} page(s): " + ", ".join(f"{m['track']} {m['slug']}{' (draft)' if not m['ready'] else ''}" for m in building))
    if drafts and not args.drafts:
        print(f"skipped {len(drafts)} draft(s); run with --drafts to preview them")


if __name__ == "__main__":
    try:
        main()
    except ContentError as e:
        sys.exit(f"build.py: {e}")
