# ADR 0052: A drink's panel is carried per 100 ml, read from the pack's own unit, and never converted to a weight

**Status:** Accepted  
**Date:** 2026-08-23  
**Amended by:** [ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §6 (§2's declined millilitre serving returns as a portion), §8 (§3's contribution is suppressed when the units disagree) and §7 (§5's hidden basis is offered)  
**Implemented:** #148 `547ca65` (one divisor), `3dc8520` (the read), `b91a4eb` (the write, the correction form, the row caption)

This record amends [ADR-0030](0030-expanded-food-twin-source-data.md) §2, whose
`food/portions` mapping gains a serving it declines to take, and
[ADR-0034](0034-label-photo-food-capture.md) §3, whose basis toggle resolves a third
value it does not offer.

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
from USDA's own volume portions over the 4,360 foods shipped when it ran: 958 foods (22.0%)
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
honestly is what makes that visible — a Recent row now says what its figure is per,
and every scaler divides by the basis rather than by an assumed 100. The amount
screen itself still prints no basis caption, so a drink staged from a scan shows a
gram field over a volume panel with nothing on screen naming the difference. That
gap is #127's to close. Making the arithmetic right needs the user to be able to say
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

## Amendment (2026-09-15): §2's unit is only trustworthy where the string it came from names one magnitude, and an absent unit is not a gram

§2 reads `serving_quantity_unit` to decide which of a `Portion`'s sibling fields a
serving's magnitude goes in. **That field can name a different token than the value
beside it**, and Open Food Facts knows: `normalize_serving_size` and
`extract_standard_unit` run different regexes over the same `serving_size` string
and prefer opposite ends of it — the first a greedy prefix, so the **last**
number+unit wins; the second unanchored, so the **first** does
([openfoodfacts-server#7768](https://github.com/openfoodfacts/openfoodfacts-server/issues/7768),
open, filed 2022). Where the string holds one number+unit token the disagreement is
invisible. Where it holds two, the number and the unit describe different things.

Confirmed live on product `19105994` at the date of this amendment:

```json
{
  "serving_size": "15g + 250mL",
  "serving_quantity": 250,
  "serving_quantity_unit": "g"
}
```

**The defect is not principally a mislabelled unit.** Of ten at-risk rows classified
by hand in [#433](https://github.com/palebluebytes/inventoria/issues/433), five were
wrong in both fields, three in the value alone, and **none in the unit alone**. Eight
were the same product shape — a powder you prepare with milk — where the quantity OFF
picked names **the milk rather than the food**: `15 g + 200 ml de lait` becomes a 200
unit serving of cocoa. So re-reading the unit out of the string, which is what §2's
own machinery would suggest, is not a fix. It turns `19105994` into 250 ml _of
chocolate powder_ — a different wrong answer — and repairs nothing at all for the rows
whose unit was already right.

### The rule

**A serving whose `serving_size` names more than one distinct magnitude emits no
portion.** A string every token of which restates one magnitude keeps it, in whatever
units it restates it: `15 biscuits (85g/2,998 Oz)` names 85 g twice, and
`35.7 g (1 tranche (environ 35.7 g))` names it twice in the same unit. Two tokens
count as one magnitude when they resolve to the same unit and stand within **10%** of
each other.

That tolerance is set above every label rounding rather than below the nearest defect,
because the two populations are nowhere near each other. A label rounds its conversion
to a number a person reads, and that is worth more than the odd percent: `1 oz (28 g)`
is 1.2% out, but `2 oz (60 g)` is 5.5% and `250 ml (8 fl oz)` 5.4%, and all three are
one magnitude said twice. The widest across the dual-unit shapes a US label mandates
is 5.5%. The same-unit disagreements the rule exists to catch stand **96% apart or
more** — `8 ml (240 ML)`, `33.8 ml (1 L)` — and a disagreement across units is refused
on the unit whatever the tolerance is. A first cut at 5% sat inside the rounding band
and would have dropped the chip on exactly the benign US dual-unit rows the correction
comment counts in their hundreds.

`namesMoreThanOneMagnitude` (`src/lib/food/serving-size.ts`) is the whole of it, asked
once by `offPortions`. §2 is otherwise unchanged: a stated `serving_quantity_unit`
still decides the unit, and a millilitre serving still emits a millilitre portion
([ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §6) — but only where the
string it was parsed from names one thing. What §2 did not say, and what the second
rule below settles, is what decides the unit when OFF states none.

### Measured, and worth less alarm than it reads

The rate is **not** settled, and two samples disagree by about 18x because they sample
different populations. A random sample of 1,000 products from OFF's search API put the
at-risk shape at 1.3% of serving-bearing products and genuinely wrong rows at 1.1%. An
audit of 229,348 records from OFF's JSONL export put the same shape at 1.11% but the
genuinely wrong rows at **0.059%** — that export is barcode-ordered, so its head is
almost entirely US/UPC products, whose labels mandate the benign dual-unit
`85 g (3 oz)` shape and which barely include the European powder-plus-milk products
that dominate a random draw. The honest bound is roughly **0.06% to 1.1%**, and
pinning it needs a full pass over the 12.9 GB export. Corpus-wide counts that are
exact, verified against the full CSV export: 4,535,553 products, 1,446,030 with a
`serving_size`, 1,424,836 with a `serving_quantity`, 21,207 whose `serving_size` OFF
could parse no quantity out of at all.

The calorie exposure is smaller again. Seven of the eight wrong products in the
hand-classified set publish only `*_prepared_*` nutriments, and `offPayload` reads
`*_100g` exclusively, so they arrive with a portion and **no panel** — there is
nothing for the bad magnitude to scale. Exactly one carried a plain panel, at a 1.7x
overstatement. What the rest cost is a row reading "200 g" of a food nobody weighed,
and a millilitre wearing a gram's label, which is the invariant
[ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §2 exists to hold.

This is a correctness fix, not an urgent one, and the cost is symmetrical: a little
over 1% of serving-bearing products lose their one-tap chip. The panel is untouched —
it is read from `product_quantity_unit` (§1) — so every one of them stays fully
loggable by typing an amount.

### The second rule: an absent unit is not a gram

An **absent** `serving_quantity_unit` is the same defect through a missing field
rather than a wrong one. `isMillilitres(undefined)` is false, so `offPortions` took
the grams arm and a volume was stored as a weight — the audit found 43 such rows
carrying one (`'8 ml (240 ML)'`, `'33.8 ml (1 L)'`), and 1,092 at-risk rows in all
state no unit. The rule above catches those only **incidentally**, where they happen
to name two magnitudes.

**So the unit is read off the label where OFF states none, and the portion is refused
where the label names none either.** The grams arm is no longer reachable by
falling through it: it is taken because something said grams.

Reading the unit off the label here is **not** the option ruled out above, and the
distinction is the whole of its soundness. That option re-read the unit out of a
string naming **several** magnitudes, where it picks one token's unit to sit beside
another token's number. This reads a string naming **one**, which the rule above has
already established by the time the question is asked — there is a single token, so
the quantity and the unit cannot have come from different ones.

Two facts from `lib/ProductOpener/Units.pm` (read 2026-09-15) carry it:

- `normalize_serving_size` matches `(?<quantity>…)( )?(?<unit>$units_regexp)\b`, so a
  `serving_quantity` **exists only where a unit from OFF's vocabulary was matched**.
  A quantity with no unit token anywhere in its label is very nearly a contradiction,
  which is what keeps the refusal arm narrow.
- It returns `unit_to_g($q, $u)`, so the quantity is **already in the standard unit**.
  Reading the sole token's standard unit — `ml` for a `33 cl`, `g` for a `2 oz` — is
  therefore reading the unit the number beside it is actually in, not the unit it was
  written in.

That second rule is what makes the reader's **vocabulary** load-bearing, and it is now
OFF's own: every entry in `taxonomies/units.txt` whose `standard_unit:en` is `g` or
`ml`, with that entry's `conversion_factor:en`, and **every synonym in any language
written in unaccented Latin letters** — 303 spellings over twelve units, no two of
which disagree about what they mean.

A narrow vocabulary is wrong in both directions, and the second rule is what makes the
second direction expensive. An unreadable token cannot become the second magnitude
that refuses a bad string, so `15 gr + 250mL` slips through the first rule. And under
the second, an unreadable token costs a good portion outright: a first cut at this
work carried the English and French synonyms only, which quietly refused `30 gramos`,
`30 Gramm` and `30 grammi` — labels OFF parses correctly and whose portions were never
wrong. Matching OFF's vocabulary exactly is also what makes the refusals honest in the
other direction: a string OFF cannot parse yields no `serving_quantity` at all, so it
never reaches this question.

Two families of OFF's units are deliberately **excluded**: `cup`/`tasse`, the teaspoon
and the pinch. OFF prices a cup at 240 ml, but those millilitres are a convention
rather than a measurement, and a cereal label reading `1 cup (30 g)` is one serving
stated two ways. Admitting the cup would turn the commonest good US label into a
refusal — a household measure beside a weight is how a label states a serving, not a
conflict.

### What these rules still refuse that a cleverer one would keep

Three shapes, all costing a chip rather than storing a wrong figure: a magnitude
restated as a product (`100 g (2 x 50 g)`, where the 50 stands alone as a second
magnitude); a genuine restatement rounded harder than 10%; and a serving whose
quantity OFF states with neither a unit of its own nor a readable one on the label.
None appeared in the audit, and all three fail in the safe direction.

A `serving_quantity_unit` that is **present but names neither gram nor millilitre** is
still read as grams, which §2 decided and this amendment does not reopen. OFF's own
`get_standard_unit` returns only `g` or `ml`, so the field should not hold anything
else; nothing has measured whether it does.

**`ADAPTER_VERSION` moves to `"11"`** — `"10"` for the first rule, `"11"` for the
second — and, as with every widening in this adapter, both are forward-only: a product
already in the ledger keeps the portion it was given until it is looked up again.

**ADR-0108's Density Classes do not help here.** A class converts a volume the _user_
asserted for a food they are holding. This is a mislabelled import, and no class is
asserted at scan time.

## Amendment (2026-09-15): the vocabulary is what OFF parses, not what this app can store, and a foreign unit is not a gram

The amendment above set the reader's vocabulary to "every entry in
`taxonomies/units.txt` whose `standard_unit:en` is `g` or `ml`", and excluded two
families inside even that: `cup`/`tasse`, the teaspoon and the pinch. Both bounds
were wrong, and #459 measured how wrong against 11,521 real rows carrying a
`serving_size` — four daily deltas, `1789107652..1789452670`, read with OFF's own
stored `serving_quantity` and `serving_quantity_unit` beside each string.

### The scope was a subset of OFF's, and OFF's is the whole taxonomy

`init_units_names` builds `$units_regexp` over `get_all_taxonomy_entries("units")`
with **no filter on the standard unit** (`lib/ProductOpener/Units.pm`, read
2026-09-15). Every entry is matchable, and `unit_to_g` converts with whatever
`conversion_factor:en` the matched entry carries — so an energy, a percentage and a
water hardness are each a token `normalize_serving_size` will read a
`serving_quantity` off exactly as readily as a gram. `83 kcal (30 g)` is stored as
**30 with the unit `kj`**.

Scoping the reader to the entries this app can _store_ therefore made a token OFF
_parses_ invisible, and an invisible token cannot be the second magnitude that
refuses a string. The vocabulary is now the whole taxonomy: 507 spellings over 31
units, each with its own `standard_unit:en` and `conversion_factor:en`. Two
magnitudes in one standard unit compare; two in different ones never do, which is
the whole of what a unit this app cannot store is needed for.

The unaccented-Latin bound stays, and is now measured rather than assumed: of the
11,521 rows, **none** named a unit in a spelling that needs an accent to write.

### The household measure was excluded on a premise the corpus refutes

The argument was that `1 cup (30 g)` is one serving stated two ways and that
admitting the cup "would turn the commonest good US label into a refusal". That is
true of the label and false of OFF's parsers, which is the only thing §2 is about.
The cup is in `$units_regexp` and priced at 240 ml, so it decides
`serving_quantity_unit` while the gram token decides `serving_quantity`. Verified
live on 0094184560590: `0.25 cup (30 g)` is stored as **30 `ml`**. A 30 g bowl of
cereal was being imported as 30 millilitres.

Measured over the corpus, with a stored pair counted wrong when the string names no
token of that size in that unit:

|                                          | rows    |
| ---------------------------------------- | ------- |
| stored pair names no token of the string | 219     |
| the rule dropped the portion             | 8       |
| **the rule kept it**                     | **211** |

206 of those 211 named a `cup`, `Cup`, `cups`, `tasse` or `taza`.

The cost the exclusion was protecting is 291 portions the complete vocabulary now
drops, and it does not survive being itemised: **274** have their number from one
token and their unit from another — exactly what §2 exists to drop — **8** are
arithmetic coincidences that are wrong anyway (`1 cup (240 g)` stored as 240 ml,
where the cup's 240 ml happens to equal the label's 240 g), and **9** are genuinely
right. All 9 are stale rows stored in `g` from before OFF taxonomised the cup; they
become `ml` the next time OFF recomputes them. Nine right portions in 11,319, on a
timer, against 282 wrong ones.

`1 cup (240 ml)` is still one magnitude and still keeps its chip, because the cup's
own price and the label agree. That is the shape the exclusion was reaching for, and
a conversion keeps it where a blind spot could not.

### The trailing `\b` is OFF's and is kept exactly

A unit's match must end where OFF's ends. `normalize_serving_size` terminates on
`\b`, so a `%` before a space or the end of the string is **not** a token OFF can
see — there is no word boundary after it. A reader that saw one would refuse strings
OFF reads correctly, so the reader keeps `\b` and declines those. The three rows in
the corpus that still slip past the rule are of exactly this shape (`8 f (240 ml)`,
`15 % vrn (65 g)`): their stored unit came from a token no current OFF could match
either, and the rule below catches them instead.

### A `serving_quantity_unit` that is neither gram nor millilitre

The amendment above left this open in as many words — "nothing has measured whether
it does". It does. Six of the 11,521 rows state a `serving_quantity_unit` of `kj`,
`mmol/l` or `%`, because OFF writes whatever `standard_unit:en` the matched token
carries and eighteen taxonomy entries carry something else.

`isMillilitres` is false for every one of them, so the `ml`-else-`g` pair stored each
as a **weight**: 0048500206836's `8 f (240 ml)` became a 240 g serving. That is
ADR-0060 §2's invariant broken through a foreign unit rather than a missing one, and
it is the same refusal ADR-0048 §3 already makes for an absent measure. A serving
unit that is neither `g` nor `ml` now emits **no portion**. `soleMagnitudeUnit`
declines on the same ground: it reads an energy so that the energy cannot be mistaken
for a second gram, and then refuses to call it a weight.

### What it comes to

End to end over the corpus, counting a portion wrong when the string names no such
magnitude in that unit: **208 wrong portions before, 0 after**, out of 10,998 the app
still emits.

**`ADAPTER_VERSION` moves to `"12"`**, forward-only like every widening above it: a
product already in the ledger keeps the portion it was given until it is looked up
again.
