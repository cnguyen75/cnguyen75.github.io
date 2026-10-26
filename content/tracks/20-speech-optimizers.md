---
track: 20
side: c
slug: speech-optimizers
title: Which optimizer trains a speech model best?
when: 2025, rebuilt 2026
register: album
ready: true
one_line: Five optimizers, five seeds each, one new voice. The optimizers barely differed, and the metrics missed the failure you can hear.
---

## intro

**I set out to rank five optimizers. Four of them tied, and the most useful result was a failure none of my metrics caught.**

This began as a course project in optimization, and the first version did not test what it claimed: the "speech model" was a two-layer network fed random numbers in place of text. This is the same question asked properly. A pretrained speech synthesiser is adapted to a new reader's voice with five different optimizers, and the results are measured on sentences the model never trained on, with audio you can listen to.

## how it works

STEPS:
1. Start from a working model | A pretrained Tacotron 2 that already speaks in one voice, with a fixed vocoder turning its output into sound.
2. Adapt it five ways | SGD with momentum, Adam, AdamW, RMSprop and L-BFGS, each tuned on a validation set, each run with five random seeds.
3. Score it once | Fifty held-out sentences, scored a single time, under rules written before any result existed.

The new voice is one volunteer reader from a public audiobook corpus: 13 minutes of audio to train on, with separate validation and test sentences. Every optimizer gets the same budget, measured two ways, as 400 training steps and as the same amount of training time.

A difference between two optimizers counts as clear only if three things hold: the confidence interval excludes zero, the ranges across seeds do not overlap, and the gap is at least 1%. That rule was fixed in advance so that a small, lucky gap could not be reported as a win.

Four things are measured: how closely the model's output matches the real recording's spectrum, a second distance measure on the generated audio, the word error rate from a speech recogniser listening to the result, and how often the model fails to stop talking.

## the sample

**Listen to the same sentence four ways.** The speech recogniser transcribed both fine-tuned clips, Adam and AdamW, with zero errors. One of them does not know when to stop.

AUDIO-PAIR:
speech-optimizers/audio/s2-ground-truth.mp3 | Real recording
speech-optimizers/audio/s2-pretrained.mp3 | Before fine-tuning | synthetic
speech-optimizers/audio/s2-adam.mp3 | Adam | synthetic
speech-optimizers/audio/s2-adamw.mp3 | AdamW | synthetic, failed to stop
CAPTION: fig. 1 · sentence 2 of 5. After the AdamW clip finishes the sentence, it continues as a tone for about six seconds.

AUDIO-GRID: speech-optimizers/audio/manifest.json
BEHAVIOUR: five sentences as rows; columns for the real recording, the pretrained model and each of the five optimizers. Label every model clip "synthetic" and every clip whose manifest entry has stop_failure true as "failed to stop". No autoplay; playing one clip stops any other. Do not display the manifest's transcripts anywhere on the page. At phone width, one sentence at a time with a selector.
AUDIO-NOTE: In two clips (AdamW, sentences 1 and 2) the tail after the model failed to stop was a loud tone; its volume was reduced by 20 dB, to one tenth. Nothing else was changed. Each optimizer's clips come from its median seed, chosen by rule, not by ear.
ATTRIBUTION: Speech data from LibriTTS-R (reader 40), CC BY 4.0. Synthetic clips are model outputs imitating that reader's voice. They speak only sentences that reader actually recorded.

## results

STATS:
4 of 5 | optimizers that could not be told apart | within the spread across seeds
44% | of failed-to-stop clips scored as error-free | 83 of 187, by the speech recogniser
0 | stop failures before fine-tuning | against 6 to 12 of 50 afterwards

FIGURE: speech-optimizers/figures/test-results.svg
CAPTION: fig. 2 · test results for every seed, with the pretrained model and the real recording as reference lines.

TABLE:
Optimizer | Spectral error | Word error rate | Failed to stop (of 50)
SGD with momentum | 0.368 ± 0.003 | 34.5% ± 30.4 | 6.0 ± 7.2
Adam | 0.366 ± 0.010 | 6.8% ± 1.1 | 12.0 ± 4.8
AdamW | 0.362 ± 0.012 | 7.7% ± 1.3 | 11.0 ± 4.6
RMSprop | 0.375 ± 0.010 | 6.7% ± 1.1 | 6.4 ± 1.5
L-BFGS | 0.625 ± 0.116 | 16.5% ± 11.3 | 2.0 ± 1.9
Before fine-tuning | 1.106 | 4.4% | 0
Real recording | not applicable | 3.3% | not applicable

**Four optimizers tied.** SGD, Adam, AdamW and RMSprop cannot be separated on spectral error. AdamW has the lowest average, and that is not a win. With these settings its one difference from Adam changes the model's weights by under 0.04%, so the two are almost the same optimizer. Yet given identical data in identical order, they differ by more on a single seed than any two optimizers differ on average. That gap is the noise floor.

**L-BFGS was clearly worse,** on every seed, and about twice as slow per step. One caveat: it never performed a real line search, accepting its first trial step every time.

**The metrics missed the real failure.** After fine-tuning, the models often fail to stop: they finish the sentence and keep producing sound, sometimes a loud tone. The model they started from never does this. The recogniser scored 44% of those clips as perfect transcripts, because it ignores what comes after the words. Checkpoints were chosen on a loss that never asks the model to stop by itself, so selection could not see the problem either.

**Closer voice, less intelligible.** Fine-tuning moved the output about halfway from the original voice toward the new reader. It also made every model harder to understand than the one it started from.

FIGURE: speech-optimizers/figures/learning-curves-steps.svg
CAPTION: fig. 3 · validation error during training, one line per seed.

## outtakes

**The first version.** The course project reported that Adam beat SGD, with numbers that came from a placeholder network trained on random inputs and validated on clips it had trained on. The original is kept in the repository, unchanged, with a note on what was wrong with it.

**SGD's word error rate is overstated.** On unclear audio the recogniser sometimes loops, repeating a syllable dozens of times, and each loop counts as many errors. Capping each sentence's errors at its own length brings SGD from 34.5% to 22.9%. It is still the least reliable of the four, but the uncapped figure exaggerates. This check was made after seeing the results and is labelled that way.

**Things I would set differently.** The rule for flagging runs disturbed by other activity on the machine was too strict and flagged 20 of 25; step times stayed within 5%, and the conclusions hold on the unflagged runs. The time budget only constrained L-BFGS. The starting model was itself trained with Adam, which may favour Adam's relatives.

**Limits.** One reader, 13 minutes of training audio and 50 test sentences. Only the selected checkpoints were saved, so I can say stop failures appear early in training but not whether they grow.

**Next.** Choose checkpoints by letting the model speak freely and checking that it stops, make the failed-to-stop rate a headline metric, and test whether weighting the stop signal more heavily in training fixes it.

## built with

BUILT-WITH:
code | Code and README | https://github.com/cnguyen75/Speech-Generation
languages and frameworks | Python, PyTorch and torchaudio, SpeechBrain, Transformers, librosa, soundfile, jiwer, NumPy
data | LibriTTS-R, reader 40
attribution | Speech data from LibriTTS-R (reader 40), CC BY 4.0. Synthetic clips are model outputs imitating that reader's voice.
made with | the October 2026 rebuild, with an AI coding agent working to my brief
