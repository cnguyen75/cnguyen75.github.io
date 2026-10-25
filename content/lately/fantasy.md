---
register: data
feed: fantasy
title: Fantasy football, in depth
one_line: My fantasy leagues, judged on strength against luck.
source: Sleeper | https://sleeper.com, ESPN | https://www.espn.com/fantasy/football/
attribution_when: yahoo | Fantasy data provided by Yahoo Fantasy | https://sports.yahoo.com/fantasy/
---

# What's happening

## My teams, week by week
short: teams
FEED: fantasy.lineup

## Who is carrying my teams
short: carrying
FEED: fantasy.carry

## Playoff odds
short: odds
STAT: fantasy.teams[].playoff_odds

## Draft value
short: draft
ALIAS: draft
STAT: fantasy.teams[].draft_value
STAT: fantasy.teams[].draft

## Waiver adds
short: waivers
STAT: fantasy.teams[].waiver_adds

# Why

## Good, or lucky? {#good-or-lucky}
short: luck
ALIAS: strength-of-schedule
ALIAS: the-schedule-replayed
STAT: fantasy.quadrant
STAT: fantasy.teams[].strength_of_schedule
STAT: fantasy.teams[].schedule_what_if

## Am I a good manager, or a lucky one? {#manager-score}
short: manager
ALIAS: waiver-pickups
STAT: fantasy.manager_score.components.*
STAT: fantasy.manager_score.composite
STAT: fantasy.teams[].waiver_impact
HOW: fantasy.manager_score.composite

## Where do my points come from? {#acquisition-split}
short: points
STAT: fantasy.teams[].acquisition_split

## How many points did I leave on the bench? {#points-left-on-the-bench}
short: bench
STAT: fantasy.teams[].lineup_efficiency

## Are the projections honest? {#projection-accuracy}
short: projections
ALIAS: is-the-win-chance-honest
STAT: fantasy.platforms.*.projection_accuracy
STAT: grading.win_chance
