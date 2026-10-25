---
track: 13
side: b
slug: health-api-extractor
title: Google Health API data extractor
when: aug 2026
register: progress
one_line: Moving a lab's participant-data tool to a new API without silently changing the data: a parity harness that was itself fault-tested.
ready: true
status_label: private lab repository
with: The Lifestyles Lab at Ohio State
as_of: 2026-10-13
---

## question

The lab enrols study participants' Fitbit accounts and downloads their wearable data (steps, heart rate, sleep and more) as files for analysis. The tool that did this ran on the Fitbit Web API, which Google is retiring in favour of its Health API and Google sign-in. Every integration had to move, and every participant had to consent again.

A migration like this can fail quietly: the new pull returns data that looks right and is not. The question was how to prove the two pipelines agree before anyone analyses a file from the new one.

## approach

::: figure diagram-wide.svg diagram-narrow.svg
caption: the parity check, live and offline
alt: Flow diagram: the legacy pull and the new pull both feed a parity harness; fault injection on synthetic fixtures feeds the harness from the side, and an offline mode comparing two saved exports feeds the same harness. The same steps are listed in "The diagram as text" below.
description: Two pipelines at the top: the legacy pull (Fitbit Web API) and the new pull (Google Health API).
description: Both feed the parity harness, which joins rows, compares them minute by minute and gives a verdict.
description: A side input (dashed outline) feeds the harness: fault injection on synthetic fixtures, with dropped rows, empty sleep and double-counted steps.
description: A second mode below, offline, compares two saved exports with no tokens and no network, and feeds the same harness.
:::

STEPS:
1. Rewrite sign-in and the pull | Google OAuth 2.0 in place of Fitbit's, and a new data-pull layer for six data types, with timestamps read in the participant's local time and sub-minute samples aligned to minutes.
2. Prove parity | A harness pulls the same person through both pipelines and compares the rows. It was itself tested by injecting faults into synthetic fixtures, and it has an offline mode that compares two saved exports with no credentials involved.
3. Close the security gaps | Participant tokens encrypted at rest, CSRF protection, OAuth state checked, the fallback secret key removed, logs that redact, and a test suite that never touches Google or real data.
4. Hand it over | A service unit, an environment template and operations notes, plus a plain-language change list for the PI.

## where it stands

Pilot handoff, August 2026. Live checks of a few payload shapes are still pending, and the production pieces (staff authentication, a database, hosting, backups) are the lab's to build. The repository belongs to the lab and is private.

## results

Shareable because none of it is a participant's data: the real-account comparison used a lab member's own account, and only match counts appear here, never values.

- The harness caught its own blind spot first: injecting dropped rows showed the verdict ignored them. That was fixed, so missing rows now fail the check.
- Two silent defects meant the new pull returned an empty sleep file on every export. The harness found both.
- Steps were over-counted because the new API returns overlapping sources and the pull summed them. Restricted to one source, eight days of minute-level steps matched the legacy pull exactly. The offline mode reproduces the original defect on the export it was given: nearly every minute mismatched.
- Sign-in and all six data endpoints confirmed live, with pagination and filters.

## what's next

Cutover to the new API and production hosting, in the lab's hands.

## built with

BUILT-WITH:
languages and frameworks | Python, Flask, google-auth, pandas, requests

## my role

The migration, the validation harness and the security hardening. The application itself was written by others in the lab before and alongside this work.
