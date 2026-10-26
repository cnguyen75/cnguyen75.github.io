---
track: 17
side: c
slug: nba-shot-decisions
title: Why did they take that shot?
when: jan to mar 2025
part: part one | 18
register: album
ready: true
status_label: negative result
one_line: A course project said it had found what three NBA players were optimising. A year later I audited it, pre-registered every test, and ended with a precise reason the data cannot say.
as_of: 2026-10-13
---

## intro

**In 2025 I asked why LeBron James, Stephen Curry and James Harden took the shots they did. In 2026 I asked whether my answer had been real.**

The course version set each real shot beside plausible shots the player did not take and trained a small network to pick out the real one, with "optimality conditions" added to the loss so the network would learn each player's hidden cost. It reported that defender distance was the top factor for all three. Revisiting it a year later, with the rule that every test is written down before it runs, I found out which parts of that survive. Fewer than I expected, and the reason why is the most useful thing the project produced.

## how it works

STEPS:
1. A choice among alternatives | Of the 128,069 shots logged in 2014–15, the three players' 3,000 are the ones modelled; the rest of the league's shots are used only to estimate how likely any shot is to go in. Each real shot is paired with generated alternatives: other distances, other lengths of time holding the ball (touch time), same moment. A network learns a per-player score that ranks the real shot above the rest.
2. The audit | Re-run the original from a clean checkout, read every term of its loss, and check what each one could possibly change.
3. Recover the cost, or don't | Say what "recovering a player's cost" would mean, build made-up players with known costs, and fit them first. Only a method that passes on made-up players gets to see a real one.

Two things about the original became clear in the audit. The "optimality" terms could never shape the learned cost: two of the three depended only on the inputs and a multiplier, so the network's weights were not in them, and the one that did reach the network pushed the cost toward flat. And the comparison was not quite what it seemed: nothing was seeded; the validation split was made by row, so a real shot and its own alternatives could land on different sides of it; and the generator proposed alternatives more open than the real shots (the nearest defender was beyond 6 ft for 9 to 21% of real shots but 26 to 29% of alternatives), so part of what the network learned was the generator. What survives is a learned choice model, and it does work: on held-out shots it ranks the real shot first about half the time, where chance is under a third and a linear model does no better than chance.

Then the real question. Each option has an expected-points value: its chance of going in, estimated from the rest of the league, times what it is worth. A player's cost is whatever pulls their choices away from the highest-expected-points option. Can that cost be recovered properly? That took three designs. The first put the cost inside the optimality conditions and failed on made-up players: many different costs fit the made-up players equally well, a ridge in the fit, because the available context barely moves the best shot. The second, a choice model fitted by likelihood, fixed that, and its test turned out to be the flawed part: the made-up players rarely shot from mid-range, so there was nothing there to learn, and it added distance noise on top of a model that already includes randomness, counting noise twice. The third fixed the test. It recovered the made-up players' five parameters within 10% in all fifteen runs, and still failed its gate, by two runs of fifteen, on one accuracy limit. A power check showed why: an ideal estimator would pass that gate only 36% of the time. The limit was revised by a rule fixed before the numbers were seen, and on fresh runs the method passed 60 of 60.

So it was fitted to the real players, once, on a test set no earlier step had touched.

## the sample

EXCERPT:
                    LeBron    Curry     Harden
defender farther:   +9.0 ft   +7.9 ft   +9.1 ft   observed shift in shot distance
                    -0.6 ft   -1.3 ft   -1.1 ft   predicted by the fitted cost model
CAPTION: fig. 1 · the context-shift test. When the nearest defender is farther away, the real players shoot from eight to nine feet farther out. The fitted model predicts slightly closer.

DEMO: nba-shot-decisions/demo.json
BEHAVIOUR: pick a player. Concentric distance bands (0–4, 4–14, 14–22, 22+ ft) show attempts and field-goal percentage from all their shots; the data has no court position, so bands are the whole chart. Beside it, the twelve factors of the learned choice model with their importance ranges over five seeds, and the held-out comparison with intervals. A note under the chart says what the 22+ band is and is not: most of it is threes, and the arc is not at 22 ft.
DEMO-CAPTION: Aggregates only. The demo shows the audited course model. The cost model's real-player fit is reported below; it failed its criteria, so none of it is shown here.
ATTRIBUTION: Shot logs from Kaggle's "NBA shot logs" (2014–15 season, scraped from the NBA's stats API, licence not stated). Aggregates only.

## results

