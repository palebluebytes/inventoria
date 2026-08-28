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

## Amendment (2026-08-28, #176): the sweep, and the gate the cut needed

§1 shipped, and not in the form written above. The sweep its Consequences
require was run twice — over the 3,857 corpus head phrases and head words
`sweepQueries` produces, and over every one of the 4,733 words the shipped
descriptions contain — and the rule as stated fails the bar it set itself.

### What the bare rule costs

Discarding on the every-token reading alone moves **20 leads** and takes
**15,350 rows** off **526** of the 3,857 queries. Most of the moved leads are
washes on words nobody types (`species`, `dry`, `based`), and three are the loss
ADR-0055 §2 forbids outright, because the discarded row is unreachable rather
than demoted:

| query       | today                        | under the bare rule     |
| ----------- | ---------------------------- | ----------------------- |
| `chili`     | Peppers, hot chili, red, raw | Spices, chili powder    |
| `butternut` | Squash, winter, butternut    | Nuts, butternuts, dried |
| `swiss`     | Chard, swiss, raw            | Cheese, swiss           |

The wider query set adds `ancho` (an anchovy answering for a chile), `roma` (a
romano for a tomato) and `yellow` (a yellowtail for one). Every case is the same
shape: a word USDA writes as one food's qualifier is another food's own name,
which is #124's whole class arriving from the other side.

### The reserved fallback is refused on measurement

The Consequences reserve demotion to a new lowest tier. Measured, it buys
nothing: the milks already outrank the cheeses under `milk`, so a demotion
leaves that answer **byte for byte what it is today** — the eighteen rows stay
on the screen — while still moving the same 20 leads, two of them onto the wrong
food. It pays the cost of the rule and delivers none of it. Placed above `tier`
rather than below it, it moves 42 instead, which is what ADR-0042's #159
Amendment already forbids.

### The gate that ships

A row is discarded when every typed token matched only past its name part **and
some retrieved row answers the query on a strictly higher `tier` rung.** The bar
is the best rung any name reached, which makes the safe property structural in
ADR-0049 §1's sense rather than disciplinary:

- A query no name part answers leaves the bar at 0 and every row clears it, so
  `raw` keeps its rows and `cooked` keeps its.
- **The lead can never be discarded.** The leading row holds the highest rung in
  the set, so it clears any bar that set can produce.
- A word that names one food and qualifies another at the SAME rung keeps both,
  which is what leaves `chili`, `butternut`, `swiss` and `ancho` exactly as they
  were.

Measured over both query sets: **0 leads moved, 0 queries emptied**, and the 29
adjudicated cases in `docs/research/143-gold-set.json` unchanged. `milk` returns
**seventeen rows, fifteen of them milk** and two of them the milkfish §4 declines
to chase, which is what §1's Consequences claim.

### The table in §1, re-measured on the corpus that ships

§1's counts stand as they are written. They were taken before ADR-0061's drops
and §2's renames, and the corpus they describe is gone, so they are not edited
here — these are what the same six tokens reach on the 4,238 rows that ship, and
they are the figures the tripwire in `usda-corpus.test.ts` holds:

| token    | §1, before the drops | reaches past the name now | retrieved after the rule |
| -------- | -------------------- | ------------------------- | ------------------------ |
| `cooked` | 1,578                | 1,578                     | 1,578, all of them       |
| `raw`    | 1,432                | 1,444                     | 1,444, all of them       |
| `salt`   | 423                  | 426                       | 1                        |
| `water`  | 50                   | 50                        | 12                       |
| `oil`    | 45                   | 42                        | 70                       |
| `milk`   | 25                   | 18                        | 17                       |

### What it costs, stated

445 of the 3,857 queries return fewer rows, 14,264 rows in total. A typed `pot`
returns 44 rows rather than 91, and a typed `whole milk` two rather than
thirteen. Every dropped row still answers the words that name it: the mozzarella
leads `mozzarella`, and the pot roast answers `pot roast`.

### Where it lives, and per what

`withoutStrayMentions` in `reference-food-ranking.ts`, applied in `rankAgainst`
before the sort. `named` rides on `NameKey` because it is the same reading of the
same tokens the ranking already does, and `compareRelevance` deliberately does
not read it: §1 decides what is retrieved and nothing about the order.

**Per phrase, not per query.** Where a vocabulary key expands to several phrases
(ADR-0049 §1), each is a query and the rung another phrase reached is no evidence
about this one. Measured over the 155 multi-phrase keys the map ships, one bar
across the union drops rows in 21 of them that a phrase of their own names —
`cacao butter` loses `Oil, cocoa butter` to a cocoa powder, because USDA files
the butter under `Oil` — and hands `mandarine` a tangerine where a mandarin
answers. Applied per phrase it keeps everything the union keeps and those rows
besides, which is why the search scores each phrase, filters, and then merges.
