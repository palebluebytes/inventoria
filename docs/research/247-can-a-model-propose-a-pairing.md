# Prototype: can a model beat the matcher at proposing a pairing? (#247)

**Grounds:** the same 35 `gtin:` twins [#243](https://github.com/palebluebytes/inventoria/issues/243) measured, from [#241](https://github.com/palebluebytes/inventoria/issues/241)'s ledger export, scored against the hand adjudication committed in `scripts/pairing-census.mjs` — read out of that file rather than restated, so the truth was fixed before this arm existed (#188's premise). Corpus: the committed `public/usda/search-index.json`, `schema_version` 10, 2,023 rows. Nothing was regenerated.
**Model:** `@cf/meta/llama-4-scout-17b-16e-instruct`, `temperature: 0`, through the `inventoria-model-route` AI Gateway with `collect_logs: false` (`docs/how-to-operate-the-model-route.md`). Ten calls, **3,081 neurons**, all responses on branch `prototype/247-model-pairing-proposer` under `scratch/247/responses/`. The replies are committed; the **prompts are not**, because they restate one person's whole basket into a public repo and `--dry` regenerates them for free (`scratch/247/.gitignore` says so on the spot).
**Siblings:** parent map [#240](https://github.com/palebluebytes/inventoria/issues/240). Bar set by [#243](https://github.com/palebluebytes/inventoria/issues/243); the state-gap refusal it has to honour is [#489](https://github.com/palebluebytes/inventoria/issues/489); the ablation discipline is [#482](https://github.com/palebluebytes/inventoria/issues/482)'s.
**Date:** 2026-09-17. **Status:** measured. **Verdict: do not build.** The export is personal data, lives outside every working tree and is not committed (ADR-0064).

---

## 1. The bar, and every arm against it

The bar is the shipped mechanical matcher: **16 offers, 7 agreements, 9 wrong, 5 of those wrong in a way a person would plausibly accept.** #247 says a tie is a loss, because a model costs a network round-trip the matcher does not.

| arm                                           | catalogue in prompt | offers | agrees |  wrong | silence was right | state gap accepted | id not in corpus | refused, rightly | refused, missed | neurons |
| --------------------------------------------- | ------------------: | -----: | -----: | -----: | ----------------: | -----------------: | ---------------: | ---------------: | --------------: | ------: |
| **the matcher** (#243, shipped)               |                   — |     16 |  **7** |      9 |                 1 |                  0 |                0 |                — |               — |   **0** |
| **control**: lenient retrieval, no model      |        2,023, local |     28 |      5 | **23** |                 7 |                  1 |                0 |                5 |               2 |   **0** |
| model, whole corpus                           |               2,023 |      8 |      1 |      6 |                 0 |                  0 |            **1** |               13 |          **14** |   767.2 |
| model, 600 rows                               |                 600 |     25 |      6 |     16 |                 4 |                  1 |                3 |                7 |               3 |   349.8 |
| model, 300 rows                               |                 300 |     29 |     11 |     18 |                 7 |                  2 |                0 |                4 |               2 |   268.2 |
| **model, 120 rows** (seeded with the answers) |                 120 |     24 | **15** |      7 |                 3 |                  1 |                2 |            **9** |               2 |   212.4 |
| model, 120 rows, refusal sentence stripped    |                 120 |     29 |     15 |     12 |                 7 |                  1 |                2 |                5 |               1 |   213.8 |
| model, 120 rows, label energy stripped        |                 120 |     19 |     14 |      5 |                 2 |                  1 |                0 |               10 |               6 |   196.2 |
| **model, 120 rows, none of them right**       |         120 (decoy) | **31** |  **0** | **31** |                 8 |                  2 |                0 |            **3** |               1 |   214.2 |

Two single-product probes, to rule out the batch as the cause of the top row's collapse: the same product (`Premium Soy Sauce`, adjudicated `174277`) asked **alone** against the whole corpus is refused (617.7 neurons, 25,082 prompt tokens); asked alone against 120 rows it is answered correctly in 928 ms (49.0 neurons).

## 2. The model cannot be the retriever, and the failure is invisible in its own reason

Handed all 2,023 rows, the model offers **8 of 35 and is right once**. That much could be read as caution. What it actually did is worse:

| pack                         | the model's `why` | the `fdc_id` it emitted                    |
| ---------------------------- | ----------------- | ------------------------------------------ |
| Aceite de oliva virgen extra | "olive oil"       | 169869 — **Peanut butter, reduced sodium** |
| Emmental Cœur de Meule       | "Emmental cheese" | 168867 — **Cornmeal, degermed, yellow**    |
| Harina Gallo                 | "wheat flour"     | 790214 — **Flour, rice, white**            |
| Oli de Gira-Sol              | "sunflower oil"   | 171028 — **Oil, grapeseed**                |
| Riccotta                     | "ricotta cheese"  | 169050 — **Cheese, muenster, low fat**     |
| Yogur natural                | "yogurt"          | 170886 — Yogurt, plain, low fat            |
| Pure sesame oil              | "sesame oil"      | 702 — **no such row**                      |
| Liguine-Tallarines           | "noodles"         | 169736 — Pasta, dry ✓                      |

Every `why` names the food correctly. Every id but one names a different food. **Six of the eight ids are real rows in the shipped corpus**, so validating the emission against the corpus — the obvious safety net, and the reason #240's Notes ask for an identity rather than a number — catches one of the seven errors and passes the rest. The one thing #247 assumed was free is not: _"a wrong pairing names a food you can read and reject"_ holds only if the surface shows the **row's description**. A screen that showed the proposer's own reason would have offered peanut butter under the words "olive oil".

## 3. Where it breaks is a context length, not a judgement

The agreement count is not monotonic in difficulty, it is monotonic in **how long the candidate list is**:

| catalogue rows | prompt tokens | agrees | wrong |
| -------------: | ------------: | -----: | ----: |
|            120 |         5,525 | **15** |     7 |
|            300 |         7,773 |     11 |    18 |
|            600 |        11,424 |      6 |    16 |
|          2,023 |        28,683 |      1 |     6 |

Same prompt, same products, same model, same temperature. At 120 rows it beats the matcher outright — **15 agreements against 7, with 7 wrong answers against 9** — and it refuses 9 of the 13 twins where a refusal was the right answer. By 600 rows it is worse than the matcher on both halves. Nothing about the food changed between those two rows of the table.

That kills the whole-corpus design, and it prices the only other route to the whole corpus: a **chunked scan**, 17 calls of 120 rows. See §5.

## 4. The model is a good namer; the search cannot reach what a person's pairing reaches

The cheapest arm carries no catalogue at all: the model says what the food is in plain English, and the search the app already ships does the reaching. The terms are almost all right — `Olive oil`, `Sesame oil`, `Maple syrup`, `Soy sauce`, `Ricotta cheese`, `Pickled cucumber`, `Black beans` — and it also volunteers a **state** (`dry` / `cooked` / `canned` / `in brine`), correctly on both the jarred pulses, which is the discriminant #489's refusal needs and the matcher cannot produce at all. 192.1 neurons for all 35.

Then the shipped search is handed those words:

|                                                        |            |
| ------------------------------------------------------ | ---------: |
| twins the adjudication calls pairable                  |         22 |
| adjudicated row at **top-1**                           | **6** / 22 |
| adjudicated row in the top 5                           |     12/ 22 |
| adjudicated row anywhere in the hits                   |      13/22 |
| the search reaches nothing at all for the model's term |      19/35 |

Six at top-1 against the matcher's seven. A tie at best, and #247 calls a tie a loss.

**But the eight misses are the finding, not the score.** Seven of them are cases where hand adjudication chose a row whose _name is a different food from the pack_:

| pack                  | what a person paired it to    |
| --------------------- | ----------------------------- |
| Kéfir                 | Yogurt, plain, whole milk     |
| Vinaigre de riz       | Vinegar, distilled            |
| Peanut butter powder  | Peanut flour, defatted        |
| Emmental              | Cheese, swiss                 |
| Tagliata al huevo     | Noodles, egg, dry             |
| Liguine-Tallarines    | Pasta, dry                    |
| Shanxi sliced noodles | Noodles, japanese, somen, dry |

No term naming the food in the pack reaches any of those, because the pairing a person makes is a **cross-vocabulary substitution**, not a lookup. Only a judgement over candidates can propose it — and a judgement over candidates is exactly what stops working past a few hundred rows (§3). The two halves of this prototype fail each other.

## 5. The refusal is prompt-carried, and contingent on the list rather than on the food

#482 found that absent-is-never-zero belonged to a sentence in the prompt and not to the model. The same discipline here, at the 120-row size:

- **Strip the refusal sentence** and offers go 24 → 29, wrong 7 → 12, correct refusals 9 → 5, with agreements unchanged at 15. So the sentence buys four correct refusals and prevents five wrong answers and costs nothing. Prompt-carried, exactly as in #482.
- **Strip the label energy and the cooked/dried rule** and it gets _more_ cautious overall (19 offers, 10 correct refusals) while accepting one state gap. Withholding evidence does not make a refusal safer, it makes it arbitrary.

And then the decoy, which is the experiment that ends the lane. Same prompt, same 35 products, a 120-row catalogue containing **none** of the right answers — the situation a chunked scan puts the model in 16 times out of 17:

**It proposes something for 31 of 35, and is right 0 times.** Correct refusals fall from 9 to 3. `Alubia roja cocida` — the jar this whole map is built on, refused on state grounds in the seeded arm — comes back as **Rutabagas**. Soy sauce comes back as **Mayonnaise, reduced-calorie**; almond drink as **Persimmons, japanese, dried**; rice paper as **Squash**.

So the refusal tracks **whether a plausible-looking row happens to be in the list**, not whether the corpus holds the food. A chunked scan would cost 17 calls (~3,600 neurons, ~$0.04) per pairing to collect sixteen confident wrong answers and one right one, with no signal distinguishing them. Chunking is not a fallback; it is the failure mode at scale.

## 6. What a no-model control says about the search

Before crediting a model with anything, #247 needs to know the matcher's brittleness is not the whole story. #243 showed the shipped search drops a row the moment one typed word fails to land, which is why `product_name` scores 0 of 35 — so the obvious free fix is to drop the conjunction.

**It is much worse.** Lenient retrieval over the record's own words offers 28 of 35 and agrees **5** times against 23 wrong, with `Pink tonic` → `Beans, pink, dried`, `Aceite de oliva virgen extra` → `Pineapple, extra sweet variety` and `Espinaca picada` → `Spices, bay leaf`. The conjunction is not a defect to be relaxed; it is the thing keeping the matcher's precision at a coin flip instead of a lottery. This costs nothing to know and it removes the cheapest counter-proposal to a "do not build".

## 7. The four remaining questions #247 asks

- **Offline.** A pairing call does not work on a plane, and it is the food path's _third_ network-dependent feature rather than its first — #480 established that the barcode scan and the root Facet's bundled artifacts both already ask and then report, and that `navigator.onLine` appears nowhere in `src/`. The cost is milder here than for a scan: pairing is a once-per-product act, and #243's verdict already routes it through the food search a person drives, which works offline. Nothing about `pnpm check:offline` moves.
- **Where it would run.** The premise has changed since #247 was written, and in the direction that makes it cheaper: ADR-0070 put a Worker in the site, and map #474 is building the one gated model route with its own operator secret. A pairing call would be a **second consumer of an existing route**, not a new secret. That is no longer the reason to refuse it.
- **Is it cheaper than label extraction?** Yes, and by more than #49 predicted — 49 neurons for one 120-row pick, ~$0.0005. Cost is not what kills this.
- **What it does with the category-less products.** On the 19 the matcher cannot be asked, the best arm reaches **3 agreements** (120 rows, seeded) against 9 correct refusals; the whole-corpus arm reaches 0. The headroom #247 was written to chase is 7 pairings, and no arm here takes more than 3 of them without being handed the answer first.

## 8. Verdict

**Do not build a model pairing proposer.** Not on cost, not on offline, not on where the secret lives — those three objections have all dissolved. On two measurements:

1. **The model cannot hold the corpus.** It collapses between 120 and 600 candidate rows, and at full corpus it emits real ids for the wrong foods while its own stated reason is correct — a failure that id validation passes and a reason-showing surface would launder.
2. **Nothing can hand it a short enough list.** The shipped search reaches the adjudicated row for 13 of 22 even given the model's own clean English term, the lenient alternative is far worse, and a chunked scan proposes rutabagas for kidney beans 16 times out of 17.

What survives, and belongs to the map rather than to this ticket: the model is a reliable **namer** of a foreign pack's food and of its **state**, at 192 neurons for 35 products, and #243 has already ruled that the pairing is the user's act through the food search that exists. A model that types two English words into that search box is the only shape any of this evidence supports — and its measured reach is six of twenty-two at top-1, against the matcher's seven, so on this population it does not earn the round-trip either.

**Reopening clauses** (`CODING_STANDARDS.md` §8), both numeric:

- A model that, handed all 2,023 rows in one prompt, puts the adjudicated row at top-1 for **15 of 22** pairable twins — matching what this model does at 120 rows — makes the retriever question moot and reopens the lane whole.
- A retriever that puts the adjudicated row inside a **120-row** candidate list for **20 of 22** pairable twins reopens the adjudicator half alone, because §3 shows the pick is reliable at that size.

Neither is reachable by prompt engineering on this model, and both are cheap to re-test: ten calls and 3,081 neurons re-ran everything above.
