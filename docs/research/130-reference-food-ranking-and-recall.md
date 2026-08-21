# Research: does food search reach the best record, and does it lead with it? (#130)

**Grounds:** `compileReferenceFoodQuery` / `compareRelevance` in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` via `pnpm usda:ranking-audit`. [ADR-0042](../adr/0042-usda-search-reference-foods.md) §1 and its Amendment (2026-08-19, #113) govern the ranking; §5 appears only as a cause.
**Siblings:** [#124](https://github.com/palebluebytes/inventoria/issues/124) owns the qualifier-position defect and is handed sizing data here, not a decision. [#126](https://github.com/palebluebytes/inventoria/issues/126) is where both known cases surfaced.
**Date:** 2026-08-20. Figures marked _measured_ are reproduced by `pnpm usda:ranking-audit` over the 4,429-row index and the OFF taxonomy pinned by sha256 in `130-audit-inputs.json`. **Status:** research only — no ranking code changed.

---

## 1. What is being measured, and why not what the ticket asked for

#130 asks how often "the top-ranked row loses to a better record further down". Its own flagship case cannot be expressed that way. _Measured:_

```
== green onion
   t50 raw0  Onions, young green, tops only        ← the ONLY result
```

`Onions, spring or scallions (includes tops and bulb), raw` scores `NO_MATCH` — no token of `green onion` prefixes or stems to any of its words — so it is not further down the list. It is not on the list. The same is true of `napa cabbage`, and for the same reason.

So the measurement splits in two, with separate denominators that are never blended:

- **Recall** — is the best record in the result set at all. Both known cases live here, and the harm is that the food is invisible.
- **Ranking** — given it was retrieved, where did it land, in the harm buckets `leads` / `visible` (2–5) / `buried` (6–50). This is #124's class.

Two further corrections to the ticket, both _measured_:

- **The raw napa record was never dropped.** `Cabbage, chinese (pe-tsai), raw` is in the corpus; `pe-tsai` is napa cabbage. This is a vocabulary miss identical in class to green onion, not the coverage gap #130 calls it. (`Cabbage, chinese (pak-choi)` genuinely has no raw row. That one is a real gap and a different case.)
- **ADR-0042 §5 is the composite-dish drop rule**, not the ranking. The ranking is §1 plus its #113 Amendment. §5 survives in this note only as a _cause_ — "our own filter removed the better record", which the sha-pinned archives can separate from "USDA never had it".

## 2. Where the queries come from

A recall miss is by construction a query whose words the right record does not contain. A query set derived from corpus text therefore cannot generate one: every such query trivially retrieves its own row. And a hand-written list is a guess about a distribution nobody has looked at, which is the objection #130 raises against fixing this from a single example — it applies with equal force to the corpus that would test the fix.

The vocabulary is therefore taken from **Open Food Facts' ingredients taxonomy**, an independent source that has never seen this ranking. `ingredients.full.json` (6.4 MB, ODbL) carries per-language synonym sets; the `ingredients.json` the app already fetches in `off-taxonomy.ts` (ADR-0043 §4) does not, and is a different file.

_Measured:_ 1,919 English multi-synonym groups, of which **549 reach this corpus at all**. The remaining 1,370 name additives and manufacturing inputs that touch no reference food. Only the 549 are committed, in `130-audit-inputs.json`, with the source's sha256 and fetch date — the 6.4 MB original is not committed and never enters the app bundle.

**Each group carries its own oracle.** When `wombok` retrieves nothing, a sibling member has already named the record it should have reached. That is what makes several hundred judgements affordable: each is checking a proposed answer, not searching 4,429 rows for one.

Alongside it, on its own denominator, sits a fixed list of **20 everyday British-usage queries** — the one gap OFF's American-leaning English structurally leaves. It was written before the sweep ran and is never blended into the mechanical counts.

## 3. Pre-registration

Written and committed **before the sweep ran and before a single case was adjudicated**, because a measurement whose categories and thresholds are chosen after the numbers arrive is a rationalisation. The commit history shows this section landing first.

### 3.1 What counts as better

Applied in this precedence when the axes conflict:

1. **Whole over part.** A part of a food is the sharpest wrongness, because the user asked for the food.
2. **Raw over cooked**, following ADR-0042 §1's base-ingredient preference.
3. **Generic over qualified.**

### 3.2 Verdicts

- `miss` — a better record exists and the query did not lead with it.
- `peers` — the candidates are different foods, or equally good forms of one. **Not** a miss. If `peers` dominates, that is the finding, and it retires the remedy more cleanly than a low miss count would.
- `correct` — the ranking was right; the mechanical flag was a false positive.
- `implausible-query` — nobody types this into a food search. OFF's vocabulary is ingredient-label jargon as well as food names (`milk lactose`, `cooked beef meat`). Counted, and excluded from every rate.

### 3.3 Causes

A closed list, plus `other`:

`vocabulary` · `qualifier-position` (#124's class) · `filter-dropped` (an ADR-0042 §4/§5 or ADR-0048 rule took it) · `usda-absent` (never in the archives) · `peers` · `correct` · `other`.

Every `other` is enumerated individually in §7 rather than reported as a count. **If `other` exceeds ~10% the taxonomy was wrong**, and this note says so rather than absorbing the overflow.

### 3.4 Thresholds

**Recall class.** Recommend pinning an OFF-derived synonym layer if **≥ 100** adjudicated groups are real misses over foods a person would plausibly search — already four times the entire curated stand-in table, which settles boundedness by itself. Below **40**, file the known cases as individual quirks and recommend no mechanism.

**Ranking class.** Hand the numbers to #124. Recommend no independent §1 change unless **≥ 25** adjudicated misses survive that #124's positional key would not fix.

**Between the bands**, this note reports and returns the decision rather than resolving it.

### 3.5 The known cases are excluded from every rate

`green onion` and `napa cabbage` were found by chance while fixing #126. A sample containing the thing it was built to find measures nothing, so both are accounted for in §8 and counted nowhere else.

### 3.6 Who adjudicates

An LLM applying §3.1–§3.3 case by case, with every judgement recorded in `130-ranking-audit.json` so it can be checked rather than trusted. A seeded random 30 is called out in §9 for human spot-check. This is a real limitation of the finding and is stated rather than buried.

## 4. Results

Every figure below is _measured_ by `pnpm usda:ranking-audit` over the 4,429-row index and the vocabulary pinned in `130-audit-inputs.json`. Every individual judgement is in `130-ranking-audit.json`.

**914 cases adjudicated**, on four denominators that are never added together:

| pass                                        | cases |    miss | correct | peers | implausible | other |
| ------------------------------------------- | ----: | ------: | ------: | ----: | ----------: | ----: |
| synonym (flagged, of 549 applicable groups) |   422 | **238** |       6 |    14 |         163 |     1 |
| contested head (all)                        |   272 |  **39** |     198 |    22 |           — |    13 |
| head+qualifier (200 sampled of 1,336)       |   200 |   **7** |     170 |     3 |           — |    20 |
| British usage (all)                         |    20 |  **17** |       3 |     — |           — |     — |

Causes of the misses:

| cause                | synonym | head | pair | British |
| -------------------- | ------: | ---: | ---: | ------: |
| `vocabulary`         |     236 |    — |    — |      17 |
| `qualifier-position` |       1 |   35 |    7 |       — |
| `filter-dropped`     |       1 |    4 |    — |       — |
| `usda-absent`        |       — |    — |    — |       — |

Q6's harm buckets, over all 1,711 (member, candidate) pairs the synonym pass produced:

| bucket                             |     count |
| ---------------------------------- | --------: |
| `leads` (rank 1)                   |       608 |
| `visible` (rank 2–5)               |        49 |
| `buried` (rank 6–50)               |        20 |
| **`absent`** (not in the 50 shown) | **1,034** |

**That ratio is the whole finding in one line.** Where a query does not lead with the right record, it fails to retrieve it at all **15 times more often** than it merely buries it. #130 was filed against the 69, and the 1,034 is what was actually there. Per-pair ranks are in `130-ranking-audit.json` under each case's `harm`, so a future metric can be recomputed without re-running the sweep.

`other` came to **34 of 914 (3.7%)**, inside the 10% ceiling §3.3 set. It is enumerated in §7 and is not the miscellany the category was braced for: 33 of the 34 are one mechanism the pre-registered taxonomy did not know about.

## 5. The recall class

**236 vocabulary misses** against a threshold of 100. The recall recommendation clears, and not narrowly.

The failure is always the same shape: the corpus holds the right record, and the word the user typed is not in it. `aubergine` returns nothing while `Eggplant, raw` sits in the index. So does `courgette`, `swede`, `beetroot`, `rocket`, `prawns`, `sultanas`, `cornflour`, `yoghurt`, `chilli`, `soya`, `wholemeal`, `omelette`, `lychee`, `pomelo`, `borlotti`, `haricot`, `passionfruit`, `blackcurrant`, `mollusc`, `iodised`, `pasteurised`, `camomile`, `maize`, `linseed`, `saithe` and `daikon`.

**The British-usage list is the sharpest single number in this note: 17 of 20 everyday queries return nothing at all.** Only `coriander`, `spring onion` and `chickpeas` work. Every one of the 17 has a record in the corpus under an American name, verified individually — `mince` → `Beef, ground, …`, `double cream` → `Cream, heavy`, `caster sugar` → `Sugars, granulated`, `jacket potato` → `Potatoes, baked, flesh and skin, without salt`, `mange tout` → `Peas, edible-podded, raw`. This is not a long tail. It is the everyday shopping vocabulary of the person using the app.

### Is the class bounded?

Yes, and the bound is already written down by somebody else. The 549 groups that reach this corpus serialise to **32.3 KiB raw, 10.3 KiB gzip** — against the 509 KiB the bundle already ships (#120). A synonym layer sourced from OFF is roughly a 2% addition to an artifact that is already over its budget, which is a cost worth naming but not one that decides anything.

It is worth being clear about what the 163 `implausible-query` verdicts mean. OFF's vocabulary is an ingredient-label vocabulary, so it carries `milk lactose`, `cooked beef meat`, `anti-foaming agent` and 40-odd E-numbers alongside the food names. **Slightly under two-fifths of the flagged groups are not food searches at all.** Any layer built from this source has to filter them, and `usda_ndb_code` / `ciqual_food_code` are on the entries as a candidate filter — 661 and 805 of 6,446 respectively. That filter was deliberately not used to pre-screen here (§3.3), because it would have silently dropped real cases and left no record of what was lost.

## 6. The ranking class, and what #124 inherits

**43 `qualifier-position` misses.** They split cleanly, and the split is the finding:

- **35 where the query IS the head phrase.** `milk` → cultured reduced-fat buttermilk. `cheese` → lactose-reduced lowfat cottage cheese. `butter` → clarified butter (ghee). `egg` → duck egg. `beef` → separable fat. `oil` → bearded seal oil. `mayonnaise` → the tofu one. `yogurt` → nonfat fruit variety. `sour cream` → imitation. `vanilla extract` → imitation. `bread` → Salvadoran sweet cheese bread. `peppers` → jalapeno. `pasta` → gluten-free corn.
- **7 where the discriminating word sits in a qualifier.** `white wheat flour` → self-rising. `white mushroom` → the ultraviolet-exposed record. `parmesan cheese` → low sodium. `shiitake mushrooms` → stir-fried. `bacon pork` → reduced sodium.

**#124's proposed smallest-matched-word-index key fixes the 7 and cannot touch the 35.** When the query is the head, every candidate matches at word index 0, so the new key ties on all of them exactly as the existing keys do. §3.4's threshold was 25 misses surviving #124's fix; 35 survive.

So the recommendation §1 gets is **not** the one #130 anticipated. The gap is not vocabulary in the ranking and it is not #124's positional key. It is that **nothing prefers the least-qualified record**. ADR-0042 §1 has exactly that idea already — `simplicity`, "Bananas, raw (3) over Bananas, overripe, raw (2)" — but it is gated behind `raw`, so it never fires for cheese, butter, bread, oil or mayonnaise. Every one of the 35 would be decided correctly by preferring the record with the fewest qualifiers. That is one key, and it is a key ADR-0042 already contains in a narrower form.

This note does not decide it. It is handed to #124 as sizing, with the observation that #124's own remedy addresses a seventh of the class it was filed against.

## 7. `other`, enumerated

34 cases, of which **33 are one mechanism**: `compileReferenceFoodQuery` splits the typed query on whitespace only, while `readReferenceFoodName` splits a description on every non-alphanumeric character. A hyphen, apostrophe, bracket, slash or percent inside a typed word therefore produces a token that no name word can ever equal or prefix, and the query collapses to `NO_MATCH`.

The diagnostic is stark: **4,394 of the 4,429 rows retrieve nothing when searched by their own full description**, because the commas in the description survive tokenisation. 81 rows have a head phrase containing a bracket, hyphen or apostrophe, and none of them can be reached by that head phrase — `Yambean (jicama), raw` is unreachable by `yambean (jicama)` but reached instantly by `yambean jicama`.

Its real-world weight is much smaller than that number suggests, and the passes disagree about it because they type different things: it explains only **12 of the 435 empty synonym members** but **13 of 272 contested heads** and **20 of 200 sampled pairs**. Plausible everyday casualties are `mahi-mahi`, `pak-choi`, `black-eyed peas`, `low-fat milk`, `sheep's milk`, `whole-wheat pasta`, `freeze-dried chives` and `peri-peri`.

