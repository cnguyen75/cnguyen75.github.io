---
register: data
feed: listening
title: Listening, in depth
one_line: What I play, and how long an artist stays in rotation.
source: Last.fm | https://www.last.fm
---

# What's happening

## Right now
FEED: listening.recent

## Genres by month
STAT: listening.genre_mix

## Plays by weekday and hour
STAT: cross.rhythm.plays

# Why

## Does old music last longer than new? {#artist-survival}
SOURCE: apple music library
ALIAS: artist-survival-all
STAT: listening.artist_survival
STAT: listening.artist_survival_all

## Albums or songs? {#album-listening}
STAT: listening.album_listening

## Do I dig back or keep up? {#discovery-direction}
ALIAS: nostalgia
STAT: listening.discovery_direction
STAT: listening.nostalgia

## Who lasts? {#enduring}
ALIAS: concentration
STAT: listening.enduring
STAT: listening.concentration

## Is my taste narrowing? {#entropy}
STAT: listening.entropy

## Do I keep playing what's new? {#retention-new-artists}
STAT: listening.retention_new_artists

## How fast does an album burn out? {#album-half-life}
STAT: listening.album_half_life
