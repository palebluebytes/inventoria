# Research: when a row that merely mentions a food outranks the row that is it (#159)

**Grounds:** `compareRelevance` / `compileReferenceFoodQuery` / `readRowRank` in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` (4,335 rows) through `scripts/usda-ranking-corpus.mjs` and `sweepQueries` (3,976 queries). [ADR-0042](../adr/0042-usda-search-reference-foods.md) §1 owns the key order; [ADR-0055](../adr/0055-who-eats-a-food-ranks-it-and-never-drops-it.md) §4 owns the `designated` key this note moves.
**Siblings:** [#153](https://github.com/palebluebytes/inventoria/issues/153) closed the shelf-label family and is not reopened here. [#158](https://github.com/palebluebytes/inventoria/issues/158) pre-registered the `tea` regression this note accepts. [#162](https://github.com/palebluebytes/inventoria/issues/162) added `wholeness` and handed `sea` to this ticket.
**Date:** 2026-08-24. **Status:** pre-registration. §§1–5 are measured and dated. §§6–9 are written **before the `raw` half is swept and before a single one of its cases is adjudicated**, and no ranking code has changed.

---

## 1. The defect, and why it is not one rung

A typed `salmon` returns 34 rows and leads with a smoked fillet published for a designated population, then a breaded nugget, then a berry:

```
345  t50 raw0 pl1 si0 de0   Salmon, red (sockeye), filets with skin, smoked (Alaska Native)
189  t40 raw0 pl0 si0 de1   Salmon nuggets, cooked as purchased, unheated
 47  t30 raw1 pl1 si1 de0   Salmonberries, raw (Alaska Native)
