# ADR 0047: Bundle USDA's own archives and retire the FoodData Central API

**Status:** Accepted  
**Date:** 2026-08-19  
**Amended by:** ADR-0048 §5 (§4's filter roster gains two members; the corpus fell from 4,491 rows to 4,461)  
**Amended by:** ADR-0042's #131 amendment (§4's brand-filter tally: the corpus is now 4,441 rows)  
**Implemented:** #111 `a8a36e3`, #113 `4d02063`, #114 `37e7d67`, #115 `c0a99a1`

This record revises five earlier ones. It amends
[ADR-0045](0045-usda-stays-the-base-food-composition-authority.md), whose Consequences
left the offline/bundling question open. It amends
[ADR-0016](0016-declarative-ingestion-registry-and-provenance.md), which kept the
untouched source object in a twin's Provenance blob. It amends
[ADR-0030](0030-expanded-food-twin-source-data.md) §5, where portions arrive by lazy
detail hydration. It amends [ADR-0042](0042-usda-search-reference-foods.md) §2, whose
Lucene boost is retired. And it amends
[ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md), whose #118 amendment
gave an empty search two verdicts.

## Context

ADR-0045 settled that USDA FoodData Central is the single composition authority for base
foods, and closed with the question it would not answer: it "does not decide whether the
USDA subset is ever bundled for offline use; that stays open behind the consequences
below". It named bundling USDA's own bulk distribution as the move if a keyless,
quota-free or offline path were ever wanted, and `f3a159f` mirrored the archives to R2 so
that stayed possible. [#110](https://github.com/palebluebytes/inventoria/issues/110) is
that decision.

What the live API costs today is not mainly latency. A user must go and get an API key
from USDA before food search works at all, and `searchFdc` renders that as an alert:
"Add a USDA API key in Settings to search the food database". Beyond the key there is a
quota, and 403/429/5xx branches in two functions that exist only to explain it. The app
is a local-first PWA whose ledger runs entirely in the browser, and its food search is
the one screen that does not work on a plane.

Three architectures were timed against the mirrored archives on one dev machine (#110):
the live `api.nal.usda.gov` at **717–980 ms** TTFB, a Cloudflare Worker over R2 at
**94–127 ms**, and a bundled index with no network at **0.7–9 ms** for the full ADR-0042
filter and rank over the whole corpus.

Two facts about the archives, measured during the grilling of #110, moved the decision
further than the timings did.

**The bulk archives carry more than the API's search response does.** `hydrateFdcFood`
exists because `foodPortions` is absent from the Foundation/SR Legacy _search_ response
(ADR-0030 §5). It is not absent from the archives: **285 of 363** Foundation records and
**7,533 of 7,793** SR Legacy records carry portions, and the whole portions artifact is
**70 KiB brotli**. Nor is the nutrient tail absent — the records the app filters down to
carry **85.2 nutrients each across 245 distinct nutrient ids**, where the app's panel
maps 23.

**Sizes reconcile once the compressor is named.** #110 measured a "full 29-nutrient panel:
346 KiB brotli", and
[#120](https://github.com/palebluebytes/inventoria/issues/120) measured 509 KiB gzipped
for the 23 fields the app fills. Those were the same artifact under two compressors, and
neither record said which. Every size in this record names its compressor beside it, and
every size here was measured at brotli quality 11 or gzip level 9 over the mirrored
archives on 2026-08-19.

### Alternatives that were genuinely live

- **A Worker search API over R2.** Ruled out on measurement: 94–127 ms against the
  bundle's 0.7–9 ms, and it buys nothing the bundle does not already give. It also is not
  free to build — the root `wrangler.toml` is a bare `[assets]` project with no `main` and
  no fetch handler, so serving R2 to a browser needs a Worker, a binding and CORS, or a
  public `r2.dev` subdomain that Cloudflare documents as rate-limited and not for
  production.
- **Bundle a small index, keep the API for detail hydration.** Ruled out once portions and
  the nutrient tail were found in the archives: the fetch had nothing left to fetch. It
  also failed on the ledger rather than on latency — `mapFdcFoodToPayload` writes the
  whole `nutrition/info` panel at **search-map** time, and `mapFdcDetailToPayload`
  deliberately re-maps nothing else, so a food staged while offline would freeze a four-field
  panel into history permanently (ADR-0022 freezes a log's own macros).
- **A user-selectable mode: the API by default, a full offline download as an opt-in.**
  This was the shape asked for at the start of the grilling. It was ruled out by its own
  measurements: once panel, portions and nutrients all bundle for **566 KiB brotli**,
  there is nothing left for the toggle to switch between, and a setting that explains a
  distinction the app no longer has is worse than no setting.
- **Keep the API as a freshness fallback**, since a bundle is pinned to one archive
  release and Foundation ships about every 183 days. Ruled out on measurement: comparing
  Foundation `2025-12-18` to `2026-04-30`, **363 of 365 records survived byte-identically,
  nothing was added, and two were retired**. A fallback path that fires rarely, is
  exercised by nobody, and re-admits the key prompt and the quota branches is a poor
  trade for at most one release of drift.
- **Bundle USDA's untrimmed records**, losing nothing at all. Ruled out on cost: the
  survivors' untrimmed records are **205.97 MiB raw / 7.20 MiB gzipped**, of which about
  **96% is record scaffolding** — per-nutrient derivation codes, footnotes, sample counts,
  `inputFoods`, `labelNutrients` — that no code in this app reads. The nutrition inside
  them is 4.65 MiB raw. It also lands in every user's ledger: a staged food's Provenance
  blob would be 27.1 KB instead of ~1.1 KB, append-only, forever.
- **A second composition table.** Not reopened. ADR-0045 §1 ruled CIQUAL, OFF and the
  commercial APIs out on measurement and this record does not disturb that reasoning;
  bundling USDA's own distribution is the move that record already named.

**Scope.** This record settles where base-food search and staging get their data, and
retires the FDC API. It does not touch the barcode path (OFF remains the authority for
packaged products, ADR-0034 §8), does not govern manual entries or recipes, does not
adopt a second composition table, and does not change ADR-0042's ranking — only where its
candidate rows come from and when its filters run. It does not decide the exact field
split between the two artifacts beyond the rule in §2, which is left to a measurement at
implementation.

## Decision

### 1. The bulk archives are the search corpus; the FDC API is retired

No code path calls `api.nal.usda.gov`. There is no USDA API key, no key field in
Settings, no `hasKey` gate, and no 403/429/5xx handling. A key already stored in
localStorage is cleared on next load; the OFF and TMDB secrets beside it are untouched.

A credential nothing reads is a liability rather than a courtesy. Should this decision
ever be reversed, a fresh key takes a minute to obtain.

### 2. Two generated artifacts, and the rule that divides them

The corpus ships as **a search index** and **a nutrient store**, not as one file.

**The index carries exactly what a search result row renders** — identity, the fields
ADR-0042 filters and ranks on, and the macros the results list shows. **Everything else
lives in the nutrient store**, keyed by `fdcId` and read only when a food is staged.

This is a performance rule, and it is measured rather than assumed. `JSON.parse` of one
combined artifact costs **136.75 ms**; the index alone costs **2.91 ms** and the
nutrients **102.38 ms**. At the 3–5x phone factor #110 uses, one artifact is 400–680 ms
of blocking main-thread parse before the app is usable. Per-keystroke search is
unaffected either way — 7.33 ms against 6.51 ms on the worst query measured, inside the
noise — because ADR-0042 reads `description` and `foodCategory` and never touches a
nutrient. The cost of the tail is startup, not search, and splitting the artifact moves
it off the critical path.

The nutrient store is parsed lazily, started at idle after first paint. Parsing it in a
Web Worker is the named escalation if real-device measurement shows jank; it is not built
now, because a message hop on every stage is a real cost to pay speculatively.

### 3. The artifacts are generated from the mirror and committed to the repo

They are not built from the archives at build time. `.usda-backup/` is gitignored and no
workflow builds this app, so generating at build time would make 17 MB of archives a
prerequisite of `pnpm build` on every machine that runs it.

Committing them buys three things. A clone builds with no archives, no network and no
credentials. A mirror refresh becomes **a reviewable diff** rather than a silent rebuild,
which is what a served dependency wants. And a filter retune (§4) needs no archives on
hand.

**The generated form is stable so that the diff is readable**: one array sorted by
`fdcId`, nutrients as an id-keyed object with sorted keys, one food per line. A refresh
then diffs as changed values plus added and removed foods — the two retired breads above
show up as two deleted lines. Sorting by description compresses about 9% better and is
deliberately not used: the stable key beats the ratio, because the artifact is
recompressed at serve time anyway.

The same posture as [ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md) §4
takes with the curated stand-ins' committed OFF snapshots, at larger scale, and for the
same reason: a pinned third-party value that is wrong slowly and visibly at review beats
one that is wrong instantly and invisibly.

### 4. The corpus is the reference foods, filtered at generation time

**4,441 of 7,966 merged foods** survive the generation-time filters — 922 dropped as
brand-specific, 1,324 as packaged or processed, 1,249 as prepared or composite, 17 as
dry-basis assays and 13 as reporting no energy. The first three are ADR-0042's, the last
two are [ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §5's and run after the
twin merge. What changes for all five is that they run once per generation instead of
once per keystroke.

The brand tally moved by 21 and the corpus by 20 when ADR-0042's brand filter stopped
treating "USA" as a generic acronym (#131): of the 21 records it newly claims, one
("Cake, pound, Bimbo Bakeries USA, Panque Casero") was already being dropped as a
prepared composite, so it changes column rather than adding one. That asymmetry is the
tally working as intended — the filters are ordered, and a record leaves by the first
door that fits.

This is the clause that costs something, and the cost is asymmetric. ADR-0042's filters
are precision-first, so their expected failure is a leak — something that should have
been dropped and was not — and tightening a filter still works as a pure code change,
because the runtime filter still runs over the survivors. The painful direction is a real
food wrongly dropped: that food is no longer in the artifact, so admitting it back needs
a regeneration. §3 is what keeps that from also needing the archives on hand.

### 5. Every nutrient USDA reports is carried; its record scaffolding is not

The nutrient store carries every nutrient id a record reports, with no coverage gate.

A gate was measured and rejected. Keeping only nutrients present in at least half the
survivors drops 151 of 246 ids and saves **60 KiB brotli**; keeping those in at least 5%
saves **5 KiB**. Sparse columns compress to almost nothing, so a gate buys nothing and
leaves a judgement for somebody to re-litigate. Carrying everything retires the question
permanently.

What is dropped is USDA's per-record bookkeeping — derivation codes, footnotes, sample
counts, `inputFoods`, `labelNutrients` — measured at about 96% of an untrimmed record's
bytes, read by nothing in this app, and reconstructible from the mirror.

### 6. Portions are bundled, and detail hydration is retired

`food/portions` is filled from the archives at stage time. `hydrateFdcFood` and the
`/food/{fdcId}` fetch behind it are deleted.

This amends ADR-0030 §5, whose premise was that portions are absent from the search
response and therefore need a second request. They are absent from USDA's _API response_
and present in USDA's _archive_, which the ADR-0030 measurement did not distinguish.

### 7. A food twin's Provenance carries the bundled row

`twin/raw_provenance` holds the generated record for the food — its identity, its
nutrients, its portions, and its `merged_from` — with `source_uri` still naming the
canonical `/food/{fdcId}` URI the food came from.

This amends ADR-0016, which kept "the untouched source object" so that any nutrient
outside the panel could be backfilled later with no network re-fetch. That premise is
what changes: the bundle is now the backfill source, for every food, offline, whether or
not the user ever staged it. Holding a per-food copy of the same data in the ledger buys
nothing and costs 25x the bytes.

`twin/raw_provenance` remains **present** on every ingested food twin. Its presence is
load-bearing — `food-source.ts` reads the envelope's `adapter` for the origin badge and
`FoodCard.svelte` reads its presence — and only its depth changes.

### 8. `merged_from` rides on the generated row

Where ADR-0045 §2 merged a Foundation record with its SR Legacy twin, the generated row
carries the reference inline: the twin's `fdcId`, `dataType`, description, and the panel
fields borrowed from it. It is built once at generation time, over the **190 twinned
pairs**.

ADR-0045 §4 requires that a merged panel never present itself as a single record USDA
served, and with no hydration step left there is no other carrier for that. Inline also
keeps `buildRawProvenance` receiving the shape it receives today, so the mapper does not
learn that the world changed.

### 9. There is one mode

Search, the panel, portions and the nutrient tail are local for every user, always. There
is no offline setting, no API preference, and nothing to explain on a settings screen.

Recorded as a decision rather than an omission: two modes were asked for at the start of
this design, and the measurements collapsed them into one.

### 10. An empty search says "No food found"

The two verdicts #118 introduced — `filtered-out` where USDA holds records the ADR-0042
filters dropped, `not-covered` where it matched nothing — collapse into one message, and
`offerScan` goes with them.

They collapse because §4 removes their evidence: `matchedFoods` counts foods matching the
query _before_ filtering, and the dropped records are no longer in the artifact to be
counted. Restoring the distinction is cheap and measured — name-only stubs for the 3,475
dropped records cost **37 KiB brotli** — and is deliberately not done here, because the
better answer to an empty search is probably not a message at all.
[#123](https://github.com/palebluebytes/inventoria/issues/123) carries that question,
along with the scan route this clause gives up.

### 11. Both artifacts are precached

They are precached at install, not fetched on first use. An app whose case rests on
keyless offline search must not need a network for its first search.

This needs `json` added to the workbox `globPatterns` in `vite.config.ts`, which today
reads `js,css,html,svg,png,ico,wasm,webmanifest,woff2` and would silently omit a JSON
artifact — leaving a cold offline install with no food data at all. Add it with a comment
saying why, as the `woff2` entry already does. The existing
`maximumFileSizeToCacheInBytes` of 4 MiB is untouched and clears both artifacts
comfortably.

### 12. The mirror is a served dependency, and staleness is a gate

The backup stops being insurance. Each artifact records the archive release dates it was
generated from, and `usda-mirror-check` becomes a gate rather than a notification: a
regeneration against a manifest that is behind USDA fails.

### 13. A retired `fdcId` is accepted, not mechanised

USDA retires ids and does not reissue them — measured across `2025-12-18` to
`2026-04-30`: 363 of 365 kept, zero renumbered, zero descriptions or `ndbNumber`s changed
under a kept id, two retired. So a refresh cannot mint a duplicate twin beside one
already in a user's ledger.

What a retirement costs is narrow. The log is untouched, the twin stays in the ledger, and
the food stays one-tap re-loggable while it is inside the stager's twelve-food Recent
window, which resolves from the ledger and not from the index. Past that window, typing
its name returns nothing. Two foods per release cycle, already fully captured wherever
they matter, does not earn a mechanism.

### 14. Curated stand-ins are unchanged

They stay a separate list merged at search time, exact hits leading and partial hits
trailing (ADR-0046 §1). They are not folded into the generated artifact: a stand-in's
entity is the real barcode, its source tag reads OFF and its payload comes from the OFF
mapper (ADR-0046 §3), and merging it into a USDA-derived artifact would blur exactly the
distinction that record exists to hold.

## Consequences

- **Food search works with no key, no quota and no network.** That is the whole point,
  and it is the first screen in the app for which "local-first" is true without
  qualification.
- **The install grows by about 566 KiB brotli**, against a 158 KiB main bundle. Roughly
  190 KiB of that is the search index and the rest is the nutrient tail, which nothing
  reads yet.
- **The app ships a snapshot, and between refreshes it is knowingly behind USDA.** The
  measurement in the Context bounds what that is worth: one release cycle moved two
  records. The quarterly check is what keeps the window from growing without anyone
  noticing.
- **Git carries about 4.7 MB per regeneration, and JSON diffs badly even sorted.** This is
  the accepted cost of §3. The stable ordering is what keeps a refresh reviewable rather
  than merely large.
- **A real food wrongly dropped by a filter now needs a regeneration**, where today it
  needs a code change. §4 states the asymmetry; §3 keeps the regeneration from also
  needing the archives.
- **An empty search no longer routes to the barcode scanner.** Searching a packaged
  product dead-ends where it used to offer the path that would answer it. This is the
  clearest regression in the record, it is deliberate, and #123 is where the better answer
  gets worked out rather than lost.
- **ADR-0042 §2's Lucene boost is retired**, along with the bare-token-alongside-wildcard
  workaround from `385d5df`. Both exist to solve a page-boundary problem in FDC's API
  response — a heavy boost so a three-character "gra" reaches Grapes inside one request —
  and ranking over the whole corpus does not have that problem. The stemming workaround
  additionally assumed FDC's index; neither its stemming nor its literal wildcard
  matching is a property of a local index.
- **`matchedFoods` becomes exact and unused.** Over a full local corpus it is a true total
  rather than "a floor, one page", which is strictly more honest — and §10 removes the one
  thing that read it. #123 inherits both facts.
- **Staged foods stop carrying USDA's derivation metadata and footnotes.** Nothing read
  them, and the mirror still holds them, but a future feature wanting to show _how_ a
  value was derived would need the archives rather than the ledger.
- **The nutrient tail is capacity, not a feature.** Nothing displays it on the day this
  lands. What it makes cheap: **phosphorus (98% of survivors), copper, thiamin and niacin
  (95%), riboflavin (94%), selenium (90%), manganese (88%) and pantothenic acid (84%)**
  are all Nutrition-Facts-class micronutrients with published RDAs, and each becomes a
  selectable meter with one entry in `EXTRA_NUTRIENT_KEYS` and one in
  `EXTRA_NUTRIENT_META` — the same shape ADR-0030 used for the twelve already there.
- **Two smaller openings come with it.** Energy in kJ is carried by 97% of survivors,
  which is what a UK label leads with and is adjacent to
  [#122](https://github.com/palebluebytes/inventoria/issues/122). And USDA distinguishes
  folate (food), folic acid and folate DFE at 84–86% coverage where the app maps a single
  `folate`; the tail makes that choice revisitable offline instead of by re-fetch.
- **Reversibility is preserved.** The generated artifacts are derived from mirrored
  archives by a scripted step, ADR-0042's ranking functions are untouched, and the ledger
  is not migrated. Dropping back to the API would be a code change, not a data recovery —
  though it would need a key again, which is the thing this record exists to remove.
- **Deferred behind a seam:** parsing the nutrient store in a Web Worker (§2), and
  name-only stubs for the filtered-out records (§10, #123). Neither is built; both have a
  measured cost and a named trigger.

## Amendment (2026-08-20): §4's asymmetry is gone, and §3's third benefit with it

§4 says "tightening a filter still works as a pure code change, because the runtime
filter still runs over the survivors". There is no runtime filter. [#113](https://github.com/palebluebytes/inventoria/issues/113)
took the filter step out of the search path entirely — `searchIndexRows` ranks the
index and does nothing else — on the reasoning that re-running the ADR-0042 predicates
per keystroke is work over a corpus that cannot fail them. That reasoning is sound and
the Decision is unaffected; what falls is the cost analysis around it.

**The cost is symmetric, not asymmetric.** A real food wrongly dropped needs a
regeneration, exactly as §4 says. A brand or a packaged form that leaked past the
filters now needs one too, because tightening the predicate changes nothing until the
artifact is rebuilt from it. Both directions cost the same, and the "expected failure
is a leak, and leaks are cheap" reading of §4 is wrong in the cheap direction.

**§3's third benefit rests on the same premise.** "And a filter retune (§4) needs no
archives on hand" was true only while the runtime filter caught the tightening.
`scripts/usda-bundle.mjs` reads `.usda-backup/`, so a regeneration needs the mirror,
and a retune in either direction is now a regeneration. §3's other two benefits — a
clone that builds with no archives, and a mirror refresh that arrives as a reviewable
diff — are untouched.

Restoring a runtime filter over the index would buy the tightening direction back for
the cost §4 originally weighed against it. It is deliberately not proposed here: the
measurement that removed it stands, and the right moment to reopen it is the first
retune that actually hurts, not this correction.

## Amendment (2026-08-20): §11's precache cap did not clear both artifacts

§11 says "The existing `maximumFileSizeToCacheInBytes` of 4 MiB is untouched and clears
both artifacts comfortably." It did not, and the failure was not silent: `nutrient-store.json`
is **4,225,796 bytes** against the cap's 4,194,304, and `pnpm build` aborted rather than
shipping a service worker missing it.

The error was reading the served size as the cached one. The store is about 782 KiB
gzipped, which is what a browser fetches, but workbox weighs the **raw** file. `fa03877`
raised the cap to 5 MiB, with the reason recorded beside it in `vite.config.ts`; the
headroom is for a mirror refresh growing the store, not for a second asset that size.

The rest of §11 held. Adding `json` to `globPatterns` was necessary and sufficient, and
both artifacts precache at install.
