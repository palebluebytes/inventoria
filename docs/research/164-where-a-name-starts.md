# Research: where a food's name starts, and whether a hand list can say (#164)

**Status:** pre-registration. Committed **before** the sweep, so it demonstrably
predates the measurement — the arrangement
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
