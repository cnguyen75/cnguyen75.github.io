# Working in this repository

Follow `CODING-RULES.md` in this folder for all code, comments, and documentation. Run
`python3 rules_check.py .` and the formatters named in `rules_check.py` before every commit;
a commit with findings is not ready.

Commit as Colin Nguyen <26684223+cnguyen75@users.noreply.github.com>. Never use any other
identity. Do not push unless asked.

Nothing here may name an employer's internal systems, customers, colleagues, vendors, or
metrics. No credentials, tokens, or private paths in any file, ever.

## This repository

The site is static HTML, CSS and JavaScript with no framework. `build.py` (Python standard
library only) renders the track pages from `content/tracks/*.md` and the lately pages from
`content/lately/*.md`; `js/lately.js` and `js/lately-depth.js` draw the lately panels and
statistics in the browser from `data/lately.json`.

- Build the ready pages in place: `python3 build.py`
- Build everything, drafts included, for a local preview: `python3 build.py --drafts`, then
  `python3 -m http.server -d _site-drafts 8765 --bind 127.0.0.1`
- Run the tests before every commit: `python3 tests/run.py` (headless Chrome through
  `tools/node_modules/playwright-core`; the log goes to `~/Personal/site-review-<date>/`)
- Format: `npx prettier@3.3.3 --write js css` and `uvx ruff format build.py tests tools`,
  then `uvx ruff check build.py tests tools`

Private and git-ignored, never committed: `content/drafts/` and `_site-drafts/`. The lately
nightly job commits and pushes `data/lately.json` as "lately: data through <date>", and it is
the only file that job touches. The design source is `HANDOFF.md` (outside this repository)
and `DESIGN.md` here: every colour and size in the stylesheets is a token from `DESIGN.md`,
and the tests check that.
