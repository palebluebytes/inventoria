# Research: when does a shared `ndbNumber` mean one food, and can anything but a hand adjudication tell? (#145)

**Grounds:** `fdcIdentityKey` / `resolveFdcGroup` / `twinSearchAliases` in `src/lib/food/usda-fdc.ts`, and `groupByIdentity` / `buildCorpus` in `scripts/usda-bundle.mjs`, measured over the two bundled archives (`FoodData_Central_foundation_food_json_2026-04-30`, `FoodData_Central_sr_legacy_food_json_2018-04`) and the committed `public/usda/search-index.json`. [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) §2 defines the merge; [ADR-0048](../adr/0048-an-absent-measurement-is-not-a-zero.md) §4 closes it to `ndbNumber`, which is the clause this note is measuring against.
**Siblings:** [#137](https://github.com/palebluebytes/inventoria/issues/137) produced the worklist and shipped the alias that made the fusion visible ([ADR-0050](../adr/0050-a-merged-food-keeps-the-name-its-twin-lost.md)); it also measured the mechanical rule refuted in §4. [#144](https://github.com/palebluebytes/inventoria/issues/144) owns the corpus filters a split loser must pass. Any change to the filter roster or to `ndbNumber` assignments re-runs this measurement.
**Date:** 2026-08-21. **Status:** pre-registration. §§1–4 are measured and dated; §§5–10 are written **before a single pair is adjudicated**, and no merge code has changed. The companion `145-twin-ledger.json` is committed alongside this note with all 190 `verdict`, `reason_code` and `note` fields `null`, so the commit history shows the population was fixed before a case was read.

---

## 1. Why this note exists before the ledger does

ADR-0048 §4 pins the twin merge to `ndbNumber` and forbids widening it to "description similarity, fuzzy matching, or a hand-curated pairing list". Its stated reason is true: a new NDB number is USDA declaring a new food identity, and overriding that would attribute one food's composition to another.

What §4 never addressed is its **converse**. `groupByIdentity` does not rely on "a new number means a new food"; it relies on "a _shared_ number means the _same_ food". USDA reuses numbers across Foundation and SR Legacy, and where it does, two different foods fuse and one of them leaves the corpus under the other's name.

Every remedy is a form of _look at the descriptions before trusting the number_, which is what §4 forbids. So the remedy needs a record, and the record needs evidence. This note pre-registers how that evidence will be gathered, for the reason [#130](https://github.com/palebluebytes/inventoria/issues/130) §3 gives and #143 restates: a measurement whose categories are chosen after the numbers arrive is a rationalisation. The risk here is sharper than usual, because the adjudication will be performed knowing which pairs #145's ticket already calls fusions.

## 2. The class, measured

Over the two bundled archives, 8,156 projected records collapse to 7,966 identity groups:

- **190 groups hold more than one record.** Every one holds exactly two. There is no group of three, and **no multi-record group is keyed by the `desc:` fallback** — all 190 are keyed by a shared `ndbNumber`, and all 190 pair one Foundation record with one SR Legacy record.
- **187 of the 190 fill at least one panel field** from the twin; 3 fill nothing and take only a name.
- **94 differ in name** as ranking reads them, after `stripArchiveBoilerplate`; 96 read alike.
- **165 merged rows survive the corpus filters and ship**; 25 are filtered out.
- **9 borrow `calories` outright** — the Foundation record measured no energy of its own.

### The three numbers in circulation are all the wrong denominator

| number  | what it actually counts              | where it came from                                        |
| ------- | ------------------------------------ | --------------------------------------------------------- |
| 78      | superseded                           | #137's grilling, before boilerplate was stripped properly |
| 87      | _survives_ **and** _differs in name_ | #137's implementation, and #145's ticket                  |
| 93/165  | ADR-0050's Context, one row stale    | #137                                                      |
| **190** | **every pair the grouping makes**    | this note                                                 |

87 is the right population for an **alias**, which only exists on a row that ships. It is the wrong population for a **merge decision**, which is taken at grouping time, before any filter has run. The 25 filtered pairs were fused before anyone asked whether they should ship, and §2.1 shows that is not academic.

### 2.1 One filtered pair hides a reference food

Of the 25 pairs whose merged row is filtered out, exactly **one** has a loser that passes every corpus filter on its own:

> `Orange juice, raw` (SR Legacy) is fused into Foundation's `Orange juice, no pulp, not fortified, not from concentrate, refrigerated`, and the merged row is dropped as a processed product.

Raw orange juice is not in the corpus, and no judgement was ever made about raw orange juice. It was removed by a filter reading a name that belongs to a different record. This is the ticket's harm in its purest form, and it is invisible from the 87.

### 2.2 What a split would cost, measured

**Nine surviving base rows report no energy of their own** and would be dropped by ADR-0048 §5 if their pair were split: `Salt, table, iodized`; `Oil, canola`, `Oil, corn`, `Oil, soybean`, `Oil, peanut`, `Oil, safflower`; `Butter, stick, unsalted`, `Butter, stick, salted`; `Blackberries, raw`.

Only pairs adjudicated `split` are exposed. Most of these look like renames on their face (`Oil, corn, industrial and retail, all purpose salad or cooking` → `Oil, corn`) and `Blackberries, raw` reads alike on both sides, so the exposure is expected to be small — but it is stated here as a number rather than discovered later, and §9 accepts it in advance.

## 3. What the ticket got right

The four confirmed fusions hold, and the panel contamination is measured rather than assumed:

| ndb   | ships as                                       | fused with                                      | fields the loser filled |
| ----- | ---------------------------------------------- | ----------------------------------------------- | ----------------------- |
| 9501  | `Apples, honeycrisp, with skin, raw` (60 kcal) | `Apples, raw, golden delicious, with skin` (57) | trans fat, vit A, vit E |
| 11243 | `Mushroom, portabella` (32.4)                  | `Mushrooms, portabella, grilled` (29)           | 10 fields, no macros    |
| 20140 | `Flour, spelt, whole grain` (364)              | `Spelt, uncooked`                               | 8 fields, no macros     |
| 2047  | `Salt, table, iodized` (0)                     | `Salt, table`                                   | **all 17**              |

In 80 of the 87 shipped-and-aliased pairs the borrowed fields are micronutrients and sub-fats; the headline macros are the Foundation record's own. The contamination is real and it is mostly not in the numbers a person reads first — which is an argument for judging on identity rather than on the panel delta, and §6 makes that explicit.

## 4. Two candidate remedies that are already dead

**A mechanical name rule.** #137 measured a state-word test — "do the two names differ by a preparation word?" — and it flags 33 of 87 while being wrong in both directions: it flags `Nuts, pecans` → `Nuts, pecans, halves, raw`, a harmless rename, and **misses the Honeycrisp case entirely**, because separating two cultivar names needs a cultivar vocabulary, not a word list. Refuted; not carried into the sweep.

**Widening the prepared-product filter.** An earlier reading of this ticket held that a split would admit `Mushrooms, portabella, grilled` as a filter escape, and that #145 should widen `PREPARED_DISH_MARKERS` to catch it. **That is refuted here and the direction is reversed.** Measured over the shipped 4,353 rows:

| marker        | rows it already touches |
| ------------- | ----------------------- |
| `cooked`      | 1,588                   |
| `roasted`     | 424                     |
| `boiled`      | 283                     |
| `braised`     | 243                     |
| `broiled`     | 201                     |
| **`grilled`** | **151**                 |

The 151 are essentially every beef, veal and lamb steak in the corpus, plus `Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, grilled` — and **`Mushrooms, portabella, exposed to ultraviolet light, grilled`, which already ships under its own `ndbNumber`**. Adding `grilled` to the markers would delete all 151.

ADR-0042 §5 has already ruled that a plain fried egg is a reference food like a scrambled one, and #143 §6 measured the harm of the alternative: a preparation word touches 40.3% of the corpus, and dry rice against cooked rice is a silent 3× calorie overestimate. A grilled portabella is a reference food by this corpus's own settled rule. **No marker is widened by this ticket**, and a split loser carrying a preparation word ships if it passes the roster as it stands.

## 5. What the adjudication may read

**The two descriptions, the shared `ndbNumber`, and the two archives.** Specifically permitted:

- the pair's descriptions, boilerplate stripped;
- `scientificName`, `foodCategory` and `foodPortions` on either record;
- **whether either archive holds a record for one of the pair under a _different_ `ndbNumber`** — §6's primary evidence, and the reason the archives and not just the shipped index are in scope.

Explicitly **not** evidence: the calorie delta, or any panel comparison. §3 shows why — Golden Delicious against Honeycrisp is 57 against 60, and grilled against raw portabella is 29 against 32.4. Judging on the delta would find almost nothing and would collapse this ticket into "record it and ship nothing", which is a conclusion the criterion must be capable of reaching honestly rather than by construction.

## 6. The verdict under test

Each of the 190 pairs gets one verdict from a closed set — `merge` or `split` — and one `reason_code` from a list **fixed here, before adjudication**. A category invented on pair 54 to accommodate pair 54 is the failure mode this pre-registration exists to catch.

### The evidence hierarchy, in order

1. **Does either archive hold one of the pair elsewhere under a different `ndbNumber`?** If yes, the reused number cannot mean "the same food": SR Legacy's raw portabella is 11265, so 11243's two records cannot both be it. → `split`, code `separate-ndb-elsewhere`.
2. **Do the names differ in a dimension USDA treats as identity-forming?** Cultivar, species, preparation state, milled form, or an added ingredient. → `split`, code `cultivar` · `species` · `preparation-state` · `milled-form` · `added-ingredient`.
3. **Substitutability, as tiebreak.** Would a person who wanted the lost food be content to have logged the survivor? → `merge` if yes.

### The `merge` codes

- `same-name` — the two descriptions read alike after stripping. Expected to take all 96 such pairs.
- `rename` — one food, USDA rewrote the description (`Nuts, pecans` → `Nuts, pecans, halves, raw`).
- `narrowing` — the survivor names the default instance of the same food (`Cabbage, raw` → `Cabbage, green, raw`).

### Doubt resolves to `split`

A pair the hierarchy cannot settle is written `split` with code `uncertain` and the doubt recorded in `note`. The two errors are not symmetric: a wrong `split` costs a near-duplicate row, which is visible and reversible; a wrong `merge` attributes one food's measurements to another under a name that is not its own, silently, which is the harm ADR-0048 §4 was written about. **This will push the split count above the estimate in §8.3, and it is registered here as expected rather than reported later as a surprise.**

## 7. Precision protocol

Per [#131](https://github.com/palebluebytes/inventoria/issues/131)'s grilling — an unmeasured guard is a hole, and a guard must ask the predicate rather than restate it:

1. Before a `separate-ndb-elsewhere` verdict is written, the third record is **named with its `ndbNumber` and `fdcId`** in `note`. A claim that USDA holds the food elsewhere is not accepted without the row.
2. Every `split` verdict records, in `note`, what the split costs: whether either record is then dropped by a filter or by ADR-0048 §5.
3. Two pairs carrying the same `reason_code` and opposite verdicts is a contradiction, and the ledger is grepped for it before the sweep closes.

## 8. Pre-registration

### 8.1 The population

**All 190 pairs**, committed as `145-twin-ledger.json` with every verdict `null`. Not the 87, and not the 165 that ship.

The 96 `names_read_alike` pairs are included rather than exempted. The exemption would be sound in principle — two records USDA gave the same description are not two foods — but it would be granted by `twinSearchAliases`'s word-reading, inside an instrument whose whole purpose is not to trust a mechanical judgement about names. Ninety-six lines of `merge` / `same-name` is a cheap price for a census with no hole, and it means a refresh that renames one of them into a differing pair fails the check rather than sliding from unexamined to unexamined.

The 25 filtered pairs are included for the reason §2.1 measures: the merge is decided before the filters run, and one of those pairs is hiding a reference food.

### 8.2 What the ledger entry carries

`{ ndbNumber, foundation: { fdcId, description }, sr_legacy: { fdcId, description }, verdict, reason_code, note }`, plus the measured `names_read_alike`, `filled_fields` and `merged_row_ships` fields the scaffold already holds.

### 8.3 The estimate this note is willing to be wrong about

Of the 94 name-differing pairs, **15–30 adjudicate `split`**; of the 96 name-alike pairs, **0**. Total predicted: **15–30 of 190**.

For calibration: the ticket names 4 confirmed fusions and 3 more needing a call, and #137's refuted state-word test flags 33 of 87. An outcome materially above 30 means §6.2's identity-forming dimensions are catching renames, and the sweep says so instead of shipping it.

### 8.4 Thresholds, and the outcome where nothing ships

| outcome            | condition                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Ship the split** | ≥ 1 pair adjudicates `split` on evidence-hierarchy level 1 or 2, **and** §8.5's guards are unmoved                                    |
| **Ship nothing**   | 0 pairs adjudicate `split`, or every `split` rests on `uncertain` alone. Write the finding, close the ticket, ADR-0051 is not written |

There is no upper threshold and no duplicate-count stop condition. Letting a near-duplicate tally talk the sweep into merging a pair it adjudicated as two foods is §6's rejected trade arriving through a side door. If the duplication is bad that is a finding about ranking, routed per §10.

**Ratification.** #143's pre-registration required maintainer sign-off on every verdict through a review tool that has since been removed, and its ratification was waived. This note does not assume a tool: the whole ledger is committed as reviewable JSON before the code changes, and §7's protocol is what makes a verdict checkable without one.

### 8.5 Must not regress

- The 165 pairs currently shipping still ship, except where a `split` verdict deletes one on ADR-0048 §5 and §9 has accepted the deletion by name.
- ADR-0042 §1's nine ranking guards, unchanged: `pot` / `pota` / `potato` / `potatoes` / `tomato` lead with the vegetable; `grape` gives Grapes, then `Grape leaves`, then `Grapefruit`; `gra` reaches Grapes; `balsamic` reaches `Vinegar, balsamic`; `soy milk` leads with `Soy milk, …`.
- ADR-0050's rule is unchanged: a surviving merged row still answers to the name its twin lost. Only the population shrinks, and §9 accepts that.
- The 151 `grilled` rows still ship (§4).

### 8.6 What gets pinned as a test

- **The census check** — every twin pair the grouping makes is named by the ledger, and every ledger entry names a pair the grouping makes. Fails in both directions.
- **Named presences**: `Apples, raw, golden delicious, with skin`, `Spelt, uncooked`, `Salt, table` and `Orange juice, raw` retrievable and leading their own queries.
- **The portabella pair split**, since that is the one case where success and the fix never having run look identical.
- **Named absences**: whatever §9 deletes, asserted absent on purpose. An intentional deletion visible only as a missing row reads as a bug to the next person.

Not pinned: the 190, the split count, or the corpus row total. Those are dated findings, and pinning them turns the next legitimate refresh into a test failure.

## 9. Costs accepted in advance

Registered here so that none of them can be reported later as a discovery:

- **Split rows carry only their own measurements.** No fill survives a split. Honeycrisp loses trans fat, vit A and vit E, and `macrosFromNutrition` renders them `0`. That is a pre-existing gap in that record, not one this ticket opens (ADR-0048 §1). The alternative — split the identity but keep the fill — is rejected: it would leave a part-Golden-Delicious Honeycrisp panel sitting next to a Golden Delicious row holding those same numbers under its own name, which is worse than one row and one story.
- **Up to 9 rows may be deleted** by ADR-0048 §5, from the list in §2.2, if their pairs adjudicate `split`. Each deletion is named in the ADR and asserted in a test.
- **A split loser that a filter then drops becomes unreachable**, losing the alias it has today. ADR-0050 is explicit that an alias asserts retrievability _of this row_, and after a split there is no such row; an alias that resurrects a filtered record would defeat the filter by the back door. The count is measured and named in the results.
- **Near-duplicate rows enter search results.** Measured and reported — how many queries gain a second row from the same split pair in their top three, and the worst named — with no stop condition (§8.4).
- **Every mirror refresh must adjudicate its new twins before it can ship**, because the census check fails on a pair the ledger does not name. That is the price of the instrument and it is the correct one.

## 10. Where the unreached go

- **Ranking damage from near-duplicates** → a finding in ADR-0051 and, if material, its own ticket against ADR-0042 §1. Not fixed here.
- **`desc:`-keyed fusion** → not a live defect: zero multi-record groups are keyed by the fallback today. Not fixed, but no longer assumed — the §8.6 census check fails on one the day it appears.
- **Pairs USDA will fuse in future refreshes** → the census check, not a rule. This note does not claim the 190 are the last of them.