It is a one-line fix — tokenise the query the way names are tokenised — and it is not in this note's scope to make it.

The remaining `other` is `en:apple`, whose OFF synonym list contains the bare strings `raw` and `without skin`. That is corrupt upstream data, not a defect here.

## 8. The three known cases

Excluded from every rate above, per §3.5.

- **`green onion`** — confirmed, and confirmed to be a recall failure rather than the ranking failure #130 describes. `Onions, spring or scallions (includes tops and bulb), raw` scores `NO_MATCH`; the single returned row is the tops-only record. The OFF group `en:spring-onion` names the right record through four of its five members.
- **`napa cabbage`** — **the ticket's diagnosis was wrong.** `Cabbage, chinese (pe-tsai), raw` is in the corpus and is raw napa cabbage. `napa cabbage` reaches only `Cabbage, napa, cooked`, and `wombok` reaches nothing. A vocabulary miss, not a coverage gap.
- **`coriander leaf` / `cilantro`** — found by this measurement, not known before. `coriander leaf` singular reaches `Spices, coriander leaf, dried`; the plural and `cilantro` reach `Coriander (cilantro) leaves, raw`. A user typing the singular gets a dried spice where they meant a fresh herb.

### What the archives said about absences

Two synonym cases and four head cases needed the sha-pinned archives to separate "our filter took it" from "USDA never had it". **Every one came back `filter-dropped`; none came back `usda-absent`.**

