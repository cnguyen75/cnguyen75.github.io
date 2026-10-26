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
| Track card | the main page's sides A to C, the five lately panels | `.track.track--wrap` (a grid: number, title, status on the first row; description and the rest spanning under the title), `.track-no`, `.track-title`, `.track-when` (the months, sides B and C), `.track-desc`, `.track-part` (with `a.track-part-link` to the other part), `.track-ext`, `.track-meta.track-meta--status`, `.track-points`; a row whose page is built is an `a.track`. `.side-intro` is an employer's sub-header on side A, in the side-label style over the block's rule |
| Chart | every chart | `.chart` (`.chart-head` > `.chart-title`, phrased as the question it answers; `.chart-body`; then `.legend`), `.chart--depth` on the lately pages, `.chart--card` the track pages' bar panel, `.chart--hours` |
| Legend | below a chart | `.legend` > `.legend-item` (`.legend-swatch`), `.legend--mono` in the label face on the lately pages, with keys `.legend-bar`, `.legend-ref`, `.legend-dot`, `.legend-box`, `.legend-median` |
| Axis | under a chart | `.axis` (first and last labels), `.axis-ticks` > positioned ticks (`.axis-start`, `.axis-end` flush to the ends), `.axis-row` the grid row that holds them |
| Side label | above each side | `.side-label` ("side a. work") and `.lately-label` for side D, 16px with 0.04em letter-spacing; `.side-intro` (an employer's header on side A) and `.tp-section-label` (the left column of a track or lately page) 14px; `.tp-kicker` on the built pages (track and lately) 15px; all in the label face, teal |
| Stat tile | headline numbers on panels and in-depth pages; the stat row on track pages | `.stats` > `.stat` with `.stat-label`, `.stat-value`, `.stat-note`; modifiers `.stats--tight` (the lately pages' headline row), `.stats--panel` (the main page's compact grid) and `.stats--row` (the track pages' row of 52px figures) |
| Bars | horizontal bar lists, everywhere | `.bars` > `.bar` (`.bar-label`, `.bar-track` > `.bar-fill`, `.bar-zero`, `.bar-ref` for a comparison tick; `.bar-value`); row modifiers `.bar--neg` (grows left of zero, orange) and `.bar--faded` (an estimate whose interval includes zero); list modifiers `.bars--fixed` and `.bars--wide` (the feed blocks' fixed label column), `.bars--track` (the track pages' panel, inside `.chart--card`), `.bars--tier` and `.bars--effects` |
| Tier board | the watching page's rankings | `.tier-board` > `.tier-tabs` + `.tier-rows` > `.tier-row` (`.tier-row-head`, `.tier-letter`, `.tier-count`, `.tier-summary`, `.tier-chips` > `.tier-chip`) |
| Controls | every control: the tabs, "more →" on the lately panels, "show all N", "+N more", the "how" summary, bands and trail toggles, the reading bar's play and speed, the audio grid's sentence picker, the source-status chips | Three weights. **Block** (`.control`, `.chip`): the card surface, or `--lift` on a card, no border, square corners, a 6px ink square bullet, label face 13px, padding `--s-2` by `--s-3`; `:hover` one step lighter plus underline; the selected tab (`[aria-pressed="true"]`) is ink text over a 2px ink rule, never a filled block. **Quiet** (`.control.control--quiet`: how, show all N, +N more, show bands, show trail): mono text with a ▸ marker, ▾ when open or on, no box, hover underline. **Primary** (`.button`, `.tp-play`): filled ink, card text. `:focus-visible` is a 2px ink outline on all three; links in prose stay underlined text |
| Tabs | the tier board, My rankings, the per-type and per-team sections | `.tabs` > `.tab-strip` (`button.control.tab[aria-pressed]`, the selected one filled) + `.tab-panels` > `.tab-panel` (`tabs(labels, panels)` in `js/lately-depth.js`; groups with a sync key switch together) |
| Show all | lists and tables over ten rows; a tier row over fifteen chips | `button.control.rows-more[aria-expanded]`; `.tier-chip-more > button.control.tier-more` |
| Table | behind every chart, and the visible tables | `.table` (a header row, numeric columns `.num` right-aligned, over ten rows collapsed); `.table.sr-only` behind a chart holds the same numbers, in the DOM and visually hidden with no control to reveal it; `.table--depth` the lately pages' smaller table with a visible `.table-caption`, `.table--wide`, `.table--stack` the track pages' table (each row a labelled block at phone width); `.tp-text-alt.sr-only` for a diagram's description |
| How | the pipeline's method line under a statistic | `details.how` with `summary.control` and `.how-text` |
| Chips | source status below the last lately panel, above the attribution footer; tags | `.chips` > `.chip` (`.chip-dot`); `.tag`, `.ld-tag`, `.tp-tag` for a boxed one-word flag |
| Card / panel | the lately panels and in-depth sections | `.panel` (`.panel--wide`, `.panel-head` with the track card's number, title, description and `a.ld-more`, `.panel-lead`, `.panel-question`, `.panel-answer`); on the lately pages a section is a track page's `.tp-section` carrying `.ld-section` (`.ld-blocks` > `.ld-block`) |
| Built with | the last section of every track and lately page | `dl.tp-built`, a two-column grid of `.tp-built-row` (`dt` label in the label face, 13px, text-3; `dd` value in the text face; 1px `--rule-soft` between rows; one column under 520px): code, languages and frameworks, data, compute, papers (`ul.tp-papers-list`), attribution, made with; the lately pages' data, attribution, made with, as-of date |
| Two-part bar | under a two-part track page's title | `nav.tp-part-bar` > `.tp-part-seg` (two segments, the current one `.is-current` filled ink, the other a link when its page is linkable) |
| Reading bar | track and lately pages | `.tp-player` (`.tp-play.control`, `.tp-speed.control`, `.tp-clock`, `.tp-segs` > `.tp-seg`), `.tp-mini` once it scrolls away. Reading time counts only what is visible by default: not the tables behind charts, collapsed rows or inactive tabs. A track page's segments are proportional to their time, 72px at the least. On a lately page the times are measured in the browser once, from the default tabs, and again on "show all" (never on a tab switch); the bar is one row of equal segments, each named in full by the section's `short:` line (12px), the time shown only on the segment being read and on hover; under 640px the names and times are read, not shown |

## Charts and tables

Every chart on the site, on the main page, the five lately pages and the track pages, follows these rules. The renderers are `js/lately.js` (the main page's panels and the feed blocks), `js/lately-depth.js` (the lately pages' statistics) and `build.py` (the track pages' bars and tables).

**Colour.** Ink and paper first. One accent per chart. `--blue` is me, a positive, films, or the thing the question is about; `--orange` is a negative, or shows; `--purple` is anime; `--axis` grey is other teams and context. The heat ramp (`--heat-0` to `--heat-5`) marks intensity only, as in the weekday-by-hour grid. Colour is never the only cue: a negative keeps its minus sign, an estimate whose interval includes zero is faded and says so in its hover, and every chart has its table.

**Bars.** The default bar is `--axis` on a `--track` track, with a 2px ink mark at its end (`.bar-fill::after`). A bar is blue only when the row is the subject (`.bar--subject`: me against the league's marks, or a positive in a list that also has negatives) and orange when negative (`.bar--neg`, growing left of the zero line). Films, shows and anime bars keep their type colour (`.fill--films`, `.fill--shows`, `.fill--anime`). A column (`.ld-col-bar`, `.vol-bar`) is the same idea upright: axis grey with a 2px ink top.

**Geometry.** Bars and tracks are 8px tall with square ends. Chips, controls, swatches, markers and heat cells are square. No rounded corners anywhere: `border-radius` does not appear in the stylesheets.

**Type.** Ticks, value labels and legends are the label face at `--fs-11` (`.bar-value`, `.axis`, `.legend`, `.ld-col-value`, `.vol-count`, `.line-end-label`, `.meter-value`, the quadrant's tick labels). Axis titles are `--fs-13` (`.quad-x-label`, `.quad-y`, `.km-ylabel`). The chart title is the text face, bold, `--fs-15`, the same on every page, and is phrased as the question the chart answers ("Who is carrying my teams, in points above replacement per game?", not "Points above replacement").

**Numbers.** A true minus sign (U+2212), never a hyphen. Thousands separators from 1,000 up. Decimals as the pipeline gives them, or the statistic's stated precision. Percentages are whole numbers; a share under 10 points keeps one decimal, where it tells 4% from 4.9%.

**Lines.** A line connects every point and marks each one with a square (`.line-dot`, the last one larger). Bands and trails are off by default. A lately page may offer a control to show them (the retention chart's bands, the quadrant's "show trail"); the main page never does.

**Stat tiles.** At most three on a main-page panel. On a lately page, one headline figure per section: the first value in the section (or the first in each tab panel, when the section is only tabs) keeps its size, and every other value is a one-line mono fact (`.ld-value--line`: number, unit, interval).

**Around a chart.** The legend sits below the chart, on the left. Every chart has an sr-only table with the same numbers under it. One collapsed "how" per section. Small samples render per the existing policy (the status line and the faded interval). The hour-of-day strip is 24 outlined squares, each filled from the bottom in steps like the W/L marks.

**Tables.** A header row; numeric columns right-aligned (`.num`, which the track-page builder adds to any cell that is a number or a percentage); over ten rows collapsed behind "show all N". At phone width the track pages' tables stack each row into a labelled block and the numbers go back to the left.
