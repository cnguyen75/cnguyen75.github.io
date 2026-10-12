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
favicon.svg, favicon-32.png, apple-touch-icon.png
.nojekyll                  stops GitHub Pages running Jekyll once the site is published
```

The design source of truth is `~/Personal/site-handoff/` (`HANDOFF.md` and `design/*.html`). Text on the page is copied from those files verbatim, including bracketed placeholders.

The page makes no requests to other hosts at runtime. Fonts, images and data are all served from this folder.

## How the Lately data is loaded

`js/lately.js` runs after the page parses:

1. It fetches `data/lately.json`.
2. If that file is missing, is not valid JSON, or does not have `schema_version: 1` and a `sources` object, it loads `data/lately.sample.json` instead and shows a visible **sample data** label, plus the sentence "Sample data shown." in the intro.
3. Each panel (fantasy, watching, listening, eating) is drawn independently inside its own `try`. If a panel's data is missing it shows "Not connected yet."; if the data is present but malformed it shows "Couldn't draw this panel right now." Other panels and the rest of the page are unaffected.
4. Each feed has an entry in `sources` with a `status` (`ok`, `error`, `stale`, `pending`, `disabled`) and a `last_ok_at` time:
   - `ok`: the panel draws normally.
   - not `ok`, with `last_ok_at`: the panel draws the data in the file (the job should leave the last good data in place) and says "last good data from <date>".
   - not `ok`, with no `last_ok_at`: the panel (or, for fantasy, that team's row) shows "Not connected yet."
   - The status chips under the intro show each source's state and last update time, in Pacific time. `message` is shown in place of the status word, so keep it short and public (for example "awaiting approval"). Never put error details or secrets in it.

Rules the renderer applies to the data:

- **Watching:** the hours total is the sum of the weekly bars. There is no separate total field. When every week is zero, the chart, legend and table toggle and the hours total are replaced by "No episodes or films logged in the last 12 weeks"; the Recently list stays. If no recent item has a rating, the score column is dropped.
- **Fantasy:** `win_probability` may be `null`. The page then shows the team's `win_probability_note` in place of the bar, or "not available this week" if there is no note. A note is ignored when `win_probability` is a number. The player chart shows points above replacement **per game played**; negative values draw leftward from a zero line in orange. The header lists only sources that have at least one team drawn on the page. A team's second line (platform, league, status) is hidden when it would only repeat the platform already named in the team label.
- **Watching:** optional `currently_watching` is shown as "Watching now" above Recently: type square, linked title and progress ("S2 · E5", "E5" without a season, title only when both are null). Optional `rankings` is shown as "My rankings", numbered top-five lists for Films, Shows and Anime with linked titles and years. Each heading has its type colour square plus a text label. Empty lists are hidden, and each block is hidden when its field is absent or empty.
- **Watching:** a recent item may have `status` `"watched"` (the default when the field is missing) or `"finished"` (marked complete in bulk on Simkl, with no watch date or season). Finished items show a small "finished" label instead of a season, keep their Simkl link, and are listed after all watched items whatever their order in the file.
- **Listening:** "Plays, last 30 days" is the sum of `plays_by_hour`; "Top artists, last 30 days" uses the same window, so it covers the same window as the hour strip (`plays_this_month` is deprecated and ignored). Any hour with at least one play starts at the second blue shade, so it is clearly different from the zero colour. The top-artists chart stays even with one artist.
- **Eating:** "Recently tried" lists `recent`, the ten restaurants most recently ranked on Beli, newest first, with name, city and score. There are no rank numbers, dates or relative times; the order is the only signal. Scores show two decimals. Cuisine bars: at most six named cuisines, scaled to the largest named one. The remainder is a text line under the chart, "plus N across K other cuisines" when the cuisines are listed individually, or "Other: N" when the file gives a lumped "Other" entry.

All text from the data file is inserted with `textContent`, never as HTML, and links are only rendered for `https://` URLs. Watching titles must link to their Simkl page (the schema requires `https://simkl.com/...`).

To check a data file against the schema, run any draft 2020-12 validator, for example:

```sh
npx -p ajv-cli@5 -p ajv-formats@3 ajv validate --spec=draft2020 -c ajv-formats \
  -s data/lately.schema.json -d data/lately.json
```

### Charts and accessibility

Charts are HTML and CSS, as in the design. Every mark has a `title` for hover, and each chart container has `role="img"` and an `aria-label` that lists its values. Every chart has a **view as table** button that swaps it for a real `<table>`. Wins and losses use filled versus outlined squares with a W or L, never colour alone.

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
