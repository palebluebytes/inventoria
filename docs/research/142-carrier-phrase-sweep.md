# Research: does a synonym inside a longer phrase reach anything? (#142)

**Grounds:** `expandThroughVocabulary` / `searchIndexRows` / `buildSearchCorpus` in `src/lib/food/usda-corpus.ts` and `compileReferenceFoodQuery` in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` via `pnpm usda:ranking-audit`. [ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md) §1 governs the fallback and its Consequences names this gap.
**Siblings:** [#130](https://github.com/palebluebytes/inventoria/issues/130) is the sweep this one copies its shape from, and the audit it adds a pass to. [#140](https://github.com/palebluebytes/inventoria/issues/140) shipped the whole-phrase fallback this would extend. [#141](https://github.com/palebluebytes/inventoria/issues/141) added the hand-written half of the map, which changes the denominator and settles one of the ticket's own examples.
**Date:** 2026-08-21. **Status:** pre-registration. §2 and §4 are measured inputs and dated; §§3 and 5–8 are written **before the sweep runs**, and no search or ranking code has changed.

---

## 1. Why this note exists before the mechanism does

[#142](https://github.com/palebluebytes/inventoria/issues/142) asks for a per-token tier under the vocabulary fallback: `aubergine` expands today and `raw aubergine` does not, so a synonym typed inside a longer phrase still answers "No food found". The ticket does not ask for it to be built. It asks for the one thing missing before anyone can decide — a number — and it says so in its own words: _"Adding an unmeasured mechanism is what #130 was written to stop."_

So this note is the pre-registration for that measurement, written first for the reason [#130](https://github.com/palebluebytes/inventoria/issues/130) §3 gives: a measurement whose categories and thresholds are chosen after the numbers arrive is a rationalisation. The scope is the sweep and nothing else. **A zero closes the ticket; a non-zero does not open the mechanism**, it returns the decision to the maintainer with the number attached.

## 2. The subset, re-counted over the map search actually reads

The ticket's body says 425 keys, 125 single words, 64 of those with all-single-word values. Its triage comment re-measured to 446 / 126 / 62 against `vocabulary_off` at `b1bbb83`. Both are counting the wrong map. The app does not read `vocabulary_off`; `buildSearchCorpus` merges the derived section and the hand-written one into a single map, and the fallback reads that.

Over the merged map, counted with the app's own `wordsOf` — the one tokeniser (#136), and the right unit here because a per-token substitution replaces tokens rather than whitespace-delimited strings:

|                                   | body | triage (`vocabulary_off`, whitespace) | merged map, tokenised |
| --------------------------------- | ---- | ------------------------------------- | --------------------- |
| keys                              | 425  | 446                                   | **453**               |
| single-token keys                 | 125  | 126                                   | **124**               |
| of those, all-single-token values | 64   | 62                                    | **58**                |

**The seven hand-written keys add nothing to the subset.** Six of them are phrases, and the seventh, `gammon`, expands to the phrase `pork cured ham`. So the merge widens the map by seven and the substitutable subset not at all — which is worth stating, because "re-count over the merged map" sounds like it should raise the number and it lowers it.

**Four keys leave the subset on the tokeniser, not on the merge**: `crepe`, `crepes` and `crêpes` all expand to `crêpe`, and `jícama` expands to `yambean`. `wordsOf` splits on every non-alphanumeric run, so `crêpe` is the two tokens `cr` and `pe` and `jícama` is `j` and `cama`. This costs those keys nothing today — a typed query goes through the same function, so the halves line up on both sides — but they are not single-token substitutions and cannot be counted as such.

**58 keys is what this ticket is about.**

## 3. Every probe is empty, and that is a proof rather than a finding

The measurement the ticket specifies is "types each single-word key inside a plausible carrier phrase and counts how many currently return nothing". That count is 100%, and no sweep is needed to know it.

`compileReferenceFoodQuery` admits a row only when **every** typed token prefix-matches some word of the name, or every token stem-matches one. A vocabulary key is in the map because it retrieves nothing, which means no row in the corpus has a word that token prefixes or stems to. Add a carrier word and that token is still there, still matching nothing, and both branches of the retrieval test still fail. `raw aubergine` cannot retrieve for the same reason `aubergine` cannot, and neither can any other phrase containing a key.

So the sweep's real subject is not whether the probes are empty. It is **how many of them a single substitution would actually fill** — the question the ticket's own `natural yoghurt` objection raises and the count it asks for does not answer.

The sweep still runs the probes, for two reasons. It checks the proof above against the shipped code rather than against this paragraph. And the shipped fallback has a second tier the proof does not cover: `expandThroughVocabulary` also matches a key **longer** than the query, positionally, so a probe could in principle be answered by some two-word key whose first word starts with `raw`. Any probe that answers is a finding about that tier and gets its own line.

## 4. The carriers, priced against the corpus

A carrier word the corpus does not use cannot indict the vocabulary. `chopped courgette` returns nothing, and so does `chopped zucchini`: the corpus holds three rows with the word `chopped` in them, none of them a courgette. Counting that as a vocabulary miss would credit this mechanism with a gap it cannot close.

So every carrier is priced first, per [#131](https://github.com/palebluebytes/inventoria/issues/131)'s ruling that an unmeasured precision guard is a hole. Reach is rows out of 4,360 whose name or alias carries the word, by stem:

| carrier     | reach | source     |
| ----------- | ----- | ---------- |
| `cooked X`  | 1,588 | added here |
| `raw X`     | 1,458 | the ticket |
| `fresh X`   | 306   | added here |
| `dried X`   | 105   | added here |
| `X salad`   | 10    | the ticket |
| `chopped X` | 3     | the ticket |

The ticket's three are kept **verbatim**, because they are what it asked for and dropping the two that look unpromising would be choosing carriers after seeing which ones suit. Three more are added, because a sweep over the ticket's set alone would return a null that says something about the word `chopped` and nothing about the mechanism.

**Word order is immaterial and is not varied.** Retrieval asks only whether every token matches somewhere; it is blind to where. `X salad` and `salad X` therefore retrieve exactly the same rows, and differ only in the `position` key's ordering of them. Six carriers, not twelve.

**58 keys × 6 carriers = 348 probes.**

## 5. What the sweep measures

A `carrier` pass in `scripts/usda-ranking-audit.mjs`, beside `britishPass`, over the committed index. For each of the 58 keys and each of the 6 carriers:

- **probe** — the carrier phrase with the key in it (`raw aubergine`). How many rows it retrieves today.
- **expansion** — the same phrase with the key replaced by its expansion (`raw eggplant`), one substitution, which is exactly what the deferred mechanism would produce. Where a key has several values, each is tried, and the first that retrieves is recorded.
- **rescued** — probe empty, expansion non-empty. This is the unit the bands in §7 count.

**The shipped search, borrowed rather than restated.** The pass calls `buildSearchCorpus` and `searchIndexRows` through `usda-app-module.mjs`, the seam ADR-0047 §4's import-don't-copy rule already provides, so a probe's emptiness is the app's verdict and not this file's opinion of it. The other passes score through the restated `search()` helper, which knows nothing of the vocabulary; that is right for them and wrong here, since the vocabulary is the whole subject. The cost is that a plain `pnpm usda:ranking-audit` now needs esbuild, as `--explain` already did.

**One case per key**, all 58 emitted, none filtered. Each carries the key, its expansions, what the bare key leads with today, and a row per carrier: the probe phrase, its hit count, the expansion phrase tried, its hit count, and the description it led with. Every other pass in the audit filters to the interesting cases because they emit hundreds; 58 is small enough to read whole, and a filtered emission would hide exactly the unrescued keys the null verdict rests on.

The tallies go in `counts` beside the other passes, with the per-carrier breakdown in its own block. No new JSON file: the cases land in `docs/research/130-ranking-audit.json` with everything else the audit measures.

## 6. The ceiling, stated up front

**This sweep measures reach, not usage.** It can say how many carrier phrases a substitution would fill. It cannot say that anybody types them. The app is local-first and keeps no query telemetry, so the first of the two justifications the ticket offers — _"real queries showing users type synonyms inside longer phrases"_ — is not available here and will not be available later.

That is the honest ceiling, and it is why §7's top band cuts a ticket rather than authorising a build: a positive result establishes that the mechanism has something to reach, which is strictly less than establishing that it is worth reaching for. A zero, by contrast, is conclusive in the direction that matters — a mechanism with nothing to rescue needs no usage data to reject.

## 7. Pre-registration

### 7.1 Verdicts

| outcome                  | condition                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retire the mechanism** | **0** of the 348 probes rescued. Close #142, append the null to ADR-0049's Consequences, and the per-token tier is a settled no rather than a defer. |
| **Report and return**    | ≥ 1 rescued, but no single carrier rescues ≥ ⅓ of the 58 keys. The evidence is real and thin; the decision goes back to the maintainer.              |
| **Cut a build ticket**   | Some carrier rescues **≥ 20 of its 58 keys**, and the leads the emitted cases record read plausibly on a hand pass of the rescued set.               |

**#142 builds nothing in any of the three.** The mechanism's shape is already written down in the ticket — whole phrase first, at most one substitution, drawn only from this subset, capped at a small k, firing only on an empty result — and none of it is touched here.

### 7.2 Must not regress

Nothing, and deliberately. This ticket adds a measurement pass to a script that asserts nothing and is not wired into `pnpm check`, and changes no code the app runs. The guard that matters is that it changes no code the app runs, which the diff shows directly.

### 7.3 What is not counted

- **Keys outside the 58.** A multi-token key or a key with a multi-token value is a phrase substitution, which is a different and larger mechanism than the one under measurement. The ticket already excludes them and so does this.
- **Plausibility of the lead**, except in the top band's hand pass. A rescue is "the substituted phrase retrieves". Whether `dried medlar` ought to lead with a loquat is a ranking question, and ranking is #124's and #143's subject rather than this one's.
- **Anything about how often the carriers themselves are typed.** §6.

## 8. Where the result goes

The results section of this note, written under the numbers when they arrive. Then, whichever band lands, an `## Amendment (2026-08-21, #142)` section on [ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md) — appended, per `docs/adr/README.md`, never edited into the decision text — carrying two corrections its Consequences paragraph needs either way:

- **The figures.** That paragraph quotes 425 / 125 / 64, which was pre-measurement; §2 above is 453 / 124 / 58 over the map the app reads.
- **The illustration.** It argues the mechanism rescues less than it looks by pointing at `natural yoghurt` substituting to `natural yogurt`, which also retrieves nothing. That example is spent: #141 put `natural yoghurt` in the hand-written map, where it leads with `Yogurt, plain, whole milk`. The argument it was serving — that a substitution can hand back a phrase as empty as the one typed — is what this sweep exists to size, and after the sweep it will have a number instead of an anecdote.
