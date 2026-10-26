---
track: 18
side: c
slug: nba-catch-decisions
title: A foot of space is worth eight seconds
when: oct 2026
part: part two | 17
register: album
ready: true
one_line: Part one found that defender distance, measured at the shot, is partly a consequence of the shot, so shot logs alone could not say what a player was optimising. Public player tracking puts the defender before the decision. Priced in shot-clock seconds, a foot of space at the catch is worth about eight seconds to the league. Whether shooters are right to want it, the data can't say, and the write-up shows exactly where it runs out.
as_of: 2026-10-14
---

## intro

**Do great shooters shoot when the points say to? Using player tracking from the first half of 2015–16, I parsed 621 games, valued every catch with a shot model checked on games it had never seen, and wrote every test down before running it.**

[An earlier attempt](track:17), on 2014–15 shot logs, tried to recover players' costs from defender distance at the shot and failed, because that distance is partly an outcome of the shot itself. This page measures space at the catch instead, before the decision, which is why its exchange rate can be estimated where the earlier cost could not. The idea underneath both is the same: treat a shot as a choice the player made to get the most out of the possession, and read off, from the choices, the costs he weighs that never appear in a box score. This page shows what that idea can deliver and what it can't.

## how it works

STEPS:
1. Find the catches | Every frontcourt catch in 621 games, from 25 frames a second of every player and the ball. The catch detector was fixed, written down, and checked by eye on 60 held-out catches labelled before it ran: 57 of 60 right.
2. Value every option | A shot's value from a model of how often shots like it go in, given how open the shooter was at release, scored once on 58 games it had never seen. Continuing (a pass, a drive, a dribble) valued by the points possessions went on to produce when players didn't shoot. Both in possession points.
3. Write the test first | Every pass-or-fail threshold committed before its run; every test that failed stays in the write-up as failed. The decision modelled: shoot now, or continue.
4. Price space in clock seconds | Two things move the decision to shoot: how open the player is, and how much shot clock is left. Dividing the effect of a foot of space by the effect of a second of clock gives an exchange rate, seconds of clock per foot of space, and whatever hidden cost the player carries cancels out of that ratio.

The defender closes about four feet between the catch and the release (Curry 7.7 ft to 4.0, LeBron 7.3 to 3.6, Harden 8.1 to 3.4). The 2014–15 data could not see that, and it is why space at the catch is a cause and space at the shot is partly an effect.

## the sample

FIGURE: nba-catch-decisions/figures/stage7/stage7_clock_added.svg
ALT: Line chart by shot clock at the catch, in four-second bins from 0 to 24 seconds: the league's shoot-now rate for catches, and the adjusted make rate for taken shots with intervals. The 0 to 4 second bin is drawn faded and labelled rushed.
CAPTION: fig. 1 · the shots the clock forces. The league's shoot-now rate rises from about 13% with 12–20 s on the clock to 25% with 4–8 s. The extra shots taken under clock pressure go in about as often as the rest: 1.4 percentage points lower, interval −6 to +3. Only shots in the last four seconds are clearly rushed, 6 percentage points lower (−8.7 to −3.1).

DEMO: nba-catch-decisions/demo.json
BEHAVIOUR: the exchange-rate map. Build demo.json from results.json → stage8_exchange_rate_pooled.all: one row per eligible player (219) with name, exchange rate in seconds per foot, its interval, catch count, and whether the clock resolves him. Draw a dot per player sorted by exchange rate with its interval as a thin bar; players the clock doesn't resolve are hollow and sorted to the end. Mark Curry, LeBron and Harden with labels. Hovering or tapping a dot shows name, rate, interval and catches. The league median (7.8 s/ft) is a rule. At phone width, show the ten highest and ten lowest resolved players and the three, as a list.
DEMO-CAPTION: What a foot of space at the catch is worth to each player, in shot-clock seconds. Each player's estimate is pulled toward the league figure in proportion to how little data he has, so thin samples don't produce wild numbers. Wide intervals are honest: for 28% of players the clock doesn't measurably move the decision at all, Harden among them.
ATTRIBUTION: Player tracking from the NBA's 2015–16 SportVU feed (27 October 2015 to 23 January 2016, 621 usable games), archived publicly; licence not stated. Raw data is not redistributed; aggregates only. Players named are public figures in public games.

## results

STATS:
7.8 s | of shot clock: what a foot of space at the catch is worth to the typical league player | interquartile range 6.1 to 11.8
8.8 vs 5.3 s | on threes against mid-range, from one fit to the whole league | by situation: 8.8 when trailing by five or more, 6.6 when leading by five
0.92 s | from catch to release, the floor shooters reach against a fast closeout | 1.04 s against a slow one

