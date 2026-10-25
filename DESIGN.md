# Design tokens and components

The whole site is drawn from the tokens in `:root` at the top of `css/site.css`. Every colour, font size, margin, padding and gap in `css/site.css` and `css/track.css` is one of them (a hairline is a half or a quarter of the smallest spacing step, and an offset is the negative of a step). `python3 tests/run.py` and a grep over the two stylesheets keep it that way: no hex colour and no pixel font-size, margin, padding or gap outside `:root`.

## Colour

| Token | Value | Use |
|---|---|---|
| `--paper` | #E8E2D3 | the page ground |
| `--card` | #F6F2E8 | cards, panels, the polaroid, buttons' text on ink |
| `--lift` | #FCFAF5 | one step above the card, hover on card surfaces |
| `--ink` | #231F1B | text, rules, filled marks |
| `--text-2` | #3D372F | body copy on cards, descriptions |
| `--text-3` | #4F483E | labels, notes, the mono face |
| `--rule` | #B3A992 | rules and borders |
| `--rule-soft` | #D3CBB8 | lighter rules inside lists and tables |
| `--track` | #E0D9C8 | the empty part of a bar |
| `--axis` | #8C8576 | axes, zero lines, other teams' points |
| `--teal` | #2F5D62 | side labels, section labels, hover accents |
| `--blue` | #1F6FB5 | films, positive, the default series |
| `--orange` | #C0601F | shows, negative, the second series |
| `--purple` | #7A4E9E | anime, the third series |
| `--heat-0` … `--heat-5` | #E0D9C8 → #144F85 | the six-step blue scale for heat strips and boxes |
| `--shadow`, `--shadow-strong` | rgba(35, 31, 27, 0.12 / 0.18) | a card lifted off the paper; the polaroid |

## Type

Faces: `--font-text` (Archivo), `--font-label` (Courier Prime, for labels, tags, numbers and captions), `--font-hand` (Caveat, the one handwritten caption).

| Token | Size | Use |
|---|---|---|
| `--fs-10` | 10px | column labels in the in-depth tables at phone width |
| `--fs-11` | 11px | axis ticks, chart value labels, tier labels, diagram labels |
| `--fs-12` | 12px | small mono labels, tags, legend text, the small diagram text |
| `--fs-13` | 13px | mono labels, notes, table text |
| `--fs-14` | 14px | the footer's small lines, captions, stat labels |
| `--fs-15` | 15px | the label face at reading size, lists, buttons |
| `--fs-16` | 16px | block titles in the in-depth pages |
| `--fs-17` | 17px | body copy |
| `--fs-18` | 18px | the hero lede, the lately intro and lede |
| `--fs-20` | 20px | the track page's lead paragraph |
| `--fs-22` | 22px | the track page's lede and collaboration line |
| `--fs-24` | 24px | card titles, panel headings |
| `--fs-30` | 30px | group titles, the handwritten caption, the in-depth value at phone width |
| `--fs-36` | 36px | the in-depth value |
| `--fs-40` | 40px | the lately title |
| `--fs-44` | 44px | the headline numbers on the panels |
| `--fs-52` | 52px | the stat row's figures |
| `--fs-56` | 56px | the track number |
| `--fs-display` | clamp(32px, 6vw, 52px) | the hero title and the in-depth page titles and number |
| `--fs-display-s` | clamp(38px, 10vw, 56px) | the track page title |

The tokens are named by their pixel value and hold the sizes the site has always used, so adding a token means adding a size, and a size that is not in the table is not on the site. Three former one-offs were folded into neighbours when the scale was made: 11.5px (the small diagram text) is 12px, 19px (the hero lede) is 18px and 21px (the track lede and collaboration line) is 22px. The spacing scale (below) is named the same way.

## Spacing

