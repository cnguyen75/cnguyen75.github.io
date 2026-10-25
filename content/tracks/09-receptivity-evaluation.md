---
track: 09
side: b
slug: receptivity-evaluation
title: How receptivity models are evaluated
when: jun 2026 to present
register: progress
one_line: The standard accuracy number for "will this person answer a prompt" models mostly measures who tends to answer. Three cohorts, and one pre-registered test of the fix.
ready: true
status_label: manuscript in preparation
with: With Dr. Roberto Benzo (Ohio State) and Dr. Peter Washington (UCSF)
link: pre-registration | https://osf.io/vmgzy
as_of: 2026-10-13
---

## question

Health apps that send prompts (a short survey, a nudge to move) want to send them when the person will actually respond. "Receptivity" models predict that moment from the phone and the wearable. They are scored with one pooled number: ROC-AUC over everyone's prompts at once.

That number mixes two different skills: telling responsive people from unresponsive ones, and telling one person's good moments from their bad ones. Only the second helps decide when to send the next prompt. So the question is: how much of the reported accuracy is the second kind?

## approach

::: figure diagram-wide.svg diagram-narrow.svg
caption: a pooled ROC-AUC scores every pair; nearly all of them are between-person
alt: Diagram: a grid of prompts, with people as rows and prompts as cells, and the same grid with the pairs a pooled ROC-AUC compares drawn between cells. Most pairs link two different people; a few lie inside one person's row. The same content is listed in "The diagram as text" below.
description: Left: a grid of prompts. Each row is a person and each cell is a prompt; filled cells were answered.
description: Right: the same cells, with lines drawn between pairs of cells.
description: Pairs that link two different rows are between-person (dashed lines). Pairs inside one row are within-person (solid arcs).
:::

STEPS:
1. Split the metric | The pooled ROC-AUC is a concordance: the share of pairs, one answered prompt and one unanswered, that the model orders correctly. Those pairs are split into within-person and between-person pairs, following van Klaveren and colleagues (2014). A closed form shows the between-person share is set by how many people there are, not how many prompts.
2. Three cohorts | LifeSnaps (public) is the main cohort. Two further public cohorts replicate the split.
3. Models that cannot cheat | A ladder of logistic models, from one that knows only each person's base rate to one that adds situational, sensor and response-history features, evaluated over 25 subject-wise cross-validation partitions with clustered bootstrap intervals, so no person appears in both training and test.
4. A pre-registered test of the fix | If pooled accuracy is mostly identity, can a few labelled prompts per person recover within-person skill? Five personalisation arms and label budgets from 0 to 80 prompts per person, registered on OSF before the experiment ran, then replicated on the other two cohorts with the minimum detectable difference reported for each.
5. A learned representation | A small recurrent encoder pretrained on minute-level wearable windows, then probed: does its embedding know who you are, what time it is, or whether you will respond?

Every number in the write-up is checked by a script that fails the build if a figure in the prose no longer reproduces from the outputs.

## where it stands

The headline holds across all three cohorts: nearly all of the pairs a pooled ROC-AUC scores compare two different people. A model that knows only each person's base rate can look strong on the pooled number while being exactly chance within person, because a constant per person cannot separate that person's moments.

Within-person discrimination, the part an intervention needs, is much weaker. The size of that gap, the cohort sizes and shares, the personalisation study's result and the representation probes are in the manuscript, which is in preparation with the two PIs.

## what's next

Finish the manuscript. Then a second study on the representation question: whether an encoder trained on the wearable stream carries within-person signal at all, or mostly learns identity.

## built with

BUILT-WITH:
data | LifeSnaps and two further public cohorts; aggregates only
attribution | LifeSnaps, used under CC BY 4.0.

## my role

I designed and ran the analysis, wrote the pre-registration and am writing the manuscript, with Dr. Benzo and Dr. Washington supervising. Data: LifeSnaps (CC BY 4.0) and two further public cohorts; only aggregates appear here.

Results in the manuscript in preparation.
