# Research: three proposers, one measurement — what actually pairs (#243)

**Grounds:** the 35 `gtin:` twins in the ledger export [#241](https://github.com/palebluebytes/inventoria/issues/241) produced (3,645 food datoms, 2026-08-29 to 2026-09-13), measured against the committed `public/usda/search-index.json` (`schema_version` 10, 2,023 rows) and `public/usda/nutrient-store.json` by `pnpm pairing:census`. The matcher is the app's own `searchIndexRows`, imported rather than restated (ADR-0047 §4). No artifact was regenerated.
**Siblings:** parent map [#240](https://github.com/palebluebytes/inventoria/issues/240). [#247](https://github.com/palebluebytes/inventoria/issues/247) is the model proposer whose bar this sets; [#244](https://github.com/palebluebytes/inventoria/issues/244) is the panel the pairing would appear on.
**Date:** 2026-09-17. **Status:** measured. The export itself is personal data, lives outside every working tree and is not committed (ADR-0064); what is committed is the adjudication, in `scripts/pairing-census.mjs`.

---

## 1. The three numbers

| proposer                            |  proposes | top proposal is the adjudicated one | proposes something wrong |
| ----------------------------------- | --------: | ----------------------------------: | -----------------------: |
| 1. own past pairings, cross-barcode |  **2/35** |                 2 (by construction) |                        0 |
| 2a. OFF `categories_tags`           | **16/35** |                               **7** |                    **9** |
| 2b. OFF `product_name`              |  **0/35** |                                   0 |                        0 |
| 2. categories, then name            | **16/35** |                               **7** |                    **9** |
| 3. the ceiling (hand-adjudicated)   | **24/35** |                                   — |                        — |

The ceiling splits three ways, and the third way is the finding:

|             |     |                                                                                               |
| ----------- | --: | --------------------------------------------------------------------------------------------- |
| `paired`    |  22 | a reference food for the substance, in a state whose per-100 g composition is a fair stand-in |
| `state-gap` |   2 | the corpus holds the ingredient **dried** and the product is sold cooked                      |
| `none`      |  11 | no defensible row, or the OFF record does not say what the food is                            |

## 2. The prize is real, where a pairing exists

All 22 adjudicated pairings would put at least one metered micronutrient onto a panel that lacks it, and a **median of 8.5 of the twelve**. Kefir fills ten, ricotta and egg pasta eleven each. This is the map's motivating claim and it survives measurement: a person eating packaged food reads near-zero on twelve meters that a pairing would move.

## 3. Cross-barcode history is refuted outright

ADR-0057's principle — your own history is the best default — does not transfer to pairing. Over fifteen days of real shopping, **exactly two** of 35 products could ever have been proposed from an earlier, different barcode, and they are the same pair: two Lee Kum Kee soy sauces landing on `Soy sauce made from soy and wheat (shoyu)`, and Kefir landing on the yogurt row a yogurt had already reached.

The reason is structural rather than a small-sample artifact. A recurring shop is forty products and roughly forty distinct foods; the same-barcode case is already served by the twin's own datom (#240's Notes), so cross-barcode history only fires where two different products are the same reference food. That is rare by construction.

## 4. `product_name` reaches nothing — 0 of 35

Not only because this shopping is Spanish, French, Catalan, Dutch and Chinese. **The shipped search drops a row the moment one typed word fails to land**, and a pack's name always carries a brand or a marketing word:

| typed                   | hits | typed        | hits |
| ----------------------- | ---: | ------------ | ---: |
| `Pure sesame oil`       |    0 | `sesame oil` |    1 |
| `Premium Soy Sauce`     |    0 | `soy sauce`  |    5 |
| `Shanxi sliced noodles` |    0 | `noodles`    |    6 |

So a name proposer is not a weak proposer; it is a non-proposer, and no amount of corpus growth changes that. Anything built on a product's name has to cut the name down first, which is a different piece of machinery and is not this one.

## 5. The matcher's precision is a coin flip, and its errors are the plausible kind

Seven right, nine wrong, out of sixteen proposals. #243 says the wrong-and-plausible number matters more than the other two, so it is graded rather than counted. Five of the nine are proposals a person would tap yes to:

| pack              | proposed                                       | instead of                               | worst material metered nutrient |
| ----------------- | ---------------------------------------------- | ---------------------------------------- | ------------------------------: |
| sunflower oil     | `Oil, sunflower, linoleic (less than 60%)`     | `Oil, sunflower, linoleic, (approx 65%)` |                 vitamin E ×1.00 |
| ricotta           | `Cheese, ricotta, part skim milk`              | `Cheese, ricotta, whole milk`            |                       B12 ×0.37 |
| Emmental          | `Cheese, parmesan, hard`                       | `Cheese, swiss`                          |                       B12 ×0.40 |
| chopped spinach   | `Mustard spinach, (tendergreen)`               | `Spinach, mature`                        |         vitamin E ×0 (silently) |
| plain wheat flour | `Wheat flour, white, all-purpose, self-rising` | `Flour, wheat, all-purpose, unbleached`  |              **calcium ×16.10** |

The flour is the one to read twice. Nobody hesitates over self-rising flour offered for plain flour, and the leavening carries sixteen times the calcium. The four remaining wrong answers — brewed coffee proposed three times, for an almond drink, a rice drink and a kefir, and cashew butter for a peanut butter — are rejected on sight and cost nothing but the offer.

Materiality floor: a nutrient counts in that last column when 100 g of one of the two foods supplies a tenth of its daily target (`nutrition-targets.ts`). Without it the worst ratio is always a trace — two sunflower oils differ infinitely in iron because one records 0.01 mg and the other records nothing.

## 6. Where the matcher cannot even be asked

**16 of 35 twins hand it no English category tag at all.** Three were hand-typed from the label and have no OFF record; twelve have an OFF record carrying no `categories_tags`; one carries only `da:Chili Olie`, a language-local leaf OFF never canonicalised.

A further three hand it English tags that reach nothing, and the reasons differ:

- `Frijoles negros` — tags stop at `en:legumes-and-their-products`, a shelf the corpus has no row for.
- `Galette de riz` — leaf `en:rice-paper`, which the corpus genuinely lacks.
- `Glasnudeln` — tagged `en:sprinkles`, `en:food-decorations`, `en:bread-coverings`. **The OFF categories are simply wrong**, and nothing downstream can tell.

So the matcher is silent on 19 of 35, and on one of those nineteen its input was misinformation that happened to reach nothing. There is no reason to think the next such error will be as lucky.

## 7. The motivating case cannot be built any more

`fdcId 173740`, `Beans, kidney, all types, mature seeds, cooked, boiled, without salt` — the row #240's Notes cite as "already shipped in this repo with ~60 nutrients ... fibre 6.4 g, exactly matching the label" — **is not in the corpus that ships today.** ADR-0103/0104's consolidation removed it along with every other prepared row. The index carries **0 rows saying cooked, 0 saying boiled and 0 saying canned.**

What survives for that jar is `Beans, kidney, all types, dried`, at 3.20× its energy. The black beans are the same shape at 4.01×. This is not a gap in the pairing idea; it is the corpus doing exactly what ADR-0103 decided it should, and it lands on the map's own motivating example.

The map's _Not yet specified_ already carried "what a pairing does when the corpus regenerates — revisit once #186's rule lands". #186 has landed, and the question is sharper than a dropped row: **a packaged food is usually cooked and the corpus is now entirely uncooked, so a pairing either carries a state conversion or refuses the cooked case.** Ticketed as a decision of its own.

## 8. The overlapping macros are a free confidence signal nobody has spent

#240 forbids filling a panel from two sources and rules that the label always wins, which leaves the macros OFF and USDA both carry doing nothing at all. They are the only evidence in the system about whether a proposal is even the right food.

It earns its keep twice in 35 rows:

- `Haricots chinois` — the name says yardlong bean; the label says 122 kcal and 13.1 g protein against `Yardlong bean` raw at 47 and 2.8. A 2.6× energy disagreement refuses a pairing the name would have waved through. Adjudicated `none` on that evidence alone.
- Both `state-gap` rows announce themselves as 3.20× and 4.01× without anyone having to know what a jar is.

The check costs one division and needs no new data. It is not a proposer; it is a veto, and it is the cheapest thing in this whole measurement.

## 9. Verdict

**A proposer does not clear a bar worth building against. A pairing does.** The two questions are separable and #243 found them to be different questions.

- The mechanical matcher is right seven times in sixteen offers and plausibly wrong five times, one of them by ×16 on calcium. Shipping it as an auto-proposal would put a wrong reference food in front of a person about as often as a right one, and #240's own rule — only a person's explicit act accepts a pairing — is not a defence, because the errors are precisely the ones a person accepts.
- Cross-barcode history reaches 2 of 35 and cannot reach more.
- `product_name` reaches 0 of 35 and cannot reach more.
- The ceiling is 24 of 35, 22 of them usable today, and every one of those 22 moves a meter.

So the map does **not** end in a recorded refusal. What it ends in is a pairing the **user** makes, through the food search that already exists over this very corpus: 2,023 rows, no key, no network, single-digit milliseconds, and already the way every reference food enters this app. "Pair this to a reference food" is an entry point onto a search that ships, not a proposer that has to be built — and against 19 twins the matcher is silent on, a search box is not a worse answer, it is the only one.

That leaves a real question for [#247](https://github.com/palebluebytes/inventoria/issues/247) rather than a formality. The bar a model has to beat is **7 right and 5 plausibly wrong out of 16 offers**, and the population that matters is the **19 twins where the matcher says nothing** — where a model reading a Spanish name, a Dutch category and an ingredients list has something to work with and the matcher has nothing.
