# Research: where the ranking runs out of keys, and what that costs (#158)

**Grounds:** `compareRelevance` in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` (4,348 rows) via `pnpm usda:ranking-ties`. [ADR-0042](../adr/0042-usda-search-reference-foods.md) §1 governs the ranking; [ADR-0055](../adr/0055-who-eats-a-food-ranks-it-and-never-drops-it.md) adds the two row keys and forbids dropping a reference food to fix an ordering.
**Siblings:** [#153](https://github.com/palebluebytes/inventoria/issues/153) measured and refused the tier answer that would expose this class on `tea`; [#159](https://github.com/palebluebytes/inventoria/issues/159) owns the eight head phrases it left. [#143](https://github.com/palebluebytes/inventoria/issues/143) and [#155](https://github.com/palebluebytes/inventoria/issues/155) each measured a candidate key against this class and rejected it.
**Date:** 2026-08-24. **Status:** measured. No ranking code changed.

---

## 1. The question, and why `tea` was the wrong place to ask it

#158 was cut from #153 to ask which of nine `Beverages, tea, …` rows is the default sense of the word, on the reading that they tie completely and `fdcId` order picks the winner. Asking it needed the class measured first — the ticket's own question 1 — and the class turns out to be large, `tea` turns out to be near-harmless, and two of the ticket's premises turn out to be false.

## 2. The class

Over 3,997 queries from `sweepQueries` against the 4,348-row index:

|                                                                |                   |
| -------------------------------------------------------------- | ----------------- |
| queries whose result list opens with a ≥2-way **complete tie** | **1,121 (28.0%)** |
| tie of 2                                                       | 615               |
| 3 / 4 / 5                                                      | 174 / 97 / 41     |
| 6 / 7 / 8 / 9                                                  | 48 / 21 / 15 / 12 |
| **10 or more**                                                 | **98**            |

A complete tie is `compareRelevance` returning 0 — all nine keys equal — so the order among the tied rows is `Array.prototype.sort`'s stability, which over this index is `fdcId` order. The tie is measured over the **untruncated** ordering, not the 50-row window: `beef` ties 413 rows and would read as a 50-way tie through the window, which measures the window rather than the ranking.

This retires the ticket's own "is it a class?". It is not one query and it is not nine. It is 1,121, and #143's 163 and ADR-0055's 140 were both head-phrase-shaped subsets of it.

## 3. The harm, which is what the count leaves out

A tie costs a user nothing when the tied rows carry the same panel. Priced as the calorie spread across each tie:

| spread (kcal/100 g) | queries |
| ------------------- | ------- |
| 0                   | 215     |
| 1–10                | 242     |
| 11–50               | 283     |
| 51–100              | 132     |
| 101–200             | 97      |
| **200+**            | **152** |

So roughly 40% of the class is a coin flip between rows a user would log identically, and 152 queries are a coin flip worth more than 200 kcal per 100 g.

**`tea` is in the first band.** All nine tea rows are 0–1 kcal with near-identical panels; the worst a user can log is 1 kcal wrong, and every one of the nine is on screen — `tea` returns twelve rows.

**The top of the distribution is somewhere else entirely.** The head:

| spread  | tied    | query          | leads with                                                                      |
| ------- | ------- | -------------- | ------------------------------------------------------------------------------- |
| 794     | 7       | `sea`          | `Sea cucumber, yane (Alaska Native)` (56)                                       |
| **777** | **413** | **`beef`**     | **`Beef, retail cuts, separable fat, raw` (674)**                               |
| 772     | 84      | `pork`         | `Pork, fresh, composite of trimmed leg, loin, shoulder, and spareribs, …` (211) |
| 769     | 12      | `variety beef` | `Beef, variety meats and by-products, brain, raw` (143)                         |
| 664     | 5       | `caribou`      | `Caribou, hind quarter meat, raw (Alaska Native)` (122)                         |
| 635     | 129     | `lamb`         | `Lamb, composite of trimmed retail cuts, …` (267)                               |

`beef` is the case worth a ticket: 413 rows tie, the spread is 777 kcal, the lead is **pure trimmed fat at 674 kcal**, and no test pins it. `veal` is the same shape at 43 rows, leading with an Australian rib roast.

## 4. The pinned generic-animal leads are themselves accidents

`usda-corpus.test.ts` pins `chicken`, `turkey`, `pork` and `lamb` as the four leads #143's part key broke, and they are cited in three tickets as the bar any new key must clear. Measured here, all four are **complete ties whose leads were dealt rather than won**:

| query     | tied | lead                                                                      |
| --------- | ---- | ------------------------------------------------------------------------- |
| `chicken` | 58   | `Chicken, broilers or fryers, meat and skin and giblets and neck, raw`    |
| `turkey`  | 46   | `Turkey, whole, meat and skin, raw`                                       |
| `pork`    | 84   | `Pork, fresh, composite of trimmed leg, loin, shoulder, and spareribs, …` |
| `lamb`    | 129  | `Lamb, composite of trimmed retail cuts, …`                               |

They are the right answers and nothing in the ranking is choosing them. This is not an argument for unpinning them — it is the reason **self-gating is a precondition on any tenth key**, not an outcome to check afterwards. The two keys that shipped, `accounted` and `plain`, both survived measurement precisely because they tie uniformly across these four; the two that were rejected, #143's part key and #155's counted qualifiers, both fired on them and broke them. A key that separates complete ties in general reaches all four by construction.

## 5. The tea case, and two corrections

The ticket, #153's proposed tripwire and ADR-0055's Consequences all state that the nine `Beverages, tea, …` rows are identical on all nine keys and that a tier fix would hand the answer to `designated`. Both claims are wrong.

**The tie is eight, not nine.** `Beverages, tea, black, brewed, prepared with tap water, decaffeinated` carries `plain_sibling: true`, because its name is a strict extension of `Beverages, tea, black, brewed, prepared with tap water`. ADR-0055 §3 demotes it. The nine produce **two** distinct keys, not one, and a tripwire asserting one would have failed the day it was written.

**`designated` cannot decide.** None of the nine is in `American Indian/Alaska Native Foods`, so the key ties at 1 across all of them. The mechanism a tier fix would hand `tea` to is `fdcId`.

Ordered among themselves, the eight lead with `Beverages, tea, green, brewed, decaffeinated` (`fdcId` 171910, the lowest). Black tea prepared with tap water is fourth.

**Nothing in the name separates a black tea from a green one.** `plain` does not fire — `brewed` is not in `PREPARED_FORM` and `decaffeinated` is not in `MODIFIED_FORM` — and adding `decaffeinated` to `MODIFIED_FORM` would promote `Beverages, tea, green, brewed, regular`, not a black tea.

## 6. The candidate that was refused, with its evidence

The one signal in the data that separates the nine correctly is **caffeine** (nutrient 1057):

| mg/100 g | row                                                                     |
| -------- | ----------------------------------------------------------------------- |
| 20       | `Beverages, tea, black, brewed, prepared with tap water`                |
| 20       | `Beverages, tea, black, brewed, prepared with distilled water`          |
| 16       | `Beverages, tea, Oolong, brewed`                                        |
| 12       | `Beverages, tea, green, brewed, regular`                                |
| 1        | `Beverages, tea, black, brewed, prepared with tap water, decaffeinated` |
| 0        | the two green/decaf, hibiscus, chamomile and herb rows                  |

"Prefer the most caffeinated" would land `tea` on black tea brewed with tap water and satisfy the ticket's acceptance exactly. **It is refused**, and recorded here so the next ticket finds the measurement rather than re-deriving it and reaching a different answer:

- It gets the right answer for a reason that has nothing to do with what the word means. The same key ranks an espresso above a latte for `coffee`, and a raw cocoa bean above drinking chocolate.
- It opens a door the ranking has kept shut. Every key reads a **name** or one of two **row** facts; none reads the panel. `nutrient-store.json` is not loaded by search at all, so this also costs an index-schema change — the same objection that killed nutrient-panel completeness in #143 §3.
- Its only member is `tea`. A predicate with one member is a denylist entry in a predicate's clothes, which is the test #157 was cut on and the test #153 applied to itself when it refused a beverages-scoped roster.

## 7. Two things that are not on the table, named so they are not re-derived

**A "UK default sense" mechanism.** The premise that `tea` means black tea for this app's reference user is true, and no existing mechanism carries it. [ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md) §1's vocabulary fires **only on an empty result**, and `tea` returns twelve rows; §1 calls that no-regression property structural. [ADR-0046](../adr/0046-curated-stand-ins-for-base-foods-usda-lacks.md)'s stand-ins exist **only for base foods USDA lacks**, and USDA has black tea three ways. Inventing a third mechanism for one word is the same refusal as §6.

**Dropping `Beverages, tea, black, brewed, prepared with distilled water`.** It is not a food anyone brews; it is USDA's control for isolating the mineral contribution of water, and its panel differs from the tap-water row exactly there — potassium 21 against 37, no fluoride against 373 µg. Removing it takes the tie from eight to seven and still leads with the decaffeinated green tea, so it buys nothing here. ADR-0055 §1 runs against dropping a reference food to fix an ordering, and #144's `isManufacturingInput` is about manufacturing inputs rather than experimental controls; stretching it to cover this would be the one-member predicate again.

## 8. Verdict

**Measured, not a defect.** #158 ships no ranking change. The harm on the case it was cut for is 1 kcal, the row a user wants is already on screen, the only candidate key that reaches it is refused on the record, and the class it belongs to has a member — `beef` — with 777 times the harm and no test watching it.

What ships instead is the instrument (`pnpm usda:ranking-ties`), the corrections in §5 written back into ADR-0055 and ADR-0042, and a tripwire in `usda-corpus.test.ts` that states what the ranking actually decides here: eight rows tie, `plainSibling` takes the ninth, and the lead is an accident.

No band was pre-registered. A band grades variants and this measurement produced none to grade — §6 and §7 between them leave nothing to sweep — so writing one after the fact would have been theatre. The verdict rule that actually applied was those two refusals, in the order they were settled. The gold set is untouched at 6 of 29 `should_lead`, as a floor and not as evidence.
