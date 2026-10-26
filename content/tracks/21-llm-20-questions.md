---
track: 21
side: c
slug: llm-20-questions
title: LLM 20 Questions
when: may to aug 2024
register: plain
ready: true
one_line: A two-model agent for Kaggle's LLM 20 Questions competition (2024). Replayed against itself two years later, it never guessed the word, though the word was on its list every time.
---

## Overview

Kaggle's 2024 LLM 20 Questions competition paired agents in the parlour game: one side picks a secret word, the other asks yes-or-no questions and guesses. My agent used two open models in 4-bit, an 8-billion-parameter one to ask and guess and a 7-billion one to answer, with a scripted opening question and a fixed list of candidate answers. It finished 495th of 832 teams. In 2026 I replayed it against itself on a laptop to find out what it had actually done.

## Approach

**Write the plan, then run.** The replay plan (12 secret words, the agent as submitted, each model left on its publisher's default settings, game 0 shown whatever its outcome) was committed before any game. A second step, committed before the first was scored, swapped both models for Qwen3-8B (2025) with the agent code unchanged, to see what two years of model progress did to the same agent.

**Not quite the same arithmetic.** The submission ran its models compressed to 4 bits on an NVIDIA GPU. On the laptop they run compressed to 4 bits on Apple's MLX, which compresses the weights a different way; the project's write-up says so.

## Example

DEMO: llm-20-questions/demo.json llm-20-questions/demo_qwen3.json
BEHAVIOUR: replay game 0 of the original run turn by turn: the question, the answer, the guess, and whether the guess matched a word on the candidate list; a second tab replays the Qwen3-8B run's game 0 the same way. Both are game 0 regardless of outcome, as planned before the runs. Tabs labelled "2024 models" and "Qwen3-8B (2025)".

## Results

STATS:
0 of 12 | games won by the 2024 agent against itself | 95% interval 0 to 24%
1 of 12 | with Qwen3-8B (2025) in both roles | the runs cannot be told apart
495th | of 832 teams on the final leaderboard | not top 50, as I had remembered it

FIGURE: llm-20-questions/figures/self-play.svg
CAPTION: fig. 1 · wins and opening-question accuracy by run.

- The scripted opening question was answered correctly in every game.
- In every game the secret word was on the agent's candidate list, and the 2024 guesser never said it. It had the answer in front of it and couldn't produce it.
- The 2025 model asks short, sensible questions and then repeats itself: across its 227 guesses it used only 23 distinct words.

## Limitations

- Twelve games a run, so the intervals overlap and no run is shown to beat another.
- A second 2024 run, with small fixes to how the models' replies are read back, is in the project's write-up, but it measures a bug rather than the fixes: one fix left a stray word glued to the end of every guess, so no guess could match. It was left as run rather than corrected after the fact.
- One game spanned a laptop sleep; its result counts and it is left out of the timing figures in the project's write-up.

## Built with

BUILT-WITH:
code | Code and README | https://github.com/cnguyen75/MLProjects
data | The project's results file, which every number on this page traces to with the command that produced it; Kaggle leaderboard exports kept private because they name other teams
attribution | The agent and the replay code are mine; the models are their publishers': an 8-billion-parameter open model asking and guessing and a 7-billion one answering in the 2024 submission, and Qwen3-8B, 2025, for the comparison.
made with | the 2026 replay, with an AI coding agent under a plan committed before the runs
