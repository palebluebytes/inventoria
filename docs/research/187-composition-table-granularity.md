# Research: does any composition table carry one row per ingredient? (#187)

**Grounds:** the committed `public/usda/search-index.json` (`schema_version` 8, 4,238 rows) and the three mirrored archives in `.usda-backup/`, against ten non-USDA distributions downloaded and parsed for this note. [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) §1 names USDA the single composition authority; §5 governs what a second table would have to be. [Research note #108](108-base-food-composition-sources.md) rostered the field and measured it on completeness, licence, portions and size.
**Parent map:** [#186](https://github.com/palebluebytes/inventoria/issues/186) — food search answers with one row per ingredient. This note blocks the head-phrase adjudication work, because a table swap invalidates every verdict adjudicated against a USDA description.
**Date:** 2026-08-28. Every number below was computed that day from the primary distribution named, over the complete file rather than a sample. **Status:** research only — no code, no ADR, no change to the shipped corpus.

---

## 1. Answer

**No composition table carries one row per ingredient. Thirteen distributions were measured and not one of them answers a single term of the ten-word roster with a single row.** Every table on the roster encodes a cut × preparation cross-product; they differ in how many axes they multiply, never in whether they multiply.

**USDA stays, and the reason is not that USDA is good at this.** It is the worst of the thirteen. The shipped corpus runs at **8.28 rows per head phrase** against CIQUAL's **2.00**, and its 949 `beef` rows are 22.5% of the whole corpus where CIQUAL's 91 are 2.6% of its. That gap is real, it is four-fold, and it is the largest single fact in this note. What decides against a swap is what happens next: the gap closes from our side and does not close from theirs.

- **Two crude drop rules take `beef` from 949 rows to 38** — below CIQUAL's 53 — while keeping **499 of 512 head phrases** and 1,851 of 4,238 rows (§8). Granularity is removable.
- **Nothing takes CIQUAL's folate from 43% to USDA's 88%, and nothing gives CIQUAL a household portion**, which is 95% of our rows today and the app's whole answer to "how much is one of these?" (§7). Those deficits are not removable.
- **A swap would not even deliver the thing it is being considered for.** A typed `cheese` returns 104 rows against the shipped corpus and **248 against CIQUAL**; `milk` returns 28 against **288** (§4.1). On two of the ten roster words the leading challenger is worse, not better.

So the expected answer holds, but it should be recorded for the measured reason rather than the assumed one. **Granularity is ours to fix by dropping rows.** No candidate hands it to us, and the two candidates that come closest hand us a different duplication in exchange.

**The one finding that changes work rather than confirming it** is §6. The question "does any schema separate a food from its preparation" has an answer, and the answer is inside USDA: `retentionCode` on every FNDDS record resolves in USDA's published **Table of Nutrient Retention Factors, Release 6** (270 preparation classes × 26 nutrients), and USDA's **Table of Cooking Yields for Meat and Poultry** is keyed on `ndbNumber` — the identifier ADR-0045 §2 already joins on — with **169 of its 170 keys resolving in SR Legacy**. If a food is ever to gain _forms_, the factors behind them are already published, already keyed to our identifiers, and already public domain.

## 2. What was measured, and by what rule

Two counting rules, applied identically to every table.

**Rule A, head phrase.** The text before the first comma, lowercased and stripped, equals the term. This is the repo's own **Adjudicated head phrase** (`CONTEXT.md`), and it is stated first because it **reproduces the parent map's shipped figures exactly** — 949 `beef`, 178 `chicken`, 322 `pork`, 87 `cheese` — which is what proves the instrument is the one the map was written with. It applies only to tables using USDA's `Food, qualifier, qualifier` comma grammar. CIQUAL, CoFID, Matvaretabellen, Frida, CNF, AFCD and FNDDS all use it. **Livsmedelsdatabasen and NEVO do not** — they write `Beef sirloin steak raw` and `Beef T-bone steak raw` with no commas at all — so their Rule A columns are zero everywhere, their "rows per head phrase" is 1.00 by construction, and **neither figure is evidence of anything**. Both are read under Rule B only, and §5 reads their rows directly instead.

**Rule B, word match.** The term, or its simple plural, appears as a whole word anywhere in the food's name. Grammar-independent, so it is the rule that compares across tables. Tokenising is Unicode-aware; an ASCII-only character class silently splits `nöt` into `n` and `t` and reports zero Swedish beef.

Where the two disagree, Rule B is the larger and Rule A is the one that matches the map.

### 2.1 The distributions

Every file below was downloaded and parsed for this note. Sizes are bytes as received; digests are the first twelve hex characters of the SHA-256.

| Source                         | File                                                   |      Bytes | sha256         |
| ------------------------------ | ------------------------------------------------------ | ---------: | -------------- |
| USDA shipped corpus            | `public/usda/search-index.json`                        |  1,715,082 | `c6ec753af82a` |
| USDA SR Legacy 2018-04         | `FoodData_Central_sr_legacy_food_json_2018-04.zip`     | 13,456,312 | `0fe8ae486a2c` |
| USDA Foundation 2026-04-30     | `FoodData_Central_foundation_food_json_2026-04-30.zip` |    469,303 | `186e988ec542` |
| USDA Survey / FNDDS 2024-10-31 | `FoodData_Central_survey_food_json_2024-10-31.zip`     |  3,835,292 | `dfb06ae7ddc3` |
| CIQUAL 2025                    | `alim_2025_11_03.xml`                                  |  1,581,031 | `e0b1de25b303` |
| CoFID 2021                     | `McCance_Widdowsons_..._2021..xlsx`                    |  4,629,542 | `436e9445ef2a` |
| Matvaretabellen (NO)           | `api/en/foods.json`                                    | 13,690,405 | `89b8f5f494a7` |
| Livsmedelsdatabasen (SE)       | `api/v1/livsmedel?sprak=2`                             |  1,488,724 | `428130d20ed8` |
| Fineli Release 20.0 (FI)       | nutrient-data-package zip                              |  1,954,388 | `e7e6bd8d4b92` |
| CNF 2026 (CA)                  | `cnf_fcen_all-files-data_2026.zip`                     | 26,656,195 | `f5faad8977ee` |
| Frida 6.1 (DK)                 | `FCDB_6.1_Dataset.xlsx`                                | 12,591,387 | `aba52ade9dd7` |
| AFCD Release 3 (AU)            | `AFCD_R3_Food_Details.xlsx`                            |  1,137,444 | `69aa096c45cb` |
| NEVO-online 2025 v9.0 (NL)     | `NEVO2025_v9.0.zip`                                    | 27,727,760 | `e1b0329410ef` |

Two factor tables were downloaded for §6: USDA's `retn06.pdf` (126,629 bytes, `53ea1b820082`) and `usda_cookingyields_meatpoultry.pdf` (162,957 bytes, `5a13eb6a3719`), both from ARS, and FAO/INFOODS' `WAFCT_2019.xlsx` (3,060,230 bytes, `bca8e44f7a41`).

The three USDA archives are the local mirror `pnpm usda:backup verify` checks; the digests above match `scripts/usda-backup.manifest.json`. CIQUAL came from the Recherche Data Gouv Dataverse API under `doi:10.57745/RDMHWY`, whose own metadata states the release as `2025-11-19T16:29:04Z` and the licence as `etalab 2.0` — read out of the API response, not off a web page. The rest: CoFID from its gov.uk publication page; Matvaretabellen and Livsmedelsdatabasen from their own JSON APIs (`/api/en/foods.json` and `?sprak=2`); CNF from `open.canada.ca`; Frida from DTU Data via `doi:10.11583/DTU.32312844`; AFCD from `foodstandards.gov.au`; NEVO from `rivm.nl`; the FAO/INFOODS workbooks from `fao.org/fileadmin`.

**One distribution is a mirror, not the current release, and that is a real caveat.** Fineli's own download host answers `curl` with HTTP 403 and a Cloudflare managed-JS challenge; a full Chrome header set, HTTP/2, and TLS impersonation (`curl-impersonate` at three Chrome versions) all fail, because only a browser executing JavaScript passes. The package measured here is the genuine THL zip recovered from a 2022 Wayback capture of `fineli.fi/fineli/content/file/49`, and its own `descript.txt` states **Release 20.0**, CC BY 4.0. Live Fineli is two to three releases further on. Read every Fineli figure in this note as "Release 20.0, obtained by mirror" — the granularity conclusion does not turn on a release, but the number is not the current one and should not be quoted as if it were.

**What could not be obtained is recorded as such and is not estimated.** See §9.1 and §9.2.

## 3. Rows per everyday ingredient

Rule A, the head-phrase rule that reproduces the map's figures.

| Source                      |  rows |    beef | chicken |    pork | apple | potato | milk | rice | cheese | egg | salmon |
| --------------------------- | ----: | ------: | ------: | ------: | ----: | -----: | ---: | ---: | -----: | --: | -----: |
| **USDA shipped (schema 8)** | 4,238 | **949** | **178** | **322** |     0 |      0 |    9 |   27 | **87** |  22 |      1 |
| USDA SR Legacy              | 7,793 |     960 |     204 |     324 |     0 |      0 |   48 |   29 |     81 |  25 |      3 |
| USDA Foundation             |   363 |      15 |       9 |       6 |     0 |      0 |    4 |    4 |     17 |   6 |      0 |
| USDA Survey / FNDDS         | 5,432 |      81 |      37 |      37 |     4 |    106 |   20 |  140 |     61 |  27 |      0 |
| CIQUAL 2025                 | 3,484 |      53 |      24 |      31 |    12 |     20 |   14 |   16 |     10 |   7 |     14 |
| CoFID 2021                  | 2,887 |      95 |      60 |      76 |     0 |      1 |   29 |   28 |     44 |   0 |     15 |
| Matvaretabellen             | 2,121 |      21 |      23 |      18 |     7 |      1 |   36 |   20 |     56 |   8 |      8 |
| Fineli Rel 20.0             | 4,238 |      11 |       4 |      13 |     6 |     17 |   29 |   19 |     41 |  11 |      5 |
| CNF 2026                    | 5,993 |     168 |     164 |     208 |    18 |     81 |   33 |    5 |    120 |  24 |      0 |
| Frida 6.1                   | 1,390 |      36 |      15 |      51 |     2 |      6 |   21 |    4 |     60 |   4 |     10 |
| AFCD Release 3              | 1,588 |      65 |      42 |      66 |    12 |     28 |   18 |    8 |     21 |  11 |     10 |
| Livsmedelsdatabasen         | 2,606 |       — |       — |       — |     — |      — |    — |    — |      — |   — |      — |
| NEVO 2025 v9.0              | 2,328 |       — |       — |       — |     — |      — |    — |    — |      — |   — |      — |

Rule B, the grammar-independent rule.

| Source                      |  rows |    beef | chicken | pork | apple | potato |    milk | rice |  cheese | egg | salmon |
| --------------------------- | ----: | ------: | ------: | ---: | ----: | -----: | ------: | ---: | ------: | --: | -----: |
| **USDA shipped (schema 8)** | 4,238 | **952** |     179 |  325 |    18 |     47 |      28 |   49 |     104 |  44 |     32 |
| USDA SR Legacy              | 7,793 |   1,105 |     392 |  427 |    88 |    155 |     211 |  132 |     277 |  93 |     47 |
| USDA Foundation             |   363 |      17 |       9 |   10 |     6 |      5 |      13 |    9 |      19 |   9 |      2 |
| USDA Survey / FNDDS         | 5,432 |     220 |     409 |  123 |    20 |    329 |     149 |  309 |     455 | 230 |     16 |
| CIQUAL 2025                 | 3,484 |      91 |      70 |   88 |    42 |     64 | **288** |   43 | **248** |  49 |     29 |
| CoFID 2021                  | 2,887 |     143 |     128 |   96 |    29 |    107 |     130 |   72 |      91 |  55 |     29 |
| Matvaretabellen             | 2,121 |      37 |      53 |   26 |    26 |     51 |     122 |   40 |     113 |  26 |     22 |
| Livsmedelsdatabasen         | 2,606 |      99 |      66 |  110 |    32 |    113 |     108 |   54 |     117 |  32 |     23 |
| Fineli Rel 20.0             | 4,238 |     224 |     150 |  149 |    48 |    218 |     504 |  160 |     172 |  87 |     45 |
| CNF 2026                    | 5,993 |     264 |     344 |  263 |    65 |    156 |     230 |  126 |     303 |  91 |     40 |
| Frida 6.1                   | 1,390 |      47 |      48 |   68 |     7 |     19 |      34 |   13 |      79 |  25 |     10 |
| AFCD Release 3              | 1,588 |      78 |      60 |   67 |    18 |     43 |      39 |   25 |      33 |  15 |     10 |
| NEVO 2025 v9.0              | 2,328 |      75 |      51 |   64 |    34 |     56 |      62 |   38 |      99 |  31 |      7 |

**Roster terms answered by exactly one row: 0 of 10, in all thirteen distributions.** That is the whole of §1's first sentence, and it is the only claim in this note that needs no qualification.

Read as a share of the table, so a small table is not credited for being small, `beef` is **22.5%** of the shipped corpus, 14.2% of SR Legacy, 5.3% of Fineli, 5.0% of CoFID, 4.9% of AFCD, 4.4% of CNF, 4.1% of FNDDS, 3.8% of Livsmedelsdatabasen, 3.4% of Frida, 3.2% of NEVO, **2.6% of CIQUAL** and 1.7% of Matvaretabellen. USDA is an outlier by a factor of four to thirteen, not by a rounding error.

## 4. Rows per head phrase — the permutation factor

The roster is ten words. This is the same question asked of the whole table: how many rows does a table spend on one head phrase, on average? Livsmedelsdatabasen and NEVO are absent because the rule cannot see them (§2).

| Source              |  rows | head phrases | rows/head | top 25 heads hold | largest head             |
| ------------------- | ----: | -----------: | --------: | ----------------: | ------------------------ |
| **USDA shipped**    | 4,238 |          512 |  **8.28** |           **69%** | `beef` (949)             |
| USDA SR Legacy      | 7,793 |          917 |      8.50 |               55% | `beef` (960)             |
| CNF 2026            | 5,993 |          600 |  **9.99** |               53% | `fish` (254)             |
| AFCD Release 3      | 1,588 |          385 |      4.12 |               40% | `pork` (66)              |
| CoFID 2021          | 2,887 |          888 |      3.25 |               33% | `lamb` (106)             |
| USDA Survey / FNDDS | 5,432 |        1,768 |      3.07 |               28% | `rice` (140)             |
| Matvaretabellen     | 2,121 |          804 |      2.64 |               26% | `cheese` (56)            |
| Fineli Rel 20.0     | 4,238 |        1,677 |      2.53 |               22% | `multigrain bread` (113) |
| USDA Foundation     |   363 |          149 |      2.44 |               57% | `flour` (28)             |
| Frida 6.1           | 1,390 |          631 |      2.20 |               29% | `cheese` (60)            |
| **CIQUAL 2025**     | 3,484 |        1,744 |  **2.00** |           **15%** | `beef` (53)              |

The shipped corpus's `69%` reproduces the parent map's measured "top 25 hold 69%" exactly, which is the second check that this is the map's instrument.

Two things fall out that were not expected.

**CIQUAL's floor is 2.00, not 1.00.** 1,212 of its 1,744 head phrases hold exactly one row and 252 hold exactly two, and the two are almost always raw and cooked. CIQUAL is four times less permuted than USDA and it is still not one row per ingredient; **it has dropped the trim and grade axes and kept the cut × preparation one**. 16% of its `beef` rows name a trim or a fat percentage against 94% of ours, but 100% of them name a preparation, exactly as 100% of ours do.

**CNF is worse than USDA.** 9.99 rows per head phrase over 5,993 rows and only 600 head phrases. Note #108 recorded CNF as "largely USDA-derived"; the granularity measurement is consistent with that and adds that CNF inherited the problem and concentrated it. The only national table on the roster that is _directly browser-fetchable_ is also the most permuted thing measured here.

### 4.1 Two roster words where a swap makes the screen worse

CIQUAL answers `cheese` with **248** rows against the shipped corpus's 104, and `milk` with **288** against 28. Those are not permutations — `Abondance cheese, from cow's milk`, `Beaufort cheese, from cow's milk`, `Brie de Meaux cheese, from cow's milk` are genuinely different cheeses, and as coverage that is a French table doing its job. As a result list it is 248 rows to page through where today there are 104, and the map's complaint is that `cheese` shows no cheddar on the first screen.

The `milk` figure is the sharper one. Most of CIQUAL's 288 `milk` rows are **cheeses**, reached because every cheese name carries the suffix `from cow's milk`. Adopting CIQUAL would import a search hazard of exactly the shape #159 and ADR-0062 exist to fix, on a word nobody can avoid typing.

## 5. Beef, read row by row

The counts say the tables differ in degree. Reading the rows says they agree in kind. Each block below is the top of that table's `beef` head phrase, sorted.

**CIQUAL** — cut × {raw, grilled/pan-fried, roasted/baked, braised}:

```
Beef, bolar-blade, grilled/pan-fried       Beef, sirloin steak, grilled/pan-fried
Beef, bolar-blade, raw                     Beef, sirloin steak, raw
Beef, bolar-blade, roasted/baked           Beef, sirloin steak, roasted/baked
Beef, minced steak, 5% fat, raw            Beef, topside, grilled/pan-fried
Beef, minced steak, 10% fat, raw           Beef, topside, raw
Beef, minced steak, 15% fat, raw           Beef, topside, roasted/baked
```

**CoFID** — cut × cooking method × {lean, lean and fat} × {weighed with bone}:

```
Beef, fore-rib/rib-roast, microwaved, lean
Beef, fore-rib/rib-roast, microwaved, lean and fat
Beef, fore-rib/rib-roast, microwaved, lean and fat, weighed with bone
Beef, fore-rib/rib-roast, raw, lean
Beef, fore-rib/rib-roast, raw, lean and fat
Beef, fore-rib/rib-roast, roasted, lean
Beef, fore-rib/rib-roast, roasted, lean and fat
Beef, fore-rib/rib-roast, roasted, lean and fat, weighed with bone
```

**CoFID carries an axis USDA does not.** 111 rows say `weighed with bone`, 22 `weighed with skin`, 16 `weighed with shell` and 209 `flesh only` — a **yield axis expressed as extra rows**, which is the opposite of a yield factor and precisely the thing #186 wants fewer of. 89% of CoFID's `beef` rows name a trim, against 94% of ours: the UK table keeps the axis the French table drops.

**Matvaretabellen** — cut × {raw, roasted, fried}, no trim axis (4%):

```
Beef, rib-eye steak, raw                   Beef, striploin, raw
Beef, rib-eye steak, roasted without fat   Beef, striploin, roasted without fat
Beef, minced meat, 4,5 % fat, raw          Beef, tenderloin, raw
Beef, minced meat, fried without fat       Beef, trimmed fat, raw
```

**FNDDS** — a different cross-product entirely, over dishes rather than butchery. Only 7% of its `beef` rows name a cooking method; 25 of the 81 are permutations of one dish over a starch and a sauce:

```
Beef, rice, and vegetables excluding carrots, broccoli, and dark-green leafy; gravy
Beef, rice, and vegetables excluding carrots, broccoli, and dark-green leafy; no sauce
Beef, rice, and vegetables excluding carrots, broccoli, and dark-green leafy; soy-based sauce
Beef, rice, and vegetables including carrots, broccoli, and/or dark-green leafy; cheese sauce
Beef, noodles, and vegetables including …; mushroom sauce
Beef, potatoes, and vegetables including …; cream sauce, white sauce, or mushroom sauce
```

**The two tables Rule A cannot see permute exactly the same way**, which is why their 1.00 rows-per-head is an artefact of punctuation rather than a finding. Livsmedelsdatabasen, in Swedish: `Nöt ryggbiff rå`, `Nöt oxbringa rå`, `Nöt oxbringa rimmad rå`, `Nöt oxfilé rå` — cut × cure × raw, 99 `nöt` rows in 2,606. NEVO, in English: `Beef T-bone steak raw`, `Beef T-bone steak prepared`, `Beef frying steak raw`, `Beef frying steak prepared`, `Beef breast boneless raw`, `Beef breast boneless prepared`, `Beef <5% fat raw av`, `Beef >5% fat raw av`, `Beef <10% fat prepared av`, `Beef >10% fat prepared av` — cut × {raw, prepared}, with a fat axis on top. **65 of NEVO's 75 `beef` rows name a preparation**, against 30% of the table as a whole.

The permutation factor on the `beef` head alone, taking "the cut" to be the second comma-separated field — a crude rule, stated so it can be argued with, and applied identically:

| Source              | beef rows | distinct cuts | rows per cut | naming a preparation | naming a trim/grade |
| ------------------- | --------: | ------------: | -----------: | -------------------: | ------------------: |
| USDA shipped        |       949 |            75 |         12.7 |                 100% |                 94% |
| USDA SR Legacy      |       960 |            45 |         21.3 |                  99% |                 93% |
| CoFID 2021          |        95 |            17 |          5.6 |                  93% |                 89% |
| USDA Survey / FNDDS |        81 |            23 |          3.5 |                   7% |                  9% |
| CIQUAL 2025         |        53 |            26 |          2.0 |                 100% |                 16% |
| USDA Foundation     |        15 |            10 |          1.5 |                 100% |                 80% |
| Matvaretabellen     |        21 |            15 |          1.4 |                  95% |                  4% |

SR Legacy's 21.3 is inflated: it files New Zealand beef under a country rather than a cut, so 74 rows collapse into one bucket that the shipped rename splits back out. Read 12.7 as the honest USDA figure and 21.3 as an artefact of the rule.

## 6. Does any schema separate a food from its preparation?

**No candidate hangs forms off one food. Three carry a preparation _label_ on a separate record, and two publish preparation _factors_ as a separate table. Nothing collapses a cross-product.**

### 6.1 A preparation label, on a record that is still its own row

**Fineli** is the strongest case and it is worth stating precisely because it is so close. `food.csv` carries a first-class `PROCESS` column on all 4,238 rows, against an 18-value controlled vocabulary in `process_EN.csv` — `Baked in oven`, `Boiled`, `Boiled, drained`, `Canned`, `Dried`, `Fried`, `Frozen`, `Grilled, broiled`, `Mashed`, `Roasted`, `Salted`, `Smoked`, `Soured`, `No treatment`, `Not specified`, `Industrial`, `Mixed`, `Seniprepared` — beside an `EDPORT` edible-portion percentage. 2,903 of 4,238 rows carry a process other than `No treatment` or `Industrial`.

And it does not collapse anything. `BEEF ROUND`, `BEEF CHUCK`, `BEEF KNUCKLE`, `BEEF BRISKET`, `BEEF SIRLOIN`, `BEEF FLANK` are six separate records all reading `PROCESS = No treatment`, and `BEEF, CANNED` is a seventh with `PROCESS = Canned`. **The field labels the record; it does not hang forms off a food.** One row per cell of the cross-product, with the cell's coordinates now machine-readable.

**Matvaretabellen** does the same through LanguaL. 1,853 of 2,121 rows carry LanguaL codes, including facet **F** (extent of heat treatment, 6 distinct codes) and facet **G** (cooking method, 22 distinct codes) on 1,853 and 1,894 rows. `Beef, rib-eye steak, raw` is `G0003 F0003`; `Beef, minced meat, fried without fat` is `G0006 F0014`. Separate `foodId`s, machine-readable preparation.

**Frida** does it through EFSA FoodEx2, on **1,390 of 1,390** rows: `Apple, raw, all varieties` is `A01DJ#F20.A07RH$F20.A07QH$F26.…`, where `F20` is the process facet — present on 603 rows.

**CIQUAL, CoFID, CNF, AFCD, NEVO, SR Legacy and Foundation carry no preparation field at all.** CIQUAL's `ALIM` record is `alim_code`, `alim_nom_fr`, `alim_nom_eng`, `alim_nom_sci`, three group codes and a Jones factor; its `COMPO` record is `alim_code`, `const_code`, `teneur`, `min`, `max`, a confidence code and a source code. CoFID's food sheet is `Food Code`, `Food Name`, `Description`, `Group`, `Previous`, `Main data references`. In all seven, preparation lives inside the name string, exactly as it does for us.

### 6.2 A preparation factor, published as its own table — and the one that is already ours

This is the finding that bears on the prototype.

**USDA Table of Nutrient Retention Factors, Release 6** (ARS, December 2007) is **270 rows** of `retention code | food group | FOOD,PREPARATION | 26 nutrient retention percentages`, across 13 food groups: `0101 01 EGGS,BAKED`, `2152 01 MILK,HEATED APPROX 30MIN`, `0864 05 CHICKEN,REHEATED`, `3751 11 TOMATOES,BOILED/BAKED`, `2755 15 SHELLFISH,WO/SHELL,FRIED,WO/COATING`.

**FNDDS already references it.** Every FNDDS record but one carries `inputFoods` (5,431 of 5,432); each entry holds an `ingredientCode` — which _is_ an `ndbNumber` — and a `retentionCode`. **Every retention code sampled out of FNDDS resolves to a row of Release 6**: `101`, `2152`, `864`, `3751`, `2755`, `2309`, `1654`, `1709`, `3776`, checked one by one. 1,436 FNDDS records carry at least one non-zero retention code; 1,602 have exactly one input food, which is the "one food, one preparation" case.

**USDA Table of Cooking Yields for Meat and Poultry** (ARS, December 2012) is **170 rows** keyed on `ndbNumber` — the identifier ADR-0045 §2 already joins Foundation to SR Legacy on — carrying a yield percentage, an n, an SD, a min and max, a moisture gain/loss and a fat gain/loss per cut × method. One row reads: `13 | 13806 | Beef, brisket, flat half, separable lean and fat, trimmed to 1/8" fat, all grades | Braised | 69% | n=20 | SD 3.0 | 65–76 | −25.0 | −10.2`. **169 of its 170 NDB numbers resolve against SR Legacy's 7,793 records.**

**FAO/INFOODS publishes the same architecture.** The Western African Food Composition Table 2019 workbook carries the composition table and then, as separate sheets, `07 Yield factors, sing_ing` (448 non-empty rows of `code | food name | yield factor | source`) and `08 Retention factors` (72 non-empty rows of `food | processing | per-nutrient factor`). Both cite Bognár (2002) and USDA's Release 6 as their sources, which is the same two tables again.

So the shape "one food, forms behind it, a factor per form" is not something a composition table ships. **It is something the discipline publishes beside the composition table, and USDA's version of it is public domain and already keyed to the identifiers in our corpus.** That is a materially better position than the prototype would be in if the answer had been "only CIQUAL does this".

## 7. Household portions, re-priced

The shipped corpus carries a household portion on **4,028 of 4,238 rows (95%)**, 912 distinct labels, 1.83 portions per row, led by `3 oz` (1,309), `1 cup` (646), `4 oz` (610), `1 oz` (442), `1 steak` (275).

| Source              | rows with a portion |                            | notes                                                                            |
| ------------------- | ------------------: | -------------------------: | -------------------------------------------------------------------------------- |
| USDA Survey / FNDDS |               5,432 |                   **100%** | `foodPortions`, `portionDescription`                                             |
| CNF 2026            |               5,993 |                   **100%** | 29,868 conversions over 1,496 measure names                                      |
| USDA SR Legacy      |               7,533 |                        96% | `foodPortions`                                                                   |
| **USDA shipped**    |           **4,028** |                    **95%** | what ships today                                                                 |
| Matvaretabellen     |               1,815 |                        85% | 35 names, 1.45/food: `decilitre`, `portion`, `pcs`, `slice`, `glass`             |
| USDA Foundation     |                 285 |                        78% |                                                                                  |
| **CIQUAL 2025**     |               **0** |                   **none** | no portion field in `ALIM` or `COMPO`                                            |
| **CoFID 2021**      |               **0** |                   **none** | no portion sheet in the workbook                                                 |
| NEVO 2025 v9.0      |                   0 |                       none | its `Quantity` column is the basis — `per 100g` on 2,275 rows, `per 100ml` on 53 |
| Livsmedelsdatabasen |                   0 |                       none |                                                                                  |
| Fineli Rel 20.0     |                   0 | none in the package parsed | `foodunit`/`foodaddunit` tables exist and were not measured (§9.2)               |
| Frida 6.1           |                   0 |                       none |                                                                                  |
| AFCD Release 3      |                   0 |                       none |                                                                                  |

ADR-0045 priced CIQUAL's lack of portions as one bullet among several. The parent map is right that it is bigger than that: **the two candidates that beat USDA on granularity are the two that ship no portions at all.** Every row CIQUAL saves us by not permuting a cut costs a row that cannot answer "how much is one of these?".

Two candidates do ship portions and are not otherwise credible on this axis: **CNF at 100%**, which is the most permuted table measured (§4), and **Matvaretabellen at 85%**, which is 2,121 rows — half our corpus — with Norwegian supply behind it.

## 8. What granularity costs to fix inside USDA

Two crude drop rules over the shipped corpus, stated as regexes over the description and applied in order. Neither is proposed as the membership rule; they exist to price the _shape_ of the fix.

1. Drop every row naming a cooking method (`cooked|braised|broiled|roasted|baked|grilled|fried|pan-fried|pan-broiled|stewed|simmered|steamed|boiled|microwaved|sauteed|toasted`).
2. Then drop every row naming a trim or a grade (`trimmed to|separable lean|all grades|choice|select|prime|marble score`).

|                             |      rows | head phrases | rows/head | `beef` |
| --------------------------- | --------: | -----------: | --------: | -----: |
| shipped, as generated       |     4,238 |          512 |      8.28 |    949 |
| minus every cooking method  |     2,468 |          499 |      4.95 |    410 |
| and minus every trim/grade  | **1,851** |      **499** |  **3.71** | **38** |
| CIQUAL 2025, for comparison |     3,484 |        1,744 |      2.00 |     53 |

**949 to 38 on the head that produced the map, past the best alternative, at a cost of 13 head phrases out of 512.** The 1,851 rows independently corroborate the parent map's "crude three-rule cut: 4,238 → 1,873" by a different route.

The residual 3.71 against CIQUAL's 2.00 is honest and worth keeping in view: dropping cooked and trimmed rows fixes the meat heads and leaves the rest of the corpus permuting on axes these two rules do not name. It does not follow that a third rule reaches 2.00, and this note does not claim it. What it shows is that the axis USDA is an outlier on is the axis that a filter removes, and that removing it overshoots the challenger on the case that mattered.

## 9. Licence, English names, currency, size

| Source              | licence                                                                                                    | English names                             | current as of                                                         | distribution                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| USDA (all datasets) | US-government work, no stated terms                                                                        | native                                    | SR Legacy **frozen 2018-04**; Foundation 2026-04-30; FNDDS 2024-10-31 | bulk JSON zips, mirrored        |
| CIQUAL 2025         | **Etalab 2.0**, read out of the Dataverse API                                                              | **3,484 / 3,484 = 100%**                  | **2025-11-19**, from the API's `releaseTime`                          | 8 files, 82.1 MB, DOI-versioned |
| CoFID 2021          | OGL v3.0                                                                                                   | native                                    | **2021-03-19**, frozen                                                | one 4.6 MB xlsx                 |
| Matvaretabellen     | **NLOD 2.0**, Mattilsynet                                                                                  | 2,121 / 2,121 via the `/api/en/` endpoint | file served with `last-modified: 2026-08-28`; annual January release  | JSON/EDN API, CORS-open         |
| Livsmedelsdatabasen | see note #108                                                                                              | 2,606 / 2,606 via `sprak=2`               | **every record stamped 2026**                                         | JSON API                        |
| Fineli Rel 20.0     | **CC BY 4.0**, stated in the package's own `descript.txt`                                                  | `foodname_EN.csv`, all rows               | Release 20.0 — **a mirror, two to three releases behind live** (§2.1) | CSV zip                         |
| CNF 2026            | OGL-Canada                                                                                                 | `Food_Description_EN`                     | 2026 release                                                          | 26.7 MB zip                     |
| Frida 6.1           | CC BY 4.0 on DTU Data; attribution terms restated in the workbook's own Readme                             | `FoodName` column                         | **version 6.1**, Readme says May 2026, DTU landing page 2026-06-09    | 12.6 MB xlsx                    |
| AFCD Release 3      | CC BY-SA 3.0 AU, carried from note #108 — **no licence statement was found on the data-files page itself** | native                                    | Release 3, page updated 2025-12-23                                    | 1.1 MB xlsx                     |
| NEVO 2025 v9.0      | conditions-of-use PDF shipped inside the zip; not a standard open licence                                  | **2,328 / 2,328 = 100%**                  | **NEVO-online 2025, v9.0**                                            | 27.7 MB zip                     |

Livsmedelsdatabasen is the one pleasant surprise on this axis. Note #108 rostered it as "Swedish naming"; the API takes a `sprak=2` parameter and returns **English names on all 2,606 records** (`Beef tallow`, `Pork lard 85% fat`), and every record carries a `version` stamp in 2026. It is out on other grounds — 2,606 rows, no portions, 1,717 analysed against 889 calculated — but the "Swedish naming" objection is not one of them.

**The staleness of what we ship should be priced honestly and does not reverse anything.** 3,972 of the shipped corpus's 4,238 rows (94%) are SR Legacy, whose final release was 2018-04 and which USDA has discontinued. Five candidates are genuinely more current — CIQUAL 2025-11, Frida 6.1, CNF 2026, NEVO 2025, Livsmedelsdatabasen 2026 — and none of them is more current _and_ better on granularity _and_ carries portions. Currency is a real deficit with no candidate that repairs it without opening two others.

### 9.1 Two doors note #108 recorded as shut are open, and neither changes the answer

**NEVO is downloadable, and #108's "request form, terms too unclear to bundle" understates the gate while getting the terms right.** The form is a Drupal webform with a single "I agree" checkbox — no email, no approval, no wait — and the file it leads to needs no cookie, no referer and no prior agreement: `rivm.nl/sites/default/files/2026-06/NEVO2025_v9.0.zip` returns 200 and 27,727,760 bytes against a clean cookie jar. It is **NEVO-online 2025 v9.0**, 2,328 foods, English names on every one, and it is measured throughout this note. What #108 said about its _terms_ stands, and is why it still does not become a candidate: the licence is a conditions-of-use PDF inside the archive rather than a standard open licence, and a table we cannot confidently redistribute cannot be bundled into a PWA. On granularity it is unremarkable — 75 `beef` rows, 65 of them naming a preparation.

**EuroFIR is not strictly members-only.** #108 called it "a directory, not a runtime source"; the runtime half of that is right and the membership half is not the whole picture. FoodEXplorer's main surface — the 40 European tables — is members-or-pay-per-view and `/foodexplorer/` redirects to `login2.php`. But EuroFIR's own tools page states that since 2019 it has provided _"Open Access (Members and non-Members) datasets"_ for several ODA-recipient countries, and that path exports without a login. The artifact is genuine and I have read it: an OLE2 workbook titled `FoodEXplorer_Export`, author `EuroFIR`, created 2026-08-28, holding rows like `PK Pakistan | 0169889 | Butter milk | Lassi | MILK, MILK PRODUCT OR MILK SUBSTITUTE | ASH | 0.2 g | Food Composition Table for Pakistan | 2001-01-01`.

Three things stop it being a candidate, and the paywall is none of them:

1. **The open subset is eight non-European tables** — Australia, Iran, Iraq, Kuwait, Morocco, Pakistan, South Africa, Tunisia. No European table is reachable without membership, which removes the only reason a UK app would look at EuroFIR at all.
2. **The export is long format, one row per food × component.** A two-food export is 115 rows. It is a query result, not a table.
3. **It is a query surface, so ADR-0045's no-backend constraint bites before quality does.** There is nothing to bundle.

**I could not reproduce the search from my own session** — `foodgroups.php` returned the same 10,042-byte marketing landing page for every query I posted, where the identical sequence had returned 215,140 bytes of results earlier the same day. Read the eight-country roster as reported rather than as re-derived here; the export file is the part verified directly.

### 9.2 What was genuinely not measured

- **Live Fineli.** Cloudflare's managed-JS challenge was not beaten and the current release was not obtained (§2.1). Every Fineli figure is Release 20.0 from a mirror.
- **Fineli's `foodunit` / `foodaddunit` tables** were present in the package and not parsed, so its portion coverage is recorded as "none in the package parsed" rather than as zero. It does not move the ranking: the two candidates ahead of Fineli on granularity ship no portions either.
- **CIQUAL's `compo` file** (69.2 MB) was inspected by ranged request for its record shape and not downloaded in full. The granularity question is answered by the food list; the completeness question is ADR-0045's, which this note does not reopen.
- **The FAO/INFOODS specialist compilations** — uFiSh, uPulses, AnFooD, BioFoodComp, PhyFoodComp, the Density database — were downloaded and are not on the roster and not counted. They are single-food-group research compilations rather than base-food tables, which is what #108 §3.3 already said. Only WAFCT 2019 is read, and only for its factor sheets (§6.2).

## 10. Where the evidence points

**USDA stays.** Not because it is good at granularity — it is the worst table measured, by four-fold — but because:

1. **No table on the roster solves the problem.** Zero of ten roster terms answers with one row in any of thirteen distributions. A swap trades one cross-product for another.
2. **Our version of the problem is removable and theirs is not.** Two regexes take `beef` from 949 to 38 while keeping 499 of 512 head phrases. Nothing takes CIQUAL's folate from 43% to 88% or gives it a portion.
3. **The best challenger is worse on two roster words**, and one of them — `milk` at 288 rows, mostly cheeses — imports a search hazard of the shape we are already fixing.
4. **The two challengers that beat us on granularity are the two that ship no portions**, which is 95% of our rows and the app's answer to "how much is one of these?".
5. **ADR-0045 §5 still binds.** A second table enters as a whole-food alternative with its own entity prefix or not at all. Nothing here argues for a fill, and §9's variance table in note #108 still argues against one.

**The head-phrase adjudication work in #186 is unblocked.** No verdict adjudicated against a USDA description is at risk from a table swap, because there is no swap to make.

**One thing is handed forward rather than closed.** §6.2's factor tables are a live input to the forms prototype, and they are stronger than the prototype's premise assumed: USDA publishes 270 retention classes over 26 nutrients and 170 `ndbNumber`-keyed cooking yields, FNDDS already cites the retention codes on 1,436 of its records, and 169 of 170 yield keys join to SR Legacy. If a reference food is ever to carry forms, the factors are public domain and already speak our identifier. That is a finding about _what is available_, not a recommendation to build it.

## Caveat

Rule A depends on a table using USDA's comma grammar; Livsmedelsdatabasen and NEVO do not use it, so their Rule A rows are blank rather than zero and their apparent 1.00 rows-per-head is punctuation, not granularity — §5 reads their rows directly instead, and they permute like everything else. The "distinct cuts" figure in §5 takes the second comma-separated field as the cut, which is crude enough that SR Legacy's 21.3 is a known artefact of one country name; the direction it reports is not in doubt but the second decimal is meaningless. §8's two regexes are priced as a shape, not proposed as a rule — the word lists were written before the counts were read, but they were written by hand and a different hand would move the numbers. Portion coverage is measured as "the record carries at least one portion", not as "the portion is useful"; CNF's 100% covers 1,496 measure names including `1 lobster (900 g)`. Fineli is a mirrored Release 20.0 and its live release was not obtained. EuroFIR's open-access roster is reported rather than re-derived (§9.1). Licence and currency rows read from a distribution's own file — CIQUAL's Dataverse metadata, Fineli's `descript.txt`, Frida's Readme, Matvaretabellen's `last-modified` header — are primary; the rest are carried from note #108 and are not re-derived. Nothing in this note re-measures micronutrient completeness: ADR-0045's figures stand as its amendments left them, and the parent map rules that out of scope.
