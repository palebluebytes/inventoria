# Research: the cooked records USDA published but the corpus drops (#497)

**Grounds:** both corpora rebuilt from the committed archives by `pnpm targets:census` (`scripts/pairing-target-census.mjs`), running `usda-bundle.mjs`'s own passes twice over the same input with `isCookedForm` stubbed to `false` in the lifted arm and nothing else changed. Coverage is measured over the 35 `gtin:` twins in [#241](https://github.com/palebluebytes/inventoria/issues/241)'s ledger export against [#243](https://github.com/palebluebytes/inventoria/issues/243)'s hand adjudication. No artifact was regenerated; `public/usda/` is untouched.
**Siblings:** parent map [#240](https://github.com/palebluebytes/inventoria/issues/240). [#489](https://github.com/palebluebytes/inventoria/issues/489) refused the _conversion_ and surfaced this; [#496](https://github.com/palebluebytes/inventoria/issues/496) asks whether the energy veto may be overruled; [#503](https://github.com/palebluebytes/inventoria/issues/503) is blocked on the corpus's shape.
**Date:** 2026-09-17. **Status:** measured. The export is personal data, lives outside every working tree and is not committed (ADR-0064); what is committed is the adjudication, in `scripts/pairing-target-census.mjs`.

---

## 0. The instrument is calibrated

The baseline arm reproduces the committed `public/usda/nutrient-store.json` at **1,737,610 bytes**, the same figure the file on disk carries, and its corpus at **2,023 rows**. So the lifted arm's bytes are the same instrument reading a different corpus, not a projection. This is what #497 asked for in place of the ~6.9 MB row-count extrapolation it was filed with — and that extrapolation was answering a different question anyway, since it priced all 7,974 identities rather than one lifted rule.

## 1. One rule lifts, and 1,182 rows arrive — not 1,744

`cooked_form` is the only rule touched. What it drops does not simply reappear, because it drops _first_ and four later stages have never seen these rows:

| stage                             |      rows |
| --------------------------------- | --------: |
| fire `cooked_form`                |     1,744 |
| past the other food-kind rules    |     1,742 |
| past ADR-0061's variant drops     |     1,742 |
| past the ADR-0056/0062 name rules |     1,725 |
| **past ADR-0103's collapse**      | **1,182** |

Two are caught by `manufacturing_input` and the superseded list, seventeen by the name rules, and **543 by the collapse** — 31% of what survives to it. Whether a pairing-target set should be collapsed at all is a design question this measurement hands over rather than settles: ADR-0103's collapse exists to stop a shopper's search returning eight near-identical beef rows, and a set reached only after a person has chosen to pair is not being shopped. Both figures are priced in §2.

**The lift disturbs nothing that ships.** Of the 2,023 rows in the corpus today, **0 are removed and 0 are renamed** by the lifted arm. This is the result I most expected to go the other way: ADR-0103's collapse groups by head phrase across the whole corpus, so 545 cooked beef rows arriving could plausibly have re-cut every beef group. They do not — the cooked rows collapse among themselves. The comment on #497 warned that one corpus plus a runtime predicate is "held apart by a predicate, which is weaker than held apart by an artifact". That warning stands for the _search_, but it does not extend to generation: the two sets do not interfere at build time.

## 2. Bytes

|                                      |       raw |    gzip |  brotli |
| ------------------------------------ | --------: | ------: | ------: |
| nutrient store, shipped corpus       | 1,737,610 | 351,983 | 214,605 |
| nutrient store, one bundled corpus   | 2,909,757 | 572,337 | 334,759 |
| — the cooked rows alone, collapsed   | 1,180,449 | 226,648 | 127,575 |
| — the cooked rows alone, uncollapsed | 1,771,297 | 328,340 | 181,804 |
| search index, shipped corpus         |   794,587 |  90,746 |  62,509 |
| search index, one bundled corpus     | 1,273,826 | 129,856 |  86,755 |
| — the cooked rows alone, collapsed   |   460,552 |  42,932 |  28,853 |

The vocabulary sections are stubbed out in both arms so the deltas are comparable; that is why the index's baseline sits below the committed 812,093 B. The store carries no vocabulary, so its baseline _is_ the committed file.

**The whole cost is +1,172,147 B of store and +479,239 B of index** — about 1.6 MB raw, 269 KB brotli. Not the 6.9 MB the extrapolation feared.

### It breaks both precache bands

`precacheBytes` is a hand-declared band of ±5% with a **floor as well as a ceiling** (ADR-0083 §3), so this is a number a human must re-measure and re-declare, not a budget to spend:

| Facet   |  declared |   ceiling | would land |                   |
| ------- | --------: | --------: | ---------: | ----------------- |
| root    | 8,618,886 | 9,049,830 |  9,098,125 | over by 48,295    |
| Rations | 7,124,621 | 7,480,852 |  8,776,007 | over by 1,295,155 |

The root precaches the search index alone (ADR-0077 §5); Rations owes both artifacts whole. The root's breach is narrow enough to be an accident of where the declaration currently sits; Rations' is structural.

**Which makes #497's question 3 answer itself, in the opposite direction from the ticket's guess.** The ticket supposed a pairing set need not work offline, and that loading it on demand would make the cost question go away. It does — but only for a _separate_ artifact. Under one bundled corpus the cooked rows land inside the precache, so the offline budget is exactly what moves. The two routes are not variations on a theme:

- **A second artifact, fetched on demand.** Neither band moves. Nothing new is disclosed to an operator, because it is one file for every food (the property #246's comment identified as worth preserving). The set is unreachable with the network off — acceptable, since a person pairs rarely and once per product.
- **One bundled corpus, search-time predicates.** Every `fdcId` resolves offline forever, and both declarations must be re-measured in the commit that lands it.

## 3. Coverage: three twins, not thirteen

Of the 13 twins #243 could not pair, **3 gain a target a person accepts**:

| pack                 | verdict today | row that arrives                                         | energy |              |
| -------------------- | ------------- | -------------------------------------------------------- | -----: | ------------ |
| `Alubia roja cocida` | state-gap     | `173740` Beans, kidney, all types, dried, cooked, boiled |  ×1.22 | 98 nutrients |
| `Frijoles negros`    | state-gap     | `173735` Beans, black, dried, cooked, boiled             |  ×1.55 | 90 nutrients |
| `Haricots chinois`   | **none**      | `174282` Yardlong beans, dried, cooked, boiled           |  ×0.97 | 62 nutrients |

The population goes **22 → 25 of 35**. The two state gaps close, which was the floor #497 predicted, and one `none` closes, which was not.

**`Haricots chinois` is the finding, and it corrects the record.** #243 read this row as the macro veto doing its job — "the only candidate disagrees with the printed panel by 2.6× on energy, which is the macro-overlap check refusing a pairing the name would have waved through", and #489 and #496 both inherited it as the veto's one measured case of catching a _wrong food_ as against a wrong state. It was neither. The candidate #243 could see was `Yardlong bean` raw, the green pod; the pack is the dried mature seed, boiled, which USDA measured at 118 kcal against the label's 122. The name was right all along and the corpus did not hold the food. **The veto has no measured case of catching a wrong food left** — every error it has been shown to catch is a state gap, which is the thing this ticket removes.

## 4. What it puts beside the rows that already pair

Coverage is not the only thing that moves. Under the same head phrase as a row that already pairs, the cooked set adds **26 rows that are more than 1.5× off the label**, against **1** materially closer row (`Espinaca picada`: ×1.38 → ×1.15, frozen chopped spinach finding boiled spinach instead of mature raw).

| pack                    | pairs to today                        | worst thing now sitting beside it |
| ----------------------- | ------------------------------------- | --------------------------------- |
| `Tagliata al huevo`     | Noodles, egg, dry (×1.10)             | Noodles, egg, cooked (×0.39)      |
| `Shanxi sliced noodles` | Noodles, japanese, somen, dry (×1.00) | Noodles, egg, cooked (×0.39)      |
| `Tofu Blando`           | Tofu, soft (×1.03)                    | Tofu, fried (×4.58)               |
| `Liguine-Tallarines`    | Pasta, dry (×1.05)                    | 11 of 11 cooked pasta rows        |

So the set is not free even where it changes no verdict: a dry-pasta pack that pairs correctly today acquires eleven cooked neighbours, every one of them wrong, in whatever picker #243's user-driven food search becomes. `Tofu, fried` at ×4.58 is the only one the veto would refuse.

## 5. The reverse error, and nothing catches it

#497's question 5, and it is the sharpest cost. With cooked records available, a person holding a **dried** pack can land on a **cooked** row — the same error running backwards, on the side #489 measured as carrying no signal at all.

|                                                  |         |
| ------------------------------------------------ | ------: |
| shipped rows gaining a same-substance cooked row |     181 |
| (shipped, cooked) confusions available           |     301 |
| land below 0.7 — the blind side                  | **101** |
| land above 2.5 — the veto refuses                |       4 |
| in between                                       |     196 |

`Radishes, oriental, dried` → the boiled row is ×0.06. `Winged beans, dried` → ×0.09. `Oat bran` → `Oat bran, cooked` ×0.16. **Nothing catches any of it**, and the honest answer to "say what catches it, or say that nothing does and why that is acceptable" is the first half. Whether it is acceptable is not this ticket's to rule, but two things bound the argument:

1. It is **not hypothetical** — §3 caught two live instances on a population of 35. The energy veto admits five of the 13 unreached twins; a person accepts three. `Galette de riz` (rice paper, a dried sheet at 341 kcal) lands on `Rice, white, cooked` at ×0.38, and `Glasnudeln` lands on cooked egg noodles at ×0.42. Both are waved through in silence.
2. The error is **worse than the one #489 refused**, not merely symmetrical. A cooked pack paired to a dried row over-states every nutrient by roughly threefold and the veto refuses it. A dried pack paired to a cooked row _under_-states by the same factor, reaches the meters as measured (#244), and "USDA fills silence only" then pours a wet assay into every field the label left empty. The refusal that exists guards the direction that was already guarded.

## 6. `with salt` / `without salt`

The cooked set carries **145 with/without-salt pairs**, an axis the shipped corpus has never met because cooked rows never reached ADR-0061's variant rules. They are not duplicates — 102 of the 145 differ on more than sodium, because USDA assayed them separately. But on the twelve micronutrients a pairing actually spends, **130 of the 145 agree within 10%**, and #495 forbids a pairing supplying sodium at all. So on everything a pairing may use, these are two names for one answer, and the surface would show both. Whatever `CONTEXT.md` ends up calling this set, the salted half of 145 pairs is a candidate for the same treatment ADR-0061 gives a variant.

## 7. What this does not settle

- **Whether the set ships.** Three twins against 101 uncatchable reverse confusions and a re-declared precache band is a trade, not a verdict, and it is [#496](https://github.com/palebluebytes/inventoria/issues/496)'s and the ADR's to make.
- **The glossary term.** #497 asks for it as part of the work, and it is deliberately not coined here: naming a set the map has not decided to ship would put a term in `CONTEXT.md` ahead of the thing it names, which is the failure [#245](https://github.com/palebluebytes/inventoria/issues/245) recorded about the registry. What is established is that it cannot be **Reference food** — the entry is explicit that a record USDA cooked before it measured it is not one.
- **#496's population.** It does not empty. Of the two twins #496 is argued over, both now pair — but §5 replaces them with 101 confusions of the opposite sign that the veto cannot see, so the override question survives with its sign flipped. #496 should be re-read against §3 and §5 rather than answered on its filed numbers.
- **ADR-0048 §3 and ADR-0108 §10 are both silent here**, and the ADR should say so in a line rather than leave a reader to wonder. §3 forbids a _computed_ figure; a published USDA assay of a cooked food is a measurement. §10 forbids a composition value **crossing into the OFF product's panel**; the annotation still sits beside the panel and never in it. Neither needs amending either way.