The mechanism is the same in all six: the record passes all four ADR-0042 name filters and is dropped afterwards, by ADR-0048's energy rule or the twin merge. `Whey, sweet, dry` — the plain whey powder — is gone, leaving only protein isolates. `Spinach, raw` is in **both** archives and neither copy ships, so searching `spinach` cannot reach raw spinach at all; it returns boiled spinach, baby and mature. `Parsley, raw`, `Basil, raw`, `Oats, raw` and `Millet, raw` are likewise absent with no raw row of any kind left under those names.

This is a cost of #126 that #126 did not measure, and it is not the same thing as the calorie-less rows it set out to remove. **It is not quantified here and this note does not attempt to**: a crude head-match flagged 38 candidates, spot-checking 15 confirmed 5 and refuted 10, and a number that unreliable does not belong in a finding. It needs its own measurement, against ADR-0048 rather than ADR-0042.

## 9. Recommendation

**1. ADR-0042 §5 needs no amendment; the citation in #130 is wrong.** §5 drops composite dishes. Nothing in this measurement bears on it.

**2. Recall: build the synonym layer, sourced from OFF, not hand-written.** 236 vocabulary misses over plausible food searches, plus 17 of 20 everyday British queries returning nothing. The class is bounded at 549 groups and 10.3 KiB gzipped, it is externally maintained under ODbL, and it is attributable — the same argument ADR-0046 made for pinning third-party data rather than inventing it. A hand-curated list is now clearly the wrong shape: it would have to reach 236 entries to match what an existing file already knows.

