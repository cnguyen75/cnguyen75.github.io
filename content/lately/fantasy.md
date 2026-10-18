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

## Record against the median
STAT: fantasy.teams[].record_vs_median

## Margins
STAT: fantasy.teams[].margins

## Points by position
STAT: fantasy.teams[].position_share

## Draft value
STAT: fantasy.teams[].draft_value

## Waiver adds
STAT: fantasy.teams[].waiver_adds

## Playoff odds, as they stood
STAT: grading.playoff_odds[].odds_over_time

# Why

## Good, or lucky? {#good-or-lucky}
STAT: fantasy.quadrant

## Am I a good manager, or a lucky one? {#manager-score}
STAT: fantasy.manager_score.components.*
STAT: fantasy.manager_score.composite

## Where do my points come from? {#acquisition-split}
STAT: fantasy.teams[].acquisition_split

## Did I draft well, round by round? {#draft}
STAT: fantasy.teams[].draft

## Would another schedule have changed my record? {#the-schedule-replayed}
STAT: fantasy.teams[].schedule_what_if

## Has my schedule been hard? {#strength-of-schedule}
STAT: fantasy.teams[].strength_of_schedule

## How many points did I leave on the bench? {#points-left-on-the-bench}
STAT: fantasy.teams[].lineup_efficiency

## Do I get the close calls right? {#close-start-or-sit-calls}
STAT: fantasy.teams[].start_sit

## Am I steady week to week? {#consistency}
STAT: fantasy.teams[].consistency

## How much do my pickups carry? {#waiver-pickups}
STAT: fantasy.teams[].waiver_impact

## Are the projections honest? {#projection-accuracy}
STAT: fantasy.platforms.*.projection_accuracy

## Is the win chance honest?
STAT: grading.win_chance
