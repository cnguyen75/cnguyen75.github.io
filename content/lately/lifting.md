---
register: data
feed: lifting
title: Lifting, in depth
source: Hevy | https://www.hevyapp.com
---

# What's happening

## Main lifts
FEED: lifting.lifts

## Training
FEED: lifting.training

## Body weight
FEED: lifting.body_weight

## Progress by lift
STAT: lifting.progress.*

## Hours by weekday: watching, listening, training
STAT: cross.time_budget

## Workouts by weekday
STAT: cross.rhythm.workouts

## Music during workouts
STAT: cross.lifting_soundtrack

# Why

## Is the cut costing strength? {#strength-index}
STAT: lifting.strength_index

## How fast am I losing weight? {#body-weight-since-the-cut}
STAT: lifting.body_weight_rate

## How much strength do I keep per pound lost? {#strength-kept-per-pound-lost}
STAT: lifting.strength_kept.*

## Which lifts held up since the cut? {#retention}
STAT: lifting.retention.*

## Am I stronger for my size? {#strength-for-body-weight}
STAT: lifting.relative_strength.*

## Does weight change show up in strength weeks later? {#weight-change-and-strength-weeks-later}
STAT: lifting.lag_check

## Does a big week pay off the next? {#volume-lag}
STAT: lifting.volume_lag

## Do more sessions mean more strength? {#consistency}
STAT: lifting.consistency
