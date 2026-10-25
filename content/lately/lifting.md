---
register: data
feed: lifting
title: Lifting, in depth
one_line: Training logged on Hevy, and whether the cut is costing strength.
source: Hevy | https://www.hevyapp.com
---

# What's happening

## Main lifts
short: lifts
FEED: lifting.lifts

## Body weight
short: weight
FEED: lifting.body_weight

## Training
short: training
ALIAS: workouts-by-weekday
FEED: lifting.training
STAT: cross.rhythm.workouts

## Hours by weekday: watching, listening, training
short: hours
STAT: cross.time_budget

## Music during workouts
short: music
STAT: cross.lifting_soundtrack

# Why

## Is the cut costing strength? {#strength-index}
short: strength
STAT: lifting.strength_index

## How fast am I losing weight? {#body-weight-since-the-cut}
short: losing
STAT: lifting.body_weight_rate

## Am I stronger for my size? {#strength-for-body-weight}
short: size
ALIAS: strength-kept-per-pound-lost
STAT: lifting.relative_strength.*
STAT: lifting.strength_kept.*
