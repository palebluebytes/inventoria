# ADR 0108: A volume food is weighed by the class you say it is

**Status:** Accepted  
**Date:** 2026-09-14  
**Amends:** [ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §1 (the unit stops being unchoosable on a food that carries a density), §2 (the refusal is lifted for a class the user asserts) and §6 (a portion may now be offered in either unit); [ADR-0045](0045-usda-stays-the-base-food-composition-authority.md) §5 (what may cross from one source to another, answering #242); [ADR-0041](0041-nova-processing-badge.md) §3 (the client-side inference ban gains a second carve-out)  
**Charted by:** #428  
**Implemented:** §2 and §3 (the class table and the gate that proves its figures) — #429. §1, §4, §5, §6 and §7, plus the pre-fill and the opening-unit rule of both 2026-09 amendments — #430. §8 and §9 — #431. §10's household portions and §12's model pick are not built.

## Context

[ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §1 settled the unit
every amount is entered in: read from the food's `nutrition/info.serving_size`,
never a separate choice, nothing converted. §2 refused the density that would
make a choice possible, and was explicit about the cost:

> A user who wants to weigh a food whose panel is per 100 ml has no route through
> this app, and that is the deliberate consequence of §2.

It also named, precisely, what would reopen it (`:286-292`):

> What would reopen it is a per-food density that is _measured_ rather than
> derived: a curated table under ADR-0046's eligibility rules would qualify, a
> constant never will.

The user this app is built for weighs everything. Every ingredient goes onto a
scale in grams, and a bottle of oil published per 100 ml is the one thing in the
kitchen the app cannot take. On 100 ml of olive oil the error from entering a
weight against a volume basis is about **78 kcal**, which is not a rounding
complaint.

### The stated ground for the refusal fails for exactly this population

§2's argument is a corpus measurement and one sentence of reasoning from it:

> **There is no reliable "is this a liquid" signal in the corpus**, so a
> conversion would be a guess wearing the costume of a measurement, and silent.

That is true of the USDA corpus, where it was written. It is false of the record
that actually needs a density: a `gtin:` twin, whose OFF payload carries
`product_quantity_unit: "ml"` — the source asserting, about that product, that it
is sold by volume. ADR-0052 §1 already relies on exactly this field to decide the
panel's basis. The signal §2 could not find is the one the barcode path already
reads.

### Open Food Facts cannot supply a density, and this was checked rather than assumed

All 124 files under OFF's `docs/api/ref/schemas`, its CSV export (211 columns),
its Parquet dump (111 columns) and its own Datasette (215 columns) carry **no**
`net_weight`, `drained_weight`, `density`, or normalised mass.

- `net_weight_value` exists as a producers-platform import field and is
  **discarded** at import when `quantity` already parses.
- `product_quantity` is never in grams when its unit is ml: OFF's `unit_to_g()`
  converts within a unit's own family, and its units taxonomy has a mass family
  and a volume family with no bridge between them.
- The `"1 L (1030 g)"` convention covers **4,681 products of 4,535,553** (0.1%),
  the parser keeps only the leftmost token, and many such pairs are a tinned
  good's net weight, drained weight and jar capacity rather than a density.

OFF hit the same wall and solved it with a curated table: `density_g_per_ml:en`
on eight ingredient-taxonomy entries, FAO-sourced, with their code defaulting to
1 g/ml otherwise.

### FAO's database is not the curated table ADR-0060 imagined

It is the obvious source, it is what OFF used, and it fails on two counts.

**It cannot be shipped.** Published 2012; FAO's Open Access Policy states that
_"Creative Commons licences do not apply to works published before June 2018"_,
its copyright page authorises even non-commercial use only _"upon request"_, and
the repository metadata carries bare `dc.rights.copyright = FAO`.

**It is not measured in the sense §2 meant.** Eleven sources, three of them
hobbyist or vendor web pages and two unpublished. Density and specific gravity
are separate columns and most rows carry only one. The density column mixes mass
and bulk density with nothing marking which — its own header says so. And the
case that justifies this record, olive oil, carries **no density at all**: only a
specific gravity of 0.91–0.92, sourced from a web chart. FAO formally disclaims
the content as the authors' views rather than its own.

### The corpus this app already ships carries the measurement

`public/usda/search-index.json` holds **942 volume portions across 636 foods**
whose unit is exactly a volume word. ADR-0060 §2 has already ruled on what those
are:

> A **portion chip is not a conversion.** USDA's `1 cup = 244 g` is a measurement
> USDA made.

Public domain, on disk, and already trusted by the record that refused the
density. What was missing was not the data but a rule for reading it.

## Decision

### 1. A density is a property of the food, and it is the class the user asserts

A food may carry a **Density Class**: the kind of liquid it is, chosen by the
user from a closed list, from which a figure resolves. It is a fact about the
substance, so it lives on the twin and not on the screen the amount was typed on;
the same carton answers in the same unit wherever it is reached.

The user asserts the class. The app never infers one, which is what separates
this from the guess §2 refused: the costume is gone because nobody is wearing it.

### 2. Five classes, and a bar that admits a sixth

| class      | g/ml | n foods (portions) | spread | CV    |
| ---------- | ---- | ------------------ | ------ | ----- |
| water-like | 1.00 | 15 (23)            | 4.7%   | 1.20% |
| milk-like  | 1.03 | 8 (16)             | 0.8%   | 0.28% |
| juice      | 1.04 | 9 (17)             | 2.6%   | 0.80% |
| oil        | 0.92 | 42 (122)           | 3.7%   | 1.04% |
| beer/wine  | 0.99 | 43 (46)            | 6.2%   | 1.21% |

**A class is admissible at n ≥ 8 distinct foods and CV ≤ 2%**, and its entry
records the figure, n, the spread, the CV and the exact match pattern that
selected its members.

The bar is numeric because it can be. [ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)
§2 needed prose evidence because its four tests — absence proven, single
ingredient, cross-product consensus, independent reconstruction — are not
computable. These are. A bar a gate can check is worth more than one a reviewer
attests to, and it makes an unsound class a build failure rather than something
somebody has to remember.

**Syrup is refused by it.** Its CV is 8.99% over a 44.4% spread, and it stays
worst after dropping the polyol outlier: honey at 1.4265 against maple at 1.3420
is a 6.3% gap between two of the three products anyone owns. **Spirits (0.94,
n=10)** fails on CV at 2.63% and is likewise out. Neither is curated around; both
take the typed override of §4.

The figures above are as charted, and two of the rows have since been corrected:
`oil` reads 41 foods (119 portions) at a spread of 3.7% and a CV of 0.52%, and
`beer/wine` selects its 43 by excluding one member the pattern reaches. See the
amendments at the foot of this record.

The classes are wide by design. A class figure sits within 0.75% of the per-food
figure for every common case measured, because the classes are tight — which is
the same fact as their CVs.

### 3. The figures are pinned, and a gate proves them

Each figure is a written constant carrying its evidence. A check recomputes every
class from `search-index.json` and **fails** when one has moved.

Computing them at build time instead is rejected, and the reason is §2's own: the
corpus is regenerated from time to time, so a computed figure would move between
releases with nobody deciding that it should. That is the silence §2 objects to,
relocated. Pinning makes the figure a decision; the gate makes the decision
provable.

Unlike ADR-0046 §4's snapshot check, this one reads a file already in the repo.
It needs no network and costs nothing, so it belongs in `pnpm check` rather than
in a scheduled job.

### 4. The twin stores the class; the figure is derived

`food/density_class` holds what the user said. The g/ml figure is resolved from
the table at read time and is never copied onto the twin.

This is [ADR-0021](0021-schema-org-recipe-and-nutrition-conformance.md)'s rule
one level up: nutrition is derived from the referenced twin and never duplicated,
so it cannot rot against its source. What the user asserted is _"this is an
oil"_; 0.92 is our reading of that assertion, and a reading belongs derived. When
a class figure improves, every food classified under it follows.

A user who measures a density themselves stores a bare number instead, and
nothing derives it.

### 5. Open Food Facts' panel is never rewritten

The density sits beside the panel. It does not convert it to a per-100 g one.

[ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §3 forbids rescaling an
assay to an assumed basis, and a rewritten panel is also unreadable afterwards:
nothing distinguishes a converted panel from one OFF published. A density is a
fact about the substance, not a correction to the source's figures.

### 6. The question is asked lazily, and never blocks

A volume food opens in millilitres, as it does today. The class is asked for the
first time grams are reached for, and not before.

A food with no class stays in millilitres indefinitely and remains fully
loggable. The gram path is something a specific product earns once, never a
precondition for using the app.

### 7. Both units, grams the default (amends ADR-0060 §1)

On a food carrying a density, the amount field offers grams and millilitres, and
opens on grams.

§1's ban on choosing a unit rested entirely on §2: nothing could convert, so a
choice could only ever be a mislabel. On a food with a density that reason is
spent, and a rule outliving its reason is how the next reader gets misled. §1 is
unchanged everywhere else: a food with no density has no choice to make.

### 8. A portion may be offered in either unit (amends ADR-0060 §6)

§6 drops a portion stated in the unit the field does not take, because filling it
in _"would be a density conversion done silently at ratio 1"_. With a real
density it is neither silent nor at ratio 1, so `portionPresets` may resolve
across the two units on a food that carries one. On a food that does not, §6
stands exactly as written.

### 9. The screen says what the number is, and does not wear a badge

The basis caption reads `Per 100 ml (≈103 g)`. The `≈` is the whole of the
surface signal, and it is doing real work: it says estimate without reopening an
argument already settled. The explainer carries the rest — which class was
asserted, what it resolved to, and that the figure is USDA's measurement of a
reference food rather than anything read off this label.

A badge, tag or tint is deliberately not added. [ADR-0041](0041-nova-processing-badge.md)'s
2026-08-06 amendment removed exactly such a marker from inferred NOVA values as
_"a deliberate owner call favouring a calmer badge over an at-a-glance provenance
cue"_, moving the honesty one tap deeper into explainer copy and withheld
attribution. This record follows that call rather than relitigating it.

### 10. A measurement may cross from USDA to an OFF product; a composition value may not (amends ADR-0045 §5, answering #242)

[ADR-0045](0045-usda-stays-the-base-food-composition-authority.md) §5 forbids
cross-source filling. [#242](https://github.com/palebluebytes/inventoria/issues/242)
asks how far that reaches and closes by refusing an ambiguous answer. The ruling:

> **A property of the substance may cross. A composition value may not.** A
> density, and what a household measure of the food weighs, may reach an OFF
> product from USDA. A nutrient value may never.

§5's rationale is composition incoherence — _"a panel built from one table's
energy and another's fibre describes no food that exists"_ — and that hazard
cannot arise from a figure that changes no panel value. The panel stays entirely
OFF's, which is also what clears §4's bar that _"a merged panel must never
present itself as a single record USDA served"_: nothing is merged, and what
crosses sits beside.

The line is drawn where §5's own argument puts it rather than where this ticket
happens to stand, so the next case does not need re-arguing.

The cost is stated rather than hidden: USDA's cup weight for
`Milk, whole, 3.7% milkfat` on a carton of some other dairy's semi-skimmed is a
near match and not the same food. That is tolerable for a household measure and
would not be tolerable for a calorie, which is exactly the line.

**Household portions are covered by this rule and left unbuilt.** They need a
per-food match, which §12 defers.

### 11. The inference ban gains a second carve-out (amends ADR-0041 §3)

ADR-0041 §3 permits one client-side inference, _"NOVA-1-only, single/basic foods
only, never a 2/3/4 guess"_, and its Consequences hold the broader ban open.
Resolving a figure from a class is inference, so it needs naming rather than
assuming.

It is admissible where a NOVA 2/3/4 guess is not, on four counts: it is bounded
by a measured corpus with a stated spread rather than by judgement; the user
asserted the class, so the app inferred a figure and not a fact about the food;
it is disclosed at the point of use and overridable; and being wrong costs a
percent of one nutrient rather than a claim about how processed a food is.

The ban is otherwise unchanged.

### 12. The model sits behind a typed seam, unbuilt

A per-food density — matching a scanned product to one of the 896 USDA foods that
carry one — would be better than a class. It is deferred, and the seam is typed
for it the way `ai-autofill.ts` types the label extractor.

The measurement is why. Against a baseline of assuming 1.0, a class already
removes the great majority of the error: olive oil's 8.7% falls to 0.73%, orange
juice's 4.6% to 0.36%, whole milk's 3.0% to 0.20%. On 100 ml of olive oil that is
78 kcal of error reduced to 6. Closing the last 6 costs a Worker route, a new
per-user secret, a spend cap and a network dependency in an offline-first app.

[ADR-0034](0034-label-photo-food-capture.md) §4's confirm-before-save contract
binds any such model output — _"a proposal the user confirms, never written
un-reviewed"_ — so a model would not even remove the interaction: it would change
what the user confirms from a list of five to one answer they have no way to
check. Build the seam; spend the infrastructure when something needs it more.

## Consequences

- `food/density_class` joins `docs/eavt-vocabulary.md` under `food/`. **Density
  Class** joins `CONTEXT.md`.
- **No composition changes hands, ever.** The OFF panel is untouched; §10's rule
  is about properties beside a panel and never about values in one.
- **Forward-only.** A food with no class behaves exactly as it does today, which
  is the standing state rather than an edge case. Nothing migrates, and no logged
  event moves: `event/metrics` is frozen (ADR-0022).
- The drift gate is the first check in `pnpm check` that reads the USDA artifact,
  so regenerating the corpus can now fail the build. That is the intent.
- Two classes measured and refused are recorded here rather than dropped
  silently, so a later reader proposing syrup finds the CV that stopped it.
- **Not built by this record:** household portions crossing from USDA (§10), the
  per-food model pick (§12). Both are ruled on and neither is implemented.

## Amendment (2026-09-14): the source pre-fills the class, and grams is not the default everywhere

Two clauses above are wrong, and both were written without a measurement behind
them. Neither changes the model: the class is still the unit of the answer, the
density still lives on the twin, and the figure is still derived.

### §1's "the app never infers one" is too strong

§1 said the user asserts the class and _"the app never infers one, which is what
separates this from the guess §2 refused"_. That reasoning holds for a guess
about an unclassified thing. It does not hold for reading the source's own
classification: an OFF product arrives carrying `categories_tags`, and mapping
`en:olive-oils` to the oil class is the same act as `offPanelBasis` reading
`product_quantity_unit` — a source assertion consulted, not a judgement invented.

That data is already in the ledger. `lookupBarcode` fetches with no `fields`
parameter and `provenance/raw.raw_data` stores the response verbatim, so every
`gtin:` twin ever scanned already carries its tags. Reading a domain value back
out of that blob is established rather than new: `offPackUnitFromTwin` and
`offPackQuantityFromTwin` do exactly this, and a third sibling joins them.
ADR-0076 §4 forbids **scoping** by `provenance/`, which reading a value is not.

**So the source pre-fills, and the user confirms.** The class is still theirs.

### The pre-fill covers about a third, not most, and the gap is the point

Measured over the full 2026-09-14 JSONL dump — 4,747,804 products, not a sample:

|                                    | count      | % of ml products |
| ---------------------------------- | ---------- | ---------------- |
| sold in millilitres                | 201,821    | 100%             |
| carrying `categories_tags`         | 156,360    | 77.47%           |
| **resolving to exactly one class** | **72,182** | **35.76%**       |
| tagged but matching no class       | 83,595     | 41.42%           |
| no usable tags at all              | 48,922     | 24.24%           |

The gap between 77% and 36% is the whole finding: having tags and having
**discriminating** tags are different properties, and a design costed on the
first number would be costed on nothing.

The unclassifiable 41% is not a long tail of oddities. Half are drinkables the
five classes do not name — plant milks, energy drinks, cordials, spirits. Half
are not drinks at all, yet sold in millilitres: 13,394 sauces and condiments,
4,775 ice creams (aerated, near 0.55, where a five-class scheme would be wrong by
almost half), 3,181 soups, 2,832 vinegars. And the 24% with no usable tags are
ordinary products: Orangina, Red Bull, Bière 33cl, Martini Rosato.

Three structural facts constrain any rule written against these tags. The
taxonomy is a **DAG with 65 roots**, not one beverages tree. **`en:milks` never
inherits `en:beverages`** and plant milks never inherit `en:dairies`, so nothing
anchors "milk-like" from above. And the obvious tag names do not exist:
`en:oat-based-drinks`, not `en:oat-milks`.

### The pre-fill is offered only on an unambiguous match, and never applied silently

527 products match two or more classes. Worse than ambiguous is **squash**, which
carries `en:fruit-juices` **and** `en:cordials` together — 18.6% of millilitre
cordials do — so a juice rule would assign 1.04 to a concentrate that is nearer
1.20. Coconut milk carries `en:beverages` beside
`en:plant-based-creams-for-cooking`, making a cooking tin indistinguishable from
a drinking carton.

A silent pre-fill on those is precisely §2's _"a guess wearing the costume of a
measurement, and silent"_. So: **pre-fill only where the tags name exactly one
class, open the picker empty otherwise, and never write a class the user has not
seen.** A wrong pre-fill is worse than none, because it converts a question into
a nod.

The confirm step here is not the confirmation theatre §12 rejects for a model's
density. **A class is checkable by someone holding the bottle** — you can see
"juice" on a bottle of squash and know it is wrong. You could never check
"1.04 g/ml". Confirming a class is a judgement the user is qualified to make.

### §7's "grams the default" is wrong outside a kitchen

§7 said that on a food carrying a density the field offers both units and opens
on grams. Unqualified, that opens a can of Coke in grams. Nobody weighs a can of
Coke; they drink it.

Availability is not the problem, the default is:

- **Context sets it.** A recipe ingredient list opens on grams; logging a food
  directly opens on the panel's own unit, as it does today. One is a thing
  measured _into_ something, the other is a thing consumed.
- **Memory overrides it.** Whatever unit that food was last entered in wins over
  the context default. `rememberedAmount` already carries this idiom for the
  amount and refuses a unit mismatch rather than converting; reporting the unit
  alongside is the small extension.

**This is not a reversal of §1's "a density is a property of the food, not of the
screen".** The density stays on the twin and both units stay available
everywhere; what varies is only which one the field opens on. A food classified
once answers in grams wherever it is reached, so the split §1 refuses does not
return.

### Consequences of this amendment

- §10's ruling is untouched. A category tag is the source's own, so nothing
  crosses between sources here at all.
- **A curated stand-in carries no tags.** `CuratedStandIn.snapshot` is trimmed to
  the fields `OFFProduct` declares, so the two pinned entries reach no pre-fill —
  and one of them, `double cream`, is sold in millilitres in the UK. Either
  `categories_tags` joins the declared fields, or those entries are classified by
  hand. Two rows either way.
- The 24% with no usable tags, and the 41% the classes do not name, are the
  standing case rather than the exception. §6's _"stays in millilitres and never
  blocks"_ carries more weight than it looked like it did when written.

## Amendment (2026-09-14): re-pinned to schema 9, and §3 earned its keep early

The corpus was regenerated between this record being written and any of it being
built. `622c525a` collapsed **4,238 foods to 2,444** (schema 8 to 9, ADR-0104)
and `a1fd1d70` then dropped seven made drinks, leaving **2,437**. With them, 1,219
volume portions across 896 foods became **942 across 636**.

Every class survived, and four of the five are unmoved. `oil` alone shifts, from
42 foods (122 portions) at CV 1.04% to **41 (119) at CV 0.52%** — the collapse
took `Fish oil, menhaden, fully hydrogenated`, which is solid at room temperature
and was the class's only real outlier. The figures themselves are unchanged to
two decimals, because what the collapse dropped was cooked and prepared records
rather than reference liquids.

`milk-like` sits at **n = 8, exactly on §2's floor**. One more collapse touching a
milk row would fail its own bar, and that is the bar working rather than a
problem to route around.

This is §3's argument arriving sooner than expected. Had the figures been
computed at build time, they would have moved between two releases with nobody
deciding they should; had they been pinned with no gate, they would now be
claiming a corpus that no longer exists. Pinned **and** gated, the regeneration is
a build failure that a human answers — which is what happened here, by hand,
before the gate was built.

## Amendment (2026-09-14): the patterns, and two rows that disagreed with themselves

Building §2 and §3 (#429) needed the thing §2 requires every entry to record —
the exact match pattern that selected a class's members — and no pattern was
written down anywhere. They were reconstructed by searching for patterns that
reproduce the charted figures, which is a strong test: a class has to land on its
foods, its portions, its figure, its spread and its CV at once.

Five rows do, exactly: `water-like` at 15 (23), 4.7%, 1.20%; `milk-like` at
8 (16), 0.8%, 0.28%; `juice` at 9 (17), 2.6%, 0.80%; and both refusals, `syrup`
at 10 (19), 44.4%, 8.99% and `spirits` at 10 (18), 7.2%, 2.63%. Two did not, and
in both cases the row was internally inconsistent rather than the reconstruction
being wrong.

**`oil` was never one set.** Its n and CV describe a class that includes
`Fish oil, menhaden, fully hydrogenated`; its spread describes the same class
without it. With that food in, the class is 42 foods (122 portions), spread 9.3%,
CV 1.04%. Without it, 41 (119), 3.7%, 0.52%. No membership yields the charted
combination. It is excluded, and the class is pinned at the second: a fully
hydrogenated oil is solid at room temperature, so it cannot be poured and cannot
be what someone asserting _"this is an oil"_ means. It was also the class's only
real outlier, at 0.8665 against a class that otherwise spans 0.9130 to 0.9468.

**`beer/wine` selects 44, not 43.** The charted spread and CV are the 44-food
set's. Six single-food removals reproduce the charted row exactly, and five of
them are an arbitrary pick among five identical white table wines at 0.9907. The
sixth is `Alcoholic beverage, malt beer, hard lemonade`, a flavoured malt cooler
that is neither beer nor wine, and it is pinned on that ground rather than on
being one of six ways to reach a number.

### The re-pin amendment above attributed this to the corpus, and that was wrong

It states that the schema 8 to 9 collapse _"took `Fish oil, menhaden, fully
hydrogenated`"_. It did not. That row is in the shipped corpus, fdcId 172342,
with the same three volume portions it always had.

Measured against both corpus versions, **every class and both refusals are
identical**: the regeneration moved nothing at all. What moved between §2's table
and that amendment was which of the two `oil` memberships was being reported, and
the amendment read a membership decision as a corpus change. So "four of the five
are unmoved" understates it — all five are, because what the collapse dropped was
cooked and prepared records and no class member. Its other two claims stand: the
population really is 942 volume portions across 636 foods, and `milk-like` really
does sit at exactly §2's floor of eight, which was already true before the
collapse.

The reasoning it drew from this survives its own premise, which is why it is
amended rather than struck. Pinned and gated is what turns a figure into a
decision; the illustration was simply not the one it thought it had.

### Where the patterns live now

`src/lib/food/density-class.ts` holds the five classes, the bar, both refusals
and the pattern that selects each, and `scripts/density-class-check.mjs`
re-selects from those patterns on every `pnpm check`. §2's requirement that an
entry record its match pattern is discharged by the table, not by this record: a
pattern written in prose would be a second copy to drift.

## Amendment (2026-09-15): no curated stand-in reaches the class question

The pre-fill amendment above closes with a consequence that owes work:

> **A curated stand-in carries no tags.** `CuratedStandIn.snapshot` is trimmed to
> the fields `OFFProduct` declares, so the two pinned entries reach no pre-fill —
> and one of them, `double cream`, is sold in millilitres in the UK. Either
> `categories_tags` joins the declared fields, or those entries are classified by
> hand. Two rows either way.

Nothing is owed. That paragraph reasons from the shop rather than from the twin.

A stand-in stages through `mapOffProductToPayload(entry.snapshot)` like any other
product, so its Panel basis is `offPanelBasis(snapshot.product.product_quantity_unit)`.
**Neither pinned snapshot declares that field** — it is not one of the fields
`OFFProduct` declares — so both resolve to `100 g`. §6 asks for the class the
first time grams are reached for, and on a per-100 g food grams are what the field
already takes. The question never fires, on either entry, at any point. `cacao
nibs` is a solid; `double cream` is sold by volume but its panel is not published
that way here, and the distinction between those two facts is the whole of the
error.

### The fix the paragraph proposes would be a defect

`double cream`'s panel is a median over 58 UK and Irish records stated **per
100 g**, and its corroborating reconstruction from `Cream, heavy` and `Butter oil,
anhydrous` is a mass ratio. Declaring `product_quantity_unit` on `OFFProduct` so
a stand-in could be classified would let a live `ml` relabel those figures as
per 100 ml while leaving every one of them unchanged — a basis moved under a
panel that was not rescaled, which is [ADR-0048](0048-an-absent-measurement-is-not-a-zero.md)
§3 run backwards. **That field must not join the declared set.** `categories_tags`
carries no such hazard and is simply not needed by anything.

### What this does expose

`curatedStandInFor` states that "the twin a curated search stages is
byte-comparable with the one a scan of the same pack produces, and both are
`gtin:<code>`". That claim is conditional on the undeclared field: if OFF holds
5010251341352 in millilitres, a scan of that pack produces a per-100 ml twin
carrying per-100 g figures, where the stand-in produces a per-100 g one. The two
would disagree about the basis, and the density is not what fixes it — a rescale
would be. It is recorded here rather than acted on, because it is
[ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)'s question and
not this record's, and because nothing has yet measured whether OFF holds that
product by volume at all.

So: no stand-in is classified, by hand or otherwise, and `OFFProduct`'s declared
fields are unchanged.

## Amendment (2026-09-15): one attribute named for the question, a word §4 cannot support, and memory that knows where it is

Three corrections found while modelling #430, all in clauses nothing has built yet.

### The attribute is `food/density`, and its value names its own grammar

§4 says the class lives on `food/density_class` and that "a user who measures a
density themselves stores a bare number instead". Read literally that is one key
holding either a class id or a number, and `food/density_class: 1.20` is a datom
that says something false about itself.

Two attributes were considered and refused. The ledger's later-datom-wins rule is
**per attribute**, so a food moving from a typed figure to a class would take two
datoms in the right order, and a wrong order leaves it carrying both with nothing
to arbitrate them. One assertion that simply wins is the whole point of the
append-only model.

So: **one attribute, `food/density`, whose value is an object naming which kind
of answer it holds** — `{ class: "oil" }` or `{ g_per_ml: 1.20 }`. The key names
the question and the value names the grammar of the answer. This is `food/portions`'
shape rather than a new one: its `grams | millilitres` siblings are fields inside
one attribute's value, exactly so a reader that knows only one of them sees
nothing rather than a value it would misread.

It also leaves room for the thing §12 has already named. A per-food density
matched to a USDA food arrives as `{ fdc_id, g_per_ml }` and sits beside the other
two; under a bare number it would be indistinguishable from a typed override. A
ledger shape that cannot be extended without a migration is the wrong one to pick
when the record already says what is coming.

`food/density` joins `docs/eavt-vocabulary.md` under `food/`, and the Consequences
above should be read as naming it.

### §4's "measures" is a costume, and this record is the last place that can afford one

§4 grants the override to "a user who measures a density themselves". Nobody will.
The population taking that exit is the squash and cordial case — a bottle the five
classes do not name — and the figure reaching the field is a remembered or looked-up
one far more often than a weighed one. The app cannot tell the two apart and must
not imply it can.

The word is load-bearing in the wrong direction twice. [ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md)
§2 named what would reopen its refusal as "a per-food density that is _measured_
rather than derived", so a typed figure called measured appears to satisfy a test
it does not. And §12 argues that "a class is checkable by someone holding the
bottle" where a figure in grams per millilitre is not — which makes the typed
override the **least** evidenced thing in this design, not the most.

**It is an asserted density, not a measured one.** §4 should read that a user whose
food no class fits asserts a figure directly, and that nothing derives it. It is
the user's own claim about their own food, disclosed at the point of use and
overridable like the class, and it is admissible on exactly those grounds and not
on being a measurement.

Asking the exit for a source alongside the figure was considered and refused: the
app cannot verify free text either, so it would charge a second question at the
moment the user has already failed to find their food, and buy disclosure theatre
rather than evidence. §12 rejects that trade by name.

### Memory is scoped to the context it was formed in

The pre-fill amendment says context sets the opening unit and "whatever unit that
food was **last entered in** wins over the context default". Unqualified, that
retires the context rule almost entirely: a food with any history at all takes its
memory, so "a recipe ingredient list opens on grams" only ever fires on a food
nobody has touched.

The scenario that shows it is a can of Coke. Logged and drunk in millilitres for
months, then added to a recipe — where it is a thing measured **into** something,
which is the entire reason the context rule exists. A flat memory rule opens it in
millilitres there, and the rule that was supposed to decide the case never runs.

**So memory is read per context, not per food.** What a food was last entered in
_as a recipe ingredient_ seeds a recipe ingredient list; what it was last _logged_
in seeds the log sheet. A food with no history in the context it is being reached
in takes that context's default — grams in a recipe, the panel's own unit in a
direct log.

This costs a second memory to read and means one food can open differently in two
places, which is the objection worth stating: §1 holds that a density is a property
of the food and not of the screen. It is not breached. The density is one fact on
one twin and both units stay available everywhere; what is scoped is only which
unit the field opens on, which was already a per-context rule the moment context
was allowed to set a default at all.