TABLE:
Question | What the data said
Does space move the decision? | Yes, strongly: from the tightest to the most open third of catches, Curry's catch-and-shoot rate goes from 5% to 46%, Harden's from 4% to 32%, LeBron's from 2% to 14%.
Does space move the points? | Barely. The measured value of a foot at the catch is near zero, partly because defenders take most of it back before the release.
Do players trade space for time? | Yes, at about eight seconds a foot for the typical player. Curry's estimate is 5.1 (interval 3.2 to 13.3, which reaches the league figure); LeBron's 6.1 (3.5 to 17.0). Harden's clock response is not measurable.
Does the situation change the rate? | Trailing by five or more: 8.8; leading by five: 6.6, a difference of 2.1 (1.2 to 3.1). Fourth quarter and home court change nothing.
Do shooters trade set-up time against a closing defender? | No: they release at a floor. Median catch-to-release falls from 1.04 s against the slowest closeouts to 0.92 s against the fastest. Against a fast closeout the shooter lets go about 0.13 s sooner, and that keeps about 1.5 ft of space from the defender. Waiting another tenth of a second would lose about 2 percentage points of make probability to the closing defender and gain about half a point from being more set. Curry and Klay Thompson release at 0.80 s.
Is there a hot hand? | Not here. After a make, the next shot is about 2 points less likely to go in, with openness and motion controlled.
Does the pass find the open shooter? | By the registered measure, no: when a player passes, the ball reaches the most open shooter 28% of the time against a 33% chance baseline, because many passes go to non-shooters. Counting only passes to shooters (a comparison added after the fact), 35% against 31%. The receiver is, on average, about three feet less open than the most open shooter was, and about a foot and a half closer to the basket: passers trade space for position. The open corner shooter gets the ball one time in seven.
Do they shoot when the points say to? | Unanswered. Against the measured values, the league shoots far less than a points-maximiser would at every clock state. But those values come from shots that were taken, and whether players pass up shots because they see something the tracking can't needs a model of how much better the shots players chose were than the ones they didn't. Such a model is only as sharp as the variables that push players to shoot without changing whether the shot goes in, and three sets of them were too weak: the model needed to measure that hidden difference to within about ±0.02 on a scale that runs from −1 to +1, and the three reached only ±0.06 to ±0.16.

FIGURE: nba-catch-decisions/figures/stage10/stage10_release_timing.svg
ALT: Line chart of median catch-to-release time against the nearest defender's closing speed half a second before release, by decile: it falls from about 1.08 seconds at the slowest closeouts to 0.92 and stays flat. Redick, Thompson and Curry are marked as single points, Thompson and Curry at 0.80 seconds.
OVERLAY: nba-catch-decisions/figures/stage10/stage10_release_timing.overlay.svg
CAPTION: fig. 2 · release timing against the closeout.

**The release-timing result is the one place the idea could be tested directly.** If a player senses something about a look that the tracking can't see, it raises the value of shooting now and of waiting a moment by the same amount, so it cancels out of the comparison between them. That means how much make probability changes with a tenth of a second more set-up can be measured from the shots that were taken. The answer was a limit, not a trade-off: at a fast closeout another tenth of a second costs about two percentage points of make probability and buys about half a point (−0.2 to +1.3), so shooters release as fast as their mechanics allow, faster for Curry and Thompson, and there is no hidden timing cost to reveal.

## outtakes

**Five pass-or-fail thresholds set too tight to pass.** A calibration limit a perfect model passes 29% of the time. A limit on each group of shots that sat at about 1.3 times the group's own sampling noise, missed by 0.00002. Two more of the same kind, found by an independent review of the code and gates. And a bar in the shots-not-taken model (the last row of the table above) that no set of variables in the data could reach. Each was caught by asking how often a perfect method would pass the threshold, each is numbered in the record, and the failed results stay failed. The review also confirmed the code supports the numbers.

**One finding I got wrong before it was right.** An early stage concluded openness doesn't move the value of a shot. It was measuring openness at the catch on shots that were taken, and almost no catch-and-shoots are taken from a tight catch. By openness at release, league threes go in 28% of the time at 0–2 ft and 41% at 8–12 ft. The flat result came from looking only at shots players chose to take, and finding that was the turn the project needed.

**Absolute space, not relative.** I expected players to judge a look against what the game was giving them. They don't, measurably: absolute openness predicts the decision better than openness relative to the game's average, and adding the relative version changes nothing.

**Curry after a made first shot.** In games where his first attempt goes in, he shoots off the catch less, 18% against 27% (interval −15 to −3 points). One descriptive split, no registered hypothesis, three explanations the data can't separate: the defence tightens, he moves to the dribble, or the game script changes. It stays a curiosity.

**Why 2015–16.** The NBA's raw tracking feed was publicly readable for the first half of that season and stopped on 23 January 2016; the archive ends the same day. Ten years on it is still the only public NBA tracking data there is, so anything built on it carries that date.

## built with

BUILT-WITH:
code | Code and README | https://github.com/cnguyen75/nba-catch-decisions
languages and frameworks | Python, pandas, NumPy, SciPy, scikit-learn, Matplotlib, py7zr
data | The NBA's 2015–16 SportVU feed, archived publicly; aggregates only, licence not stated, not redistributed
papers | Skinner (2011) for the clock-threshold form; Cervone, D'Amour, Bornn and Goldsberry (2014) for valuing possessions from tracking; Sandholtz, Mortensen and Bornn (2019) for zone-level allocation; Bocskocsky, Ezekowitz and Stein (2014) for rhythm and shot difficulty; Chang and colleagues (2014) for defender height; Goldman and Rao (2012) for pressure
made with | the 2026 build, with an AI coding agent under pre-registered rules and a second, independent agent auditing the gates

LINKS:
The full record, stage by stage | https://github.com/cnguyen75/nba-catch-decisions/blob/main/record/feasibility.md
