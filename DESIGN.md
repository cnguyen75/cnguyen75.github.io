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
| `--fs-xs` | 11px | axis ticks, chart value labels, tags, diagram labels |
| `--fs-s` | 13px | mono labels, notes, table text, the footer's small lines |
| `--fs-m` | 15px | the label face at reading size, lists, buttons, stat labels |
| `--fs-l` | 18px | body copy, the lately intro and lede |
| `--fs-xl` | 24px | card titles, panel headings, the track page's lede and lead paragraph |
| `--fs-xxl` | 32px | group titles, the handwritten caption, the in-depth value |
| `--fs-xxxl` | 44px | the headline numbers on the panels, the lately title |
| `--fs-display` | clamp(32px, 6vw, 52px) | the hero title, page titles, the track number and the stat row's figures |

The sizes the site used before the scale map onto it by nearest step; a tie resolves away from the body size (12 → 11, 14 → 13, 16 → 15, 20 → 18, 21 → 24, 22 → 24, 36 → 32, 40 → 44, 56 → display). One step, `--fs-xxxl`, was added because 40 and 44 had no near neighbour.

## Spacing

| Token | Size |
|---|---|
| `--s-1` | 4px |
| `--s-2` | 8px |
| `--s-3` | 12px |
| `--s-4` | 16px |
| `--s-5` | 24px |
| `--s-6` | 32px |
| `--s-7` | 48px |
| `--s-8` | 64px |

Ties round up (6 → 8, 10 → 12, 14 → 16, 20 → 24, 28 → 32, 40 → 48). Hairlines inside charts are `calc(var(--s-1) / 4)` and `calc(var(--s-1) / 2)`; a mark's centring offset is the negative of a step. `--page-width` (1120px) is the page's measure.

## Components

| Component | Where | Classes |
|---|---|---|
| Track card | the main page's sides A to C, the five lately panels | `.track.track--wrap` (a grid: number, title, status on the first row; description and the rest spanning under the title), `.track-no`, `.track-title`, `.track-desc`, `.track-part`, `.track-ext`, `.track-meta.track-meta--status`, `.track-points`; a row whose page is built is an `a.track`. `.side-intro` is an employer's line on side A |
| Side label | above each side | `.side-label` ("side a. work"); `.lately-label` for side D; `.tp-kicker` and `.ld-kicker` on the built pages |
| Stat tile | headline numbers on panels and in-depth pages; the stat row on track pages | `.stats` > `.stat` with `.stat-label`, `.stat-value`, `.stat-note` (`.ld-stats`, `.ld-stats--panel` for the compact grid); `.tp-stats` > `.tp-stat` with `.tp-stat-label`, `.tp-stat-value` |
| Bars | horizontal bar lists | `.bar-list` > `.bar-row` (`.bar-label`, `.bar-track`, `.bar-fill`, `.bar-value`; `.bar-track--diverging`, `.bar-fill--neg` for negatives); in depth `.ld-bars` > `.ld-bar-row` (`.ld-bar-label`, `.ld-bar-track`, `.ld-bar-fill`, `.ld-bar-value`, `.ld-bar-ref` for a comparison tick); on track pages `.tp-bars` > `.tp-bar` |
| Tier board | the watching page's rankings | `.tier-board` > `.tier-tabs` + `.tier-rows` > `.tier-row` (`.tier-row-head`, `.tier-letter`, `.tier-count`, `.tier-summary`, `.tier-chips` > `.tier-chip`) |
| Tabs | the tier board (films, shows, anime) | `.tier-tabs` > `button.tier-tab[aria-pressed]` |
| View as table | every chart | `button.table-toggle[aria-controls][aria-expanded]` and the hidden `.data-table` it reveals (`.ld-table` in depth) |
| Details / how | the pipeline's method line under a statistic | `.ld-how` with `.ld-how-label` |
| Chips | source status under the lately heading; tags | `.chips` > `.chip` (`.chip-dot`); `.tag`, `.ld-tag`, `.tp-tag` for a boxed one-word flag |
| Card / panel | the lately panels and in-depth sections | `.panel` (`.panel--wide`, `.panel-head`, `.panel-meta`, `.panel-lead`, `.panel-question`, `.panel-answer`); `.ld-section` (`.ld-section-title`, `.ld-blocks` > `.ld-block`) |
| Reading bar | track pages | `.tp-player` (`.tp-play`, `.tp-speed`, `.tp-clock`, `.tp-segs` > `.tp-seg`), `.tp-mini` once it scrolls away |
