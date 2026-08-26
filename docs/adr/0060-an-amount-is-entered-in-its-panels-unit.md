# ADR 0060: An amount is entered in the unit its panel is measured in, and nothing converts

**Status:** Accepted  
**Date:** 2026-08-26

This record amends [ADR-0052](0052-a-drinks-panel-is-carried-per-100-ml.md) §2 (the
millilitre serving its portions declined to take), §3 (the contribution basis, now
guarded) and §5 (the basis toggle it deliberately kept hidden);
[ADR-0034](0034-label-photo-food-capture.md) §3 (the values that toggle offers);
[ADR-0030](0030-expanded-food-twin-source-data.md) §2 (`Portion`'s shape); and
[ADR-0023](0023-numeric-first-amount-entry.md) (the amount control's name, and the
unit it announces).

## Context

[#127](https://github.com/palebluebytes/inventoria/issues/127) opened with a plain
complaint: there is no way to say "200 ml" anywhere in the app. Every amount is a
gram weight — `recipe-ingredient.ts:39` types an ingredient's unit as exactly
`"g" | "serving"`, `event/quantity` is written as `` `${grams}g` ``, and the entry
control is called `QuantityGrams`.

[ADR-0052](0052-a-drinks-panel-is-carried-per-100-ml.md) took the correctness half
of that ticket and left the rest here. It established that a drink's panel is
carried **per 100 ml** and never converted to a weight, and it closed its own
Consequences by naming the gap it could not close: "the amount screen still prints
no basis caption, so a drink staged from a scan shows a gram field over a volume
panel with nothing on screen naming the difference. That gap is #127's to close."

### The defect is live, and it is a mislabel rather than a miscalculation

All five scalers now divide by the panel's own basis via `parseBasisQuantity`
(`nutrition.ts:352`), which returns `100` for `"100 ml"`. So on a post-#148 drink,
`FoodAmountPanel.svelte:38` computes `grams / 100 ml` under a control labelled
`Quantity (grams)` (`QuantityGrams.svelte:110`).

The consequence is precise and worth stating plainly: **a user who types the can's
volume gets the right figure, and a user who types its true weight gets one wrong
by the density.** The field is already a millilitre field; only its label disagrees.
The same is true inside recipes, where `recipe-nutrition.ts:79-82` divides a `"g"`
ingredient by a `"100 ml"` panel with no conversion.

### Three situations, not one

The ticket's framing blurs three populations with three different costs:

- **A — the scanned drink.** A `gtin:` twin whose Open Food Facts panel is per 100 ml.
  Needs no density: the panel already declares the unit.
- **B — the hand-captured drink label.** A UK bottle prints "per 100 ml". The
  read-along form's toggle offers `per_100g` and `per_serving` only; `per_100ml`
  exists in the union (`label-form.ts:41`) but is never offered, so a user
  transcribing a smoothie must mislabel it as grams or weigh it. Needs no density
  either: the label states the basis.
- **C — the measuring jug.** 200 ml of milk or 15 ml of oil against a per-100 **g**
  reference row. This is the only one that needs a density.

A and B are settled here and built. C is refused, in writing, by §2.

### Why a density conversion is refused

[ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §3 already forbids computing
a panel's figures from other figures plus a number we supplied, and ADR-0052 §1
applied that to a source's published panel. That leaves the _user's own entry_ open,
where the volume is stated rather than assumed — and the corpus is what closes it.

#148 measured the derivation over the 4,360 foods then shipped: 958 foods (22.0%)
carry a volume-named household portion, yielding 1,339 such portions, but the largest
categories after `Fats and Oils` are `Legumes`, `Vegetables` and `Dairy and Egg`,
where "1 cup, chopped" is a bulk density and not a fluid one. Median derived density
across all 1,339 is **0.854**, p10 **0.372**. Narrowing to Beverages, Fats and Oils
and Dairy still leaves dried acid whey at 0.196 and shredded parmesan at 0.338. Even
among genuine liquids a flat 1.0 is off by more than 5% on 309 of 540 portions —
honey derives 1.433 and maple syrup 1.353 against olive oil's 0.913.

**There is no reliable "is this a liquid" signal in the corpus**, so a conversion
would be a guess wearing the costume of a measurement, and silent.

### Alternatives that were genuinely live

- **Store millilitres on the panel and convert on read.** Forbidden by ADR-0048 §3
  before any corpus argument is reached.
- **Let the user choose a unit per entry, converting by density.** Refused on the
  measurement above. It is also unreachable by the existing control:
  `AMOUNT_EXPRESSION_CHARS` (`amount-expression.ts:29`) filters every keystroke to
  `[0-9+\-*/.() ]`, so a unit can never be _typed_ — it is necessarily a property of
  the control, not of the input.
- **Relabel the field and stop there.** Cheapest, and wrong. `parseLoggedQuantity`
  (`recipe-ingredient.ts:163`) matches `/^\s*([\d.]+)\s*g\b/i` and falls through to
  `{ amount: 1, unit: "serving" }` for anything else — so `"330ml"` would be a
  **silent misread**, not an error, and `food-search.ts:120` would drop the drink out
  of the Recent catalogue while `FoodView.svelte:471` re-seeded it into a recipe as
  one serving.
- **Overload `Portion.grams` to mean "the amount in the food's basis unit".** No
  migration, and a field named `grams` that sometimes holds millilitres.

**Scope.** This record covers the unit an amount is **entered** in and the unit a log
**records**. It does not introduce a volume _serving_ basis — a `"330 ml"` value in
`serving_size`, as opposed to the per-100 `"100 ml"` — which ADR-0052 already warned
would want the field properly typed rather than a third literal added. It does not
touch physical items, media, or habits. It does not convert anything, anywhere.

## Decision

### 1. An amount's unit is its panel's unit

The unit of an amount is read from the food's `nutrition/info.serving_size` and is
never a separate choice: a per-100 g panel is entered in grams, a per-100 ml panel in
millilitres, a whole-serving food in servings. A food carrying no panel is entered in
grams.

There is no escape hatch. A user who wants to weigh a food whose panel is per 100 ml
has no route through this app, and that is the deliberate consequence of §2.

### 2. Nothing converts between volume and weight

No density is applied at entry, at logging, at scaling, or on display. Situation C is
refused: there is no way to enter millilitres against a gram panel.

A **portion chip is not a conversion.** USDA's `1 cup = 244 g` is a measurement USDA
made, carried on `food/portions` and resolved at entry as it always was. It is the
whole of the answer offered to the measuring-jug user, and it reaches only the 22% of
the corpus that carries such a portion.

### 3. The screen names the unit and the basis, and they are two different facts

The control answers "what am I typing?"; the caption answers "what are the panel's
figures per?". They coincide only on a per-100 panel.

`QuantityGrams.svelte` is renamed **`AmountField`** and takes the unit as a prop,
replacing the four hard-coded sites: the visible label, the `aria-label`, the box
suffix, and the slider's max caption. Its defaults follow the unit — 100 g / 500 g as
before, 250 ml / 1000 ml for a volume basis, being a glass and a carton.

`FoodAmountPanel` renders the basis caption its doc comment has always promised:

| basis         | caption              |
| ------------- | -------------------- |
| `"100 g"`     | `Per 100 g`          |
| `"100 ml"`    | `Per 100 ml`         |
| `"30 g"`      | `Per serving (30 g)` |
| `"1 serving"` | `Per serving`        |

A bare `"1 serving"` gets no weight in its caption. `parseBasisQuantity` divides it by
100 as a scaler's last resort, and that fallback is not a fact about the food; putting
it on screen would show a number the source never gave. A panel-less food renders no
caption, as it renders no preview.

### 4. The logged quantity carries the unit, and one function spells it

`event/quantity` records the resolved number in the panel's own unit — `"330ml"`,
`"244g"`, `"1 serving"` — compact, matching the existing `g` spelling, because that
is the shape of every row already in the ledger.

`parseLoggedQuantity` becomes `/^\s*([\d.]+)\s*(g|ml)\b/i` and returns the matched
unit. Both write sites — `LogFoodSheet.svelte:409` and `calorie.store.ts:591` — route
through `quantityLabel` rather than hand-building the string; they agree with it today
only by coincidence, and a second spelling is how the two drift.

### 5. The unit union gains `"ml"`, and `=== "g"` is retired

`"g" | "serving"` becomes `"g" | "ml" | "serving"` in its four persisted or frozen
positions (`recipe-ingredient.ts:39` and `:154`, `recipe-nutrition.ts:24`,
`recipe-instantiation.ts:24`) plus `FoodItemRow.svelte:29`. The union stays a string
union: it is the persisted shape, held in `recipe/ingredients` and in frozen
instantiation rows, and a discriminated object would be a ledger migration.

**The danger is not the union; it is the five hand-written ternaries that mean "is
this scaled?" and spell it `=== "g"`.** Chief among them
`recipe-nutrition.ts:79-82` — widen the union without touching it and _330 ml silently
means 330 servings_. Every such site goes through a named `isMeasuredUnit` predicate,
so the intent is greppable and the next unit is a one-line change rather than a
lurking one.

### 6. A portion carries the unit of its own magnitude

`Portion` gains an optional millilitre sibling to `grams`; exactly one is present.
`offPortions` stops discarding a millilitre serving, so a 330 ml can offers "1 can"
again — the affordance ADR-0052 §2 gave up, on 57 of 100 sampled beverages.

The sibling is preferred to overloading `grams` because it degrades in the safe
direction: a reader that knows only `grams` sees no portion for a drink, which is
exactly today's behaviour. No migration is needed, and no field name lies.

`dedupePortionsByGrams` (`FoodView.svelte:259`) keys on unit **and** magnitude once a
portion can be either.

**A chip is offered only in the unit its field takes.** Building this surfaced a case
this section had not written down: the two units disagree per portion as well as per
food. Open Food Facts publishes a drink powder's serving as the prepared 100 ml against
a per-100 g panel, and an oat carton's as 100 g against a per-100 ml one. A chip that
filled the second into a millilitre field would be a density conversion done silently at
ratio 1, which §2 refuses, so `portionPresets` takes the field's unit and drops the
portions stated in the other. The twin keeps every portion its source published; what
narrows is only what the picker can enter. The cost is named: a gram serving on a
millilitre product loses the chip ADR-0052 §2 had kept for it, which is the same
degradation this section already accepts in the other direction.

### 7. The capture form offers three bases, and there is one basis type

The read-along form's toggle becomes three-way — `100 g` / `100 ml` / `serving` —
retiring ADR-0052 §5's "never offered, only inverted" clause. A user transcribing a
per-100 ml label can now say so.

`ai-autofill.ts`'s `NutritionBasis` is **deleted** and the module imports `Basis` from
`label-form.ts`. They were always one concept, the duplicate had been provably wrong
since #148 shipped, and `FoodStager.svelte:612` already assigns one into the other's
slot — a de facto assertion that they are the same type. Widening the duplicate would
leave the identical trap set for the next basis value.

`emptyAutofillResult()` keeps `per_100g` as the guided-manual starting point; a form
seeded from a millilitre twin still arrives through `invertServingSize`.

### 8. A contribution is suppressed when our basis unit and the pack's disagree

ADR-0052 §3 posts OFF's `100g` for either per-100 basis, on the reasoning that OFF
resolves that 100 to the product's own base unit. **That guarantee holds only while
our basis unit and the pack's agree**, and a three-way toggle can now break it: a user
may declare `100 ml` on a product whose `product_quantity_unit` is `g`, or the reverse
on a drink powder.

When the two disagree, `buildOffWriteBody` omits the entire nutriment set and
`nutrition_data_per`. Name, brand, category and ingredients still post — they carry no
unit and have no reason to be held hostage to one.

ADR-0052 §3 stated the principle this applies: "Writing a wrong basis into a public
database is a worse failure than showing a wrong number on our own panel." When
nothing on hand says which of the two units is right, posting is a coin-flip, and a
coin-flip is not a contribution.

### 9. Forward-only, and a logged receipt is never re-rendered

Existing logs keep the string they were written with. A drink logged before this
change reads `"330g"`; a new one reads `"330ml"`; they sit together in the same day
list. The arithmetic is identical either way — both bases divide by 100 — so the
artefact is cosmetic.

A logged quantity is **not** re-rendered from the twin's current panel. A Consumption
Event is a frozen receipt, and making one re-read under a later reading of its twin is
precisely what freezing `event/metrics` exists to prevent.

### 10. The refusal is silent

Nothing on screen explains that millilitres are unavailable on a gram-basis food. A
permanent line of copy would render on the overwhelming majority of foods to pre-empt
a need most users will never have on that food, and a negative affordance ages badly.
The volume portion chip is the whole of the affordance, and it is a positive one.

If this proves to hurt, [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)'s
precedent is to measure it rather than guess — and
[ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md) §2 forbids
opening a log channel with no reader, so that is its own ticket with its own bar, not
a hedge bolted onto this one.

## Consequences

**The mislabel is closed without a single number changing.** §3 is a relabel: the
figures a drink already produced were per-millilitre and stay per-millilitre. What
changes is that the screen now says so. This is the rare correctness fix with no
migration and no recomputation.

**Three tickets must land before anything is visible.** §5's spine is deliberately
invisible — nothing emits `"ml"` until the emit sites derive the unit from the panel —
which is what makes it safe to land first. The corollary is that a half-shipped arc is
worse than an unstarted one: emitting `"ml"` without §3's control would log a unit the
screen never named.

**A logged drink becomes uneditable unless the edit path widens with it.**
`resolveGramEdit` (`FoodView.svelte:247`), `changeLoggedFoodAmount` (whose doc says
"Only for gram-unit plain foods") and `IngredientAmountSheet` (whose comment declares
itself "Grams only") all gate on the gram unit. They widen in the same arc. This is not
scope creep; it is the difference between a feature and a regression.

**`unit_mismatch` becomes reachable in a new way.** Forward-only ingestion (§9)
guarantees a window in which a recipe holds a `"g"` row for a drink whose twin has
since been re-looked-up as `"ml"`. Adding that drink again fires
`addOrMergeIngredient`'s existing refusal — _"X is already in this recipe at a
different unit — edit its amount instead."_ That is left to fire with the copy it has:
the two rows genuinely are not in the same unit, and folding 330 ml into 200 g would be
the very conversion §2 refuses. An accepted cost, named rather than engineered around.

**The measuring jug is left without an answer for 78% of the corpus.** A user with
200 ml of olive oil and a per-100 g reference row must weigh it, and §10 means nothing
will tell them why. This is the largest thing this record forecloses, and it is
foreclosed on evidence rather than on preference — the corpus offers no way to tell a
fluid from a bowl of chopped vegetables. What would reopen it is a per-food density
that is _measured_ rather than derived: a curated table under
[ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)'s eligibility rules
would qualify, a constant never will.

**A volume serving basis is still unreachable.** `resolveServingSize`
(`label-form.ts:129`) stamps a literal `g` on a typed serving weight, and
`servingSizeGrams` rejects `"330 ml"`, so a "1 bottle = 330 ml" basis inverts to an
empty field. §7 fixes the per-100 case only. Picking this up means typing
`serving_size` properly instead of matching string literals — the fourth-basis warning
ADR-0052 left, now one value closer.

**Roughly fifteen Playwright assertions move.** `getByLabel("Quantity in grams")` is
load-bearing across `tests/food-ui.spec.ts` and `tests/visual-catalog.spec.ts:317`. The
rename in §3 is CI-visible and lands with its test changes or not at all.

**Eight products in a hundred still stamp the wrong basis**, unchanged from ADR-0052:
those are the ones OFF could parse no `quantity` from. §8 now means such a product also
declines to contribute its nutriments whenever the user corrects it to millilitres —
the suppression is doing its job, but the count of suppressed contributions will
exceed the count of genuinely ambiguous packs.
