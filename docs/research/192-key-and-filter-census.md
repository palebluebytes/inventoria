# Research: what the collapse makes redundant (#192)

**Grounds:** the committed `public/usda/search-index.json` (`schema_version` 8, 4,238 rows) and the collapsed corpus `pnpm usda:beef-pilot --emit` produces from it (2,837 rows), measured by `pnpm usda:key-census` and `pnpm usda:filter-census`. The filter census also reads the bulk archives directly, because a filter's casualties are not in either corpus.
**Siblings:** parent map [#186](https://github.com/palebluebytes/inventoria/issues/186). [ADR-0100](../adr/0100-what-was-done-to-a-food-is-not-another-food.md) is the rule whose collapse is under test, [#191](191-beef-pilot.md) the pilot that produced the corpus, [#188](188-consolidation-bar.md) the bar.
**Date:** 2026-09-12. **Status:** census. No ranking key, filter or name roster changed; two measurement scripts were added and the `Beef` pilot's roster moved into a module both of them read.

---

## 1. The verdict, first

**Nothing is redundant.** All ten ranking keys still move leads after the collapse, all fourteen filter families still remove rows the collapse would not, and the four name-strip rosters share no entry with the collapse roster. The ticket's terminus was written expecting a retirement list; the measurement produces an empty one.

The reason is structural rather than lucky, and ADR-0100 §7 says it in advance without noticing it says this too: **a collapse always leaves a survivor.** It merges records of one food. Every rule under test separates _different_ foods — a fat from a meat, a brand from an ingredient, an imitation from the thing. A rule that separates two foods has the same work to do whether the corpus holds thirty copies of each or one.

## 2. The ranking keys

Ablation, one key at a time, over a **pinned ruler**: `sweepQueries` off the shipped corpus, 3,857 queries, run against both corpora. The sweep is derived from corpus text, so the collapsed corpus generates its own 3,767-query set; running each corpus against its own ruler would attribute to the collapse what is the ruler moving.

| ablated key    | shipped | collapsed | #143 leads broken | #188 C1 lost |
| -------------- | ------: | --------: | ----------------: | -----------: |
| `tier`         |      99 |        99 |                 0 |            1 |
| `raw`          |      63 |        67 |                 0 |            0 |
| `head`         |      25 |        25 |                 0 |            0 |
| `accounted`    |       4 |         4 |                 0 |            0 |
| `position`     |     336 |       337 |                 0 |            0 |
| `plainSibling` |      29 |    **57** |                 0 |            0 |
| `plain`        |      48 |        48 |                 0 |            1 |
| `wholeness`    |       9 |         8 |                 0 |            0 |
| `simplicity`   |      24 |        23 |             **2** |        **4** |
| `designated`   |      12 |        12 |                 0 |            0 |

Two columns are the ADR-0055 §2 bar rather than the sweep: `143-gold-set.json`'s heads measured **correct**, and #188's 44 queries whose gold row is in the top 3 today. A key whose removal costs one of those is load-bearing whatever its sweep tally says.

**The three keys the ticket named as most likely dead are not dead.** `COMPOSITE_OF_CUTS` and `SEPARATED_FAT` are `wholeness`'s two arms; the rows they reach fall from 54 and 51 to **12 and 32**, and the key still moves 8 leads. `plain` moves the same 48 either way and costs a C1 when removed. `plainSibling` **doubles**, 29 to 57.

**`plainSibling` doubling is the finding that most contradicts the ticket's premise.** The ticket lists it among the keys that "float a plain form above its variants, which is the job the corpus rule now does". The collapse does the opposite: stripping collapsing segments turns names into strict prefixes of one another, so `plainSiblingsOf` fires on **193** rows where it fired on 134, and the key it feeds gets twice the work.

**`simplicity` is the quiet one.** It moves the fewest leads of any key that touches a protected set, and it is the only key whose removal breaks a #143 lead — two of them — and the largest cost in #188 C1s. On `apple` it is what keeps `Apples, red delicious, with skin, raw` above `Apples, raw, golden delicious, with skin`. A census reading only the sweep column would have called it the weakest of the ten.

**Pairwise, nothing masks anything.** The four couples that read overlapping predicates were ablated together, and every one lands within four leads of the sum of its singles:

| couple                   | singles, collapsed | pair |
| ------------------------ | -----------------: | ---: |
| `raw` + `plain`          |      67 + 48 = 115 |  115 |
| `plain` + `wholeness`    |        48 + 8 = 56 |   56 |
| `head` + `accounted`     |        25 + 4 = 29 |   28 |
| `plain` + `plainSibling` |      48 + 57 = 105 |  109 |

Masking would show as a pair moving far more than its singles — two keys each reporting zero because the other still does the work. None does. The keys are close to independent, which is what makes the one-at-a-time column safe to read.

## 3. The filters

**A filter cannot be measured on the collapsed corpus.** Filters run at generation time, before any collapse; the 2,837-row corpus is derived from the 4,238 rows they already chose. Counting what a filter matches there returns zero by construction and means nothing.

So the census replays the generator's own pipeline, keeps every casualty instead of counting it, and asks of each: **does its residual description, under ADR-0100 §3's key, collide with a row that ships?** A collision is necessary for redundancy and not sufficient — §4's chain might pick the casualty as representative, which promotes the row rather than absorbing it — so the test over-credits the collapse and never under-credits it. **A filter it calls alive is alive.**

| stage   | family                    | dropped | absorbed | promoted | own row |
| ------- | ------------------------- | ------: | -------: | -------: | ------: |
| row     | `brand_specific`          |     924 |        0 |        0 |     924 |
| row     | `processed`               |   1,427 |        0 |        0 |   1,427 |
| row     | `prepared`                |   1,199 |        0 |        0 |   1,199 |
| row     | `dry_basis`               |      17 |        0 |        0 |      17 |
| row     | `manufacturing_input`     |      58 |        0 |        0 |      58 |
| row     | `superseded`              |       1 |        0 |        0 |       1 |
| row     | `no_energy`               |      14 |        0 |        0 |      14 |
| variant | `flavoured_variant`       |      26 |        0 |        0 |      26 |
| variant | `fortification_duplicate` |      12 |        0 |        0 |      12 |
| variant | `dehydrated_form`         |       6 |        0 |        0 |       6 |
| variant | `adjudicated_variant`     |      30 |        0 |        0 |      30 |
| name    | `collision`               |       8 |        0 |        0 |       8 |
| name    | `preparation_sibling`     |       8 |        0 |        0 |       8 |
| name    | `designation_collision`   |       6 |        1 |        0 |       5 |

**3,736 casualties, of which 3,735 would arrive in the corpus as rows of their own.** One row — a designation collision — is the entire redundancy the collapse creates across every filter in the generator.

The order is load-bearing and the table reports it as such: a row dropped as brand-specific is never offered to the processed filter, so a family's casualties are the rows that _reached_ it, not the rows that match it (#144's rule, that a drop rule's reach is pinned as the population it left).

**ADR-0061's seventy-four drops are confirmed by measurement rather than by argument.** ADR-0100 §8 states that under §2's as-bought line every one of them is a distinguishing axis — you buy chocolate milk as chocolate milk. The census agrees to the row: 74 casualties, 74 own-row, zero absorbed. §8 was right and is now measured.

The census reproduces #191's headline from the generator side, by an unrelated route: the 4,238 shipped rows fall into **2,837 collapse groups**.

## 4. The name rosters

ADR-0100 §5 gives ADR-0056 §1's positional strip a second roster, so the two could have been one rule written twice. They are not, and the number rather than an argument says so. Measured over the rows that reached the strip — never over the shipped corpus, whose names have already lost these segments:

| roster                     | entries | reaches | also claimed by the collapse roster |
| -------------------------- | ------: | ------: | ----------------------------------: |
| `ORIGIN_QUALIFIERS`        |       3 |     280 |                               **0** |
| `CATALOGUE_QUALIFIERS`     |       3 |     647 |                               **0** |
| `FORTIFICATION_QUALIFIERS` |       4 |      15 |                               **0** |
| `DESIGNATION_TAGS`         |       8 |     151 |                               **0** |

Each roster is measured by its **own shipped function** and never by a match written in the census. `DESIGNATION_TAGS` is why: its entries are parenthesised tags carried _inside_ a segment, so a whole-segment test reports the roster reaching nothing — a census measuring its own transcription rather than the rule. That instrument was written, produced a `0`, and was replaced.

789 rows are renamed at generation time and none of it is the collapse's work. The two rosters are disjoint by construction: ADR-0056's strips remove a commercial origin, a cataloguing qualifier, a fortification phrase or a designation tag; ADR-0100's remove a preparation, a separation, a trim or a grade.

## 5. Four counts in the ticket and the ADR are wrong

This map has been bitten by a restated count three times (#155, #162, #369), so each is stated once, here, against the code that answers it.

| stated                                | measured                                                        |
| ------------------------------------- | --------------------------------------------------------------- |
| "eight ranking keys"                  | **ten** terms in `compareRelevance`                             |
| "fifteen filter families"             | **fourteen** drop families in the generator                     |
| "29 hand-adjudicated names"           | `ADJUDICATED_NAMES` has **one** entry                           |
| ADR-0100 §11's "29 adjudicated cases" | `143-gold-set.json` holds **50**, of which **19** are `correct` |

The eight is the `NameKey` ordering fields; `compareRelevance` also reads ADR-0055's two row keys, which is exactly the pair that goes missing when a harness forgets them. The 29 appears to have travelled from `ADJUDICATED_VARIANTS`, which has 30. ADR-0100 §11's figure is corrected in place, being a miscount rather than a change of position.

## 6. Three traps the instruments had to be built around

**`qualifierPass` is still blind, and correctly so.** `usda-ranking-audit.mjs`'s #124 pass scores `rank(ownName(food))` and sorts it with `compareRelevance`, so `b.plainSibling - a.plainSibling` is `NaN`, `NaN ||` is falsy, and both ADR-0055 row keys fall through unread. That is deliberate there — the pass is a frozen pre-registration of a two-key-older ranking — and it is a trap for anyone who copies the shape, because two of the ten keys under test here are the two it cannot see. The census scores through `scoreAll`'s shape instead.

**The pilot's collapsed corpus carries a stale `plain_sibling`.** `usda-beef-pilot.mjs` passes the flag through from the shipped row, and the flag is corpus-relative: re-derived over the collapsed descriptions it is **193** against the **129** carried, disagreeing on 66 rows. A census reading the carried flag reports `plainSibling` falling from 134 to 129 when it is rising to 193 — the key's verdict inverted by a field nobody re-derived. The census re-derives it; the pilot does not need to, since nothing it measures reads the flag.

**`compareRelevance` cannot be ablated from outside.** It expresses the order once, which is right, and takes no argument that could drop a term. So the census restates the ten-term order and then **proves the restatement against the shipped comparator on every pair the sweep orders** — 3,857 queries' worth, not a sample. A key added to the ranking and not to the census fails the run instead of quietly measuring a nine-key ordering.

## 7. What this leaves

**Nothing to retire, so nothing is deleted.** The map's destination asks for the redundant surface to be "measured and retired"; it is measured, and it is not redundant. There is no counterfactual deletion to hand to the generator ticket either: no key is dead on the collapsed corpus, so none is dead on the shipped one.

**The code's own key tallies are no longer reproducible, and this census does not fix them.** `reference-food-ranking.ts` quotes three different sweep sizes — 3,376 for `accounted`, 3,976 for `wholeness`, 3,857 for `withoutStrayMentions` — and today's `sweepQueries` derives 3,857. `wholeness`'s comment says 16 leads where this census measures 9 on the same corpus. Those are dated findings against rulers that no longer exist, and rewriting them from a census run today would destroy the record rather than repair it. Whoever ships the collapse into the generator is the one who should make each comment cite a reproducible tally, because that is when the keys are next touched.

**`simplicity` deserves the attention `wholeness` has had.** It is the weakest key by sweep tally and the strongest by protected-set cost, and no record explains why — it arrived as "the name's raw simplicity, carried through" and has never been priced on its own. That is a ranking question rather than a membership one, and it belongs with [#412](https://github.com/palebluebytes/inventoria/issues/412)'s family rather than on this map.
