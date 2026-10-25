---
register: data
feed: eating
title: Eating, in depth
one_line: What I eat, ranked on Beli, and what biases my scores.
source: Beli | https://beliapp.com
source_note: Beli dates are used only as counts, never tied to a place
---

# What's happening

## Recently tried
short: recent
FEED: eating.recent

## Scores
short: scores
STAT: eating.scores

## New cuisines by month
short: cuisines
STAT: eating.new_cuisines

# Why

## Does home score higher? {#home-against-away}
short: home
STAT: eating.home_bias

## Does the order I rank in bias my scores? {#does-the-order-i-rank-in-move-the-score}
short: order
STAT: eating.order_effect

## Does the place before change the score?
short: contrast
STAT: eating.contrast_effect

## Do I try what I rate highest? {#what-i-try-against-what-i-rate-highest}
short: choice
STAT: eating.choice_vs_taste

## Where do new places land? {#landing}
short: landing
STAT: eating.landing

## Which cuisines are a safe bet? {#safe-bet}
short: safe bets
STAT: eating.safe_bet
