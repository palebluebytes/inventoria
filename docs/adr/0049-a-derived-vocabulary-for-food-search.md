# ADR 0049: A word the corpus does not use is expanded before search gives up, from a vocabulary derived rather than written

**Status:** Accepted  
**Date:** 2026-08-20  
**Amended by:** the #139 Amendment below, which measures §3's stopword threshold and corrects the size §3 quotes for the map; and the #140 Amendment below, which corrects Consequences' count of the British queries OFF reaches, refines §6, and admits one change to what a panel says that Scope excluded  
**Amended by:** the #144 Amendment below, which re-derives the map over the corpus [ADR-0042](0042-usda-search-reference-foods.md)'s #144 amendment left behind  
**Implemented:** #139 `4a01dd1`, `5868a7f`, `efadfad` (the map); #140 (the fallback that reads it)

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

## Amendment (2026-08-20, #139): the threshold, measured — and what measuring it moved

§3 left the stopword guard's threshold to be "measured and recorded in the
generator, not chosen by taste". [#139](https://github.com/palebluebytes/inventoria/issues/139)
derived the map and measured it. The threshold is **1.1% of the corpus**, 49 rows
of 4,429, and the map it produces is **433 keys over 329 distinct targets,
16.4 KiB raw and 4.22 KiB gzipped** — not the 425 over 316 §3 quotes. Those two
sizes measure the map alone, as §3's do; the `vocabulary_off` section that
carries it, licence and digest included, is 16.6 KiB raw and 4.4 KiB gzipped.

### The value comes from a plateau, not a preference

Sorted by how many rows they reach, the candidate targets step 424, 217, 116,
116, 89, 88, 83, 77, 57, 44, 43 and then downwards in ones. **Every threshold
between 44 and 56 rows — 1.0% to 1.26% of the corpus — therefore produces the
identical map**, and 1.1% sits in the middle of that band, so a corpus that moves
by a tenth does not move the vocabulary with it. The guard drops nine targets:
`salt` 424, `whole` 217, `beans` 116, `bean` 116, `nut` 89, `milk` 88, `nuts` 83,
`corn` 77 and `nước mắm` 57. The widest it keeps is `cream` at 44. Each
regeneration prints all of that, so the measurement is restated rather than
remembered.

### Reproducing 425 would cost four synonyms

The 425 in §3 needs a threshold near 0.61%. That is not a different reading of
the same evidence: it additionally drops `yoghurt → yogurt`,
`soya bean → soybean`, `minced beef → ground beef` and `milk cream → cream`.
Those are synonyms by any reading, and two of them answer queries #130's own
British list contains. The eight extra keys are that repair, not a loosened
filter — the three cases §3 names as the guard's reason for existing, `salt`,
`whole` and `beans`, are all still dropped.

The guard's one casualty worth naming in the other direction is **`maize`**,
whose only target is `corn` at 77 rows. It is dropped with `corn`, and a
hand-written `vocabulary_local` is where it would come back.

### The deny-list carries 160 tags, not 163

