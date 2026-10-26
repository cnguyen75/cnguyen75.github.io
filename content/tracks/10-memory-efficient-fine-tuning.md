---
track: 10
side: b
slug: memory-efficient-fine-tuning
title: Train it in a quarter of the memory
when: sep to oct 2026
part: part one | 11
register: plain
ready: true
status_label: complete
one_line: One laptop, no CUDA, and five ways to save memory, measured one at a time and then stacked. The largest trainable step grew from 8,192 to 131,072 tokens in 71% of the memory the baseline used, at a cost of 17 to 22% in throughput.
---

## Overview

**Fine-tuning a small language model on a laptop runs out of memory long before it runs out of time. With Prof. Eric Suess I asked how far one machine, an Apple M4 Pro with 48 GB running PyTorch on MPS and no CUDA, could push fine-tuning of SmolLM2-135M and 360M, and what each memory-saving lever costs in throughput.**

The answer has two parts. Five levers, each measured alone and then stacked, raised the largest step the machine could train sixteenfold while using less memory than the baseline did. And the one lever that costs time, checkpointing, is the only one that does: the other four are free.

## Approach

STEPS:
1. One lever at a time | Each lever is switched on alone against the same baseline, at the same model size and token count, and its peak memory and throughput are read off. Then all five go on together.
2. The optimizer, by hand | A block-wise 8-bit AdamW written from scratch and checked against torchao's: the two optimizers' states are compared byte for byte after the same steps.
3. Does 8-bit change what the model learns? | Six seeds of fp32 against six of 8-bit at both model sizes, judged by two one-sided tests (TOST) with equivalence margins written down before the runs.
4. A memory law | Peak memory is split into a fixed part and a per-token part, and the line is checked against the measured peaks.

The five levers:

- **Gradient checkpointing.** Activations are recomputed in the backward pass instead of kept. Peak memory fell 2.2 to 3.4 times; throughput fell 19 to 27%.
- **8-bit AdamW** (torchao). Optimizer state 3.9 times smaller, and the loss curve matches fp32.
- **Chunked cross-entropy.** The loss and logits phase was the peak. Computing the loss in chunks took about 40% off it.
- **Query-chunked attention.** Removes the term that grows with the square of the sequence length, so the peak depends only on tokens per step: about 266 MB per 1,024 tokens.
- **Checkpointed loss chunks.** Checkpointing applied to the chunked loss as well, which closes the stack.

## Results

STATS:
8,192 → 131,072 | tokens per step, baseline to all five levers | in 71% of the baseline's memory
17 to 22% | throughput cost of the full stack | all of it from checkpointing
6 seeds | 8-bit AdamW against fp32, TOST | equivalent at both model sizes

TABLE:
Lever | Peak memory | Throughput
Gradient checkpointing | 2.2 to 3.4× lower | 19 to 27% lower
8-bit AdamW (torchao) | optimizer state 3.9× smaller | none
Chunked cross-entropy | about 40% off the peak | none
Query-chunked attention | the seq² term gone; about 266 MB per 1,024 tokens | none
All five | 131,072 tokens a step in 71% of the baseline's memory | 17 to 22% lower

With everything on, peak memory follows a line: 884 MB fixed, plus 139.5 MB for every 1,024 tokens, and the measured peaks sit within 1% of it. That law is what makes the headline a prediction rather than a lucky run. It says how large a step the machine can take before the step is tried.

The hand-written optimizer matched torchao's optimizer state to the byte. Across six seeds at 600 steps, the gap between 8-bit and fp32 was at most 0.0004 in loss, against 0.0027 between seeds of the same optimizer, so 8-bit is equivalent to full precision at both model sizes under the margins fixed in advance.

## What measuring taught me

- Background daemons contaminated the throughput runs. A clean-machine protocol, saying what runs and what doesn't, came before any number was kept.
- What the allocator reserves is not reproducible, ±23% between identical runs, so arms are compared on live peak memory, not on reservation.
- Throughput variance is mostly a per-process offset, so paired A/B/B/A runs beat longer runs.

**Next.** The two models fine-tuned here are half of [part two](track:11): a fine-tuned SmolLM2 stands in for a hosted decision model, and the question is whether a risk guarantee calibrated at one option count survives deployment at another.

## Built with

BUILT-WITH:
languages and frameworks | Python, PyTorch, Transformers, Datasets and Accelerate, NumPy, pandas, Matplotlib
compute | One Apple M4 Pro laptop with 48 GB, PyTorch on MPS, no CUDA

PAPERS:
1706.03762 | Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser and Illia Polosukhin | 2017 | Attention Is All You Need
1604.06174 | Tianqi Chen, Bing Xu, Chiyuan Zhang and Carlos Guestrin | 2016 | Training Deep Nets with Sublinear Memory Cost
2110.02861 | Tim Dettmers, Mike Lewis, Sam Shleifer and Luke Zettlemoyer | 2021 | 8-bit Optimizers via Block-wise Quantization | block size 256 here against 2048 in the paper
2205.14135 | Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra and Christopher Ré | 2022 | FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness
2305.14314 | Tim Dettmers, Artidoro Pagnoni, Ari Holtzman and Luke Zettlemoyer | 2023 | QLoRA: Efficient Finetuning of Quantized LLMs | context
