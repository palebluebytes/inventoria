# Measurement: how big is one past meal, actually (#196)

**Parent map:** [#185](https://github.com/palebluebytes/inventoria/issues/185) — send a meal to another person, and let your own devices converge. This ticket prices the payload every downstream option is judged against.
**Grounds:** the wire shape is settled — `src/lib/db/ledger-export.ts` (ADR-0064, one JSON datom per line). Every figure below is that shape, byte for byte, including the newline.
**Siblings:** [#194](https://github.com/palebluebytes/inventoria/issues/194) priced transports against _platform ceilings_ and said so explicitly, because this ticket was not yet done; its QR arithmetic can now be resolved. [#200](https://github.com/palebluebytes/inventoria/issues/200) chooses the transport. [#197](https://github.com/palebluebytes/inventoria/issues/197) decides what crosses the wire — §7 below is aimed squarely at it.
**Date:** 2026-08-28. **Status:** measurement only — no code shipped, no ADR.

---

## 1. The answer in one paragraph

**A past meal is not one size; it is three sizes, and which one you get is decided by where its foods came from.** A meal made of bundled USDA foods — the common case — is **1.3–2.2 KB gzipped**, which fits in **a single QR code** with room to spare, recipe instantiations included. Add one barcode-scanned food and the meal jumps to **22–27 KB gzipped**, an **8–10 symbol** QR chain, because the Open Food Facts adapter stores the entire API response verbatim as provenance. Add one label photo and the meal becomes **304 KB**, which gzip cannot touch (it is base64 JPEG) and which no QR chain can carry — **106 symbols** against #194's 16-symbol ceiling. The spread between the cheapest and dearest _single entity_ is **164×**. The decisive fact is that both expensive cases are **droppable without touching the meal**: strip photos and the photo meal falls to **1.2 KB, one symbol**. So the payload question is not "is a meal small enough" but "does provenance and do photos cross the wire" — and that is [#197](https://github.com/palebluebytes/inventoria/issues/197)'s decision, not the transport's.

---

## 2. What was measured, and what was not

This is an honest boundary and it matters for how far the numbers travel.

**Real:** every byte below came out of the app's own mappers over real source data. `mapIndexRowToPayload` and `completeStagedPanel` over the committed `public/usda/search-index.json` and `public/usda/nutrient-store.json`; `mapOffProductToPayload` over live Open Food Facts API responses fetched for this measurement; `buildInstantiation` over real panels; `ingestEntity` for the datoms; `datomLine`/`envelopeLine` for the wire. Values are `JSON.stringify(value)` because that is what `db.core.ts:463` stores and what the export writes verbatim — so the escaping is priced, not skipped. Photos are real product photographs put through the app's own rule (`MAX_PHOTO_EDGE` 1600, `PHOTO_QUALITY` 0.8, JPEG, base64 data URL).

**Not real:** _which_ foods make up each meal, and how many meals there are. Those were chosen to span the ticket's four cases. This is therefore a **rate card, not a census**.

**Consequence:** every per-meal and per-entity figure below stands on its own. The **whole-ledger totals do not** — §6 gives the formula and the two counts a real export would have to supply.

Method note: the closure walk follows `event/target`, `event/instantiation.based_on`, `event/instantiation.ingredients[].ref` and `recipe/ingredients[].ref`, transitively. Retracted events (`event/status: "retracted"`) are excluded, matching what `computeConsumption` shows. A "past meal" is the `(local calendar day, Meal Type)` bucket `pastMealsFor` uses.

---

## 3. The rate card — cost per entity

This is the reusable answer. Everything else is arithmetic over it.

| Entity kind                              | datoms |   raw bytes |  gzip bytes | id kind     | what makes it that size                                  |
| ---------------------------------------- | -----: | ----------: | ----------: | ----------- | -------------------------------------------------------- |
| `food:custom_` (label-captured, 1 photo) |    5.0 | **411,070** | **309,730** | **minted**  | the photo, stored **twice** — see §7.2                   |
| `gtin:`                                  |    7.5 | **144,750** |  **23,904** | **derived** | `twin/raw_provenance` — the whole OFF response, verbatim |
| `fdc:`                                   |    6.1 |       2,501 |         331 | **derived** | ADR-0047 §7 made the bundled row its own provenance      |
| `event:consume_`                         |    5.1 |       1,376 |         171 | **minted**  | mostly `event/metrics`, the frozen breakdown             |
| `recipe:`                                |    4.0 |       1,165 |         414 | **minted**  | name, yield, ingredient refs, instructions               |

**A `gtin:` twin costs 58× an `fdc:` twin. A photo'd `food:custom_` costs 164×.**

---

## 4. Per-meal closures

Gzip is level 6. The QR column uses #194's figures: 2,953 bytes per v40-L symbol, 16 symbols maximum in a Structured Append chain (~47 KB).

| Day        | Meal      | Cases                  | Ents | Datoms |     Raw |    Gzip | Raw −photos | Gzip −photos | QR symbols | QR −photos |
| ---------- | --------- | ---------------------- | ---: | -----: | ------: | ------: | ----------: | -----------: | ---------: | ---------: |
| 2026-08-12 | lunch     | fdc+custom+photo+label |    4 |     21 | 416,533 | 310,942 |       6,305 |    **1,222** |  **106** ✗ |      **1** |
| 2026-08-11 | snack     | gtin                   |    2 |     12 | 168,162 |  26,993 |     168,162 |       26,993 |     **10** |         10 |
| 2026-08-13 | dinner    | fdc+gtin               |    4 |     24 | 127,000 |  22,113 |     127,000 |       22,113 |      **8** |          8 |
| 2026-08-12 | dinner    | fdc+recipe             |    6 |     34 |  13,040 |   2,174 |      13,040 |        2,174 |      **1** |          1 |
| 2026-08-11 | breakfast | fdc (3 foods)          |    6 |     34 |  11,938 |   1,863 |      11,938 |        1,863 |      **1** |          1 |
| 2026-08-13 | breakfast | fdc (2 foods)          |    4 |     22 |   7,569 |   1,357 |       7,569 |        1,357 |      **1** |          1 |

Two readings worth stating plainly:

- **A Recipe Instantiation is cheap.** 6 entities, 34 datoms, and still one QR symbol. The frozen `event/instantiation` snapshot is 2.1 KB; the closure is dominated by the four ingredient twins, which are `fdc:` and therefore nearly free. A recipe was expected to be the hard case and it is not.
- **Gzip is decisive for datoms and useless for photos.** Text datoms compress ~6:1; base64 JPEG compresses ~1.34:1 (it is already-compressed bytes re-expanded by base64). Any argument that assumes compression rescues a photo payload is wrong.

---

## 5. Where a ledger's bytes go

Over the measured corpus:

| Attribute                       | Datoms |   Bytes | % of ledger |
| ------------------------------- | -----: | ------: | ----------: |
| `twin/raw_provenance`           |     10 | 293,388 |   **39.8%** |
| `food/label_photos`             |      1 | 205,115 |   **27.8%** |
| `food/photo_base64`             |      1 | 205,113 |   **27.8%** |
| `nutrition/info`                |     19 |   8,261 |        1.1% |
| `event/metrics`                 |     11 |   5,044 |        0.7% |
| everything else (15 attributes) |     87 |  19,955 |        2.7% |

Total 736,876 bytes over 129 datoms and 23 entities.

**Three attributes are 95.5% of the ledger.** Two of them are the same photo.

---

## 6. The whole ledger — formula, not total

The measured corpus totals 719.6 KiB raw / 353.7 KiB gzipped over 23 entities and 129 datoms, but that is a corpus of my choosing and its total means nothing. What generalises is:

```
raw bytes ≈ 2,501·n_fdc + 144,750·n_gtin + 1,376·n_events + 1,165·n_recipes
          + 411,070·n_custom_with_photo + ~1,300·n_custom_without_photo
```

To turn that into your number, two counts are needed from a real export: **how many `gtin:` twins** and **how many photos**. Nothing else moves the total appreciably. Run `Settings → Export Ledger` and the measuring script reports it directly; the script is linked from the ticket.

The own-device half sends the **whole** ledger, so it is dominated by exactly the same two terms — which means §7's decisions price both halves of the map at once.

---

## 7. Three findings that are design decisions, not measurements

### 7.1 The Open Food Facts adapter stores the entire API response

`open-food-facts.ts:467` fetches `https://world.openfoodfacts.org/api/v3/product/<barcode>.json` with **no `fields=` filter**, and `:448` stores `raw_data: product` — the whole response envelope, not just `.product` (confirmed by its own reader at `:229`, which does `provenance.raw_data?.product`). Real responses measured for this note: **85 KB, 108 KB, 149 KB**. The repo's own fixture is trimmed to 14 keys, which is why this has not been visible.

That is defensible on device — ADR-0016 wants a backfill source with no re-fetch — but on a **wire** it means one scanned food costs more than a hundred USDA foods. Note the asymmetry with `fdc:`, where ADR-0047 §7 already made exactly this call in the other direction: _"the bundle is the backfill source for every food, offline, so a per-food copy of USDA's untouched record would cost 25x the bytes to buy nothing."_ There is no bundled Open Food Facts corpus, so that reasoning does not transfer — but the question it answers is the same one.

### 7.2 A label photo is stored twice

ADR-0034 §5 has `food/photo_base64` mirror `label_photos[0]` so the singular-photo display surfaces are unchanged. Working as designed, and on a wire it is a **free 50% saving** on the single largest attribute pair: the receiver can reconstruct the mirror from the array. This costs no decision about what the user sees.

### 7.3 The derived/minted split lands almost exactly half and half

Across the measured meals: **13 derived** (`gtin:`, `fdc:` — two devices construct the same id with no coordinator, so ADR-0014 says they merge for free) and **13 minted** (`event:consume_`, `food:custom_`, `recipe:` — uuids that do not). The derived half is also the cheap half by byte count once photos are excluded, and the minted half is where re-minting on acceptance (map decision 7) actually has to do work. The two halves are close enough in count that neither can be treated as the special case.

---

## 8. What this settles for the map

- **A meal of ordinary foods fits in one QR code.** #194's zero-server, same-room, QR-signalled path is not merely possible for the handshake — for a plain meal the _entire payload_ fits the same channel. That is a materially stronger position than #194 could claim.
- **Photos cannot ride any code-shaped channel and do not need to.** Dropping them takes the worst meal from 106 symbols to 1.
- **Provenance is the one genuinely contested megabyte.** It is invisible to the user, it is 40% of the ledger, and unlike photos there is no display surface arguing for it. #197 has to decide whether it crosses; §7.1 is the evidence.
- **The own-device half is priced by the same two terms**, so #202 does not need its own measurement.
