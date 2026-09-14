# ADR 0105: A recipe occasion is sized by the weight you put on the scale

**Status:** Accepted  
**Date:** 2026-09-14  
**Amends:** [ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md) (its servings amendment left the count as the only way to say how big an occasion was, and its logged quantity is a literal rather than a measurement)  
**Charted by:** #428  
**Implemented:** §6 (the count admits a fraction) and §8 (the quantity stops being a literal) — #424. §1 to §5 and §7, the batch weight itself, are not built.

## Context

[ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md)'s servings
amendment settled how an occasion is sized, and argued it well:

> It replaces a ×/÷ scaler on the ingredient amounts. Halving every amount by
> hand was only ever a way of saying "this makes fewer" — an operation that
> rewrote the ingredients to express a fact about the batch. Asking for the fact
> directly leaves the amounts as the cook entered them.

The fact it asks for is a count. What it did not weigh is that a cook with a
scale knows a different one: a pot of stew divided into portions is one fact, and
250 g of it on a plate is another. Neither is derived from the other without
knowing what the pot weighed.

### The count could not hold a fraction

`#recipe-servings` shipped as `type="number" min="1" inputmode="numeric"` with
the default step of 1. Half a portion was out of the spinner's reach, and the
phone keypad `inputmode="numeric"` produces has no decimal point to type one
with. On this app's floor platform a fraction of a serving was not merely awkward
but unsayable.

### Every instantiation told the day it was one serving

`logRecipeConsumption` wrote the string literal `"1 serving"` as
`event/quantity`, whatever the cook had said. In the model's own terms the
literal is defensible — the function freezes `Σrows ÷ yield`, which is one
serving of the batch the rows describe — and that is exactly why it read wrong:
the instantiation editor scales its rows to the occasion and holds the yield at
1, so "one serving" of those rows is however many servings were actually asked
for. The metrics were right; the sentence beside them was not, and the count
reached the ledger nowhere.

