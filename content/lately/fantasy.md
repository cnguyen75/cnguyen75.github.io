---
register: data
feed: fantasy
title: Fantasy football, in depth
source: Sleeper | https://sleeper.com, ESPN | https://www.espn.com/fantasy/football/
---

## Playoff odds
STAT: fantasy.teams[].playoff_odds

## Record against the median
STAT: fantasy.teams[].record_vs_median

## Margins
STAT: fantasy.teams[].margins

## The schedule, replayed
STAT: fantasy.teams[].schedule_what_if

## Strength of schedule
STAT: fantasy.teams[].strength_of_schedule

## Points left on the bench
STAT: fantasy.teams[].lineup_efficiency

## Close start-or-sit calls
STAT: fantasy.teams[].start_sit

## Consistency
STAT: fantasy.teams[].consistency

## Draft value
STAT: fantasy.teams[].draft_value

## Waiver pickups
STAT: fantasy.teams[].waiver_impact

## Points by position
STAT: fantasy.teams[].position_share

## Projection accuracy
STAT: fantasy.platforms.*.projection_accuracy

## Is the win chance honest?
STAT: grading.win_chance

## Playoff odds, as they stood
STAT: grading.playoff_odds[].odds_over_time
