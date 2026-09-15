# Research: the movement corpora that could be bundled (#443)

**Map:** [#441](https://github.com/palebluebytes/inventoria/issues/441) — Wayfinder: recording exercise (Movements, Routines, Sessions).
**Unblocks:** the choosing ticket — "Choose the movement corpus and what a Movement row carries".
**Grounds:** [ADR-0047](../adr/0047-bundle-the-usda-archives-and-retire-the-api.md) bundled the USDA archives on a licence answer; `docs/icon-provenance.md` is how this repo discharges attribution; map #441's Notes fix **MET as the floor** (item 6) and **deliberate training first** (item 7).
**Date:** 2026-09-15. Figures marked _measured_ were computed that day from the primary distribution named — the whole file, not a sample, unless a sample size is given. Figures marked _read_ come from the cited page. **Status:** research only — no code, no ADR, no decision.

---

## 1. The short answer to question 5

**No single source carries both MET and anatomy.** The corpus decision is a **join, not a pick**.

Measured, not argued:

- The 2024 Adult Compendium carries a MET value on **every one of its 1,113 rows** and a muscle group, an equipment field or a movement pattern on **none** of them. Its only classification axis is a 22-value "Major Heading" naming a _life context_ ("Occupation", "Religious Activities", "Video Games"), not an anatomy.
- wger, Free Exercise DB and every gym-shaped dataset surveyed below carry muscles and equipment on most rows and a MET value on **zero** rows. wger's schema has no MET field at all — the field does not exist to be empty.
- The two vocabularies do not even overlap enough to join _by name_. The string `bench press` appears in **0 of the Compendium's 1,113 rows** (_measured_). The whole of resistance training is six rows, of which the most specific is `Resistance (weight) training, squats, deadlift, slow or explosive effort`.

So the choosing ticket is deciding a **shape**, not a source: whether a Movement row is (a) Compendium-only, and the anatomy ambition is deferred; (b) gym-corpus-only, with MET hand-assigned per row by us, which makes us the measurement's author; or (c) two corpora with a hand-made mapping between them, which is a maintained artefact of its own. Section 8 lays out what each costs.

---

## 2. The axes, and why these

Carried over from [the food-composition survey (#108)](108-base-food-composition-sources.md), which faced the same wall, plus two this domain adds.

| Axis                               | Why it decides things here                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Licence, precisely**             | A bundled corpus ships inside the app. Public domain / CC0 / permissive is fine; CC BY needs an attribution line we already know how to write; CC BY-SA and ODbL propagate into the ledger; CC BY-**NC** is disqualifying for anything that might ever be sold; "free to use" on a web page is a permission, not a licence. |
| **Redistribution vs API**          | No backend (no server-side key, no proxy). A runtime API must be CORS-open and keyless or it is not reachable at all, and it breaks offline, which is the app's whole posture.                                                                                                                                              |
| **Precache weight**                | `pnpm check:facets` holds each Facet's precache inside ±5% of a declared figure. Today: root `8,751,001` bytes, Rations `7,693,899` bytes (`src/lib/facets/registry.ts`). A corpus in the low hundreds of KiB is not the constraint here; the USDA artifacts already dwarf anything below.                                  |
| **MET present**                    | Map #441 Notes item 6: MET is the floor. A corpus without it is disqualified or needs a second source joined to it.                                                                                                                                                                                                         |
| **Anatomy present**                | Muscle group, equipment, movement pattern. Map #441 Notes item 6 calls this the ambition, not the floor.                                                                                                                                                                                                                    |
| **Dose shape**                     | Map #441 Notes item 4: a Movement row declares its own dose shape. Does the corpus say whether a row is timed, counted, or loaded?                                                                                                                                                                                          |
| **Findability of published names** | USDA's raw names needed [ADR-0056](../adr/0056-a-name-loses-the-parts-that-do-not-name-the-food.md) and a whole shipped-name arc. Question 6 asks whether these have the same problem. They have a _different_ one — see §7.                                                                                                |
| **Deliberate-training coverage**   | Map #441 Notes item 7 scopes this to runs, lifts, swims, classes. A corpus can be large and still thin exactly there.                                                                                                                                                                                                       |

---

## 3. The 2024 Compendium of Physical Activities

**Primary sources.** [pacompendium.com](https://pacompendium.com/) (the site the authors run); the [2024 Adult Compendium PDF](https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf); Herrmann SD et al., "2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities", _J Sport Health Sci_ 2024;13(1):6–12, [doi:10.1016/j.jshs.2023.10.010](https://doi.org/10.1016/j.jshs.2023.10.010), open access at [PMC10818145](https://europepmc.org/articles/PMC10818145).

### 3.1 Licence — and it is not one

There is no licence file, no SPDX identifier and no Creative Commons grant on the data. What exists is a permission statement on the homepage, under the heading **"Using the Compendium"**, quoted verbatim ([pacompendium.com](https://pacompendium.com/), _read_ 2026-09-15):

> Researchers may download the compendium for use in their research.
>
> The Adult, Older Adult, and Wheelchair Compendia are free to use for commercial purposes.
>
> Teachers may use the compendium or portions thereof for educational purposes with their students.
>
> Please do not change MET values or combine activities with different MET levels.
>
> Please cite the Compendium website or publication(s). Websites may link to the compendium by linking to this page: https://pacompendium.com/ .
>
> Those with questions about use of the Compendium for these or other purposes should e-mail our team at: compendiumpa@gmail.com .

Four things follow, and they are not the same thing.

1. **"Free to use for commercial purposes" is granted explicitly**, naming all three compendia. That is the sentence that matters for bundling, and it is stronger than most national food tables managed.
2. **"Please cite"** is the attribution obligation, and it is satisfiable the way `docs/icon-provenance.md` satisfies its own: one line naming the Compendium, the four 2024 citations, and a link to `https://pacompendium.com/`. The homepage names the exact citation strings, including `Herrmann SD, Willis EA, Ainsworth BE, ... 2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities. Journal of Sport and Health Science, 2024;13(1): 6-12.`
3. **"Please do not change MET values or combine activities with different MET levels"** is a _data-integrity_ constraint that lands directly on the ingestion arc. A shipped-name arc that merges two Compendium rows into one Movement — the USDA twin-fusion move ([#145](145-twin-fusion-adjudication.md)) — would violate it wherever the two rows carry different METs. Dropping rows is not combining them; fusing `Bicycling, 12-13.9 mph` (8.0) with `Bicycling, 14-15.9 mph` (10.0) is.
4. **The wording is "please", not a grant of a right.** It is an unversioned web page with no archive guarantee, from a team that answers by email. That is weaker provenance than a licence file in a repo, and it is worth capturing a dated snapshot of the page alongside the data if this is bundled.

**A tension to note, not to resolve here.** The _journal article_ carrying the same tables is published under a different licence — verbatim from the paper's front matter ([PMC10818145](https://europepmc.org/articles/PMC10818145), _read_): "© 2023 Published by Elsevier B.V. on behalf of Shanghai University of Sport. This is an open access article under the CC BY-NC-ND license (http://creativecommons.org/licenses/by-nc-nd/4.0/)." Europe PMC's metadata records the licence as `cc by-nc-nd` (_measured_, via the [Europe PMC REST API](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%2210.1016/j.jshs.2023.10.010%22&resultType=core&format=json)). NC forbids commercial use and ND forbids derivatives — the exact opposite of what the website grants. **Take the data from the Compendium website, whose owners grant commercial use, and never from the Elsevier article PDF.** Same numbers, incompatible terms.

### 3.2 Size and shape

|                       | Adult 2024                                                                                                          | Older Adult 2024                                                                                                   | Wheelchair 2024                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Rows                  | **1,113** (_measured_)                                                                                              | **99** (_measured_)                                                                                                | **124** (_measured_)                                                                                          |
| Distribution measured | [PDF, 563,091 bytes, 28 pp](https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf) | [PDF, 120,884 bytes](https://pacompendium.com/wp-content/uploads/2024/02/2_2024-older-adult-compendium_1_2024.pdf) | [PDF, 28 pp](https://pacompendium.com/wp-content/uploads/2024/01/2024-adult-wheelchair-compendium_1_2024.pdf) |
| Code shape            | 5 digits (`01030`), first 2 = heading                                                                               | 7 digits (`0202260`), suffixed `60`                                                                                | 5 digits (`90101`), prefixed `9`                                                                              |
| MET baseline          | 1 MET = 3.5 ml/kg/min                                                                                               | MET 60 = **2.7** ml/kg/min                                                                                         | MET WC = **0.992** kcal/kg/h                                                                                  |

The paper's own highlight says "the energy costs of **1114** PAs" (_read_); the published PDF yields **1,113** distinct activity codes (_measured_ — every 5-digit token in the extracted text, deduplicated, with no duplicates found). One row's difference. Record it as an open question for the ingestion arc rather than as a fact about either number.

**Fields per row: three.** Major Heading, Activity Code, MET Value, Activity Description. That is the entire schema. There is no unit, no dose shape, no duration, no muscle, no equipment, no image, no identifier stable across editions other than the code itself.

**Format.** The primary published artefacts are **PDF**. The site also renders every heading as an HTML table at a stable path — `https://pacompendium.com/bicycling`, `/conditioning-exercise`, `/running`, `/walking`, `/sports`, and 17 more, all linked from [the Adult Compendium page](https://pacompendium.com/adult-compendium/) — so an HTML scrape is available and is cleaner than PDF extraction. **Excel exists but is not downloadable**: the homepage says "To request a copy of the compendium in Excel format, please email us or complete the form below." There is no CSV, no JSON, no API, and no version-controlled repository. Ingestion is a scrape either way, which is a real cost the choosing ticket should carry.

**Weight, if bundled.** 1,113 rows × (5-char code + 1 float + ~45-char description) is on the order of **60 KiB raw, well under 25 KiB gzipped** — a rounding error against the 8.7 MB the root Facet already precaches. Size is not an axis that discriminates here.

### 3.3 MET: yes, on every row, and that is the point

MET is the _only_ payload. Range **1.0 to 23.0** (_measured_). 22 major headings, with row counts (_measured_):

Sports 152, Occupation 145, Walking 91, Water Activities 85, Conditioning Exercise 84, Home Activities 76, Running 64, Lawn & Garden 53, Winter Activities 51, Bicycling 43, Fishing & Hunting 37, Home Repair 36, Miscellaneous 27, Dancing 27, Religious Activities 23, Music Playing 22, Volunteer Activities 19, Inactivity 16, Transportation 12, Self Care 11, Video Games 7, Sexual Activity 3.

Under map #441's item 7 ("deliberate training first"), the headings in scope are Bicycling, Conditioning Exercise, Dancing, Running, Sports, Walking, Water Activities and Winter Activities — **597 rows**, a little over half the corpus (_measured_). The other 516 rows are the "widening to all physical activity" the map explicitly parks.

### 3.4 Anatomy: none

No muscle group, no equipment field, no movement pattern, no laterality, no plane of motion. Equipment appears only inside free text, as prose: `Bicycling, stationary, 126-150 watts`, `Kettle bell swings`. There is nothing to query.

### 3.5 Dose shape: implied, never declared

A MET value is energy per unit _time_, so every Compendium row is implicitly duration-dosed. That fits runs, swims, classes and cycling. It fits lifting badly, which is the domain's real problem and not the Compendium's fault: the corpus prices `Resistance (weight) training, multiple exercises, 8-15 reps at varied resistance` at 3.5 MET for as long as you were in the gym, and has no opinion about sets, reps or load. Map #441 item 4 says a Movement row declares its own dose shape — **the Compendium declares none**, so that field would be ours to author on ingest.

---

## 4. Findability of the Compendium's published names

Verbatim rows, copied from the published PDF (_measured_ — these are the strings as distributed):

```
01030   8.0    Bicycling, 12-13.9 mph, leisure, moderate effort
02050   6.0    Resistance (weight lifting - free weight, nautilus or universal-type), power lifting or body
               building, vigorous effort (Taylor Code 210)
02052   5.0    Resistance (weight) training, squats, deadlift, slow or explosive effort
02054   3.5    Resistance (weight) training, multiple exercises, 8-15 reps at varied resistance
02055   5.8    Resistance Training, circuit, reciprocol supersets, peripheral hear action training
02045   3.5    Curves™ exercise routines in women
02058   9.8    Kettle bell swings
12030   8.5    Running, 5.0 to 5.2 mph (12 min/mile)
17010   7.0    Backpacking (Taylor Code 050)
17019   6.5    Carrying 50 to 150 pound load (e.g., equine or bovine feed, fence pipes, furniture), level ground, moderate pace
22360   9.8    Conditioning/exercise virtual reality fitness, vigorous intensity
15645   3.3    Sports spectator, very excited, emotional, physically moving
```

**The failure mode is not USDA's.** USDA's names were _unfindable_ — the right row existed under a name nobody would type (hence ADR-0056's origin-word strip). The Compendium's names are readable English. Its problem is that **the row you want frequently does not exist at all**, and when it does the name carries research apparatus a user will never type.

Measured against the 1,113 published descriptions:

- `bench press` → **0 rows**. So does `barbell`, `dumbbell` as a lift name, `lat pulldown`, `overhead press`, `bicep curl`.
- `deadlift` → **1 row**, and it is shared with squats in the same string.
- `squat` → 5 rows, all of them compound descriptions naming three or four other movements (`Body weight resistance exercises (e.g., squat, lunge, push-up, crunch), general`).
- `pull-up` → 2 rows, both inside `Calisthenics (e.g., ...)` lists.
- Against that: `yoga` → 11 rows, `pilates` → 3, `rowing`/`row` → 17, `running` and `walking` → 155 rows carrying an `mph` band.

Three name hazards for the shipped-name arc, all _measured_:

1. **Taylor Code parentheticals on 57 rows** — `Backpacking (Taylor Code 050)`. A 1978 provenance marker, meaningless to a user, present in the shipped string. This is precisely an ADR-0056-shaped strip, and a much easier one than USDA's because it is a fixed regex.
2. **Typographical rot in the published data.** `Resistance Training, circuit, reciprocol supersets, peripheral hear action training` — "reciprocol" for "reciprocal" and "peripheral hear action" for "peripheral heart action". Published, uncorrected, and a search for "heart" misses it. `Curves™ exercise routines in women` carries both a trademark (3 rows carry ™ or ®) and a cohort qualifier that is not a property of the activity.
3. **Imperial units everywhere.** 146 rows carry an `mph` band and 18 carry a watts band. For a UK user, `Running, 6-6.3 mph (10 min/mile)` is a row you can only find if you already think in miles per hour; the pace parenthetical rescues some of them but not the cycling rows.

Otherwise the names are well-behaved: mean description length 44.5 characters (max 135), 968 of 1,113 carry a qualifier after a comma in a consistent `head, qualifier, effort` grammar that the existing food ranking keys (`src/lib/food/`) would recognise, and only **4 descriptions repeat** across the whole corpus, covering 8 rows (`Typing, electric, manual, or computer` under both Religious Activities and Volunteer Activities; three Walking strings duplicated under Volunteer Activities). USDA's duplicate-name problem does not exist here.

---

## 5. wger

**Primary sources.** The repository [github.com/wger-project/wger](https://github.com/wger-project/wger) and its [README](https://raw.githubusercontent.com/wger-project/wger/master/README.md); the live public API at [wger.de/api/v2](https://wger.de/api/v2/), which is the project's own distribution channel (below). All figures below are _measured_ from `https://wger.de/api/v2/exerciseinfo/?format=json&limit=1000` fetched 2026-09-15.

### 5.1 Licence — share-alike on 97.6% of rows, and 90 rows that cannot be attributed

The README states three licences, verbatim:

> ## License
>
> - Application Code: [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)
> - Exercise/Ingredient Data: Creative Commons (see individual entries)
> - Documentation: [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)

"See individual entries" is not a hedge: every exercise carries a `license` object and a `license_author` string, and `https://wger.de/api/v2/license/` enumerates the five licences the project recognises (`CC-BY-SA 3`, `CC-BY 4`, `CC-BY-SA 4`, `CC0`, `ODbL`). So the real answer is a distribution, and here it is (_measured_, over all 865 exercises):

| Licence      | Exercises | Redistributable in a bundle?        |
| ------------ | --------- | ----------------------------------- |
| `CC-BY-SA 4` | 712       | Yes, but **share-alike propagates** |
| `CC-BY-SA 3` | 132       | Yes, but **share-alike propagates** |
| `CC0`        | 21        | Yes, unconditionally                |

**844 of 865 rows (97.6%) are share-alike.** This is the same wall #108 hit with OpenNutrition's ODbL and Australia's CC BY-SA, and it is the single most consequential fact about wger for this repo. CC BY-SA 4.0 §3(b) requires that an _adapted_ database be released under a compatible licence; whether an app's shipped corpus and the ledger rows a user derives from it constitute an "Adapted Database" is exactly the argument #108 declined to have, and declining it is why USDA won there.

**The attribution obligation is worse than one credits line.** `license_author` holds **242 distinct values** — individual contributor handles, not an institution: `wger.de` (75 exercises), `clafal` (32), `Croak6728` (29), `Davidgj32` (22), `Moffi` (20). Discharging CC BY-SA here means shipping a 242-name credits page, not the one-line `docs/icon-provenance.md` entry the Compendium needs.

**And 90 of 865 exercises (10.4%) carry no `license_author` at all** — an empty attribution field under a licence whose whole substance is attribution. Those rows cannot be compliantly redistributed by anyone, wger included. Any ingestion would have to either drop them or attribute them to the project, and the second is a claim we would be making up.

### 5.2 Size and shape

**865 exercises** (_measured_; `count: 865` from the API). An exercise is a _base_ with translations hanging off it, not a row. The top-level fields are:

```
author_history, category, created, equipment, id, images, last_update,
last_update_global, license, license_author, muscles, muscles_secondary,
total_authors_history, translations, uuid, variation_group, videos
```

- `category` — one of **8**: Abs, Arms, Back, Calves, Cardio, Chest, Legs, Shoulders.
- `muscles` / `muscles_secondary` — from a closed vocabulary of **15**, and they are anatomical Latin with an English alias: `Anterior deltoid` / `Shoulders`, `Biceps femoris` / `Hamstrings`, `Latissimus dorsi` / `Lats`, `Rectus abdominis` / `Abs`. **Five** of the fifteen have an empty `name_en` — `Brachialis`, `Obliquus externus abdominis`, `Serratus anterior`, `Soleus`, `Trapezius` — so a UI that shows the English alias shows a blank for those and must fall back to the Latin.
- `equipment` — from a closed vocabulary of **12**: Barbell, Bench, Cable machine, Dumbbell, Gym mat, Incline bench, Kettlebell, Pull-up bar, Resistance band, SZ-Bar, Swiss Ball, `none (bodyweight exercise)`.
- `translations` — the name and description live here, per language. All 865 have an English (`language: 2`) translation; German has 644, and 8 languages have more than 45.
- `variation_group` — an integer grouping variants of the same movement. The nearest thing to a movement-pattern axis, and it is a bare id with no name.

**Coverage** (_measured_): muscles on **724 / 865 (83.7%)**, secondary muscles on 374, equipment on **673 / 865 (77.8%)**, an English description on 842. So about one row in six has no muscle at all — the anatomy is good but not total, which matters if anatomy is ever a filter rather than a decoration.

**Bytes.** The full API payload for all 865 is **5,547,575 bytes raw / 979,451 gzipped** (_measured_) — but that is mostly `translations` in a dozen languages plus image and video URLs. Trimmed to `uuid, name, category, muscles, secondary muscles, equipment` it is **121,063 bytes raw / 33,524 gzipped** (_measured_). Either figure is affordable against the 8.7 MB the root Facet already precaches; the trimmed one is noise.

**Format, and how you get it in bulk.** JSON over a paginated REST API. There is **no published dump, tarball or fixture file** — and wger's own tooling confirms the API _is_ the distribution channel: the project ships a Django management command [`sync-exercises.py`](https://github.com/wger-project/wger/blob/master/wger/exercises/management/commands/sync-exercises.py) whose docstring reads "Synchronizes exercise data from a wger instance to the local database", pointed at `settings.WGER_SETTINGS['WGER_INSTANCE']`, with `API_MAX_ITEMS = 999` as the page size. Two consequences for us: (a) there is no version-pinned artefact to bundle, so an ingest is "whatever the API said the day we ran it", which is weaker provenance than USDA's dated archive releases; (b) the API sends `access-control-allow-origin: *` (_measured_, via a preflight-style `Origin:` request), so it is reachable from the browser at runtime with no key and no proxy — the only corpus surveyed here of which that is true.

### 5.3 MET: no, and not even a field for it

`met` is not a key on an exercise, and neither is `energy`, `calorie` or `kcal` (_measured_ — checked against every top-level key of all 865 rows). There is no MET vocabulary anywhere in the API's endpoint list. wger's own app computes nothing about energy from an exercise; it records sets, reps and weight.

This is the finding that decides question 5 on the gym side. wger is not a corpus that _forgot_ to carry MET; MET is not part of what it models.

### 5.4 Anatomy: yes, and it is the best of the open ones

Primary muscles, secondary muscles, an 8-value body-region category, a 12-value equipment vocabulary, and a `variation_group` id. Both muscle and equipment vocabularies are closed and small, which is exactly what a filter needs — this is the shape the map's "anatomy layer" ambition is imagining.

What it does **not** carry: movement pattern (push/pull/hinge/squat/carry), plane of motion, laterality, or a difficulty grade. `variation_group` is the only grouping and it is unnamed.

### 5.5 Dose shape: no

Nothing on an exercise says whether it is timed, counted or loaded. wger's dose model lives on the _workout log_, not on the exercise, so a row bundled from here arrives without the thing map #441 item 4 wants it to declare.

### 5.6 Findability of wger's published names

Verbatim English names, as published (_measured_ — first rows of the corpus, unedited):

```
2 Handed Kettlebell Swing
Seated Hip Adduction
Arnold Shoulder Press
Axe Hold
Barbell Ab Rollout
Barbell Hack Squats
Barbell Lunges Standing
Barbell Reverse Wrist Curl
Abdominal Stabilization
Bear Walk 2
Bench Press
Benchpress Dumbbells
Bench Press Narrow Grip
Bent Over Dumbbell Rows
Bent-over Lateral Raises
Bent Over Rowing
Bent Over Rowing Reverse
Biceps Curls With Barbell
Biceps Curls With SZ-bar
```

**These are findable.** They are the words a gym-goer types, in title case, with the equipment in the name. `Bench Press` is there, spelled as you would type it — the exact row the Compendium does not have. Nothing here needs an ADR-0056-style strip.

The problem is a different one: **crowdsourced inconsistency**, because these names are 242 people's spellings rather than one institution's grammar.

- **No duplicates, but near-duplicates everywhere.** All 865 English names are distinct (_measured_ — 865 distinct lowercased names of 865). But `Bench Press`, `Benchpress Dumbbells`, and `Bench Press Narrow Grip` are three rows whose relationship is expressed only by a `variation_group` integer, and the second spells the head word as one word. `Bent Over Rowing`, `Bent Over Rowing Reverse` and `Bent Over Dumbbell Rows` alternate between `Rowing` and `Rows` as the head noun. The `head, qualifier` grammar that USDA search's ranking keys exploit is simply absent — the qualifier can be a prefix (`Barbell Lunges Standing`), a suffix (`Bench Press Narrow Grip`) or absent.
- **Ordinals and junk in the head position.** `2 Handed Kettlebell Swing`, `4-count burpees`, `3D lunge warmup`, `1-Arm Half-Kneeling Lat Pulldown`, `45° lateral raises`, `1/2 Kneeling Thoracic Rotation`, `90/90 Breathing`, `Limber 11`, and — unambiguously rot — `Bear Walk 2` and `3008 Abdominal Crunch`. A leading digit defeats alphabetical ordering and a bare `2` as a disambiguator is a name nobody will search for.
- **Casing is inconsistent**: `Barbell Ab Rollout` and `Zone 2 Running` alongside `4-count burpees` and `45° lateral raises`.

---

## 6. Free Exercise DB (yuhonas), and its upstream wrkout/exercises.json

**Primary sources.** [github.com/yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) — its [LICENSE.md](https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/LICENSE.md), [schema.json](https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/schema.json) and [dist/exercises.json](https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json); the upstream [github.com/wrkout/exercises.json](https://github.com/wrkout/exercises.json) and its [CONTRIBUTING.md](https://raw.githubusercontent.com/wrkout/exercises.json/master/CONTRIBUTING.md). Figures _measured_ 2026-09-15 from `dist/exercises.json`.

### 6.1 Licence — the Unlicense on the text, and a hole under the images

`LICENSE.md` is the plain Unlicense, verbatim at its head:

> This is free and unencumbered software released into the public domain.
>
> Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means.

GitHub's own licence detection agrees (`"spdx_id": "Unlicense"` on both repos, via the API). For the **JSON text** — names, muscles, equipment, instructions — that is the best licence answer in this whole survey: no attribution obligation, no share-alike, commercial use explicit.

**The images are a separate and much worse story, and the maintainers say so themselves.** Upstream `CONTRIBUTING.md` states it in the repository, verbatim:

> **NB:** Any help in creating digital copyright free images for each exercise would be extremely helpful.
>
> Currently all exercises have two images, these have been scrapped off the internet, therefore l do not own the copy right for these images and would advise against using them in comercial projects.

The downstream maintainer's own position, on [yuhonas/free-exercise-db#2 "License of Images?"](https://github.com/yuhonas/free-exercise-db/issues/2), verbatim:

> this project is a fork/reworking of [exercises.json](https://github.com/wrkout/exercises.json) [...] the derived project is licensed using [Unlicense license](https://github.com/wrkout/exercises.json/blob/master/LICENSE.md) though I actually have no idea where the images are from or if they are royalty free so usage would be at your own risk

The still-open [yuhonas/free-exercise-db#13](https://github.com/yuhonas/free-exercise-db/issues/13) carries a reverse-image-search attribution to bodybuilding.com and a request to remove the images; the maintainer's reply proposes swapping in placeholders. **Treat the 1,746 image paths (_measured_) as unusable and do not bundle them.** The practical effect is small — they are also far too heavy to precache — but it must be a stated exclusion, not a silent one, in a repo that keeps `docs/icon-provenance.md`.

**One residual doubt worth naming rather than burying.** The Unlicense on the _text_ is a dedication by people who, by their own account, did not author all of what they dedicated. Nobody in either repo's issue tracker has produced evidence that the instruction prose is copied (the #13 thread's most careful comment says the opposite: "The exercise descriptions, though, seem ok — at least I personally haven't been able to find any evidence of plagiarism"), and the prose reads as written-for-purpose. But the dedication's chain of title is asserted, not documented. If the choosing ticket takes this corpus, taking the **structured fields** (name, muscles, equipment, force, mechanic, category) and writing our own row prose is materially safer than shipping 571,706 characters of instructions (_measured_) whose author nobody can name.

### 6.2 Size and shape

**876 exercises** (_measured_). Eleven fields, every one of them on every row, with `null` where unknown:

```
category, equipment, force, id, images, instructions, level, mechanic,
name, primaryMuscles, secondaryMuscles
```

Closed vocabularies, with the full distribution (_measured_):

| Field              | Values    | Distribution                                                                                                                                                                       |
| ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`         | 7         | strength 584, stretching 123, plyometrics 61, powerlifting 38, olympic weightlifting 35, strongman 21, **cardio 14**                                                               |
| `force`            | 3 + null  | pull 371, push 371, static 104, **null 30**                                                                                                                                        |
| `mechanic`         | 2 + null  | compound 491, isolation 298, **null 87**                                                                                                                                           |
| `equipment`        | 12 + null | barbell 170, dumbbell 123, other 122, body only 111, cable 81, **null 77**, machine 67, kettlebells 56, bands 20, medicine ball 17, exercise ball 12, foam roll 11, e-z curl bar 9 |
| `level`            | 3         | beginner 525, intermediate 294, expert 57                                                                                                                                          |
| `primaryMuscles`   | 17        | present on **876 / 876**                                                                                                                                                           |
| `secondaryMuscles` | 17        | present on 604 / 876                                                                                                                                                               |

**Bytes.** `dist/exercises.json` is **1,005,327 bytes raw / 167,211 gzipped** (_measured_). Dropping `instructions` and `images` — the two fields with the provenance doubt — leaves **208,686 raw / 19,062 gzipped** (_measured_) for all 876 rows and every structured field. Nineteen kilobytes. Precache weight is not a consideration.

**Format.** One JSON file per exercise under `exercises/`, plus a built `dist/exercises.json` array, plus `dist/exercises.nd.json` (newline-delimited) via a `make` task, plus a JSON Schema the CI lints against. This is the only candidate that ships a **version-pinned, schema-validated, git-addressable artefact** — the same property that made USDA's dated archives bundleable under ADR-0047. There is no API and none is needed.

### 6.3 MET: no

No `met`, no `calorie`, no `energy` key anywhere in the corpus (_measured_ — the set of keys across all 876 rows is exactly the eleven above). Same verdict as wger: not absent data, an absent concept.

### 6.4 Anatomy: yes, and it is richer than wger's on the axes that matter

Seventeen muscles, `primaryMuscles` on **every** row, `secondaryMuscles` on 604. Crucially it also carries two axes wger does not:

- **`force`: push / pull / static** — a real movement-pattern axis, populated on 846 of 876 rows.
- **`mechanic`: compound / isolation** — populated on 789.

That is most of the "anatomy layer" the map parks as an ambition, already typed and already closed-vocabulary.

**But the anatomy degenerates exactly where the Compendium is strong.** All 14 cardio rows, verbatim with their primary muscle (_measured_):

```
Bicycling             | other   | ['quadriceps']
Bicycling, Stationary | machine | ['quadriceps']
Elliptical Trainer    | machine | ['quadriceps']
Jogging, Treadmill    | machine | ['quadriceps']
Prowler Sprint        | other   | ['hamstrings']
Recumbent Bike        | machine | ['quadriceps']
Rope Jumping          | other   | ['quadriceps']
Rowing, Stationary    | machine | ['quadriceps']
Running, Treadmill    | machine | ['quadriceps']
Skating               | other   | ['quadriceps']
Stairmaster           | machine | ['quadriceps']
Step Mill             | machine | ['quadriceps']
Trail Running/Walking | None    | ['quadriceps']
Walking, Treadmill    | machine | ['quadriceps']
```

Thirteen of the fourteen are `quadriceps`, including `Rowing, Stationary` and `Skating`. This is not thin anatomy, it is **wrong** anatomy — a default value standing in for a judgement nobody made. Any wayfinding built on "you have not trained legs in nine days" would count a rowing session as a leg day.

### 6.5 Dose shape: specified upstream, present on zero rows

The upstream repo documents exactly the thing map #441 item 4 asks for. `CONTRIBUTING.md`, verbatim: "Exercises are more useful when you know how to measure them. [...] All exercises should have an accompanying `measure.json` file." And `types/measure.d.ts` types it:

```ts
export enum Fields {
  reps = "reps",
  time = "time",
  distance = "distance",
  weight = "weight",
}
export interface Measure {
  requiredFields: Fields[];
  optionalFields?: Fields[];
  weightModifier?: WeightModifier;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
}
```

**Zero `measure.json` files exist.** The upstream tree holds **873 `exercise.json` and 0 `measure.json`** (_measured_, via the GitHub trees API at `master`). The dose shape is a documented intention with no data behind it, and yuhonas' fork does not carry the field at all. Worth knowing chiefly because it is independent confirmation that a per-row dose shape is the right model — someone else reached for it — and that we would be authoring it ourselves.

The upstream also types two fields the fork drops and the ingestion arc would want: `aliases?: string[]` and `tips?: string[]`, plus three `category` values the fork's schema does not list (`crossfit`, `weighted bodyweight`, `assisted bodyweight`).

### 6.6 Findability of Free Exercise DB's published names

Verbatim, the first twenty names in `id` order (_measured_, unedited):

```
3/4 Sit-Up
90/90 Hamstring
Ab Crunch Machine
Ab Roller
Adductor
Adductor/Groin
Advanced Kettlebell Windmill
Air Bike
All Fours Quad Stretch
Alternate Hammer Curl
Alternate Heel Touchers
Alternate Incline Dumbbell Curl
Alternate Leg Diagonal Bound
Alternating Cable Shoulder Press
Alternating Deltoid Raise
Alternating Floor Press
Alternating Hang Clean
Alternating Kettlebell Press
Alternating Kettlebell Row
Alternating Renegade Row
```

And the 21 rows matching `bench press` (_measured_):

```
Barbell Bench Press - Medium Grip        Dumbbell Bench Press
Barbell Guillotine Bench Press           Dumbbell Bench Press with Neutral Grip
Barbell Incline Bench Press - Medium Grip Hammer Grip Incline DB Bench Press
Bench Press - Powerlifting               Machine Bench Press
Bench Press - With Bands                 One Arm Dumbbell Bench Press
Bench Press with Chains                  Reverse Band Bench Press
Close-Grip Barbell Bench Press           Reverse Triceps Bench Press
Decline Barbell Bench Press              Smith Machine Bench Press
Decline Dumbbell Bench Press             Smith Machine Close-Grip Bench Press
                                         Wide-Grip Barbell Bench Press
                                         Wide-Grip Decline Barbell Bench Press
```

**Findability is good, and the failure mode is over-supply rather than absence** — the opposite of the Compendium's. All 876 names are distinct (_measured_). But:

- **The qualifier has no fixed position or separator.** `Barbell Bench Press - Medium Grip` (prefix + dash), `Bench Press - With Bands` (dash), `Bench Press with Chains` (bare preposition), `Close-Grip Barbell Bench Press` (prefix), `Dumbbell Bench Press with Neutral Grip` (both). Upstream's `CONTRIBUTING.md` actually specifies a grammar — "`<exercise.name> (<exercise.equipment>)`", giving `Bench Press (Barbell)` — and **not one row in the fork follows it**. A ranking key that prices the head phrase, as the USDA work's do, has no stable head to price here.
- **Abbreviations leak into names**: `Hammer Grip Incline DB Bench Press` uses `DB` where 123 other rows spell `Dumbbell`.
- **Some names are not movement names at all**: `Adductor`, `Adductor/Groin`, `90/90 Hamstring` are muscles in the name slot.
- **Leading digits and slashes**: `3/4 Sit-Up`, `90/90 Hamstring`, `Trail Running/Walking`.
- **It is a US gym vocabulary**, which matters less here than it did for food: the lifts have the same names in a British gym. There is no origin-word problem, so no ADR-0056 analogue is needed.

**Coverage, which is the real finding.** `swimming` → **0 rows**, `yoga` → **0 rows**, `running` → 2, `cycling` → 2, `walk` → 8 (_measured_). Against `squat` → 56, `bench press` → 21, `deadlift` → 24, `row` → 53. Map #441 item 7 scopes this domain to "runs, lifts, swims, classes" — this corpus covers the lifts magnificently and **three of those four words badly or not at all**.

---

## 7. ExerciseDB / AscendAPI, and the other commercial APIs

**Primary sources.** [ascendapi.com](https://ascendapi.com/) (the vendor, "Previously ExerciseDB"); [docs.ascendapi.com](https://docs.ascendapi.com/llms.txt); the [ExerciseDB v1 OpenAPI spec](https://docs.ascendapi.com/api-reference/exercisedb-v1/exercisedb-v1.json); [github.com/ExerciseDB/exercisedb-api](https://github.com/exercisedb/exercisedb-api). All _read_ 2026-09-15.

### 7.1 It rules itself out, in its own documentation

The vendor publishes a caching policy, and it is the whole answer. Verbatim from [docs.ascendapi.com/guides/caching](https://docs.ascendapi.com/guides/caching.md):

> Caching of AscendAPI data is only permitted if your current plan explicitly allows it. If you are unsure whether your plan includes caching rights, check the features listed on your product page or contact us before implementing any caching layer.
>
> [...]
>
> If your plan **does not permit caching**, you must not store any data returned by the API. All requests must be made in real-time.

A bundled corpus is the maximal case of caching: permanent, offline, redistributed to every installer of the app. Whatever a paid plan's caching right turns out to be, "store the whole dataset inside a shipped PWA and never call again" is not it, and the policy is explicit that media URLs must **never** be stored permanently because they rotate weekly (Monday 00:00 UTC).

Three further disqualifiers, each independent:

1. **It needs a key.** The v1 OpenAPI spec declares `"security": [{"RapidAPIKey": []}]` on the exercise endpoints (_measured_). No backend means no place to keep a key. Measured live: `https://exercisedb.p.rapidapi.com/exercises` returns **401** `{"message":"Invalid API key."}`; the once-free `https://exercisedb-api.vercel.app/api/v1/exercises` returns **402 Payment required** / `DEPLOYMENT_DISABLED`; `https://v1.exercisedb.dev/api/v1/exercises` returns **429**.
2. **The free tier is a bait, not a distribution.** The landing page advertises "ExerciseDB V1 API (Free Version) — 1,500 exercises with GIFs. No sign-up, no API key — just call the endpoint directly", while the docs index describes v1 as "over 2,000 structured exercises" and the README's own playground warning reads "⚠️ These endpoints are for exploration only and **not recommended for production integration** — strict rate limits and potential instability may apply." Free plans are capped at "**1,000 requests per hour** per API key" ([rate limiting guide](https://docs.ascendapi.com/guides/ratelimiting.md)).
3. **It is a moving target under a business.** The product renamed itself from ExerciseDB to AscendAPI, the free hosted endpoint moved and then broke, and v1 (2,000 exercises) now sits beside v2 (11,000). Compare ADR-0047, which retired the FDC API for a dated archive precisely so that a vendor's operational decisions stop being our problem.

**Gap, recorded rather than dropped.** The Terms of Use are behind a `dub.sh` redirect (`https://dub.sh/exercisedb-api-tos`) that serves a Vercel bot-check to every non-browser client. Three fetch attempts (curl with a browser user-agent, and WebFetch) returned **403 / 429 "Vercel Security Checkpoint"**. `ascendapi.com/terms` and `ascendapi.com/pricing` both return HTTP 200 but render the landing-page shell with no terms and no prices. **So the actual licence granted to a paying subscriber is unverified.** The caching policy above is the vendor's own published rule and is enough to settle bundling; the ToS would only matter if someone wanted to argue for a runtime integration, which the key requirement already kills.

### 7.2 What it carries, for completeness

Fields on a v1 exercise, from the OpenAPI spec's own filter parameters and response shapes (_measured_): `exerciseId`, `name`, `imageUrl`, `bodyParts`, `targetMuscles`, `secondaryMuscles`, `equipments`, `exerciseType`, plus instructions. Its filter vocabulary is richer than the open sets — `pectorals`, `trapezius` as distinct muscles rather than wger's 15 or Free Exercise DB's 17 — and v2 adds videos and multilingual names.

**It does not carry MET.** The strings `met`, `metValue`, `calorie` and `energy` appear nowhere in the 115,121-byte v1 OpenAPI specification (_measured_). The most commercially serious exercise dataset surveyed still has no energy figure, which is the strongest available evidence that §1's answer is a property of the domain and not of the free datasets' poverty.

The GitHub repository `ExerciseDB/exercisedb-api` is **AGPL-3.0**, but it contains the API _server_, not the data: a recursive listing of its `main` tree returns **zero `.json` or `.csv` files** (_measured_, via the GitHub trees API). Self-hosting the code gets you no exercises.

### 7.3 Other commercial sources, briefly

- **wrkout.xyz** — the upstream Free Exercise DB maintainer's paid successor, advertised in his own repository README: "If you are looking for a complete dataset with over 2,500+ exercises, 10,000+ images [...] which can be used in commerical projects". On [wrkout/exercises.json#305](https://github.com/wrkout/exercises.json/issues/305) he prices a full dataset export as "some pretty substantial one-off payment", and states the images "are created by myself using 3D software with skeleton & muscles models" — which, unlike the free repo's images, is a clean provenance claim. Same shape as ExerciseDB: no MET, and a commercial negotiation rather than a licence.
- **ExRx.net** — named in [yuhonas/free-exercise-db#13](https://github.com/yuhonas/free-exercise-db/issues/13) as a probable source of the scraped images. All rights reserved; no redistribution.
- **MuscleWiki** — no published licence and no official public API; the "APIs" in circulation are undocumented endpoints. Out on the same ground as the food work's rejected scrapes.

---

## 8. Other open candidates that surfaced

### 8.1 everkinetic/data

[github.com/everkinetic/data](https://github.com/everkinetic/data) — "Open data project based on http://everkinetic.com created by Greg Priday", **CC-BY-SA-4.0** (its `LICENSE.md` is the full CC BY-SA 4.0 text; GitHub detects `"spdx_id": "CC-BY-SA-4.0"`). **293 exercises** (_measured_ from `exercises.json`, 396,095 bytes). Fields: `id`, `id_num`, `id_hex`, `name`, `title`, `url`, `primer`, `type` (compound/isolation), `primary`, `secondary`, `equipment`, `images`, `img`, `steps`, `tips`. No MET, no `met`/`calorie` key (_measured_).

It is a smaller, share-alike-encumbered Free Exercise DB with the same shape and a third of the rows. Its only distinguishing field is `primer` — a one-line plain-English summary (`"This is an exercise for the chest."`) of the kind a search result row wants. Not a candidate on its own; worth knowing it exists because its `type`/`primary`/`secondary`/`equipment` vocabulary is close enough to Free Exercise DB's to be a cross-check on a disputed row.

### 8.2 What is not out there

A deliberate negative result, because "we looked" is part of the finding. Searching GitHub for exercise datasets above 200 stars returns **exactly one repository**: `yuhonas/free-exercise-db` (_measured_, via the GitHub search API). Searches for a Compendium-derived dataset return only single-digit-star personal projects (`michael-m-2983/metbrowser`, "Viewer for activity data and MET values from the 2011 Compendium"; `brazoramonk-arch/compendium-of-physical-activities`) — nobody maintains a canonical machine-readable Compendium, which is why §3.2's ingestion is a scrape.

Also checked and not pursued, with the reason:

- **The Youth Compendium of Physical Activities** (Butte et al., 2018) — a separate corpus for ages 6–18. Out of scope for an adult app, and the 2024 family already supplies an Older Adult edition should age-banding ever matter.
- **Apple HealthKit `HKWorkoutActivityType` and Google Health Connect's exercise types** — enumerations of ~80 activity kinds with no MET, no muscles, and platform licences. They are also device-integration vocabularies, which map #441 rules out of scope entirely.
- **The 2011 Compendium** — superseded by 2024, which the authors present as replacing it. Relevant only because most third-party MET tables floating around the web are 2011-derived, so a corpus claiming MET values should be checked against 2024 before being trusted.

---

## 9. Question 5 in full: what a join would actually cost

§1 states the answer; this is the measurement behind it, because the choosing ticket's real question is not "is it a join" but "what kind of join, and is it maintainable".

### 9.1 A name join is not available

Measured by exact substring match of every published name against the whole Compendium description corpus:

- **14 of Free Exercise DB's 876 names (1.6%)** appear verbatim anywhere in the Compendium's 1,113 descriptions. They are, in full: `Battling Ropes`, `Bicycling`, `Bicycling, Stationary`, `Butterfly`, `Clean`, `Crunches`, `Elliptical Trainer`, `Mountain Climbers`, `Plank`, `Pushups`, `Rope Jumping`, `Rowing, Stationary`, `Skating`, `Walking, Treadmill`. Note that `Butterfly` matches the Compendium's _swimming stroke_ and `Clean` matches `Cleaning` — so the true count is lower than 14.
- **21 of wger's 865 names (2.4%)** likewise.
- Going the other way, **178 of 1,096 Compendium rows (16%)** have a head phrase that appears somewhere in a Free Exercise DB name — and that number is inflated by generic heads like `Walking` and `Running`.

The vocabularies barely intersect: of the **528 distinct word types** in Free Exercise DB's names, only **163 occur anywhere in the Compendium's descriptions** — **365 do not** (_measured_). The missing words are the entire language of the gym: `barbell`, `bicep`, `bodyweight`, `bosu`, `adductor`, `anterior`, `bent`, `bound`, `box`, `bands`.

So: no fuzzy matcher, no embedding, no ranking key rescues this. The two corpora are not two descriptions of one thing; they are descriptions of two different things that happen to share a domain.

### 9.2 The join that _is_ available is a hand-made table of about seven rows

What the two corpora actually share is a **category**, not a name. Free Exercise DB's seven categories map onto a handful of Compendium Conditioning Exercise rows, and that mapping is small enough to write by hand and review:

| Free Exercise DB `category` | Rows | Plausible Compendium row                                                                                                             | MET     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| strength                    | 584  | `02054 Resistance (weight) training, multiple exercises, 8-15 reps at varied resistance`                                             | 3.5     |
| stretching                  | 123  | `02101 Stretching, mild`                                                                                                             | 2.3     |
| plyometrics                 | 61   | nothing exact; nearest is `02214 High intensity interval exercise, burpees, mountain climbers, squat jumps, Tabata, vigorous effort` | 11.0    |
| powerlifting                | 38   | `02050 Resistance (weight lifting ...), power lifting or body building, vigorous effort`                                             | 6.0     |
| olympic weightlifting       | 35   | **nothing** (_measured_ — no Compendium row contains "olympic weightlifting")                                                        | —       |
| strongman                   | 21   | **nothing** (_measured_)                                                                                                             | —       |
| cardio                      | 14   | row-by-row; these are the 14 that genuinely have Compendium counterparts                                                             | various |

That is the honest shape of the join: **a seven-line lookup, two of whose lines have no answer**, plus fourteen hand-made cardio pairs. It is not a data-engineering problem. It is a small editorial artefact, and its weakness is that 584 strength rows — two thirds of the corpus — would all carry the same 3.5 MET, so a Movement's energy would vary only with duration and bodyweight, never with what you actually lifted.

The Compendium's own licence bears on this directly. "Please do not change MET values or combine activities with different MET levels" (§3.1) permits _assigning_ 02054's 3.5 to a bench press row, since nothing is altered or combined, but it forbids the obvious next step of blending 02050 and 02054 into something in between.

### 9.3 The three shapes the choosing ticket is picking between

1. **Compendium only.** MET on every row by construction, licence answer clean, ingestion is a scrape of 22 HTML pages, attribution is one line. Costs: no anatomy ever; `bench press` is not findable; 516 of 1,113 rows are the out-of-scope "all physical activity" widening; the dose shape is ours to author and is duration for everything.
2. **Gym corpus only, with MET authored by us.** Findable names, real anatomy, a push/pull/static axis, a clean Unlicense (Free Exercise DB) or a share-alike problem (wger). Costs: **we become the author of a health measurement**, which is a materially different provenance claim from every other number in this app — `twin/raw_provenance` exists precisely so a value can be traced to a measurement. The map's item 6 says MET is the floor; hand-assigning it does clear that floor, but with our name on it.
3. **Both, joined by category.** Anatomy from the gym corpus, MET traced to the Compendium, the join a reviewable seven-line table. Costs: two provenance stories in one row, two licences to discharge, two update cadences, and the 3.5-for-everything flattening above.

Nothing here decides between them. What is now measured is that shape 3 is **cheap** — a seven-line table, not an 876-row reconciliation — which was the thing question 5 was asked to find out.

---

## 10. The whole survey in one table

|                               | 2024 Adult Compendium                                     | wger                                      | Free Exercise DB                          | everkinetic               | ExerciseDB / AscendAPI              |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------- | ----------------------------------- |
| **Rows**                      | 1,113                                                     | 865                                       | 876                                       | 293                       | 2,000 (v1) / 11,000 (v2)            |
| **Licence**                   | "free to use for commercial purposes" (web page, no SPDX) | CC-BY-SA 4 ×712, CC-BY-SA 3 ×132, CC0 ×21 | Unlicense (text); images unlicensed       | CC-BY-SA-4.0              | proprietary; caching plan-gated     |
| **Bundleable?**               | Yes, with citation                                        | Only under share-alike                    | **Yes, unconditionally** (text only)      | Only under share-alike    | **No, by the vendor's own policy**  |
| **Attribution burden**        | one line + 4 citations                                    | 242 named authors; 90 rows unattributable | none                                      | project + author          | n/a                                 |
| **Bytes (trimmed, gzip)**     | <25 KiB (est.)                                            | 33,524 (_measured_)                       | 19,062 (_measured_)                       | —                         | n/a                                 |
| **Format**                    | PDF + HTML tables; Excel by email                         | paginated REST JSON, CORS `*`             | versioned JSON + JSON Schema in git       | JSON in git               | REST JSON, key required             |
| **MET**                       | **every row**                                             | none (no field)                           | none (no field)                           | none                      | none (absent from the OpenAPI spec) |
| **Muscles**                   | none                                                      | 724/865, 15-value vocab                   | **876/876, 17-value vocab**               | 293, single primary       | yes, finer vocab                    |
| **Equipment**                 | free text only                                            | 673/865, 12 values                        | 799/876, 12 values                        | yes                       | yes                                 |
| **Movement pattern**          | none                                                      | `variation_group` id only                 | **`force` push/pull/static + `mechanic`** | `type` compound/isolation | none                                |
| **Dose shape**                | none (MET implies duration)                               | none                                      | none (typed upstream, 0 rows)             | none                      | none                                |
| **Names findable?**           | readable, but the row often does not exist                | yes; crowdsourced inconsistency           | yes; no stable head grammar               | yes                       | yes                                 |
| **Covers lifts**              | 6 rows                                                    | 865                                       | 876                                       | 293                       | thousands                           |
| **Covers runs/swims/classes** | **597 rows**                                              | thin                                      | 14 cardio rows, 0 swimming, 0 yoga        | thin                      | thin                                |

---

## 11. Gaps in this survey, stated rather than dropped

1. **The Compendium in Excel was not obtained.** It exists — "To request a copy of the compendium in Excel format, please email us or complete the form below" — but it is gated behind an email to `compendiumpa@gmail.com`. Every Compendium figure here is _measured_ from the published PDF instead. Asking for the Excel is a sensible first act of the ingestion arc, not of this survey.
2. **The Compendium's row count is 1,113 or 1,114.** The PDF yields 1,113 distinct codes (_measured_); the paper's own highlight says 1114 (_read_). Unreconciled.
3. **ExerciseDB/AscendAPI's Terms of Use could not be retrieved.** Three attempts, all blocked by a Vercel bot check (403/429); `ascendapi.com/terms` serves the landing page. The verdict in §7.1 rests on the vendor's published _caching_ policy and its key requirement, both of which were retrieved, and not on the ToS.
4. **No licence _review_ has happened, only licence _reading_.** Whether a user's ledger rows derived from a CC BY-SA corpus constitute an "Adapted Database" is a question this note deliberately does not answer — it records that the question exists and that #108 chose to avoid it entirely.
5. **Row quality was measured structurally, never against a scale.** Nothing here checks whether Free Exercise DB's `primaryMuscles` are _right_ beyond the cardio rows, where they are visibly wrong (§6.4). A sampled accuracy check against a textbook is a job for the ingestion arc, and it is the exercise counterpart of the USDA corpus measurements ([#130](130-reference-food-ranking-and-recall.md), [#143](143-canonical-record-measure.md)).
6. **The corpora were read on one day.** wger's API is live and unversioned, so its counts move. Free Exercise DB and everkinetic are git-addressable and can be pinned; the Compendium is frozen at the 2024 edition.
