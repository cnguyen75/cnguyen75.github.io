---
register: data
feed: eating
title: Eating, in depth
source: Beli | https://beliapp.com
source_note: Beli dates are used only as counts, never tied to a place
---

# What's happening

## Recently tried
FEED: eating.recent

## Scores
STAT: eating.scores

## New cuisines by month
STAT: eating.new_cuisines

## Places ranked by weekday
STAT: cross.rhythm.restaurants

# Why

## Does home score higher? {#home-against-away}
STAT: eating.home_bias

## Does the order I rank in bias my scores? {#does-the-order-i-rank-in-move-the-score}
STAT: eating.order_effect

## Does the place before change the score?
STAT: eating.contrast_effect

## Do I try what I rate highest? {#what-i-try-against-what-i-rate-highest}
STAT: eating.choice_vs_taste

## Where do new places land? {#landing}
STAT: eating.landing

## Do scores drift when I re-rank? {#rerank-drift}
STAT: eating.rerank_drift

## Do I disagree with the crowd? {#against-the-community}
STAT: eating.contrarian
