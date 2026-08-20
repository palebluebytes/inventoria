# ADR 0048: An absent nutrient measurement is not a zero — unloggable USDA records leave the corpus, and no source may log an energy it never measured

**Status:** Accepted  
**Date:** 2026-08-20

This record amends [ADR-0045](0045-usda-stays-the-base-food-composition-authority.md)
§2 and §3, whose merge is closed to any pairing but `ndbNumber` and whose
present-under-any-id rule gains a constraint on adding ids, [ADR-0042](0042-usda-search-reference-foods.md) §3 and
[ADR-0047](0047-bundle-the-usda-archives-and-retire-the-api.md) §4, whose filter roster
gains two members, and [ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)
§1, whose admission bar is restated in terms of what search can offer rather than what a
table technically holds.

## Context

Staging `Oil, olive, extra virgin` and logging any amount of it adds **0 kcal** to the
day. So does watermelon, rutabaga, leeks and seven other everyday raw foods. The food
stages, the card renders, the Log button works, and the number that lands in the ledger
is zero. [#126](https://github.com/palebluebytes/inventoria/issues/126) reported it and
measured the population; this record settles what to do about it.

The mechanism is one line. `Oil, olive, extra virgin` is Foundation 748608 and carries no
energy id at all — no 1008, no 2047, no 2048 — so `mapFdcFoodToPayload` emits a panel
with no `calories`, `macrosFromNutrition` defaults it to `0`, and scaling zero by any
gram amount stays zero. **30 of the 4,491 committed rows carry no energy**, every one of
them Foundation.

### The distinction the code loses

A separate **nine** rows carry a _measured_ `0`: tap, well and municipal water, iodized
salt, decaffeinated coffee, decaffeinated green tea, hibiscus tea, a calorie-free sports
drink and a dry seasoning mix. Those rows are correct, and they are not the bug.

The artifact already tells the two apart — a measured zero has `"calories": 0` and an
unmeasured one has no key, `Oil, olive, extra virgin` being literally `"macros": {}`. It
is `macrosFromNutrition` (`src/lib/food/nutrition.ts`) that destroys the distinction, with
`info?.calories ?? 0`. Every ruling below follows from restoring it, which is why #126's
own acceptance criterion — "produces a panel that logs a non-zero energy" — is not the
invariant this record locks. That criterion would ban tap water.

### The population, and why it is three groups

| count | what they are                                                                                                                                                                                                                                                        | what they carry                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 3     | `Oil, olive, extra virgin`, `Oil, olive, extra light`, `Oil, sunflower`                                                                                                                                                                                              | no energy, no protein, no carbohydrate; fat only under `1085` |
| 17    | `Beans, Dry, … (0% moisture)`                                                                                                                                                                                                                                        | protein and fat; no carbohydrate, no energy                   |
| 10    | `Watermelon, seedless, flesh only, raw`, `Rutabaga, peeled, raw`, `Leeks…`, `Shallots…`, `Tomatillos, dehusked, raw`, `Cabbage, napa, leaf, destemmed, raw`, `Squash, spaghetti…`, `Squash, pie pumpkin…`, `Green onion, (scallion)…`, `Pawpaw, peeled, seeded, raw` | protein only                                                  |

This is not a regression from the bundle. `mapFdcFoodToPayload` has always emitted an
empty panel for such a record and the live API would have done the same. What ADR-0047
changed is that these records became reliably reachable and ranked rather than buried in
an API page.

### It is not a rare row a user might stumble onto

Ranked against the committed index through `searchIndexRows`, the calorie-less record is
the **first result** for `rutabaga`, `napa cabbage`, `green onion`, `pawpaw`,
`extra virgin olive oil` and `beans dry` — six of twelve probes — and the second, directly
beneath the complete record, for `watermelon`, `shallots`, `leeks`, `tomatillos`,
`spaghetti squash` and `olive oil`. Whatever this record decides, it is deciding what the
user sees at the top of the list.

### Alternatives that were genuinely live

**Derive the energy from the macros.** USDA itself derives energy as macros × Atwater
factors, and research note [121](../research/121-usda-energy-derivation.md) documents
that. Computing it needs the macros. Of the 42 energy-less Foundation records in the
archive, **zero** carry water, ash, protein and fat together, so carbohydrate-by-difference
is not computable for any of them. `Watermelon, seedless, flesh only, raw` carries water
90.9 g, ash 0.265 g, protein 0.871 g and sugars 7.2 g, and **no fat value at all** —
deriving would mean treating an absent fat as zero, which is the bug being fixed.

**Derive the oils' energy from fat alone.** For a pure oil this looks safe: no water, no
protein, no carbohydrate, so 9 × fat should be the whole of it. It is checkable, because
five sibling oils carry the same NLEA fat measurement _and_ have an SR Legacy twin that
supplies the accepted answer:

| oil              | `1085` fat | 9 × fat | USDA's own value |
| ---------------- | ---------- | ------- | ---------------- |
| `Oil, canola`    | 94.5       | 851     | **884**          |
| `Oil, corn`      | 94.0       | 846     | **900**          |
| `Oil, soybean`   | 94.6       | 851     | **884**          |
| `Oil, peanut`    | 93.4       | 841     | **884**          |
| `Oil, safflower` | 93.2       | 839     | **884**          |

Four to six per cent low, five times out of five. Scaling the assay up to 100 g of fat
reproduces 884, but only by assuming the answer. Ruled out on measurement.

**Widen the ADR-0045 §2 twin merge beyond `ndbNumber`,** so
`Watermelon, seedless, flesh only, raw` borrows from `Watermelon, raw` — a complete
record already sitting in the corpus. Ruled out because USDA minted **new** NDB numbers
for these records: the produce is 100382–100387, the oils 100258 and 100262, and
`Oil, olive, extra virgin`'s 4063 matches no SR Legacy record. Pawpaw is absent from all
7,793 SR Legacy records. Pairing them means overriding an identity distinction USDA made
deliberately, by description similarity, inside a merge whose failure mode is silently
attributing one food's calories to another.

**Widen the fat id list to include `1085 Total fat (NLEA)`,** so the three oils at least
carry their own record's fat. Ruled out on measurement, and the reasoning became §2: the
widening helps no record in the corpus and rounds five correct oils down, because
ADR-0045 §3's present-under-any-id rule governs the twin merge as well as the mapper.

**Refuse to stage and leave the corpus alone.** Honest, and it needs no regeneration. But
the ranking measurement above makes it a dead end at the _top_ of the result list for six
of twelve foods, with the working record one line below. It is the right backstop and the
wrong plan.

### `(0% moisture)` is a laboratory basis, not dried beans

The seventeen `Beans, Dry, …` records read as a food anyone would want offered. They are
not. Water is literally `0 g`: these are bone-dry assays, expressed per 100 g of dry
matter, and USDA publishes them to compare cultivars. Rescaling the as-sold SR Legacy
records to a zero-water basis reproduces them:

| dry-basis record                            | protein / fat | as-sold record rescaled to 0% water                                |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `Beans, Dry, Black (0% moisture)`           | 24.4 / 1.45   | `Beans, black, mature seeds, raw`, 11.0% water → 24.3 / 1.60       |
| `Beans, Dry, Pinto (0% moisture)`           | 23.7 / 1.24   | `Beans, pinto, mature seeds, raw`, 11.3% water → 24.1 / 1.39       |
| `Beans, Dry, Navy (0% moisture)`            | 24.1 / 1.51   | `Beans, navy, mature seeds, raw`, 12.1% water → 25.4 / 1.71        |
| `Beans, Dry, Dark Red Kidney (0% moisture)` | 25.9 / 1.31   | `Beans, kidney, red, mature seeds, raw`, 11.8% water → 25.5 / 1.20 |

Dried beans as sold are already offered, with complete panels: the corpus holds **38**
`… mature seeds, raw` rows — black 341, pinto 347, navy 337, red kidney 337, great
northern 339, cranberry 335, pink 343, small white 336, black turtle 339, adzuki 329,
and more. Keeping the dry-basis records would not add a food; it would add a wrong one.
Logging 100 g of dried black beans against a record that insists it contains no water
overstates every nutrient by about twelve per cent, and today reports zero calories.

**Scope.** This record governs base foods sourced from USDA's bundled corpus, and the one
runtime rule that applies to every source of a nutrition panel. It does not change
ranking, does not touch the barcode path or manual entry, does not admit a second
composition table, and does not curate any replacement for a food it drops.

## Decision

### 1. An absent measurement is not a zero, and the code must be able to say which it has

A nutrition panel that omits a field is silent about that field. A panel that carries `0`
is asserting a measurement. These are different facts and no layer may collapse one into
the other before the collapse has been decided on purpose.

The invariant this record locks over the corpus is therefore **presence**, not
non-zero: every row carries a `calories` value, and that value may legitimately be `0`.
Tap water is not a defect.

`macrosFromNutrition` keeps its `?? 0`. It is the display and arithmetic path, where a
default of zero is correct and where every consumer already expects a number. The
distinction lives one level up, in the panel, where it already exists.

### 2. A panel field's id list is closed unless widening it survives the merge's presence test — fat stays `1004`

ADR-0045 §3 rules that a panel field carried by more than one FDC nutrient id counts as
present under **any** of them. That rule does two jobs at once: it decides which id the
mapper reads, and it decides whether `fillFromTwin` considers the field already filled.
An id added for the first job silently changes the second.

So a new id is never added to `PANEL_FIELDS` or `MASS_NUTRIENTS` on the strength of
records that lack the field entirely. It must first be checked against the records that
_have_ it, and specifically against what the twin would otherwise have supplied.

**Fat therefore stays `[1004]`, and `1085 Total fat (NLEA)` is not adopted.** The case
for adopting it looked strong: eight Foundation records report only `1085`, among them
the three energy-less oils, so widening the list would give them their own record's fat.
Measured, it gives nothing and costs five records.

| oil              | Foundation `1004` | Foundation `1085` | twin `1004` | fat today | fat if `1085` were adopted |
| ---------------- | ----------------- | ----------------- | ----------- | --------- | -------------------------- |
| `Oil, canola`    | absent            | 94.5              | 100         | 100       | **94.5**                   |
| `Oil, corn`      | absent            | 94.0              | 100         | 100       | **94.0**                   |
| `Oil, soybean`   | absent            | 94.6              | 100         | 100       | **94.6**                   |
| `Oil, peanut`    | absent            | 93.4              | 100         | 100       | **93.4**                   |
| `Oil, safflower` | absent            | 93.2              | 100         | 100       | **93.2**                   |

These five carry `1085` and have an SR Legacy twin. Adopting `1085` makes
`hasPanelField` return true for them, so they stop borrowing the twin's `1004 = 100`.
Their energy still comes from the twin, because the Foundation record has none — leaving
a panel that claims 884 kcal from 94.5 g of fat, with about 5% of the oil being neither
fat nor anything else the panel names.

The benefit, meanwhile, is void: the three oils the widening was for are dropped by §5,
which runs on energy and not on fat. And **no row in the corpus carries an energy value
without a fat value**, before or after that drop, so there is no record anywhere that the
widening improves.

The general rule is what survives this. The specific finding — that `1085` and `1004`
also disagree by a median of 11% and by as much as 79% (`Broccoli, raw`, 0.34 against
0.07) where both are present — is a second reason not to treat them as one measurement,
and would matter if the presence-test problem were ever solved.

### 3. Energy is never derived

No panel's energy is ever computed from other fields — not by Atwater factors, not from
fat alone, not by rescaling an assay to an assumed dry or wet basis. Energy is reported
by the source or it is absent.

This closes the question rather than deferring it. The Context measures both live routes:
Atwater is not computable over any record that needs it, and the one derivation that
looked safe is wrong by 4–6% against USDA's own answer on all five records where the
answer can be checked.

### 4. The twin merge pairs on `ndbNumber` and on nothing else

ADR-0045 §2's merge continues to collect Foundation and SR Legacy records under
`ndbNumber` (falling back to the description, per the existing key). It is never widened
to description similarity, fuzzy matching, or a hand-curated pairing list.

The reason is not that fuzzy matching is difficult. It is that a new NDB number is USDA
stating that a record is a new food identity, and `Watermelon, seedless, flesh only, raw`
(100383) is not `Watermelon, raw` (9326) by USDA's own account. A merge that overrides
that attributes one food's composition to another, silently, in the direction the reader
is least able to check.

### 5. Two filters join the generation-time roster, after the merge

ADR-0047 §4 filters the corpus once at generation, running ADR-0042's brand, packaged and
prepared predicates over each merged identity. Two more join them, each with its own
casualty tally:

- **A dry-basis record is not a food.** A record describing a basis nobody eats — USDA
  marks these `(0% moisture)` — is dropped. This is a food-kind judgement of the same
  species as the prepared and composite filters beside it, and it holds whether or not
  the record ever gains an energy value. It drops **17** rows.
- **A record with no energy cannot be logged.** A merged record that reports no energy
  under any of `ENERGY_IDS` is dropped, because the app has no honest thing to do with
  it. It drops the remaining **13**.

Both run in `buildCorpus`, **after** `resolveFdcGroup`. The position is load-bearing:
filtering before the merge would drop five oils that their SR Legacy twin rescues.

The corpus goes from **4,491 to 4,461** rows. §4's tally becomes five numbers, not three.

### 6. One predicate decides both, and it must not fork

"This panel reports no energy" is one question with two askers: the generator, deciding
whether a row ships, and the food card, deciding whether a log is honest. It is expressed
**once**, in the app, and imported by `scripts/usda-bundle.mjs` alongside the ADR-0042
filters it already imports rather than copies.

Where the corpus cannot reach — an Open Food Facts record, a curated stand-in, a label
capture, or a corpus row that a future mirror refresh admits — the card **refuses the
log** and says the record carries no energy data. It does not warn and log anyway, and it
does not prompt for the missing number: a food this app cannot source already has a route,
which is manual entry (ADR-0035).

This clause constrains the implementation, because the two call sites do not hold the same
shape. `buildCorpus` holds an `FdcFood`; the card holds a `NutritionInfo`. Whichever way
that is bridged, **the two must not become two predicates that can disagree** — that is
precisely the drift ADR-0047 §4's import-don't-copy rule exists to prevent, and it would
be silent if it happened.

### 7. A food dropped for want of a usable record is eligible for curation

ADR-0046 §1 admits a curated stand-in for "a base food no reference table carries". Read
literally, that excludes a food USDA holds but did not measure — which is exactly the case
§5 creates. The bar is restated in terms of what search can offer: **a food for which no
reference table yields a record this app can honestly log** is eligible, whether the table
is silent or merely incomplete.

ADR-0046's evidential bar in §2 is unchanged and still governs admission, and ADR-0045 §5
is untouched: a curated stand-in is one vetted record adopted whole, never a value
borrowed to patch a USDA panel. Eligibility is not admission. Nothing is curated by this
record.

## Consequences

- **The silent zero is gone in both directions.** No corpus row can produce it, and no
  other source can log it. The failure that remains is visible: a card that says it has no
  energy data and declines.
- **Two foods lose their record, and this is the measured cost of §5.**
  `Pawpaw, peeled, seeded, raw` leaves the corpus entirely and has no alternative anywhere
  — not in the corpus, not in the 7,793 SR Legacy records — so searching pawpaw now gives
  the ADR-0047 §10 "not covered" verdict. Raw napa cabbage leaves only
  `Cabbage, napa, cooked`, a different preparation. Both become eligible under §7 and
  neither is curated here.
- **One search gets worse before it gets better.** With the calorie-less record gone,
  `green onion` returns `Onions, young green, tops only` ahead of
  `Onions, spring or scallions (includes tops and bulb), raw`, because the better record's
  description does not contain the word "green". The ranking was always doing this and the
  empty record was hiding it.
  [#130](https://github.com/palebluebytes/inventoria/issues/130) measures the class before
  anything is built for it, rather than fitting a synonym list to the one example this
  record happened to expose.
- **Nine cultivar names go with the dry-basis records** — Flor de Mayo, Carioca, Medium
  Red, Brown, Tan, Light Tan, Small Red, Light Red Kidney, Dark Red Kidney. USDA carries
  those cultivars on a dry basis only, so there is no version of keeping them that yields a
  loggable food; the common varieties they belong to are all in the corpus already.
- **§5 costs a regeneration to revisit, like every filter since ADR-0047 §4.** The
  amendment to that section makes the cost symmetric in both directions, and it applies
  here unchanged: loosening either new filter changes nothing until the artifact is rebuilt.
- **Three oils leave the corpus carrying a fat measurement nobody reads.**
  `Oil, olive, extra virgin`, `Oil, olive, extra light` and `Oil, sunflower` report
  `1085` and no energy, so §5 drops them and §2 declines to read the fat they do have.
  That is the honest outcome — a fat number with no energy beside it is not a loggable
  food — but it is the one place this record leaves real data on the floor.
- **§2 closes a door that looked open.** Adding an id to a panel field is no longer a
  local change to what the mapper reads; it is a change to the twin merge, and the two
  have to be weighed together. That is a real constraint on future work and it is meant
  to be.
- **The runtime guard is mostly dormant on the day it lands**, because §5 empties the case
  it was written for. That is the point: it is the part of this record that is still true
  after the next mirror refresh, and the corpus filters are not.
- **`ENERGY_IDS` becomes load-bearing in a second place.** It already decides what counts
  as energy for the twin merge; it now also decides what ships. A future id joining it
  changes the corpus, not just a panel.
- **Nothing is migrated.** Ledger entries already written against a calorie-less food keep
  their zero. There are none in any corpus this project has shipped that could be
  distinguished from a genuine zero after the fact, and inventing a value for them would
  violate §3.
