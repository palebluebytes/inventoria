# ADR 0101: The corpus is ingredients as bought, and not yet cooked

**Status:** Accepted  
**Date:** 2026-09-13

This record amends [ADR-0055](0055-who-eats-a-food-ranks-it-and-never-drops-it.md)
§1 for a **fourth** time, and unlike the third it is not narrow. ADR-0100 took no
general drop power and said so in terms; this one takes one, deletes 1,754 rows
with it, and loses fourteen foods that have no survivor anywhere. It also amends
[ADR-0042](0042-usda-search-reference-foods.md) §1 (what the corpus is made of),
[ADR-0056](0056-a-name-loses-the-parts-that-do-not-name-the-food.md) §1 (whose
positional strip gains three rosters), and **supersedes ADR-0100's §2 collapse as
the mechanism**, though not its as-bought line, which this record inherits whole.

It closes the implementation half of the wayfinder map at
[#186](https://github.com/palebluebytes/inventoria/issues/186).

## Context

ADR-0100 decided that a corpus row is a food **as bought**, and proposed to reach
it by _collapsing_: merge the records that differ only on a preparation, a trim, a
grade or a separation, and keep one survivor. Its pilot ([#191](https://github.com/palebluebytes/inventoria/issues/191))
measured that at 4,238 → 2,837 rows with `beef` falling 954 → 188, and found that
it **moved neither of #188's two pre-registered conditions**: C1 stayed at 24/44,
C2 went 27/44 → 28/44.

The collapse was never built. What was asked for instead was the plainer rule the
Context of ADR-0100 had refused: **delete the cooked rows**.

### What ADR-0100 got wrong about that

ADR-0100's Context refuses the crude cut on the ground that _"the fix that reaches
USDA's granularity is the fix that deletes quinoa"_, listing eighteen head phrases
the cut destroys — `quinoa`, `teff`, `spelt`, `apricots` among them.

**That measurement used a substring match**, so `/cooked/` also matched the
fourteen rows whose names say **un**cooked. With a word boundary:

|                               | substring `/cooked/` | word-boundary `\bcooked\b` |
| ----------------------------- | -------------------: | -------------------------: |
| Corpus after the cut          |                2,447 |                  **2,465** |
| Head phrases lost             |                   19 |                     **14** |
| `Quinoa, uncooked` (368 kcal) |              deleted |               **survives** |
| `teff` · `spelt` · `apricots` |              deleted |                **survive** |

ADR-0100 §10 forbids exactly this — _"a roster entry matches a complete
comma-segment and never a substring; `Caraway` and `Strawberries` both contain
the literal string `raw`"_ — and the measurement its own Context rests on fell
into it. **The fix that reaches USDA's granularity does not delete quinoa.** That
correction is what made this record possible.

## Decision

### 1. A record USDA cooked before it measured it is not a Reference food

The corpus holds ingredients **as bought and not yet cooked**. Cooking is the one
thing that happens after the purchase and changes the number, so a cooked record
measures something other than what you put on the scales.

`isCookedForm` in `src/lib/food/usda-food-kind.ts` is the predicate, applied by
the generator as a food-kind judgement of the same species as `isPreparedProduct`
and `isDryBasisRecord` beside it, and **asked after the dish filter** so that what
reaches it is an ingredient with a method written on it rather than a meal.

### 2. The line is a whole-foods shop

Drying, curing, smoking and roasting all happen before the purchase, so a food
that arrives already transformed is still the food you bought. The test, and it is
deliberately a shopping test rather than a chemical one:

> **If you could scoop it out of a bin and carry it home in a paper bag, with no
> label on it, it is an ingredient.**

Dried apricots pass. Roasted peanuts and toasted sunflower seeds pass — fifty rows
of `Nut and Seed Products` say `roasted` or `toasted` and nobody roasts their own
macadamias. **Parboiled rice does not**: it is a branded packaged product, not
something sold loose, and the two dry rows it has leave with the cooked ones.

The exemption is scoped to those two words inside that one category, because
neither is safe alone: `roasted` outside it is 374 rows of meat, and `boiled`
inside it is a chestnut somebody cooked.

### 3. Three words are deliberately absent from the method list, and each would take food the corpus needs

- **`roast` is a cut, not a method.** `Beef, chuck, arm pot roast`,
  `top round roast`, `tri-tip roast` — 17 segments, 123 uncooked rows. Only the
  participle `roasted` names the act.
- **`broiler` is a chicken.** USDA files half its poultry under
  `Chicken, broilers or fryers`, which is the bird's class and not its fate. The
  boundary after `broil` fails against `broilers`, checked rather than assumed.
- **`smoked` and `ready-to-bake or -fry` are as bought**, by §2.

Two spellings the list was missing were found by measuring rather than by reading
it: `heated` on 15 rows and `pan-broil`, which USDA writes in the infinitive on 14. Neither reaches `unheated`, whose leading `un` denies the boundary.

### 4. A name loses every word that only existed to deny an alternative

Three strips join ADR-0056 §1's positional rule, and all three are **whole-segment
and positional**, never lexical.

**The uncooked state**, in all five spellings USDA uses — `raw` (1,416 rows),
`unheated` (42), `uncooked` (13), `unprepared` (5) and `raw or unheated` (2). A
corpus of uncooked foods says the word on every row or on none, so it
distinguishes nothing.

Stripping only `raw` is worse than stripping none: it hands every `unheated` row
an unearned lift on the `raw` ranking key, which is not hypothetical — it moved
`gammon` from a ham centre slice to `Pork, cured, ham, patties`, and the
hand-written vocabulary entry's own guard is what caught it.

Six rows write the state with a parenthetical after it and keep their names whole,
because in two of them the parenthetical IS the food: `raw (liquid expressed from
grated meat)` is coconut cream.

**The enrichment word**, asymmetrically. Milling strips the B vitamins and iron
out of white rice and white flour and enrichment puts them back; `enriched` is the
unmarked state and takes the plain name. Where an unenriched twin wants the same
name, **the twin leaves** — a drop, and held to §1's terms: it is relational, it
fires only where the survivor provably ships, and the survivor is the row that
took the name. All twelve rows carrying `unenriched` as a whole segment had such a
twin, so the rule removed twelve duplicates and no food.

**A comparative qualifier nothing contests.** `regular`, `all types`, `all grades`
and `all varieties` name no property of the food — each denies an alternative, so
with no alternative left each says nothing. A qualifier goes only if it is **both**
comparative **and** uncontested, where uncontested means no other row differs from
this one at only that position.

The second condition alone was built first and is far too strong. On a corpus this
sparse most qualifiers are unique in their position, so it reduced
`Rice, brown, long grain` to `Rice, brown` and `Apples, red delicious, with skin`
to `Apples`. **Uniqueness is not meaninglessness**, and no computation can tell
that `regular` describes nothing while `long grain` describes something, because
the difference is in the English rather than in the corpus.

### 5. Comparisons are punctuation-blind; shipped text is not

USDA's spelling of one thing is not stable — `Rice, white, long-grain` and
`Rice, white, long grain` are one rice. Commas, hyphens, slashes and repeated
whitespace are normalised away when asking whether two rows are the same name, and
nothing that carries meaning is. It is #191's clause verbatim, and safe for its
reason: it merges strings already identical apart from punctuation, so it costs no
judgement and cannot fuse two foods.

**The shipped text keeps USDA's own spelling**, because a row should be renamed by
a rule that means something and never by a key.

There was exactly one such pair in the corpus, which is why this is a clause
rather than a pass: a rule reaching one row by name is a denylist in a predicate's
clothes ([#157](https://github.com/palebluebytes/inventoria/issues/157)'s test).
What earns it is that the hyphen had **defeated the enrichment rule** — the two
rows differed by a hyphen, so the collision check never saw them as twins.

### 6. The base-ingredient preference becomes a fact about the row

`RelevanceKey.raw` used to read the word off the name. The name no longer carries
it, so the key is computed at generation time from **USDA's own description,
before the strip**, and baked onto the row beside `plain_sibling` and
`designated`. `schema_version` 8 → 9.

**It is not "is this food uncooked"** — every row is. It is **did USDA describe it
as raw**, which separates a whole fresh food from a processed one that simply has
not been cooked yet. Without it, `Potatoes, flesh and skin` and
`Potatoes, hash brown, refrigerated` tie, and a typed `potato` leads with hash
browns — which is exactly what happened before this moved.

### 7. `simplicity` is retired

It read `endsWith(", raw")`. No name ends that way now, so it returned **exactly
what `raw` returns on all 2,484 rows**, from two slots _below_ `raw`, where it
could never break a tie `raw` had not already broken. Ablated over 2,679 queries
it changed **no ordering at all** — not a lead, not a tail position.

Eleven keys remain. This is the first ranking key the project has ever removed,
and it is worth noting that [#192](https://github.com/palebluebytes/inventoria/issues/192)
went looking for exactly this against ADR-0100's collapse and found nothing
redundant. The reason it found nothing is instructive: **a collapse merges
duplicate rows and leaves every distinction standing. Removing them does not.**

### 8. The cost is fourteen foods, and they are listed

USDA publishes each of these cooked and no other way, so there is no version of
this rule that keeps them. A rule reading one row at a time cannot tell a
duplicate from the only record there is.

| Food                                                   | Why                                |
| ------------------------------------------------------ | ---------------------------------- |
| **mutton**, **turkey breast**, **turkey thigh**, dove  | published roasted and no other way |
| escarole, stinging nettles, malabar spinach, tree fern | published boiled                   |
| buckwheat groats, pinon nuts, winged bean              | published cooked or roasted        |
| salmon nuggets, guava sauce, beef composite            | published cooked                   |

A fifteenth loss has no row of its own: **`jacket potato` no longer answers.** A
jacket potato _is_ a baked potato, so there is no uncooked row for the word to
reach and no re-choosing available; its ADR-0049 §4 entry is removed. A raw potato
is still in the corpus and still answers `potato`.

Two further vocabulary entries were re-measured rather than re-stated, which is
what their guard demands: `gammon` now targets `pork cured ham whole` and lands on
a joint, and `plain flour` re-records the name its row now ships under.

**Every casualty is in `docs/research/usda-drop-census.json`** under
`cooked_form`, browsable with its cause at `docs/food-search.html`.

### 9. What it bought

|                                                          |      before |         after |
| -------------------------------------------------------- | ----------: | ------------: |
| Corpus                                                   |       4,238 |     **2,484** |
| Foods (head phrases)                                     |         512 |           498 |
| Search index                                             |   1,675 KiB |   **968 KiB** |
| `JSON.parse`                                             |    13.93 ms |    **6.6 ms** |
| Rows never reaching the first 50 for any corpus word     | 1,737 (41%) | **614 (25%)** |
| Rows not retrievable first by their own full description |         130 |        **21** |

The last row is the one that says most about the naming rules. A name that has
stopped carrying `raw`, `enriched` or `regular` is far harder for a rival to
account for, so a row searched by its own description now leads it.

It also repaired five leads `docs/research/143-gold-set.json` had recorded as
**wrong**: `spinach` used to lead with `Spinach, cooked, boiled, drained, without
salt`, and millet, teff, tempeh and rice noodles led with their cooked rows. All
five were wrong _because_ a cooked row was answering, and all five rows are gone.

## Consequences

**#188's bar is not what it was, and cannot be read as if it were.** Its 44 gold
rows were hand-picked against a corpus twice this size; 39 of them are renamed and
five are gone. A C1/C2 number measured now is not comparable with the 24/44 and
27/44 registered before, and this record does not quote one.

**`143-gold-set.json` had gone silently blind and is repaired.** It was keyed on
description alone, so when the strip renamed `Arugula, raw` to `Arugula` the
harness stopped matching 18 of its 19 adjudicated-correct cases and reported no
breakage having checked one. Every case now carries the `fdcId` of the row it
names — which is what [#188](https://github.com/palebluebytes/inventoria/issues/188)
does for its own set, and says in writing is the reason.

**Twenty-six shipped rows now fail their own filters if re-run.**
`isProcessedProduct` exempts anything described as `raw`, the filters are asked of
the archive description, and the shipped name has since lost that word — so
`Lemon juice, raw` passed the filter and ships as `Lemon juice`. They shipped
correctly; re-running a filter over a name it never saw asks a different question,
and the corpus test says so rather than pretending the invariant still holds.

**`raw` and `cooked` are no longer askable.** Typing `raw` reaches 7 rows and
`cooked` none. Queries spelled that way — `raw oyster`, `spinach raw` — find
nothing, and there is nothing left for them to disambiguate.

**The generator's guards earned their place three times over.** A written
supersede outlived its survivor (`Cabbage, napa, cooked` deferring to a pe-tsai
row that is itself now cut, fixed by binding the assertion only to entries that
actually removed a row); two vocabulary entries stopped leading their recorded
row; and the designation tag was found to be **hiding state words from the
strip** — USDA writes `Moose, meat, raw (Alaska Native)`, so while the tag is
attached the segment is not `raw`, and removing the tag one step later exposed a
bare `raw` that nothing looked at again. 41 rows were shipping with a word every
other row had lost.

**What would reopen this.** A food lost in §8 gaining an uncooked record in a
mirror refresh brings it back at no cost. A second composition table that
publishes uncooked forms of the fourteen would reopen ADR-0045's first
alternative. A user who wants a cooked figure has no row to log against, and
[#187](https://github.com/palebluebytes/inventoria/issues/187) found USDA's
cooking-yield table keyed to identifiers we already join on — but it covers meat
and poultry only, 170 rows, and says nothing about the rice and pulses where the
gap is widest.