142  t20 raw1 pl1 si2 de1   Fish, salmon, Atlantic, wild, raw
```

`tier` is the first key `compareRelevance` reads, so nothing below it reaches this. The three offenders sit on three different rungs of ADR-0042 §1's ladder, which is what makes a single-rung fix useless: **demote the sockeye and the nugget without demoting the berry and the lead becomes a 47 kcal berry**, a 3× understatement where today's is a 2.4× overstatement. There is no partial credit.

Note what the key dump already shows. For every one of the three, **some key below `tier` already prefers the fillet** — `raw` beats the sockeye and the nugget, `designated` beats the sockeye and the berry. Nothing new has to be invented. The whole question is what may be read before `tier`.

## 2. The class, measured, and the instrument's blind spot

Over 3,976 sweep queries, **29** bury the row whose own name (past any shelf label) _is_ the query. Hand-adjudicated one by one, that 29 is not 29 defects:

- **6 defects** — `almonds`, `trout`, `octopus`, `crab`, `parmesan`, `deer`.
- **12 leads that are correct today and must not move** — `cottage` (cottage cheese _is_ the food), `ginger` (fresh root over dried spice, which is #153's own pinned direction), `horse` (Horseradish, for a UK reference user), `melon`, `tomato`, `soybean`, `apricots`, `soy flour`, `winged bean`, `turkey breast`, `turkey thigh`, `beef composite`.
- **11 unadjudicable** — bare adjectives nobody types as a food: `white`, `dry`, `fresh`, `whole`, `american`, `blue`, `water`, `imitation`, `malt`, `butternuts`, `swiss`.

**The instrument cannot see four of this ticket's eight cases**, and `salmon` is one of them. Where two rows both own the name — `Salmon, red (sockeye), …` and `Fish, salmon, …` — the query matches the lead's own name and the query passes the filter clean. `cranberry`, `hazelnuts` and `smelt` are hidden the same way. A census built on "the exact-name row does not lead" is therefore a lower bound, and the next ticket should not treat it as a count.

## 3. The mechanism, and the three that are closed

The change is one line. `compareRelevance` goes from

```
tier → raw → head → accounted → position → plainSibling → plain → wholeness → simplicity → designated
```

to

```
designated → raw → tier → head → accounted → position → plainSibling → plain → wholeness → simplicity
```

`raw` and `tier` swap; `designated` moves from last to first. Stated as what it is: **a raw base form outranks a better-matching name.** ADR-0042 §1 is titled "Rank relevance first, then raw base forms", and this inverts that clause. A reviewer who reads the change as "a key moved slot" will not price it against §1, and §1 is the thing being amended.

`designated` goes first because it is the self-gating one — §5 measures it at 216 of 271 leads unchanged — so the smaller claim is stated first and `raw`'s promotion is left as the single unbounded change the ticket has to defend. On everything measured here the two orders agree.

Three candidates are closed in writing, before the sweep, so they are not re-derived:

**The rung-30/20 swap is refused.** Making a whole-word match beat a prefix-extension is the other route to `Salmonberries`. Exactly three queries today lead with a rung-30 row over a whole-word row: `blue` → **Blueberries, raw** (correct), `horse` → **Horseradish, prepared** (correct for a UK user), `crab` → **Crabapples, raw** (wrong). The swap buys `crab` and `salmon` and costs `blue` and `horse`, and no per-name rule separates the four because they are one shape. That is the "UK default sense of a word" question ADR-0042's #158 Amendment already refused a mechanism for.

**`plain` as a third promoted key is declined on price.** It reaches `parmesan` alone — `Parmesan cheese topping, fat free` 370 against `Cheese, parmesan, hard` 392, a **6%** gain — and a third key above `tier` widens the sweep across every prepared row in the corpus. Measured, reachable, and not bought.

**`crab` and `swiss` are unreachable and are declared so now.** `crab` needs the refused rung swap; `Crabapples, raw` and `Crustaceans, crab, dungeness, raw` tie on `raw`, `plain` and `designated` alike. `swiss` is `raw` already working — `Chard, swiss, raw` beats `Cheese, swiss` on the key this change promotes, so promoting it further changes nothing.

## 4. What ships, if it ships: eight defects

| query       | leads today                                                  | should lead                                           |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| `almonds`   | Almond milk, unsweetened, plain, shelf stable **14.6**       | Nuts, almonds, whole, raw **626**                     |
| `salmon`    | Salmon, red (sockeye), filets with skin, smoked (AN) **345** | a `Fish, salmon, …` row — Atlantic, wild, raw **142** |
| `trout`     | Steelhead trout, dried, flesh (Shoshone Bannock) **382**     | Fish, trout, rainbow, farmed, raw **141**             |
| `cranberry` | Cranberry, low bush or lingenberry, raw (AN) **55**          | Cranberries, raw **46**                               |
| `hazelnuts` | Hazelnuts, beaked (Northern Plains Indians) **628**          | Nuts, hazelnuts or filberts, raw **641**              |
| `smelt`     | Smelt, dried (Alaska Native) **386**                         | Fish, smelt, rainbow, raw **97**                      |
| `octopus`   | Octopus (Alaska Native) **56**                               | Mollusks, octopus, common, raw **82**                 |
| `deer`      | Deer (venison), sitka, raw (AN) **116**                      | Game meat, deer, raw **120**                          |

`deer` is named as in scope **and worthless** — 4 kcal — so that it is not later cited as evidence the change worked. `raw salmon`, which leads with `Salmonberries` today, moves with `salmon` and is not counted separately.

## 5. The `designated` half is fully measured

**271 queries lead with a designated row. 216 self-gate** — no non-designated row is retrieved at all, so the key ties uniformly and nothing changes. Of the 55 that do not, **52 change lead under the `designated` promotion alone**; the other three change only once `raw` joins it, and are counted with the composite in §10. **52 is the number this note uses for the `designated` half throughout.** That includes every query ADR-0055's own corpus test names except two (§7).

Of the 52: six are the wins in §4 (`salmon`, `trout`, `octopus`, `hazelnuts`, `cranberry`, `smelt`); one is a real loss (`buffalo`, §6); and the remaining ~47 are untyped game meat (`bear`, `moose`, `squirrel`, `caribou`, `elk` and their `raw X` / `meat X` sweep spellings), or sweep junk that names no food (`and`, `in`, `low`, `native`, `alaska`, `lion`, `mush`).

**`sea`**, handed here by ADR-0042's #162 Amendment, lands on `Seaweed, irishmoss, raw` instead of a Steller sea lion liver. It is a watch item and no acceptance is written on it — `sea` names no food, so whatever it lands on is not adjudicable.

**The `raw` half is deliberately unmeasured as of this commit.** That is the point of §8's ceiling.

## 6. Three accepted costs, priced in one place

| query     | today                                                               | after                                              | price                                           |
| --------- | ------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `horse`   | Horseradish, prepared **48**                                        | Game meat, horse, raw **133**                      | `raw` promotes a meat over a prepared condiment |
| `buffalo` | Buffalo, free range, top round steak, raw (Shoshone Bannock) **97** | Game meat, buffalo, water, raw **99**              | wrong animal, **2 kcal**                        |
| `tea`     | Tea, tundra, herb and laborador combination (AN) **1**              | Beverages, tea, green, brewed, decaffeinated **0** | a regression in kind, null in harm              |

**`buffalo` is an override, not a pass.** #159's own text pre-registered it as counting against, and it does. It is accepted because the pre-registration said _counts against_ rather than _disqualifies_, because the price is 2 kcal against `salmon`'s 203 and `almonds`'s 611, and because the real fix is not a ranking one: the corpus files the American animal under `bison` across 20 rows, so `buffalo` is a `vocabulary_local` entry ([ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md), #141). That is cut as [#163](https://github.com/palebluebytes/inventoria/issues/163), which also has to settle whether `vocabulary_local` fires at all when the corpus already returns five rows.

**`tea` is #158's prediction landing exactly.** It said "if it lands, it is a regression and counts as one", and it lands on decaffeinated green tea. #158 also measured all nine `tea` rows at 0–1 kcal, so no user meets a different number.

Each of the three is pinned as itself in `tests/unit/usda-corpus.test.ts`, the precedent ADR-0042's #162 Amendment set with `tri beef`.

## 7. One pinned test is rewritten, and it is declared here rather than found later

`tests/unit/usda-corpus.test.ts`, _"moves nothing on a head phrase only designated rows occupy"_, asserts that `caribou` and `elk` lead with a row containing `(`. Both are among the 55.

Its own comment says what it is asserting: _"The key fires only on a tie, so where every candidate carries the designation it ties uniformly and the order is unchanged."_ That is a property of `designated`'s **old slot**, and the change removes its premise by construction. It is not an adjudication that `caribou` and `elk` lead with the right row.

So it is rewritten, narrowly: `seal`, `walrus`, `whale`, `chokecherries`, `mutton` and `agave` stay (all verified still self-gating), `caribou` and `elk` move out of it and into the moved-leads table with their numbers, and the title changes to state what is true of the new slot.

**This is declared before the sweep on purpose.** #153's lesson is that `usda-corpus.test.ts` is the authority on what is _pinned_ — it is not the authority on what is _correct_, and quietly editing the test a change breaks is how a candidate launders a regression.

## 8. Pre-registration

### 8.1 Ship conditions

1. All eight §4 defects lead with the named row.
2. No movement in the twelve protected leads of §2, except `horse`.
3. Zero broken pins in `tests/unit/usda-corpus.test.ts`, read **out of the file** and not out of the tickets — the exact failure #153 had — with §7's single rewrite the only edit.
4. Gold-set `should_lead` at **7 of 29 or better**. (#159's body says 6; that figure is stale, ADR-0042's #162 Amendment raised it to 7. `almond milk`, one of the seven, is verified safe: all three of its rows carry `raw` 0.)
5. The `raw` promotion moves **no more than 40 additional leads** beyond §5's measured 55, every one read by hand.

### 8.2 The ceiling, and why 40

Chosen **before the measurement**, which is the only thing that makes it a band. #162 adjudicated 16 moved leads comfortably; #153 produced 164 and adjudicated none of them properly, which is how a broken pin survived to the unit suite. 40 is the largest set a person will actually read.

Above 40, **report and return** with the distribution — not a narrowed candidate chosen after seeing which cases spoiled it.

### 8.3 Report and return

A legitimate outcome, and the bar is higher than #153's: that ticket reached it on a mechanism that is now closed, so this one has to fail on its own terms. Failing §8.1.5 is such a term. Failing §8.1.1 on `almonds` — the largest harm in the class at 43× — is another.

### 8.4 Contamination, stated

Every candidate from here is chosen having seen #153's diffs. This note adds to that: the key orderings in §1 and §3 were tried against the defect queries themselves, and §5 measures the `designated` promotion in full. **The `raw` half was not run before this note was committed.** That is the honest account of what was known when the band was set.

## 9. Order of work

Sweep first, judge against §8, and do not touch `compareRelevance` if the band fails. The code change is three lines; the ticket is a measurement, and running it the other way round makes the sweep a verification of a decision already taken.

---

# Results (2026-08-24)

The sweep ran before any ranking code changed, as §9 required. **The band fails on two independent clauses, and the mechanism is refuted rather than merely over budget. Nothing shipped.**

## 10. Against §8.1

| clause                              |                                              |                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. eight defects lead               | **7 of 8**                                   | `salmon` 345 → **Fish, salmon, Atlantic, wild, raw 142**; `almonds` 14.6 → **626**. `deer` lands on `Game meat, deer, ground, raw` (157), not the `Game meat, deer, raw` (120) §4 named |
| 2. twelve protected leads           | **pass**, `horse` excepted as pre-registered |                                                                                                                                                                                         |
| 3. zero broken pins bar one rewrite | **FAIL**                                     | 4 broken, **3 of them undeclared**                                                                                                                                                      |
| 4. gold `should_lead` ≥ 7           | **pass**                                     | unchanged at 7                                                                                                                                                                          |
| 5. `raw` half ≤ 40 additional leads | **FAIL**                                     | **82**                                                                                                                                                                                  |

**137 leads moved** of 3,976 queries: 52 the `designated` half, **82 the `raw` half**, 3 both. The ceiling was 40, chosen blind in §8.2, and the result is more than double it.

## 11. Why 82 is the wrong number to argue about

The ceiling exists to bound adjudication. Reading the 82 makes the count beside the point:

| query     | today                                            | under the candidate                       |
| --------- | ------------------------------------------------ | ----------------------------------------- |
| `butter`  | Butter, Clarified butter (ghee) **900**          | **Butterbur, (fuki), raw 14**             |
| `bread`   | Bread, white wheat **238**                       | **Breadfruit, raw 103**                   |
| `milk`    | Milk, dry, whole, with added vitamin D **496**   | **Nuts, coconut milk, raw 230**           |
| `salt`    | Salt, table **0**                                | **Pork, cured, salt pork, raw 748**       |
| `honey`   | Honey **304**                                    | Apples, honeycrisp, with skin, raw **60** |
| `ice`     | Ice cream, soft serve, chocolate **222**         | Lettuce, iceberg, raw **17.1**            |
| `port`    | Cheese, port de salut **352**                    | Mushrooms, portabella, raw **22**         |
| `cream`   | Cream, fluid, light **195**                      | Nuts, coconut cream, raw **330**          |
| `mustard` | Mustard, prepared, yellow **61**                 | Mustard greens, raw **27**                |
| `oats`    | Oats, whole grain, rolled, old fashioned **382** | Oat bran, raw **246**                     |

`butter` is a **64× understatement**. And `milk` → `Nuts, coconut milk, raw` is the _same row_ ADR-0042's #153 Amendment named as the price of the full shelf-label roster, arriving by a completely different mechanism.

The shape is one shape: with `raw` above `tier`, **any raw row that merely prefix-matches the query outranks the row the query names.** A `Butterbur` beats a butter because it is raw and butter is not. That is not a budget overrun to be trimmed; it is the key doing what promoting it means.

## 12. Four pins broke, and only one was declared

| pin                                                                 |                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| _"moves nothing on a head phrase only designated rows occupy"_      | **declared** in §7 — `caribou` → `Game meat, caribou, raw`                                                            |
| _"says out loud that no key picks a tea"_                           | **undeclared.** §6 accepted the `tea` cost but missed that it is pinned in a **second** test, not the one §7 rewrites |
| _"lets an alias account for a row, where a sibling flag must not"_  | **undeclared.** `oats` → `Oat bran, raw`, which is ADR-0050's alias machinery, not this ticket's subject at all       |
| _"puts 186 more rows first by their own name, and takes none away"_ | **undeclared.** `lost: 0 → 3` — the #154 shelf-label tripwire, whose whole assertion is that nothing is taken away    |

**§7's own method failed on its own terms.** It read the suite for the pin it expected to break and declared that one. Three more broke, in tests whose subject is a different ticket. Reading the file for _the_ pin a change touches is not the same as running it, and the note asserted the first while claiming the safety of the second.

## 13. ADR-0055 §1 is breached, and it is the `designated` half that breaches it

Summed across all queries, designated rows inside the 50-row window fall from **845 to 784** — 61 demotions past `RESULT_LIMIT`. #159's constraints define exactly that as a drop: _"a demotion past `RESULT_LIMIT` is a drop as the user meets it."_

Measured per half, the drop is **entirely `designated`'s**:

| ordering                    | designated rows in the 50-row window |
| --------------------------- | ------------------------------------ |
| shipped                     | 845                                  |
| `raw` promoted alone        | **841**                              |
| `designated` promoted alone | **784**                              |
| both (the candidate)        | 784                                  |

**25 queries lose a designated row from the window, 61 (query, row) pairs in all, across 48 distinct rows.** The worst are `s` (9 rows), `corn` (8, `Corn, dried (Navajo)` among them), `raw meat` (6), and `oil` and `sea` (5 each). `oil` is one of the two queries ADR-0055 §4's own corpus test pins.

The mechanism is not subtle once seen. Promoting `designated` to first **partitions every result list**: all non-designated rows precede all designated ones. Any query returning more than fifty rows with a mix of both pushes designated rows off the end, regardless of how well they match.

This is a red line rather than a band clause, and it disqualifies the candidate on its own. ADR-0055 §1's measurement in #153's Amendment held because those variants kept the window count identical; this is the first candidate to move it.

## 14. What this establishes, generally

**Self-gating is the property that decides whether a key may be promoted above `tier` — and it has to hold of the WINDOW, not only of the lead.**

`raw` fails it outright. It touches **1,445 of 4,335 rows (33%)** and is orthogonal to what the query names, so promoting it lets an unrelated raw food win any query whose named food happens not to be raw. **ADR-0042 §1's clause "rank relevance first, then raw base forms" is not an ordering preference; it is what stops the raw key from answering a question it was never asked.**

`designated` looks like it passes, and does not. It self-gates on **leads** — 151 rows of 4,335, and 216 of 271 designated leads unchanged because no non-designated row is retrieved — which is the property #159's body cited, and that property held. But §13 shows that a key at the top of the order partitions the whole list, so self-gating on the lead says nothing about the fifty rows beneath it. **That distinction is this measurement's main finding**, and #159 did not have it: its body argued from the lead count alone, and so did the first draft of this note.

So ADR-0042's #153 Amendment widens further than that first draft claimed. #153 closed one family — `tier` and `head` reading the shelf-label roster. This closes: **no key may sit above `tier` unless it is silent on the queries it does not concern, across the whole result window and not merely at the top of it.** Neither key measured here satisfies that, and none has yet been shown to.

## 15. The `designated` half is not salvaged here, deliberately

Its leads looked adjudicable — 52 moved, six real wins, one real loss. Three things stop it, and the first is fatal.

**It is the half that breaches ADR-0055 §1** (§13). On its own it costs 61 (query, row) pairs across 25 queries and 48 distinct rows, where the `raw` half costs 4. So a `designated`-only promotion is **not the safe residue of a failed experiment; it is the unsafe half**, and this note's own first draft had that backwards.

**Shipping it now would be a candidate narrowed after seeing which cases spoiled the measurement**, which §8.2 forbids in so many words.

**And it would not fix this ticket.** `designated` alone leaves `salmon` leading with `Salmon nuggets, cooked as purchased, unheated` at 189 kcal, and §1 records that a lead on the nugget is not the acceptance.

A fresh pre-registration may still take it up, but it inherits a harder question than "state a band first": what ADR-0055 §1 means when a key at the top of the order partitions every result list. It also has to answer §12 — three of the four broken pins here belong to other tickets, and a candidate touching `compareRelevance` runs the whole suite rather than reading it for the pin it expects.

## 16. What #159 leaves standing

`salmon` still leads with a 345 kcal smoked sockeye, and `almonds` with a 14.6 kcal almond milk against a 626 kcal nut. Both defects are real, both are measured, and neither has a mechanism that survives its own price.
