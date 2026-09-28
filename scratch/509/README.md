# #509 — can a Workers AI model estimate a plate?

Throwaway prototype for [#509](https://github.com/palebluebytes/inventoria/issues/509),
map [#474](https://github.com/palebluebytes/inventoria/issues/474). Method copied from
[#482](https://github.com/palebluebytes/inventoria/issues/482)'s label-read prototype:
raw responses written first, scored in a separate pass, `temperature: 0`, every raw
response committed. Ground truth from
[#515](https://github.com/palebluebytes/inventoria/issues/515)'s census.

**Nothing here ships.** No file under `src/` or `worker/` is touched.

## Running it

```sh
node scratch/509/slice.mjs --take 50     # build the slice from Nutrition5k metadata
node scratch/509/fetch.mjs --sides 25    # pull the images into TMP (nothing committed)
node scratch/509/harness.mjs <run> [flags]
node scratch/509/score.mjs raw-<run>.json
bash  scratch/509/run-remaining.sh       # the arms the neuron ceiling cut short
```

`harness.mjs` reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_API_TOKEN` from the
repo's `.env` and calls the **native** `/ai/run/<model>` endpoint through the
`inventoria-model-route` gateway — the shape `env.AI.run` sends, and therefore the
shape that would ship.

## Ground truth

**Nutrition5k** (Google, CVPR 2021), CC BY 4.0 — items added to the plate one at a
time with a scan after each, a digital scale at ±1 g, multiplied by per-gram values
from the USDA Food and Nutrient Database.

`slice.mjs` applies #515 §6.2's filter (≥3 components, ≥50 kcal, ≤9 kcal/g) inside the
official `depth_test` split and stratifies on calorie band × component count.
It **independently reproduces #515's counts**: 5,006 dishes → 2,609 filtered → 289 in
`depth_test`. The slice is 50 dishes, 5 per band per complexity, seeded so it is
reproducible from `--seed` alone.

The published bars, so nothing here has to invent a success criterion: Nutrition5k
direct-2D prediction **70.6 kcal MAE / 26.1 %** of mean, best reported method 41.3 /
16.5 %, human nutritionists ~41 % error on portion estimation.

### Two corrections to #515's recommended slice

**1. The side-angle frame is not usable as the primary view.** #515 §6.4 recommended it
over the overhead frame, from one dish (`dish_1556572657`). It does not generalise. On
`dish_1565123816` all four cameras cut the plate off at frame 1, the food sits half out
of shot, and `camera_C` has passers-by walking through the background; sampling frames
1/12/24/33 shows the sweep barely moves, so a later frame does not rescue it. Across 25
dishes, `camera_A` frame 1 shows the food well on roughly 8 in 10 and clips it badly on
the rest, and two dishes have no side angle at all (HTTP 404). **The overhead
`realsense_overhead/*/rgb.png` is clean on 50 of 50** and is what the scoring arm uses.
The cost is that it is 640×480 and top-down.

**2. The QR fiducial markers are not on every dish, and none of them are on this
slice.** #515 §6.4 warned that the frames must be cropped before committing because the
markers are a known-size scale cue. Looking at all 50 overheads: **zero** carry the
printed marker sheet. It belongs to an earlier capture campaign — `dish_1556572657`
(29 Apr 2019) has it, and so do the two 0-kcal control dishes; the slice's dishes are
May–Aug 2019 and have none. **So no crop is applied**, which matters, because a crop
tight enough to remove the rig furniture also clips food off the edge of the plate on
dishes where the plate is not centred.

### A third property #515 did not see: the slice contains near-duplicates

The incremental scanning procedure files every "add one item, scan again" step as its
own `dish_id`, so dishes minutes apart are **the same plate at successive build
stages**. 17 of the 50 sit in one of 7 such clusters. They are kept, because they turn
out to be the sharpest instrument here (§4): three near-identical photographs whose true
calories differ by a known amount test whether the estimate moves when the food does.

## The arms

| run                                  | prompt             | what it tests                                                                 |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| `main-itemised`                      | itemised           | the headline score, 50 dishes                                                 |
| `main-bare`                          | bare               | the shipped `PlateEstimate` shape — **cut short at 13 by the neuron ceiling** |
| `ablate-controls-guard` / `-noguard` | itemised / noguard | #509 §3 — does the guard sentence buy a `null`?                               |
| `ablate-plates-noguard`              | noguard            | does the guard cost accuracy on real plates?                                  |
| `variance`                           | itemised           | run-to-run spread at `temperature: 0`                                         |
| `frame-side` / `frame-both`          | itemised           | #509 §4 and #515 §6.4 — which frame, and does a second help?                  |
| `mistral-itemised`                   | itemised           | second model, so "which model" is measured not inherited                      |

The three prompts differ in exactly one thing each. `noguard` is built by string
replacement from `itemised`, so the ablation is byte-identical apart from the sentence
under test — #482's method.

The guard sentence under test:

> If the photograph does not show food on a plate, or the food is too obscured to
> judge, set `"calories"` to null and `"items"` to `[]`. A null is a correct answer.
> Never guess a number for a picture you cannot read.

## Results

### 1. The headline: 173 kcal MAE, 38.9 % of mean

`main-itemised`, 50 dishes, `@cf/meta/llama-4-scout-17b-16e-instruct`, one image each.

|             |                                                     |
| ----------- | --------------------------------------------------- |
| MAE         | **173.3 kcal** (published 2D baseline 70.6)         |
| MAE / mean  | **38.9 %** (published 26.1 %; a nutritionist ~41 %) |
| MAPE        | 73.7 %, median 34.2 %                               |
| bias        | **+77.6 kcal**, 36 of 49 over                       |
| within 25 % | 20 / 49                                             |
| within 50 % | 28 / 49                                             |
| malformed   | 1 / 50                                              |

The mean sits near a human's error rate. **The distribution is what disqualifies it**,
and it fails hardest exactly where a food log lives:

| band         | n   | MAE | MAPE      | bias |
| ------------ | --- | --- | --------- | ---- |
| 50–150 kcal  | 10  | 152 | **188 %** | +129 |
| 150–300 kcal | 10  | 224 | **97 %**  | +224 |
| 300–500 kcal | 10  | 104 | 27 %      | +78  |
| 500–800 kcal | 10  | 125 | 22 %      | +35  |
| 800+ kcal    | 9   | 272 | 30 %      | −94  |

Nutrition5k's own median dish is 142 kcal and its mean is 213 — the two bands where this
model is 97–188 % wrong are the corpus's centre of mass, and a side salad is a thing
people log.

### 2. The error is half portion and half richness

Decomposed against the weighed mass, using the itemised arm's own `grams`:

- mass: median **1.16×** truth (mean 1.30×)
- energy density: median **1.21×** truth (1.64 vs 1.37 kcal/g)
- **if the mass were exact, the calories would still be 1.21× over**

So a scale reference — the one cue the rig gives and a phone does not — is at most half
the fix. The model also believes the food is richer than it is, naming calorie-dense
things that are not on the plate: croutons and salad dressing on a plate of brown rice
and greens, 150 kcal of them.

### 3. The parts do not sum, and there are too few of them

The itemised prompt asks, in terms, that `calories` equal the sum of the items' `kcal`.

- **29 of 49** obey it.
- **4.0 items named per plate** against a truth mean of **9.0**.
- **125 of 198** named foods are actually on the plate — so ~37 % of what it names is
  invented.
- **128 of 441** real ingredients get named — it sees under a third of what is there.

The one malformed response is the same defect in its acute form: on
`dish_1566328776` the model emitted **three successive JSON objects** with three
different totals (1047.8, then 1047.8 re-itemised, then 1007) and prose between them —
_"However, since some of the ingredients are included in the pizza, a better estimate
would be…"_. It had itemised the pizza's toppings separately from the pizza and then
tried to correct its own double-counting out loud. Under #483 §4 that is a clean `422`,
_couldn't read the label_; worth recording that the itemised shape is what invited it.

### 4. The number does not move when the food does

The seven near-duplicate clusters (§Ground truth) are successive build stages of one
plate, so the truth moves by a known amount between photographs that look nearly alike:

| truth           | predicted                       | truth moved | prediction moved |
| --------------- | ------------------------------- | ----------- | ---------------- |
| 496 → 521 → 550 | 534.2 → 534.2 → 540.9           | +53         | **+6**           |
| 67 → 183        | 540 → 542.2                     | +116        | **+2**           |
| 50 → 100        | 170 → 170                       | +50         | **0**            |
| 902 → 928 → 942 | _(malformed)_ → 1241.9 → 1241.9 | +39         | **0**            |
| 247 → 472       | 322.8 → 522.2                   | +224        | +199             |
| 205 → 510       | 350 → 720                       | +304        | +370             |
| 460 → 490 → 716 | 540 → 540 → 720                 | +256        | +180             |

**Large additions are tracked; anything under about ±200 kcal is invisible.** The 67 →
183 kcal row is the worst of it: the plate's true energy nearly tripled and the estimate
moved by 2 kcal, from 540 to 542 — 8× and 3× over respectively. And the repeated
identical predictions (534.2, 170, 1241.9) show the estimate is stable — stable at a
coarse prior about what a plate like this weighs, rather than at a reading of the food.

This is the finding that bears hardest on #509 §2's _"is the estimate confirmable?"_. A
person who adds a slice of toast to their plate, re-photographs it and sees the same
number learns nothing about whether the estimate is tracking their food.

## The neuron ceiling, and two corrections to #480/#483

The run hit the free-allocation wall after 2,449 neurons on the day, and what came back
corrects two things the map had settled on paper.

**1. The exhaustion code is `4006`, and it is documented nowhere.** The response:

```json
{"errors":[{"message":"AiError: AiError: you have used up your daily free allocation of
10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to
continue usage. (93acb188-…)","code":4006}],"success":false}
```

Cloudflare's own errors table carries that **exact message** under a different code:

> `| Account limited | 3036 | 429 | You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. |`

`4006` appears **0 times** in `workers-ai/llms-full.txt` (11,358 lines), as `2003`
already did (#490). #483 §4 chose to have the Worker _"classify into the closed set by
whatever mechanism works"_ and to name the set rather than the mechanism; that choice is
now load-bearing rather than cautious, because **a Worker matching the documented `3036`
would classify exhaustion as `503` couldn't-reach-it** and tell the user to try again in
a moment, all day. The message text is the stable discriminant here, not the code —
matching `daily free allocation` works where matching `3036` does not.

Measured on the REST path (`api.cloudflare.com/.../ai/run/…`), which returns a JSON
envelope. Whether `env.AI.run()`'s thrown `Error` carries `4006` or `3036` is **not**
tested here, and #483 §4 already handed that probe to #484.

**2. The allocation is not a UTC day.** #480 specified the _not today_ copy as
_"resetting 00:00 UTC"_. Account analytics (`aiInferenceAdaptiveGroups`):

| UTC day                 | neurons                           |
| ----------------------- | --------------------------------- |
| 2026-09-17 (#482's run) | 8,938                             |
| 2026-09-18 (this run)   | **2,449** — refused at this point |

2,449 spent since 00:00 UTC was refused as _"used up your daily free allocation of
10,000"_, with 8,938 spent the previous UTC day. Whatever the mechanism — a rolling
24-hour window fits (11,387 in the 24 h to the refusal), a non-midnight reset hour would
too — **"resets at 00:00 UTC" is falsified**, and #480's copy should not promise a time.

Also worth carrying: `usage.neurons` per call **agreed** with the account's own
analytics (2,421 reported vs 2,449 billed), so the per-call figure is trustworthy for
budgeting. The discrepancy was the window, not the meter.

At 640×480 a plate read costs **34–39 neurons**, against #482's 76–133 for a 1600 px
label. That is a property of the corpus, not of the task: the app would send a 1600 px
photograph and should be budgeted at #482's figure.

## Attribution

Nutrition5k, Thames et al., CVPR 2021, released under CC BY 4.0 —
<https://github.com/google-research-datasets/Nutrition5k>. Images are fetched into TMP at
run time and **not committed**; `slice.json` carries only dish ids and the weighed
figures.

## The adjudication: is the ticket answerable on these arms? (`adjudicate.mjs`)

Added after the run, when the question became _must the remaining arms be run before
#509 can be answered?_ `node scratch/509/adjudicate.mjs` — a third pass, downstream of
`score.mjs`, spending no neurons — puts the arms against each other. **Yes, it is
answerable, and the verdict is don't build.** Four things it establishes that no single
arm's MAE does.

### 1. The headline arm is the shape the app cannot ship

`bare` is exactly the shipped `PlateEstimate` — `{ name, calories, ingredients[] }`.
`itemised` adds `items[]` with grams and kcal, which `plate-estimator.ts:29` forbids by
name. So the 173.3 kcal / 38.9 % headline was measured on a variant, and the shipped
shape is the arm the ceiling cut short at 13.

On the 13 dishes both reached, `bare` looks better — **130.3 vs 166.4 MAE**. It is not
better. **Paired, `itemised` wins 7 of 13 and the median |error| reduction is exactly
0.0 kcal**; the whole 36.1 kcal mean gap is one dish (`dish_1566328831`, +208.7 kcal,
where itemised double-counted a pizza's toppings). `bare`'s lower MAE is the same
reading with the itemisation blow-ups removed, not a better reading of the food.

### 2. The coarse prior is in **both** shapes, so §2 is answered

| arm                | distinct                    | sd (truth 269–287) | multiples of 50 | Spearman |
| ------------------ | --------------------------- | ------------------ | --------------- | -------- |
| `itemised`, all 49 | 28/49 — **540 seven times** | 267                | 2/49            | 0.74     |
| `itemised`, the 13 | 13/13                       | 292                | 1/13            | 0.74     |
| `bare`, the 13     | **7/13 — 550 five times**   | **198**            | **9/13**        | 0.79     |

Rank correlation is the same in both; the spread is **compressed**; and the shipped
shape is the **coarser** of the two — five of its thirteen answers are 550, against
truths of 472, 494, 510 and 550. So _the estimate is a prior about what a plate like
this weighs, not a reading of the food_ is not an artefact of itemising, and #509 §2
gets its answer without the remaining arms.

Spearman here is on **midranks**: `bare`'s five tied 550s made a naive rank correlation
depend on the tie order (0.73 sorting by id, 0.86 sorting by truth). Tied values share
the average of their positions, which is order-free.

### 3. The cluster instrument, split at the step size

| arm        | steps < 200 kcal                                        | steps ≥ 200 kcal          |
| ---------- | ------------------------------------------------------- | ------------------------- |
| `itemised` | n=6, 265 kcal of real change → **9 kcal tracked (3 %)** | n=3, 756 → 749 (**99 %**) |
| `bare`     | none reached                                            | n=1, 305 → 200 (66 %)     |

Sharper than §4 above stated it: large additions are tracked almost **exactly**, small
ones are **invisible** — four of the six moved the estimate by 0.0. But `bare` reached
one large step and no small one, so this instrument is itemised-only. That is why §2's
prior had to be measured instead, and it is what makes the verdict arm-independent.

### 4. Arm B is refuted at its ceiling, for zero neurons

The 2026-09-18 comment on #509 proposed arm B: the model names items and grams, **the
app** computes kcal from the cooked USDA rows. Its best conceivable lookup is the dish's
_own_ true energy density, so scoring `model grams × true kcal/g` is an upper bound no
real table can reach:

|                                    | MAE       | MAE/mean   | MAPE median | within 25 % |
| ---------------------------------- | --------- | ---------- | ----------- | ----------- |
| A — the model's own total          | 173.3     | 38.9 %     | 34.2 %      | 20/49       |
| **B\* — perfect lookup (ceiling)** | **147.8** | **33.2 %** | **36.2 %**  | **19/49**   |
| published direct-2D bar            | 70.6      | 26.1 %     | —           | —           |

A perfect table buys **~25 kcal of MAE**, still misses the published bar by 7 points,
and makes the **median and the hit rate worse**. The comment's own stated objection is
what dominates: the model still originates the grams, and **|1 − mass ratio| is 36 % at
the median, with only 19 of 49 dishes within 25 % on mass**. #247 measured the real
lookup — the shipped search on the model's own clean English term — at **6 of 22
top-1**, so the true arm can only sit below this ceiling. Arm B does not need running.

### What is therefore still un-run, and why it no longer blocks

`main-bare`'s other 37 dishes, the guard ablation (all twelve calls `429`), the
noguard/variance/frame/mistral arms. §3 (the guard sentence) and §4 (N images) are
**conditional on building**, so a don't-build verdict moots them — but they are owed
again, not answered, if a build is ever reopened. On §4 specifically, the decomposition
bounds what a second angle could buy: it addresses **mass**, and §4 above shows that
fixing the _other_ half perfectly still leaves 33.2 %.
