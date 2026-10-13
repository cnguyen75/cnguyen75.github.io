# cnguyen75.github.io

Colin Nguyen's personal site. A single static page: plain HTML, one stylesheet, one small script. No framework, no build step.

**Not published.** There is no git remote and GitHub Pages is not enabled. Some content (the Ohio State lab entries and the receptivity numbers) is awaiting other people's agreement, so do not push until Colin says so.

## Structure

```
index.html                 the whole page: header, hero, sides A–C, previously, Side D (lately), footer
css/site.css               all styles; colours are CSS variables at the top (:root)
js/lately.js               draws the Side D panels from data
data/lately.schema.json    JSON Schema (draft 2020-12) for the Lately data file
data/lately.sample.json    sample data matching the approved design's placeholder values
data/lately.json           live data, written by the pipeline; git-ignored, never committed
fonts/                     self-hosted Archivo (latin + vietnamese), Courier Prime, Caveat (latin) woff2 and their OFL licences
images/colin-portrait.jpg  hero photo (faded in CSS, not in the file)
images/og-image.png        1200×630 social preview, a render of the hero
resume/                    the two résumé PDFs (web versions, no phone number)
build.py                   builds the track pages (Python 3 standard library only)
content/tracks/            one Markdown file per ready track page, plus a folder of its assets
content/drafts/            the same for drafts; git-ignored, never committed
tracks/<slug>/             built track pages; only ready ones can be committed (tracks/.gitignore)
css/track.css, js/track.js the track page template's styles and its reading bar and play control
sitemap.xml                the main page and ready track pages, written by build.py
tools/                     optional developer tools (og.js renders preview cards); nothing depends on them
favicon.svg, favicon-32.png, apple-touch-icon.png
.nojekyll                  stops GitHub Pages running Jekyll once the site is published
```

The design source of truth is `~/Personal/site-handoff/` (`HANDOFF.md` and `design/*.html`). Text on the page is copied from those files verbatim, including bracketed placeholders.

The page makes no requests to other hosts at runtime. Fonts, images and data are all served from this folder.

## How the Lately data is loaded

`js/lately.js` runs after the page parses:

