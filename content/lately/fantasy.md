---
register: data
feed: fantasy
title: Fantasy football, in depth
source: Sleeper | https://sleeper.com, ESPN | https://www.espn.com/fantasy/football/
attribution_when: yahoo | Fantasy data provided by Yahoo Fantasy | https://sports.yahoo.com/fantasy/
---

# What's happening

## My teams, week by week
FEED: fantasy.lineup

## Who is carrying my teams
FEED: fantasy.carry

## Playoff odds
STAT: fantasy.teams[].playoff_odds

## Draft value
ALIAS: draft
STAT: fantasy.teams[].draft_value
STAT: fantasy.teams[].draft

## Waiver adds
STAT: fantasy.teams[].waiver_adds

# Why

## Good, or lucky? {#good-or-lucky}
ALIAS: strength-of-schedule
ALIAS: the-schedule-replayed
STAT: fantasy.quadrant
STAT: fantasy.teams[].strength_of_schedule
STAT: fantasy.teams[].schedule_what_if

## Am I a good manager, or a lucky one? {#manager-score}
ALIAS: waiver-pickups
STAT: fantasy.manager_score.components.*
STAT: fantasy.manager_score.composite
STAT: fantasy.teams[].waiver_impact
HOW: fantasy.manager_score.composite

## Where do my points come from? {#acquisition-split}
STAT: fantasy.teams[].acquisition_split

## How many points did I leave on the bench? {#points-left-on-the-bench}
STAT: fantasy.teams[].lineup_efficiency

## Are the projections honest? {#projection-accuracy}
ALIAS: is-the-win-chance-honest
STAT: fantasy.platforms.*.projection_accuracy
STAT: grading.win_chance
