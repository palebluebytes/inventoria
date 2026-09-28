# Research: where a food's name starts, and whether a hand list can say (#164)

**Status:** measured. §§1-6 are the pre-registration, committed at `b43c3f34`
**before** the sweep so it demonstrably predates the numbers — the arrangement
[#159](https://github.com/palebluebytes/inventoria/issues/159) used and the
reason its own result could be believed.
**Grounds:** the committed `public/usda/search-index.json`, `schema_version` 10,
2,023 rows, read through the shipped `searchIndexRows`.
**Date:** 2026-09-16.
**Owns:** [#164](https://github.com/palebluebytes/inventoria/issues/164). The
eight defects stay [#159](https://github.com/palebluebytes/inventoria/issues/159)'s.

---

## 1. Why this is being run now

[#164](https://github.com/palebluebytes/inventoria/issues/164) records four
measured dead ends and proposes nothing. Three things have changed since, and
each of them moves the question rather than the answer.

**Both tickets' own figures have rotted.** #164 argues that `raw` cannot sit
above `tier` because it "touches 1,445 of 4,335 rows (33%)". Today it touches
**1,047 of 2,023 — 51.8%**, so that objection is stronger than when it was
written, not weaker. The shelf-label population has moved the other way: 760 rows
of 4,238 when [ADR-0042](../adr/0042-usda-search-reference-foods.md)'s #154
Amendment measured it, **549 of 2,023** now.

**The corpus underneath every one of the four measurements is gone.** They were
swept at 4,312 and 4,335 rows, before ADR-0103's collapse and ADR-0104's
deletion. Mechanism 1's headline cost — 163 moved leads, six failing tests — is a
number about a corpus that no longer exists, and the list of leads it names as
casualties (`basil`, `coriander leaf`, `milk`, `cheese`, `salmon`) was read off
that corpus too.

**The machinery for a baked per-row fact is now routine.** Schema 10 landed this
week and the generator already bakes two ranking facts a row cannot answer about
itself, `plain_sibling` and `raw`.

## 2. The mechanism, stated exactly

`compileReferenceFoodQuery` computes `tier` by walking the **head phrase**:

```ts
for (let i = 0; i < headLength; i++) { … }
```

`readReferenceFoodName` already computes where the food's own name starts and
ends — `shelfLength` and `nameLength` — and `tier` is not allowed to read either.
Only `position` and `accounted` do, and both sit below `tier`, so neither can
ever reach a tier gap.

The candidate is that loop walking `[shelfLength, nameLength)` instead. Nothing
else changes: no key moves slot, no roster grows, no field is added.

For `almond`, that is the whole of the defect:

| row                               | head          | name          | tier today | tier under the candidate |
| --------------------------------- | ------------- | ------------- | ---------: | -----------------------: |
| `Nuts, almonds, whole, raw`       | `Nuts`        | `almonds`     |         20 |                   **50** |
| `Almond milk, unsweetened, plain` | `Almond milk` | `Almond milk` |     **40** |                       40 |

## 3. The correction this note makes to #164's own proposal

#164's first sketch is "a per-row _the name starts here_ offset, baked at
generation rather than derived from a head-phrase roster at read time".

**Baking it is not a different mechanism.** An offset computed at generation from
the same 18-label roster carries exactly the information `shelfLength` carries
at read time, so it must produce exactly mechanism 1's leads, exactly mechanism
1's failures, and exactly mechanism 1's 163. Moving a computation earlier does
not change what it computes.

**The only thing baking buys is that a row can be overridden by hand** — the
shape `ADJUDICATED_NAMES` (7 entries), `ADJUDICATED_DISHES` (14),
`ADJUDICATED_VARIANTS` (40) and the twin ledger (190 pairs) already have here.

So the real question is not "does mechanism 1 work" — it is known not to — but:

> Of the leads mechanism 1 moves, how many are **wrong**, and is that set small
> enough to be carried by a hand list rather than by a rule?

That is answerable without shipping anything, and it is what this note measures.

## 4. The query set, fixed in advance

The construction [#465](https://github.com/palebluebytes/inventoria/issues/465)
swept, restated here rather than referenced so it cannot quietly change:

- every shipped row's head phrase, and every word of every head phrase
- every distinct word the shipped names contain
- the adjudicated heads of `143-gold-set.json`
- every phrase the vocabulary expands to

Deduplicated, and every query run through the real `searchIndexRows` over the
committed index. The exact count is reported with the result and is not a band
clause.

## 5. The band

Pre-registered. A clause that fails is a refusal, not a target to tune toward.

1. **Every moved lead is read by hand** and classified `better`, `worse` or
   `neutral`. No sampling, no bucketing by category, and the full table ships in
   this note whatever the verdict.
2. **The `worse` set is at most 25 rows.** Above that the mechanism is refused as
   unadjudicable, on the ground that 40 is the largest hand list in this repo
   that decides anything ranking-adjacent (`ADJUDICATED_VARIANTS`) and a list
   correcting a _ranking_ rule must be smaller than one deciding what ships.
3. **The twelve protected leads of #159 do not move**, all twelve verified
   present today: `cottage`, `ginger`, `horse`, `melon`, `tomato`, `soybean`,
   `apricots`, `soy flour`, `winged bean`, `turkey breast`, `turkey thigh`,
   `beef composite`. No exception is pre-granted, unlike #159's `horse`.
4. **`143-gold-set.json`'s `should_lead` does not regress** from its current
   count, measured immediately before the sweep and stated with the result.
5. **The whole unit suite is run, not read.** Every broken pin is reported with
   its file and its assertion. #159 failed this clause with three undeclared
   breaks in tests nobody thought the change touched, and the lesson recorded
   there is that reading the suite for the pin a change _ought_ to touch is not
   running it.
6. **ADR-0055 §1's window holds.** Designated rows inside the 50-row result
   window must not fall in total across the sweep. This is the red line that
   disqualified #159's `designated` half after its lead-level self-gating looked
   clean, and it is asked of the window rather than of the lead for exactly that
   reason.

## 6. What happens on a failure

**Report and return.** The band's numbers go in this note and the refusal goes in
ADR-0042's record beside the other five, with the count that refused it.

The candidate is **not** narrowed after seeing which cases spoiled it. #159's
pre-registration forbids that in so many words, and its `designated` half is the
worked example: left unshipped precisely because the only version that passed was
the one chosen with the failures already in view.

A hand list assembled from the `worse` set is **not** a narrowing and is what
clause 2 exists to price — but only if clause 2 passes on the count measured
before any list is written.

---

# The result

Run 2026-09-16 at `b43c3f34`, patch-and-revert on
`src/lib/food/reference-food-ranking.ts`. **Nothing shipped** — the ranking is
untouched, the tree is clean and the suite is green at 3,363.

## 7. Against the band

| clause                              |                              |                                           |
| ----------------------------------- | ---------------------------- | ----------------------------------------- |
| 1. every moved lead read by hand    | **pass**                     | 82 moved, all classified in §9            |
| 2. `worse` set at most 25 rows      | **FAIL**                     | **30 rows** (34 queries)                  |
| 3. twelve protected leads hold      | **FAIL**                     | **3 moved**: `cottage`, `ginger`, `horse` |
| 4. gold `should_lead` no regression | **pass**                     | **9 of 28**, unchanged                    |
| 5. whole suite run, breaks reported | pass, and the clause is weak | **13 broken pins** in 2 files             |
| 6. ADR-0055 §1's window holds       | **FAIL**                     | designated in window **396 → 394**        |

**Verdict: refused.** Three clauses fail, and §6 says report and return. The
candidate is not narrowed, the ceiling in clause 2 is not moved, and the 30 rows
are not turned into a hand list here.

**Clause 5 is a flaw in this band and the flaw is recorded rather than patched.**
It says the suite is run and every break reported; it sets no threshold, so it
cannot fail. Written that way to answer #159's undeclared-breaks failure, it
answers only the procedural half. A future band wanting a pass condition has to
state one, and 13 is the number it would be arguing about.

**Clause 6 failed by two rows of 396**, which is 0.5% and is nothing like the 61
pairs that disqualified #159's `designated` half. It is still a fail as written,
and rewriting a clause after seeing it fail by a little is exactly what the
pre-registration exists to stop.

## 8. What the sweep covered

**1,924 distinct queries** by §4's construction over 2,023 rows. Lower than
#465's 4,477 because that figure is pre-deduplication over a larger corpus, and
because #465 swept head phrases and corpus words as separate populations.

**82 leads moved**, 4.3% of the query set. **14 better, 34 worse, 34 neutral.**

## 9. The classification

**Better (14 queries, 13 rows).** `almond`, `almonds`, `cow`, `crab`, `deer`,
`octopus`, `parmesan`, `salmon`, `sea`, `smelt`, `squirrel`, `swiss`, `trout`,
`water`.

**Worse (34 queries, 30 rows).** `alcoholic beverage`, `alcoholic beverages`,
`ancho`, `beverage`, `beverages`, `blue`, `butternut`, `butternuts`, `cheese`,
`chili`, `cottage`, `dill`, `dry`, `fat`, `fish`, `fluid`, `gin`, `ginger`,
`jack`, `lotus`, `malt`, `meat`, `milk`, `on`, `pe`, `pine`, `poultry`, `roma`,
`skim milk`, `snap`, `sun`, `white`, `wine`, `yellow`.

**Neutral (34).** Junk tokens nobody types (`a`, `and`, `c`, `de`, `for`, `hi`,
`n`, `non`, `or`, `sp`), rows that are peers (`spice`, `spices`, `sesame`,
`nuts`, `weed`), and leads that were already wrong and stayed wrong (`butt`,
`low`, `free`).

## 10. It fixes six of #159's eight, and two it called unreachable

| #159 defect | today                                           | under the candidate              |
| ----------- | ----------------------------------------------- | -------------------------------- |
| `almonds`   | Almond milk, unsweetened, plain                 | **Nuts, almonds, whole**         |
| `salmon`    | Salmon, red (sockeye), filets with skin, smoked | **Fish, salmon, Atlantic, wild** |
| `trout`     | Steelhead trout, dried, flesh                   | **Fish, trout, rainbow, farmed** |
| `smelt`     | Smelt, dried                                    | **Fish, smelt, rainbow**         |
| `octopus`   | Octopus                                         | **Mollusks, octopus, common**    |
| `deer`      | Deer (venison), sitka                           | **Game meat, deer**              |
| `cranberry` | Cranberry, low bush or lingenberry              | unmoved                          |
| `hazelnuts` | Hazelnuts, beaked                               | unmoved                          |

**`crab` and `swiss` also move, and #159 records both as unreachable** — `crab`
as needing the rung-30/20 swap it refused, `swiss` as already decided by `raw`.
Both were read off a corpus of 4,335 rows. `crab` now leads with
`Crustaceans, crab, dungeness` instead of `Crabapples`, and `swiss` with
`Cheese, swiss` instead of `Chard, swiss`.

This is the first mechanism in six to reach the ticket's own defects at all.
Mechanisms 1-4 were refused on cost without ever clearing the cases.

## 11. The finding that retires a whole family

**Every shelf label is mixed.** The new lead's own head segment, cross-tabulated
against the hand classification:

| label       | better | worse | neutral |
| ----------- | -----: | ----: | ------: |
| `Cheese`    |      2 |     7 |       6 |
| `Fish`      |      4 |     5 |       2 |
| `Nuts`      |      2 |     6 |       7 |
| `Spices`    |      0 |     5 |       4 |
| `Beverages` |      1 |     3 |       0 |
| `Milk`      |      1 |     1 |       3 |
| `Game meat` |      2 |     0 |       1 |

**So no roster can be narrowed into a rule, and #164's mechanism 2 is refuted as
a family rather than as an instance.** That mechanism restricted the promotion to
the `nuts` label alone; this table shows `Nuts` is itself 2 better and 6 worse.
Every label that moves anything moves things both ways.

**The distinction the data actually draws is per row, and nothing in a name
carries it.** `Nuts, almonds` files a nut down the nut aisle, so `Nuts` is an
aisle and the name is `almonds`. `Nuts, pine nuts` names pine nuts, so `Nuts` is
half the name. `Cheese, cottage` is cottage cheese; `Cheese, parmesan` is
parmesan. Both spellings are `Label, qualifier` and the corpus cannot tell them
apart, which is #164's own sentence — both are just words in position 0 — now
measured rather than asserted.

## 12. What survives, and what it would cost

**A per-row offset is the only shape left standing, and this sweep priced it at
30 rows.** Two properties make that a real number rather than a gesture:

- **No row is wanted both ways.** The 13 rows behind the better leads and the 30
  behind the worse do not intersect, so a per-row list is coherent: no entry
  would have to be right for one query and wrong for another.
- **It is 30 against a ceiling of 25**, which is a near miss rather than a rout.
  For scale, `ADJUDICATED_VARIANTS` carries 40 entries and the twin ledger 190.

**The ceiling is not moved here.** It was set by analogy — 40 being the largest
ranking-adjacent hand list in the repo — and an analogy is a weak thing to
re-argue with the answer in view. A fresh ticket may set a ceiling from the
maintenance cost of the list itself, which is the argument this note could not
make before it had the 30 rows to look at.

What such a ticket inherits, and did not have before today: the mechanism reaches
six of the eight defects, the cost is bounded and coherent, the roster family is
closed, and the 13 broken pins are the specification of what a list would have to
leave standing.
