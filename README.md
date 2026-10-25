# cnguyen75.github.io

Colin Nguyen's personal site. A single static page: plain HTML, one stylesheet, one small script. No framework, no build step.

**Not published.** There is no git remote and GitHub Pages is not enabled. Some content (the Ohio State lab entries and the receptivity numbers) is awaiting other people's agreement, so do not push until Colin says so.

## Structure

```
index.html                 the whole page: header, hero, sides A–D (D is lately), footer
01/ … 08/                  stubs: /01 to /08 send the browser to that row on the main page (#track-01 …); side A has no pages
css/site.css               all styles; colours, type and spacing are the tokens at the top (:root), described in DESIGN.md
js/lately.js               draws the Side D panels from data
js/lately-depth.js         draws the lately/<feed>/ pages and the panels' headline numbers from the analysis block
content/lately/            one file per Lately feed page (the "data" register)
lately/<feed>/             built Lately pages: frames only, no data (committed)
tests/                     python3 tests/run.py (logs to ~/Personal/site-review-<date>/test-logs/); fixtures/analysis.json has placeholder names only, fixtures/lately.sample.json is the suite's data file
data/lately.schema.json    JSON Schema (draft 2020-12) for the Lately data file
data/lately.json           live data, written by the pipeline; in .gitignore so it is never added by hand, and committed only by the publish workflow (git add -f); the build fails without it
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
2. If that file is missing, is not valid JSON, or does not have `schema_version: 1` and a `sources` object, the section shows one line, "Lately is being updated.", and nothing else; the `lately/<feed>/` pages do the same. There is no sample data on the site.
3. Each panel (fantasy, watching, listening, eating, lifting) is drawn independently inside its own `try`. If a panel's data is missing it shows "Not connected yet."; if the data is present but malformed it shows "Couldn't draw this panel right now." Other panels and the rest of the page are unaffected.
4. Each feed has an entry in `sources` with a `status` (`ok`, `error`, `stale`, `pending`, `disabled`) and a `last_ok_at` time:
   - `ok`: the panel draws normally.
   - not `ok`, with `last_ok_at`: the panel draws the data in the file (the job should leave the last good data in place) and says "last good data from <date>".
   - not `ok`, with no `last_ok_at`: the panel (or, for fantasy, that team's row) shows "Not connected yet."
   - The status chips under the intro show each source's state and last update time, in Pacific time. `message` is shown in place of the status word, so keep it short and public (for example "awaiting approval"). Never put error details or secrets in it.

Rules the renderer applies to the data:

- **Watching:** the hours total is the sum of the weekly bars. There is no separate total field. When every week is zero, the chart, legend and table toggle and the hours total are replaced by "No episodes or films logged in the last 12 weeks"; the Recently list stays. If no recent item has a rating, the score column is dropped.
- **Fantasy:** `win_probability` may be `null`. The page then shows the team's `win_probability_note` in place of the bar, or "not available this week" if there is no note. A note is ignored when `win_probability` is a number. The player chart shows points above replacement **per game played**; negative values draw leftward from a zero line in orange. The header lists only sources that have at least one team drawn on the page. A team's second line (platform, league, status) is hidden when it would only repeat the platform already named in the team label.
- **Watching:** optional `currently_watching` is shown as "Watching now" above Recently: type square, linked title and progress ("S2 · E5", "E5" without a season, title only when both are null). Optional `rankings` is "My rankings" on the watching page: one tab group (Films, Shows, Anime; Films first) with the selected type's ranking as a numbered list, each title linked, with its tier chip when the analysis tiers it, the first ten shown and a "show all N" button for the rest. The block is hidden when the field is absent or every list is empty. "Watching now" is hidden when its field is absent or empty.
- **Watching:** a recent item may have `status` `"watched"` (the default when the field is missing) or `"finished"` (marked complete in bulk on Simkl, with no watch date or season). Finished items show a small "finished" label instead of a season, keep their Simkl link, and are listed after all watched items whatever their order in the file.
- **Listening:** "Plays, last 30 days" is the sum of `plays_by_hour`; "Top artists, last 30 days" uses the same window, so it covers the same window as the hour strip (`plays_this_month` is deprecated and ignored). While the archive is younger than 30 days the three labels say "since 11 Oct" instead: the start is the analysis's `listening.heatmap` as_of date minus its n (days since the first play) plus one.
- **Watching:** "No episodes or films logged in the last 12 weeks" shows only when nothing is logged: no hours, nothing in "Watching now" and nothing in Recently. Any hour with at least one play starts at the second blue shade, so it is clearly different from the zero colour. The top-artists chart stays even with one artist.
- **Eating:** "Recently tried" lists `recent`, the ten restaurants most recently ranked on Beli, in alphabetical order with name and score only, so the list carries no date information (no city, no recency order). Cities appear only in the in-depth score-by-city statistic, and the home city is never named ("my most-ranked city"). Scores show two decimals. Cuisine bars: at most six named cuisines, scaled to the largest named one. The remainder is a text line under the chart, "plus N across K other cuisines" when the cuisines are listed individually, or "Other: N" when the file gives a lumped "Other" entry.
- **Lifting:** optional `lifting` (from Hevy) gets its own full-width card below "My rankings". An older file without it still validates, and the card says "Not connected yet." The header reads "hevy · data through <data_through>"; it never says "live", and the source chip says when the job last ran. With `workout_count` 0 the card says "No workouts logged yet."
  - Stats: workouts logged (since `first_workout`), current streak (`streak_weeks`, "weeks at N+ sessions" from `streak_min_sessions`), and sessions in the last 4 weeks (the last four `weeks`, this week included).
  - "Estimated one-rep max, main lifts": one small line chart per lift from `history`, each on its own scale, with the latest value at the line end; exercise name, a "machine" tag when `machine` is true, current and best. When `best.best_set` is present, "best set 185 × 4 · 26 Sep" sits under the best. A best set with `"source": "manual"` (entered by hand, not from Hevy) carries a "logged by hand" tag after that line. A lift with fewer than three `sessions` shows "n sessions so far" in place of the chart. One Epley note under the group.
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
python3 build.py --drafts   # also the whole site, drafts included, in _site-drafts/ for preview
```

