# ADR 0052: A drink's panel is carried per 100 ml, read from the pack's own unit, and never converted to a weight

**Status:** Accepted  
**Date:** 2026-08-23  
**Implemented:** #148 `547ca65` (one divisor), `3dc8520` (the read), `b91a4eb` (the write, the correction form, the row caption)

## Context

Open Food Facts publishes a liquid's nutriments **per 100 millilitres** under the
very same `*_100g` keys it uses for a solid. Its API reference says so plainly:
each nutrient is quoted "per 100g or per serving … in a standard unit (g or ml)".
`mapOffProductToPayload` stamped every panel it built with `PER_100G`, so a can of
cola arrived in the ledger declaring a weight basis it never had.

Three limbs of the defect were reported in
[#148](https://github.com/palebluebytes/inventoria/issues/148), split out of
[#127](https://github.com/palebluebytes/inventoria/issues/127) so the correctness
half could land without waiting on the larger "let a user type millilitres"
design. The magnitude is the density: negligible for water, 3–4% for milk and
juice, around 9% for an oil, and always silent.

### What OFF actually declares, measured 2026-08-23

The ticket proposed reading the basis from `nutrition_data_per`. **That field
cannot carry it.** Its enum is `serving` and `100g`, in both
[`product_nutrition.yaml`](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/schemas/product_nutrition.yaml)
and the write
[`add_or_edit_a_product.yaml`](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/add_or_edit_a_product.yaml).
There is no `100ml` value to read or to post. Across 100 products sampled from
OFF's `beverages` category it was absent on 74, `100g` on 24, `serving` on 2, and
`100ml` on none; Coca-Cola `5449000000996` is a 330 ml can whose sibling
`5449000131805` reports `nutrition_data_per: "100g"`.

Two other fields do declare the unit, each documented as "either g or ml":

- **`product_quantity_unit`**, computed from the pack's own `quantity`. `ml` on 69
  of the 100. This is the unit OFF's 100 resolves to, so it is the panel's basis.
- **`serving_quantity_unit`**, the unit of the normalised serving. `ml` on 57.

They are two questions, and they genuinely disagree in both directions. Five of
the sample were drink powders — a cocoa sold by the 260 g tin whose serving is the
prepared 100 ml — where the panel is per 100 g of powder. Six were the reverse:
Alpro's 1 L oat and soy cartons, published per 100 ml with a serving OFF holds as
100 g. A single field would have been wrong for eleven of a hundred.

### Why conversion was refused

[ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §3 already forbids it: no
panel's energy is ever computed from other fields, "not by rescaling an assay to
an assumed dry or wet basis". `energy_per_100g = energy_per_100ml × density`
computes a measurement from another measurement plus a number we supplied, and
`twin/raw_provenance` promises a record OFF actually served. A per-100 g panel for
a product OFF publishes per 100 ml exists nowhere.

The corpus is the secondary argument. #148 re-measured deriving a per-food density
from USDA's own volume portions over the 4,360 shipped foods: 958 foods (22.0%)
carry a volume-named household portion, but the largest categories are `Legumes`,
`Vegetables` and `Dairy and Egg`, where "1 cup, chopped" is a bulk density and not
a fluid one. Median derived density across all 1,339 volume portions is 0.854, p10
0.372. Narrowing to Beverages, Fats and Oils and Dairy leaves 540 whose widest
members are dried acid whey at 0.196 and shredded parmesan at 0.338, and a flat
1.0 fallback is off by more than 5% on 309 of them. There is no reliable
"is this a liquid" signal in the corpus. It would be a bad conversion; it is a
forbidden one first.

### What the scalers turned out to be doing

`factor = amount / basis` is five sites, and two of them ignored the basis:
`LogFoodSheet.svelte` and `FoodStager.svelte` each divided by a literal 100 while
`FoodAmountPanel.svelte`, `deriveRecipeNutrition` and `changeLoggedFoodAmount`
divided by the panel's own. So they already disagreed, on any panel not measured
per 100 — a `gtin:` twin corrected from its label to a `"30 g"` serving and
restaged from a re-scan reads its preview at grams/30 and logs at grams/100. That
divergence predates this record, but adding a second per-100 basis to a codebase
carrying it would have put a fresh silent error into the one path that freezes
`event/metrics`, which history never recomputes.

**Scope.** This record covers the basis of a panel Inventoria _ingests_ and the
portion it derives from a serving. It does not accept millilitres as an **input**
unit anywhere: recipe ingredients keep their `"g" | "serving"` union, `event/quantity`
keeps its grams, and the correction form's toggle still offers two choices. That
is the rest of #127 and wants its own record.

## Decision

### 1. The panel basis is read from `product_quantity_unit`

A product whose `product_quantity_unit` is `ml` carries `serving_size: "100 ml"`
(`PER_100ML`); everything else, including a product OFF parsed no quantity from,
carries `"100 g"`. The values themselves are mapped across untouched. The basis is
never read from `nutrition_data_per`, which cannot express it, nor from
`serving_quantity_unit`, which answers a different question.

`nutrition/info.serving_size` is therefore a three-valued basis in practice —
`"100 g"`, `"100 ml"`, or a serving the panel names — and every reader treats it
as data rather than assuming the first.

### 2. A millilitre `serving_quantity` emits no portion

A `Portion` is a labelled gram weight and nothing more
([ADR-0030](0030-expanded-food-twin-source-data.md) §2), so a 330 ml can stored as
`grams: 330` is a volume masquerading as a weight. `offPortions` already returns an
empty list for any serving it cannot use; a `serving_quantity_unit` of `ml` joins
that rule. Better no portion than a wrong one.

A gram serving on a millilitre product keeps its portion. The unit of the serving
decides the portion; the unit of the pack decides the panel.

### 3. Both per-100 bases post OFF's `100g`

`buildOffWriteBody` declares `nutrition_data_per: "100g"` for a `"100 g"` panel and
for a `"100 ml"` one alike. OFF resolves that 100 to the product's own base unit,
which is exactly why a 330 ml Coca-Cola reads back `"100g"` — so `100g` is what OFF
itself stores for a drink, and it is the only per-100 value the enum admits.

This clause is a guard as much as a mapping. Left alone, a `"100 ml"` panel would
have fallen through to the per-serving branch and declared the entire nutriment set
as one serving of "100 ml", which is a corruption of a public database that did not
exist before this record.

### 4. One divisor, and every scaler reads it

`parseBasisQuantity` (`src/lib/food/nutrition.ts`) is the single answer to "what is
this panel measured against". It returns the quantity, not grams: a per-100 ml panel
divides by its own 100 like any other. A basis naming no quantity — a bare
`"1 serving"` — falls back to 100 rather than to the `1` a `parseFloat` finds in it.
No site derives that divisor for itself.

### 5. A basis the correction form does not offer is still preserved

The read-along label form's `Basis` union gains `per_100ml`. The toggle never offers
it: it is only ever inverted back out of a twin whose panel already carried it, so
correcting a drink's values keeps its basis instead of restamping it as a weight on
save. Choosing "serving" and back is an explicit user action and resolves to grams.

### 6. Forward-only

`ADAPTER_VERSION` moves to `"8"` and drinks already in the ledger keep their old
stamp until they are looked up again. Every prior widening in this adapter was
forward-only and this one follows, in preference to a one-shot repair pass over
`twin/raw_provenance`.

## Consequences

**The residual is disclosed rather than hidden.** A user who types 200 against a
per-100 ml milk panel is still off by the density, about 3%. Labelling the basis
honestly is what makes that visible — the amount screen and the Recent row now say
what a figure is per. Making the arithmetic right needs the user to be able to say
"330 ml", which is #127. If anything converts, it converts the user's entry at the
point of logging, where the volume is stated rather than assumed.

**Drinks lose a portion chip they used to have.** A 330 ml can previously offered
"1 can (330 ml)" as a one-tap 330 g preset. It was wrong by the density and it is
now absent, so the amount has to be typed. That is the cost of §2 and it is
deliberate: 57 of 100 sampled beverages carried such a serving.

**A pre-existing divergence is closed, and it changes logged numbers.** The two
scalers that ignored the basis now agree with the three that did not. Any food whose
panel is not per 100 — a label-corrected twin with a weighed serving — logs a
different figure than it did yesterday. Events already frozen are untouched, by
design.

**Eight products in a hundred keep a wrong stamp.** Those are the ones OFF could
parse no `quantity` from, so `product_quantity_unit` is absent and the per-100 g
default applies. Two of the sample were mineral waters, where the density error is
nil. Corroborating from `serving_quantity_unit` would rescue some of them and would
also mis-stamp the five drink powders, which is the worse trade.

**Forward-only leaves the ledger mixed.** Drinks scanned before this change still
declare "100 g", and nothing prompts a re-lookup — the scan path short-circuits on a
local twin. Re-mapping them from their stored `twin/raw_provenance` needs no network
and stays available if the mix becomes a problem.

**The three-valued basis is a new invariant to hold.** Anything that compares
`serving_size` to `PER_100G` to mean "is this a per-100 panel" is now wrong, and the
compiler cannot say so because the field is a string. §4 keeps the arithmetic safe;
the comparisons are in `buildOffWriteBody` and the correction form's inversion, and
a fourth basis would want the field typed rather than a third literal added.