1. It fetches `data/lately.json`.
2. If that file is missing, is not valid JSON, or does not have `schema_version: 1` and a `sources` object, it loads `data/lately.sample.json` instead and shows a visible **sample data** label, plus the sentence "Sample data shown." in the intro.
3. Each panel (fantasy, watching, listening, eating, lifting) is drawn independently inside its own `try`. If a panel's data is missing it shows "Not connected yet."; if the data is present but malformed it shows "Couldn't draw this panel right now." Other panels and the rest of the page are unaffected.
4. Each feed has an entry in `sources` with a `status` (`ok`, `error`, `stale`, `pending`, `disabled`) and a `last_ok_at` time:
   - `ok`: the panel draws normally.
   - not `ok`, with `last_ok_at`: the panel draws the data in the file (the job should leave the last good data in place) and says "last good data from <date>".
   - not `ok`, with no `last_ok_at`: the panel (or, for fantasy, that team's row) shows "Not connected yet."
   - The status chips under the intro show each source's state and last update time, in Pacific time. `message` is shown in place of the status word, so keep it short and public (for example "awaiting approval"). Never put error details or secrets in it.

Rules the renderer applies to the data:

- **Watching:** the hours total is the sum of the weekly bars. There is no separate total field. When every week is zero, the chart, legend and table toggle and the hours total are replaced by "No episodes or films logged in the last 12 weeks"; the Recently list stays. If no recent item has a rating, the score column is dropped.
- **Fantasy:** `win_probability` may be `null`. The page then shows the team's `win_probability_note` in place of the bar, or "not available this week" if there is no note. A note is ignored when `win_probability` is a number. The player chart shows points above replacement **per game played**; negative values draw leftward from a zero line in orange. The header lists only sources that have at least one team drawn on the page. A team's second line (platform, league, status) is hidden when it would only repeat the platform already named in the team label.
- **Watching:** optional `currently_watching` is shown as "Watching now" above Recently: type square, linked title and progress ("S2 · E5", "E5" without a season, title only when both are null). Optional `rankings` gets its own full-width card, "My rankings" (with "data from Simkl"), below the three panels: numbered top-five lists for Films, Shows and Anime side by side (stacked on narrow screens), with linked titles and years. The card is hidden when the field is absent or all three lists are empty. Each heading has its type colour square plus a text label. Empty lists are hidden, and "Watching now" is hidden when its field is absent or empty.
- **Watching:** a recent item may have `status` `"watched"` (the default when the field is missing) or `"finished"` (marked complete in bulk on Simkl, with no watch date or season). Finished items show a small "finished" label instead of a season, keep their Simkl link, and are listed after all watched items whatever their order in the file.
- **Listening:** "Plays, last 30 days" is the sum of `plays_by_hour`; "Top artists, last 30 days" uses the same window, so it covers the same window as the hour strip (`plays_this_month` is deprecated and ignored). Any hour with at least one play starts at the second blue shade, so it is clearly different from the zero colour. The top-artists chart stays even with one artist.
- **Eating:** "Recently tried" lists `recent`, the ten restaurants most recently ranked on Beli, newest first, with name, city and score. There are no rank numbers, dates or relative times; the order is the only signal. Scores show two decimals. Cuisine bars: at most six named cuisines, scaled to the largest named one. The remainder is a text line under the chart, "plus N across K other cuisines" when the cuisines are listed individually, or "Other: N" when the file gives a lumped "Other" entry.
- **Lifting:** optional `lifting` (from Hevy) gets its own full-width card below "My rankings". An older file without it still validates, and the card says "Not connected yet." The header reads "hevy · data through <data_through>"; it never says "live", and the source chip says when the job last ran. With `workout_count` 0 the card says "No workouts logged yet."
  - Stats: workouts logged (since `first_workout`), current streak (`streak_weeks`, "weeks at N+ sessions" from `streak_min_sessions`), and sessions in the last 4 weeks (the last four `weeks`, this week included).
  - "Estimated one-rep max, main lifts": one small line chart per lift from `history`, each on its own scale, with the latest value at the line end; exercise name, a "machine" tag when `machine` is true, current and best. One Epley note under the group. A lift with one session draws a single dot.
  - "Sessions and volume, last 12 weeks": bar height is `volume`, the number on each bar is `sessions`; the last (unfinished) week is the lighter blue and labelled "this week". All-zero weeks show "No workouts logged in the last 12 weeks".
  - "Sets by muscle group, last 4 weeks": the four weeks summed per group, largest first, at most eight named bars plus an "Other" bar (a group Hevy calls `other` goes into it), with the folded group names in a line underneath. Hidden when there are no sets.
  - "Recent personal records": newest first, at most five; hidden when empty.
  - "Body weight": a line chart with every measurement marked and the latest labelled; with fewer than three measurements, a short list instead. Hidden when there are none.

All text from the data file is inserted with `textContent`, never as HTML, and links are only rendered for `https://` URLs. Watching titles must link to their Simkl page (the schema requires `https://simkl.com/...`).

To check a data file against the schema, run any draft 2020-12 validator, for example:

```sh
npx -p ajv-cli@5 -p ajv-formats@3 ajv validate --spec=draft2020 -c ajv-formats \
  -s data/lately.schema.json -d data/lately.json
```

### Charts and accessibility

Charts are HTML and CSS, as in the design. Every mark has a `title` for hover, and each chart container has `role="img"` and an `aria-label` that lists its values. Every chart has a **view as table** button that swaps it for a real `<table>`. Wins and losses use filled versus outlined squares with a W or L, never colour alone.

## Track pages

Each track can have its own page at `/tracks/<slug>/`, built from one Markdown file. Adding a page means adding a file and running the build:

```sh
python3 build.py            # ready pages only: what gets committed
python3 build.py --drafts   # also drafts, for local preview
```

The design source is `~/Personal/site-handoff/design/track-page-reference.html`.

**The content file** is `content/tracks/NN-slug.md` (or `content/drafts/` while it is a draft), with its assets in a folder named after the slug beside it. Front matter:

```
track: 03                 # the number on the main page; the title and side come from there
slug: coding-agent-operations
title: Running coding agents as a team process
register: plain           # plain (Athena, research) or album (side projects)
ready: false              # true only when cleared to publish
one_line: …               # the lede and the page description
badge: in progress        # optional, shown as "status: …" in the reading bar (status_label: works too)
side: c                   # only for a draft whose track is not on the main page yet
attribution: …            # optional, repeated under the credits unless they have a data row
```

A draft may be for a track that is not on the main page yet. It needs `side:`, sorts after the listed tracks, and says "not on the tracklist yet". A ready page must be on the main page.

The body is `## Section` headings (an `{#id}` after the heading sets its anchor) with paragraphs, `- ` lists, `**bold**`, `*italic*`, `` `code` `` and `[links](https://…)`. A paragraph starting with `> ` is the large lead paragraph. Components are fenced with `::: name` and `:::`:

| Component | Body |
|---|---|
| `::: figure a.svg [narrow.svg]` | `caption:`, `alt:` and `description:` lines. The SVG is inlined, so it uses the site's colours through `dg-*` classes. A second file is shown instead below 640px. The `description:` lines become "The diagram as text". |
| `::: code` | the excerpt as written, plus an optional `caption:` |
| `::: stats` | `label \| value \| note` rows |
| `::: bars Title` | `label \| number [\| orange]` rows and a `caption:` |
| `::: steps` | `step 1 \| title \| text` rows |
| `::: credits` | `role \| text` rows |
| `::: audio` | two rows, `real \| label \| file` and `synthetic \| label \| file`, and a `caption:`; players have no autoplay and `preload="none"` |
| `::: demo data.json demo.js` | fallback text; the script is added to that page only and reads the JSON from the slot's `data-src` |

**Plain-text markers.** Drafts from the handoff folder mark components in plain text instead, and the build reads them as written, so those files are imported unchanged. A marker starts a block that runs to the next blank line. Paths are written as `<slug>/path` and resolve inside the page's asset folder. Captions from markers are used exactly as written, numbering included. On these pages a paragraph that is bold throughout and opens the page becomes the lead.

| Marker | Rows and attached lines | Renders as |
|---|---|---|
| `STEPS:` | `1. title \| text` | steps |
| `EXCERPT:` | the excerpt, then `CAPTION:` | code excerpt |
| `STATS:` | `value \| label \| note` | stat row |
| `FIGURE: path.svg` | `CAPTION:` | the SVG as an image (alt text from its `<title>`); below 640px it keeps a readable size and scrolls inside its box |
| `TABLE:` | a header row, then rows, cells split by `\|` | table; below 640px each row becomes a block with labelled values |
| `CREDITS:` | `role \| text` | credits, with a bare `https://` value linked; the front matter's `attribution:` is repeated under them unless a `data` row already credits the data |
| `DEMO: path.json` | `BEHAVIOUR:` (not shown), `DEMO-CAPTION:`, `ATTRIBUTION:` | demo slot; needs `demo.js` (and optionally `demo.css`) in the asset folder, added to that page only |
| `AUDIO-PAIR:` | `file \| label [\| synthetic[, failed to stop]]` and `CAPTION:` | audio clips; tags are checked against a `manifest.json` beside the clips when there is one |
| `AUDIO-GRID: manifest.json` | `BEHAVIOUR:` (not shown), `AUDIO-NOTE:`, `ATTRIBUTION:` | a table of clips, sentences as rows; columns come from `grid-columns.txt` beside the manifest (`system \| label \| real or synthetic`). Only file names, systems and `stop_failure` are read, and the manifest is not published. It takes the section's full width; below 640px it shows one sentence at a time. |

Any other capitalised `NAME:` line at the start of a block stops the build. Every audio player has native controls and `preload="none"`, and starting one pauses any other.

**Registers.** `album` pages show reading-time stamps on the sections and a clock in the reading bar; `plain` pages show neither. Both have the reading bar and play control. Reading time is 230 words a minute, plus 6 seconds for each figure, excerpt, chart or demo.

**The reading bar and play control** (`js/track.js`):
- The bar's segments link to the sections; the one being read is underlined and marked `aria-current`, and the part already read fills in.
- Once the bar scrolls away, a compact copy is fixed to the top of the window.
- Play is off until pressed and scrolls at reading pace, holding at figures. Scrolling, tapping, the arrow or page keys, or space pause it, and play resumes from wherever the page is.
- Speed cycles through 1×, 1.5× and 2×.
- Play stops when the "next" link is in view and never follows it; pressing play there starts again from the top.
- With `prefers-reduced-motion` it jumps from section to section instead of gliding.
- Without JavaScript the play control is hidden and the section links still work.

**Ready and drafts.** A draft lives in `content/drafts/`, which git ignores, so nothing about it reaches the repository. A plain build skips drafts and deletes any draft output left from a `--drafts` build. `--drafts` builds them with a "draft" marker and `noindex`. To publish a page, set `ready: true`, move the file and its folder to `content/tracks/`, and build. The build then:
- writes the page;
- adds it to `sitemap.xml`;
- allows it in `tracks/.gitignore`;
- points its row on the main page at the page (the row's own link, such as "github →", is kept in data attributes and restored if the page is later unreadied).

Previous and next links follow the tracklist order and skip tracks without a page. A ready page links only to other ready pages, so it builds the same with or without `--drafts`.

**Social preview.** If the page's asset folder has an `og.png` (1200×630), it becomes that page's preview image; otherwise the main page's image is used. The build never makes or requires these images.

`tools/og.js` is an optional developer tool that renders the cards (number, title and one-line description in the site's type) into each page's content folder. It needs Node and an installed Chrome; `playwright-core` downloads no browser.

```sh
cd tools && npm install && cd ..        # once
node tools/og.js                        # all pages, or name slugs: node tools/og.js paper-trader
python3 build.py                        # copies each card next to its page
```

Set `CHROME` to Chrome's executable if it isn't at the macOS default path. Cards for ready pages live in `content/tracks/<slug>/` and are committed along with the built page. Cards for drafts stay in the ignored `content/drafts/`.

## Preview locally

`fetch()` doesn't work from `file://`, so serve the folder over HTTP:

```sh
cd ~/Documents/cnguyen75.github.io
python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/
```

When `data/lately.json` exists (the pipeline writes it), the page shows that data; without it you see the sample. The file is in `.gitignore`.

## Résumés

`resume/` holds copies of the web versions built from LaTeX in `~/Personal/site-handoff/resume-latex/web/` (these leave out the phone number). To update, rebuild there and copy both PDFs over the ones in `resume/`. The hero "Résumé (PDF)" link points to the AI Engineer résumé; the footer reads "résumé: engineering · research" and links to both.

## Open items

- The "how this is built" link in Side D and all Lately values are placeholders until the nightly job exists.