The design source is `~/Personal/site-handoff/design/track-page-reference.html`.

**The content file** is `content/tracks/NN-slug.md` (or `content/drafts/` while it is a draft), with its assets in a folder named after the slug beside it. Front matter:

```
track: 16                 # the number on the main page; the title and side come from there
slug: paper-trader
title: Paper Trader
register: plain           # plain (Athena), album (side projects) or progress (ongoing research)
ready: false              # true only when cleared to publish
one_line: …               # the lede and the page description (progress pages: description and preview card only)
badge: in progress        # optional, shown as "status: …" in the reading bar (status_label: works too)
side: c                   # only for a draft whose track is not on the main page yet
```

A row may carry a sentence filled from the track's results file at build time: `<span class="track-live" data-src="paper-trader/demo.json" data-template="… {decisions:matched} decisions since its clock started match{decisions:unchecked}, {as_of:asof}and …">rendered text</span>`, where `data-src` is a path under `content/tracks/` or `content/drafts/` and the template's `{field:kind}` placeholders are read from the JSON (`fill_live()`). The counted entries of a list are those not `voided` and, when the file has `clock_start`, dated on or after its `equity_base_snapshot` (else `first_fill`). Kinds: `count` (how many), `matched` ("all 26" when every counted entry's `match` is true, else "25 of 26"), `ratio` (always "25 of 26"), `unchecked` (", 1 not yet checked" for `match: null` entries, else nothing), `matched_count` and `unchecked_count` (those numbers alone), `total` (every entry, voided ones included), `voided` (how many are voided), `ratio_all` ("28 of 29": matched of every entry), `asof` (a `YYYY-MM-DD` field as the clause "as of 12 October 2026, "), `asofnote` ("as of 12 October 2026", for a stat note that is dropped when the date is missing) and `date` (the date alone). Regenerating the file before a build updates the text. Without the date its clause is left out; without the list, or the file, the whole sentence is, with a warning; the template stays in the attribute so the next build with the file restores it. A page can do the same with `live: demo.json` (a file in its asset folder) in its front matter: the same placeholders anywhere in its body are filled, a line whose list is missing is dropped, and a missing date leaves its text out. No count of Paper Trader's decisions is typed anywhere: the row, its stat, the criteria table, the figure captions and the limits paragraph all read the file.

A page in a two-part story (tracks 10 and 11, the two research pages with Prof. Suess; tracks 17 and 18, the NBA pages) takes `part: part one | 18`: the label ("part one" or "part two", no dates; the data season belongs in the description), then the other part's number. The hero shows the label under the title, with a link to the other part under the same rule as previous and next (a ready page links it only once that part is ready too). On the main page the row carries the same label by hand, as `<span class="track-part">…</span>` after the title. No card on the main page shows a date line of its own: dates live in side A's employer lines, in the descriptions and on the track pages.

Progress pages take `with:` (one line under the title, in place of `one_line:`), `as_of: YYYY-MM-DD`, an optional `link: label | https://…` (a small link under the `with:` line) and `status_label:`.

Side A (work) is three employers, newest first (Athena, Zeta Global, NationBuilder), each under its own `<p class="side-intro">` line "Title, Employer, dates in words" (the employer is named there and nowhere else in its block). Every row under an employer is a numbered track with the same markup as sides B and C: `span.track-no`, `h3.track-title`, `span.track-desc`. Athena has six rows, 01 to 06; Zeta Global is 07 and NationBuilder 08, each one row whose description carries its dates and whose bullet list (`ul.track-points`) sits in the track body under the description. No row on side A shows a date line of its own. They have no pages and no drafts; `/01` to `/08` are stubs that redirect to the row's anchor (`#track-01` …).

Every page ends with the line "Views are my own.": in the main page's contact column, and as a one-line footer on the track and Lately pages (written by `build.py`).

A draft may be for a track that is not on the main page yet. It needs `side:`, sorts after the listed tracks, and says "not on the tracklist yet". A ready page must be on the main page.

The body is `## Section` headings (an `{#id}` after the heading sets its anchor) with paragraphs, `- ` lists, `**bold**`, `*italic*`, `` `code` `` and `[links](https://…)`. A paragraph starting with `> ` is the large lead paragraph. Components are fenced with `::: name` and `:::`:

| Component | Body |
|---|---|
| `::: figure a.svg [narrow.svg]` | `caption:`, `alt:` and `description:` lines. The SVG is inlined, so it uses the site's colours through `dg-*` classes. A second file is shown instead below 640px. The `description:` lines become "The diagram as text". |
| `::: code` | the excerpt as written, plus an optional `caption:` |
| `::: stats` | `label \| value \| note` rows |
| `::: bars Title` | `label \| number [\| orange]` rows and a `caption:` |
| `::: steps` | `step 1 \| title \| text` rows |
| `::: audio` | two rows, `real \| label \| file` and `synthetic \| label \| file`, and a `caption:`; players have no autoplay and `preload="none"` |
| `::: demo data.json demo.js` | fallback text; the script is added to that page only and reads the JSON from the slot's `data-src` |

**Plain-text markers.** Drafts from the handoff folder mark components in plain text instead, and the build reads them as written, so those files are imported unchanged. A marker starts a block that runs to the next blank line. Paths are written as `<slug>/path` and resolve inside the page's asset folder. Captions from markers are used exactly as written, numbering included. On these pages a paragraph that is bold throughout and opens the page becomes the lead.

| Marker | Rows and attached lines | Renders as |
|---|---|---|
| `STEPS:` | `1. title \| text` | steps |
| `EXCERPT:` | the excerpt, then `CAPTION:` | code excerpt |
| `STATS:` | `value \| label \| note` | stat row |
| `FIGURE: path.svg` | `CAPTION:`, `ALT:`, `OVERLAY: other.svg` | the SVG as an image (alt text from its `<title>`, or from `ALT:` when it has none); below 640px it keeps a readable size and scrolls inside its box. With `OVERLAY:` the figure is inlined instead and the other SVG's contents (a `<style>` that may hide parts of the figure, and new shapes or text) are drawn over it, so a label can be corrected without editing the figure file |
| `TABLE:` | a header row, then rows, cells split by `\|` | table; below 640px each row becomes a block with labelled values |
| `BUILT-WITH:` | `label \| text [\| https://link]` | "Built with": up to four rows, each label once, in this order: `languages and frameworks` (from the project's dependency files), `data` (the source, linked when a link exists), `compute` (only when the page states it) and `attribution` (only what a licence requires). Nothing goes in a row that one of those doesn't evidence; no "available on request" lines |
| `DEMO: path.json [more.json …]` | `BEHAVIOUR:` (not shown), `DEMO-CAPTION:`, `ATTRIBUTION:` | demo slot; needs `demo.js` (and optionally `demo.css`) in the asset folder, added to that page only. The first file is the slot's `data-src`; any others are published too and listed in `data-more` |
| `LINKS:` | `label \| https://…` | a short list of labelled links ("label →"), e.g. under Built with |
| `PAPERS:` | `arXiv id \| authors \| year \| title [\| note]` | "Papers this builds on", a titled list under the results: "Authors (year). Title. arXiv:id", the id linking to the abstract, with the note after it in the label face. Titles and author lists are copied from the arXiv abstract page, never typed from memory |
| `AUDIO-PAIR:` | `file \| label [\| synthetic[, failed to stop]]` and `CAPTION:` | audio clips; tags are checked against a `manifest.json` beside the clips when there is one |
| `AUDIO-GRID: manifest.json` | `BEHAVIOUR:` (not shown), `AUDIO-NOTE:`, `ATTRIBUTION:` | a table of clips, sentences as rows; columns come from `grid-columns.txt` beside the manifest (`system \| label \| real or synthetic`). Only file names, systems and `stop_failure` are read, and the manifest is not published. It takes the section's full width; below 640px it shows one sentence at a time. |

A link written `[text](track:NN)` points at track NN's page when that page is linkable under the previous/next rule (a ready page links only ready pages; a draft, in a `--drafts` build, links any page built with it); otherwise it is the text alone. A `DIAGRAM:` line (a description of a diagram still to be drawn) stops the build; replace it with a `::: figure` block. A line starting `HELD:` marks content that needs a collaborator's agreement: drafts show it with a dashed "held" flag (held text that starts mid-paragraph is flagged from `HELD:` to the paragraph's end), and a page with `ready: true` that still has one stops the build. Any other capitalised `NAME:` line at the start of a block stops the build. Every audio player has native controls and `preload="none"`, and starting one pauses any other.

**Registers.** `album` and `progress` pages show reading-time stamps on the sections and a clock in the reading bar; `plain` pages show neither. All three have the reading bar and play control.

A `progress` page (ongoing research) has these sections, in this order, and the build stops on any other set or order: `## question`, `## approach`, `## where it stands`, `## results` (optional), `## what's next`, `## log` (optional), `## built with` (optional), `## my role` (optional: only on pages about work led with others, tracks 09, 12, 13 and 14; personal projects and the two pages with Prof. Suess have none); an optional section left out is left out entirely, and the reading bar's chapters are the sections present. "where it stands" carries the `as_of:` date next to its heading ("as of 13 Oct 2026"). Each `## log` line, when the page has the section, is `YYYY-MM-DD | text` or `YYYY-MM | text`, shown as a dated list in file order (a month-only date shows as "May 2026"); any other line stops the build. Its `one_line:` is optional and is used only for the page description and preview card (the `with:` line sits under the title); without one, the description is the question's opening paragraph. Tests: `python3 tests/run.py`, which writes the full output to `~/Personal/site-review-<date>/test-logs/` (`python3 -m unittest discover tests` also works, without the log). Reading time is 230 words a minute, plus 6 seconds for each figure, excerpt, chart or demo.

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
- makes its row on the main page one link to the page: number, title, description and status together, with a hover and focus state (a faint card background and a teal number). A row without a page has no hover state.

Until its page is ready, a row can carry a small secondary link to the project elsewhere ("github →", "pre-registration →"): a `<span class="track-ext">` with an external `<a>` at the end of the track body. When the page is ready the whole row links to it, so the build keeps that link in `data-ext-*` attributes and puts it back if the page is unreadied; the project's link is then on the track page.

`--drafts` builds the site as usual (ready pages only, in place) and then writes the whole site again to `_site-drafts/` (git-ignored; a plain build deletes it), with every page built, drafts included, and linked from that copy's main page. Nothing about a draft is written outside `_site-drafts/` and `content/drafts/`.

Previous and next links follow the tracklist order and skip tracks without a page; the Lately pages are tracks 22 to 26 in that order, so 21's next is `lately/fantasy/` and 26 has no next. A ready page links only to other ready pages, so it builds the same with or without `--drafts`; a draft, in a `--drafts` build, links any page built with it.

**Social preview.** If the page's asset folder has an `og.png` (1200×630), it becomes that page's preview image; otherwise the main page's image is used. The build never makes or requires these images.

`tools/og.js` is an optional developer tool that renders the cards (number, title and one-line description in the site's type) into each page's content folder. It needs Node and an installed Chrome; `playwright-core` downloads no browser.

```sh
cd tools && npm install && cd ..        # once
node tools/og.js                        # all pages, or name slugs: node tools/og.js <slug> [<slug> ...]
python3 build.py                        # copies each card next to its page
```

Set `CHROME` to Chrome's executable if it isn't at the macOS default path. Cards for ready pages live in `content/tracks/<slug>/` and are committed along with the built page. Cards for drafts stay in the ignored `content/drafts/`.

## Lately in depth

Five pages, `lately/fantasy/`, `lately/watching/`, `lately/listening/`, `lately/eating/` and `lately/lifting/`, draw the `analysis` block of `data/lately.json`: statistics the pipeline computes from its archive. The block's schema is merged into `data/lately.schema.json` from the pipeline's `analysis.schema.json` (this repository owns the merged copy; the pipeline syncs from it, and the handoff copy in `~/Personal/site-handoff/lately-analysis/` with its `analysis.sample.json` is kept identical: `tests/test_lately.py` checks).

Each page comes from `content/lately/<feed>.md` in the **data** register, separate from the track registers. Every page has two groups, `# What's happening` (distributions, lists, tables, recent items, rankings) then `# Why` (the analysis cards, titled as questions), each holding `##` sections:

```
---
register: data
feed: lifting                       one of fantasy, watching, listening, eating, lifting; matches the file name
title: Lifting, in depth
one_line: Training logged on Hevy, and whether the cut is costing strength.   the panel's and the page's one-line description
source: Hevy | https://www.hevyapp.com     comma-separated "Name | https://" credits
source_note: ...                    optional, shown after the credit
attribution_when: yahoo | Fantasy data provided by Yahoo Fantasy | https://sports.yahoo.com/fantasy/
                                    optional: a credit line shown only while that source is in analysis.meta.sources_included
---

# What's happening

## Main lifts
FEED: lifting.lifts                 a block of the feed itself, drawn by js/lately.js

## Progress by lift
STAT: lifting.progress.*

# Why

## Is the cut costing strength? {#strength-index}
STAT: lifting.strength_index

## Do I finish what I start? {#completion}
NOTE: Only finished titles are logged as a rule, so completion and drop counts cover what I chose to record.
STAT: watching.completion.*
```

A `STAT:` path is the statistic's place in the analysis block: `teams[]` takes every team, `*` every key of a map (one per lift, platform or ranking) or every statistic among fixed keys (`watching.completion.*` is shows, films and anime, shown side by side). A `FEED:` line names one of the feed blocks in `FEED_BLOCKS` in `build.py` (the lineup grid and carry list, hours and recent lists, my rankings, the listening strip, the eating lists, the lift tiles, training and body weight), which left the main page on 2026-10-17 and live under What's happening. A `NOTE:` line is a sentence under the section title. A `HOW:` line names the section's primary statistic (`HOW: fantasy.manager_score.composite`, with `open` after the path to unfold it by default); only that statistic's `how` sentence is shown, under a closed "how" summary, and without the line it is the first statistic listed. A `SOURCE:` line (one at most) names the section's own source in the mono label face when it isn't the page's credit: the listening page's survival card reads "apple music library", since those statistics come from the library export rather than Last.fm. A `{#id}` on a retitled section keeps its old id, so deep links from before the regrouping still land. A section holds only these lines. The build stops when a path names nothing in the schema, when watching, listening, eating or lifting doesn't credit Simkl, Last.fm, Beli or Hevy, when a statistic in the schema is on no page or on two, or when the two groups are missing or out of order. A statistic can be left out on purpose by listing it in `DATA_LEFT_OUT` in `build.py` with its reason; none is. An optional `source_note:` follows the credit on the source line: the eating page's reads "Beli dates are used only as counts, never tied to a place" (new cuisines are counted by month; no date is shown with a place).

The built page is a track page: `render()` in `build.py` writes it through the same template as every track (the pages are tracks 22 to 26), so it has the kicker ("side d. lately · track 22 of 26"), the number beside the title (the panel's title, "Fantasy football"), the five-feed nav in the part line's slot, the lede from `one_line:` with whose numbers these are, the status tag "live · updated daily", the reading bar, one two-column section per `##` entry (What's happening first, then Why; the label and its time stamp on the left, the statistics on the right), a "built with" section last (data: the sources, linked; attribution: the licence lines the page needs, shown while the data calls for them; made with: the pipeline; as of: the file's date), previous and next through the whole tracklist (21 → 22 → … → 26; 26 has no next), and the "Views are my own." foot. There is no contents list: the reading bar's segments are the sections, timed in the browser once the statistics are drawn (`data-live-timing`; `js/track.js` measures the words and charts in each section and measures again on a tab switch or "show all"). The page is a frame with no numbers in it. In the browser, `js/lately-depth.js` (with `js/lately.js` for the feed blocks) fills in:

- the as-of date in "built with" (the block's `as_of`) and a headline row of two or three numbers under the lede;
- the tier-completion table's "Tiered titles" column, from `tier_distribution` (the rankings file's counts), with "Completion covers N of the M tiered titles." when completion covers fewer;
- for each statistic, by `status`:
  - `ok`: its value and 95% interval where it has them, its chart or table, its n ("n = 20 weigh-ins", plus "as of …" when the statistic's date differs from the block's); the pipeline's `how` sentence appears once per section, for the primary statistic, folded under "how". With `small_sample: true` (ok on fewer than min_n units) everything draws as usual and a mono tag sits beside the n: "n = 3 places · small sample, threshold 10";
  - `not enough data yet`: under What's happening, not drawn; a section left empty is hidden and leaves the reading bar, and no headline tile shows a "–" for one. Under Why, the card keeps its question over one line from `values.first_unit`, "nothing to show yet: needs one album with 10 plays in its first week" (just "nothing to show yet" when the file has no first_unit), with its `how` line. Since 2026-10-18 no card shows a count of units needed, an "available from" date, or a "more statistics appear as data accrues" line; a manager-score component still waiting is a row with a small-sample tag ("Lineup · n = 0 weeks · small sample, threshold 2"); a statistic the file predates (an older `lately.json`) shows "not in the data yet";
  - `not available from source` (or `not configured`): one line with what is `missing`.
- Only fields the script names are drawn, so nothing else in the file can reach the page; all text goes in with `textContent`.
- **Tabs** (`tabs(labels, panels)` in `js/lately-depth.js`, the tier board's control): on the watching page the tier board, My rankings and every section whose statistics come one per type (genres, completion, the crowd card's per-type tables) share Films / Shows / Anime tabs, films first, and switch together; statistics that are not per type sit above the tabs. On the fantasy page every section with `teams[]` statistics has one strip of team tabs, labelled with the team's name as the pipeline writes it (platform and format), and shows the selected team only; cross-league statistics (the quadrant, the lineup, the projections) stay above. The selected team is kept in the hash (`#team=<key>`, or `#section&team=<key>`), which the main page's team links set, so they land on the right team. Tab order and defaults are fixed.
- **Long lists** (`collapseRows`): any list or table with more than ten rows shows ten and a "show all N" button that opens the rest in place and closes them again; the rows stay in the DOM (hidden) and the button carries `aria-expanded` and `aria-controls`. The tier board shows fifteen chips a row and a "+N more" chip. `js/track.js` applies the same rule on track pages. Charts use the site's blue, orange and purple (one hue for one series, a legend for two), each has a "view as table" toggle, and wins and losses are filled and outlined squares with their letter.

The fantasy page's "Waiver adds" shows, per team, the hit rate with its interval, net points available against captured, adds a week, the count in each class, and a table of every add (`values.all`), the best and worst three marked "▲ best" or "▽ worst" from their flags; a file without `all` shows its best and worst lists and says the rest aren't in it. A dropped player's new team is never shown. "Points left on the bench" adds the line "Hit, left on the bench", waiver adds that beat their baseline but sat on the bench. Under Why, "Good, or lucky?" is the strength-against-luck quadrant (every team in my leagues as a point: other teams grey and unlabelled, hover shows a record and all-play share only; mine blue, labelled, with a trail from week 1), "Am I a good manager, or a lucky one?" the four manager-score bars with rank and of and the composite percentile, then the acquisition split (mine against the league median) and the draft table (every pick against the median for its round). "Fantasy data provided by Yahoo Fantasy" appears at the foot only while `yahoo` is in `analysis.meta.sources_included`.

"Is the win chance honest?" (the calibration table and Brier score) is on the fantasy page and says "not enough data yet" until `grading.predictions_stored` reaches 20. The cross statistics sit with the feed they describe: the lifting soundtrack, workouts by weekday and the time budget (hours by weekday across watching, listening and training) on lifting, plays by weekday and hour on listening, places ranked by weekday on eating. The watching page keeps completion and drops under Why with their n and the note that only finished titles are logged as a rule.

### Side D on the main page

Since 2026-10-17 the main page's Lately section is analysis-first: five panels, fantasy across the width, then watching | listening, then eating | lifting, with the feed-status chips and heading above them. The panels are tracks 22 to 26 (fantasy, watching, listening, eating, lifting) and carry the track card's header: the number, the title, the one-line description from the page's `one_line:`, and a "more →" control (`a.ld-more`, labelled "more about <feed>") at the right that opens the page; the in-depth pages are track pages ("side d. lately · track 22 of 26", the number beside the title, the description, then "These are my own numbers…"), and every track page's "of" counts them. Each panel then has a question in bold, a two-sentence answer filled from a fixed template (never free text), two or three current numbers, one chart, and "more about <feed> →":

| Panel | Question | Chart | Numbers |
| --- | --- | --- | --- |
| Fantasy | Good, or lucky? | the quadrant (`fantasy.quadrant`) | combined record; wins above expected; favoured this week |
| Watching | What earns an S? | S-tier share by type and by decade (`watching.s_tier`) | S share; the most over-indexed genre; completion of shows |
| Listening | Do I keep playing what's new? | new artists still played 30 and 90 days later (`listening.retention_new_artists`) | the two latest shares; plays in the window |
| Eating | What biases my scores? | diverging bars: each cuisine's median (15+ places) minus my overall median, home against away last (`eating.scores`, `home_bias`) | median score; home against away; order effect |
| Lifting | Is the cut costing strength? | body weight and strength indexed to 100 at cut start (`lifting.strength_index`) | body weight %; strength index %; bench best (with "logged by hand") |

When a panel's statistic is "not enough data yet" or not in the file, the question stands over one line ("nothing to show yet: needs …", or "not in the data yet") and the numbers still show; a panel whose statistic is ok on a small sample carries the "small sample, threshold 10" tag under its numbers, and the listening panel's pre-sync exclusion is a tag there too, not a sentence. Without an `analysis` block (the sample file has none) the pages say the statistics are not connected yet, the feed blocks still draw, and the panels show their question, numbers from the feed, the box and the link.

## Preview locally

`fetch()` doesn't work from `file://`, so serve the preview over HTTP:

```sh
cd ~/Documents/cnguyen75.github.io
python3 build.py --drafts
python3 -m http.server -d _site-drafts 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/
```

To check exactly what will be published, serve the folder itself instead (`python3 -m http.server 8765 --bind 127.0.0.1` after a plain `python3 build.py`).

**Links.** A link to another site, and the résumé PDFs, open in a new tab with `rel="noopener"` (`new_tab()` in `build.py`, the `h()` helper in `js/lately.js`, and by hand in `index.html`); links within the site stay in the same tab. `tests/test_build.py` checks both rules.

The page draws `data/lately.json`, which the pipeline writes. `build.py` stops with an error when the file is absent, so a deploy cannot go out without it; a file that is present but unreadable only prints a warning, and the site then shows "Lately is being updated.". The file is in `.gitignore` so it is never added by hand: after the first publish it is committed by the publish workflow with `git add -f`, and by nothing else. The test suite serves its own copy, `tests/fixtures/lately.sample.json`.

## Résumés

`resume/` holds copies of the web versions built from LaTeX in `~/Personal/site-handoff/resume-latex/web/` (these leave out the phone number). To update, rebuild there and copy both PDFs over the ones in `resume/`. The hero "Résumé (PDF)" link points to the AI Engineer résumé; the footer reads "résumé: engineering · research" and links to both.

## Disclosure rules for research and work

The same rules are in `~/Personal/site-handoff/HANDOFF.md`, the design source of truth; every research and work page is held to them.

1. Own work, not yet submitted: full results, figures and a code link. Never a venue name, never "under review" or "submitted".
2. Collaborations led by others: the question, my role, the methods and the data's provenance in general terms. No results, figures, effect sizes or sample sizes until the lead releases them. The page closes with the line "Results in the manuscript in preparation."
3. Human-subjects data: no participant counts, demographics, sites or protocol details. The dataset is described only as the consent language describes it.
4. Once something is public, link it and show no more than it shows.
5. Employer work: title, dates and job-description sentences only.

No third-party scripts, fonts from CDNs, analytics or iframes, ever.

## Open items

- Side D's footer reads "pipeline: private" as plain text: the pipeline repo (`github.com/cnguyen75/lately`) is private, so there is no link to it.
