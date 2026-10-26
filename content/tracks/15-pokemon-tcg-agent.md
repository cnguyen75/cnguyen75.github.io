---
track: 15
side: c
slug: pokemon-tcg-agent
title: Pokémon TCG agent
when: aug to sep 2026
register: album
ready: true
status_label: finished
one_line: A card-game agent for a live ranked ladder, and what I learned when I went back and checked my own claims about it.
---

## intro

**I ran the same test twice, with the same agent and the same opponent. It won 53.9% the first time and 66.2% the second.**

This is an agent for Kaggle's Pokémon Trading Card Game AI competition, where bots play a hidden-information card game against each other on a continuously running ranked ladder. You cannot see your opponent's hand or the order of either deck, each move has a time limit, and the field of opponents changes every day. It finished 2,166th of 6,807 teams.

## how it works

STEPS:
1. A hand-written policy | Scores every legal option from rules about the game. Fast, and right most of the time.
2. A search over what might be hidden | For close decisions, samples ten possible versions of the hidden cards and plays the whole turn out in each.
3. A learned judge | A value network, trained on games the agent played against itself, estimates who is winning at the end of each line.

The policy proposes and the search disposes. When the top options are close, the search compares them across the sampled worlds and overrides the policy only if another option is better by a set margin. Because the opponent's hand is unknown, every estimate is an average over guesses, not a calculation.

## the sample

DEMO: pokemon-tcg-agent/demo.json
BEHAVIOUR: a turn-by-turn replay of one complete game. A stepper moves through the agent's 30 decisions, grouped by turn. For the current decision show: both sides of the board as the agent saw it (active and benched Pokémon with HP and attached energy counts, prize, hand and deck counts; the agent's own hand by name), the events since the last decision, every legal option with the policy's score, and which was played. When the search ran, show the candidates it compared with their position estimates (0 to 100) as small bars, labelled "position estimate" and never "win chance", and mark clearly when it overrode the policy. Names and numbers only; no card text or art. Keyboard: left and right arrows step. At phone width, stack the two sides and collapse the option list to the top five plus the one chosen.
DEMO-CAPTION: One complete local game, the first one the recorder produced, not a selected one. The agent wins on turn 7. This opponent is a weak stand-in that the agent beats about two times in three; real opponents on the ladder were much closer to even.

The first override comes on turn 1. The policy wanted to attach energy. The search preferred a card that fetches a Pokémon from the deck, scoring it 55.6 against 51.2 on the agent's own 0-to-100 estimate of its position. That estimate blends a predicted chance of winning with a hand-made score, so it is not a probability. Across the game the search ran at 12 of 30 decisions and changed the move 4 times.

## results

STATS:
2,166 of 6,807 | final rank on the ladder | rating 701.2
±6.8 points | uncertainty of one 204-game test | at a 50% win rate
12 points | swing between two identical tests | 53.9% then 66.2%

FIGURE: pokemon-tcg-agent/figures/ladder.svg
CAPTION: fig. 1 · every submission's rating on the final ladder, by date.

FIGURE: pokemon-tcg-agent/figures/noise.svg
CAPTION: fig. 2 · repeated local tests of the same matchups, with 95% intervals.

The final build's first submission rated 820.6. The best single rating, 879.8, belongs to one of 18 resubmitted copies of that same build, so it reflects luck in early games more than strength.

Of the three numbers at the top of this section, the one I trust most is the uncertainty. A 204-game test cannot distinguish a real improvement of five points from nothing. The value network scores 0.81 at predicting the winner on held-out positions from its own games and 0.74 on positions from real ladder games, and both figures are optimistic, because the training run was stopped at the point where those same scores were best.

## outtakes

**Most of my own claims did not survive checking.** The project's original write-up listed a dozen results: search worth seven points, the value network worth 58% head to head, a matchup turned from 43% to 54%. Going back for the evidence, most had no surviving log. The matchup improvement reproduces as 9 wins of 21 before and 7 of 13 after, which is no evidence of anything. Even the rank I had written down was wrong; the exported leaderboard says 2,166th, not 2,531st. The write-up now keeps only what the logs support.

**The biggest real gains were not machine learning.** They came from fixing the agent's model of the game: an attack the card data listed as doing zero damage, and a deck list the agent had never actually read before the eleventh version.

**Limits.** The repository cannot be run as published. The competition's rules exclude its game engine and card data, and the trained network's weights are not included because its training data came partly from competition replays. Games are not reproducible move for move, because the engine draws its own randomness and the search is time-limited.

**Next.** Decide the size of test needed before running it, and keep every game log. An improvement that needs 2,000 games to see is worth knowing about before spending a week on it.

## built with

BUILT-WITH:
code | Code and README | https://github.com/cnguyen75/pokemon-tcg-ai
languages and frameworks | Python, PyTorch, NumPy
made with | the evidence audit and replay recorder, with an AI coding agent working to my brief
