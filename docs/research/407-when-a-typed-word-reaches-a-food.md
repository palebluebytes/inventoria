# Research: when a typed word reaches a food (#407)

**Grounds:** the committed `public/usda/search-index.json` (`schema_version` 9, 2,023 rows) read through the shipped `searchIndexRows`, and both bulk archives in `.usda-backup/` read directly where a rule's population is not in the corpus it emptied (#131). Every figure below was measured against the corpus this branch ships, not against a recorded one.
**Siblings:** [#142](https://github.com/palebluebytes/inventoria/issues/142), [#163](https://github.com/palebluebytes/inventoria/issues/163) and [#407](https://github.com/palebluebytes/inventoria/issues/407), taken together. [ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md) §1 is the gate all three push on, [ADR-0062](../adr/0062-a-foods-own-name-is-what-retrieves-it.md) §1 the drop rule, [ADR-0104](../adr/0104-the-corpus-is-ingredients-as-bought-and-not-yet-cooked.md) the corpus they are measured over. Parent map [#186](https://github.com/palebluebytes/inventoria/issues/186) parked all three as "ordinary tickets".
**Date:** 2026-09-16. **Status:** measurement and three dispositions. One strip rule and one hand-adjudicated drop shipped; `compareRelevance` is untouched, and so is ADR-0049 §1.

---

## 1. The verdict, first

Three tickets were filed as three defects and read as one: a word a British user types does not reach the food it names. They are not one defect. Measured, they are three different things, and **two of them are already fixed or were never what they said**.

| ticket   | filed as                                      | measured today                                          | disposition                       |
| -------- | --------------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| **#142** | `raw aubergine` finds nothing; substitute     | the substitution rescues **0 of 248** carrier queries   | closed, refuted                   |
| **#163** | `buffalo` will lead with a water buffalo      | the promotion that would have caused it **was refused** | closed, premise gone              |
| **#407** | `ham` returns one row, `gammon` returns fifty | `ham` returns 33; what is left is ordering              | re-scoped, retrieval half shipped |

What binds them is real but it is not a mechanism: all three are places where **ADR-0049 §1's gate is zero results**, and none of the three produced a case where that gate is wrong. That is recorded in §6, because it is the third time the door has been pushed.

## 2. #142 — the substitution repairs the half that was not broken

The ticket asks for token-wise substitution inside a longer phrase, drawn from the single-word-key/single-word-value subset of `vocabulary_off`, so that `raw aubergine` reaches what `aubergine` reaches.

The subset is **62 entries** today (the ticket says 64; the vocabulary is corpus-relative and has moved). Swept across four carriers, typing each carrier phrase and then typing what one substitution would produce:

| carrier     | returns nothing | rescued by one substitution |
| ----------- | --------------: | --------------------------: |
| `raw X`     |           62/62 |                       **0** |
| `chopped X` |           62/62 |                       **0** |
| `X salad`   |           62/62 |                       **0** |
| `fresh X`   |           62/62 |                       **0** |
| **total**   |     **248/248** |                       **0** |

All 62 bare keys answer today, so the vocabulary is doing its job on the query shape it was built for.

**The cause is the carrier, not the synonym.** `raw aubergine` fails on `raw`. So does `raw eggplant`, which is exactly what the proposed substitution produces. ADR-0104 took `raw` out of every name — one row in 2,023 still carries the word, and it means something else by it (§5) — and `chopped`, `fresh` and `salad` were never ingredient names in these archives at all. Substituting the food word leaves the carrier word unmatched and the query still returns nothing.

The ticket half-saw this: it records that `natural yoghurt` substitutes to `natural yogurt`, which also retrieves nothing, and concluded that the motivating case needed #141's hand list instead. The sweep generalises that observation from one case to 248.

**Its own evidence was also dead.** `docs/research/142-carrier-phrase-sweep.md` measured 72 rescues in 348 queries against a 4,238-row corpus that no longer exists; 18 of those 72 came through a `cooked X` carrier ADR-0104 has since emptied.

One measurement moved during this session and is worth recording because it shows how thin the margin was. Before §5's strip the sweep found **1** rescue in 248 — `raw prawn` → `raw shrimp` — which worked only because `Crustaceans, shrimp, mixed species, raw (may contain additives to retain moisture)` had smuggled the word `raw` past the state strip inside a bracket. Taking that bracket off took the rescue with it. The mechanism's entire measured value was one row's punctuation accident.

## 3. #163 — the cost it was written to prevent was never paid

The ticket exists because [#159](https://github.com/palebluebytes/inventoria/issues/159) proposed promoting ADR-0055's `designated` key above `tier`, which would hand `buffalo`'s lead to `Game meat, buffalo, water` — a water buffalo, a different animal — for a price of 2 kcal.

**That promotion was refused in writing.** ADR-0042's #159 Amendment: _"It is refused, and nothing changed: no ranking code, no test, no filter, no `schema_version`."_ The `designated` half is _"left unshipped on purpose"_, because it pushed designated rows past ADR-0055 §1's 50-row cap, 845 → 784. `compareRelevance` carries twelve keys today and `designated` is **last**.

So `buffalo` still leads with `Buffalo, free range, top round steak`, correct by accident, and the accident is now settled rather than about to be spent.

What survives is not the ticket's complaint but a different one: the corpus files the American animal under `bison` across **9 rows** (the ticket says 20; ADR-0103's collapse has since run), and `buffalo` reaches **3** — the bison-by-accident row, the water buffalo, and `Milk, indian buffalo, fluid`.

**No vocabulary entry can reach that, and the ticket named the reason itself.** ADR-0049 §1 fires only on **zero** rows. `buffalo` returns three. A `buffalo → bison` entry would never execute. The ticket asked for this to be stated explicitly in the outcome rather than left as a detail, so: the constraint is the disposition, not a footnote to it.

Dropping from 5 rows to 3 moved it no closer to firing, because the gate is zero rather than a threshold.

## 4. #407 — one foodservice record was hiding the whole category

The ticket was filed when `ham` returned **one** row and `gammon` returned fifty. Both halves have moved.

`Ham, sliced, restaurant` had `Ham` as its head phrase, so it reached the top tier — which raised the bar `withoutStrayMentions` measures stray mentions against, and cut all 47 `Pork, cured, ham, …` rows beneath it. ADR-0104's foodservice rule removed that record for unrelated reasons, and the category came back with it. **The rule was working exactly as designed; the defect was one row's presence.**

Today:

```
ham      33 hits   → Pork, cured, ham, center slice, country-style, separable lean only
gammon    4 hits   phrases ["gammon", "pork cured ham whole"]
                   → Pork, cured, ham, whole (gammon)
```

Two things are left, and they are different in kind.

**The lead is wrong.** A country-style centre slice is not what `ham` should answer with. That is ordering, not retrieval, and it belongs to the collapse (#435) rather than to this ticket.

**The asymmetry has inverted, and nobody has written it up.** `gammon` was filed for returning _too much_; it now returns **4 of the 33 hams**, because `LOCAL_VOCABULARY`'s entry expands it to `pork cured ham whole` — narrower than the category the word names. The British door is now the worse door, which is the ticket's original complaint pointing the other way.

The entry's own `why` explains the narrowness and **the explanation has expired**: it records that the bare `pork cured ham` led with `Pork, cured, ham, patties` once the cooked patty rows went, "and a patty is not a gammon". Measured today, `pork cured ham` leads with `Pork, cured, ham, center slice, country-style, separable lean only`. The corpus moved again at `7c8f4dee` and the entry was not re-read.

Three numbers for whoever returns to it, so they are not re-derived:

| `gammon` expands to            |   hits | leads with                                         |
| ------------------------------ | -----: | -------------------------------------------------- |
| `pork cured ham whole` (today) |  **4** | `Pork, cured, ham, whole (gammon)`                 |
| nothing (entry removed)        |  **0** | —                                                  |
| `pork cured ham`               | **24** | `Pork, cured, ham, center slice, country-style, …` |

24 rather than 33 is not a shortfall: the nine rows `ham` reaches and `gammon` does not are `Pork, fresh, leg (ham), …` — fresh leg, uncured, which is not gammon.

**`gammon` is one of #188's 17 British tripwire queries**, and that tripwire fires on exactly one transition — a query that answered now answers with nothing. Removing the entry trips it deliberately. The entry is therefore left exactly as it is, and the choice is recorded here rather than made quietly.

## 5. What shipped: five rows that outlived the state strip

ADR-0104 took the state word out of every name. Five rows kept it, and the reason is punctuation in both shapes.

| row                                                                                  | shape             | ships as                             |
| ------------------------------------------------------------------------------------ | ----------------- | ------------------------------------ |
| `Crustaceans, shrimp, mixed species, raw (may contain additives to retain moisture)` | welded to a gloss | `Crustaceans, shrimp, mixed species` |
| `Nuts, coconut milk, raw (liquid expressed from grated meat and water)`              | welded to a gloss | `Nuts, coconut milk`                 |
| `Nuts, coconut cream, raw (liquid expressed from grated meat)`                       | welded to a gloss | `Nuts, coconut cream`                |
| `Walrus, meat and subcutaneous fat raw`                                              | no comma          | `Walrus, meat and subcutaneous fat`  |
| `Beef, …, tripe uncooked, raw`                                                       | no comma          | dropped — `Beef, tripe` was taken    |

While a bracket is attached the part is not `raw`, so the positional strip walks past it. `FOOD_DISTRIBUTION_GLOSS` already stated this composition and named the failure mode — _"the same composition the designation tag needed, **and the same bug when it is missing**"_ — and reached the two glosses it knew by name. Nothing reached the rest.

The rule is therefore to **read a part as the phrase it is, with any trailing gloss set aside**, which is the same two lines `stripFortificationQualifier` and `stripStorageQualifier` have carried all along, plus an end-anchored match for the no-comma shape. Bounded over both archives: **no `ORIGIN` or `CATALOGUE` part carries a gloss at all**, so this widens the strip over the state roster and over nothing else, and the no-comma shape has exactly two members, both of them the defect.

**Two written arguments are withdrawn by this**, and both are reversed in place rather than deleted:

- The shrimp's bracket was kept because "added water is a claim about the panel rather than about the journey" and removing it "would hide something a reader of the number should know". That answered the wrong question: the bracket was not merely a hedge being kept, it was the weld, and a fact about the panel belongs on the panel rather than in the name.
- The coconuts were kept whole because "the parenthetical IS the food: `raw (liquid expressed from grated meat)` is coconut cream, not a raw anything". That does not survive its own result — strip the segment and what remains is `Nuts, coconut cream`, which names the food exactly, because the head phrase was already carrying the name the gloss was said to hold.

Three counterexamples bound the rule and are pinned as tests: `Whale, bowhead, skin and subcutaneous fat (muktuk)`, `Milk, nonfat, fluid, … (fat free or skim)` — both brackets that genuinely name — and `Seeds, sesame butter, tahini, from raw and stone ground kernels`, where `raw` is one word of a phrase about grinding. **That tahini is the last row in 2,023 saying the word, and it is the one row that means something else by it.**

One row left with the rule rather than being renamed by it: the New Zealand tripe's stripped name was already held by the plain `Beef, tripe`, so ADR-0056 rule 1's tiebreak dropped the row that named an origin. A drop caused by a name being taken, never by whose food it is.

`Chicken, ground, with additives` also leaves, as a hand adjudication under ADR-0061 §5. The phrase matches exactly one row in both archives, and the plain `Chicken, ground` ships. Its 62 `with added solution` cousins are deliberately untouched — a family is ADR-0103's collapse to take, not a hand-written verdict to guess at one row at a time.

Corpus: 2,025 → **2,023**.

## 6. The rule that was refused: delete every row with a plainer sibling

Taken seriously and measured, because "keep only the plain ones" is a reasonable thing to want and the flag looks made for it.

Mechanically the sweep is clean. **234 rows leave, 1,789 survive.** One pass reaches a fixpoint — nothing is newly flagged. No head phrase is lost, no head phrase is emptied, no gold row is deleted, the British tripwire does not fire, and `plainSibling` becomes dead and retirable, taking `compareRelevance` from twelve keys to eleven.

It also **buys nothing on the registered bar**: C1 26/44 → 26/44, C2 31/44 → 31/44.

And it deletes food:

```
onion     9 → 2      gone: spring or scallions · red · white · yellow · sweet · welsh
lentils   4 → 1      gone: pink or red · dry · sprouted
broccoli  6 → 2      gone: chinese · stalks · flower clusters · leaves
cod       5 → 3      gone: Atlantic wild caught · Atlantic dried and salted
```

Across the 74 head phrases it touches, the same shape: `Fish, salmon, chinook, smoked, (lox)`, `Fish, herring, Atlantic, kippered`, `Beef, flank, steak`, `Beef, tenderloin, steak`, `Pears, bosc`, `Radishes, oriental`. That is smoked salmon, kippers, spring onions, red lentils, salt cod and two beef cuts.

**`plain_sibling` is not a duplication flag.** ADR-0055 §3 built it to demote in ranking — "fifteen red and thirteen white varietal wines sitting above the wine they are varieties of". It means _a row with a shorter name exists_, which is as true of a red onion as of `Turkey, whole, meat only, with added solution`. As a deletion predicate it cannot tell them apart, and ADR-0104 §2's shopper test condemns it row by row. It also flags beef **cuts**, which #191's pilot treated as distinguishing, and it is the harm #190 recorded when it killed the crude cut.

About half the 234 genuinely should go — the `with added solution` turkeys and pork, the `dry roasted, with salt added` nuts, the six self-rising cornmeals, the 30 varietal wines that are ADR-0055 §3's own example. That is ADR-0103's collapse (#435), which names a survivor for every row it takes.

## 7. The bar, re-measured

For [#438](https://github.com/palebluebytes/inventoria/issues/438), which is open to re-measure it and amend ADR-0103 with what shipping did. Against the 2,023-row corpus, over #188's 44 gating queries:

**C1 26/44 · C2 31/44.**

The record carries 25/44 and 32/44, measured 2026-09-14, before `7c8f4dee` took the corpus 2,037 → 2,025 and before this note's strip took it to 2,023. This is a by-product of the instrument built for §2 and §6, not a substitute for #438's own account.

## 8. What this leaves open

- **The carrier-word defect.** A query token naming a row _fact_ rather than a row _name_ retrieves nothing. `raw` has 1,049 rows behind it and no name to reach them by, and `raw X` returns nothing for every food in the corpus. This is the finding underneath #142 and it is bigger than #142 was; filed separately so it does not inherit a refuted mechanism's history.
- **`gammon` expands to less than it names.** §4's three numbers are on the record; the entry is unchanged.
- **The `named` flag and aliases.** `withoutStrayMentions` reads `NameKey.named`, which `bestNameKey` carries from whichever name won `compareRelevance` — and `compareRelevance` does not read `named`. On the 73 rows carrying `also`, the surviving flag may belong to the best-ranked name rather than to the name that reached the food's own name part. Neither the code nor ADR-0062 addresses the interaction.
- **`raw` is undeclared on `UsdaIndexRow`.** It is in the artifact on 1,049 rows and read at runtime through a structurally-typed parameter, so the ranking key works while the interface says the field is always 0.

**Two of the four are closed since, and the entries above stand as they were written.** `raw` was declared on `UsdaIndexRow` and both instruments' copies of the shape by [#466](https://github.com/palebluebytes/inventoria/issues/466). The `named` flag was taken up as [#465](https://github.com/palebluebytes/inventoria/issues/465): swept, found to part from the disjunction on one row and to change no result set, and corrected anyway — `named` is now the rung a name reached rather than a flag read off the winner, which [ADR-0062](../adr/0062-a-foods-own-name-is-what-retrieves-it.md)'s #465 Amendment records with the sweep.
