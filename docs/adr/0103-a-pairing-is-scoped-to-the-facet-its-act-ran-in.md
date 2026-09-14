# ADR 0103: A pairing is scoped to the Facet its act ran in, and the root's scope is the whole Jar

**Status:** Accepted  
**Date:** 2026-09-13  
**Amends:** [ADR-0084](0084-a-hand-off-belongs-to-the-facet-that-owns-what-it-carries.md) (§6's second half is reversed: own-device convergence no longer stays the root's, and a food-only user gets it. §6's first half — meal send and receive are Rations' — stands unrevised, and §1's ownership key is what this record extends rather than replaces)  
**Amends:** [ADR-0096](0096-devices-converge-without-both-being-awake-through-a-store-of-sealed-deltas.md) (§7's _a Rations-only user never converges_ is repaired rather than restated, and its two reasons for leaving it are answered; §3's Deposit gains a scope; §8's closing exchange gains one statement; §11's K counter becomes per-pairing and blind to which Facet woke; §12's carried deletion gains the subset rule)  
**Amends:** [ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) (§6's version vector is re-keyed by originating device **and Tracked Domain**; it stays a read of `datoms` and its argument against a scalar watermark survives, widened to a second axis)  
**Amends:** [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) (§9's _a food-only user therefore has no p2p at all_ is now false in both halves; §2's table gains a Paired devices row)  
**Amends:** [ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) (§7's refusal to let a sender learn anything about the recipient's device is stated not to govern own-device pairing, which it was never written about)  
**Implemented:** #420 — §7's gate alone. `docs/eavt-vocabulary.md` now marks every attribute that holds an entity reference, `referencesOf`'s edge set is data rather than `case` labels and is exported from `src/lib/p2p/meal-payload.ts`, and `tests/unit/meal-payload.test.ts` holds the one to the other under `pnpm test:unit`. The documented set is **five** attributes and not the three §7 names, so what shipped is a partition rather than the containment asked for, and the first Amendment at the foot of this record carries that argument. **#419 — §5, and §6's attribution rule.** `src/lib/db/version-vector.ts` is keyed by `(device_id, Tracked Domain)`, `domainsOfRow` there is the attribution rule and `CONTENT_DOMAINS` in `src/lib/facets/registry.ts` is the axis roster; the query and the `WHERE` share one registry-derived predicate, and `tests/unit/version-vector.test.ts` holds that predicate to `domainsOfRow` one row at a time through the real engine. The second Amendment carries what §5 left to the implementer, and the third carries which half of §6 that left standing. **#421 — §1 to §4.** `src/lib/p2p/lane-scope.ts` is a lane's scope, `entityPrefixesOfDomains` in the registry is the one derivation a wipe's predicate and a lane's now share, the domain set rides the first sync's opening frame and `PairedDevice.scope` keeps what the two ends agreed; `tests/unit/first-sync.test.ts` proves a food lane against two real ledgers, both re-pairing directions included. The third Amendment carries where §3 put the statement and what §1's predicate cannot say. **#422 — §9, and the crossing half of §6 that #421 left.** `readLedgerPage` takes a Lane scope whole and derives both arms of what a lane carries from it (`laneScopeMatch` in `src/lib/db/db.core.ts`), `wake.ts` deposits inside the scope its caller hands it, and `wake-errand.ts` is where a wake names its Facet — `openAppWake("root")` in `src/App.svelte` and `openAppWake("food")` in `src/Rations.svelte`, which is what closes #415. `tests/unit/wake-facet.test.ts` holds §9's table against two real ledgers either side of the real store route. The fourth Amendment carries the case §9's table has no row for and what it cost §11's counter. **#423 — §8 and §10.** `src/lib/views/food/FoodSettingsSheet.svelte` mounts the root's own `src/lib/views/pairing/PairedDevicesSection.svelte` by reference under `facetId="food"`, so the act, the list, the naming, the two-phase unpair and §11's two states are Rations' entire rather than copied; `carriesLine` there is §10's scope line, read off `TRACKED_DOMAINS`' user-facing names; `tests/unit/rations-settings.test.ts` holds the population to one module and `tests/unit/facet-wipe.test.ts` proves §8 over every Facet's storage predicate rather than over food's. The eighth Amendment carries the sentence of §10 that a jar-wide row on Rations' own list falsifies, and the ninth carries the precache figure §12 called owed.

## Context

[ADR-0096](0096-devices-converge-without-both-being-awake-through-a-store-of-sealed-deltas.md)
§7 left a hole and said so: **_a wake is an open of the root Facet, and a Rations-only
user never converges._** It was **stated, not repaired**, for two reasons — that reaching
across "would re-open ADR-0084 §6 from the wrong side" and "would put convergence inside a
Facet [ADR-0078](0078-a-facet-contains-no-way-out.md) gives no way out of."

[#415](https://github.com/palebluebytes/inventoria/issues/415) is the same fault line
found from below: a Facet-scoped wipe performed in the standalone Rations install writes
its Carried deletion into the shared ledger and **deposits nothing**, because the deposit
rides a ledger-growth signal that only an open of the root produces. Its body lists three
options and calls none of them free; two of the three ADR-0096 §7 refuses in terms.

The proposal this record answers arrived with two conditions attached: **only what is on
Rations is shared**, and **it pairs only with other Rations**. Both survived contact with
the tree; one survived in a different form than it was asked in.

### The three obstacles, and which of them were real

**Closure under reference was already discharged, on better evidence than anyone had
looked for.** [ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §1
proved the direction a _wipe_ needs — nothing outside food points into food — by
enumerating call sites. A _sync_ needs the reverse, and the reverse is provable from the
whole ledger's reference vocabulary rather than from a list: `referencesOf`
(`src/lib/p2p/meal-payload.ts`) reads exactly three attributes — `event/target`,
`event/instantiation` (its `based_on` and its `ingredients`) and `recipe/ingredients` —
and returns nothing for every other attribute in the app. On a food entity all three
resolve inside food. **Food has no outbound edge**, so a scoped lane cannot land rows
pointing at nothing. §7 is what keeps that true.

**The version vector was the real obstacle, and it is not repairable by filtering.**
ADR-0075 §6's construct is sound because of a property nobody had had to name: **no holes
below the maximum, per originating device**, which holds today only because every transfer
is unfiltered. A narrowed lane punches holes. Device B takes A's food up to stamp 7 over a
food lane and never receives A's Media row at stamp 6; B's read of `datoms` then reports
`A ≤ 7`, and any later wide lane — a re-pairing, or a third device — withholds row 6
**permanently and silently**. That is the failure ADR-0075 §6 rejects a scalar watermark
for, reached along a second axis. Narrowing the _computation_ does not help: the hole is in
the ledger, not in the query. §5 is the repair.

**"Only pairs with other Rations" is not purchasable as stated, and what was wanted is.**
Both Facets are one origin and one Jar; a pairing is between _devices_; and on iOS WebKit
keys storage by origin alone ([#286](https://github.com/palebluebytes/inventoria/issues/286)),
so food landing on a device that also has the root installed is visible to the root
whatever the lane carried. The condition can bind **what crosses** and never **who is on
the other end**, which is §2.

### The route, and why this is not ADR-0080 §9's clause being spent twice

ADR-0080 §9 wrote a one-shot permission: _"The first p2p design to reach `main` may
overturn it by arguing against §1 — it may not acquire the surface by not noticing this
clause."_ ADR-0084 §6 took it. **This record does not claim it a second time.** It amends
ADR-0084 §6 and ADR-0096 §7 head-on, on two arguments neither record had: that the
narrowing is expressible as one rule rather than a second mechanism, and that the vector
hole which would have made it unsound has a repair that leaves the vector a read of the
ledger. ADR-0080 §9's own conclusion — _a food-only user therefore has no p2p at all_ —
falls out as already-false in one half (ADR-0084 §6) and false in the other here.

### Alternatives that were genuinely live

**Rations opens a wake and runs the existing jar-wide convergence.** The cheapest repair of
§7's hole, and it abandons both conditions: a Rations user's phone would transmit Media,
Items, Habits, Calendar and Notes rows on a surface whose user cannot reach any of those
screens, export them, or delete them. That is ADR-0080 §1's carry test failed in both
clauses at once, dressed as a fix. Refused.

**Two lane types — root keeps an unfiltered lane, Rations gets a food-only one, side by
side.** Refused because both lanes then carry every food row: the jar-wide lane already
_contains_ the food lane's entire payload, so food would cross the relay twice and be
stored twice at R2 for nothing. It also doubles what ADR-0096 §11's K counter must stay
honest about, since a pairing whose Facet the user stopped opening would accrue
unproductive wakes and stop at 200 while being perfectly healthy.

**A stored per-lane watermark beside the pairing**, instead of §5's second axis. Simpler to
write, and safe in one direction only — understating re-sends a row the import ignores,
overstating withholds one forever. Refused because it needs an initialisation story for
every existing ledger and reintroduces exactly the second record
[ADR-0067](0067-a-ledger-comes-back-by-merging-never-by-replacing.md) §2 and ADR-0075 §6
both declined.

**Forbid widening** — a device pair that has ever synced narrow may never re-pair wide. No
new construct at all, and it strands the user who installs the root later. Refused.

**Scope carried by the pairing code**, instead of §3's intersection. Refused because it
makes the lane depend on who reached for the code first, which is not a fact about the
data.

### Scope

This record states the scoping rule, re-keys the version vector, fixes the attribution rule
for Carried deletions, decides which wakes serve which lanes, and closes #415. It **builds
nothing**. It does not lay out Rations' Settings page, does not decide the pairing screen's
copy beyond §10's one requirement, and does not measure what the p2p stack costs Rations'
precache band — §12 records that as owed rather than claimed.

The work is [#419](https://github.com/palebluebytes/inventoria/issues/419) (the vector, §5
and §6), [#420](https://github.com/palebluebytes/inventoria/issues/420) (§7's gate),
[#421](https://github.com/palebluebytes/inventoria/issues/421) (the scope, §1–§4),
[#422](https://github.com/palebluebytes/inventoria/issues/422) (the wakes, §9, which closes
#415) and [#423](https://github.com/palebluebytes/inventoria/issues/423) (the surface, §8
and §10). #419 lands first, because a scoped lane is unsound without it.

It **depends on** [#418](https://github.com/palebluebytes/inventoria/issues/418), which is
a defect on `main` rather than part of this design: two wakes at one origin are not
serialised, and §9 widens the consequences of that from latent to routine.

## Decision

### 1. A pairing is scoped to the Facet its act ran in, and the root's scope is the whole Jar

**A pairing carries the rows of the Tracked Domains held by the Facet the pairing act ran
in, and nothing else. The root Facet's scope is the whole Jar.**

One rule, and root-to-root is its unrestricted case rather than a separate mechanism. This
is not a new key: [ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md)
§1 already makes the Tracked Domain the unit of ownership, ADR-0079 §3 derives the wipe's
predicate from it, and ADR-0084 §1 answers hand-off ownership with it. A scoped lane is the
fourth application of one idea, not a fifth vocabulary.

The predicate is **derived and never authored**: `entityPrefixesOf` over the scope's
domains, the same function `facet-wipe.ts` already uses, and `readLedgerPage`'s
`entityPrefixes` narrowing already composes with `above`. A hand-written second list is the
drift ADR-0079 §3 forbids.

### 2. The scope binds what crosses, never who is on the other end

**A lane's scope is a statement about rows. It is never a statement about the peer's
install roster, and no part of this design learns one.**

A device with both Facets installed is one device with one Jar, so there is nothing to
learn and nothing that could be enforced if there were. A Rations-only phone pairing with a
laptop that has the root installed is therefore **legal and ordinary** — it is the normal
shape of a food-only user's device set — and §3 gives it a food lane without anyone
choosing one.

**ADR-0072 §7 is not in play here, and is stated so rather than left to look overlooked.**
That rule stops a _sender_ learning about a _recipient_ in a person-to-person send, where
the recipient is another person. Own-device pairing is one person's two devices, and §3's
exchange is between them.

**What this does not buy.** It does not keep the root from _seeing_ food that lands on a
device where both are installed. One origin, one Jar, and on iOS one storage jar keyed by
origin alone (#286). Anyone reading "only Rations data crosses" as "the root cannot see it"
is reading a promise this cannot make, and #286's research is the standing account of why.

### 3. The two sides agree the scope by intersection

**Each side states its Facet's domain set in ADR-0096 §8's closing exchange, and the lane's
scope is the intersection.**

root↔root is the whole Jar, Rations↔Rations is food, Rations↔root is food — automatically,
and with nobody choosing. Intersection is also the only rule that is symmetric, and a lane
whose two ends ran different predicates would have each side filtering `above` over a
different domain set, which is a silent divergence rather than an error.

**It costs one new statement on the wire**, and the statement is about your own other
device. The relay sees a sealed frame either way; what widens is what the two devices tell
_each other_, which is that one of them is a food-only install. §2 is why that is not
ADR-0072 §7's concern.

### 4. One pairing per device pair, and any number of peers

**A device pair holds at most one pairing. Pairing again replaces it and re-scopes the
lane.** The roster is unchanged in the way that matters: pairing stays pairwise with no
main device (ADR-0075 §4), and a device holds **as many pairings as it has peers**.

Two pairings between one pair of devices is refused for the reason in the Context — the
wide lane contains the narrow one — and because `PairedDevice` is keyed by `device_id` in
one `localStorage` record, so a second would need a compound key that buys nothing.

**Re-pairing is sound in both directions under §5.** Widening leaves the new domains'
marks absent for that peer, which is the empty-vector case and therefore a first sync of
those domains. Narrowing leaves the dropped domains' marks where they stand, correctly: the
lane no longer carries them and nothing advances them.

### 5. The version vector is keyed by originating device **and** Tracked Domain

**The greatest stamp this ledger holds, per originating device, per Tracked Domain.** Still
a read of `datoms` — group by device and by the domain the row belongs to — so ADR-0075
§6's central claim survives word for word: _the watermark is not stored, it is queried_,
there is no second table, no import log and no content hash to fall out of step.

**The invariant it restores, stated because ADR-0075 §6 never had to.** A vector entry is
sound only where there are **no holes below it**. Within one domain there are none, because
every lane that carries a domain carries **all** of that domain above the peer's mark —
a wide lane by containing it, a narrow lane by being it. Holes exist only _across_ domains,
which is exactly the axis the second key adds.

`vectorAboveMatch` gains the domain axis with it: a row crosses if the peer's mark for
**(its originating device, its domain)** is absent or below its stamp. An absent entry
still means _has never held a row of this kind from this device_, and the empty vector
still matches everything, so a first sync still needs no path of its own.

**The row's domain is the domain it is _about_, which is not always the domain that owns its
entity.** For a content row the two coincide: `ownerOfEntity` gives it. For a **Carried
deletion** they do not, and §6 is that case.

**An entity with no owning domain has no vector entry and can cross no lane.** That is a
`pnpm check:entities` failure rather than a runtime case, and it is named here so the gate's
absence is never read as a silence.

### 6. A Carried deletion is attributed to what it deletes, and crosses only a lane that covers all of it

Two clauses, and they are the same clause seen twice.

**A `deletion:` row's domains are the domains its prefix list names** — never the `jar`
domain that owns its entity. So a food wipe's deletion is marked under `food`, and the
`jar` domain gets no axis in the vector at all.

**A deletion crosses a lane if and only if its prefix list is a subset of the lane's.**

Both are forced. Attributing a deletion to `jar` would give the Jar domain one mark that a
narrow lane raises while skipping the deletions it may not carry — reopening §5's hole
inside the very construct that closes it. And letting a deletion merely _intersect_ a lane
would have that lane delete rows outside its own scope on a peer that holds more: a
food-scoped pairing that silently removed the far device's Media is a lane breaking the
promise its own Devices row prints (§10).

**A lane's scope is therefore a promise in both directions: it carries nothing else, and it
deletes nothing else.** The honest consequence is that a wipe propagates only along lanes
that cover it — a Media wipe does not reach a device you paired from Rations, and it should
not.

The subset rule is **vacuously satisfied today**, because a Facet-scoped wipe's prefix list
is exactly one Facet's and Rations is the only Facet with a wipe. It costs nothing now and
is the reason the second Facet-scoped wipe stays safe. A second member of the `jar` domain
— which the registry says costs an amendment — would owe an attribution rule of its own
under this section.

### 7. Closure in the sync direction, and the gate that keeps it

**A scoped lane is sanctioned only where the Facet's rows have no reference leaving them**
— the mirror of ADR-0079 §1's condition, and the reason a receiving device never lands a
row pointing at nothing.

Rations satisfies it, and on the whole ledger's reference vocabulary rather than an
enumeration: `referencesOf` reads `event/target`, `event/instantiation` and
`recipe/ingredients` and nothing else, and on a food entity all three resolve inside food.

**`referencesOf`'s exhaustiveness gets a gate.** ADR-0078 §8's argument transfers
unchanged — _a build rule with nothing checking it is a comment_ — and the difference from
ADR-0079 is the point: the wipe rested on this invariant **once**, at the moment it
shipped; a lane rests on it **on every wake, forever**. The claim is falsifiable and named
here: **every attribute `docs/eavt-vocabulary.md` documents as holding an entity reference
appears in `referencesOf`.** It fails the day someone adds a food attribute pointing out of
food, which is the only way §1 can be broken silently.

### 8. The pairing record stays the Jar's, and no Facet-scoped wipe severs it

**A Paired Device record is not owned by the Facet its lane is scoped to.** "Delete all my
food data" takes food's rows and food's `localStorage`; it does not unpair anything.

ADR-0079 §2's rule — ownership decides, the storage medium is incidental — is what makes
this worth stating rather than assuming, because a Rations-scoped pairing looks on its face
like Rations'. It is not: the record is about **devices**, which is the same reason the
`jar` domain sits outside every Facet's prefix set.

Severing would also defeat the machinery that makes the wipe worth anything.
ADR-0096 §12's Carried deletion exists so a wipe **reaches the peer**; cutting the lane in
the same act guarantees it never does, leaves the far device holding the pre-wipe rows
forever, and makes _wipe, then re-pair_ re-supply everything the wipe took, because a fresh
pairing's first sync is the empty-vector case.

The jar-wide wipe still severs every pairing, unchanged, and is still root-only
(ADR-0080 §9).

### 9. Which wakes serve which lanes, and #415

**A wake serves a lane if the waking Facet's scope meets it, and deposits only the domains
the waking Facet holds.**

Four cases fall out, and the last one is the repair:

| Wake    | Lane     | Serves                                          |
| ------- | -------- | ----------------------------------------------- |
| Rations | food     | yes, wholly                                     |
| root    | jar-wide | yes, wholly — unchanged                         |
| root    | food     | **yes**: the root's scope contains every lane's |
| Rations | jar-wide | **yes, for food and its deletions only**        |

The third is ADR-0078 §3's asymmetry, already sanctioned: the rule binds Rations only, and
the root may reach into `/food/` without leaving its own scope.

The fourth closes **#415**. A Rations wake depositing its own domains' rows onto a
jar-wide lane is not convergence inside a Facet: Rations writes only rows from domains it
owns, onto a lane it did not create, and leaves the other five to the root's wake. **§5 is
what makes it sound rather than clever** — a partial deposit raises only the marks for the
domains it carried, where under a per-device scalar it would have been the silent-withholding
bug. `deposit_standing.brings` is a vector of the same shape and needs no new rule.

**Two costs, both paid here.** ADR-0096 §11's K counter becomes **per-pairing and blind to
which Facet woke**, or a pairing served by two Facets would be counted toward 200 twice.
And **two wakes can now reach one lane concurrently** as a matter of routine rather than
accident — a root tab open beside an installed Rations — which #418 must land before this
does. The conditional `PUT` does not cover it: a refused rewrite is answered by an
unconditional recreate, and the two wakes' `localStorage` writes can land in the opposite
order to their R2 writes.

### 10. Rations carries the whole pairing surface, and every row names its scope

**Rations' Settings carries the pairing surface entire**: the act, the Devices list, naming,
the two-phase unpair, and ADR-0096 §11's pending-revocation and stopped-at-K states.

The states are not chrome. A pending revocation is the half that stops the lanes and retries
its withdrawal on a later open, and a surface that cannot show one strands a revocation the
user believes landed; a pairing stopped at K must say so somewhere the user can reach, and
under ADR-0078 §7 Rations has no route to the root's copy.

**Every Devices row names what its lane carries**, in the Tracked Domains' own user-facing
`name`s — the same words `FoodDataSection` already prints in its _what stays_ line, rather
than a second way of saying what a domain is. It is the only place the app can explain an
absence the user would otherwise read as a sync failure: three devices, a jar-wide lane to
the laptop and a food lane to the phone, and no films on the phone. In Rations every row
says the same thing, which is itself the honest statement that this Facet carries food and
nothing else.

**This is what ADR-0078 does not forbid, and the distinction is the whole reason §7 of
ADR-0096 looked like a wall.** Rations gains a screen **of its own**. It gains no link to
the root's, mounts no root view module, and `pnpm check:facets` is unchanged.

### 11. An older device's vector reads as the new one; the other direction fails loudly

**A vector arriving in ADR-0075 §6's shape is read as this one by assigning its mark to
every domain.**

Sound, and provably: an old-shape vector can only have been produced by an unfiltered lane,
so the peer genuinely holds every domain below that mark. Refusing it would pay a visible
failure for nothing.

**The reverse cannot be helped and is not dressed up.** A device on the older build
receiving this shape fails in `readVersionVector` with `VersionVectorRefusedError`, because
a domain map is not a whole stamp. That is the right failure — loud, at the boundary, and
never a silent withholding — and it is the reason the forward direction is safe to accept.

### 12. What is not claimed

Three facts sit outside anything this record establishes, in the class ADR-0084 §9 named.

- **What the p2p stack costs Rations' precache band.** ADR-0077's ±5% band is ~497 KiB
  either side of Rations' 10,177,101 B. The camera and symbol-reading half is largely
  already paid — Rations precaches the zxing wasm for the barcode scanner — and the rest is
  **unmeasured**. The implementing ticket owes the number before anything claims it fits.
- **That #418's lock covers every browser this app targets.** `navigator.locks` is
  origin-scoped and that is the property §9 needs; the platform floor is that ticket's to
  establish, not this one's.
- **Whether two Home Screen web apps from one origin share a storage jar on iOS.** #286 is
  closed and its research never reached `main`. §2's limit is stated so that it holds under
  either answer.

## Consequences

**ADR-0096 §7's hole is closed and #415 closes with it**, and the two are one repair rather
than two. §7's own reasons are answered rather than overridden: reaching across does not
re-open ADR-0084 §6 "from the wrong side" because this record re-opens it from the front,
and convergence does not go inside a Facet with no way out because §10's surface links
nowhere.

**The map gains no new mechanism, and one existing construct gets more general.** The
version vector's second axis is the only structural addition, and it makes expressible a
thing the design already wanted: a deposit that carries part of a lane. That is what pays
for #415 at §9, and it is worth noting that #415's own body could see no free option —
because the free option did not exist until the vector was re-keyed.

**The narrowing is a promise in both directions, and the second half will surprise
someone.** A lane that carries only food also **deletes** only food, so a Media wipe does
not propagate to a device paired from Rations. That is correct and it is a real loss: a
user with a Rations-only phone and two root machines must wipe Media on a machine that is
paired widely, and nothing in Rations will tell them so.

**Metadata widens twice, and neither is a relay's gain.** The vector states which _kinds_ of
thing each device has heard from each device, and §3's exchange states which domains each
end's Facet covers. Both travel sealed, and both are between a person's own two devices. The
relay's view is unchanged — ADR-0075 §5's rotating room id and ADR-0096 §15's lane
addressing are untouched — and this record adds no reason to revisit ADR-0072 §12, whose
unfavourable reading still stands with the Durable Object analytics retention window
unmeasured ([#389](https://github.com/palebluebytes/inventoria/issues/389)).

**Rations grows, and the Facet roster's asymmetry grows with it.** The bundle takes the p2p
stack, and Rations becomes the first Facet to carry a control that reaches another device.
ADR-0080 §2's table gains a **Paired devices** row on clause (b) — the Facet's own act
creates the convergence the control governs — which is the clause ADR-0080 §9 said pairing
failed. It failed it for a **jar-wide** pairing, which is what §9 was looking at; a lane
scoped to the Facet's own domains passes it, and that difference is the whole of this
record.

**`referencesOf` acquires a gate, and food acquires a constraint it did not have.** A new
food attribute pointing at a non-food entity now breaks a build rather than a sync. That is
a real restriction on the domain most likely to grow, and the alternative is a restriction
nothing checks.

**What would reopen this.** A second Facet-scoped wipe puts §6's subset rule to work for the
first time rather than vacuously. A second member of the `jar` Tracked Domain owes an
attribution rule under §6. And a Facet whose rows reference another Facet's reopens §7
outright — that Facet does not get a scoped lane, by the same argument that says it does not
get a wipe.

## Amendment (2026-09-13): §7's documented set is five attributes, not three, and the gate is a partition

§7 names the gate's claim as _every attribute `docs/eavt-vocabulary.md` documents as
holding an entity reference appears in `referencesOf`_, and the Context says that set is
three. Writing the gate ([#420](https://github.com/palebluebytes/inventoria/issues/420))
found **five**. `event/replaced_by` is a Consumption Event naming the Consumption Event
that corrected it (`calorie.store.ts`), and `habit/replaces` is the Habit Lineage link;
both hold an entity id, neither is read by `referencesOf`, and both predate this record by
months. The claim as written would have gone red the day it was checked.

What shipped instead is the shape the two allow-lists beside it already use: the marked set
is **partitioned** rather than contained. `docs/eavt-vocabulary.md` marks every attribute
that holds a reference, and every marked attribute is either read by `referencesOf` or
named in `tests/unit/meal-payload.test.ts` as one whose reference **resolves inside the
Tracked Domain of the row holding it**. An attribute in neither fails `pnpm test:unit`,
which is the property §7 was buying: a new food attribute pointing out of food is refused
at the moment somebody coins it, and no reader has to notice.

**§7's conclusion survives, on the partition's criterion rather than on the function's
contents.** A correction link points at another Consumption Event and a lineage link at
another Habit Blueprint, so both stay inside their own domain, and a lane scoped to one
Facet still cannot ship a row pointing outside its scope. What does not survive is the
Context's sentence that `referencesOf` reads _the whole ledger's reference vocabulary_. It
reads the **closure's**, which is a smaller thing, and the two were conflated.

**One consequence is named rather than repaired.** A meal payload carrying an
`event/replaced_by` would land a row pointing at an entity that did not come with it,
because the reader recomputes reachability from `referencesOf` and never sees that edge.
Nothing sends one today, since a send picks a day's live events and a live event holds no
correction link. That is a hole in ADR-0073's self-containment rather than in this record's,
and closing it would widen what a meal carries, so it is left open here.

## Amendment (2026-09-14): §5's rule reads one axis per row, and the empty vector matches one row fewer than "everything"

§5 states the filter as _a row crosses if the peer's mark for **(its originating
device, its domain)** is absent or below its stamp_ — one domain, singular. §6 then
gives a Carried deletion **several**. Building it ([#419](https://github.com/palebluebytes/inventoria/issues/419))
had to settle what the two together mean, and the answer is forced rather than chosen:
a row crosses while **any** axis it stands on is absent or behind. The peer holds a
deletion only if it holds every domain that deletion is about up to the deletion's own
stamp, so requiring all of them is what "the peer has it" means, and requiring only one
would withhold a deletion from a device missing half of what it deletes.

§5's other sentence — _the empty vector still matches everything_ — is then true of
every row **that stands on an axis**, and of no other. That is not a second rule: it is
§5's own next paragraph, _an entity with no owning domain has no vector entry and can
cross no lane_, holding on a first sync as well as on a later one. The two sentences
read literally disagree about one row, and the second is the one that survives —
otherwise an unowned entity would cross exactly once, on a pairing's first exchange, and
never again, which is the silent asymmetry the second axis exists to remove.

**And §5's reason for calling that harmless is wrong.** _That is a `pnpm check:entities`
failure, not a runtime case_ holds for a row this build could mint and for no other.
`scripts/entity-ownership-check.mjs` reads minting sites under `src/`; its check 3 fails
a declared prefix that has no minting site, so a **retired** prefix is pushed out of the
registry while its rows stay in `datoms` forever. ADR-0086 §3 retired six of them —
`sku:`, `asin:`, `url:`, `url:temp_`, `did:` and `gs1:`, all scraper-minted item twins —
and on a ledger old enough to hold one, that row crossed a sync before #419 and crosses
no lane after it. Narrower than ADR-0075 §6's scalar watermark and the same shape:
withheld permanently, with nothing said. #419 built §5 as written and
[#425](https://github.com/palebluebytes/inventoria/issues/425) carries the choice that
was never actually made — a reserved axis for what no content domain owns, or the loss
accepted with the six prefixes named.

Three wake suites were minting `event:` bare in their fixtures, which no minting site
may do, and they now name a declared prefix.

## Amendment (2026-09-14): §3's statement rides the opening exchange, and §1's predicate cannot carry a deletion

§3 puts each side's domain set in _ADR-0096 §8's closing exchange_. Building it
([#421](https://github.com/palebluebytes/inventoria/issues/421)) found that it
cannot go there. ADR-0096 §8's act is _vectors exchange → chunks both ways →
closing vector exchange_, so a scope agreed at the close is agreed **after every
row it was supposed to bind has already crossed** — and §1 is a rule about the
rows, not about the record. Both ends also have to hold the same scope _before_
either pages its ledger, because each filters `above` with it, and §3's own
argument against asymmetry is that a lane whose two ends ran different
predicates diverges silently. So the statement rides `open`, beside the
`device_id` and the vector that are already there. Nothing else in §3 moves: it
is still one new statement on the wire, the record is still written on receipt
of the peer's closing vector, and the scope is still the intersection.

**§1's predicate is sound for content and silent about deletions, and the
difference is §6's.** §1 prescribes `entityPrefixesOf` over the scope's domains
composed with `readLedgerPage`'s existing `entityPrefixes` narrowing, and that
is what shipped. A **Carried deletion**'s entity is `deletion:`, which belongs to
the Jar domain — so it crosses a jar-wide lane, whose scope is the whole Jar by
§1, and it crosses **no narrower lane at all**, because the domains it is about
live in its `value` and no prefix list can reach them. §6's _a deletion crosses a
lane if and only if its prefix list is a subset of the lane's_ is therefore not
expressible in the shape §1 calls for: it needs the row's attributed domains
(`domainsOfRow`, which #419 built for the vector) rather than its entity prefix.

The gap is **incompleteness rather than corruption**, and it is bounded. A
device on a food lane never learns of a food wipe and keeps the rows it took,
and it cannot hand them back, because the wiping device holds the `deletion:`
row and `importConvergedRows` refuses what it covers. No lane can be narrow
today in any case: the only pairing act is the root's until
[#423](https://github.com/palebluebytes/inventoria/issues/423) gives Rations the
surface. **It is owed by [#422](https://github.com/palebluebytes/inventoria/issues/422)**,
which is where §9 decides which wakes serve which lanes and where the fourth row
of that table — _Rations, jar-wide, yes, for food **and its deletions** only_ —
needs the same rule. Until it is built, this record's claim that §6 shipped with
#419 covers the attribution half and not the crossing half.

**One consequence for a wake, named so it is not read as covered.** A wake's
deposit reads `PairedDevice.scope` for nothing yet: `wake-errand.ts` pages the
ledger un-narrowed, as it always has. That is correct while every lane is
jar-wide and is the first thing #422 changes.

**And one for #425, which gains a second mechanism to undo.** A jar-wide lane's
predicate is every prefix the registry declares, which is not the same as no
predicate: a row under one of ADR-0086 §3's six retired prefixes matches none of
them and is now withheld by the page read as well as by the vector's axes. It
was already withheld by the axes alone, so nothing is newly lost and the second
Amendment's account of the loss is unchanged — but a repair that reinstates the
vector axis and stops there would still not move that row.

## Amendment (2026-09-14): §9's table has no row for the lane a Facet does not meet, and that row costs §11's counter a second list

§9 states the rule as _a wake serves a lane if the waking Facet's scope meets
it_ and then tables four cases, all of them **yes**. Building it
([#422](https://github.com/palebluebytes/inventoria/issues/422)) found that the
**no** the sentence implies is not free, and that what it costs is not in the
section that pays for it.

A lane a wake meets no part of must be **left alone**, which is one line. But
§11's counter reads the whole Paired Device list and burns a wake against every
pairing that produced nothing, so the untouched lane would burn one on every
open of the Facet that never reaches it — and at K = 200 that Facet stops a
pairing the **other** Facet's wakes are converging perfectly well. A stop is
supposed to bound a key touched forever at an index that cannot move (§11's own
argument), and this would be a stop earned by not looking. So a sync now reports
which pairings it **served** as well as which produced something, and the
counter burns only inside that list.

**What §9 names as a cost was already paid, and the cost it does not name is the
one that was owed.** _The K counter becomes per-pairing and blind to which Facet
woke_ describes what was already true: `unproductive_wakes` is one field on one
record and `wake-counter.ts` had never seen a Facet. Nothing had to change for a
pairing served by both to carry one count rather than two. The second list is the
opposite direction and is unmentioned.

**That clause reads two ways, and the reading it does not pay for is real.** The
shape is right — one wake burns at most one, whichever Facet it is. The **rate**
is not: a person who opens the root and Rations on the same day against an absent
peer now burns two of that pairing's 200, where before this record only the
root's opens burned any, so K's reach in days roughly halves for a two-Facet
user. It is not repairable inside §9, because a wake **is** an open and two opens
are two wakes, so every candidate repair changes something ADR-0096 §11 decided —
a burn coarsened to the calendar day, a jar-wide mark the second Facet's open
reads, a larger K, or the argument that 200 was generous enough to absorb a
factor of two. That choice is §11's and is
[#426](https://github.com/palebluebytes/inventoria/issues/426).

**The skip cannot fire on today's roster**, and is built rather than deferred for
the reason `wake-errand.ts`'s other unreachable guard is kept: both Facets hold
food, so every lane a pairing act can mint meets both, and the day one does not
the failure would be a pairing that stops itself.

**One clause is stated because §9's wording invites the other reading.** A served
lane is **collected whole**: the rows a peer left are imported whatever domain
they belong to. One Jar is one ledger, so there is nothing to protect by
refusing a Media row that has already arrived, and a lane nobody reads stalls
its depositor's chain (§5's commit point). §9's narrowing binds the **deposit**
alone.

## Amendment (2026-09-14): §6's crossing rule is a read of the ledger page, and a jar-wide lane still carries every deletion by its entity

The third Amendment handed #422 the half of §6 that #421 could not express: a
Carried deletion's entity is `deletion:`, so no prefix list reaches the domains
it is about. It is built where §1's own predicate already lives — the page read —
and the shape that made it expressible is that `readLedgerPage` now takes the
**Lane scope** rather than a prefix list, deriving the prefixes for the content
rows and reading the same scope again for the deletion arm. Handing prefixes in
would have left §6's half to each caller, which is the second hand-written list
ADR-0079 §3 forbids.

**The subset test runs inside SQLite, and that is forced rather than tidy.** The
frozen list is JSON and this build already reads it in memory
(`readCarriedDeletion`), so filtering the page afterwards looks equivalent. It is
not: a page whose every row was filtered comes back **empty**, and an empty page
is how every walk in the arc learns it is finished, so a refused deletion would
silently end a deposit and withhold every row behind it. A malformed list is
refused the same way it is in memory, under a `CASE` rather than an `AND`
because SQLite is free not to short-circuit and a `deletion/prefixes` row that
will not parse sits in an append-only table forever.

**A jar-wide lane's deletions still cross on their entity prefix, which is why
this narrows nothing.** The Jar domain declares `deletion:` like any other
prefix, so a whole-Jar scope carries every deletion without the subset test being
consulted — including one whose frozen list names a prefix no domain declares
any more, which is [#425](https://github.com/palebluebytes/inventoria/issues/425)'s
population and is left exactly where that ticket found it. The subset test is
what a **narrower** lane is bought with, and on today's roster the only narrow
lane a wake can meet is food.

## Amendment (2026-09-14): a Carried deletion can now be applied with only Rations open, and Rations draws no notice

ADR-0096 §12 has the peer show a one-shot notice of a completed act, and
`CONTEXT.md` recorded the division as _the root Facet draws it and Rations does
not, because a Wake is an open of the root_. §9 removes that reason without
replacing it: Rations wakes, so Rations can be the Facet that applies an
arriving deletion.

The notice is a **broadcast**, so a shell that is not listening does not defer it
— it loses it. #422 therefore has `Rations.svelte` listen and record, beside the
wake and before it, and draws nothing: the record waits in `localStorage` until
the next open of the root, which is where the sentence is rendered. Deferred
rather than lost, and the surface that would make it immediate is
[#423](https://github.com/palebluebytes/inventoria/issues/423)'s along with the
rest of Rations' pairing screen.

## Amendment (2026-09-14): what the p2p stack costs Rations' precache, measured

§12 records the number as owed rather than claimed: _the camera and
symbol-reading half is largely already paid … and the rest is **unmeasured**.
The implementing ticket owes the number before anything claims it fits._ #422 is
that ticket, because it is what puts a wake behind Rations' shell.

**+15,972 B (+15.6 KiB, +0.16%)**, against the ±5% band that is ~497 KiB wide
either side. Measured build to build at `9a40d783`: Rations precaches
10,248,983 B with the wake and 10,233,011 B without it, everything else on the
branch held still.

§12's guess about which half was already paid is right, and is most of why the
figure is this small. Rations reached the store, the lane chain, the sealed
deposit and the QR writer through the meal hand-off already; what a wake adds on
top is the cadence, the errand, §11's counter and #418's lock. The root's own
figure moves **+363 B** for the same change, which is what a Facet that already
had all of it looks like.

Both Facets' declared figures move with this, and they take up the rest of the
arc's drift as they go — 67,165 B for the root and 55,910 B for Rations, from
tickets that re-measured nothing. That is stated in `src/lib/facets/registry.ts`
beside each number rather than attributed here.

## Amendment (2026-09-14): in Rations the rows do not all say the same thing, because the list is the Jar's

§10 gives the scope line its reason and then gives it a second, weaker one: _in
Rations every row says the same thing, which is itself the honest statement that
this Facet carries food and nothing else._ Building it
([#423](https://github.com/palebluebytes/inventoria/issues/423)) found the
second sentence false, and false for a reason §8 states four sections earlier.

**The Paired Device list is one jar-wide `localStorage` record**, which is what
§8 keeps it as. Rations draws that list, not a list of its own, so a pairing made
from the root — a jar-wide lane, and the ordinary shape for a user with both
Facets on one device (§2) — appears on Rations' surface with a row naming all
seven domains. So does a record written before `PairedDevice.scope` existed,
which reads as the whole Jar. Rations' rows say the same thing only on a device
that has never paired from the root.

**The first sentence is the one that was built, and it is the stronger one.**
_Every Devices row names what its lane carries_ reads `PairedDevice.scope` — the
lane's own agreed scope — rather than the scope of the Facet drawing the row. The
alternative reading is available and is wrong: a line computed from
`scopeOfFacet(facetId)` would tell a Rations user that a jar-wide lane carries
only food, which is the absence §10 exists to explain, printed backwards.

**What survives is the claim about a lane Rations minted**, which is what §1 is
about: a pairing act run in Rations scopes its lane to food, so its row says
_Carries Food._ wherever it is drawn. The sentence that does not survive is the
one about the surface.

**A second sentence of §1 needed reading, and the reading is the surface's.**
_The Facet the pairing act ran in_ has two candidates on this sheet, because the
root draws _Rations settings_ too, from its Food tab (ADR-0080 §7). The **shell**
reading would make an act started there jar-wide; the **surface** reading makes it
food's. The surface reading is what shipped, and the reason is that every other
Facet-scoped control on that sheet already takes it: the wipe there deletes food
from the root's Food tab, the log card there lists food's channels, and the title
there reads _Rations settings_. A pairing act behaving as the root's on a surface
where nothing else does would be the inconsistency, not the fix.

**Its cost is real and is disclosed by the line this ticket added.** A root user
who pairs from the food gear gets a food lane, and §4 has that replace any
jar-wide pairing with the same device — narrowing it, silently as far as the act
itself goes. What stops it being silent is §10: the row then reads _Carries
Food._, which is the absence this section exists to explain, showing up on the
device that caused it. The alternative would have put two identical jar-wide
pairing cards in one root document, which is a duplicate control rather than a
second reading of the rule.

**One case §10 does not reach, decided rather than left.** A scope both ends
agreed is empty — unreachable through `laneScope` on today's roster, and
reachable through a hand-edited jar, which `isPairedDevice` admits because an
empty list is a claim rather than an absence. The row reads _Carries nothing._,
on the same rule `peer_roster` follows: a claim and a silence must not collapse.

## Amendment (2026-09-14): what the pairing surface costs Rations' precache, measured

§12 recorded the p2p stack's cost to Rations as owed. The wake's half was
measured at #422 (+15,972 B); this is the surface's, and the two together are
the whole of what §12 asked for.

**+16,675 B (+16.3 KiB, +0.16%)**, against the ±5% band that is ~497 KiB wide
either side. Measured build to build with nothing else on the branch moving:
Rations precaches 10,265,658 B with the pairing surface and 10,248,983 B without
it. §12's guess holds a second time — the camera, the symbol reader and the QR
writer were already in this bundle for the barcode scanner and the meal
hand-off, so what the surface adds is the section, the act around it and the two
code faces.

**The root's figure moves the other way, by −345 B.** It gains the scope line and
nothing else, and loses more than that to chunking: a second entry importing
`src/lib/views/pairing/` turns modules the root used to inline into shared ones,
whose wrappers are then emitted once rather than twice. A Facet paying slightly
less because its sibling started reading the same code is the shape of ADR-0095
seen from the bundler, and it is the opposite of what a reader would guess from
"Rations grows".
