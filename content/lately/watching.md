---
register: data
feed: watching
title: Watching, in depth
source: Simkl | https://simkl.com
---

# What's happening

## My rankings
FEED: watching.rankings

## Hours watched
FEED: watching.hours

## Recently
FEED: watching.recent

## Hours by month
STAT: watching.hours_by_month

## Pace
STAT: watching.pace

## Keeping up
STAT: watching.keeping_up

## Genres
STAT: watching.genre_mix.*

## Release decades
STAT: watching.release_decades

## Runtime
STAT: watching.runtime

## Countries
STAT: watching.countries.*

## My top ten against the community
STAT: watching.contrarian.*

## Tiers
STAT: watching.tier_distribution.*

## Tiers: genres and decades
STAT: watching.tier_genres_decades

# Why

## Do I finish what I start? {#completion}
NOTE: Only finished titles are logged as a rule, so completion and drop counts cover what I chose to record.
STAT: watching.completion.*

## Do I bail after one episode? {#dropped-after-one-episode}
NOTE: Only finished titles are logged as a rule, so completion and drop counts cover what I chose to record.
STAT: watching.first_episode_drops

## What earns an S? {#s-tier}
STAT: watching.s_tier

## Can my tiers be predicted? {#tier-model}
STAT: watching.tier_model

## Has my taste drifted? {#taste-drift}
STAT: watching.taste_drift

## Where do I disagree with the crowd? {#community-gap-by-genre}
STAT: watching.community_gap_by_genre

## Do I binge the ones I love? {#pace-vs-tier}
STAT: watching.pace_vs_tier

## Do my tiers agree with the crowd? {#tiers-against-the-community}
STAT: watching.tier_contrarian.*

## Do I finish the ones I rate highest faster? {#tiers-completion-and-pace}
STAT: watching.tier_completion_pace

## How long do titles sit on my list? {#backlog}
STAT: watching.backlog
