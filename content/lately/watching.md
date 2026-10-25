---
register: data
feed: watching
title: Watching, in depth
one_line: What I watch and rank on Simkl, and what my tiers respond to.
source: Simkl | https://simkl.com
attributions_when: watching.by_director, watching.by_studio, watching.by_lead, watching.blockbuster, watching.sequels, watching.crowd_agreement
---

# What's happening

## My rankings
short: rankings
FEED: watching.rankings

## Tiers {#tiers}
short: tiers
ALIAS: tiers-genres-and-decades
FEED: watching.tiers

## Recently
short: recently
FEED: watching.recent

## Keeping up
short: keeping up
STAT: watching.keeping_up

## Genres
short: genres
STAT: watching.genre_mix.*

# Why

## What does my taste look like? {#taste-profile}
short: taste
ALIAS: s-tier
STAT: watching.taste_profile
STAT: watching.s_tier

## Whose films earn an S? {#whose-films}
short: whose films
STAT: watching.by_director
STAT: watching.by_studio
STAT: watching.by_lead

## Do I agree with the crowd? {#crowd-agreement}
short: crowd
ALIAS: community-gap-by-genre
ALIAS: tiers-against-the-community
ALIAS: my-top-ten-against-the-community
STAT: watching.crowd_agreement
STAT: watching.community_gap_by_genre
STAT: watching.tier_contrarian.*
STAT: watching.contrarian.*

## Do I like blockbusters or small films? {#blockbuster}
short: blockbusters
STAT: watching.blockbuster

## Do sequels hold up? {#sequels}
short: sequels
STAT: watching.sequels

## Do I finish what I start? {#completion}
short: completion
NOTE: Only finished titles are logged as a rule, so completion counts cover what I chose to record.
STAT: watching.completion.*
