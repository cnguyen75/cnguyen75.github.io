---
track: 11
side: b
slug: abstention-gate-option-shift
title: Does the guarantee survive more options?
when: oct 2026 to present
part: part two | 10
register: progress
ready: true
status_label: in progress
one_line: An abstention gate certified to let through at most 5% wrong answers was calibrated on five options and deployed on 150. It let through 7.2% on a hosted decision model and 7.7% on a small model fine-tuned to match it, and the two exact-looking fixes are underpowered or leak.
with: With Prof. Eric Suess, CSU East Bay
as_of: 2026-10-21
---

## question

A decision model answers a question by picking one of K options, or abstaining. A Learn-then-Test (LTT) abstention gate sets the confidence threshold so that, with 90% confidence, at most 5% of the answers it accepts are wrong. The guarantee is proved for exchangeable data: the items the gate is calibrated on and the items it meets later are supposed to be draws from the same distribution.

The number of options is not part of that bargain. A gate calibrated on five-way questions and deployed on 150-way ones meets scores from a different distribution, because confidence falls as options are added. So the question is whether the guarantee survives a change in the option count between calibration and deployment. K is treated as an observed covariate that breaks exchangeability, and the fixes that treat it as one are tested too.

## approach

STEPS:
1. Pre-register everything | α, δ, the threshold grid, the support floor, the splits, the four regimes and the violation criterion were fixed before any run. Every deviation since is a dated amendment: 18 so far.
2. A grid of option counts | Calibrate at K = 5, 20, 50 or 150 and deploy at each of the four: 16 cells, with the diagonal as the control.
3. Four ways to calibrate | Pooled over K, per K, K-weighted, and on a K-normalised score.
4. Two models | Jev, a hosted decision model, through its released outputs; and SmolLM2-135M and 360M fine-tuned to behave the same way, with an anchored listwise loss and KL anchors to the frozen base. A token-trie readout with a tree attention mask scores every option in one forward pass, and agrees with brute force to 2e-5.
5. Data | CLINC-150 and Banking77, with seeded option sets, the gold option placed uniformly at random, disjoint splits and a duplicate audit.

## where it stands

The guarantee fails in the 5 → 150 direction on both models: realised risk 7.2% on Jev and 7.7% on the fine-tuned model, against a 5% target.

The mechanism, on the fine-tuned model, is that at K ≤ 50 the calibration error is already below α, so LTT certifies a gate that accepts nearly everything, and that gate inherits the base error at K = 150. Per-K calibration, the exact fix, is underpowered at 500 items a bin: selective risk is 3.3 to 4.0% at every threshold, so nothing certifies, and it needs roughly twice the data. The scores are far from K-exchangeable (KS D = 0.22 to 0.57), yet pooling costs nothing here, so the Barber et al. bound (0.33 to 0.41) is loose. Rank-normalising the score makes it exchangeable by construction and still leaks: it holds at K = 150 only at 52% abstention and violates once the threshold grid is extended.

The 135M model matches Jev at every K. A gold-position confound in the published protocol was found and documented.

STATS:
7.2% | realised risk, calibrated at 5 options and deployed at 150 | 7.7% on the fine-tuned model; the target is 5%
4 × 4 | calibration and deployment option counts | K = 5, 20, 50, 150
4 | calibration regimes | pooled, per-K, K-weighted, K-normalised
18 | amendments to the pre-registration | each one dated

## results

Accuracy by option count, the fine-tuned 135M model against Jev:

TABLE:
Options | Fine-tuned 135M | Jev
5 | 0.992 | 0.990
20 | 0.965 | 0.975
50 | 0.940 | 0.957
150 | 0.918 | 0.913

What each way of calibrating did when the gate was deployed at 150 options:

TABLE:
Calibration | What it does | What happened
Pooled over K | one gate from all option counts together | certified at 5 options, 7.7% realised risk at 150
Per K | one gate per option count | underpowered at 500 items a bin: 3.3 to 4.0% selective risk at every threshold, nothing certifies
K-normalised (rank) | the score ranked within its option count, exchangeable by construction | holds only at 52% abstention, and violates once the threshold grid is extended

## what's next

- The 360M replication, in progress.
- A symmetrised score: the confidence averaged over rotations of the option order, by a protocol fixed before any rotation is scored.
- Controls: task shift, out-of-scope items and identifier swaps.

The target is a workshop paper or a reviewed arXiv preprint. The claim stays modest. The contribution is treating K as a shift covariate and the negative results on the fixes, not a new gate.

## built with

BUILT-WITH:
languages and frameworks | Python, NumPy, SciPy, scikit-learn, tokenizers
data | CLINC-150 and Banking77, both public; Jev through its released outputs

PAPERS:
2610.00346 | Amir Rafe and Subasish Das | 2026 | Benchmarking System One decision models against trained classifiers and language models for automated decision gates
2610.19811 | Soundouss Messoudi and Youness Mansar | 2026 | Calibration and Risk-Budgeted Decisions with System One Models | Appendix B.4
2110.01052 | Anastasios N. Angelopoulos, Stephen Bates, Emmanuel J. Candès, Michael I. Jordan and Lihua Lei | 2021 | Learn then Test: Calibrating Predictive Algorithms to Achieve Risk Control
2202.13415 | Rina Foygel Barber, Emmanuel J. Candes, Aaditya Ramdas and Ryan J. Tibshirani | 2022 | Conformal prediction beyond exchangeability
2208.02814 | Anastasios N. Angelopoulos, Stephen Bates, Adam Fisch, Lihua Lei and Tal Schuster | 2022 | Conformal Risk Control
1904.06019 | Ryan J. Tibshirani, Rina Foygel Barber, Emmanuel J. Candes and Aaditya Ramdas | 2019 | Conformal Prediction Under Covariate Shift
2606.29054 | Varun Kotte | 2026 | When Can Conformal Risk Control Certify LLM Outputs? Bounds, Impossibility, and Adaptation for Structured Generation
2312.16160 | Edgar Dobriban and Mengxin Yu | 2023 | SymmPI: Predictive Inference for Data with Group Symmetries
