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
