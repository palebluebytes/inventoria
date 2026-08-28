# Measurement: how big is a large complex meal on the wire (#199)

**Parent map:** [#185](https://github.com/palebluebytes/inventoria/issues/185) — send a meal to another person, and let your own devices converge.
**Why this exists:** [#197](https://github.com/palebluebytes/inventoria/issues/197) §5 set a 256 KiB payload ceiling and justified it as "~40× the measured worst case", inheriting [#196](https://github.com/palebluebytes/inventoria/issues/196)'s 6 KB figure. #196 varied the _kind_ of food and never the _number_, so no meal larger than three foods had ever been priced. This note prices one.
**Grounds:** the wire shape settled by ADR-0064 (`src/lib/db/ledger-export.ts`), narrowed by #197 — closure from the declared roots, winning datoms only, minus `twin/raw_provenance`, `food/label_photos` and `food/photo_base64`.
**Harness:** [`199-large-meal-harness.mts`](./199-large-meal-harness.mts).
**Date:** 2026-08-28. **Status:** measurement only — no code shipped.

---

## 1. The answer in one paragraph

**A large complex meal is 114.6 KiB raw, and the 256 KiB ceiling is 2.2× that, not 40×.** A Christmas dinner — thirty distinct foods, three cooked dishes with their frozen ingredient rows, six packaged products — costs 114.6 KiB on the wire after every one of #197's narrowings has already been applied. A sixty-food feast costs 224.0 KiB, which is 87% of the ceiling; a hundred-and-twenty-food payload exceeds it outright. The ceiling as written is therefore close enough to an honest meal to bite one. Two further facts decide what replaces it: the **Consumption Events cost more than the twins do** (45.2% of the payload against 40.0%), because `event/metrics` carries the full nutrient set and a recipe instantiation carries a frozen row per ingredient; and the binding constraint on any new ceiling is **not memory but the localStorage inbox** #197 §6 chose, whose own justification — "a payload is single-digit KB, so the ~5 MB quota is not a constraint" — is the second premise this note retires.

---

## 2. What was measured, and what was not

**Real:** every byte came from the app's own mappers over real source data. `mapIndexRowToPayload` and `completeStagedPanel` over the committed `public/usda/search-index.json` and `public/usda/nutrient-store.json`; `mapOffProductToPayload` over six live Open Food Facts v3 responses fetched for this measurement; `buildInstantiation` and `deriveIngredientMacros` over real panels; `ingestEntity` for the datoms; `datomLine` / `envelopeLine` for the wire. Values are `JSON.stringify(value)`, because that is what the ledger stores and what the export writes verbatim, so the escaping is priced rather than skipped.

**Deliberately conservative:** the USDA foods are not a typical basket. They are the corpus rows whose payloads serialise **largest**, taken in order. A ceiling that clears these cannot be beaten by an honest food. This makes every figure below an upper bound on a meal of that size, not a typical one.

**Not real:** the meals themselves. Which foods make up each one, and how many dishes, were chosen to span sizes from plausible to absurd. As with #196 this is a **rate card, not a census**.

**Not measured:** photos and `twin/raw_provenance`, because #197 §1.2 and §1.3 removed them from the wire. Their cost is #196's subject and is unchanged.

---

## 3. The measurement

Foods are distinct twins; a cooked dish contributes a `recipe:` entity and an instantiation event carrying one frozen row per ingredient.

| Case                                   | Foods | Entities | Datom lines | Raw       | Gzip     | In localStorage |
| -------------------------------------- | ----- | -------- | ----------- | --------- | -------- | --------------- |
| A normal meal                          | 4     | 8        | 48          | 13.0 KiB  | 2.5 KiB  | 15.2 KiB        |
| A cooked dinner, one dish              | 10    | 22       | 121         | 37.5 KiB  | 5.6 KiB  | 44.3 KiB        |
| **A large complex meal, three dishes** | 30    | 66       | 326         | 114.6 KiB | 12.7 KiB | 136.5 KiB       |
| An implausibly large feast, six dishes | 60    | 132      | 628         | 224.0 KiB | 23.2 KiB | 267.0 KiB       |
| Beyond any honest meal, twelve dishes  | 120   | 264      | 1250        | 433.2 KiB | 43.8 KiB | 515.3 KiB       |

The **localStorage** column is what an inbox entry actually occupies: the payload held as a JSON string value, so every quote and newline inside it is escaped a second time. It runs about 19% above the raw wire size.

**Marginal cost of one more food: 3,626 raw bytes**, taken across the 30-food and 120-food cases. That figure — a twin plus its Consumption Event — is the reusable one.

### Where a large complex meal's bytes go

| Entity kind      | n   | Total raw | Mean  | Share |
| ---------------- | --- | --------- | ----- | ----- |
| `event:consume_` | 33  | 53,043    | 1,607 | 45.2% |
| `fdc:`           | 24  | 46,951    | 1,956 | 40.0% |
| `gtin:`          | 6   | 12,991    | 2,165 | 11.1% |
| `recipe:`        | 3   | 4,230     | 1,410 | 3.6%  |

**The events are the largest line item, and this is the note's most transferable finding.** #196's rate card put an `event:consume_` at 1,376 raw against an `fdc:` twin's 2,501, which made the twins look like the thing to worry about — but that comparison was drawn before #197 stripped `twin/raw_provenance`, which was almost the whole of the twin's cost. With provenance gone, a Consumption Event carrying the full `EXTRA_NUTRIENT_KEYS` set costs more than the food it points at. A payload therefore scales with **how many times you logged something**, not with how many distinct foods are involved, and the two are equal only when nothing repeats.

`gtin:` twins remain the dearest per entity even stripped, at 2,165 mean against 1,956 — #197's "rough parity" holds, and the residue is `food/assessment` and `food/ingredients_text`.

---

## 4. What this retires

**#197 §5's "~40× the measured worst case" is wrong**, and the arithmetic was never at fault — it inherited a 6 KB figure measured over meals of one to three foods. Against a large complex meal the ceiling is 2.2×; against a sixty-food feast, 1.1×. A ceiling that refuses a meal is a cap on a meal by the back door.

**#197 §6's "the ~5 MB quota is not a constraint" holds only at a tight ceiling.** A large complex meal occupies 136.5 KiB of localStorage and a feast 267 KiB. Neither is fatal, but the claim was made on the premise of single-digit KB payloads and does not survive at a generous ceiling: the product of the ceiling and the inbox depth is what must fit, against Safari's 5 MiB per-origin floor shared with Settings and ADR-0053's capped log.

**A compression bound was not anticipated.** These payloads gzip about 9:1. #197 §5 measures the ceiling on "bytes actually received", which is right against a lying `Content-Length` but wrong against a compressing transport: 1 MiB received would decode to roughly 9 MiB.

---

## 5. What it does not settle

- **The whole-ledger figure** for the own-device half, which none of #197's narrowings reach. #196 §6's formula and its two missing counts still stand.
- **Whether a real user's meals look like these.** The foods are the widest rows in the corpus by construction, so a real Christmas dinner is smaller than 114.6 KiB, probably substantially. The number is a bound, and bounds are what ceilings are set from.
- **Nothing was built.** No transport, no inbox, no code added to the app.
