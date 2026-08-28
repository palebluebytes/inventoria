# ADR 0062: A food's own name is what retrieves it

**Status:** Accepted  
**Date:** 2026-08-28

This record amends [ADR-0042](0042-usda-search-reference-foods.md) §5, whose
retrieval test admits a row on any word of its description, and
[ADR-0056](0056-a-name-loses-the-parts-that-do-not-name-the-food.md) §1, whose
roster of parts that do not name a food gains one entry and a new safety
condition.

It drops nothing. [ADR-0061](0061-a-milk-search-returns-milks.md) is the record
that removes rows; this one is the reason the rows that remain read as an answer.

## Context

With ADR-0061's seventy-four drops applied and nothing else changed, a search for
`milk` returned **thirty-five rows, of which nineteen were not milk**: twelve
cheeses, seven yogurts, two milkfish, a mashed potato and a coffee substitute.
They had always been there. They had been sitting at positions 52 to 81, past the
fifty-row page cap, and removing the clutter above them promoted every one onto
the first screen. The corpus got smaller and the answer got worse.

Two separate mechanisms put them there.

**`Cheese, mozzarella, whole milk` matches `milk` as a whole word**, in a qualifier
where the phrase names an ingredient rather than the food. ADR-0042 §5's retrieval
test asks whether every typed token is present somewhere in the description, and
does not ask where.

**`Fish, milkfish` matches `milk` as a prefix.** That is the same branch that lets
`grape` reach grapefruit and lets a half-typed `grap` reach grapes, and it is
deliberate.

### The rule that looked right and was not

The first shape tried was "do not rank a milk word in a qualifier under a `Cheese`
or `Yogurt` head". It distinguishes nothing. `SHELF_LABEL_HEAD` in
`reference-food-ranking.ts` already classifies **`cheese`, `fish`, `nuts`,
`beverages` and `milk`** together as shelf labels rather than food names, so
`Cheese` and `Nuts` are the same kind of head and a rule keyed on that would keep
the cheeses exactly where they were.

The distinguisher is not the head phrase but **which qualifier part the word sits
in**. `Nuts, coconut milk, raw` — `Nuts` is the shelf label, so the food's own name
is part one, `coconut milk`, and the word is inside the name. `Cheese, mozzarella,
whole milk` — the food's own name is `mozzarella`, and `whole milk` is a further
part beyond it. The concept was already in the code: `shelfLength` exists precisely
because a shelf label is not part of the food's name, and a comment beside it
records the remaining gap as known — "a tea filed under `Beverages` is still a
qualifier match, which is a separate defect and a separate ticket."

### Why the rule cannot be unconditional

Measured over the shipped corpus, the number of rows a token matches **only**
beyond the food's own name part:

| token    | rows  |
| -------- | ----- |
| `cooked` | 1,578 |
| `raw`    | 1,432 |
| `salt`   | 423   |
| `water`  | 50    |
| `oil`    | 45    |
| `milk`   | 25    |

An unconditional cut empties `raw` and `cooked` entirely. The rule needed a gate,
and the gate is the one [ADR-0049](0049-a-derived-vocabulary-for-food-search.md)
§1 already uses for the vocabulary fallback: make the safe property structural
rather than disciplinary, so the rule cannot fire in the case that would break it.

**Scope.** Retrieval and one naming rule. Ranking keys are untouched: a
species-preference key was designed, measured and rejected below, and no key is
added or reordered.

## Decision

### 1. A row is discarded when every typed token matched beyond its name part

Amendment to ADR-0042 §5. A row's **name part** is its head phrase, or the
qualifier immediately after it where the head phrase is a `SHELF_LABEL_HEAD`. A
retrieved row is discarded when **every** typed token matched only in a part
beyond it.

Every, not any, and that is the whole safety argument. Under `milk`, the single
token is beyond the name in `Cheese, mozzarella, whole milk`, so the row goes.
Under the vocabulary phrase `yogurt plain whole milk`, `yogurt` and `plain` match
the name part, so `Yogurt, plain, whole milk` stays — which matters, because
`vocabulary_local` ships `natural yoghurt` pointing at exactly that row and each
hand-written entry is admitted on the condition that the search leads with the row
it recorded (ADR-0049 §4). A per-token reading would have broken the only shipped
British entry that names a milk-worded row.

A query whose tokens match nothing in any name part is unaffected, because the
rule then has no name-part match to prefer: `raw` keeps its 1,432 rows.

### 2. A fortification phrase does not name a food

Amendment to ADR-0056 §1. Its roster of parts removed from a shipped description
gains `with added vitamin A and vitamin D`, `without added vitamin A and vitamin
D`, `with added vitamin D` and `without added vitamin D`, subject to §2's existing
positional rule.

The word `fortified` is deliberately **not** on the roster. `protein fortified`
names a different food — 3.95 g of protein against 3.30 in the same milk — and a
roster that reached it would file two foods under one name.

