---
track: 12
side: b
slug: sleep-validation
title: Sleep validation study
when: jul 2026 to present
register: progress
one_line: Does a consumer Fitbit agree with a research-grade actigraph on sleep in cancer survivors? The analysis plan, written before any data is seen.
ready: true
status_label: analysis planned
with: The Lifestyles Lab at Ohio State, with Dr. Roberto Benzo
as_of: 2026-10-13
---

## question

Research-grade sleep measurement (an actigraph scored by trained raters, or a night in a sleep lab) is accurate and expensive. A consumer Fitbit is cheap and already on people's wrists, but its sleep algorithm is proprietary and has not been validated in cancer survivors, whose sleep is often fragmented and includes daytime naps: the hardest case for a device that infers sleep from movement.

Does a Fitbit Charge 6 agree closely enough with a research-grade ActiGraph on total sleep time, wake after sleep onset, sleep efficiency and sleep latency, in cancer survivors who wore both at once, to stand in for it?

There is no sleep-lab recording in the study, so this is a question about agreement between two devices, not about which one is right.

## approach

STEPS:
1. Match the nights | Fitbit sleep periods are matched to the actigraph's in-bed and out-of-bed times by timestamp overlap. The reference is scored by two raters, with a third to adjudicate.
2. Paired differences, nested properly | Nights sit inside people, so the limits of agreement come from a mixed model with a person-level random intercept rather than pooling every night as if it were independent. Proportional bias is checked.
3. Equivalence, not just difference | Two one-sided tests against margins fixed before the data is seen, so "no significant difference" cannot be mistaken for "the same".
4. Epoch by epoch | Sensitivity and specificity for sleep versus wake, minute by minute, and nights with two or more sleep periods analysed on their own.

Tooling is R. The plan also records an exploratory comparison of time in bed against a thigh-worn activity monitor that a subset of participants wore.

## where it stands

The analysis plan is drafted and the lab is reading it. The equivalence margins and the night-matching threshold are the two things still to fix, and they will be fixed before any data is seen. Data access waits on the study's approvals. There are no results.

## what's next

Freeze the margins and the matching rule. The lab analyst builds the pipeline on synthetic nights, so it is tested before it meets real data, then runs it once on the real data.

## my role

Co-leading the analysis plan: study design, methods, the literature and the write-up. The statistics will be run on the lab's own systems by a lab analyst.
