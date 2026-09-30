# Research: an `added_sugar_content` key, and what would supply it (#558)

**Grounds:** the two USDA archives themselves — `FoodData_Central_foundation_food_json_2026-04-30.zip` and `FoodData_Central_sr_legacy_food_json_2018-04.zip`, the two `generated_from` entries both nutrient stores pin by sha256 — extracted and parsed whole, not read through the corpus that survives them. Plus both shipped artifacts (`public/usda/nutrient-store.json`, `public/usda/pairing-nutrient-store.json`), the OFF adapter's own source, and `tests/unit/support/fixtures/off-nutella.json`, the one captured real OFF response this repo commits. Nothing was regenerated; `public/usda/` is untouched.
**Siblings:** [#558](https://github.com/palebluebytes/inventoria/issues/558) is this note's ticket. The effort it prices is ADR-0032's third deferred follow-up, in ADR-0030 territory; the cap criterion it is tested against is ADR-0032's Amendment of 2026-09-30 ([#506](https://github.com/palebluebytes/inventoria/issues/506)). [#495](https://github.com/palebluebytes/inventoria/issues/495) owns which limit silences are real.
**Date:** 2026-09-30. **Status:** measured. The USDA archives are 210 MB and are not committed; they live in `.usda-backup/` and are digest-pinned, so this is reproducible from the pins rather than from a file in the tree.

---

## 0. The question, and why the data half answers it first

ADR-0032 deferred "an `added_sugar_content` key and its 50 g FDA limit, a data-first
twin-expansion effort … into which this stay-under machinery extends by one key". #506's
Amendment then removed the cap that sentence assumed: the criterion asks the WHO, the WHO
caps _free_ sugars, and the borrow clause refuses a neighbouring quantity. #558 recorded
that and left the effort holding a question — **what source a per-day added-sugar cap
would stand on** — offering three unranked shapes: argue a fallback clause, argue free
sugars and added sugars are one quantity, or ship the key with no cap.

All three are arguments about authority. None of them is reachable until a prior question
is settled, and it is the one ADR-0032 called the effort's first half: **can either source
this app ingests supply the number at all?** The answer turns out to decide the cap
question without the authority question needing to be answered.

## 1. USDA publishes no added-sugars number for anything this app ingests

Nutrient **1235 "Sugars, added"** is absent from both archives entirely — not merely from
the corpus that survives the ingest rules:

| archive                     | foods | distinct nutrient ids | 1235 | sugar-named nutrients present             |
| --------------------------- | ----: | --------------------: | :--: | ----------------------------------------- |
| Foundation Foods 2026-04-30 |   363 |                   228 |  no  | 1063 `Sugars, Total`, 2000 `Total Sugars` |
| SR Legacy 2018-04           | 7,793 |                   149 |  no  | 2000 `Total Sugars`                       |
| **union of both**           | 8,156 |               **247** |  no  | 1063, 2000 — both **total**               |

The shipped artifacts agree, as they must: **0 of 2,023** foods in `nutrient-store.json`
carry 1235, across a 241-id dictionary, and **0 of 1,035** in `pairing-nutrient-store.json`
across 170. Either measurement alone would have been enough, because
`scripts/usda-artifacts.mjs`'s `buildNutrientEntry` applies **no** nutrient filter — its
docblock says so in terms ("No coverage gate (ADR-0047 §5) — sparse columns compress to
almost nothing") and `collectNutrientDictionary` records every distinct id it ever sees.
Reading the archives directly removes even that inference.

1235 is a **Branded Foods** nutrient — a label-transcription field — and Branded is not one
of the ingested datasets; `generated_from` names Foundation and SR Legacy and nothing else.
So this is not a coverage gap that a newer release or a wider corpus would close. It is a
dataset boundary.

**USDA separates foods by the thing it does not measure.** Ten archive descriptions turn on
added sugar as an identity — `Plums, dried (prunes), stewed, with added sugar` against
`… without added sugar`, and the same pair for apples, apricots, peaches and pears — while
publishing no field to say how much. All ten are `stewed` forms, so all ten are dropped by
ADR-0103/0104's cooked-form rules: **0 of the 2,023 shipped rows** even carry the phrase in
a name. Not one bit of added-sugar information reaches this app from USDA, in a number or
in a word.

## 2. OFF publishes it, and this app already stores it — unread

`tests/unit/support/fixtures/off-nutella.json` is a captured real OFF v3 response, and it
carries the field with a value:

```json
"added-sugars": 52.13,
"added-sugars_100g": 52.13,
"added-sugars_unit": "g",
"added-sugars_value": 52.13,
```

It never reaches the panel. `OFFNutriments` (`src/lib/food/open-food-facts.ts:67`) is a
closed, hand-written whitelist of **24** keys — `energy-kcal_100g`, `proteins_100g`,
`fat_100g`, `carbohydrates_100g`, `fiber_100g`, `sugars_100g`, `sodium_100g`,
`saturated-fat_100g`, `trans-fat_100g`, `cholesterol_100g`, the two fat fractions, and the
twelve micronutrients — with no added-sugars member; and `mapOffProductToPayload` is a
hand-enumerated `set()` sequence rather than an iteration, so an unlisted nutriment is
unreachable by construction. `sugars_100g` → `sugar_content` is the only sugar line. The
write-back direction is symmetric: `NUTRIMENT_IDS` maps `sugar_content` → `sugars` and has
no added-sugars entry.

But it is **not discarded**. The mapper keeps the untouched response as `provenance/raw`,
for exactly this:

> Keep the untouched OFF response as immutable Provenance so nutriments beyond the eight
> panel fields can be backfilled later with no network re-fetch (ADR-0016).

So on the barcode arm the data half is **already done, retroactively**. Coining the key
costs a whitelist entry, one `set()` line, an `ADAPTER_VERSION` bump, a
`docs/eavt-vocabulary.md` row — and a backfill that reads the ledger the user already has,
with no network and no re-scan. Every OFF product ever scanned on a device is already
holding its added-sugars figure.

**Coverage across OFF is unmeasured, and cannot be measured from this repo.** One product
carrying the field is existence, not coverage. The 11,521-row delta-dump corpus (#459,
cited in ADR-0052) was queried for `serving_size` fields only, the dumps are not committed,
and there is no OFF ingestion harness under `scripts/`. Anyone who needs the coverage
figure must pull fresh deltas; nothing in the tree answers it.

## 3. Free sugars is unavailable from both, so the exact-fit key cannot be minted

The criterion demands a WHO ceiling for "the quantity the panel actually carries". There is
a key that would satisfy it with nothing invented, softened or borrowed — **mint
`free_sugar_content`**, the quantity the WHO caps by name, rather than bending an
added-sugars key toward a free-sugars ceiling. It is refused on data:

- **USDA:** of 247 distinct nutrient ids across both archives, the only sugar-named
  nutrients are 1063 and 2000, both **total** sugars. No free-sugars nutrient exists.
- **OFF:** the captured real payload carries `sugars` and `added-sugars` and nothing free.

Recorded here so it is not re-proposed as the clean way out. It is the shape that best fits
the criterion and the one the sources least support.

## 4. The asymmetry decides the cap, and the authority question never comes up

ADR-0032 §4 omits a limit the day carried none of, deliberately: "a 'bad' nutrient at zero
is ideal, not a gap — it must stay quiet". That rule cannot distinguish **none** from
**unknown**, and for added sugars the unknown would be systematic on one whole arm. A day
of home-cooked reference foods would carry no added-sugar figure at all, so the row would be
omitted, and the reader would see precisely what a genuinely sugar-free day looks like. The
rule would convert "we don't know" into "you're fine" — on the nutrient where a person is
least likely to guess right unaided.

**This hazard is not new, and honesty requires saying so.** Measured over the 2,023 shipped
rows:

| panel key               | rows carrying it | has a cap |
| ----------------------- | ---------------: | :-------: |
| `sodium_content`        |    1,944 (96.1%) |    yes    |
| `saturated_fat_content` |    1,774 (87.7%) |    yes    |
| `cholesterol_content`   |    1,786 (88.3%) | no (#506) |
| `sugar_content`         |    1,369 (67.7%) |    no     |
| `trans_fat_content`     |    1,014 (50.1%) |  **yes**  |
| `added_sugar_content`   |     **0 (0.0%)** |     —     |

**Trans fat already carries a cap on 50.1% coverage.** So "a capped nutrient the corpus is
often silent on" is the status quo, not a novelty added sugars would introduce, and #495
has already reasoned about lawful silence — ADR-0032 §6 notes its rule "now reaches one
lawfully-silent limit (trans fat) rather than two".

What makes added sugars different in kind rather than degree is that its figure is **0%, by
dataset boundary**, not sparse. Trans fat's silence is scattered and a reference food may
supply it; added sugars' silence is total and no reference food ever can. A cap is a
denominator, and this one could only ever be fed by barcode-scanned packaged food. A bar
that is either meaningful or blank depending on _how the user happened to record the food_
is measuring the logging method, not the diet.

And the machinery that exists for lawful silence does not reach it. `marked-panel.ts`
derives fillability by exclusion from the EU 1169/2011 mandatory declaration — "a panel
nutrient coined later arrives **fillable** unless `DECLARED_NUTRIENT_KEYS` names it" — and
added sugars is not in that declaration. So `added_sugar_content` would arrive borrowable
from a reference food, join #495's partition with nobody having adjudicated it, and be
permanently inert, because the arm it may borrow from is the arm that has nothing.

**So the cap question answers itself without an authority being chosen.** Every shape that
ends in a cap inherits a bar whose denominator the reference corpus cannot feed. The shape
that ends in no cap does not: with no cap the value falls to the modal's "Not tracked"
section as a plain number, shown when the day carried it and absent otherwise, claiming
nothing — which is exactly what cholesterol now does and what total sugar has always done.

## 5. What each shape is worth, after the measurement

| shape                                           | status after this measurement                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| argue a **fallback authority** (FDA's 50 g DRV) | Unnecessary, and the weakest ground it could be argued on. It would buy a cap the reference corpus can never feed, and re-admit the judgement #506 removed. |
| argue **free ≡ added** for this panel           | Unnecessary on the same grounds, and it asks the criterion to call two quantities one — the move the borrow clause exists to refuse.                        |
| mint **`free_sugar_content`** instead           | Refused on data (§3). Neither source publishes the quantity.                                                                                                |
| **ship the key with no cap**                    | Survives. Needs no new argument, matches cholesterol and total sugar, and is the only shape that does not create a bar the corpus cannot populate.          |
| **park the effort** until a source can feed it  | Also survives, and is the cheaper of the two. Coining the key is only worth its cost if a figure present on barcode-scanned food alone is worth showing.    |

The remaining choice is between the last two, and it is not about sugar or about
authorities: it is whether a panel figure that appears only for barcode-scanned food earns
a row. That is a design decision for whoever takes the effort, and this note deliberately
does not make it. What it does settle is that **no cap is owed either way**, so the effort
no longer needs to argue a source.

## 6. Three side findings

1. **Two files shipped the superseded premise.** `nutrient-display.ts`'s
   `HIDDEN_NUTRIENT_KEYS` docblock and `tests/unit/nutrient-display.test.ts`'s matching
   comment both still read "the only citable daily cap is the FDA _added_-sugars DV", while
   `nutrition-targets.ts` and `target-rationale.ts` on the same branch had already moved to
   the WHO/free-sugars reason. Same conclusion, contradictory reasons, and
   `nutrition-targets.ts`'s header names the display module as one that must move with it.
   Corrected in the change that adds this note.
2. **A coined key would arrive fillable, unadjudicated and inert** — §4's last paragraph.
   Whoever coins `added_sugar_content` should decide explicitly whether it belongs in
   `DECLARED_NUTRIENT_KEYS`, rather than letting the default decide.
3. **A committed count is off by one.** `collectNutrientDictionary`'s docblock records "all
   **246** ids are single-unit" measured over both archives on 2026-08-19. Parsing the same
   two digest-pinned archives today yields a union of **247** distinct nutrient ids. The
   archives cannot have changed — they are fixed by sha256 — so either the comment's count
   or its method differs by one. Nothing depends on the figure, but it is the kind of number
   that gets quoted later, so it is flagged rather than fixed here.