**A trailing gloss is not a second part, and stays.** ADR-0056 §2's positional
rule asks for a whole comma-delimited part, and one of the five milks below is
not written that way: USDA types
`Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or skim)`
with no comma before its bracket, so its own punctuation makes the phrase and
the gloss one part. The phrase is removed from within the part and the gloss
joins the part before it, because the bracket glosses the FOOD rather than the
fortification. Stated here because the count in §3 needs it: without this clause
the strip reaches four milks, not five, and `skim` leaves the corpus along with
the vocabulary key that expands to it.

### 3. A rename that would collide is not made

New safety condition, and the point at which this record departs from ADR-0056 §4.
There, a rename that made two names identical was resolved by dropping the row
that carried an origin. Here there is no origin to break the tie, so the rename is
simply not made: **a roster phrase is removed only where the resulting name is
unique in the corpus.**

Measured after ADR-0061's drops, the strip renames **nine rows cleanly** — five
milks, two `Margarine-like` spreads and two `Cheese, pasteurized process,
American` rows — and would collide on **six margarine pairs**, which keep their
full names untouched. Every milk-relevant rename survives the condition, so it
costs this record nothing and buys a rule that cannot silently merge two foods.

The order is load-bearing: **drops first, then the strip, then the collision
check.** Four of the five collisions the strip would otherwise cause are milk
pairs that ADR-0061 has already resolved by dropping one side.

### 4. Two rejected rules, recorded so they are not re-proposed

In the form ADR-0055 §7 uses.

| rule                                            | why it is refused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a species key, so cow's milk leads `milk`       | `Milk, sheep`, `Milk, goat` and `Milk, indian buffalo` name an animal and cow's milk does not, which is a real convention — but there is no species roster anywhere in the codebase and these rows carry no `scientificName`, so the only implementable form is a hand-list of animal words. That is the name-shaped rule ADR-0055 §7 and #143 have refused three times, bought for one position in one query. The alternative derivation, "a row stating a fat level outranks one that does not", separates the same rows but is reverse-engineered from the answer. Sheep milk leads `milk` and that is accepted. |
| stopping `milk` from prefix-matching `milkfish` | the same branch that serves `grape` to grapefruit and `grap` to grapes, which the tier structure is built around. There is no lexical rule that keeps one and loses the other. Two milkfish rows sit at the bottom of a seventeen-row list and are left there.                                                                                                                                                                                                                                                                                                                                                      |

## Consequences

- **`milk` returns seventeen rows and fifteen of them are milk.** Without §1 it
  returns thirty-five and nineteen of them are cheese, yogurt or fish. Neither
  ADR-0061's drops nor this record alone produces a readable answer; the pairing
  does.
- **§1 changes retrieval, not order**, so ADR-0055 §2's bar applies at its
  strictest: a row this rule discards is unreachable by that query, not merely
  demoted. It must be swept over every corpus head phrase and head word and pass
  the 29 adjudicated cases in `docs/research/143-gold-set.json` before it lands.
  If the sweep shows real losses, the fallback is demotion to a new lowest tier —
  which is safe, and which does not clear the screen.
- **Nine rows are renamed and four of them have nothing to do with milk.** Two
  margarine spreads and two processed cheeses lose a fortification phrase because
  the rule is general. That is intended; a roster that fired only under `Milk`
  would be a hand-list.
- **Six margarine pairs keep names nobody would choose**, ending in `with salt,
with added vitamin D`. §3 prefers an ugly name to a merged food.
- **`Milk, nonfat, fluid (fat free or skim)` keeps its parenthetical**, which is
  what leaves the vocabulary key `skimmed milk` working: it expands to `skim milk`,
  and `skim` is still a word in that name.
- **Three rows gain a `plain_sibling` flag, and one of them is a food §2 calls
  different.** `Cheese, pasteurized process, American` and its `food` sibling
  stop naming a fortification, and a shorter name makes a qualifier-prefix
  relation that did not exist: the `low fat` and `vitamin D fortified` rows
  filed beneath them are now varietals of a plain form. ADR-0055 §3 then demotes
  them on a tie. That is the same effect ADR-0056's Consequences record, but it
  is worth saying plainly here, because §2 refuses to put `fortified` on the
  roster on the ground that it names a different food and the ranking has just
  been told the two are a plain form and its varietal. The measured cost is a
  demotion rather than a merge: both rows still ship, under their own names and
  their own panels.
- **The `Beverages` qualifier defect the code comment names is now half-closed.**
  §1 discards a tea filed under `Beverages` when the typed word sits past its name,
  but a row whose name part happens to contain the word still answers. The comment
  should be updated rather than deleted.
- **A renamed row erases the evidence for measurements stated over its
  description.** ADR-0056's Consequences already record this exposure; the nine
  renames here extend it, and every count in this record is stated over the corpus
  at the commit preceding the change.
