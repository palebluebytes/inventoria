# Research: candidate reference sources for base-food composition (#108)

**Sibling:** [#107](https://github.com/palebluebytes/inventoria/issues/107) — merge the discarded USDA Foundation/SR Legacy twin instead of throwing its nutrients away.
**Grounds:** `searchFdc` / `mapFdcFoodToPayload` in `src/lib/food/usda-fdc.ts`; [ADR-0042](../adr/0042-usda-search-reference-foods.md) (USDA search returns base ingredients), [ADR-0030](../adr/0030-expanded-food-twin-source-data.md) §5 (dedup, portions), [ADR-0034](../adr/0034-label-photo-food-capture.md) §8 (OFF is the barcode path).
**Date:** 2026-08-18. Figures marked _measured_ were computed that day from the primary distribution named (complete datasets, not samples, unless a sample size is given); figures marked _read_ come from the cited page. **Status:** research only — no code, no ADR.

---

## 1. Recommendation

**Stay on USDA as the single composition authority. Fix it (#107) rather than replace it. Do not adopt a second table now.**

The reasoning is one measurement. SR Legacy — the dataset we currently _discard_ on every collision — carries fibre on **92%** of its 7,793 foods, energy on 100%, calcium and sodium on 98%, vitamin C on 94%, saturated fat on 95%. That is not a weak table; it is comparable to CIQUAL (fibre 97%) and far ahead of CoFID (AOAC fibre 51%). The blueberry that started this had its fibre inside USDA the whole time. Once #107 lands, the residual gap is narrow enough that no second table pays for itself:

- one methodology per food, so no cross-table blending and no two-blueberries problem in search;
- USDA is the only candidate that ships **household portions** (`foodPortions`), which the app already consumes;
- it is a US-government work with no licence terms to propagate, versus ODbL share-alike (OpenNutrition), CC BY-SA (Australia) or per-screen attribution demands;
- ADR-0042's brand/processed/prepared filters and ranking are tuned to USDA's description grammar — a table swap discards that work.

Escalation path, in the order I would take it, only if a real complaint appears:

1. **Distinguish "not reported" from zero in the panel.** Independent of source, and the residual after #107 is exactly this: a genuinely unmeasured nutrient renders as absent and contributes a silent zero to the day's meter.
2. **If keyless/offline matters** (no API key, no hourly quota, works on a plane), _bundle USDA itself_ before importing a foreign table: Foundation + SR Legacy trimmed to a 21-nutrient panel is **361 KiB gzipped** for 8,187 foods (_measured_), and USDA publishes bulk JSON/CSV (Foundation 459 KB zipped, SR Legacy 12.3 MB zipped, latest release April 2026). Same data, same naming, no new provenance story.
3. **If UK naming is the complaint** (courgette, aubergine, swede, rocket), the fix is a **synonym layer over USDA search**, not a table swap. Seed it from CoFID's names (OGL, no share-alike) rather than OpenNutrition's (ODbL).
4. **Only if we want a genuinely independent second opinion per food** — for example to flag a USDA outlier — adopt **CIQUAL** as a whole-food alternative record with its own entity prefix and source tag, never as a per-nutrient fill.

## 2. What the axes are, and why

Inventoria is a local-first browser PWA with **no backend**. That eliminates whole classes of candidate before quality is even discussed:

| Axis                                | Why it decides things here                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Licence + redistribution**        | A bundled table ships inside the app; a stored twin arguably makes our ledger a derivative database. Public-domain / OGL / Etalab / CC BY are fine; ODbL and CC BY-SA propagate; "free for personal use" is out. |
| **Attribution burden**              | Some licences demand per-screen credit, which is a permanent UI tax, not a one-line legal note.                                                                                                                  |
| **Delivery: bundle vs runtime API** | No backend means no server-side key and no proxy. A runtime API must be CORS-open; a bundled table sidesteps CORS, keys, quotas and offline entirely.                                                            |
| **Bundle size**                     | Installed PWA on a phone: a trimmed table wants to be ~100–400 KiB gzipped.                                                                                                                                      |
| **Measured completeness**           | The ADR-0030 panel wants macros + fibre + twelve micronutrients. A table that omits half of them recreates the problem.                                                                                          |
| **Traceability**                    | Every twin carries `twin/raw_provenance` and shows a source tag (`src/lib/food/food-source.ts`). A value that cannot be traced to a measurement cannot be defended to the user.                                  |
| **Household portions**              | `food/portions` comes free from the FDC detail endpoint. Most national tables ship none.                                                                                                                         |
| **Update cadence**                  | A table frozen years ago ages into wrongness quietly.                                                                                                                                                            |
| **Regional fit**                    | UK user: food supply and naming matter for search, though raw-ingredient composition varies less by country than branded products do.                                                                            |

## 3. The full roster

Compiled against the [FAO/INFOODS](https://www.fao.org/infoods/infoods/tables-and-databases/en/) and [EuroFIR](https://www.eurofir.org/food-information/food-composition-databases/) directories so the list is not just the anglophone ones.

### 3.1 Inside USDA FoodData Central (already integrated, already keyed)

| Dataset                      | Size                                                                                            | Character                                                                         | Verdict                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| **SR Legacy**                | **7,793** (_measured_)                                                                          | Frozen 2018-04, but a full ~100-nutrient profile per food                         | The workhorse; #107's fill source               |
| **Foundation**               | **394** (_measured_)                                                                            | New assays, published as measured — thin: fibre 54%, vitamin A 12%, B12 18%       | Keep as the base record; do not trust alone     |
| **Survey (FNDDS 2021-2023)** | ~5,600 (_read_)                                                                                 | All 65 nutrients on every record (USDA imputes the gaps); good household portions | Rejected as a fill source — see below           |
| **Branded**                  | ~1.9M (_read_)                                                                                  | Label transcription                                                               | Out: that is the barcode path (ADR-0034)        |
| **Experimental**             | small                                                                                           | Research samples                                                                  | Out                                             |
| **Bulk download**            | Foundation 459 KB zip; SR Legacy 12.3 MB zip; full CSV 460 MB zip (_read_, April 2026 releases) | The same data, offline                                                            | **The bundling option — recommendation step 2** |

**Why FNDDS is not the fill source.** _Measured:_ its detail record links to the SR lineage via `inputFoods[].ingredientCode` (= `ndbNumber`), so the join is principled. But on a 14-food sample of the Foundation records missing fibre, a single-ingredient FNDDS counterpart resolved for **7** — the same population the SR twin already covers — and **every fibre value it returned was identical to the SR twin's** (2.4, 2.5, 2.1, 1.6, 2.1, 34.4, 0.5). It costs a search plus a detail fetch per food to reach data already sitting in the response we discard. Its real advantage is portions. It also settles an argument inside #107: FNDDS states **64 kcal with fibre 2.4 g** for blueberries — USDA itself pairs the newer Foundation energy with the older SR fibre.

### 3.2 National composition tables

| Table                                                                                                                                                                 | Country     | Foods                                    | Licence                                                          | Delivery                                                  | Verdict                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **CIQUAL 2025**                                                                                                                                                       | France      | **3,484** / 74 constituents (_measured_) | Etalab 2.0 (~CC BY)                                              | XML + Excel, DOI-versioned                                | **Best of the non-USDA field** — §6                                                  |
| **CoFID 2021**                                                                                                                                                        | UK          | **2,887** (_measured_)                   | OGL v3.0                                                         | 4.6 MB xlsx                                               | Sentimental favourite, weakest data — §7                                             |
| **Fineli**                                                                                                                                                            | Finland     | 4,232 / 55 (_read_)                      | **CC BY 4.0**                                                    | CSV                                                       | Cleanest licence; Finnish supply; untested                                           |
| **Livsmedelsdatabasen**                                                                                                                                               | Sweden      | ~2,500 (_read_)                          | CC BY 4.0, with an odd "data may not be modified" note           | **JSON API**                                              | Swedish naming; the no-modification note conflicts with bundling                     |
| **Matvaretabellen**                                                                                                                                                   | Norway      | —                                        | Norwegian open data (_unverified_)                               | **JSON API**, 5 endpoints                                 | Norwegian naming; untested                                                           |
| **Frida 5.5** (Dec 2025)                                                                                                                                              | Denmark     | >1,000 (_read_)                          | Free, credit on each display                                     | Download + API                                            | Too small for a base table                                                           |
| **Swiss FCDB**                                                                                                                                                        | Switzerland | —                                        | Free incl. commercial, attribution (_read_)                      | Web-service API, 4 languages                              | _Measured:_ no CORS header on the site; API unprobed                                 |
| **CNF**                                                                                                                                                               | Canada      | —                                        | OGL-Canada                                                       | JSON/XML API, _measured_ `Access-Control-Allow-Origin: *` | The only national table directly browser-fetchable; largely USDA-derived             |
| **NEVO**                                                                                                                                                              | Netherlands | —                                        | Free download, redistribution unclear                            | Request form                                              | Terms too unclear to bundle                                                          |
| **AFCD**                                                                                                                                                              | Australia   | 1,588 / up to 268 nutrients (_read_)     | **CC BY-SA 3.0 AU** + "may not be appropriate outside Australia" | Excel                                                     | Out: viral share-alike, and the geography note argues against UK use                 |
| **BLS**                                                                                                                                                               | Germany     | —                                        | **Paid licence**                                                 | —                                                         | Out                                                                                  |
| **BEDCA** (ES), **TBCA/TACO** (BR), **MEXT** (JP), **IFCT** (IN), **BDA** (IT), **FOODfiles** (NZ), **Tzameret** (IL), **TürKomp** (TR), **Taiwan** (updated 2026-06) | —           | —                                        | mixed                                                            | mixed                                                     | Rostered, not evaluated: no regional fit and no licence advantage over the shortlist |

### 3.3 Aggregators, directories, derived datasets

- **EuroFIR FoodEXplorer** — one query surface over 26+ European tables, **membership-based**. A directory, not a runtime source.
- **FAO/INFOODS** — directory plus specialist compilations (uFiSh, uPulses, biodiversity). Reference material.
- **OpenNutrition** — §5. Rejected as a composition authority.
- **Open Food Facts** — §8. Packaged food by its own documentation; already ours for barcodes.
- **Nutritics GB23** — a commercial _enhancement_ of CoFID that exists to fill CoFID's gaps. Confirms the gaps are real enough to sell against; paid, so out.
- **FooDB / Phenol-Explorer** — compound-level research databases, no Nutrition-Facts panel.

### 3.4 Commercial APIs

Nutritionix (~$1,850/mo enterprise), Edamam (free tier to $999/mo; **caching sold as a paid add-on**), FatSecret (OAuth, ~5,000 calls/day free), Spoonacular, **Nutrola** (~900k entries, free tier 500 req/day, "data cannot be bulk-redistributed without a commercial licence", AI-assisted entry), **Spike** (multi-source aggregator). All fail the same two tests before price:

1. **No backend** — OAuth flows and app secrets cannot live in a keyless client.
2. **Storage terms fight the ledger** — Inventoria persists every fetched food as an immutable twin with raw provenance. These terms license _queries_, not _retention_; the append-only ledger cannot un-store a food when a subscription lapses.

## 4. Measured completeness — the core evidence

Percentage of records in each table carrying a value for the field. Presence, not quality (see the caveat).

| Field         | USDA SR Legacy (7,793) | USDA Foundation (394) | CIQUAL 2025 (3,484) | CoFID 2021 (2,887)     |
| ------------- | ---------------------- | --------------------- | ------------------- | ---------------------- |
| Energy        | 100%                   | 81%                   | 95%                 | 98%                    |
| Protein       | 100%                   | 89%                   | 99%                 | 98%                    |
| Carbohydrate  | 100%                   | 81%                   | 97%                 | 95%                    |
| **Fibre**     | **92%**                | **54%**               | **97%**             | **51% AOAC / 84% NSP** |
| Saturated fat | 95%                    | 31%                   | 92%                 | —                      |
| Sodium        | 98%                    | 88%                   | 88%                 | —                      |
| Calcium       | 98%                    | 92%                   | 77%                 | —                      |
| Iron          | 98%                    | 92%                   | 76%                 | —                      |
| Vitamin C     | 94%                    | 29%                   | 68%                 | —                      |
| Vitamin D     | 66%                    | 13%                   | 62%                 | —                      |
| Vitamin A     | 88%                    | 12%                   | 74% (retinol)       | —                      |
| B12           | 91%                    | 18%                   | 61%                 | —                      |
| Folate        | 87%                    | 34%                   | 43%                 | —                      |

Two things fall out. **Foundation alone is the worst table in this document** — which is the entire argument for #107. And **SR Legacy beats CIQUAL on every micronutrient measured**; CIQUAL's edge is fibre and nothing else.

## 5. OpenNutrition, examined

Downloaded and parsed in full: `opennutrition-dataset-2025.1.zip`, 62,927,029 bytes, expanding to a 282 MB TSV. Everything below is _measured_ from that file.

- **326,759 rows — but 313,442 of them (96%) are `grocery`**, i.e. branded packaged products, the same territory as OFF. The generic base-food layer, `everyday`, is **5,299 rows**. As a base-food table it is smaller than CoFID.
- **Every `everyday` food carries all 90 nutrient fields.** Not most — all, including iodine, chromium, molybdenum, taurine and biotin for all 5,299 foods. No analytical table on earth has chromium for 5,299 foods. 100% completeness is the tell, not the feature.
- **36% of the generic foods cite no source at all** (1,910 of 5,299). Of the rest, 1,050 cite one database and **2,339 cite two or more** — up to five.
- **Values are blends, not measurements.** "Blueberries" cites five databases (USDA Foundation `2346411`, AUSNUT, Frida, CNF, USDA SR `171711`) and reports **56 kcal, 13.4 g carbohydrate, 2.8 g fibre, 7.3 mg vitamin C** — a figure matching _none_ of its five sources (USDA SR 57 / 14.5 / 2.4 / 9.7; Foundation 63.9 / 14.6 / absent / 8.06; CIQUAL 57.7 / 10.6 / 2.4 / 9.7). Spot-checks elsewhere land plausibly close to USDA (chia fibre 34.4 exactly; kale 4.3 vs 4.1; celery 1.5 vs 1.6; cucumber 0.8 vs 0.5) — the synthesis is sane, and unverifiable.
- **Its own methodology page** says LLMs (Claude Sonnet 3.5, o1-pro among them) "ingest, reconcile and interpret" conflicting data and "fill coverage gaps through AI inference based on ingredient analysis", audited by random sampling.
- **Unchanged since launch.** Every file in the archive is dated **2025-03-28**; the current version is still `2025.1` — seventeen months without a release.
- **Licence is the heaviest of any candidate**: ODbL with share-alike on derivative databases, plus attribution to OpenNutrition **"on every page, screen, or interface where any data is displayed"**, with consolidated attribution explicitly insufficient, plus inherited OFF attribution.

**Verdict.** A coverage product, not a reference table. It is the wrong shape (96% barcodes), the wrong provenance model (an unattributable blend where our UI promises a traceable source), stale, and the most licence-encumbered thing on the list. The one genuinely attractive asset is its `alternate_names` (five colloquial synonyms per food) and its 100%-populated `serving` field — but taking a name list would still drag ODbL along, so CoFID is the better donor for step 3 of the recommendation.

## 6. CIQUAL, examined — and yes, it is alive

Very much so, and more current than anything else in this document except USDA's own releases:

- Current release **Ciqual 2025, published 2025-11-19**, DOI-versioned on the French national research repository, licence **Etalab 2.0**. Distribution is 8 files, 78.3 MB: the same five-file XML structure as before (`alim` / `alim_grp` / `compo` / `const` / `sources`) plus `.xls`/`.xlsx` and a 4 MB documentation PDF. Downloaded and parsed here directly from the Dataverse API.
- **3,484 foods, 74 constituents** (up from 3,185 / 67 in the 2020 release), with 113,000+ new values (_read_). Release cadence is roughly five-yearly: 2016, 2017, 2020, 2025.
- **100% of foods carry an English name** (`alim_nom_eng`) — the single fact that makes a French table usable in a UK app.
- Completeness in §4: fibre 97%, energy 95%, protein 99%, but micros noticeably thinner than USDA SR (folate 43%, B12 61%, vitamin D 62%).
- **Blueberry, raw (`13028`): 57.7 kcal, 10.6 g carbohydrate, 2.4 g fibre, 9.96 g sugars, 9.7 mg vitamin C** — agreeing with USDA SR to an identical vitamin C, which suggests shared ancestry rather than independent confirmation.
- **Bundle size:** trimmed to 18 panel constituents, **932 KiB JSON / 156 KiB gzipped** for all 3,484 foods.
- Frictions: no household portions; energy needs the right kcal constituent picked out of several bases; the CIQUAL website is a JS app with no stable download URLs (use the DOI/data.gouv mirrors); and the 2020 XML was technically malformed enough to defeat a strict parser (the 2025 files parse cleanly).

## 7. CoFID, examined

Parsed from the published workbook (4,629,542 bytes, OGL v3.0, first published 2015-03-25, **last updated 2021-03-19** — and the successor host confirms 2021 is still the latest):

- **2,887 foods** across 15 sheets.
- Completeness: energy 98%, protein 98%, carbohydrate 95%, **NSP fibre 84%, AOAC fibre 51%** (471 explicit `N` = no data, 75 `Tr`, 868 blank).
- **Two fibre systems.** UK dietary advice (SACN's 30 g/day) is on the **AOAC** basis — the column with 51% coverage. Mixing the two would be a silent unit error.
- **Blueberries (`14-325`): 40 kcal, 9.1 g carbohydrate, 1.5 g fibre** — the low outlier among all five sources compared in §9.
- **Coverage gaps, by lookup:** no chia, no oat drink, no soya drink, no kefir, no miso, no sriracha. Present: quinoa, tofu, avocado (Fuerte and Hass), curly kale, edamame, halloumi.
- No household portions. Trimmed panel: **633 KiB JSON / 120 KiB gzipped**.

## 8. Open Food Facts, examined — and rejected for base foods

_Measured_ on the `en:blueberries` category (1,051 products; 300 sampled via the search-a-licious API):

- **39% carry calories, 31% carry fibre.**
- **Fibre coverage tracks the labelling regime, not the food:** US 46/111 (41%), France 15/52, Germany 8/53 (15%), Spain 6/24, UK 7/18, Switzerland 2/12. Fibre is not in the EU's mandatory "Big 7"; it is mandatory on a US Nutrition Facts panel.
- **The values are transcriptions.** Among the 72 fresh-like products (30–80 kcal) carrying fibre, values cluster on 2.4 (USDA SR's exact figure) and 2.86/2.9 (a French figure and per-serving conversions), with junk in the tail: 0, 12 and 50 g per 100 g.
- **The category is not the food** — it also holds dried and sweetened products up to 351 kcal, with no `dataType` equivalent to filter on.
- **OFF says so itself:** its help centre states it "contains only information about packaged food" and lists 17 national composition databases for everything else.

## 9. Cross-table variance — what constrains any adoption

Raw blueberries, per 100 g:

| Source                          | kcal                         | Carbohydrate | Fibre        |
| ------------------------------- | ---------------------------- | ------------ | ------------ |
| CoFID 2021 (`14-325`)           | **40**                       | 9.1 g        | 1.5 g        |
| USDA SR Legacy (`fdc:171711`)   | 57                           | 14.5 g       | 2.4 g        |
| CIQUAL 2025 (`13028`)           | 57.7                         | 10.6 g       | 2.4 g        |
| USDA Foundation (`fdc:2346411`) | 63.9 general / 57.4 specific | 14.6 g       | not measured |
| USDA FNDDS (`fdc:2709275`)      | 64                           | —            | 2.4 g        |
| OpenNutrition (`Blueberries`)   | 56                           | 13.4 g       | 2.8 g        |
| OFF, fresh-like median (n=72)   | ~53                          | ~12.1 g      | ~2.9 g       |

Consequences:

1. **Never fill nutrient-by-nutrient across tables.** A panel of CoFID energy and USDA fibre describes no food that exists. (#107's fill is defensible precisely because both records are USDA's account of one `ndbNumber` food.)
2. **A second table must be a whole-food alternative** — its own entity prefix (`ciqual:`, alongside `fdc:` and `gtin:`), its own provenance, its own source tag, which `food-source.ts` models as a one-line addition.
3. **Two tables mean two blueberries in search results**, which is a ranking and UI problem, and the main hidden cost of adopting anything.

## Caveat

Completeness percentages describe the presence of a value, not its quality or currency: CoFID's 98% energy coverage includes analyses from the 1980s, and CIQUAL's 97% fibre includes values borrowed from other national tables. Where two tables agree closely (CIQUAL and USDA on blueberries, to an identical vitamin C) that is usually shared ancestry, not independent confirmation. The Nordic, Dutch, Italian, Spanish, Brazilian, Japanese, Israeli, Turkish, NZ and Taiwanese tables were rostered but not measured; Fineli and Matvaretabellen are the two most likely to repay the effort if the shortlist is ever reopened. USDA's own licence terms are not stated on its download page — it is a US-government work with a requested citation, which is why this document treats it as the least encumbered rather than as formally CC0.

## Correction (2026-08-18): Foundation carries 363 records, not 394

The Foundation count in §3.1 and in the §4 table header — **394**, marked _measured_ — does not describe the distribution this document names. Re-measured from the bulk archive itself (`FoodData_Central_foundation_food_json_2026-04-30.zip`, sha256 `186e988e…`, streamed through `scripts/usda-archive.mjs`): the `FoundationFoods` array holds **395 entries, of which the last 32 are literally `null`**, leaving **363 real records**. The array length is not the record count, and neither number is 394. The other two counts re-measure exactly as stated: SR Legacy 7,793, Survey 5,432.

Which population the 394 came from cannot be reconstructed from what is written here, and it is not reproducible from the archive, so figures derived from it are carried over rather than restated: the Foundation column of §4, and in [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) both the 184-untwinned / 210-paired split and the 8,187-food bundle total, which sum to 394 and to 394 + 7,793 respectively. Read them as approximate on the Foundation side until they are re-derived. Both records now carry the correction, as does [ADR-0042](../adr/0042-usda-search-reference-foods.md) §6, whose "Foundation alone is ~400 records" was the same number rounded.

Nothing in §1's recommendation moves. Foundation was already the thinnest table in the document and is kept as the base record rather than trusted alone; being 8% smaller than stated argues the same way. What the error did reach is the bundling estimate in recommendation step 2, which is now over 8,156 foods rather than 8,187.

The number is checked from now on. `pnpm usda:backup verify` measures `records` and `null_entries` out of each archive and fails when the manifest disagrees, so a release cannot drift the figure unnoticed again — see [how to back up the USDA datasets](../how-to-back-up-the-usda-datasets.md).

## Correction (2026-08-19): the USDA columns of the completeness table, re-measured

The correction above fixed the record count and stopped there, leaving §4's Foundation column carried over rather than re-derived — its 394-record population is not reproducible from the distribution this document names. Both USDA columns are now re-measured from the mirrored bulk archives, which is the population that will actually ship: `FoodData_Central_foundation_food_json_2026-04-30.zip` (**363 records**, the 32 `null` slots excluded) and `FoodData_Central_sr_legacy_food_json_2018-04.zip` (**7,793 records**). `pnpm usda:backup verify` proves both are the bytes the manifest describes; `pnpm usda:coverage` (`scripts/usda-coverage.mjs`) produced everything below.

**The presence rule.** A record reports a field when its `foodNutrients` array carries an entry under one of the FDC nutrient ids that field is served by, with a non-null `amount`. A reported zero counts as a value. The id list is the app's own (`PANEL_FIELDS` in `src/lib/food/usda-fdc.ts`, [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) §3), so this measures what the panel can fill, not what a single assay id happens to be called.

| Field         | USDA SR Legacy (7,793, re-measured) | USDA Foundation (363, re-measured) | CIQUAL 2025 (3,484, carried over) | CoFID 2021 (2,887, carried over) |
| ------------- | ----------------------------------- | ---------------------------------- | --------------------------------- | -------------------------------- |
| Energy        | 100%                                | 88%                                | 95%                               | 98%                              |
| Protein       | 100%                                | 97%                                | 99%                               | 98%                              |
| Carbohydrate  | 100%                                | 88%                                | 97%                               | 95%                              |
| **Fibre**     | **93%**                             | **56%**                            | **97%**                           | **51% AOAC / 84% NSP**           |
| Saturated fat | 96%                                 | 29%                                | 92%                               | —                                |
| Sodium        | 99%                                 | 92%                                | 88%                               | —                                |
| Calcium       | 99%                                 | 97%                                | 77%                               | —                                |
| Iron          | 99%                                 | 97%                                | 76%                               | —                                |
| Vitamin C     | 94%                                 | 31%                                | 68%                               | —                                |
| Vitamin D     | 67%                                 | 14%                                | 62%                               | —                                |
| Vitamin A     | 89%                                 | 14%                                | 74% (retinol)                     | —                                |
| B12           | 91%                                 | 18%                                | 61%                               | —                                |
| Folate        | 88%                                 | 34%                                | 43%                               | —                                |

**Only the two USDA columns were re-measured.** CIQUAL and CoFID stand exactly as §4 printed them: re-measuring either means re-downloading a distribution, and nothing here casts doubt on them. Read this table as two re-derived columns beside two inherited ones, not as a uniformly restated §4.

**What moved.** SR Legacy lands within a point of §4 everywhere, as it should: that column was measured over the same 7,793 records all along. Foundation rises across the board — protein, calcium and iron from 89/92/92% to 97%, energy and carbohydrate from 81% to 88%, vitamin A from 12% to 14%, fibre from 54% to 56% — mostly because the old denominator was 8% larger. The numerators do not reconcile under either denominator, which is the same finding as the correction above: the 394-record population was a different set of foods, not the archive's with padding.

**Which ids count is the choice that matters.** Counting a field present under **any** of its ids is what separates 56% fibre from **51%**: 185 Foundation records report fibre under `1079` (total dietary), 17 more report it only under `2033` (AOAC 2011.25), and the app reads either. The same choice separates 88% energy from 26%, Foundation reporting energy as Atwater factors and mostly omitting `1008`. The non-null `amount` rule changes nothing: no entry under a panel id lacks a numeric amount in either archive.

**No argument in this document moves.** Foundation is still the thinnest table here, which is the whole case for filling it from its SR Legacy twin. SR Legacy still beats CIQUAL on every micronutrient measured (vitamin C 94% against 68%, B12 91% against 61%, folate 88% against 43%), and CIQUAL's fibre edge survives at 97% against 93%. What changes is that these two columns now have a stated denominator and a rule behind them, so the "not reported versus zero" work in step 1 of §1 can be sized against a population we ship rather than one we cannot reconstruct.

**The twin pair count is settled too.** Joining the two archives on `ndbNumber` gives **190 twinned pairs**, **173 untwinned Foundation foods** (190 + 173 = 363) and **7,966 distinct foods** once the pairs merge — reproducing #111's independent build-time figure exactly, against ADR-0045's 210 and 184. That record's [amendment](../adr/0045-usda-stays-the-base-food-composition-authority.md#amendment-2026-08-18-foundation-is-363-records-not-394) now carries the corrected split.