**3. Ranking: §1 needs one key that #124 does not supply.** 35 of the 43 ranking misses are queries that name the food exactly, where every candidate ties and an arbitrary qualifier wins. Preferring the least-qualified record decides all 35. ADR-0042 §1 already has this idea as `simplicity` and gates it behind `raw`; ungating it is the shape of the remedy. **#124 stays open and this note decides nothing for it** — it gets the sizing and the observation that its own key addresses 7 of the 43.

**4. Fix the query tokeniser.** One line, independent of everything above, and it is currently the reason 4,394 of 4,429 rows cannot be found by their own name.

**5. Measure what ADR-0048's drop cost recall.** Confirmed on spinach, parsley, basil, oats and millet; unquantified, and deliberately so.

### What this note is not

The adjudication was performed by an LLM applying §3.1–§3.3, one case at a time. The judgements are all in `130-ranking-audit.json` so they can be disagreed with individually rather than taken on trust. A seeded random 30 for spot-checking:

head `whey` (correct) · head `blueberries` (correct) · pair `domesticated duck` (correct) · head `dates` (peers) · head `margarine` (correct) · pair `hamburger pickle relish` (correct) · head `peanuts` (correct) · `en:grape-juice` (miss) · head `oil` (miss) · head `raisins` (correct) · british `porridge oats` (miss) · british `caster sugar` (miss) · pair `horse game meat` (correct) · `en:no5` (implausible) · head `pineapple` (correct) · head `lamb` (correct) · pair `yellow onions` (correct) · `en:beetroot` (miss) · `en:butterfat` (miss) · head `carrots` (correct) · head `collards` (correct) · `en:goat-milk` (miss) · pair `raw ginger root` (correct) · head `fish oil` (correct) · head `couscous` (correct) · head `bear` (miss) · head `cherries` (correct) · `en:mammy-apple` (correct) · pair `no fat free ice cream` (correct) · `en:no3` (implausible)

