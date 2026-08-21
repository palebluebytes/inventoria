# Research: what makes a USDA record the canonical one, and can a name rule find it? (#143)

**Grounds:** `compileReferenceFoodQuery` / `compareRelevance` / `readReferenceFoodName` in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` via `pnpm usda:ranking-audit`. [ADR-0042](../adr/0042-usda-search-reference-foods.md) §1 and its #124 Amendment govern the ranking; that Amendment reserves the key slot this note is measuring for.
**Siblings:** [#130](https://github.com/palebluebytes/inventoria/issues/130) measured the class and named the wrong remedy for it; its correction block says so. [#144](https://github.com/palebluebytes/inventoria/issues/144) owns the filter escapes this note excludes. [#134](https://github.com/palebluebytes/inventoria/issues/134) and [#137](https://github.com/palebluebytes/inventoria/issues/137) both change the row set, so this measurement re-runs after either.
**Date:** 2026-08-21. **Status:** pre-registration. §§1–4 are measured and dated; §§5–9 are written **before the sweep runs and before a single case is adjudicated**, and no ranking code has changed.

---

## 1. Why this note exists before the key does

ADR-0042 §1 orders a food search on five keys, and the #124 Amendment reserves a sixth slot for "a least-qualified key, which will absorb `simplicity`". The idea behind that slot has been cited three times and measured once — and when it was measured, it was wrong. A fewest-qualifiers key, counted by qualifier words or by commas alike, picks `Milk, imitation, non-soy` over `Milk, whole, 3.25% milkfat, with added vitamin D`, because USDA writes the canonical milk with **more** qualifiers than the imitation one.

So the first deliverable is a **measure with a number attached**, not a key. This note is the pre-registration for that measurement, written first for the reason #130 §3 gives: a measurement whose categories and thresholds are chosen after the numbers arrive is a rationalisation.

## 2. The class, measured

Over the shipped 4,429-row index:

- 528 distinct head phrases; **271 have more than one row**.
- **163 of those 271 end in a ≥2-way tie at the very top**, across **2,033 rows**. Every candidate matches at word index 0, so `tier`, `raw`, `head`, `position` and `simplicity` all tie by construction.
- **All 163 leads are decided by corpus order alone.** In every one, the leading row is the earliest tied row in `search-index.json` — in practice, the lowest `fdcId`.

The harm is deeper than "an arbitrary qualifier wins":

| query    | where the plausible answer actually lands                              |
| -------- | ---------------------------------------------------------------------- |
| `milk`   | `Milk, whole, 3.25% milkfat…` at **rank 31 of 88**                     |
| `cheese` | the first cheddar at **rank 29 of 106**                                |
| `egg`    | the first chicken egg at rank 4 of 51, and it is the frozen salted one |
| `tomato` | `Tomatoes, red, ripe, raw, year round average` at rank 4 of 13         |

## 3. Two candidate signals that are already dead

#143's ticket text lists four candidate signals. Two are refuted here rather than carried into the sweep.

**Data-type provenance (Foundation over SR Legacy).** Only **273 of 4,429 rows are Foundation** (6.2%), and every top-4 row across the ticket's thirteen named cases is SR Legacy — the signal is silent exactly where the defect lives. Where it does fire it fires wrong: the Foundation row for `tomato` is `Tomatoes, grape, raw`.

**Nutrient-panel completeness.** The theory is that USDA analyses the canonical form most thoroughly. It does not hold: `Bread, salvadoran sweet cheese (quesadilla salvadorena)` carries **131** nutrients against `Bread, white wheat`'s 107, and `Butter, whipped, with salt` carries 131. Ranking on completeness would **keep the wrong rows first**. It would also cost an index-schema change, since `nutrient-store.json` is not loaded by search.

Neither is pursued. The measurement is therefore constrained to signals derivable from the description alone (§5).

## 4. The class is not one defect, and most of it is not rankable

Sorting the 163 leaders by _why_ they are wrong gives four shapes. Only the first two, plus one preparation case, have a name-structural tell:

- **(a) a modified or substitute form leads** — imitation, reduced-fat, nonfat, lactose-reduced, gluten-free, made-with-tofu.
- **(b) a part or fraction leads** — `Beef, retail cuts, separable fat, raw`, rendered fat, liver, `Onions, young green, tops only`.
- **(c) a prepared row beats a plain sibling** — `Spinach, cooked, boiled, drained` over `Spinach, baby`; `Millet, cooked` over `Millet, whole grain`; `Teff, cooked` over `Teff, uncooked`.
- **(d) a varietal or a regional dish leads a generic head** — `Peppers, jalapeno` over sweet peppers; `Bread, salvadoran sweet cheese`; `Cornmeal, blue (Navajo)`; `Oil, bearded seal (Oogruk)`.

**Shape (d) is out of scope and stays out.** `Peppers, jalapeno, raw` and `Peppers, sweet, green, raw` are equally well-formed names; only knowing that more people search bell peppers decides it. That is prototypicality — frequency or culture, not name shape — and supplying it would need a popularity source and its own ADR.

### How much (a) + (b) + (c) can possibly reach

**28 of the 163: part 9, modifier 12, prepared 7, no overlap.**

A shape counts only when a **tied sibling lacks the marker**. If every tied row carries it, the demotion applies uniformly, the key ties, and nothing moves. An earlier count of 44 tested only whether the _leader_ was marked and is an upper bound, not a reachable set; it is superseded by the 28 here.

This is the honest ceiling and it is stated up front: **the key under measurement can move at most 28 of a 163-query class**, and 135 leads are decided by something no name rule sees. §9 routes those rather than leaving them as a silent remainder.

## 5. What the measure may read

**The description, and nothing else.** Every key in `RelevanceKey` today is derived in `readReferenceFoodName` from the description; §3 refuted both signals that would have needed more. This keeps the change inside `reference-food-ranking.ts` beside `stemOf`, `wordsOf` and `simplicity`, and costs no index-schema bump.

**No query-aware branch.** Retrieval admits a row only when _every_ typed token matches it, so a typed marker word is present in every retrieved row, the demotion applies uniformly, and the key ties. Verified on 15 marker-naming queries — `liver` (33 hits), `beef fat` (864), `boiled egg`, `cooked rice`, `low fat milk`, `nonfat yogurt`, `imitation cheese`, `skim milk`, `roasted chicken` and six more: **15 of 15 retrieve only rows carrying the marker, no exceptions.** The guard is already there, one layer down — the same shape as the #124 Amendment's "summing settles, for free and with no exclusion rule, whether a head match should count".

## 6. The measure under test

Two keys, both pure functions of the description, both **boolean**:

> **`whole`** — 0 if the name carries a part-or-fraction marker, 1 otherwise.
> **`plain`** — 0 if the name carries a modifier marker or a preparation marker, 1 otherwise.

**Boolean, not a count.** A count of markers is "fewest qualifiers" wearing a new coat, and that is the measure this ticket exists to reject.

**Two keys, not one, and `whole` first**, because #130 §3.1 states whole-over-part as its sharpest wrongness, above generic-over-qualified. Collapsing them hides that precedence.

**Marker sets are closed lists of multi-word phrases, not bare words.** `low` alone matches `Seal, bearded (Oogruk), meat, low quadrant`; `cooked` alone touches 1,601 rows. Candidate lists, none endorsed until §7's precision pass runs:

- _part_ — `separable fat`, `rendered fat`, `separable lean`, `tops only`, `meat only`, `meat and skin`, `skin only`, `liver`, `kidney`, `heart`, `brain`, `gizzard`, `tripe`, `tongue`, `leaves`, `seeds`, `peel`, `rind`, `hulls`, `bran`, `germ`
- _modifier_ — `imitation`, `substitute`, `low sodium`, `low fat`, `lowfat`, `reduced fat`, `reduced sodium`, `fat free`, `nonfat`, `gluten-free`, `made with`, `filled`, `non-soy`
- _preparation_ — `cooked`, `boiled`, `roasted`, `baked`, `fried`, `broiled`, `grilled`, `braised`, `steamed`, `stewed`, `simmered`, `poached`, `microwaved`, `toasted`, `blanched`, `sauteed`

### What this measure deliberately does not do

It does not drop prepared rows from the corpus. A preparation word touches **1,784 of 4,429 rows (40.3%)**; `beef` would fall 959 → 415, `rice` 27 → 13, `pasta` 21 → 8. Dry rice is ~360 kcal/100 g against cooked ~130, so a corpus without prepared rows makes a logged bowl of rice a silent 3× overestimate — [#126](https://github.com/palebluebytes/inventoria/issues/126)'s harm wearing a plausible number. ADR-0042 §5 has also already ruled that "a plain fried egg is a reference food like a scrambled one". The preference belongs in ranking, where §1's `raw` key already states it; what was missing is that **1,204 rows are neither raw nor prepared**, so a prepared row and a plain one tie today with nothing between them. That is the gap `plain` closes, and it is the whole of it.

## 7. Precision protocol for the marker lists

Per [#131](https://github.com/palebluebytes/inventoria/issues/131)'s grilling: an unmeasured precision guard is a hole, and a guard must ask the predicate rather than restate it. So, before any phrase enters a shipped list:

1. Its **corpus reach** is printed — how many of the 4,429 rows it touches.
2. A **hand-checked sample** of what it touches is read.
3. Anything not inspected does not go in.

## 8. Pre-registration

### 8.1 The gold set

Drawn from the 271 multi-row head phrases by a rule fixed here, before any answer is looked at:

> Admit a head phrase iff it names **a food or ingredient a person would type into a food log**. Exclude head phrases that name a **category** of foods — `fish` (82 tied rows), `oil` (72), `bread` (76), `alcoholic beverage` (58), `mollusks`, `sweeteners`, `syrups`, `spices` — because a category has no canonical member.

Animal names stay in: `beef`, `egg`, `duck` are typed, and shape (b) applies to them. Expected size ~50. The resulting list is committed before adjudication begins.

> **Amendment (2026-08-21), written before adjudication began.** The rule, applied by hand to all 271 multi-row heads, **admits 150**, not ~50 — 92 of them in the 163 tie set and 58 already untied. 150 is past what §8.3's ratification can afford in a sitting, so the gold set is a **stated stratified cut** of the admitted set rather than the whole of it:
>
> 1. **every admitted head a candidate shape can reach** — 22;
> 2. plus **#143's own named cases not already caught** — 4 (`peppers`, `egg`, `tomatoes`, `butter`; `oil` and `bread` are excluded by the rule above as category heads);
> 3. plus a **seeded fill** from the remaining admitted heads to reach 50 — 24, drawn with the repo's `seededPick` convention at seed 143.
>
> The set is therefore **deliberately over-sampled on the cases the key can move**, which is what §8.5's shape-case threshold measures, and the 24 controls are drawn blind to catch regressions. 36 of the 50 are tied at the top today. Committed as `143-gold-set.json` with every `verdict` and `should_lead` still `null`, so the commit history shows the list was fixed before a case was read.

### 8.2 Verdicts

#130 §3.2's vocabulary, unchanged, so the two notes stay comparable: `miss` · `peers` · `correct` · `implausible-query`. Each gold-set case additionally records **which row should lead** — a designated row, not just a verdict — plus a shape tag (a / b / c / d) and a free-text note.

### 8.3 Who adjudicates

An LLM adjudicates one case at a time against §8.2 and #130 §3.1's precedence. **Every judgement is then ratified by the maintainer before a line of the key is written**, via the review tool in §10. #130's correction block is the reason: its 914 adjudications stand, but its two most load-bearing verdict classes were never independently read, and the sizing derived from them had to be overturned. At ~50 cases, reading the whole set is a sitting.

### 8.4 Exclusions

Rows adjudicated as [#144](https://github.com/palebluebytes/inventoria/issues/144) filter escapes are excluded from the denominator, with the exclusion list committed alongside the gold set. Otherwise the key takes credit for demoting rows that were never reference foods — the mistake #130's correction block catalogues twice.

### 8.5 Thresholds

| outcome               | condition                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ship the key**      | ≥ **2/3** of gold-set shape-(a)/(b)/(c) cases lead with the designated row, **and** §8.6's guards are unmoved, **and** across all 163 queries falls ≤ **¼** of rises |
| **Retire the signal** | < **1/3**. Write the finding, ship nothing.                                                                                                                          |
| **Report and return** | between the bands — the decision goes back to the maintainer rather than being resolved by whoever is holding the sweep                                              |

### 8.6 Must not regress

ADR-0042 §1's nine, unchanged: `pot` / `pota` / `potato` / `potatoes` / `tomato` lead with the vegetable; `grape` gives Grapes, then `Grape leaves`, then `Grapefruit`; `gra` reaches Grapes; `balsamic` reaches `Vinegar, balsamic`; `soy milk` leads with `Soy milk, …`. Plus [ADR-0046](../adr/0046-curated-stand-ins-for-base-foods-usda-lacks.md) §1's exact/partial order for curated stand-ins.

### 8.7 Placement, and the two inheritance tests

- **Placement.** All three positions are tried — above `raw`, between `head` and `position`, and in the #124 reserved slot after `position`. Default to the reserved slot unless the measurement moves leads. ADR-0042 §1 and #130 §3.1 **disagree** about whether whole-over-part outranks raw-over-cooked; the amendment states which governs ranking rather than leaving it implied.
- **`simplicity`.** Delete it, re-run. If no lead moves on the gold set or §8.6, it goes and #124's absorption clause is confirmed. If a lead moves, it stays and that clause is **corrected in the new amendment rather than edited in place**.
- **`raw`.** Same test, opposite default. A null result is a **finding, never a deletion** — `raw` is the stated principle ADR-0042 is named for, and removing it needs its own decision.

### 8.8 What gets pinned as a corpus test

§8.6's guards; the gold-set cases the key actually fixes, named individually; and a re-measured "184 rows gained the lead and none lost it". **Not** the 163-query count and **not** the audit JSON — those are dated findings, and pinning them turns the next legitimate improvement into a test failure, which `usda-ranking-audit.mjs`'s own header warns against.

## 9. Where the 135 unreached cases go

Routed, not fixed, and enumerated in the results section when the sweep runs:

- **Filter escapes** → [#144](https://github.com/palebluebytes/inventoria/issues/144).
- **Category heads and ethnic-designated rows** → [#134](https://github.com/palebluebytes/inventoria/issues/134). Alaska Native / Navajo / Hopi / Shoshone Bannock records are 136 of 4,429 rows (3.1%) but take 16 of the 163 tie-leads (9.8%), a 3.2× over-representation caused entirely by low `fdcId` clustering.
- **Genuine varietal peers** → a written `peers` verdict with no remedy. `Corn, sweet, white` against yellow, `Squash, summer` against winter, `Dates, medjool` — these are #130 §3.2's `peers`, and the honest answer is that the search is not wrong.

The last-resort tie-break is deliberately **left as corpus order**. Every available proxy — shortest name, `fdcId`, dataType — is either the disproven fewest-qualifiers measure or the dead provenance signal of §3, and replacing an arbitrary order with a differently-arbitrary one buys nothing while looking like a decision.

## 10. Ratification, and its waiver

§8.3 requires a human to read all 50 judgements before a key is written. A review
tool was built for it — `scripts/usda-adjudication-review.mjs`, serving the cases
on its own port and writing verdicts back into the JSON in place — and was then
**removed at the maintainer's direction**, along with the ratification step.

**The 50 adjudications in `143-gold-set.json` therefore stand unratified**, and
every case carries `ratified: false`. This is recorded rather than quietly
dropped, because it is exactly the exposure #130's correction block describes: an
adjudication nobody independently read is a judgement taken on trust, and #130's
sizing had to be overturned for that reason.

What the waiver does **not** touch is the mechanical half of this measurement,
which contains no adjudicator at all: the 163-query class and its corpus-order
finding (§2), the two dead signals (§3), the 28-case ceiling (§4), the four
correct leads the part key breaks (§12), the 18 moved leads (§13), the corpus
re-measure from 184 to 192 rows leading by their own name, and the query
uniformity result (§5). Those are counts. The 43% in §14 is the number that rests
on the unratified judgements, and it is the number the decision went against
anyway.

---

# Results (2026-08-21)

Everything above this line was committed before the sweep ran. Nothing above it has been edited since; what follows either confirms it or corrects it by name.

## 11. The gold set, adjudicated

50 cases, adjudicated one at a time against §8.2 and #130 §3.1, recorded in `143-gold-set.json`: **29 `miss`, 18 `correct`, 3 `peers`.** Of the 22 cases a candidate shape reaches, 17 are misses, 4 are `correct` and 1 is `peers`.

The four `correct` cases a shape reaches matter more than their number suggests, and §12 turns on them.

## 12. The part key is refuted

`whole` — demote a name carrying a part-or-fraction marker — **fixes nothing and breaks four of the eighteen `correct` cases**:

| query     | leads today, adjudicated correct                                                                      | the part key promotes                                              |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `chicken` | `Chicken, broilers or fryers, meat and skin and giblets and neck, raw`                                | `Chicken, … giblets, raw`                                          |
| `turkey`  | `Turkey, whole, meat and skin, raw`                                                                   | `Turkey, whole, giblets, raw`                                      |
| `pork`    | `Pork, fresh, composite of trimmed leg, loin, shoulder, and spareribs, … separable lean and fat, raw` | `Pork, fresh, backfat, raw`                                        |
| `lamb`    | `Lamb, composite of trimmed retail cuts, separable lean and fat, … raw`                               | `Lamb, variety meats and by-products, mechanically separated, raw` |

The mechanism is exact and it inverts the premise. **USDA names its most generic animal rows with part vocabulary**, because a whole chicken _is_ meat and skin and giblets and neck, and the generic pork row _is_ a composite of separable lean and fat. The markers therefore select **for** the canonical row, not against it. Adding it to the two-key design costs three net correct leads (21 against 24 without it).

It also fails where it does fire: `cowpeas` moves from `young pods with seeds` to `leafy tips` — one part replaced by another — and `veal` from an Australian rib roast to `variety meats and by-products, spleen`.

**#130 §3.1's "whole over part" precedence is not wrong; it is unreadable from a USDA description.** The words that name a part and the words that name the whole animal are the same words. This is the same class of failure as §3's two dead signals, found one layer later.

## 13. What the surviving key does

`plain` alone — demote a name carrying a modifier or preparation marker — in #124's reserved slot:

- **6 of 14 modifier/prepared misses now lead with the designated row (43%)**: `millet`, `rice noodles`, `spinach`, `teff`, `tempeh`, `vanilla extract`.
- **0 of the 18 `correct` cases break.**
- **All nine §8.6 guards hold**, and ADR-0046's curated stand-in order is untouched.
- **18 leads move across the 163 tie queries.** Read one at a time: **11 better, 1 worse, 4 sideways, 2 noise.** Better includes `Yogurt, fruit variety, nonfat` → `Yogurt, plain, skim milk`, `Sour cream, imitation, cultured` → `Sour cream, light`, and the low-sodium soy sauce yielding to the plain one. The one worse is `cheese`, which moves from a lactose-reduced cottage cheese to `Cheese, cottage, with vegetables`. The two noise cases are `stew` and `wocas`, both already routed to #144 and #134.

The eight modifier misses it does **not** fix — `bacon`, `cheese`, `milk`, `pasta`, `peanut butter`, `pickles`, `sour cream`, `yogurt` — all move, and all move to a different wrong row. In a tie of 41 milks or 87 cheeses, demoting the marked ones still leaves dozens of unmarked ones tied, and corpus order picks again among the survivors.

## 14. Against §8.5's bands

**43% is between 1/3 and 2/3, so this is a `report and return` result.** The decision goes back to the maintainer; this note does not resolve it.

**One of §8.5's three conditions was written ambiguously and is not used.** "Falls ≤ ¼ of rises" does not say what is counted. #124's precedent counts _answers_ — rows that legitimately serve the query — and a head-phrase query has no equivalent answer set, so the only thing I could count was every row in every result list, which gives 627 rises against 1,135 falls (1.81) for a key that demotes 40% of the corpus by construction. That ratio is an artefact of the measure, not a finding, and leaning on it either way would be dishonest. **The 18 leads in §13, read individually, are the honest version of the same question**, and they say 11:1.

## 15. §8.7's three tests

- **Placement is unfalsified.** Above `raw`, between `head` and `position`, and in the reserved slot all give identical results — 6 fixed, 0 broken, guards held. Default to the reserved slot, as #124 did on the same finding. The §3.1-versus-§1 tension over whether whole-over-part outranks raw is now **moot**, since there is no part key to place.
- **#124's `simplicity` absorption clause is DISPROVEN.** Deleting `simplicity` breaks **five** of the eighteen `correct` cases. The clause — "today's 3/2/1/0 `simplicity` is only 'fewest qualifiers, among raw foods'; a general form subsumes it without loss" — is false, and `simplicity` stays. Per §8.7 this is corrected in the amendment rather than edited into #124's text.
- **`raw` stays, and now on evidence rather than only principle.** Deleting it moves one of the nine guards.

## 16. §7's protocol caught a hole in this note's own candidate list

`made with`, proposed in §6, touches 20 rows and is **wrong on most of them**: `Frybread, made with lard (Navajo)`, `Pasta, homemade, made with egg, cooked`, `Rolls, gluten-free, white, made with brown rice flour…`. Those are recipes, not substitutes. It was removed before the numbers above were taken. `meatless` was added in its place — 8 rows, all of them meat substitutes — after which `bacon` stops moving to `Bacon, meatless` and stops moving at all, its tie being uniformly marked.

Priced and kept: `imitation` (9 rows, all imitations), `substitute` (14, all substitutes), `filled` (3, all filled dairy), `meatless` (8). This is #131's rule doing its job on the very list that cited it.

## 17. Recommendation

**Report and return, with a recommendation to ship the narrow key.** The bar it misses is one this note set for a two-key design that no longer exists; what survives is smaller, cleaner and net-positive on every unambiguous measure: 6 designated rows reached, 0 correct cases broken, 9 of 9 guards held, and 11 better leads against 1 worse. The maintainer's call is whether 18 moved leads out of a 163-query class is worth an ADR-0042 amendment and a sixth key.

If it ships, the amendment must carry three things beyond the key: the part-key refutation in §12, the `simplicity` correction in §15, and the honest ceiling — **this key reaches 18 of 163, and 135 leads are still decided by `fdcId` order.**