It was also a write site that did not spell its quantity through `quantityLabel`,
which [ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §4 makes the
single one.

### The gap nobody had written down

The obvious repair is to give the occasion a weight by summing its rows. That
repair was built, and it is wrong for a reason no record in this repo had ever
stated: **a pot does not weigh what went into it.** A stew simmers off water,
rice absorbs it, a roast renders. Σ of the raw ingredient amounts and the weight
of the finished dish are different quantities, not an approximation of one
another.

A search for the distinction across `docs/adr/`, `CONTEXT.md`,
`docs/eavt-vocabulary.md` and `src/lib/food/` finds nothing: not decided, not
deferred, not scoped out. ADR-0022 §2's phrase _"the batch as cooked"_ means the
amounts as the cook put them in, and `recipe/yield` cannot absorb the difference
because it is dimensionless everywhere it appears.

A row sum also inherits a problem it need not have. Ingredient amounts carry
their own units (ADR-0060 §1), so a recipe mixing 100 g of flour with 330 ml of
milk has no single sum at all without the density conversion ADR-0060 §2 refuses.
That constraint is real for a derived measure and evaporates entirely for a
measured one.

## Decision

### 1. An occasion is a fraction of a batch the cook weighed

The instantiation surface asks what the finished dish weighed and how much of it
was eaten. The second divided by the first is the fraction of the recipe this
occasion was.

Nothing is derived and therefore nothing needs converting: the ingredient rows'
units stop bearing on the question, and a recipe containing a millilitre
ingredient is sized exactly like one that does not. This is a measurement the
cook made, which [ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md)'s
own reasoning has always held apart from a figure the app computed — _"the user's
own entry, where the volume is stated rather than assumed"_.

### 2. A batch weight is always grams

It takes no `g | ml` union. A batch weight has no panel to read an Amount Unit
off, and exactly one honest source: a scale.

Admitting millilitres would mean asking "which?" about a number that can only
have come from one place, and would let a pot's weight and its rows disagree
about units to no purpose. A cordial measured in a marked jug is what this
loses.

### 3. The template remembers one; the occasion may override it and never writes back

`recipe/batch_weight` sits on the Recipe Twin as a default, because a recipe
cooked weekly comes out about the same weight each time and retyping it is a
tax. An instantiation may override it for that occasion.

**The override never reaches the template.** ADR-0022 §3 is explicit that
_"instance edits are instance-only… a template edit is a separate deliberate
act"_, and that decoupling is what the whole snapshot model rests on. A batch
weight is not special enough to be the first thing through it. The "you keep
bumping avocado to 60 g, update the recipe?" affordance ADR-0022 deferred is
where a write-back belongs, as a feature for every field rather than a one-off
for this one.

### 4. The template keeps both numbers

"Makes (servings)" and a batch weight are both asked for, and `recipe/yield`
survives unchanged.

They answer different questions and neither derives the other: 900 g in the pot
says nothing about whether the cook thinks in four portions or six, and "makes 4"
says nothing about what to expect on the scale. `recipe/yield` is also
schema.org's `recipeYield`, the divisor in `deriveRecipeNutrition`, and frozen on
every instantiation ever logged.

### 5. The fraction scales the rows, and the snapshot records what it was a fraction of

The rows freeze at the fraction eaten, following the servings amendment's own
choice that an instantiation's rows _"record what was eaten rather than what was
cooked"_.

`event/instantiation` gains `batch_weight`, so a logged occasion says 160 g of a
480 g pot, and forever. Without it the snapshot carries a numerator whose
denominator is gone: a correction reopening the editor to say "actually I ate 200
g" would have nothing to divide against, and ADR-0022's principle that a logged
occasion is a self-contained historical reading would be false of it.

### 6. The serving count becomes a read-out, and admits fractions

The count still appears, and still means "how many servings this occasion is",
but it is derived from the weight rather than typed into. 250 g of a 400 g
serving reads 0.625 of one.

Where it remains editable it takes `step="any"` and `inputmode="decimal"`, with
no floor on the widget; non-positive values are refused by the handler, which can
say why. A whole-number field could not display what the weight beside it sets,
quite apart from being unable to say "half a portion".

### 7. An unweighed recipe falls back to the count alone

A recipe nobody weighed offers the servings control and nothing else, exactly as
ADR-0022's amendment left it.

It does **not** fall back to the row sum. That is a different quantity from the
pot weight, and offering it in the pot weight's place would seed the field with a
number wrong in a direction nobody can predict. "I didn't weigh this" has an
honest answer already, and it is the count.

### 8. `event/quantity` records what the cook entered

The weight, when one was given; the serving count when none was. Either way it is
spelled through `quantityLabel`, which ADR-0060 §4 makes the single write site,
and it is what the day's row shows.

A logged recipe is no longer reported as one serving regardless of what was
asked for.

## Consequences

- `recipe/batch_weight` joins `docs/eavt-vocabulary.md` under `recipe/`, and
  `batch_weight` joins the `event/instantiation` shape. **Batch weight** joins
  `CONTEXT.md`.
- ADR-0022's invariant `headline == Σrows ÷ yield` is untouched. This record
  changes what sets the rows, never how they sum.
- **Recipe Instantiations must leave the Recent catalogue.** The exclusion rode
  on the literal: every instantiation wrote `"1 serving"`, so `isCatalogueFood`
  (ADR-0035 §6) took its whole-serving arm, found no reusable
  `food/manual_entry` on the recipe twin and dropped it. Once a quantity says
  what it means, that arm stops being taken and every recipe appears in the row
  as a twin with no panel. The rule is restated where it belongs, as a fact about
  what a recipe is.
- **Forward-only.** Instantiations logged before this keep `"1 serving"`, which
  `parseLoggedQuantity` still resolves as it always did. Nothing is rewritten:
  they are snapshots, and a past occasion's quantity is a historical reading.
- A copy carries the better sentence, since `copyPastMeal` takes the quantity
  verbatim (ADR-0058 §2).
- **The ×/÷ scaler and the amount sheet stay closed to instantiations.** A recipe
  is corrected on its own editor, which is where the weight lives; neither
  exclusion is reopened here.
- A draft record deriving the occasion's weight from the row sum was written
  against #424 and never committed. It is deleted rather than superseded: the
  rule that records are never deleted governs records that shipped, and a
  superseded record nobody could ever have read is a worse artefact than none.
