# Research: what actually reaches a Pack pairing (#556)

**Grounds:** eleven arms over the 22 adjudicated-pairable `gtin:` twins in [#241](https://github.com/palebluebytes/inventoria/issues/241)'s ledger export, scored against `ADJUDICATION` in `scripts/pairing-adjudication.mjs` — the same hand judgement [#243](https://github.com/palebluebytes/inventoria/issues/243) is graded on, fixed long before any arm here existed ([#188](https://github.com/palebluebytes/inventoria/issues/188)). Every arm imports `searchIndexRows` rather than restating it (ADR-0047 §4), so only the query and the chooser vary. Harnesses in `scratch/556/`, the search-only census in `scripts/pairing-null-hypothesis.mjs`, raw replies beside them. The export is personal data, lives outside every working tree and is not committed (ADR-0064).
**Siblings:** parent map [#240](https://github.com/palebluebytes/inventoria/issues/240). [#247](https://github.com/palebluebytes/inventoria/issues/247) refused a model proposer and set the two bars this note scores against; ADR-0113 §9 is the refusal; [`556-tool-using-model-loops.md`](556-tool-using-model-loops.md) is the API half.
**Date:** 2026-10-14. **Status:** measured. Nothing built, nothing shipped, no artifact regenerated.

---

## 0. What this settles

[#247](https://github.com/palebluebytes/inventoria/issues/247)'s two reopening conditions, in its own words:

> a model that, handed all 2,023 rows in one prompt, puts the adjudicated row at top-1 for **15 of 22** pairable twins reopens the lane whole; a retriever that puts the adjudicated row inside a **120-row** candidate list for **20 of 22** reopens the adjudicator half alone.

Four things are now measured rather than argued:

1. **The null hypothesis is refused, and refused at its ceiling.** Running the shipped search automatically on the pack's own name reaches top-1 for **0 to 1** of 22 in every form tried. The ceiling over _every subset of every name_, with the answer in hand, is **4 of 22**.
2. **Both bars were written against retrieval, and retrieval is not what is broken.** Given the food's plain English name the shipped ranking puts the adjudicated row first for **17 of 22** and inside its results for **22 of 22**.
3. **A model driving the search invents nothing.** Over 22 products and ~70 calls it emitted **0** identifiers it had not been shown. The failure moves wholesale to selection: the adjudicated row was on screen for **19 of 22** and it took a different row in 9 of those.
4. **The chooser's own confidence does not separate right from wrong; a separate yes/no question does.** Correct picks run 0.05–0.78 and wrong ones 0.03–0.22 — overlapping. A `noul` asking _is any of these a fair stand-in_ flags **3 of 3** retrieval failures and loses **0** correct answers.

Neither bar is cleared by any single arm. §9 says which combination projects over clause 1, and marks it a projection.

## 1. The null hypothesis, and the ceiling that closes the name lane

[#243](https://github.com/palebluebytes/inventoria/issues/243) measured `product_name` at 0 of 35 and diagnosed it in one sentence: the ranking refuses a row the moment one typed word fails to land, and a pack's name always carries a brand word. That diagnosis has been read ever since as _names do not work_ when what it measures is _whole names do not work_. Nine arms separate the two.

| arm                                       | offers | agrees | wrong | top-1 of 22 |
| ----------------------------------------- | -----: | -----: | ----: | ----------: |
| A. `product_name`, whole (#243's 0)       |      0 |      0 |     0 |           0 |
| B. name, unreachable tokens stripped      |     12 |      0 |    12 |           0 |
| F. name, content words, greedy back-off   |     17 |      1 |    16 |           1 |
| H. name windows, longest first            |     24 |      1 |    23 |           1 |
| **E. categories only — what ships today** | **16** |  **7** | **9** |       **7** |
| C. categories → stripped name             |     21 |      7 |    14 |           7 |
| I. categories → name windows              |     29 |      8 |    21 |           8 |

Running the search on the name buys at most **one** twin and roughly triples the wrong count.

**The strip inverts the signal, which is why arm B is right zero times in twelve offers.** A token survives if _any_ row anywhere carries it, so Spanish function words live and Spanish content words die:

```
Bebida de almendra ecologica  →  "de"      →  Dulce de Leche
Jarabe de arce                →  "de"      →  Dulce de Leche
Vinaigre De Riz 600 G         →  "de g"    →  Game meat, deer
Tagliata al huevo             →  "al"      →  Nuts, almonds, whole
```

**#243's own example does not hold.** `Pure sesame oil` is not blocked by `pure` being absent from the corpus — `pure` is reachable corpus-wide. It fails on the target row, which no whole-corpus strip can repair.

**The ceiling.** Over every subset of every pack's name, scored with the adjudication in hand, the best possible query reaches top-1 for **4 of 22** and the list for **8 of 22**. That bounds every future query builder, carrier-word list and query-emitting model at once. The shopping is Spanish, French, Catalan and Chinese; the corpus is English; the name is not the signal.

## 2. The gap is the query, not the ranking and not retrieval

Feed the shipped search the plain English name of each adjudicated food:

| query form                                     |     top-1 |   in list |
| ---------------------------------------------- | --------: | --------: |
| head word only (`oil`, `cheese`)               |      9/22 |     22/22 |
| **two words, as a person says it**             | **17/22** | **22/22** |
| the row's whole description                    |     22/22 |     22/22 |
| — and inside the **first 8** of an ideal query |         — |     22/22 |

Every hard pack resolves at rank 1 from two English words — `olive oil`, `sesame oil`, `soft tofu`, `egg noodles`, `yogurt`, `swiss cheese`, `peanut flour`. The last row matters for §6: an 8-row tool window is not a constraint.

**A union retriever** over everything the pack affords — each English category tag, the name, the stripped name, each content word — reaches **17 of 22** with a median list of 40 rows and a maximum of 68, well inside clause 2's 120. The five it cannot reach:

| pack                         | wanted                    | why no literal retriever gets there              |
| ---------------------------- | ------------------------- | ------------------------------------------------ |
| Kéfir                        | Yogurt, plain, whole milk | the corpus has no kefir; the leap is a judgement |
| Emmental Cœur de Meule       | Cheese, swiss             | USDA files Emmental as Swiss                     |
| Aceite de oliva virgen extra | Oil, olive                | no English category tags at all                  |
| Tagliata al huevo            | Noodles, egg, dry         | no English category tags at all                  |
| Panko breadcrumbs            | Bread, crumbs, dry        | no OFF record at all — hand-typed                |

Two need a synonym leap no literal retriever can make, one has no record to read. **Clause 2's bar of 20 of 22 may therefore be above what any retriever can reach**, which is a fact about how the bar was set rather than about the mechanisms it was set for.

## 3. The model translates, and translation is not the blocker

`@cf/meta/llama-4-scout-17b-16e-instruct`, temperature 0, through the `inventoria-model-route` gateway, asked for the plain English name of the food.

**Twenty of twenty-two answers are the correct English name.** `Aceite de oliva virgen extra` → olive oil. `Jarabe de arce` → maple syrup. `Pepinillo Laminado` → pickled cucumber. Two errors: `Tagliata al huevo` → _mixed greens salad_, and `Kéfir` → _fermented milk_, which is a correct description rather than a wrong one.

And yet **top-1 5/22, in list 13/22** — worse than the ideal phrase by a distance. Seven answers return zero rows, not because they are wrong but because they are right in the wrong dialect:

```
"rice vinegar"      0 hits   USDA says  Vinegar, distilled
"pickled cucumber"  0 hits   USDA says  Pickles, cucumber, sweet
"emmental cheese"   0 hits   USDA says  Cheese, swiss
"fermented milk"    0 hits   USDA says  Yogurt, plain, whole milk
"chopped spinach"   0 hits   USDA says  Spinach, mature
```

The model speaks shopper English; the corpus speaks USDA English. **Every one of those misses is one hop from rank 1** — eight of nine land first after the hop, `spaghetti → pasta` at rank 4. That hop is precisely ADR-0049 §3's Vocabulary map: _a phrase that retrieves nothing, mapped to the phrases that do_. The hand-written half holds 7 entries against a ceiling of 20, and the measurements satisfy its first three admissions outright.

## 4. Taught the convention, it invents convention-shaped rows

Given USDA's naming style and eight example descriptions — a style guide, never the catalogue — top-1 rises to **8/22** and in-list **falls** to 12/22. It learns the costume:

```
"vinegar, rice"    0 hits        "cheese, emmentaler"  0 hits
"noodles, sliced"  0 hits        "soy sauce, dark"     0 hits
```

That is [#247](https://github.com/palebluebytes/inventoria/issues/247)'s fabrication in a smaller suit. Give it the convention and it mimics the convention; give it the catalogue and it mimics the catalogue. Neither teaches it which rows are real. It also said `unknown` twice, **both times wrongly**.

## 5. The search as a tool: nothing invented, and the failure moves

The model drives the shipped search through a one-line text protocol — `SEARCH: <words>`, `PICK: <id>`, `GIVE UP` — and is handed up to 8 real rows per search. Four rounds.

```
picked a row it had seen        18/22
... and it was right            10/22
... and it was wrong             8
INVENTED an id                   0
gave up / ran out of rounds      4
the right row was shown to it   19/22
```

**The fabrication failure is gone**, and gone for a structural reason: it never emits an identifier it has not read off a real result. Every pick was validated against the set actually returned, and that validation is the whole safety property rather than a belt.

**It performs §3's vocabulary hop itself, at runtime, from the feedback** — `chopped spinach` → ∅ → `spinach`; `breadcrumbs` → ∅ → `bread crumbs plain`; `tofu` → `silken tofu` → `soft tofu`. That is a shipped-artifact change made unnecessary by a prompt.

**All 8 wrong picks are the wrong variant of the right food** — part-skim for whole ricotta, tamari for shoyu, chow mein for somen, fresh pasta for dry, self-rising for plain flour. #243's plausibly-accepted register, and exactly what ADR-0113 §9's screen rule is built to survive.

**Three of the four no-picks are loop defects, not model defects.** `Vinaigre` saw `Vinegar, distilled` in round 2, re-searched `rice vinegar` in round 3 and gave up in round 4. `Pepinillo` had the right row in its **round-1** results and then thrashed on `thinly sliced pickles`, `sliced pickles`, `pickle`. `Emmental` reached `Swiss cheese` on round 4 with no round left to pick. Carrying every row seen forward, and saying it stays pickable, addresses all three.

Five queries were spent on preparation words the corpus structurally cannot carry (ADR-0103/0104) — `chopped spinach`, `thinly sliced pickles`, `sliced pickles`, `sliced noodles`, `peanut butter powder`. The model is not told that rule.

## 6. Arithmetic cannot do the selecting

Every variant it confuses differs in macros, and the pack prints its macros. Scoring each candidate by distance from the label's own panel originates no number — both sides are published and the person holds the pack. It does not work:

| candidates from        | top of the ranking | closest macros |
| ---------------------- | -----------------: | -------------: |
| an ideal English query |              17/22 |      **17/22** |
| the pack's own words   |               7/22 |       **4/22** |

No better on the first, worse on the second, and a _different_ 17. The reason is clean: the four EU-mandatory macros are near-identical across variants of one food, and what separates part-skim from whole ricotta, or tamari from shoyu, is sodium, calcium, B12 and fat profile — **the nutrients the pack does not print, which is the entire reason a Pack pairing exists**. The discriminator is definitionally absent.

## 7. Clef: the choice becomes a type, and what confidence measures

`@cf/cloudflare/clef-flash` takes `{state, questions}` and answers a `choice` question whose `criteria` is a map of option id → description, 2 to 255 options, returning `{choice, probabilities, confidence}`. **The option ids are ours**, so a fabricated identifier is not expressible in the return type. Schema read live 2026-10-14; see [`556-tool-using-model-loops.md`](556-tool-using-model-loops.md) §5.2 for the field-by-field account and the caveat that Cloudflare nowhere states the decoding is constrained.

```
[ideal query candidates]            [the pack's own words]
  right row among options  22/22      right row among options  13/22
  Clef chose it            19/22      Clef chose it            11/22
  search alone decided      7/7       no candidates at all      7
```

The comparison that matters is **conversion** — of the cases where the right row was reachable, how many did the chooser take?

| chooser                        | reachable | took it | conversion |
| ------------------------------ | --------: | ------: | ---------: |
| scout, driving the search (§5) |     19/22 |      10 |    **53%** |
| Clef, choosing (one shot)      |     13/22 |      11 |    **85%** |

Clef had _worse_ retrieval and still got more right. It fixed the variant class scout kept losing: the right sunflower oil, shoyu over tamari, whole-milk ricotta, somen over chow mein, and Pepinillo and Emmental which scout never picked at all.

### 7.1 `confidence` does not separate right from wrong

```
correct picks   0.05 0.09 0.12 0.12 0.13 0.20 0.23 0.23 0.27 0.31 0.32 … 0.78
wrong picks     0.03 0.06 0.07 0.09 0.12 0.20 0.22
```

Complete overlap in the 0.05–0.22 band. A threshold high enough to catch the seven wrong answers discards about thirteen right ones. **A confidence figure is not a usable internal gate**, and ADR-0113 §10 and ADR-0115 §6's rule 3 already keep it off the screen: a number the user cannot check, offered beside a row whose description is the thing they are supposed to read.

### 7.2 A separate yes/no question does separate

Asked alongside, as a `noul`: _is at least one of these a fair stand-in?_

```
Kéfir     0.24, 0.20     ← the one pack with no corpus row at all
Emmental  0.49           ← when the right row was not among the options
all else  0.55 – 0.92
```

A threshold at 0.5 flags **3 of 3 retrieval failures and loses 0 correct answers**. Note precisely what it detects: _nothing here fits_, not _I picked the wrong one_. It misses Riccotta-wrong at 0.92 and Harina-wrong at 0.75, because for those a fair stand-in genuinely was in the list. It is a gate on the candidate set, never on the pick — which is the "offer nothing" ADR-0113 §14's posture already wants.

## 8. `Harina Gallo` is wrong in every arm

Self-rising flour proposed for plain flour, by the shipped matcher, by scout, and by Clef in both conditions. #243 calls it the worst in the population: accepted without hesitation, and the leavening carries **x16.10** the calcium. Eleven arms have not touched it.

## 9. What the arms say together, and the one projection

Retrieval and selection are good at opposite halves. Scout's iterative search reaches **19 of 22**; Clef converts **85%** of what it is handed. Composing them — scout's loop for the candidate set, Clef for the pick, the `noul` as the offer gate — **projects about 16 of 22**, over clause 1's bar of 15.

**That is a projection and not a result.** It has not been run, the two have never shared a population, and the composition adds a failure mode neither arm has: scout's loop can hand Clef a set that contains nothing, which §7.2's gate detects but §7.1's confidence does not.

## 10. Three defects in my own instruments, named

Stated because the numbers above would be wrong without the corrections, and a reader re-running this should know where the harness is thin.

1. **The first Clef run skipped any pack whose search returned fewer than two rows**, on the ground that a `choice` needs two options. Those seven are the _easiest_ cases — the search had uniquely identified the food — so both denominators were wrong and the arm was scored on its hard half alone. Corrected: a single-row result is counted as decided by the search, with no model call.
2. **`3040 AiError: Clef inference queue is full`** is a `429` distinct from both the gateway's rate limit and the daily allocation, and it silently dropped calls before a backoff existed. It appears in no Cloudflare page the API research reached.
3. A patch that rewrote `decide(...)` to `decideWithRetry(...)` rewrote the call **inside the retry helper too**, making it recurse until the stack blew. Caught by the crash; worth naming because it would have been invisible had the recursion been bounded.

## 11. What is not measured

- **n = 22, one kitchen, unusually Spanish shopping.** The size of the translation gap is a property of this population.
- **The composition in §9**, which is the only thing here that clears a bar.
- **Whether `clef-flash`'s terms are gated** in the way `llama-3.2-11b-vision-instruct` was; the calls here succeeded, which answers it for this account only.
- **Neuron cost per arm.** Pricing is in the API note; nothing here metered a run.
- **Two or three of scout's eight wrong picks may be adjudication granularity** — `Peanut Butter, smooth` against `Peanut butter, smooth style, without salt`, on a jar printing 0.6 g salt; tamari against shoyu. Flagged and deliberately not acted on: #188's premise is that whoever writes the rule does not also get to say whether it worked, and re-adjudicating to flatter an arm is exactly that.

---

## Correction (2026-10-15, from #556's close): §5's `breadcrumbs` example is a misread transcript, and §2's Panko row with it

**The error is in this note's instrument, not in the arm.** `trail.push(line.slice(0, 60))` in `scratch/556/arm-k-search-tool-loop.mjs` records **the model's own reply lines** and nothing else — the harness's answers are never written to it. So the `SEARCH: no results, try "bread crumbs"` sitting in Panko's trail is the model narrating, and reading it as the harness reporting an empty result is what produced §5's `breadcrumbs` → ∅ → `bread crumbs plain`.

**`breadcrumbs` retrieves.** Measured through the shipped `searchIndexRows` over the committed `public/usda/search-index.json` — the same function and the same artifact arm-k calls, unchanged since 2026-09-18:

```
breadcrumbs      172806 Bread, crumbs, dry, grated, seasoned
                 174928 Bread, crumbs, dry, grated, plain      ← Panko's adjudicated row, rank 2
pickled gherkin  169378 Pickles, cucumber, sweet               ← Pepinillo's adjudicated row, rank 1
```

Both are live keys in `vocabulary_off.expansions`, expanding to `bread crumbs` and `pickle`. `searchIndexRows` applies the vocabulary itself — the literal pass runs first and `expandThroughVocabulary` runs only when it comes back empty (`usda-corpus.ts:760`) — so **every arm in this note already had the shipped map**, and the hop §5 credits the model with was one the vocabulary had already made.

**What this falsifies, exactly:**

1. **§5's claim that the model performed the vocabulary hop at runtime** is down to one example of three. `chopped spinach` → ∅ → `spinach` holds — `chopped spinach` retrieves nothing, re-measured. `tofu` → `silken tofu` → `soft tofu` was never a ∅ case, it is a refinement. The `breadcrumbs` example is withdrawn.
2. **§2's table row for `Panko breadcrumbs`** — filed under _why no literal retriever gets there_, with the reason _"no OFF record at all — hand-typed"_. The pack has no categories, but it has a name, and `breadcrumbs` is a content word of that name reaching the adjudicated row **174928 at rank 2**. A union retriever over the pack's own words therefore does reach it.

**What is carried over rather than restated.** §2's union retriever is reported at 17 of 22 with five packs unreachable; on the above it is at most four unreachable, but the arm has not been re-run, so the figure stands as measured with this caveat attached rather than being adjusted by hand.

**What does not move.**

- **Neither of #247's clauses changes hands.** Clause 2 asks for 20 of 22 inside a 120-row list; 18 is still not 20, and §2's argument that two of the remainder need a synonym leap no literal retriever makes is untouched.
- **§1's ceiling is unaffected.** That arm enumerates _every subset of every name_, so `breadcrumbs` was already among the queries it scored; the 4 of 22 top-1 and 8 of 22 in-list stand.
- **No arm's score changes.** Scout picked 174928 and was marked correct either way; the correction is to why it got there.
- **§3's five zero-hit phrases are all re-measured and all still zero**: `rice vinegar`, `pickled cucumber`, `emmental cheese`, `fermented milk`, `chopped spinach`.

**And §10 gains a fourth defect in this note's instruments**: a transcript field that records one side of a conversation was read as if it recorded both. The three in §10 were caught by a crash or a bad denominator; this one was invisible because the misreading produced a plausible sentence.

The surviving vocabulary entries this leaves are filed as [#566](https://github.com/palebluebytes/inventoria/issues/566); the build is [#565](https://github.com/palebluebytes/inventoria/issues/565).
