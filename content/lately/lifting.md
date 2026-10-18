---
register: data
feed: lifting
title: Lifting, in depth
source: Hevy | https://www.hevyapp.com
---

# What's happening

## Main lifts
FEED: lifting.lifts

## Body weight
FEED: lifting.body_weight

## Training
ALIAS: workouts-by-weekday
FEED: lifting.training
STAT: cross.rhythm.workouts

## Hours by weekday: watching, listening, training
STAT: cross.time_budget

## Music during workouts
STAT: cross.lifting_soundtrack

# Why

## Is the cut costing strength? {#strength-index}
STAT: lifting.strength_index

## How fast am I losing weight? {#body-weight-since-the-cut}
STAT: lifting.body_weight_rate

## Am I stronger for my size? {#strength-for-body-weight}
ALIAS: strength-kept-per-pound-lost
STAT: lifting.relative_strength.*
STAT: lifting.strength_kept.*