§3 seeds the deny-list from #130's `implausible-query` verdicts and counts 163.
`130-ranking-audit.json` now holds 160: [#136](https://github.com/palebluebytes/inventoria/issues/136)'s
tokeniser fix made every member of `en:java-plum`, `en:pumpkin-leaves` and
`en:grape-leaf` retrieve, so the sweep stopped emitting them as cases. The effect
filter drops all three before the deny-list is consulted, so the shorter list
admits nothing the longer one refused.

### What shipped

Data only, as the ticket scoped it. `search-index.json` gains the
`vocabulary_off` section — `licence`, `source`, `url`, `sha256` and an
`expansions` map, one phrase per line — and `schema_version` moves to 2. The
taxonomy is pinned in `scripts/usda-backup.manifest.json` and read from a local
copy that `pnpm usda:backup fetch` puts there. **Nothing reads the map yet**: the
retrieval fallback §1 describes, the curated-matching change in §6 and the
stemmer widening in §5 are separate tickets.

**§4's visible attribution has not shipped either**, and it is worth naming
separately because the ODbL derivative is already distributed. The sentence on
`SourceExplainerSheet`'s USDA panel naming Open Food Facts and the Open Database
License rides with the fallback in
[#140](https://github.com/palebluebytes/inventoria/issues/140). Until it lands
the licence is declared in the artifact and nowhere a user can see.

## Amendment (2026-08-21, #140): the fallback, built and measured

§1's retrieval fallback, §6's curated-matching change and §4's visible
attribution have shipped.
[#140](https://github.com/palebluebytes/inventoria/issues/140) built them against
the three bars it pre-registered, and cleared all three. **230 of the 233 `miss`
groups close** — every member of the group retrieves — against a bar of 200 and a
starting point of 19. **Every one of the 433 keys now retrieves.** The three
groups that stay open are `en:beans`, `en:milk` and `en:corn`, and they are the
stopword guard's own casualties: their retrieving members are `beans`, `bean`,
`milk` and `corn`, the four widest targets the #139 Amendment records the guard
dropping. `maize` is named there as the one worth naming; `rajma`,
`common bean`, `milk ingredients` and `corn cereal` are the rest of that same
bill.

The `130-ranking-audit.json` this is measured over holds **233** `synonym`/`miss`
groups, not the 238 §3 counts and #140 pre-registered. The file has not been
regenerated since; the bar of 200 was set against 238 and is cleared against 233
either way, and the test that asserts it pins the denominator so a regeneration
that shrinks the set fails rather than flatters.

### Nine British queries answer, not the seven Consequences counted

`prawns` and `mince` answer too, and Consequences names both among the ten OFF
does not carry. It was wrong about both, in two different ways, and neither is a
change of scope:

- **`prawns` reaches the key `prawn`** through §5's plural rule. The count was
  taken over key strings rather than over what the matcher does with them.
- **`mince` reaches the key `minced beef`** through the mid-type tier below,
  which matches a typed word against the key word in the same position. That
  entry is one of the four §3's 425 would have dropped and the measured 1.1%
  threshold keeps.

Eight remain: `mange tout`, `gammon`, `porridge oats`, `double cream`,
`natural yoghurt`, `plain flour`, `caster sugar`, `jacket potato`. The
hand-written `vocabulary_local` those wait on is unchanged, and so is what it
waits on, which is #124.

### Matching is positional, and that is what keeps the map phrase-keyed

§1 says a query is expanded; it does not say how a typed query reaches a key.
The fallback reads one the way `curatedMatches` does and for the same reason — a
key has to be reachable while it is still being typed. An **exact** hit is a query
whose words are the key's words modulo plural; failing that, a **prefix** hit is
one where every typed word starts the key word in the **same position**, so
`aubergin` answers rather than waiting for the final keystroke. Exact hits win
outright.

Positional matching is what makes the phrase-keyed rule mechanical rather than
disciplinary. A key longer than the query is still reachable mid-phrase, and a
key **shorter** than the query is never reachable at all, so `aubergine` expands
and `raw aubergine` does not, exactly as Consequences describes. `seed flax` is
not a way of typing `flax seed` either.

### What it cost

Nothing on the path that already answers. The literal pass runs first and returns
early, so a search that retrieves something scores the corpus once, as it did
before: 2.06 ms for `banana`. Only an empty result pays the second pass, and it
pays it once per expansion the key carries — 2.14 ms for `aubergine`'s single
target, 6.13 ms for `chilli`'s three. Each row keeps its best key across the
expansions and the whole set is sorted once, so the order a key happens to list
its values in decides nothing.

`searchIndexRows` now returns the phrases it ranked against beside the rows,
because §6's curated matching reads them.

### §6's expanded query is the typed query AND its expansions

§6 says `curatedMatches` is handed the expanded query. Read as "the expansions
INSTEAD of what was typed", it takes a stand-in away from a query that answers
today: `cacao b` retrieves no reference food and prefix-matches the key
`cacao butter`, whose expansions — `cocoa butter`, `cocoa fat` — reach none of
the cacao-nibs aliases, so the one result that query has today would disappear.

So the phrase list a search hands on is what was typed followed by anything the
vocabulary offered for it. Ranking is indifferent to the extra phrase, because
the pass that just ran proved it matches no row and it can therefore never be any
row's best key. The curated table is not indifferent, and that is the whole
reason it is there. §1's strict-addition property now holds of both halves of a
search rather than of the reference-food half alone, which is what the ticket's
third acceptance criterion asks for.

### A food is shown under the name that reached it

Scope says this record "does not change what the corpus contains, what any panel
says, or how results are ordered once retrieved". The second of those three no
longer holds, and it was the wrong exclusion. A search for `aubergine` that
answers with `Eggplant, raw` and says nothing else leaves the user to guess
whether the app understood the word or merely found something adjacent — and the
food they then log is called something they did not type.

So a food reached through the vocabulary is displayed under **both** names:
`Eggplant, raw, aubergine`. The alias is the vocabulary KEY rather than the raw
keystrokes, so a mid-type `aubergin` still shows the whole word, and it is the key
whose expansion actually won that row rather than any key the query touched.

It goes on `food/name` rather than into a sibling attribute, and that is the
load-bearing choice. A food's display name has several INDEPENDENT readers, and
only one of them goes through the search mapper: the consumption fold sets a
logged event's name off the twin, the recent list resolves each twin through
`getLocalFoodTwin`, the recipe ingredient resolver reads its own, and the
stager's edit form seeds from it again. A sibling attribute would reach the
readers somebody remembered to join it at, and "everywhere it is displayed" is the
requirement.

A logged event reads the twin's name LIVE rather than freezing it, which is what
makes one write reach every past log of that food at once — and what makes the
first consequence below bite.

Three consequences, none of them free:

- **The alias enters the ledger**, and the ledger is append-only, so it is the
  last search that named the food. Staging the same food again from a plain
  `eggplant` writes `Eggplant, raw` and the alias is gone from every surface at
  once. That is latest-wins working normally, not a defect, but it means the name
  records how the food was last reached rather than how it was first found.
- **`food/name` is now a display name, not the source's own**, which
  `docs/eavt-vocabulary.md` records. Anything deciding something ABOUT a food has
  to read `twin/raw_provenance.raw_data`, where USDA's untouched description
  stays. `deriveNovaVerdict` is the one such reader today and now does: nineteen
  of the 433 keys carry one of its NOVA-3 deny-substrings, and `ginger powder`
  alone would have dropped `Ginger, ground` out of its inferred NOVA 1.
- **The displayed word is OFF's**, where the sentence below assumed none would
  be. The attribution it describes already covers it — it names aubergine,
  courgette and minced beef in its own copy — but the reasoning "no OFF data is
  displayed here at all, only used" is no longer why the treatment is light.

### The attribution the #139 Amendment left declared and invisible

One line on `SourceExplainerSheet`'s USDA panel now names Open Food Facts and the
Open Database License, in the quiet-but-visible treatment `NovaExplainerSheet`
uses. It says what is true: no OFF data is shown on a USDA food, but search
understands other names for it from OFF's taxonomy. It shows for every USDA food,
which is §4's deliberate over-attribution in the safe direction.

## Amendment (2026-08-21, #144): the map re-derived over a smaller corpus

§3 derives the map **from the finished corpus**, so a filter change moves it.
[ADR-0042](0042-usda-search-reference-foods.md)'s
[#144 amendment](0042-usda-search-reference-foods.md#amendment-2026-08-21-144-a-head-word-cannot-tell-a-staple-from-a-confection-and-a-manufacturing-input-is-not-a-food)
dropped 76 rows, and the regenerated map is **435 keys over 332 distinct targets**,
not the 433 over 329 the #139 Amendment measured.

**The threshold did not move, which is the claim §3 made for it.** The corpus fell
1.7%, the guard stayed at 1.1% — 48 rows rather than 49 — and it drops the same nine
targets and the same seven keys. That is the 44-to-56-row plateau above doing exactly
what it was measured for. Re-measured, §3's stopword paragraph now reads `salt` 424 of
**4,353** rows, `whole` 217 and `beans` **115**: only the denominator and `beans` move,
and the generator comment that restates those three carries the new figures.

**Both new keys are phrases that used to "retrieve" one wrong row.** `powdered milk`
matched a single record, `Dessert topping, powdered, 1.5 ounce prepared with 1/2 cup
milk`, and `hydrogenated palm kernel oil` matched only the industrial confection fats.
With those gone the phrases retrieve nothing and become misses the map answers —
`powdered milk` with `milk powder` and `dry milk`, and the palm kernel phrase with the
confectionery shortening that is still there. A smaller corpus made the fallback
larger, and in both cases more nearly right.
