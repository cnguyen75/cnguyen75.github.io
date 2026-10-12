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
data/lately.json           live data, written by the nightly job (not present yet)
fonts/                     self-hosted Archivo, Courier Prime, Caveat (latin woff2) and their OFL licences
images/colin-portrait.jpg  hero photo (faded in CSS, not in the file)
images/og-image.png        1200×630 social preview, a render of the hero
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

To preview live data, put a file at `data/lately.json`; delete it to go back to the sample.

## Open items

- **Résumé PDFs.** LibreOffice was not installed, so the two résumés in `~/Personal/site-handoff/` were not exported. The hero "Résumé (PDF)" link still points at `#contact` and the footer "Résumé" link at `#`, as in the design. To finish, export both to `resume/` (for example `soffice --headless --convert-to pdf --outdir resume ~/Personal/site-handoff/*.docx`) and update the two links in `index.html`, which are marked with HTML comments. The design has one link in each place, so deciding how to offer two résumés is still open.
- The "how this is built" link in Side D and all Lately values are placeholders until the nightly job exists.
