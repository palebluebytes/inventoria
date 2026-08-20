# Research: does food search reach the best record, and does it lead with it? (#130)

**Grounds:** `compileReferenceFoodQuery` / `compareRelevance` in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` via `pnpm usda:ranking-audit`. [ADR-0042](../adr/0042-usda-search-reference-foods.md) §1 and its Amendment (2026-08-19, #113) govern the ranking; §5 appears only as a cause.
**Siblings:** [#124](https://github.com/palebluebytes/inventoria/issues/124) owns the qualifier-position defect and is handed sizing data here, not a decision. [#126](https://github.com/palebluebytes/inventoria/issues/126) is where both known cases surfaced.
**Date:** 2026-08-20. Figures marked _measured_ are reproduced by `pnpm usda:ranking-audit` over the 4,429-row index and the OFF taxonomy pinned by sha256 in `130-audit-inputs.json`. **Status:** research only — no ranking code changed.

---

## 1. What is being measured, and why not what the ticket asked for

#130 asks how often "the top-ranked row loses to a better record further down". Its own flagship case cannot be expressed that way. _Measured:_

```
== green onion
   t50 raw0  Onions, young green, tops only        ← the ONLY result
```

`Onions, spring or scallions (includes tops and bulb), raw` scores `NO_MATCH` — no token of `green onion` prefixes or stems to any of its words — so it is not further down the list. It is not on the list. The same is true of `napa cabbage`, and for the same reason.

So the measurement splits in two, with separate denominators that are never blended:

- **Recall** — is the best record in the result set at all. Both known cases live here, and the harm is that the food is invisible.
- **Ranking** — given it was retrieved, where did it land, in the harm buckets `leads` / `visible` (2–5) / `buried` (6–50). This is #124's class.

Two further corrections to the ticket, both _measured_:

- **The raw napa record was never dropped.** `Cabbage, chinese (pe-tsai), raw` is in the corpus; `pe-tsai` is napa cabbage. This is a vocabulary miss identical in class to green onion, not the coverage gap #130 calls it. (`Cabbage, chinese (pak-choi)` genuinely has no raw row. That one is a real gap and a different case.)
- **ADR-0042 §5 is the composite-dish drop rule**, not the ranking. The ranking is §1 plus its #113 Amendment. §5 survives in this note only as a _cause_ — "our own filter removed the better record", which the sha-pinned archives can separate from "USDA never had it".

## 2. Where the queries come from

A recall miss is by construction a query whose words the right record does not contain. A query set derived from corpus text therefore cannot generate one: every such query trivially retrieves its own row. And a hand-written list is a guess about a distribution nobody has looked at, which is the objection #130 raises against fixing this from a single example — it applies with equal force to the corpus that would test the fix.

The vocabulary is therefore taken from **Open Food Facts' ingredients taxonomy**, an independent source that has never seen this ranking. `ingredients.full.json` (6.4 MB, ODbL) carries per-language synonym sets; the `ingredients.json` the app already fetches in `off-taxonomy.ts` (ADR-0043 §4) does not, and is a different file.

_Measured:_ 1,919 English multi-synonym groups, of which **549 reach this corpus at all**. The remaining 1,370 name additives and manufacturing inputs that touch no reference food. Only the 549 are committed, in `130-audit-inputs.json`, with the source's sha256 and fetch date — the 6.4 MB original is not committed and never enters the app bundle.

**Each group carries its own oracle.** When `wombok` retrieves nothing, a sibling member has already named the record it should have reached. That is what makes several hundred judgements affordable: each is checking a proposed answer, not searching 4,429 rows for one.

Alongside it, on its own denominator, sits a fixed list of **20 everyday British-usage queries** — the one gap OFF's American-leaning English structurally leaves. It was written before the sweep ran and is never blended into the mechanical counts.

## 3. Pre-registration

Written and committed **before the sweep ran and before a single case was adjudicated**, because a measurement whose categories and thresholds are chosen after the numbers arrive is a rationalisation. The commit history shows this section landing first.

### 3.1 What counts as better

Applied in this precedence when the axes conflict:

1. **Whole over part.** A part of a food is the sharpest wrongness, because the user asked for the food.
2. **Raw over cooked**, following ADR-0042 §1's base-ingredient preference.
3. **Generic over qualified.**

### 3.2 Verdicts

- `miss` — a better record exists and the query did not lead with it.
- `peers` — the candidates are different foods, or equally good forms of one. **Not** a miss. If `peers` dominates, that is the finding, and it retires the remedy more cleanly than a low miss count would.
- `correct` — the ranking was right; the mechanical flag was a false positive.
- `implausible-query` — nobody types this into a food search. OFF's vocabulary is ingredient-label jargon as well as food names (`milk lactose`, `cooked beef meat`). Counted, and excluded from every rate.

### 3.3 Causes

A closed list, plus `other`:

`vocabulary` · `qualifier-position` (#124's class) · `filter-dropped` (an ADR-0042 §4/§5 or ADR-0048 rule took it) · `usda-absent` (never in the archives) · `peers` · `correct` · `other`.

Every `other` is enumerated individually in §7 rather than reported as a count. **If `other` exceeds ~10% the taxonomy was wrong**, and this note says so rather than absorbing the overflow.

### 3.4 Thresholds

**Recall class.** Recommend pinning an OFF-derived synonym layer if **≥ 100** adjudicated groups are real misses over foods a person would plausibly search — already four times the entire curated stand-in table, which settles boundedness by itself. Below **40**, file the known cases as individual quirks and recommend no mechanism.

**Ranking class.** Hand the numbers to #124. Recommend no independent §1 change unless **≥ 25** adjudicated misses survive that #124's positional key would not fix.

**Between the bands**, this note reports and returns the decision rather than resolving it.

### 3.5 The known cases are excluded from every rate

`green onion` and `napa cabbage` were found by chance while fixing #126. A sample containing the thing it was built to find measures nothing, so both are accounted for in §8 and counted nowhere else.

### 3.6 Who adjudicates

An LLM applying §3.1–§3.3 case by case, with every judgement recorded in `130-ranking-audit.json` so it can be checked rather than trusted. A seeded random 30 is called out in §9 for human spot-check. This is a real limitation of the finding and is stated rather than buried.

## 4. Results

_Pending the sweep._

## 5. The recall class

_Pending the sweep._

## 6. The ranking class, and what #124 inherits

_Pending the sweep._

## 7. `other`, enumerated

_Pending the sweep._

## 8. The three known cases

_Pending the sweep._

## 9. Recommendation

_Pending the sweep._