| Token | Size |
|---|---|
| `--s-1` | 1px |
| `--s-1-5` | 1.5px |
| `--s-2` | 2px |
| `--s-3` | 3px |
| `--s-3-5` | 3.5px |
| `--s-4` | 4px |
| `--s-4-5` | 4.5px |
| `--s-5` | 5px |
| `--s-6` | 6px |
| `--s-8` | 8px |
| `--s-9` | 9px |
| `--s-10` | 10px |
| `--s-12` | 12px |
| `--s-14` | 14px |
| `--s-16` | 16px |
| `--s-18` | 18px |
| `--s-20` | 20px |
| `--s-22` | 22px |
| `--s-24` | 24px |
| `--s-28` | 28px |
| `--s-32` | 32px |
| `--s-40` | 40px |
| `--s-48` | 48px |
| `--s-64` | 64px |
| `--s-72` | 72px |
| `--s-80` | 80px |

Named by value like the type tokens (`--s-1-5` is 1.5px). A mark's centring offset is the negative of a token, written `calc(-1 * var(--s-4-5))`. `--page-width` (1120px) is the page's measure.

## Components

| Component | Where | Classes |
|---|---|---|
| Track card | the main page's sides A to C, the five lately panels | `.track.track--wrap` (a grid: number, title, status on the first row; description and the rest spanning under the title), `.track-no`, `.track-title`, `.track-desc`, `.track-part`, `.track-ext`, `.track-meta.track-meta--status`, `.track-points`; a row whose page is built is an `a.track`. `.side-intro` is an employer's line on side A |
| Side label | above each side | `.side-label` ("side a. work"); `.lately-label` for side D; `.tp-kicker` and `.ld-kicker` on the built pages |
| Stat tile | headline numbers on panels and in-depth pages; the stat row on track pages | `.stats` > `.stat` with `.stat-label`, `.stat-value`, `.stat-note` (`.ld-stats`, `.ld-stats--panel` for the compact grid); `.tp-stats` > `.tp-stat` with `.tp-stat-label`, `.tp-stat-value` |
| Bars | horizontal bar lists | `.bar-list` > `.bar-row` (`.bar-label`, `.bar-track`, `.bar-fill`, `.bar-value`; `.bar-track--diverging`, `.bar-fill--neg` for negatives); in depth `.ld-bars` > `.ld-bar-row` (`.ld-bar-label`, `.ld-bar-track`, `.ld-bar-fill`, `.ld-bar-value`, `.ld-bar-ref` for a comparison tick); on track pages `.tp-bars` > `.tp-bar` |
| Tier board | the watching page's rankings | `.tier-board` > `.tier-tabs` + `.tier-rows` > `.tier-row` (`.tier-row-head`, `.tier-letter`, `.tier-count`, `.tier-summary`, `.tier-chips` > `.tier-chip`) |
| Tabs | the tier board, My rankings, the per-type and per-team sections | `.tabs` > `.tier-tabs` (`button.tier-tab[aria-pressed]`) + `.tab-panels` > `.tab-panel` (`tabs(labels, panels)` in `js/lately-depth.js`; groups with a sync key switch together) |
| Show all | lists and tables over ten rows; a tier row over fifteen chips | `button.table-toggle.rows-more[aria-expanded]`; `.tier-chip-more > button.tier-more` |
| View as table | every chart | `button.table-toggle[aria-controls][aria-expanded]` and the hidden `.data-table` it reveals (`.ld-table` in depth) |
| Details / how | the pipeline's method line under a statistic | `.ld-how` with `.ld-how-label` |
| Chips | source status under the lately heading; tags | `.chips` > `.chip` (`.chip-dot`); `.tag`, `.ld-tag`, `.tp-tag` for a boxed one-word flag |
| Card / panel | the lately panels and in-depth sections | `.panel` (`.panel--wide`, `.panel-head`, `.panel-meta`, `.panel-lead`, `.panel-question`, `.panel-answer`); `.ld-section` (`.ld-section-title`, `.ld-blocks` > `.ld-block`) |
| Reading bar | track pages | `.tp-player` (`.tp-play`, `.tp-speed`, `.tp-clock`, `.tp-segs` > `.tp-seg`), `.tp-mini` once it scrolls away |