It is drawn with the same seed the pair sample uses, so `pnpm usda:ranking-audit` re-derives it. Verdicts are shown so a disagreement is one lookup rather than a hunt.

The two most load-bearing judgements to check are `implausible-query` (163 cases, and if that call is systematically wrong in either direction the vocabulary count moves with it) and `peers` (39 across all passes, the verdict that keeps the miss rate honest).

---

## Correction (2026-08-20, from #124's grilling)

The 914 adjudications stand. What fails is the sizing derived from them in §6 and
§9, and two cause assignments in §4. Corrected here rather than by reopening
[#130](https://github.com/palebluebytes/inventoria/issues/130), so that anything
citing this note reads the correction alongside the claim.

### §6's split is not the split

§6 divides the 43 `qualifier-position` misses into 35 head-only and 7 where "the
discriminating word sits in a qualifier", and hands #124 the 7 as the class its
positional key would fix. **The key fixes none of the 7.** Each was re-read from
its per-case record in `130-ranking-audit.json` and scored against a summed
positional key over the shipped index:

| case                 | this note's own note on it                       | positional?                        |
| -------------------- | ------------------------------------------------ | ---------------------------------- |
| `white wheat flour`  | self-rising over plain all-purpose               | no — same index in both            |
| `white mushroom`     | the UV-exposed record                            | no — same index in both            |
| `parmesan cheese`    | low sodium over plain hard parmesan              | no — same index in both            |
| `australian beef`    | external **fat** rather than a cut               | no                                 |
| `bread flour`        | gluten-free _bread_; the flour is never reached  | no — retrieval, not order          |
| `shiitake mushrooms` | stir-fried; **no raw shiitake survives**         | no — §8's class, ADR-0048's ledger |
| `bacon pork`         | reduced-sodium cooked over the unprepared record | moves — to a _rendered fat_ record |

Six are the least-qualified problem or a coverage gap wearing a positional label.
The seventh moves to `Pork, bacon, rendered fat, cooked`, which is the shape this
note files as a miss under `australian beef`.

### §4's cause table mis-files two of #124's real cases

`coconut oil` and `cheddar cheese` are counted under `vocabulary` in the synonym
pass, while their own notes name a ranking defect — "leads with an INDUSTRIAL
confection fat, not the culinary oil"; "'cheddar cheese' with process cheese".
They belong to #124's class. `olive oil`, the defect's founding case, appears in
none of the 914.

The consequence is not a small reallocation between buckets. **This note's cause
taxonomy cannot size #124 in either direction**: it under-counts the class by
filing it as vocabulary, and over-counts it by filing least-qualified and
coverage failures as positional. #124 is sized by a mechanical structural sweep
instead — the signature is countable without an adjudicator.

### §9's recommendation 3 names the wrong measure

"Preferring the least-qualified record decides all 35" does not hold. Scored over
the shipped index, a fewest-qualifiers key — counted by qualifier words or by
commas, the two agree — picks:

| query        | fewest-qualifiers picks                         | what should lead                                       |
| ------------ | ----------------------------------------------- | ------------------------------------------------------ |
| `milk`       | `Milk, imitation, non-soy` (3)                  | `Milk, whole, 3.25% milkfat, with added vitamin D` (6) |
| `mayonnaise` | `Mayonnaise, made with tofu`                    | no plain mayonnaise row exists                         |
| `yogurt`     | ties plain whole-milk with nonfat fruit variety | the plain one                                          |
| `cheese`     | `Cheese, cheddar` (1)                           | holds                                                  |
| `bread`      | `Bread, white wheat` (2)                        | holds                                                  |

USDA writes the canonical milk with more qualifiers than the imitation one, so
"fewest qualifiers" conflates _shortest name_ with _most canonical_. The
observation §6 makes — that nothing prefers the least-qualified record, and that
`simplicity` already carries the idea gated behind `raw` — survives. The measure
does not. Defining and measuring one is the first acceptance line of the ticket
that inherits the 35, not an assumption inside it.

### What is unaffected

§5's recall finding (236 vocabulary misses, 17 of 20 British queries), §7's
tokeniser diagnosis, §8's three known cases, and recommendations 1, 2, 4 and 5.
None of them depends on the `qualifier-position` split.

## Postscript (2026-08-20, #124 shipped)

The correction above says this note's cause taxonomy cannot size #124, and that a
mechanical structural sweep would size it instead. That sweep now exists as the
`qualifier` pass in `pnpm usda:ranking-audit`, and its numbers are in
`130-ranking-audit.json` beside everything else here. It reads differently from
the four passes above: it measures a change rather than a state, ordering each
query twice and diffing.

Over 1,328 generated queries, 76 leads move. The defect itself — a leading row
beaten on summed token index by a candidate below it — falls from 92 queries to 16. The residue is leads that win on tier, rawness or head-completeness, which
the position key sits below and cannot overrule.

951 answers rise and 773 fall, counted over every query rather than only the 76
whose lead moved, and both columns are real. The falls are almost
entirely beef and chicken cut records reordering among near-identical siblings
(`top beef`, `loin beef`, `skin chicken`), where no candidate is the obviously
right one; §3.2's `peers` verdict is the honest reading of most of them.
`bacon pork` is the exception worth naming, and #124 named it in advance: it
lifts `Pork, bacon, rendered fat, cooked` over five cured bacons, which is the
shape this note files as a miss under `australian beef`. No guard was added.
That is the reserved-slot key's job.

One thing the sweep found that neither this note nor #124 predicted. Ranked by
its own full description, a row's query is a whole name rather than a head
phrase, so the position key reads it: `Cheese, cheddar` places "cheddar" at word
1 in itself and at word 3 in `Cheese, pasteurized process, cheddar or American,
low sodium`. The #136 Amendment's 356 rows that are not first by their own name
fall to 172. 184 rows gained the lead and none lost it, so both counts are now
pinned as a corpus test rather than left as a claim.

### The judgements in this file nearly did not survive the regenerate

§9 says the judgements are all in `130-ranking-audit.json` "so they can be
disagreed with individually rather than taken on trust". Re-running the script
reset all 914 of them to null. The ranking work destroyed the record it was being
measured against, and nothing in the file said so.

The script now carries verdicts forward by case identity. 906 of the 914 came
back; 8 went with cases the sweep no longer emits, because the ranking change
made their synonym groups agree. 109 are flagged `verdict_stale`: the case is
still here and the verdict is still attached, but the leading row it was looking
at has moved, so it needs re-reading before it is quoted again. The flag is
sticky, or the next regenerate would compare against the run that already moved
the row and quietly clear the doubt.

The counts in §3 and §4 were taken on the 914-case run and are left as they were.
Where they and the file now disagree, the file is current and the tables are
dated.

---

## Correction (2026-08-21, from #137's grilling): §8's six absence verdicts are all wrong

Every one of them is the same defect in the tool that produced them, and the tool
is `pnpm usda:ranking-audit --explain`, which this note names as the grounds for
"What the archives said about absences".

`explainAbsence` skipped the Survey archive by comparing `archive.dataset` against
the literal `"Survey (FNDDS)"`. `scripts/usda-backup.manifest.json` says
`"Survey (FNDDS 2021-2023)"`. The guard never fired, so the post-mortem read all
**5,432 Survey records** — a dataset `BUNDLE_DATASETS` deliberately never consumes,
because bundling it would ship the composite dishes the ADR-0042 filters exist to
drop — and reported every one of them as a corpus casualty.

Two further defects went with it. The filter chain was asked of each raw record
where the generator asks it of the merged identity, so it could name a filter that
never ran. And it had no bucket for the twin merge at all: a record that left
because its twin's name won landed in a residual labelled "no_energy (ADR-0048) or
the twin merge", which is the ambiguity this section then reported as a finding.

### The six, re-filed

| §8 says                                                       | what is true                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Parsley, raw` is gone                                        | It is in the Survey archive and nowhere else. `Parsley, fresh` (SR Legacy 11297) ships.                                                                                                                                                                                  |
| `Basil, raw` is gone                                          | Survey only. `Basil, fresh` ships.                                                                                                                                                                                                                                       |
| `Oats, raw` is gone                                           | Survey only. SR Legacy `Oats` merged into `Oats, whole grain, rolled, old fashioned`, which ships.                                                                                                                                                                       |
| `Whey, sweet, dry` is gone                                    | Survey only. `Whey, sweet, dried` (SR Legacy 1115) is in the corpus.                                                                                                                                                                                                     |
| `Spinach, raw` is in **both** archives and neither copy ships | It is in Survey and in SR Legacy (168462). Foundation holds `Spinach, baby` and `Spinach, mature`, not a third copy. 168462 carries ndb **11457**, the same number as `Spinach, mature`, so the twin merge collapses them and raw spinach ships under Foundation's name. |
| `Millet, raw` is gone                                         | SR Legacy 20031, merged into `Millet, whole grain`, which ships.                                                                                                                                                                                                         |

**None of the six is an ADR-0048 casualty.** That record's ledger is closed and it
is 13 rows, all of them enumerated in the record itself. Re-measured against the
same archives on 2026-08-21: 7,966 identities to 4,353 survivors, dropping 922
brand-specific, 1,427 processed, 1,189 prepared, 17 dry-basis, 45 manufacturing
inputs and 13 reporting no energy.

### What §5's recommendation becomes

Retargeted, not withdrawn. The mechanism that loses a name is the **twin merge**:
`resolveFdcGroup` keeps the base record's identity, and 93 of the 165 surviving
twinned foods ship under a name that replaced a different archived one. Typing the
archived name reached nothing for 40 of them and failed to lead for 59. That is
[#137](https://github.com/palebluebytes/inventoria/issues/137), settled as
[ADR-0050](../adr/0050-a-merged-food-keeps-the-name-its-twin-lost.md).

Underneath it sits a second finding this note could not have seen: USDA **reuses**
`ndbNumber` across the two archives, so some of those merges fused two different
foods. `Apples, raw, golden delicious, with skin` and
`Apples, honeycrisp, with skin, raw` both carry 9501, and Golden Delicious is not
in the corpus at all. That is
[#145](https://github.com/palebluebytes/inventoria/issues/145).

### What still stands

Everything else. §5's 236 vocabulary misses, §6's split of the 43 ranking misses,
§7's tokeniser diagnosis and §4's rates were all measured through the ranking over
the committed index, not through the absence tool. Only §8 and §9's item 5 rest on
`--explain`, and only they fall.

The napa cabbage entry in §8's list of three known cases was already right, and
ADR-0048's Consequences went on asserting the opposite until this correction;
`Cabbage, chinese (pe-tsai), raw` is in the corpus and the failure is that
`napa cabbage` never reaches it.
