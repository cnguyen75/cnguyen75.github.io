# Publish day

The remaining steps, in order. Nothing here has been pushed; the site has no remote yet.

## Already checked

- Every page carries the Content-Security-Policy and loads nothing from another host; the build fails otherwise (`check_pages` in `build.py`).
- `data/lately.json` is scanned at build time for anything key-shaped, an email address, a phone number, a street address or a path under `/Users/` (`private_shapes` in `build.py`).
- `npm audit` in `tools/` reports no vulnerabilities (the only dependency is `playwright-core`, used by the tests).
- `python3 tests/run.py` passes.

## To do, in order

1. **Read the nine newly published pages** in the preview (`python3 build.py --drafts`, then `python3 -m http.server -d _site-drafts 8765 --bind 127.0.0.1`): tracks 10 (`tracks/memory-efficient-fine-tuning/`), 11 (`tracks/abstention-gate-option-shift/`), 15 (`tracks/pokemon-tcg-agent/`), 16 (`tracks/paper-trader/`), 17 (`tracks/nba-shot-decisions/`), 18 (`tracks/nba-catch-decisions/`), 19 (`tracks/drug-target-network/`), 20 (`tracks/speech-optimizers/`) and 21 (`tracks/llm-20-questions/`).
2. **The private `lately` repository and its deploy key** (README, Publishing): create the repository, add the key and secrets, and add the fetch step to `.github/workflows/pages.yml`.
3. **The two-line note to Dr Benzo** about the Ohio State entries (tracks 12 and 13) before they go public.
4. **Rebase `llm20questions` in MLProjects** so the repository track 21 links to matches the page.
5. **Read the five public repositories' READMEs** that the site links to (`pokemon-tcg-ai`, `NBA-Inverse-Shot-Optimization`, `nba-catch-decisions`, `Drug-Target-Interaction-Network`, `MLProjects`).
6. **`git push`**, then enable GitHub Pages for the repository with GitHub Actions as the source; the `pages` workflow publishes `_site/`.
