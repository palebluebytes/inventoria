# ADR 0049: A word the corpus does not use is expanded before search gives up, from a vocabulary derived rather than written

**Status:** Accepted  
**Date:** 2026-08-20

This record amends [ADR-0045](0045-usda-stays-the-base-food-composition-authority.md)
§1, which settled that USDA is the single composition authority and ruled Open Food
Facts out as a base-food source. It admits OFF as a source of **words**, and leaves
§1 intact for **values**: nothing here puts a non-USDA number in a USDA panel.
[ADR-0042](0042-usda-search-reference-foods.md) §1's stemmer is widened by the
amendment at the foot of that record.

## Context

`aubergine` returns nothing. So does `courgette`, `swede`, `rocket`, `beetroot`,
`cornflour`, `skimmed milk`, `pork fillet`, `goat's milk`, `flax seed`,
`ginger powder`, `jalapeño pepper`, `wombok` and `elaichi`. Every one of them names
a food the corpus holds, under a name the corpus does not use.

[#130](https://github.com/palebluebytes/inventoria/issues/130) measured it against a
pre-registered bar and cleared it decisively: **236 vocabulary misses against a
threshold of 100**, and **17 of 20 everyday British queries returning nothing at
all**. Over all 1,711 (member, candidate) pairs the synonym pass produced, the
harm buckets were `leads` 608, `visible` 49, `buried` 20 — and **`absent` 1,034**.
Where a query does not lead with the right record, it fails to retrieve it
entirely **fifteen times more often** than it merely buries it. #130 was filed as
a ranking ticket. The finding was recall.

The class is bounded, and bounded by somebody else's file. **549 OFF synonym groups
reach this corpus**, from `ingredients.full.json` — not the `ingredients.json`
`off-taxonomy.ts` already fetches, which carries no synonyms.

**A hand-written list is the wrong shape, and the reason is not its length.** It
would need 236 entries to match what an existing file already knows, but the
sharper objection is that nobody would have written the right 236. A random sample
of 45 of the derived entries falls into classes a hand list would not have thought
to enumerate: spacing (`flax seed` → `flaxseed`), word order (`ginger powder` →
`ground ginger`), possessives (`goat's milk` → `goat milk`), diacritics
(`jalapeño pepper`), regional English (`skimmed milk`, `pork fillet`), everyday
loanwords (`elaichi`, `gai-lan`, `wombok`), and plain synonyms (`jamaica pepper` →
`allspice`). Deriving the vocabulary means not having to guess which words matter.

Two of the three known cases #130 carried are closed by this: `wombok` reaches
`Cabbage, chinese (pe-tsai), raw`, and `green onion` reaches the spring-onion
record through four of its five group members. The third, `coriander leaf`, is
closed by §5's stemmer widening instead.

**Scope.** This record governs how a typed word reaches a record. It does not
change what the corpus contains, what any panel says, or how results are ordered
once retrieved. It does not admit a second composition table, does not touch the
barcode path, and does not reopen ADR-0045 §1 for values. It is explicitly **not**
a remedy for [#124](https://github.com/palebluebytes/inventoria/issues/124): a
query that already answers is untouched, so `oil` still leads with bearded seal
oil until that record is written.

## Decision

### 1. Vocabulary is a retrieval fallback, never a ranking input

When `searchIndexRows` returns **zero** rows, and only then, the query is expanded
through the vocabulary and the search is re-run over the expansions. A query that
retrieves anything at all is answered exactly as it is today.

This is the whole of the integration, and it settles a question the grilling
opened as its second: whether an expansion-matched row should rank below a
literally-matched one. Under this rule there is never a literal match present to
rank against, so **ADR-0042 §1 gains no key, no tier and no clause.** The ordering
of an expanded search is the ordering that expansion's own words would have
produced — `aubergine` scores `Eggplant, raw` at rung 50, because the head phrase
_is_ the expanded query.

It also makes the no-regression property structural rather than disciplinary.
Expansion is a strict addition: it cannot reorder, displace or truncate a result
that exists today, because it does not run when one does.

**Row-side widening was the alternative and is rejected on ranking, not on bytes.**
Appending synonym words to a row's `words`/`stems` cannot place them in the head
phrase — `headLength` and `headChars` measure the real head, and inflating them
makes head-completeness lie. Every synonym match would therefore cap at rung 20 or
10 with `head` at `HEAD_UNMATCHED`, tie with every other synonym match on every
subsequent key, and fall to the stable sort. That is
[#124](https://github.com/palebluebytes/inventoria/issues/124)'s defect,
deliberately reintroduced.

### 2. The source is OFF's ingredient taxonomy, pinned and mirrored by hand

`https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json`, 6.4 MB,
ODbL, unversioned and live. It is **pinned by sha256** in the backup manifest, read
from a local copy at generation time, and **never fetched at runtime or during a
build** — the same arrangement `usda-backup.manifest.json` gives the FDC archives.
Refreshing it is an explicit command, and the derived map is committed, so **the
diff is the review gate**: a taxonomy that moves shows up as changed keys in a pull
request rather than as changed behaviour in production.

Deliberately _not_ the quarterly drift job ADR-0046 §4 runs over curated snapshots.
A stale nutrition panel is wrong; a stale synonym is merely a word we do not have
yet.

### 3. The derived form is a phrase→phrases map, filtered twice

The groups are inverted at generation time into the shape the fallback actually
uses: **a phrase that retrieves nothing, mapped to the phrases in its group that
do.** `aubergine → [eggplant]`, `chilli → [chili pepper, chile, chile pepper]`.
Storing groups would pay for the members that need no expansion; the map is **425
keys over 316 distinct targets, 16.2 KiB raw and 4.26 KiB gzipped**, against
21.5 KiB / 5.5 KiB for the group form.

The map stores **phrases, never `fdcId`s.** Freezing the retrieved rows at
generation time would pin the ranking that #124 exists to change.

Two filters, in this order.

**The effect filter** keeps a group only if at least one member retrieves nothing
and at least one member retrieves something, evaluated against the **finished**
corpus — after ADR-0048 §5's drops and the ADR-0045 §2 twin merge — because a
group whose members all agree cannot change an answer.

**A tag deny-list** then removes groups that are not food searches. OFF's is an
ingredient-label vocabulary, so it carries `milk lactose`, `anti-foaming agent`,
`acidity regulator` and forty-odd E-numbers beside the food names, and roughly
two-fifths of the flagged groups are label jargon. Unfiltered, `folic acid` would
answer with margarine (via the member `vitamin m`), `selenium` with snail (via
`sn`), and `sal tree oil` with soybean oil. The deny-list is **seeded from #130's
own 163 `implausible-query` verdicts**, which cost nothing to author because that
adjudication is already committed in `130-ranking-audit.json`. It is a deny-list
rather than an allow-list so a group OFF adds later is admitted by default and only
a new harm needs a human.

**`usda_ndb_code` / `ciqual_food_code` was the candidate automatic filter and is
rejected on measurement.** Over the same 549 groups it keeps only **151 of the 238
real misses** while still admitting **50 of the 163 implausible ones** — 69% of the
noise removed for 37% of the benefit lost. #130 declined to pre-screen with it for
the same reason, so that the losses stayed visible.

**A stopword guard** drops a target phrase that matches more than a threshold share
of the corpus. The measured cases are real: `salt` matches 424 of 4,429 rows,
`whole` 217, `beans` 116. A target that broad is not a synonym, and
`wholemeal → [whole, whole grain]` is the entry that shows why the guard is needed
rather than assumed. The threshold is measured and recorded in the generator, not
chosen by taste.

### 4. The map ships inside the search index, under its own licence

It lives in `search-index.json` as a top-level `vocabulary_off` key, beside
`foods`, carrying its own `licence`, `source`, `url` and `sha256`. One artifact,
one `schema_version`, one `generated_from`, one precache, one memoised load — and
**drift between the map and the corpus it was validated against becomes
structurally impossible**, which a separate artifact could not promise. The index
parses in 2.91 ms (ADR-0047 §2) and 16.2 KiB will not move that.

The key is separate rather than merged for a licensing reason as much as a tidiness
one. The map is a substantial extraction from OFF and is therefore a derivative
database under ODbL, distributed here and obliged to be offered under that licence.
Keeping it a distinct, self-describing section makes `search-index.json` a
collective work with one ODbL component rather than an ODbL artifact, and leaves a
future hand-written `vocabulary_local` outside the derivative.

**Visible attribution rides the existing surface.** One sentence on
`SourceExplainerSheet`'s USDA panel — the sheet is already titled "Where this came
from" — naming Open Food Facts and the Open Database License. It shows for every
USDA food rather than only expansion-reached ones, which over-attributes in the
safe direction and needs no new navigation and no tracking of how a food was
reached. This is a wider rule than ADR-0041 §6's "visible ODbL wherever OFF data is
shown", and deliberately so: no OFF data is displayed here at all, only used.

### 5. The stemmer gains sibilant `-es` and one irregular

ADR-0042 §1 handles `-oes` and `-ies` and, in its own words, "nothing else". Two
more English plurals are worth the same treatment, and no more:

- **`(ch|sh|x|ss|z)es` → drop `es`.** `radishes → radish`, `peaches → peach`.
- **`leaves → leaf`, as a one-entry irregular list**, not a `-ves` rule.

Measured over 1,978 probes — every distinct corpus word, its de-pluralised form,
every head phrase and its singularised form — this changes **12 answers and
regresses none.** Nine are queries that retrieve nothing today: `grape leaf`,
`taro leaf`, `pumpkin leaf`, `sweet potato leaf`, `amaranth leaf`,
`chrysanthemum leaf`, `drumstick leaf`, `winged bean leaf`,
`coriander (cilantro) leaf`. The other three are improvements: `coriander leaf`
moves from `Spices, coriander leaf, dried` to `Coriander (cilantro) leaves, raw`,
which is #130 §8's third known case; `radish` moves from `Radish seeds, sprouted,
raw` to `Radishes, raw`; and bare `leaf` moves from pork leaf fat to amaranth
leaves.

**A blanket `-ves` rule is rejected on measurement.** The corpus holds six `-ves`
words and only two are plurals: it would stem `chives → chif`, `cloves → clof`,
`olives → olif` and `additives → additif`. Those still match themselves, because
the tokeniser is symmetric — but a user typing the **singular** `chive`, `clove` or
`olive` would stop whole-word-matching the plural name, which works today. It
breaks three real foods to fix two words.

**`halves → half` is rejected the same way.** It regresses `halves` from
`Nuts, walnuts, English, halves, raw` to a pork rump half, and improves nothing.

ADR-0042 §1's warning that a more aggressive stemmer "starts merging words that name
different foods" is discharged rather than ignored. A query stem is only ever tested
against corpus stems, so a false positive requires two **corpus** words colliding;
across all 1,744 distinct corpus words the new rules create exactly the intended
pairs, `leaf`/`leaves` and `radish`/`radishes`.

### 6. Curated matching reads the expanded query

`curatedMatches` (ADR-0046 §1) is handed the expanded query, for the reason
`0889be6` gave it the shared tokeniser: two paths that read one typed query must not
disagree about what was typed. ADR-0046 §1 is otherwise untouched —
`CuratedStandIn.aliases` addresses a pinned product and keeps its exact/partial
tiers, which a vocabulary table has no way to express.

## Alternatives considered

- **Widen each row's words at corpus-build time.** Rejected in §1: synonym matches
  would cap at the qualifier rungs with an unmatched head and tie into the stable
  sort.
- **Expand on every keystroke, appending expansion hits after literal ones.** The
  ADR-0046 §1 partial-match shape, and it would reach the 21 miss groups whose
  members all retrieve _something_. Rejected because those 21 are, on inspection,
  ranking failures a synonym cannot repair — `egg` → duck egg, `oil` → bearded seal
  oil, `cranberry` → lingonberry — and `SEARCH_RESULT_LIMIT` is 50, so a query
  returning a full page would truncate the appended rows anyway. It would cost a
  second scoring pass on every keystroke that already answers, to buy nothing.
- **A hand-written synonym list.** Rejected in Context: 236 entries to match an
  existing file, and the derived classes show nobody would have picked the right
  ones. A hand list survives only for what OFF does not know (see Consequences).
- **Fetch the taxonomy at runtime, as `off-taxonomy.ts` does for allergens.**
  Rejected on size: 6.4 MB against a 162 KiB gzipped index, for a path that must
  work offline on a cold install.
- **`usda_ndb_code` / `ciqual_food_code` as the plausibility filter.** Rejected on
  measurement in §3.

## Consequences

**425 phrases that answer "No food found" today will answer with the right food**,
every one verified to have a retrieving target. Twelve more come from §5. The
figure was 437 before
[#136](https://github.com/palebluebytes/inventoria/issues/136) landed; that fix
revived every hyphenated key on its own — `mahi-mahi`, `low-fat milk`,
`sheep's milk`, `pili-pili`, `white-flowered gourd` — which is worth recording as
evidence that recall defects overlap.

**425 is reach, not usage, and this record should not be read as claiming
otherwise.** It counts phrases OFF's taxonomy knows, not phrases users type. The
sample in Context raises confidence that the bulk are ordinary, but how often any
one user types one is unmeasured.

**Seven of the seventeen failing British queries are fixed**: `aubergine`,
`courgette`, `rocket`, `swede`, `beetroot`, `cornflour`, `sultanas`. **Ten are
not** — `mange tout`, `prawns`, `gammon`, `mince`, `porridge oats`, `double cream`,
`natural yoghurt`, `plain flour`, `caster sugar`, `jacket potato` — because OFF's
taxonomy does not carry them as members of any group. Each has a target that works
(`prawns → shrimp`, `mange tout → peas edible-podded`,
`jacket potato → potatoes baked`), so the remedy is a small hand-written list
feeding the same seam, as `vocabulary_local`.

**That list is deliberately deferred**, and what it waits on is #124. Its entries
would have to record the description they expect to land on, so a corpus refresh
that moves the answer fails generation rather than silently redirecting
`caster sugar`. Several of those expectations are currently wrong for a reason #124
owns: `plain flour` reaches the **self-rising** row, which is #130 §6's
`white wheat flour` case verbatim. Writing the list before #124 means writing
expectations engineered to break.

**Single-token substitution inside a longer query is not done.** The map is
phrase-keyed, so `aubergine` expands and `raw aubergine` does not. 125 of the 425
keys are single words and 64 of those have all-single-word values, which is the
subset that could safely substitute anywhere in a query. It is left out because it
is **unmeasured** — #130 typed every member verbatim, so nothing in that audit says
how often a synonym appears inside a longer phrase — and because it does not rescue
as much as it appears to: `natural yoghurt` substitutes to `natural yogurt`, which
also retrieves nothing.

**The app takes on a pinned external dependency and a generation step.** Small, but
permanent, and it will need refreshing.

**The vocabulary's admission rests on #130's adjudication**, which was performed by
an LLM applying pre-registered criteria one case at a time. #130 says in its own
words that the judgements are committed so they can be disagreed with individually
rather than taken on trust; the two most load-bearing are `implausible-query` (163
cases, and the deny-list is exactly those) and `peers`. If that call is
systematically wrong in either direction, the 425 moves with it.

**Nothing here improves ranking, and the largest remaining recall question is not
this one.** #130 §6 sized #124 at 35 misses fixable by one key — ungating
`simplicity` from `raw` — over the most-typed words in the app: `egg`, `oil`,
`cheese`, `butter`, `bread`, `milk`. Those hit every user; the 425 hit some users
sometimes.
[#137](https://github.com/palebluebytes/inventoria/issues/137) carries the
unmeasured recall cost of ADR-0048's drop, confirmed on spinach, parsley, basil,
oats and millet, and
[#134](https://github.com/palebluebytes/inventoria/issues/134) carries the 144
regional rows that keep winning top slots.
