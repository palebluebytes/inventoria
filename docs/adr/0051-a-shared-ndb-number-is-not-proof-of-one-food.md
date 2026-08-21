# ADR 0051: A shared `ndbNumber` is evidence, not proof — the twin merge is refused where an adjudication says USDA numbered two foods alike

**Status:** Accepted  
**Date:** 2026-08-21  
**Implemented:** #145 `c38ff91` (the pre-registration), `ef989ca` (the sweep), `b45b1ab` (the ledger and the key), `b0512bb` (the regenerated corpus), `6c1c57c` (the named assertions)

This record amends [ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §4,
which closed the twin merge to `ndbNumber` and forbade a hand-curated pairing
list, and [ADR-0045](0045-usda-stays-the-base-food-composition-authority.md) §2,
whose merge collects records under that key. It corrects the measured Context of
[ADR-0050](0050-a-merged-food-keeps-the-name-its-twin-lost.md), whose alias
population shrinks, and the corpus tally
[ADR-0047](0047-bundle-the-usda-archives-and-retire-the-api.md) §4 carries.

## Context

`Watermelon, seedless, flesh only, raw` is not `Watermelon, raw`, and ADR-0048 §4
said so:

> a new NDB number is USDA stating that a record is a new food identity

That is true. It is also not what `groupByIdentity` depends on. The merge does not
rely on "a new number means a new food"; it relies on the **converse** — that a
_shared_ number means the _same_ food. USDA reuses numbers across Foundation and
SR Legacy, and where it does, two different foods fuse and one leaves the corpus
wearing the other's name.

`Apples, honeycrisp, with skin, raw` and `Apples, raw, golden delicious, with skin`
both carried 9501. Honeycrisp shipped; Golden Delicious did not, and the panel
that shipped was part Golden Delicious. This is the failure §4 wrote itself to
prevent — "a merge that overrides that attributes one food's composition to
another, silently, in the direction the reader is least able to check" — arriving
through the door §4 left open.

### The population, and why the familiar number is the wrong one

Over the two bundled archives, 8,156 records collapse to 7,974 identity groups.
**190 hold more than one record**, every one of them exactly one Foundation record
and one SR Legacy record. There is no group of three, and no multi-record group is
keyed by the `desc:` fallback.

Three counts have been in circulation and none of them is this one. #137's
grilling said 78, its implementation corrected that to 87, and ADR-0050's Context
says 93 of 165. **87 is the right population for an alias**, which only exists on a
row that ships. It is the wrong population for a **merge decision**, which is taken
before any filter has run.

That distinction is not academic. Of the 25 pairs whose merged row is filtered out,
exactly one has a loser that passes every filter alone:

> `Orange juice, raw` is fused into Foundation's refrigerated
> not-from-concentrate record, and the merged row is dropped as a processed
> product.

Raw orange juice was absent from the corpus and no judgement had ever been made
about raw orange juice. A filter removed it by reading a name belonging to a
different record.

### No mechanical rule separates a rename from a fusion

This was measured rather than assumed. #137 tested "do the two names differ by a
preparation word?" and it flags 33 of 87 while being wrong in both directions: it
flags `Nuts, pecans` against `Nuts, pecans, halves, raw`, a harmless rename, and
**misses Honeycrisp entirely**, because separating two cultivar names needs a
cultivar vocabulary rather than a word list.

The alternative mechanical rule — merge only where the two descriptions are the
same words — needs no adjudication and kills every fusion by construction. It was
costed and rejected: it un-merges all 87 including the 80 harmless renames, grows
the corpus by ~80 near-duplicates, deletes five oils and two butters for want of
energy, and makes ADR-0050's alias apparatus dead code.

So the evidence is a hand adjudication, pre-registered before a pair was read
(research note [145](../research/145-twin-fusion-adjudication.md), committed at
`c38ff91` with all 190 verdicts `null`).

### What the sweep found

**Eight of 190.** The pre-registration predicted 15–30 and was wrong on the high
side, for a reason worth keeping: **USDA's `dried` on a nut or seed means
_unroasted_, not dehydrated.** All four dried-against-raw pairs — pine nuts,
sunflower kernels, pumpkin kernels, chia — merge, because every roasted form holds
its own number and the base number is therefore the plain commodity. Three of the
four were named in #145's own ticket as probable fusions.

Naming the third record, rather than reading the two names, did the work in both
directions. It caught two near-misses: pollock is one species by the Foundation
record's own `scientificName`, with Atlantic pollock holding 15065; and 20038 is
rolled oats specifically, because Foundation minted a new number for steel-cut. It
also settled four pairs that read like narrowings and are not — mature spinach,
mature carrots, green cabbage and ripe bananas are renames, because USDA gave baby
spinach, baby carrots, red cabbage and overripe bananas their own numbers.

## Decision

### 1. A shared `ndbNumber` collects two records only where an adjudication has not refused it

ADR-0048 §4 is amended. The merge still pairs on `ndbNumber` and is still never
widened to description similarity or fuzzy matching — the measurement above is why,
and it is stronger evidence for that half of §4 than §4 had. What changes is that
the key is no longer taken as proof. A **ledger** of adjudicated verdicts names the
numbers whose two records must not meet.

§4's ban on "a hand-curated pairing list" stands as written and this is not one. A
pairing list creates merges that USDA's data does not support. This refuses merges
that USDA's data does not support, which is the same principle pointed the other
way.

### 2. The refusal happens at the key, and the merge is untouched

`fdcIdentityKey` gains the split set as a **required argument** and gives each
record of a refused pair a key of its own, `${ndbNumber}:${fdcId}`. The two never
meet, and `resolveFdcGroup` needs no clause, no flag and no knowledge that any of
this happened.

The set is an argument rather than an import because the ledger must not enter a
bundle a user downloads, and it is required rather than defaulted because a caller
passing nothing would group records one way while the generator grouped them
another — the drift ADR-0047 §4 exists to prevent. There is exactly one caller.

### 3. Every pair is adjudicated, and generation fails on one that is not

The ledger holds all **190** pairs, not the eight. A record that answers "what have
we looked at" cannot hold a category it declines to look at.

`assertTwinLedgerCovers` therefore fails in **both** directions: on a twin pair the
ledger does not name, and on a ledger entry the archives no longer produce. It
compares `ndbNumber` plus both descriptions with archive boilerplate stripped,
because the verdict was reached by reading those words and a refresh that rewrites
either one must not silently reuse a judgement about a different name.

The consequence is deliberate and is the price of the instrument: **a mirror
refresh must adjudicate its new twins before it can ship.**

The check asks what USDA's numbering makes, which is a second grouping with an
empty split set. Asked after the splits are applied it finds no pair at all —
a refused pair's records key apart by construction — and reports every true
finding as a stale entry.

### 4. A split record carries only its own measurements

No fill survives a split. Honeycrisp loses the borrowed trans fat, vitamin A and
vitamin E, and the display path renders them `0`; that is a pre-existing gap in
that record, not one this decision opens (ADR-0048 §1).

The alternative was live and is rejected in writing, because someone will propose
it again: **split the identity but keep the fill.** It would leave a part-Golden-
Delicious Honeycrisp panel sitting beside a Golden Delicious row holding those same
numbers under its own name, which is worse than one row and one story.

### 5. A split record is an ordinary record, and no filter bends for it

The loser rejoins the corpus subject to the whole roster. Where a filter then drops
it, it is dropped, and no alias resurrects it — ADR-0050's alias asserts
retrievability _of a row_, and after a split there is no such row.

**No filter is widened by this record**, and one candidate is refused explicitly.
An earlier reading held that splitting 11243 would admit `Mushrooms, portabella,
grilled` as an escape and that `PREPARED_DISH_MARKERS` should catch it. Measured
over the shipped corpus, **`grilled` already marks 151 rows** — essentially every
beef, veal and lamb steak, plus a grilled portabella that already ships under
ndbNumber 11939. ADR-0042 §5 has ruled that a plain fried egg is a reference food,
and research note [143](../research/143-canonical-record-measure.md) §6 measured
that dropping prepared rows makes a logged bowl of rice a silent 3× overestimate. A
grilled portabella is a reference food by this corpus's own rule.

### 6. The adjudication's reasoning is evidence and lives outside the code

`src/lib/food/usda-twin-ledger.ts` carries what the rule and the check need:
`ndbNumber`, a reason code from a closed set fixed before the sweep, and the two
descriptions. `docs/research/145-twin-ledger.json` carries the reasoning, the
`fdcId`s, and the third record every `separate-ndb-elsewhere` verdict rests on. A
test locks the two together over all 190.

The module is reached through the same esbuild seam as ADR-0049's deny-list and is
imported by nothing in the app, so the adjudication never ships to a user.

## Consequences

**The corpus is 4,360 rows, from 4,353.** Six pairs become two rows each;
`Salt, table, iodized` is deleted; `Orange juice, raw` is admitted. ADR-0047 §4's
tally moves for the fifth time.

**One row leaves, by name.** `Salt, table, iodized` is a Foundation record that
measured nothing at all and borrowed every one of its seventeen panel fields from
plain table salt. Un-merged it reports no energy and ADR-0048 §5 drops it, so the
corpus now holds plain `Salt, table` and no iodized salt. It is asserted absent in
a test, because a deletion visible only as a missing search result reads as a bug.

**ADR-0050's measured Context is corrected.** Aliases go from 87 to 80: a refused
pair discards no name and so mints none. Seven of the eight were aliased; the
eighth's merged row never shipped. That record's rule is unchanged — a surviving
merged row still answers to the name its twin lost — and only its numbers move.
Its "93 of the 165 surviving twinned foods" was measured against the pre-split
corpus and now reads 158 twinned survivors, of which 157 borrowed a field.

**Search gained almost no duplication.** The measurement §9 of the research note
deferred: over all 524 head phrases in the corpus, **two** put both rows of a split
pair in the top three — `spelt` and `flaxseed` — and in both the two rows are
genuinely different things. `spelt` already returned `Spelt, cooked` beside them.
No follow-up is routed.

**The eight refusals are pinned individually**, not counted, along with the two
cases where the split is meant to look like nothing happened: `honeycrisp` still
leads with Honeycrisp and `portabella` still leads with the raw mushroom.

**What this record does not do.** It does not change ranking, does not touch the
barcode path or manual entry, does not curate a stand-in for the row it deletes
(though ADR-0048 §7 makes iodized salt eligible), and does not claim the 190 are
the last of them. The census check is what handles the next ones.