STATS:
49 to 64% | real shot ranked first on held-out shots | chance 29 to 30%; a linear model 26 to 32%
60 of 60 | made-up players whose costs the final method recovered | largest error 12%, on a test sized so a perfect method would pass
0 of 3 | real players whose cost the method described better than their own shot history | both pre-registered criteria failed

TABLE:
Step | Question | Outcome
v1, course project and audit | Can a network tell a player's real shot from generated alternatives? | Yes, on held-out shots. The optimality terms never touched the cost.
v2, cost inside the conditions | Recover a cost from optimality conditions? | No: many costs fit equally well, and the conditions are only local.
v3a, choice model | Recover it by likelihood? | Stopped by a flawed test: an almost empty band, and noise counted twice.
v3b, test redesigned | Same model, fair test | Parameters recovered 15 of 15; two runs just over one limit, so the gate failed.
Power check | Was that gate passable? | A perfect estimator passes it 36% of the time. It was not.
v3c, powered test, then real players | Same model, real data | Made-up players 60 of 60. Real players: better than expected points alone, worse than their own history, wrong about context.

FIGURE: nba-shot-decisions/figures/comparison.svg
CAPTION: fig. 2 · the held-out comparison for the course model, with bootstrap intervals.

**On the real players, the cost model beat expected points alone and lost to each player's own shot history.** A cost added to expected points explains their choices better than expected points by itself, for all three. It explains them worse than simply knowing where that player usually shoots from. As a description of what these players do, the cost adds nothing a histogram did not already know.

**And it got the one context it had backwards.** Real players shoot from farther out when the defender is farther away, because open shots are mostly threes and contested shots are mostly at the rim. The model, treating defender distance as something the player is handed, predicts the opposite. Defender distance is measured at the shot; it is partly a consequence of where the shot was taken. That is the finding. Once you stop treating it as an input, nothing else in this data changes what a three is worth relative to a layup from one shot to the next, and a cost can only be measured from how choices respond to such changes. Without court position, this data cannot say what a player is optimising.

**Two notes on what a pass would have meant.** The expected points the cost sits on were fitted on the rest of the league's shots (96,839 after filtering), never on the three players' own, so Curry's fitted cost for threes comes out negative, a bonus, and that is partly that he makes them more often than the league model assumes: skill, not preference. And the likelihood was scored on exact distance and touch time, where a five-parameter cost has nothing to say and a histogram knows that threes cluster at 24 to 26 feet; at band level the model would roughly tie the history rather than lose. Neither changes the conclusion. Both are why a pass would have been read more carefully than the course project read its own.

FIGURE: nba-shot-decisions/figures/importance.svg
CAPTION: fig. 3 · factor importance in the course model over five seeds. The ranges are wide; the original run, unseeded, changed Harden's top factor when re-run.

## outtakes

**The signed term.** The original "complementary slackness" penalty was a multiplier times a constraint value, with nothing keeping it positive. Minimising it rewards a large multiplier, so the term ran toward minus infinity (−214, −347 and −142 at the end of training) and the notebook called that convergence. A corrected version trains identically to plain cross-entropy.

**Thirteen of fifteen.** The third design's gate missed by two runs, and the rule said stop. The temptation to call 13 of 15 close enough was real, and giving in would have been a change to the test after seeing the result. The power check was the legitimate route: it asked, without using my method at all, whether a perfect estimator could pass the gate as written. Most of the time it could not, because the band-share limit sat at that estimator's 95th percentile and fifteen runs had to clear it together. The limit was revised by a rule fixed in advance, and the record keeps the miss.

**What a course project is.** Nothing was seeded, so a re-run gave different numbers and a different top factor for one player. The validation split leaked. Two feature bugs sorted the clock as text and let a running percentage spill across games. None of this is unusual for a course project. The rebuilt pipeline is seeded, split by shot, standardised on training rows only, and reproduces byte for byte in a fresh clone.

**Next.** A follow-up uses 2015–16 player tracking to measure a shooter's space at the catch, before the decision, rather than at the shot. That turns the question into one a first-order condition can answer: what a foot of space is worth in shot-clock seconds. It is [track 18](track:18), and it found the defender closes about four feet between the catch and the release, which is the fact this data could not see.

## built with

BUILT-WITH:
code | Code and README | https://github.com/cnguyen75/NBA-Inverse-Shot-Optimization
languages and frameworks | Python, PyTorch, scikit-learn, pandas, NumPy
data | Kaggle's "NBA shot logs", the 2014–15 season; aggregates only, licence not stated, not redistributed. The players named are public figures in public games.
made with | the 2026 audit, re-tests and rebuild, with an AI coding agent under pre-registered rules
