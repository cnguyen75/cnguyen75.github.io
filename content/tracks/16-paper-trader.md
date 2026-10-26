---
track: 16
side: c
slug: paper-trader
title: Paper Trader
when: aug 2026 to present
register: album
ready: true
status_label: in progress
one_line: An automated ETF-trading system that wrote down its pass and fail criteria before any backtest ran. The first strategy failed its test, and the live system has since failed two of its own criteria.
as_of: 2026-10-12
live: demo.json
---

## intro

**Most backtests are graded after the fact, by the person who wants them to pass. I wanted one that could tell me no.**

Give a trading strategy enough variations and one of them will backtest beautifully, which proves nothing. So the bar came first: pass and fail criteria committed to git before the backtester existed, a ledger of every look at the data, and a ban on tuning after seeing a result. Then the system had to clear its own bar on a paper account, one decision at a time.

## how it works

STEPS:
1. Write the bar down | Pass and fail rules are committed before any result exists. Tests fail if a frozen parameter moves.
2. Backtest once | Ten years of data, one run, graded against the written bar. Every look at the data is logged.
3. Trade on paper | Each live decision is checked against a simulated twin running on the same data.

There have been two pre-registrations. The first tested a strategy: hold the five strongest sector ETFs each week, and step aside when the market's trend breaks. It was graded on ten years of history and shelved.

The second tests something one year of trading can actually measure. A year is far too short to show whether a strategy has an edge, so the second bar is about the system: does every live decision match a simulated twin, do orders fill near the modelled price, and does every scheduled run happen?

The live strategy works from a fixed list of 14 ETFs, sector funds plus three broad-market ones. It holds every one that is trading above its own 200-day average, equal-weighted, and goes to cash when the market's trend breaks. It decides on Thursday's close and trades on Friday morning, on a paper account only, which the code asserts at start-up.

## the sample

A real exit, from the ledger.

EXCERPT:
2026-10-08  signal  XLB left the eligible set; target book is 8 ETFs, equal weight
2026-10-09  paper   sell 9.511888 XLB, filled 49.26 (open 49.45; 09:35 market 49.27)
2026-10-08  twin    same 8-ETF book, identical inputs
2026-10-08  check   match
CAPTION: fig. 1 · one decision, live and simulated. The ledger stores the twin's book, not its orders, so the match is book against book.

DEMO: paper-trader/demo.json
BEHAVIOUR: a strip of 29 session squares in date order. Selecting one shows that day's rule, the target book, any orders and fills, the twin's book and whether they matched. The first two sessions carry a hatched "voided" band. The three missed fills are marked "M" with the reason. Equity is shown only as a percentage change from the clock start. At phone width, show a list instead of the strip.
DEMO-CAPTION: Every live decision from 27 August to {as_of:date}. Fractional-share fills on a paper account; these are not real trades.

## results

STATS:
{decisions:ratio} | decisions matching the twin since the clock started{decisions:unchecked} | {as_of:asofnote}
0.74 | first strategy, ten-year Sharpe | against a required 1.06
3 | scheduled runs missed | against a limit of 2 for the year

FIGURE: paper-trader/figures/v1-equity-vs-spy.svg
CAPTION: fig. 2 · the first strategy against buy-and-hold, with the three stress periods shaded. It lost less in each crash and still failed its bar.

The first strategy returned 8.76% a year at a Sharpe ratio of 0.74, against 15.68% and 0.91 for simply holding the index. The bar was 1.06. The verdict was to shelve it, and it stayed shelved.

The live run, measured against the second set of criteria:

TABLE:
Criterion | Reading | Bar | Status
Live decisions matching the twin | {decisions:ratio} since the clock started{decisions:unchecked}; {decisions:ratio_all} counting the voided first week | 50 of 52 signal weeks | on track
Scheduled runs missed | 3 | at most 2 in the year | failed on 2 Oct 2026 (final)
Fill price against the open, median | 24.28 bps | at most 15 | failing so far
Fill price against the open, 95th percentile | 48.41 bps, or 51.05 without the voided first week | at most 50 | depends on the reading
Signed slippage, median | +1.75 bps | at most 10 | passing
Every order carries the reason it was placed | 0 of 43 original reasons intact; all 43 reconstructed | every order | not met (final)

FIGURE: paper-trader/figures/live-parity.svg
CAPTION: fig. 3 · all {decisions:total} sessions: {decisions:voided} in a voided first week, {decisions:unchecked_count} entered after a failed run with no twin to compare with, and the other {decisions:matched_count} all matching.

Most of the gap between fills and the open is not execution. Orders go in at 09:35, five minutes after the open. Measured against the market at 09:35, the median deviation is 8.78 basis points. The median movement in prices over those five minutes is 24.69. The two are separate medians, so they do not add up to the 24.28 in the table.

## outtakes

**The first strategy looked vindicated, and was not.** It lost less than the market in all three crashes in the sample, which reads like proof that stepping aside works. A cost definition fixed before the number was computed said otherwise: 13 of 14 trips to cash lost money, and the trend gate cost about 5% a year by selling after declines had begun and buying back after recoveries had begun. Only a definition written in advance could show that, because any definition chosen afterwards would have been chosen knowing what it would say.

**The system has already failed one of its own tests.** Three scheduled runs were missed in the first five weeks, against a limit of two for the whole year: a dropped connection, an order sized in dollars that asked to sell more shares than were held, and a machine that was offline. Each was recorded as a miss and not re-run. The criterion was not amended. The decision record is perfect and the run still fails on reliability, which is the bar doing its job against its own author.

**And a second, found by audit.** One of the run's written criteria says every order carries the reason it was placed. The code that polled for fills overwrote that field with the word "polled", from the first live order on. The 43 reasons were reconstructed from each order's own record and are marked as reconstructions; the originals are gone. The criterion is recorded as not met for this run and was not amended. The fix keeps fill status in its own field, and was drilled against 171 injected faults in an isolated copy before it touched the live ledger.

**Limits.** The {decisions:matched_count} matching decisions show the system is faithful to its own simulation, not that the strategy has an edge. The twin shares the strategy's code, so it catches data and wiring faults but not a logic error present in both. The whole thing runs on one laptop, so sleep and network loss are part of what is being measured.

**Next.** Close this run, since two of its criteria have failed, and start a new pre-registration on an always-on machine. Make the twin independent by writing a second, minimal implementation of the rule that shares no code with the first.

## built with

BUILT-WITH:
languages and frameworks | Python, pandas, NumPy, alpaca-py, pandas-market-calendars, pytest
data | Fills and prices from Alpaca's paper-trading API
