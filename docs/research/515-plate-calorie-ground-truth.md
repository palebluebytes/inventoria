# Research: plate photographs whose true calories are known (#515)

**Grounds:** each dataset's own paper, its own licence file or record, and its own host,
read directly. Where a figure could be measured rather than quoted, it was: the
Nutrition5k numbers in §6 come from its two metadata CSVs and its four split files pulled
from the project's Cloud Storage bucket and counted here, not from the paper, and the two
images in §3 were pulled from the same bucket and looked at. Listicles and survey papers
were used only as pointers to the primary source, never as a citation.
**Siblings:** [#515](https://github.com/palebluebytes/inventoria/issues/515) blocks
[#509](https://github.com/palebluebytes/inventoria/issues/509), which names ground truth as
its hard part. Parent map [#474](https://github.com/palebluebytes/inventoria/issues/474).
[#483](https://github.com/palebluebytes/inventoria/issues/483) settled the request contract
and put the prompt on the Worker; [#482](https://github.com/palebluebytes/inventoria/issues/482)
measured the neuron cost of one image read.
[`49-multimodal-llm-nutrition-extraction.md`](49-multimodal-llm-nutrition-extraction.md) is
the label-photo predecessor to this note.
**Date:** 2026-09-17. **Status:** census and one recommendation. Nothing built, nothing
downloaded into the repo.

---

## 1. The verdict, first

**The fallback #509 names — cook and weigh your own plates — is not needed.** Two public
corpora carry per-dish calories derived from a scale, are downloadable today without a
request form, and are licensed permissively enough to both commit samples from and send to
Cloudflare. A third is CC0. The cooking day buys nothing they do not already have.

What the census does change is _which_ question a score answers. Of the eleven candidates
below, **the ground truth and the photograph pull in opposite directions**: the corpora
whose figures came off a scale were shot on rigs or with a fiducial marker in frame, and the
corpora shot the way a person actually shoots are the ones whose figures are somebody's
estimate. Nothing in the field is simultaneously weighed, casually photographed, and
permissively licensed with no marker in the picture.

So the recommendation (§6) is **two arms, not one**:

| arm          | corpus                 | what it scores                                   |
| ------------ | ---------------------- | ------------------------------------------------ |
| **scoring**  | Nutrition5k, CC BY 4.0 | can the model turn a plate into a calorie number |
| **transfer** | ACETADA, CC BY-NC 4.0  | does that survive a real phone in a real kitchen |

Run the scoring arm first. If it fails, the transfer arm is moot.

Three further findings worth carrying out of this ticket:

- **The distractor class is not hypothetical, and it is growing.** DiningBench (ACL 2026,
  3,021 dishes) fills the gap in its nutrition labels with **Gemini-3-Pro-Preview** run on
  the dish photo (§2.3). Scoring against it would literally be comparing two guesses. It is
  also the largest and best-packaged food-nutrition benchmark released in the last year, so
  it is the one a shallow search finds first.
- **The biggest weighed corpus has dirty rows.** Four Nutrition5k dishes claim an energy
  density above 9 kcal/g, which is above pure fat and therefore impossible, and 240 claim
  zero calories (§6.2). A slice that does not filter them scores the model against
  arithmetic errors.
- **Few-shot image exemplars may not be expressible on the model Workers AI documents.**
  `@cf/meta/llama-3.2-11b-vision-instruct` takes a single top-level `image` field, not image
  parts inside `messages` (§5). And each exemplar image costs what the query image costs, so
  a 3-shot prompt cuts the free day from ~100 reads to ~25.

## 2. The census, classified by how the ground truth was made

The ticket's classification — **weighed**, **computed**, **annotated** — is the axis
everything else hangs off, so it comes first. Only the first two can score #509.

### 2.1 Weighed — a scale touched the food

| corpus                                                                                               | what was weighed, and how the weight became calories                                                                                                                                                                                                                | size                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Nutrition5k** (Google, CVPR 2021)                                                                  | Items added to the plate one at a time, each followed by a scan; a digital scale at ±1 g precision gives the incremental mass, multiplied by per-gram values from the **USDA Food and Nutrient Database**.                                                          | 5,006 dishes, 219 distinct ingredients, 5.68 ingredients/dish |
| **ACETADA** (Purdue/Curtin, IEEE BHI 2025)                                                           | A controlled-feeding crossover trial: laboratory-prepared meals **unobtrusively weighed to 0.1 g**, consumed mass = served minus leftovers. Accredited practising dietitians then enumerated the visible items and attached **AUSNUT 2011–13** composition to them. | 806 before-meal images, 152 adults, 3 feeding days each       |
| **DFoodTJ-F-Nutr** ("Chinese Food Images for Full-cycle Nutrition Analysis", _Scientific Data_ 2026) | Hospitalised diabetic patients weighed each meal before eating; the hospital nutrition department recorded intake. Energy from Aqua-Calc densities and the Mint Health tables, which reference the **2019 Chinese food composition tables**.                        | 3,280 nutrition images, 91 patients, 101 food types, 26.2 GB  |
| **MetaFood3D** (Purdue, 2024)                                                                        | Each object weighed and linked to a **FNDDS** food code, giving energy/protein/carb/fat.                                                                                                                                                                            | 637 objects (743 in the arXiv abstract), 108–131 categories   |
| **SimpleFood45** (Purdue, CVPRW 2024)                                                                | Ground-truth volume (mL), weight (g) and energy (kcal) per item.                                                                                                                                                                                                    | 513 images, 45 food items, 12 food types, 1.12 GB             |
| **ECUSTFD** (ECUST, 2017)                                                                            | Mass from an electronic scale, volume by water displacement. **Calories are not distributed**: the dataset ships density and the user computes energy from a nutrition table.                                                                                       | 2,978 images, 19 single-food types                            |
| **MADiMa 2017** (Bern ARTORG)                                                                        | 80 central-European meals of known weight and volume; calories and macronutrients calculated from the recorded weight against **USDA** composition.                                                                                                                 | 80 meals, 234 food items, 6 RGB-D pairs each                  |
| **FLIC** (Parma / Milano-Bicocca, _Applied Sciences_, May 2026)                                      | 401 paired full/leftover canteen trays with **physically measured food mass** and pixel-precise masks.                                                                                                                                                              | 401 paired acquisitions over 22 canteen days                  |

### 2.2 Computed — a known recipe at a known serving

No candidate in this census is purely recipe-computed _and_ has photographs of the specific
portion. The class that usually fills this row — Recipe1M+, pic2kcal and their kin — pairs a
recipe with a web photo that is not necessarily of that recipe at that serving, so the
figure does not describe the pictured plate. JFB's own comparison table records the same
thing about Recipe1M+: **macronutrients "Not Provided"**.

The nearest thing to a computed row is **PFID** (Pittsburgh Fast-Food Image Dataset, 2009),
101 items from 11 fast-food chains whose declared nutrition is the figure. Its host,
`pfid.intel-research.net`, no longer resolves (DNS failure, checked 2026-09-17). Treat it as
gone.

### 2.3 Annotated — somebody looked at the photograph and said a number

These cannot score #509. They are listed because two of them are the easiest datasets in the
field to find, and one of them is brand new.

| corpus                                    | how the number was produced                                                                                                                                                                                                   | size                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **DiningBench** (Meituan, ACL 2026)       | Merchant-declared values where they exist; otherwise **Gemini-3-Pro-Preview** is given the food image, ingredient list and portion sizes and asked to generate the nutrition, cross-referenced against USDA FoodData Central. | 3,021 dishes / 15,928 images; nutrition subset 1,650 dishes / 8,856 images |
| **JFB** (January AI, 2025)                | Photos from a health app's users, first labelled by GPT-4o, then "a human annotator … validated and corrected all annotations (meal name, ingredients, quantities, and macronutrients)". Portions were never weighed.         | 1,000 images                                                               |
| **SNAPMe** (USDA ARS, 2023)               | Participants' own **ASA24 24-hour food records**, entered by the eater. The paper is explicit: "we did not provide participants with weighed, packed-out food in coolers. It would have been impractical".                    | 3,311 photos / 275 food records / 95 participants                          |
| **Menu-Match** (Microsoft Research, 2015) | "Calories were estimated for each of the images by dietitians."                                                                                                                                                               | 646 images / 1,386 items / 41 categories                                   |

SNAPMe deserves one more line, because its Ag Data Commons record carries a **use
limitation** in the publisher's own words: _"This data set should not be used to train
models as it is a small curated data set. Models trained with this small set of images would
not be generalizable."_ It is a benchmark for ranking dietary-assessment pipelines against
self-report, not a calorie oracle.

## 3. Whether the photographs transfer

The ticket asks what the capture setup was, because a rig answers a different question than
a phone. Rather than quote the papers, two Nutrition5k frames were pulled from the bucket
and looked at.

**The overhead image** (`imagery/realsense_overhead/dish_1556572657/rgb.png`, 412 KB) is
**640×480**. The plate sits on a sheet printed with four QR-style fiducial markers, on a
platform inside a black extruded-aluminium frame, with cabling and plywood in shot.

**The side-angle frame** (first frame of `imagery/side_angles/dish_1556572657/camera_C.h264`)
is **1920×1080** and shows the plate filling almost the whole frame from roughly 35 cm away,
with two of the fiducial markers still visible and nothing else of the room in view.

Neither is a photograph a person takes at a table. The markers matter more than the framing:
they are a known-size scale reference in the picture, which is exactly the cue a plate
estimator is otherwise missing, and a model that learns to use them scores something the app
will never have. The paper's own geometry says the same thing — camera-to-capture-plane
distance **35.9 cm**, four Raspberry Pi cameras 90° apart sweeping at ~30° and ~60° down from
horizon, one Intel RealSense D435 overhead, 1920×1080 at ~8 s per sweep.

Across the census:

| corpus                  | capture                                                                                                         | phone at a table? |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Nutrition5k**         | Fixed rig, 4 Raspberry Pi cameras + RealSense D435, 35.9 cm, QR fiducials in frame, cafeteria trays             | no                |
| **ACETADA**             | mFR24 smartphone app, free-living, before/after each meal, **fiducial marker in frame**, EXIF timestamp and GPS | nearly            |
| **DFoodTJ-F-Nutr**      | Smartphone, 30–40 cm above the dish, one overhead and one 45° oblique, no marker, hospital trays, no overlap    | nearly            |
| **NutritionVerse-Real** | iPhone 13 Pro Max, ten images per scene from random camera angles                                               | yes               |
| **SNAPMe**              | Participants' own phones via Bitesnap, ~18 inches at 45°, checkerboard sizing marker, cropped to 800×800        | yes               |
| **JFB**                 | Real-world user phone photos, varied lighting and clutter, no marker                                            | yes               |
| **MetaFood3D**          | RGB-D video scans of single objects with fiducial marker images                                                 | no                |
| **SimpleFood45**        | Samsung Galaxy S22 Ultra, ≥10 poses per item, single foods                                                      | partly            |
| **ECUSTFD**             | iPhone 4s / iPhone 7, top view and side view, One Yuan coin as the scale reference, ≤2 foods per image          | partly            |
| **MADiMa 2017**         | Lab setup, RGB-D at 40 cm and 60 cm, 90° and 60° viewing angles, 1920×1080                                      | no                |
| **DiningBench**         | Merchant reference shots plus user photos from varying perspectives                                             | mixed             |

**The honest summary: the weighed half of the field is the rigged half.** ACETADA and
DFoodTJ-F-Nutr are the only corpora that are both weighed and shot on a phone, and ACETADA
still puts a fiducial marker in every frame. **NutritionVerse-Real** is the only corpus that
is both weighed _and_ photographed with no marker and no rig — 889 images of 251 dishes, an
iPhone 13 Pro Max at random angles, every ingredient weighed on a food scale against the
Canada Nutrient File — and it is licensed CC BY-NC-**SA** (§4), which is the most awkward of
the licences here.

## 4. Licence, twice over

Two different questions, and they separate. **(a) commit** means checking sample images into
this public repository the way [#476](https://github.com/palebluebytes/inventoria/issues/476)
checked in label samples under `docs/assets/`. **(b) inference** means sending an image to
Cloudflare Workers AI from a prototype.

Cloudflare's own terms settle half of (b) for every candidate: Workers AI states that
Cloudflare _"does not use your Customer Content to (1) train any AI models made available on
Workers AI or (2) improve any Cloudflare or third-party services"_, that it _"does not make
your Customer Content available to any other Cloudflare customer"_, and that content is
stored only if you pair it with a storage product. So sending an image for inference is
private processing, not publication or redistribution. What is left is whether the licence
permits the **use**, and for a non-commercial licence that turns on whether the prototype is
commercial. This repo's plate estimator is an unreleased personal prototype, so an NC licence
does not on its face forbid the inference; it does forbid ever shipping the same images inside
a commercial product.

| corpus                  | licence                                                                                        | (a) commit samples?                                                            | (b) send to Workers AI?             |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| **Nutrition5k**         | **CC BY 4.0**                                                                                  | **yes**, with attribution                                                      | **yes**                             |
| **DFoodTJ-F-Nutr**      | **CC0 1.0**                                                                                    | **yes**, no condition at all                                                   | **yes**                             |
| **JFB**                 | **CC BY 4.0**                                                                                  | yes — but it is an annotated corpus, so it cannot score anything               | yes                                 |
| **SNAPMe**              | **CC BY-SA 4.0** (Ag Data Commons record)                                                      | yes, with attribution; share-alike attaches to adaptations                     | yes                                 |
| **ACETADA**             | **CC BY-NC 4.0**                                                                               | **no** — treat NC as barring publication from a repo that may become a product | yes, for non-commercial evaluation  |
| **MetaFood3D**          | **CC BY-NC 4.0**, plus a request form                                                          | no                                                                             | yes once access is granted          |
| **NutritionVerse-Real** | **CC BY-NC-SA 4.0** (Kaggle record)                                                            | no                                                                             | yes, for non-commercial evaluation  |
| **DiningBench**         | **CC BY-NC-ND 4.0**                                                                            | no (ND also forbids derivatives)                                               | yes, but it is an annotated corpus  |
| **SimpleFood45**        | **none stated anywhere**                                                                       | **no** — no licence means no permission                                        | no, until the authors say otherwise |
| **ECUSTFD**             | **none stated** ("a free public food image dataset" in the paper; no LICENSE file in the repo) | no                                                                             | no, until the authors say otherwise |
| **MADiMa 2017**         | not published; chapter paywalled                                                               | unknown                                                                        | unknown                             |
| **FLIC**                | article not retrievable (MDPI returns 403)                                                     | unknown                                                                        | unknown                             |

Where the terms say it:

- **Nutrition5k** — its README: _"We release all Nutrition5k data under the [Creative Commons
  V4.0] license. You are free to share and adapt this data for any purpose, even
  commercially."_ The phrase "Creative Commons V4.0" names no variant, but the hyperlink it
  wraps points at `creativecommons.org/licenses/by/4.0/`, and "share and adapt … even
  commercially" is CC BY 4.0's own summary. There is no `LICENSE` file in the repository;
  the README is the whole statement. **This is the cleanest licence in the census and it
  sits on the largest weighed corpus.**
- **DFoodTJ-F-Nutr** — the Science Data Bank record carries
  `"license":"https://creativecommons.org/publicdomain/zero/1.0/"` in its page metadata, and
  the DataCite record for `10.57760/sciencedb.28012` gives the same as
  `Creative Commons Zero v1.0 Universal` / SPDX `cc0-1.0`, over 8 files totalling 26.2 GB.
  The article itself is CC BY-NC-ND 4.0; the data is not.
- **ACETADA** — its download section: _"The ACETADA dataset is available for non-commercial
  research. By downloading, you agree to the license below and to cite our paper"_, followed
  by CC BY-NC 4.0 with attribution and "no commercial use". The paper's own text says CC BY
  4.0; where they disagree the dataset page governs the dataset, so read it as **NC**.
- **MetaFood3D** — _"The dataset is licensed under the Creative Commons
  Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0). … You may not use the
  dataset for commercial purposes. You are not allowed to distribute the dataset or any
  derivative works for commercial purposes."_
- **DiningBench** — _"released under the CC BY-NC-ND 4.0 license"_, with "explicit permission
  and copyright authorization from the data provider, Meituan, … for non-commercial research
  purposes".
- **SNAPMe** — the Ag Data Commons item's own licence field is **CC BY-SA 4.0**. Note that
  the _paper_ says CC BY 4.0; the repository record is the one that governs the files.
- **NutritionVerse-Real** — the Kaggle dataset record returns
  `"licenseName":"CC BY-NC-SA 4.0"` over 1,126,515,500 bytes. NutritionVerse-3D is the same.
- **SimpleFood45** — the dataset page carries an overview, a download link
  (`simple_food_45.zip`, 1,120,677,984 bytes, served openly) and a citation request, and
  **no licence of any kind**. Absence of a licence is absence of permission, not permission.

### 4.1 What is gated, and what is simply missing

- **MetaFood3D** is behind a request form: _"To access the MetaFood3D dataset, please fill
  out our request form. Once approved, we will provide you with a password."_ That is a
  follow-up task, not something this ticket can unblock. It is also the wrong shape — single
  scanned objects, not plates.
- **MADiMa 2017** has no public download page that could be found from its paper, and the
  Springer chapter redirects to an authentication wall. Access appears to mean emailing the
  ARTORG group at Bern. Also a follow-up, and at 80 meals it is small.
- **FLIC** could not be read at all: `mdpi.com` returns HTTP 403 to every automated fetch
  tried, so its data-availability statement and licence are unverified here. What is known
  from its abstract is mass, not energy — a leftover-estimation corpus, not a calorie one.
- **PFID**'s host does not resolve.
- **Menu-Match**'s host was not checked; it is annotated anyway.

## 5. Whether images can ride the prompt

Viability only, as the ticket asks. Three gates, and the middle one is the one that bites.

**Licence.** CC BY 4.0 (Nutrition5k) and CC0 (DFoodTJ) permit putting an image in a prompt
without argument. CC BY-NC (ACETADA, MetaFood3D) and CC BY-NC-SA (NutritionVerse-Real)
permit it for a non-commercial prototype under the reading in §4. CC BY-NC-**ND**
(DiningBench) is the one to avoid even here, since a cropped or resized exemplar is a
derivative.

**Mechanics.** This is the gate. Cloudflare documents
`@cf/meta/llama-3.2-11b-vision-instruct` with a top-level **`image`** input field alongside
`prompt` and `messages` — one image per request, not image parts inside the message array.
On that model, an image exemplar has nowhere to go. Workers AI has since added chat models
that take vision inputs in `messages` (Mistral Small 3.1, Moondream 3.1, Gemma-4-26B, Qwen
3.8 27B, Kimi K2.5 per the Workers AI changelog), and one of those is what a few-shot
attempt would have to run on. **#509 should confirm the exemplar-carrying shape against the
specific model its Worker calls before designing a prompt around it.**

**Size and cost.** Size is not a problem: the overhead PNG pulled in §3 is 412 KB, and the
side-angle frame re-encoded to JPEG is 90 KB, so three exemplars plus a query fit a request
comfortably. Cost is the problem. An exemplar image is read like any other image, so at
[#482](https://github.com/palebluebytes/inventoria/issues/482)'s measured 76–133 neurons per
image a 3-shot prompt costs roughly four times a zero-shot one: **~400 neurons a call, which
is about 25 calls on a free day instead of about 100.** A few-shot arm and a 75-dish scoring
arm do not fit in the same day.

## 6. The slice #509 should take

Workers AI's free allocation is _"a total of 10,000 Neurons per day at no charge"_. At
[#482](https://github.com/palebluebytes/inventoria/issues/482)'s 76–133 neurons per image
read, the worst case gives **75 reads a day** (75 × 133 = 9,975) and the best case about 130.
**Size the slice at 75 and let a cheap day spill into the next.**

### 6.1 The scoring arm — 75 Nutrition5k dishes

Everything below was counted from `metadata/dish_metadata_cafe1.csv`,
`metadata/dish_metadata_cafe2.csv` and the four files under `dish_ids/splits/`, fetched from
`storage.googleapis.com/nutrition5k_dataset/…`. **The bucket serves anonymously over plain
HTTPS** — no `gcloud` login, no 181 GB tarball; a range request for a single `rgb.png`
returned HTTP 206. That is what makes a small slice practical.

Measured over all 5,006 dishes:

| quantity                        | value |
| ------------------------------- | ----: |
| dishes                          | 5,006 |
| median calories                 |   142 |
| mean calories                   |   213 |
| p90 calories                    |   485 |
| median mass                     | 145 g |
| mean ingredients/dish           |  5.68 |
| distinct ingredients            |   219 |
| dishes with exactly 1 component | 1,816 |
| dishes with overhead RGB-D      | 3,265 |

### 6.2 What to exclude, and why

- **Single-component rows.** 1,816 of 5,006 dishes carry one component, because the
  incremental scanning procedure files every "add one item, scan again" step as its own
  `dish_id`. A one-olive plate is not the thing #509 is estimating.
- **Zero-calorie rows.** 240 dishes report 0 kcal.
- **Physically impossible rows.** Four dishes report more than 9 kcal per gram, which is
  above pure fat: `dish_1551567573` and `dish_1551567604` both claim 9,486 kcal from 159 g
  (59.7 kcal/g), and `dish_1551389588`/`dish_1551389551` both claim 2,401 kcal from 133 g.
  A fifth, `dish_1551567508`, claims 9,170 kcal from 7,974 g — plausible arithmetic, but an
  8 kg "plate".

Filtering to **≥3 components, ≥50 kcal, ≤9 kcal/g** leaves **2,609 dishes**; **1,982** of
those have overhead RGB-D; **289** are in the official `depth_test` split.

### 6.3 What to stratify on

**Calorie band**, because calories are the thing being scored and the corpus is heavily
skewed low — a slice drawn at random would be mostly small plates and would say nothing
about the 500 kcal case that matters to a food log. Measured band counts inside the 289-dish
filtered test pool:

| band         | filtered pool (1,982) | in `depth_test` (289) |   take |
| ------------ | --------------------: | --------------------: | -----: |
| 50–150 kcal  |                   366 |                    53 |     15 |
| 150–300 kcal |                   575 |                    85 |     15 |
| 300–500 kcal |                   667 |                   101 |     17 |
| 500–800 kcal |                   310 |                    37 |     15 |
| 800+ kcal    |                    64 |                    13 |     13 |
| **total**    |             **1,982** |               **289** | **75** |

**Component count** as the second stratum, split within each band between 3–5 components and
6 or more. The filtered test pool skews complex — 153 of 289 carry 10 or more components —
so an unstratified draw would over-weight cluttered plates and under-test the simple ones.

Drawing from `depth_test` rather than the whole corpus costs nothing here (no model is being
trained) and buys comparability: Nutrition5k ships
`scripts/compute_eval_statistics.py`, and its paper's numbers on that split are the bar —
**direct 2D prediction 70.6 kcal MAE / 26.1 % of mean**, the best reported method 41.3 kcal /
16.5 %, and human nutritionists ~41 % error on portion estimation. A VLM that lands near 26 %
has matched a 2021 supervised baseline; one at 41 % has matched a person.

### 6.4 Which image per dish

**The side-angle frame, not the overhead one.** The overhead `rgb.png` is one 412 KB file per
dish and trivially cheap to fetch, but it is 640×480 and top-down, the least like a phone
photo of anything in the corpus. The side-angle videos are the angled view. Extract frame 1
from one camera and throw the video away.

The cost is bytes, not neurons, and bytes are free: across 15 dishes sampled from the
filtered test pool, side-angle files were present for **14 of 15** (mean **23 MB** per dish
across all cameras; one dish had none at all) and overhead RGB-D for **15 of 15**. So a
75-dish slice is roughly **1.7 GB** of one-off download, from which 75 JPEG frames survive.
`ffmpeg -i camera_A.h264 -frames:v 1 out.jpg` is the whole extraction; the repo's own
`scripts/extract_frames_sampled.sh` does the bulk version.

**Do not commit the frames as a fixture without cropping the fiducials out of shot**, and say
in the commit that you did. A model that reads the QR markers for scale scores a cue the app
will never give it.

### 6.5 The transfer arm — 75 ACETADA before-meal images

Same budget, a second day. ACETADA ships one CSV (`ACETADA-HF-dataset.csv`) with
`total_kcal`, per-item `_consumed_g` and `_energy_kcal`, `meal_type` and `participant_id`,
against 806 before-meal images; the release is a single 4.94 GB zip served openly from the
project page. Stratify on **`total_kcal` band** as above and on **`meal_type`** (the corpus
is 36 % breakfast / 32 % lunch / 32 % dinner), and hold out participants so the same person's
three days do not all land in the slice.

Its published LMM baselines are the bar for this arm: **Claude 3.7 Sonnet 181.68 kcal MAE,
GPT-4o 165.77 kcal MAE**, against a meal rather than a plate. A Workers AI model far outside
that range on 75 images is a signal; inside it is not yet a result.

Because ACETADA is CC BY-NC 4.0, **its images stay out of the repo** — fetch them at run
time from a path in `.gitignore`, and record only the scores.

### 6.6 If a committable phone-photo arm is wanted

**DFoodTJ-F-Nutr is CC0**, weighed, smartphone-shot at 30–40 cm with an overhead and a 45°
oblique view per meal, and can be both committed and sent anywhere with no condition
attached. Its costs are that it is 26.2 GB, that its cuisine is Chinese hospital food for
diabetic inpatients, and that its composition came through a commercial app's tables rather
than a public database. It is the right third arm if the CC BY-NC line in §4 turns out to be
read too strictly, and the only corpus here with no licence question at all.

## 7. What this changes for #509

1. **Drop the cooking day.** #509's fallback — "a small set of plates assembled from foods
   already in the corpus, whose true total is therefore known" — is now the _fourth_ option,
   not the first. Two corpora do the same thing at 5,006 and 806 plates, weighed to ±1 g and
   ±0.1 g respectively, both fetchable today.
2. **Score against a rig, then check against a phone.** A single number from Nutrition5k
   would over-claim; the QR fiducials and the 35 cm framing are a different question from the
   one the app asks. Two arms, reported separately.
3. **Filter before you score.** 240 zero-calorie rows, four impossible densities, and 1,816
   one-component scans are in the file. §6.2 is the filter.
4. **Check the exemplar shape before designing a few-shot prompt.** On the vision model
   Cloudflare documents, a prompt cannot carry a second image at all, and even where it can
   the neuron arithmetic (§5) means few-shot and a 75-dish scoring run are different days.
5. **There is a published bar to beat, on both arms.** 70.6 kcal MAE / 26.1 % on Nutrition5k
   2D, ~166–182 kcal MAE on ACETADA, ~41 % for a human estimating portions. #509 does not
   need to invent a success criterion.

## 8. What was not established

Stated plainly, because a census is only as good as its gaps.

- **FLIC's licence and data availability.** MDPI refuses automated fetches; only its abstract
  was readable. It is a mass corpus rather than an energy one, so this is unlikely to change
  the recommendation.
- **MADiMa 2017's access route and terms.** No public download page was found from the paper;
  the chapter is paywalled.
- **Whether Science Data Bank's DFoodTJ download needs registration.** The record and its
  licence were read; the file-level download path was not exercised.
- **SimpleFood45's and ECUSTFD's redistribution terms.** Both ship data with no licence text
  anywhere that could be found — on the page, in the repository, or in the paper. That is
  recorded as "no permission", not as "permissive".
- **The completeness of the census itself.** Eleven corpora were classified from their own
  sources. The claim in §1 that _nothing_ is simultaneously weighed, marker-free, casually
  shot and permissively licensed is scoped to these eleven plus the four gated or dead ones —
  it is not a claim about every food dataset that exists.

---

## Sources

Each read directly on 2026-09-17.

- Nutrition5k — [repository README and licence](https://github.com/google-research-datasets/Nutrition5k),
  [CVPR 2021 paper](https://arxiv.org/abs/2103.03375), and the
  `nutrition5k_dataset` Google Cloud Storage bucket (metadata CSVs, split files and imagery
  fetched anonymously).
- ACETADA — [dataset page, download and licence](https://skynet.ecn.purdue.edu/~coburn6/ACETADA/),
  [paper](https://arxiv.org/abs/2507.07048).
- DFoodTJ-F-Nutr — [paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC13333986/),
  [Science Data Bank record](https://www.scidb.cn/detail?dataSetId=d2f2d7cccecb49739b7428066741fb39)
  (`doi:10.57760/sciencedb.28012`) and its DataCite metadata.
- NutritionVerse-Real — [paper](https://arxiv.org/abs/2401.08598),
  [Kaggle record](https://www.kaggle.com/datasets/nutritionverse/nutritionverse-real).
- MetaFood3D — [dataset page, licence and request form](https://lorenz.ecn.purdue.edu/~food3d/),
  [paper](https://arxiv.org/abs/2409.01966).
- SimpleFood45 — [dataset page](https://lorenz.ecn.purdue.edu/~gvinod/simplefood45/),
  [paper](https://arxiv.org/abs/2404.12257).
- ECUSTFD — [paper](https://arxiv.org/abs/1705.07632),
  [repository](https://github.com/Liang-yc/ECUSTFD-resized-).
- SNAPMe — [paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10708545/),
  [Ag Data Commons record](https://agdatacommons.nal.usda.gov/articles/dataset/SNAPMe_A_Benchmark_Dataset_of_Food_Photos_with_Food_Records_for_Evaluation_of_Computer_Vision_Algorithms_in_the_Context_of_Dietary_Assessment/24856449)
  (`doi:10.15482/USDA.ADC/1528346`).
- JFB — [paper](https://arxiv.org/abs/2508.09966),
  [repository](https://github.com/January-ai/food-scan-benchmarks).
- DiningBench — [paper](https://arxiv.org/abs/2604.10425),
  [repository](https://github.com/meituan/DiningBench).
- MADiMa 2017 — [chapter](https://link.springer.com/chapter/10.1007/978-3-319-70742-6_46) (paywalled).
- FLIC — [article](https://doi.org/10.3390/app16115465) (not retrievable).
- PFID — [IEEE record](https://ieeexplore.ieee.org/document/5413511/); host `pfid.intel-research.net` does not resolve.
- Cloudflare — [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/),
  [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
  [`llama-3.2-11b-vision-instruct` model page](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/),
  [Workers AI changelog](https://developers.cloudflare.com/workers-ai/changelog/).
