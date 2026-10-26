---
track: 19
side: c
slug: drug-target-network
title: Drug–target interaction network
when: aug 2025, rebuilt 2026
register: album
ready: true
status_label: rebuilt 2026
one_line: A model that suggests which proteins a drug might act on, shows its evidence, and was rebuilt after its first version turned out to be grading itself too kindly.
---

## intro

**The first version of this project reported a score of 0.93. It could not be reproduced, and the reason is the most useful thing in it.**

Known drug–target interactions form a large, sparse network, and most plausible pairs have never been tested. This project asks whether that network, together with what is known about each drug's chemistry, can rank untested pairs well enough to be a useful shortlist, including for a drug with no known targets at all.

## how it works

STEPS:
1. Build the network | 7,393 drugs, 2,981 human targets and 18,038 known interactions from DrugBank.
2. Describe each pair | Where the drug and target sit in the network, plus how the drug's structure and class compare with drugs already known to bind that target.
3. Rank and explain | A random forest scores untested pairs. The dashboard shows the evidence behind each suggestion, or says there is none.

The network is embedded with Node2Vec, which turns each drug and target into a vector based on its neighbours. That alone gives twelve features per pair. The rebuilt model adds eight more that compare the drug with a target's known binders: structural similarity, binders of related proteins in the same family, shared therapeutic categories and shared chemical class. Those eight still work when the drug has no interactions of its own, which the network features cannot do.

The model is trained against deliberately hard negative examples: for each real interaction, a pair with the same drug and a target of similar popularity. Without that, a model can score well just by guessing popular targets.

## the sample

DEMO: drug-target-network/demo.json
BEHAVIOUR: a row of drug chips with Imatinib first and Fluconazole marked "no known targets". For the selected drug: a centre circle for the drug, its known targets as solid orange squares, and up to five dashed purple squares for predicted targets, each labelled with gene symbol and score (prefixed "=" when tied). Under the figure, the five suggestions as a list: gene symbol, score, how many known drugs the target already has, and the evidence line. Always show the file's score_note near the scores. At phone width, drop the figure and show the list only.
DEMO-CAPTION: Twenty-four drugs. Scores rank candidates; they are not the chance that an interaction is real.
ATTRIBUTION: Interaction data from DrugBank 5.1, used under CC BY-NC 4.0 for non-commercial purposes.

Fluconazole is the interesting one. DrugBank records no human targets for it; its one known target is a yeast enzyme. Given only its structure and class, the model's top suggestion is CYP51A1, the human counterpart of that yeast enzyme, and three of the next four are other enzymes in the same family. The evidence behind those suggestions is weak, so read it as a hypothesis the model reached from structure alone, not as a finding.

## results

STATS:
0.85 | ranking real targets for unseen drugs | ROC-AUC on 1,478 held-out drugs
0.69 | best simple baseline on the same test | structural nearest neighbour
0.76 | fairer figure for a new compound | without curated categories

FIGURE: drug-target-network/figures/evaluation.svg
CAPTION: fig. 1 · the rebuilt model, the earlier network-only model and simple baselines on three tests, with 95% intervals.

TABLE:
Method | Unseen drugs | Per-drug split | Random split
Rebuilt model (network and attributes) | 0.85 | 0.91 | 0.87
Network-only model | 0.55 | 0.89 | 0.75
Structural nearest neighbour | 0.69 | 0.66 | 0.78
Length-3 paths in the network | 0.50 | 0.82 | 0.72
Chance | 0.50 | 0.50 | 0.50

The test that matters is the first column: every interaction of 1,478 drugs is removed before training, and the model has to rank each drug's real targets above untested ones. The network-only model is close to guessing there, because it knows a drug only through its links.

The headline needs two cautions. On the smaller validation set the same score is 0.79. And DrugBank's curated categories are assigned partly because a drug's targets are already known, so removing them gives about 0.76, which is the fairer expectation for a compound nobody has studied. Near-duplicates do not explain the result: 40 test drugs have a structural twin in training, and the score without them is 0.86.

## outtakes

**What the first version got wrong.** The original reported 0.93 and the app displayed a perfect 1.0000 that was typed in as text. Underneath: held-out interactions were visible during training, the negative examples were drugs with no targets at all and so trivially easy, the baselines were padded with random noise, the split was labelled as ordered by time when it was random, and a species filter matched nothing. Fixing those took the honest network-only score to 0.75 on a random split, against 0.72 for the simplest comparable baseline, which counts short paths through the network. A baseline that ignores the network and uses chemical structure alone scores 0.78 there, which is why the rebuilt model uses both.

**The rebuild leaked too.** Part-way through, the per-drug result was reported as 0.91. The hard negatives had been matched on a target's popularity in the full network, while the model saw only the training network, so a target whose only interaction was held out looked isolated and the model learned that isolation meant "real". The corrected figure was 0.89. A second version of the same mistake produced nonsense suggestions for drugs with no known targets until it was found.

**Weak evidence for new drugs.** For drugs with no known targets, 52.5% of top suggestions have no supporting evidence above the cut-offs. The app says so in plain words: "No supporting evidence above threshold; ranked on model score alone."

**Limits.** A held-out drug is unseen by the network, not by DrugBank: it keeps its structure and class. The data has no dates, so nothing here tests prediction forward in time. Untested pairs are treated as negatives, and some of them are real. Scores come in a handful of levels and tie often.

**Next.** Train on an older DrugBank release and test on interactions added in a newer one, which is the closest available thing to predicting the future.

## built with

BUILT-WITH:
code | Code and README | https://github.com/cnguyen75/Drug-Target-Interaction-Network
languages and frameworks | Python, Dash and Plotly, NetworkX, node2vec and gensim, scikit-learn, RDKit, pandas, NumPy
data | DrugBank 5.1
attribution | Interaction data from DrugBank 5.1, used under CC BY-NC 4.0 for non-commercial purposes.
made with | the October 2026 rebuild, with an AI coding agent working to my brief
