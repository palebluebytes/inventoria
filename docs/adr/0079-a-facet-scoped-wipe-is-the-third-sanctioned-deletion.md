# ADR 0079: A Facet-scoped wipe is the third sanctioned deletion, and exclusive ownership is what makes it safe

**Status:** Accepted  
**Date:** 2026-09-01  
**Implemented:** whole. §4's jar-wide half at #290 — `vacuumLedger` in `src/lib/db/db.core.ts`, its own worker operation, attempted after the `clear` commits, with the storage figure on the same screen re-read once it returns. The scoped wipe at [#311](https://github.com/palebluebytes/inventoria/issues/311) — `deleteDatomsByEntityPrefix` in the same module, the predicate derived in `src/lib/facets/facet-wipe.ts`, the control and its export in `src/lib/views/food/FoodDataSection.svelte` on Rations settings. §8 is open by construction and stays open.

## Context

[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) made Rations installable
on its own. [ADR-0078](0078-a-facet-contains-no-way-out.md) then made it a place you
cannot leave: a Facet's entry mounts its own screens and nothing else, and root Settings
is unreachable from it. Between them they create a user who can put food into the Jar
and has no route to any control that takes it out again.

`AGENTS.md` §3 and `CODING_STANDARDS.md` §1 are unambiguous about the shape that control
cannot have. Never `UPDATE` or `DELETE` against `datoms`, with exactly two sanctioned
exceptions — `resetLedgerSchema` and the one-shot ADR-0020 migration, both in
`src/lib/db/db.core.ts` — and _do not add others_. A wipe scoped to one Facet is a third.
The parent map ([#267](https://github.com/palebluebytes/inventoria/issues/267), decision 11) chose to widen that line by record rather than route around it, and this is the
record that has to make the argument stick or fail trying.

Two alternatives were live and both were rejected on their merits.

**Retraction datoms.** Append tombstones so the fold returns nothing; the ledger stays
append-only and the red line is untouched. It fails the user's intent rather than the
architecture: food's bulk is base64 photos carried in datoms
([ADR-0066](0066-a-captured-photo-is-bounded-before-it-becomes-a-datom.md)), so a
tombstone-only wipe frees nothing and leaves the database strictly larger than it was.
A wipe that grows the file is a lie told to the person who asked for it.

**No Facet-scoped wipe at all**, leaving the jar-wide `Wipe Database` at the root. Under
ADR-0078 this leaves a standalone Rations user with no reachable route to any wipe, which
is not a decision about deletion so much as a decision to withhold it from one platform's
users.

**The space claim in the map's decision 11 was checked against the code and found false
as written.** There is no `VACUUM` and no `PRAGMA auto_vacuum` anywhere in `src/`.
SQLite's default `auto_vacuum=NONE` returns freed pages to the freelist and never shrinks
the file, so today's jar-wide `Wipe Database` — a `DROP TABLE datoms` — reclaims no disk
space either, and `navigator.storage.estimate()` reports the same usage after it as
before, on the same screen that displays the figure (`StorageStatus.svelte:60-68`). The
distinction between deleting and tombstoning is real but narrower than the map claimed:
a delete lets pages be **reused** so the file plateaus, where a tombstone makes it grow.
Neither keeps the promise "this frees space" without a `VACUUM` this codebase has never
run. That gap is fixed rather than argued around — see §4.

**Scope.** This record settles what a Facet-scoped wipe takes, how its predicate is
derived, what makes it safe against the red line, whether it reclaims space, what it says
to the user, and where it lives. It does **not** settle: whether a converged peer
re-supplies wiped rows (§8); where settings live, which
[#288](https://github.com/palebluebytes/inventoria/issues/288) decides by moving them out
of the ledger entirely; how exclusive entity ownership is achieved, which
[#289](https://github.com/palebluebytes/inventoria/issues/289) decides and which this
record depends on; or which of a Facet's controls appear on its own surface, which is
[#275](https://github.com/palebluebytes/inventoria/issues/275)'s. It builds nothing:
the registry it derives from does not exist yet (ADR-0076 §6), and neither does the
control.

## Decision

### 1. The wipe deletes rows, and it is safe because it is closed

The red line exists to stop **state being mutated by deletion** — a fact silently changing
its value rather than being superseded by a later one. A Facet-scoped wipe mutates no
state. It is the same _retire this whole ledger_ act `resetLedgerSchema` already performs,
narrowed to one Facet's rows.

That argument is not sufficient on its own, and the insufficiency is the interesting part.
`resetLedgerSchema` is safe **because it is total**: afterwards no fold can produce a wrong
answer, because there is nothing left to fold. A prefix-scoped delete is partial, so it can
leave rows that reference rows that are gone.

**So the widening is conditional, and the condition is closure.** A Facet-scoped wipe is
sanctioned only where the set of rows it removes is **closed under reference**: nothing
surviving the wipe points at anything it took. A Facet that cannot show this does not get
a wipe.

Rations satisfies it today. Every food reference edge stays inside food's own entities —
`recipe/ingredients` holds `{ ref, amount, unit }` where `ref` is a food twin
(`calorie.store.ts:419,445`), a recipe instantiation's `based_on` equals its own
`event/target`, and each domain writes `event/target` only to its own twin kind: food's
at `calorie.store.ts:141`, habits' at `habits.ts:59`, media's at `engagement.ts:18,48`,
items' at `acquisition.ts:12`. Nothing outside food points into food.

Closure is a property of the **ledger**, not of the screens. A projection may still read
across the boundary, and one does: `ACQUISITION_LIBRARY` promotes any entity carrying a
`twin/`-prefixed attribute to an acquisition twin, so every food twin already appears in
the Items tab as a nameless "wanted" item
([#280](https://github.com/palebluebytes/inventoria/issues/280)). A wipe that is closed
under reference would still visibly empty another Facet's screen. **#280 is therefore a
prerequisite of this wipe, not an unrelated defect** — a control whose central claim is
"this touches nothing else" cannot ship while that is false.

### 2. A Facet-scoped wipe takes everything the Facet owns, in whatever store it sits

Ownership is the rule. Storage medium is incidental and must not be used as a proxy for
it, because the same fact moves between stores without changing whose it is —
[#288](https://github.com/palebluebytes/inventoria/issues/288) moves the whole of
`settings/` out of the ledger and changes nothing about who owns a nutrition target.

A Facet-scoped wipe takes:

- every datom whose **entity** carries one of the Facet's entity prefixes;
- every `localStorage` record under the Facet's own namespaces — its log channels, its
  settings keys, its view preferences.

It takes nothing else. Device identity, another Facet's rows and another Facet's keys all
survive, and so does anything the root owns.

For Rations as of this record, that means: the datoms under `fdc:`, `gtin:`,
`food:custom_`, `recipe:` and `event:consume_`; the `#142` search-log channel; food's
nutrition targets, limits, profile and calculated targets; the nutrition panel's fold, its
visible-nutrient selection and its rounding preference; and food's Open Food Facts
contribution consent. It does not take the scraper proxy, the TMDB key, the log-export
consent, or anything under `twin:`, `isbn:`, `tmdb:`, `habit:`, `cal_event:`,
`event:execute_`, `event:engage_`, `event:occur_`, `event:acquire_` or `notes:`.

### 3. The predicate is generated from the registry, and is sound only because ownership is exclusive

The predicate is **derived** from the Facet's registry entry (ADR-0076 §6) — its entity
prefixes and its `localStorage` namespaces — and is never authored. A second hand-written
list drifts the first time a prefix is added, and the drift is silent: the wipe reports
success having missed rows.

ADR-0076 §4 already says a Facet owns **entities**, never attribute namespaces. That is
necessary and it is not sufficient, because an entity prefix can be **co-owned**: `gtin:`
is minted by both Open Food Facts (`open-food-facts.ts:534`) and the Items scraper
(`json-ld.ts:110`), and `isbn:` by both the scraper (`json-ld.ts:112`) and Open Library
(`open-library.ts:26`). Scrape a grocery page and scan that product's barcode and both
Facets have written to one entity.

Two mechanisms were considered for a co-owned entity. **Subtracting the other Facet's
attributes** was rejected: it collapses one level down, because `twin/brand` is written by
Open Food Facts (`open-food-facts.ts:493`), by the Items scraper
(`ItemImportPanel.svelte:53`) and by the user as a label correction
([ADR-0034](0034-label-photo-food-capture.md) §6), and **nothing in a datom records which
Facet wrote it** — the ledger stamps a `device_id` and never an owner, so per-row
co-ownership is undecidable by construction. **Leaving co-owned entities standing** was
rejected as a silent leak of exactly the kind ADR-0076's Consequences already name as its
weak joint.

**So co-ownership is dissolved instead of accommodated, and this record depends on that
rather than performing it.** The rule stated here is:

> A Facet-scoped operation is defined only over entities with exactly one owner. Where two
> Facets can mint the same entity prefix, the collision is a defect to be removed, never a
> case for the operation to handle.

[#289](https://github.com/palebluebytes/inventoria/issues/289) removes the collisions and
enforces the invariant. Until it lands, this wipe has no sound predicate, which makes it
a hard prerequisite alongside #280.

### 4. A wipe reclaims space, and the `VACUUM` is best-effort

**A wipe reclaims space, and this binds both wipes** — the Facet-scoped one and the
jar-wide `Wipe Database` that has never done so
([#290](https://github.com/palebluebytes/inventoria/issues/290)). It would be incoherent
for this record to establish that a wipe frees space while the app's oldest wipe does not.

The `VACUUM` is **best-effort and separate from the delete**, for two reasons. It cannot
run inside a transaction, so "both or neither" is not expressible in SQLite. And it
rewrites the file whole and needs the headroom to do it — which means the wipe most likely
to fail is the one performed by a user who has run out of space, and coupling them would
make the app **refuse the part that helps** because the optimisation is impossible.

So: the delete commits; the `VACUUM` is attempted; if it fails the rows are still gone,
the freed pages are still reusable, and the storage figure has simply not moved. The
control reports what happened rather than claiming what it intended.

### 5. It says what goes and what stays, and it counts before it speaks

The root's `Wipe Database` confirms through a single sentence because everything is
unambiguous — there is nothing to distinguish. A scoped wipe's entire risk is the user's
model of the boundary being wrong, so it **enumerates**: what goes, and what stays.

It is called **"Delete all my food data"**, not "Wipe Rations". In a standalone install
the user has no evidence Rations is part of anything, so a Facet's own name reads as _the
whole app_ — and on iOS, if [#287](https://github.com/palebluebytes/inventoria/issues/287)
reports one jar per install, it may literally be. The wording names the noun the user
thinks in and needs no vocabulary to parse.

The dialog **counts against the ledger rather than reciting policy**. The wipe already
computes its own row set, so the figures are free, and a confirmation that reports on
_your_ data is the difference between one that is read and one that is clicked through.

### 6. It is a control of the Facet, and an export sits beside it

A Facet's scoped wipe lives with the Facet's own settings — for Rations, in
`FoodSettingsSheet` — and it appears at the root **only wherever that Facet's own screens
already appear**. It is not a root inventory of Facets with a wipe button each: that is
the launcher ADR-0076 and the map's decision 3 both refuse, and it would need a second
enumeration of Facets that ADR-0076 §6 says must be the registry.

**A Facet-scoped wipe requires a Facet-scoped export beside it.** ADR-0076 §5 says
inspection tools do not follow a Facet; an export next to a raw datom viewer is an
inspection tool, but an export next to a delete button is a **safety control**, and
pairing them is what makes the delete defensible. Shipping the irreversible half alone,
into the one Facet that by ADR-0078 cannot reach the other half, is the worst available
split of the pair. Which surface carries it is
[#275](https://github.com/palebluebytes/inventoria/issues/275)'s to place; that it exists
is this record's requirement.

### 7. The wipe is platform-blind

There is one behaviour on every platform. Nothing branches on `display-mode`,
`navigator.standalone`, or a guess at which storage jar the page is in — §8 of the iOS note
(`docs/research/286-ios-home-screen-storage-jar.md`) establishes that the page
**cannot** detect that, so a design needing the branch would be undeliverable.

It is also unnecessary. If iOS gives each Home Screen web app its own jar, a Rations
install was never holding the root's rows, so the wipe removes **less than the user
feared and never more**. The undetectable case is the harmless one.

### 8. Deletion and convergence are unreconciled, and that is named rather than solved

ADR-0072–0075 design convergence and never deletion. This is the first operation that
removes rows a peer may still hold, and a delete-then-converge in a system with no
tombstones re-supplies them: **a Facet-scoped wipe and a syncing peer are incompatible
without a deletion protocol.**

That protocol is not designed here. None of the p2p arc is present on `main` — no
`src/lib/p2p/`, no ADR-0072–0075 in the tree — and writing a rule into a record about
wiping, governing machinery this branch has never seen, would be deciding a p2p question
in the wrong place. **The first convergence design to reach `main` must answer it**, and
this clause exists so that it cannot be missed.

## Consequences

**The red line gains a third exception, and a condition it did not have.** `AGENTS.md` §3
and `CODING_STANDARDS.md` §1 must both name the scoped wipe when it is built — not now,
because naming a function that does not exist would be the same lie in code ADR-0076 §6
refused for the registry. The condition in §1 is the part worth carrying forward: the two
existing exceptions were sanctioned individually, and this record is the first to say
_what would make a fourth acceptable_. A future deletion must show closure or be refused.

**The wipe has two hard prerequisites and cannot ship before either.**
[#280](https://github.com/palebluebytes/inventoria/issues/280) — while the acquisition
fold promotes food twins, a food wipe silently empties rows from the Items tab, which is
the exact promise §5's dialog makes. And
[#289](https://github.com/palebluebytes/inventoria/issues/289) — while `gtin:` and `isbn:`
are co-owned, §3 has no sound predicate to derive.

**ADR-0076 §4 keeps its rule and will lose its stated reason.** §4 is justified there by
`twin/` and `event/` being written by several domains. #289 splits `twin/`, at which point
that evidence is gone and a reader could conclude the rule was never load-bearing. The
rule survives on a different footing — an entity is the unit closure is proved over
(§1) — and #289 owes §4 that correction.

**A user who wipes on one device and syncs will see their food come back**, until the
convergence design answers §8. This is the sharpest unresolved edge in the record.

**The `VACUUM` can fail for the user who most needs it.** §4 accepts this rather than
hiding it: a nearly-full jar cannot be rewritten, so the delete succeeds and the storage
figure does not move. The alternative was refusing the delete, which helps nobody.

**Cross-device nutrition targets are lost as a side effect of
[#288](https://github.com/palebluebytes/inventoria/issues/288)**, not of this record — but
this record's §2 is what makes them the Facet's to wipe wherever they live, so the two
land together and should be read together.

**Nothing here decides whether Rations ever grows a pantry.** If it does, it must not
reuse the acquisition vocabulary: "owned" for a tin of tomatoes means it is in the cupboard
and it is then consumed, a state Items has no word for because a guitar is never used up.
Acquisition status is a two-state latch on a durable object; a pantry is a quantity that
depletes. Reusing one for the other would be the next `twin/`.

## Amendment (2026-09-02): §4 named the wrong resource, and pointed the risk at the wrong wipe

§4's conclusion stands, and the measurement below strengthens it: the `VACUUM` is
best-effort and separate from the delete. What is false is the reason given beneath it.

> And it rewrites the file whole and needs the headroom to do it — which means the wipe
> most likely to fail is the one performed by a user who has run out of space, and
> coupling them would make the app **refuse the part that helps** because the
> optimisation is impossible.

Measured while building [#290](https://github.com/palebluebytes/inventoria/issues/290),
against the sqlite-wasm build the app actually ships:

```
COMPILE OPTIONS:      MAX_MMAP_SIZE=0, TEMP_STORE=2, THREADSAFE=0
PRAGMA auto_vacuum  = 0        page_size = 8192
2000 rows of 4 KB   → page_count 1002
after DROP+create   → page_count 1002, freelist_count 1000
after VACUUM        → page_count    2, freelist_count    0
```

`TEMP_STORE=2` is _memory_, and `PRAGMA temp_store = 0` means "use the compile-time
default", so nothing the app can set moves it. **`VACUUM` stages its rewrite in RAM, not
on disk.** The resource it needs is memory proportional to the **surviving live set**,
not free disk proportional to the whole file.

That relocates the risk. After the jar-wide wipe the live set is empty and the staged
database is two pages, so the wipe §4 named as the likely failure is the one that can
barely fail at all. The exposure belongs to the Facet-scoped wipe, whose survivors are
everything that is not food.

**How large that is belongs to
[#311](https://github.com/palebluebytes/inventoria/issues/311) to measure, and is not
this record's to guess.** The scoped wipe does not exist yet, and the figure that matters
is the size of a real jar's surviving non-food live set on a real device. A correction
that invents a number it cannot take repeats the mistake it is correcting.

The Consequences entry "**The `VACUUM` can fail for the user who most needs it**" is false
in the same way and is corrected the same way. It can fail for a user holding a large
_surviving_ set, which is not the user who filled the jar with food and then asked for the
space back.

The jar-wide half of §4 has shipped with #290: `vacuumLedger` in `src/lib/db/db.core.ts`,
reached by a worker operation of its own, attempted after the `clear` has committed.
`CODING_STANDARDS.md` §1.1 and `AGENTS.md` §3 each now say in a clause that a `VACUUM` is
not a third sanctioned destructive operation, so the whole-file rewrite landing inside the
module those two sentences fence is not argued twice.

## Implementation note (2026-09-02): what #311 built, and the two figures it could not take

The wipe is `deleteDatomsByEntityPrefix` in `src/lib/db/db.core.ts`, beside the
two sanctioned deletions it joins; `AGENTS.md` §3 and `CODING_STANDARDS.md` §1.1
both name it and both carry §1's closure condition, so a fourth deletion meets
the bar before it is written rather than after. The predicate is derived in
`src/lib/facets/facet-wipe.ts` and authored nowhere.

Three things the design did not anticipate are worth recording.

**A prefix ending in `_` is a wildcard to `LIKE`.** Two of food's five do:
`food:custom_` and `event:consume_`. Written the obvious way, the wipe would
have taken `food:customer_1` and `event:consumed_1` as well, and the count shown
to the user would have agreed with it, because both halves would have been
wrong in the same direction. The predicate is `substr(entity, 1, n) = prefix`
for that reason, and `facet-wipe.test.ts` pins it with entities built to be
caught by the wildcard and by nothing else.

**§2's derivation from the registry alone is incomplete, and the gap is a log
channel.** A channel's `localStorage` key follows its **name** —
`inventoria_log_search` — while §2 derives keys from the domain's declared
`storagePrefixes`, none of which that key is under. A wipe deriving from the
registry alone would have left food's search records behind while reporting that
it had deleted all food data. The fix keeps the rule and widens the derivation:
a channel already declares the domain that writes it (ADR-0080 §1), so the key
set is the declared prefixes **plus** the keys of the Facet's own channels, and
`channelStorageKey` is exported from the facility for it. Nothing is written
down twice.

**The wipe needs a reload, and it is the settings design working rather than
failing.** Every store in `stores/device-settings.ts` is seeded from
`localStorage` at import and held for the life of the page, deliberately, so a
target the first paint depends on is right in the first frame (ADR-0085). The
wipe removes those keys underneath the running page, and the only thing that
makes the snapshots agree with the jar again is a new first frame. The control
says so and offers the reload rather than reloading out from under a user who
has just been told what happened.

**The two figures this record asked #311 for were not taken, and inventing them
is what the amendment above forbids.**

The 2026-09-02 amendment relocated §4's `VACUUM` risk to the scoped wipe and
said the figure that matters is "the size of a real jar's surviving non-food
live set on a real device". That is a measurement of somebody's jar, and this
branch has no such jar: a synthetic corpus would measure the corpus. What was
built instead is the reporting the amendment implies — the vacuum is attempted
after the delete has committed, a failure is caught, and the sentence the user
reads distinguishes "the space has been handed back" from "the space could not
be handed back, so it is reusable by this app rather than free". The exposure is
real, it is now visible when it fires, and the number stays untaken.

**The export is restorable and there is no route to restore it from Rations.**
The scoped export writes the same `inventoria-ledger` artifact at the same
schema version, carrying a `scope` field an older reader ignores, so the
whole-ledger Import reads it back row for row. That Import is on root Settings,
which ADR-0078 §7 gives a standalone Rations user no way to reach. The export is
still the safety control §6 requires — a copy the user holds, on a device they
control, in a format that restores — but the round trip is only closed for
someone who can reach the root. Naming that is better than a control that
implies otherwise, and closing it is a Rations-side import, which is a decision
about a second surface rather than a defect in this one.
