# Research: ADR-0103 piloted on `Beef` (#191)

**Grounds:** the committed `public/usda/search-index.json` (`schema_version` 8, 4,238 rows) and `public/usda/nutrient-store.json`, measured by `pnpm usda:beef-pilot`. C1 and C2 come from `pnpm usda:consolidation-bar` run over a collapsed corpus the pilot emits, so the ranking is the shipped one and not a second opinion about it.
**Siblings:** parent map [#186](https://github.com/palebluebytes/inventoria/issues/186). [ADR-0103](../adr/0103-what-was-done-to-a-food-is-not-another-food.md) is the rule under test, [#188](https://github.com/palebluebytes/inventoria/issues/188) the bar it is judged against, [#192](https://github.com/palebluebytes/inventoria/issues/192) the ranking surface it was meant to make redundant.
**Date:** 2026-09-12. **Status:** pilot result. No corpus, ranking or filter code changed; `scripts/usda-ranking-corpus.mjs` gained an index-path override so the bar can read a corpus that does not exist yet.

---

## 1. What was run

`Beef` is 950 of 4,238 rows and the head that produced the map. It was chosen as the **worst** head, not a representative one, so that a rule which fails fails visibly here rather than fifteen hand-offs later.

ADR-0103's roster was written out for all **202** distinct trailing segments `Beef` carries, four collapsing axes deep — preparation, separation, trim, grade — and then applied **corpus-wide**, as §6 requires of a collapse. Every one of the 202 classified without a case the as-bought line could not decide. That is the pilot's first result and the quietest: §2's line held.

## 2. The collapse, measured

|                                  | baseline |     after |
| -------------------------------- | -------: | --------: |
| corpus                           |    4,238 | **2,837** |
| groups merged corpus-wide        |        — |       493 |
| groups shipped whole (§5, below) |        — |        88 |
| `beef` answers with              |      954 |   **188** |
| `Beef,` rows → collapse groups   |      950 |       185 |

2,837 is 13 rows under #188's corrected sanity zone of 2,850–2,950, which is a sanity figure and carries no pass or fail. The zone was derived in #190 from a collapse of four crude classes; this roster is slightly wider, and a wider roster collapsing thirteen more rows is the rule working.

## 3. The bar: C1 does not move, and C2 moves by one query

| condition                             | baseline |     after |
| ------------------------------------- | -------: | --------: |
| **C1** gold row in the top 3 (gating) |    24/44 | **24/44** |
| **C2** at most 25 rows (gating)       |    27/44 | **28/44** |
| gold row past the 50-row page cap     |        3 |         2 |
| gold row not retrieved at all         |        1 |         1 |
| C1 multi-word (watched)               |    10/12 |     10/12 |
| C2 multi-word (watched)               |    10/12 |     11/12 |

`beef` fails both. It answers with **188 rows — 7.5× the cap** — and its gold row, 80/20 minced beef, is **still past the page cap**, which is the same harm #188 registered at baseline: unreachable by typing the word. The whole corpus-wide collapse buys **one** gating query (`mushroom`, 27 → 25) and **one** watched one (`chicken thigh`, 27 → 14), and rescues `lamb`'s gold row from past-the-cap to rank 20 — still not top 3.

This is worth stating plainly because ADR-0103 §11 half-anticipates it and files `beef` on the wrong side of its own table. §11 lists seven queries the collapse "does the work" on, `beef` 954 → 228 among them, against eight it says it cannot help. Of the **twenty-one** queries over the cap at baseline, **exactly one crosses it.** Falling from 954 to 188 is a large movement and not the work: the work was one row per ingredient reachable by typing the word, and `beef` is 188 butchery cuts.

## 4. What the rule got wrong

### 4.1 §5's eligibility test is undefined, and the definition decides whether `Beef` ships at all

> A row that positively states a non-preferred value on a collapsing axis is refused.

Nothing says which values are non-preferred. Four readings over `Beef`'s 185 groups:

| reading                           | coverage holes | rows stranded |
| --------------------------------- | -------------: | ------------: |
| every axis has a designated value |         **71** |           492 |
| preparation + separation refuse   |             34 |           151 |
| preparation alone refuses         |             26 |           106 |
| nothing refuses                   |              0 |             0 |

Under §5 as written a coverage hole **blocks its head from shipping** until ADR-0046 supplies a stand-in. So ADR-0103 says `Beef` needs somewhere between **0 and 71** curated stand-ins before it may ship, and does not say which. Twenty-four hand-offs against that text are twenty-four sessions each inventing their own eligibility test.

### 4.2 §5's one confirmed coverage hole does not exist

§5, the Consequences, `CONTEXT.md`'s **Coverage hole** entry and the map's _Not yet specified_ all carry the same instance: plain skinless chicken breast, where "all four USDA candidates are either cooked or brine-injected", so "USDA published no usable panel for the most-logged chicken cut there is."

USDA published one:

| fdcId      | description                                                              | kcal | nutrients |
| ---------- | ------------------------------------------------------------------------ | ---: | --------: |
| **171077** | `Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw` |  120 |       129 |
| 2646170    | `Chicken, breast, boneless, skinless, raw` (the gold row)                |  106 |        22 |
| 171509     | `Chicken, …, meat only, with added solution, raw`                        |  108 |       129 |

#189 read the group under `Chicken, **broilers** or fryers, breast, meat only` — plural, no `skinless, boneless` — which does hold only cooked rows. The plain raw row sits one segment and one letter away, under `broiler` singular. The two spellings are two residual descriptions and therefore two collapse groups, and nothing in §3 notices.

In the collapsed corpus 171077 ships as `Chicken, broiler or fryers, breast, skinless, boneless, meat only` at 120 kcal, the brine row keeps its own name and its own row, and `chicken breast` passes C1 at rank 1. **The rule's flagship failure case was a spelling artefact.**

### 4.3 A hole blocking a head contradicts §5's own group-of-one rule

§5 already settles the honest-name question for a group of one: `Quinoa, cooked` is the only quinoa USDA publishes, nothing is stripped, and it ships — a true name over a true panel. A group of **six** cooked-only rib eye rows, under the same paragraph, blocks 950 rows of beef.

The two situations are identical in every respect that matters. The 108 kcal of brine §5 fears is prevented by **not stripping the name**, which §5 already knows how to do; the block adds nothing to that and costs a head. So the pilot's amendment is the group-of-one treatment generalised, and the figures in §2 and §3 above are measured with it in force: 88 groups corpus-wide shipped their fullest-panel record under its whole, unstripped name rather than blocking.

### 4.4 A cut-depth lever does not work

The ticket's headline question, asked because the residue is butchery cuts spelled three and four levels deep — `Beef, round, bottom round, steak` and `…, roast` are the same meat in two shapes. Truncating the residual description:

| truncated to | `beef` rows |
| ------------ | ----------: |
| 2 segments   |      **73** |
| 3 segments   |         137 |
| 4 segments   |         183 |

73 is still 3× the cap, and the price is paid twice over. Depth-2 merges every ground-beef fat ratio into a single `Beef, ground` — **including the gold row's 80/20**, a distinguishing axis by §2 — and flattens `Beef, grass-fed` and `Beef, cured` to one row each, while still leaving `Beef, rib eye`, `Beef, rib eye steak` and `Beef, ribeye` as three separate rows.

Depth is not a coordinate. USDA's second segment is variously a primal (`round`, `chuck`, `loin`), a cut (`tenderloin`, `brisket`), a shape (`ground`), a husbandry claim (`Wagyu`, `grass-fed`), a preservation (`cured`) and an organ (`liver`). A rule counting commas is reading a hierarchy that is not there.

### 4.5 The residual defect is spelling, not depth

§3's residual description is a string and USDA's spelling of one cut is not stable:

|                                                         |            |
| ------------------------------------------------------- | ---------: |
| `Beef` residual as a raw string                         | 193 groups |
| + punctuation and whitespace normalised                 |    **185** |
| + `boneless` / `bone-in` / `lip-on` / `lip off` ignored |        171 |

`Beef, round, top round, steak`, `Beef, round, top round steak` and `Beef, round, top round steak, boneless` are three groups for one food. `97% lean meat / 3% fat` and `97% lean meat /3% fat` are two. Eight merges from punctuation alone, fourteen more from the bone and lip words.

Twenty-two groups out of 193 is nothing against a cap of 25 — **spelling is a correctness lever, not a size one.** It earns a clause because it is what manufactured §4.2: a one-letter difference between `broiler` and `broilers` produced a coverage hole that a whole paragraph of ADR-0103, a `CONTEXT.md` entry and a line of the map were built on.

The punctuation half is safe: it merges only strings already identical modulo a comma, a hyphen, a slash or a double space, and costs no judgement. The bone and lip half is not — `bone-in` is a real distinction on rib eye and t-bone, where USDA publishes both — and belongs to an adjudicated head rather than to §3's mechanical grouping.

## 5. §7's reopening condition: no row in `Beef` must go with no survivor

ADR-0103 §7 takes no general drop power and says a pilot finding a row that must go with no survivor brings that row back as the argument. `Beef` was read for one. The candidates:

|                                          | groups | rows |
| ---------------------------------------- | -----: | ---: |
| dissected fractions and non-retail units |     11 |   39 |
| organ meats                              |     13 |   26 |

The first is `separable fat`, `external fat`, `seam fat`, `intermuscular fat`, `subcutaneous fat`, `suet`, `carcass`, `retail cuts`, `composite of trimmed retail cuts` and `mechanically separated beef` — laboratory fractions and trade units, not things anybody buys and writes one word for. The tempting case, and declined: removing all 24 groups takes `beef` from 188 to about 164, which is no nearer 25 than 188 is; the `designated` ranking key already sinks them so they cost a reader nothing; and the map ruled the "nobody logs this" residue out of scope at charting on ADR-0055 §1's grounds, which still stand.

**§7 is ratified unamended, with a negative result recorded against it.** A drop is argued against a case, and the pilot did not find one.

## 6. Verdict

Ratified unchanged: **§1, §2, §3's grouping, §4, §6, §7, §8, §10.** The as-bought line classified 202 segments without an undecidable case, the collapse never deleted a food, and the survivor assertion held.

Amended: **§5**, in the two ways §4.1 and §4.3 set out, plus §3's normalisation clause from §4.5 and the corrections to §4.2 and §3 above. Recorded and refused: the cut-depth lever.

**The map's destination is reached and the bar is not met, and those are both true.** `beef` answering with 188 butchery cuts _is_ one row per ingredient — a bottom round steak and a bottom round roast are two foods, and the corpus says so. What 188 shows is that the remaining distance to C2 is a **retrieval and paging** distance, which ADR-0103 §11 already assigns to [#411](https://github.com/palebluebytes/inventoria/issues/411) and [#412](https://github.com/palebluebytes/inventoria/issues/412), and `beef` belongs on that list beside `cheese`.
