# ADR 0086: An entity has exactly one owner, and the owner is a Tracked Domain

**Status:** Accepted  
**Date:** 2026-09-01  
**Amends:** [ADR-0014](0014-namespace-prefixes-for-eavt-entity-identification.md) (the scraper's prefix roster collapses to one, and identity aliasing changes from a hazard to a deliberate product), [ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) §4 (ownership is named at the Tracked Domain and a Facet's set is derived), [ADR-0085](0085-a-setting-is-never-a-datom-and-a-consent-is-not-a-setting.md) §2 and §3 (the two consents are defaults, not acts, so they leave the ledger with every other setting), [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) §5 (its per-Facet consent count dissolves with them)  
**Implemented:** #289 — `src/lib/facets/registry.ts`, `src/lib/facets/entity-id.ts`, `scripts/entity-ownership-check.mjs` (`pnpm check:entities`), `ingestion/json-ld.ts`, `db/projections.ts`, `acquisition/state.ts`, `stores/device-settings.ts`

## Context

[ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §3 sanctioned a
Facet-scoped deletion and then declined to derive its predicate, because it could not:
an entity prefix can be minted by two different parts of the app, so "delete everything
food owns" has no sound reading. It named
[#289](https://github.com/palebluebytes/inventoria/issues/289) as a hard prerequisite and
stated the rule it needed without performing it.

> A Facet-scoped operation is defined only over entities with exactly one owner. Where two
> Facets can mint the same entity prefix, the collision is a defect to be removed, never a
> case for the operation to handle.

This record performs it. Four of the premises it inherited did not survive contact with
`src/`, and each correction is in the decision below rather than in a footnote.

**Scope.** This record settles what an owner is, which prefixes exist, what the scraper
mints, what happens to the `consent:` prefix, how `twin/` is split, where ownership is
declared and how the invariant is enforced. It does **not** settle: which controls appear
on a Facet's surface ([ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md));
what the scoped wipe says to the user (ADR-0079 §5); or whether a completed Open Food
Facts contribution is recorded in the ledger, which §2 opens and
[#299](https://github.com/palebluebytes/inventoria/issues/299) decides.

## Decision

### 1. The owner is a Tracked Domain, and there is no second kind of owner

ADR-0076 §4 says "the entity prefixes a Facet's domains own" and #289 was written as though
the owner were a **Facet**. It cannot be. ADR-0076 §2 puts two Facets on the roster — `root`
holding all six domains, and `food` — and §3 says Facets **overlap rather than partition**.
The root therefore owns every prefix in the jar, so under Facet-ownership _every_ prefix has
two owners and the invariant is not merely violated, it is unstatable.

One level down it is exact. `gtin:` is minted by **food** and by **physical items**; `isbn:`
by **physical items** and by **media**. Those are Tracked Domains, and the ticket's claim
that "`isbn:` is co-owned exactly as `gtin:` is" is true only at this level — at the Facet
level `isbn:` has one owner and always did.

So: **every entity prefix is owned by exactly one Tracked Domain.** A Facet's prefix set is
**derived** as the union of its domains' prefixes, never authored, which is what ADR-0079 §3
requires of the wipe predicate and what keeps a second Facet an application of the mechanism
rather than a second list to maintain.

There is **no owner that is not a Tracked Domain.** ADR-0085 §3 created one — `consent:log_export`,
belonging to the root Facet directly because "the log facility is machinery, not a tracked
area of anyone's life" — and recorded it as this record's to resolve. It is resolved by §2
removing the prefix, not by widening the owner space. That order matters: an ownership model
with one exception acquires a second, and the exception here turned out to be a symptom.

### 2. A consent was a default, so the `consent:` prefix is deleted

ADR-0085 §1 established that the ledger records facts about the world you tracked, and that
how the app is configured is not one. §2 then exempted the two consents as **recorded acts** —
"at a moment you can name, the user agreed to something they can state."

**The code says they are not acts.** `consent.store.ts` documents both entities in its own
words, and both documents say the same thing:

> `off_contribute`: "**It is not itself the consent to submit** — it merely SEEDS the
> always-shown-before-submit per-capture checkbox in the Custom form, which must still be
> ticked every time."
>
> `log_export`: "**It is not itself the consent to export** — the review sheet still shows the
> exact payload, and the channels are chosen individually there."

`FoodStager.svelte:809` is the whole of the first one in practice: `contributeChecked =
$consentStore.off_contribute`. It sets a checkbox's default state.

So neither entity records an act. **Both record a default**, and the acts they are named for —
ticking the per-capture box, pressing export on a reviewed payload — happen elsewhere and are
recorded nowhere. What the user agreed to, on the evidence in the ledger, is _show this box
pre-ticked_. That is configuration by §1's own test.

§2 caught itself making this error in one direction and then made it in the other. It wrote
that the toggles "were called settings because they are toggles on a settings screen, which is
a fact about where the control is drawn and not about what the datom means" — and kept them
because they are called _consents_, which is equally a fact about a name. The test has to be
applied to the thing.

Its rejection of `localStorage` does not survive either: "a per-device store the user can clear
without noticing is the wrong place to keep the only evidence of it." There is no evidence. A
master toggle is not a record of a contribution, and no record of a contribution exists.

**So the `consent:` prefix and the `consent/granted` attribute are deleted.** Both toggles
become `localStorage` keys in `stores/device-settings.ts` alongside every other setting —
food's under `inventoria_pref_food_off_contribute`, so ADR-0079 §2's wipe already takes it —
and `stores/consent.store.ts` goes with them. ADR-0034 §8's model C is untouched: the
per-capture checkbox was always the consent, and this record only stops a default from
impersonating one.

Three things fall out. ADR-0080 §5's "two log-export consents, not one" dissolves into two
keys, and with it `consent:food_log_export`, an entity ADR-0085 §4 declared and never wrote.
The cost is the one ADR-0085 already accepted for nutrition targets: a default is per-device,
unsynced, and out of the Ledger export. And the real act — _that you contributed a correction
for this food_ — is still recorded nowhere, which this record makes visible rather than fixes;
[#299](https://github.com/palebluebytes/inventoria/issues/299) decides whether it belongs on
the twin it was made about.

### 3. The scraper mints one prefix, and it stays deterministic

`ingestion/json-ld.ts` picks its entity prefix from whatever the scraped page's JSON-LD
happens to carry. It is the only minting site in the app whose entity identity is decided by
an **external document**, so its collision surface grows without anyone editing the app. It
mints six shapes plus the two collisions: `gtin:`, `isbn:`, `sku:` (from `sku` or `mpn`),
`asin:`, `url:<hash>`, `url:temp_<clock>`, and for a JSON-LD `@id` beginning `did:` or `gs1:`
it takes **the whole entity id verbatim from the page**.

**The scraper always mints `twin:`**, which physical items own outright. One call site, and
every collision between items and another domain disappears at once, including the ones that
do not exist yet.

The suffix is not free, and #289's instruction stopped before it. The only `twin:` minting
site today is `ItemManualForm.svelte:30` — `twin:manual_${Date.now()}_${Math.random()…}`.
Applied with that shape, "the scraper always mints `twin:`" **silently repeals ADR-0014**,
whose entire decision is that two offline devices scraping the same page must independently
construct the same entity id so their datoms merge without a coordinator. So the suffix is a
sub-prefix naming the identifier the page carried, followed by that identifier:

| Page carries                              | Entity              |
| ----------------------------------------- | ------------------- |
| `gtin13`/`gtin`/`gtin8`/`gtin12`/`gtin14` | `twin:gtin_<code>`  |
| `isbn`                                    | `twin:isbn_<isbn>`  |
| `sku` or `mpn`                            | `twin:sku_<id>`     |
| an Amazon id in the URL                   | `twin:asin_<asin>`  |
| a `did:` or `gs1:` `@id`                  | `twin:dpp_<id>`     |
| a page URL and nothing else               | `twin:url_<hash>`   |
| nothing at all                            | `twin:temp_<clock>` |

Determinism is preserved everywhere it existed, `twin:temp_` remains the one non-deterministic
case exactly as `url:temp_` was, and the identifier stays legible in the raw database, which
ADR-0014 lists among its reasons.

**Six prefixes retire**: `sku:`, `asin:`, `url:`, `url:temp_`, `did:` and `gs1:`. Nothing in
`src/` reads any of them — outside `json-ld.ts` there is not one reader — so they retire at no
cost. It also closes a hole [eavt-vocabulary.md](../eavt-vocabulary.md) had to concede about
`did:` and `gs1:`: that the page could declare the prefix and never bound what followed it. A
verbatim `@id` is now a suffix inside a prefix this app owns.

The identifiers themselves are not lost. Each is written as an attribute on the item twin
(§5's `item/gtin`, `item/isbn`, `item/sku`, `item/asin`, `item/dpp`), which says the true
thing: a GTIN is something an item **has**, and is the identity only of the packaged food it
was printed for.

**Rejected: per-prefix de-confliction** — leaves the scraper free to collide with whatever the
next domain adds. **Rejected: resolving the prefix through the registry at write time** — the
same page scraped before and after a Facet is added would produce different entities, which is
ADR-0014's failure mode dressed as a feature.

### 4. A scraped book and its Open Library twin are now two entities

This is the cost of §3 and it is live today, not hypothetical. Scrape a book page: the app
mints `isbn:X` carrying `twin/*` and an `event:acquire_`. Add the same book from Open Library:
**the same `isbn:X`**, now also carrying `media/*` and an `event:engage_`. One entity, both
folds see it, and _want to own_ and _want to read_ sit on one object. ADR-0014 lists this
convergence under **Positives**, as deterministic offline merging working as designed.

After §3 they are two entities. **That is accepted rather than mitigated.**

Keeping `isbn:` for the scraper when the page describes a `Book` was rejected: it re-admits
exactly the collision this record exists to remove, and restores the property that makes the
scraper dangerous — that an external document chooses the prefix.

The loss is cheap to reverse if anyone ever asks. Under §3's shape `twin:isbn_X` and `isbn:X`
are derivable from each other by string, so a future bridge is a pure function and needs no
stored link. ADR-0014's own escape hatch, a `twin/same_as` attribute, is deliberately **not**
built here: an unbuilt bridging attribute with no ticket is a promise, not a design.

### 5. `twin/` is split into what it is, and no namespace names a domain it does not belong to

`twin/` is not a domain namespace. It is the generic descriptive shell any ingested entity
gets — `name`, `brand`, `image`, `note`, `description`, `tags`, `source_url`, `raw_provenance` —
named after the first domain that used it, and [eavt-vocabulary.md](../eavt-vocabulary.md)
documents it by conceding the point: _"Physical item twins, **and not those alone**."_

The spelling makes it worse: **`twin:` is an entity prefix physical items own outright and
`twin/` is an attribute namespace nobody owns** — one character apart, opposite scoping rules.
That is very plausibly how the acquisition fold came to be written against `twin/` in the
first place ([#280](https://github.com/palebluebytes/inventoria/issues/280)).

So:

- **`provenance/raw`** takes `twin/raw_provenance`, the blob the ingestion registry attaches
  to every twin it mints (`registry.ts:45`), for every domain.
- **`item/*`** takes the descriptors only physical items write: `item/name`, `item/image`,
  `item/description`, `item/source_url`, `item/note`, `item/tags`, plus §3's identifiers.
- **`item/brand`** and **`food/brand`** split `twin/brand`, which physical items write
  (`ItemImportPanel`, `ItemManualForm`) and food also writes
  (`open-food-facts.ts:493`, `calorie.store.ts:324,387`, read back as a menu dish's _Place_).

**This is not "one namespace per domain", and `provenance/` is the proof.** It stays written
by every domain, deliberately, because it names the machinery rather than a domain. The rule
is narrower and more useful: _a namespace names what it is_. A namespace that names one domain
and is written by six is the lie that keeps producing this defect, and it is the only thing
being removed.

That is safe because ADR-0076 §4 already forbids any Facet-scoped operation from scoping by
an attribute namespace, and §6 below derives the wipe predicate from entities alone. A shared
attribute namespace is legal; a shared **entity** prefix is not.

**The acquisition fold scopes by entity.** `projections.ts:32` selects the whole of
`attribute LIKE 'twin/%'`, which promotes every entity carrying any `twin/` attribute to an
acquisition — so every food twin already appears in the Items tab as a nameless "wanted" item
(#280). The rename alone would fix that by accident and leave the structure armed for the next
domain that writes a descriptive attribute, so the predicate becomes
`entity LIKE 'twin:%' OR entity LIKE 'event:acquire_%'`. `MEDIA_LIBRARY`'s event arm narrows to
`event:engage_%` for the same reason; its twin arm is `media/%`, which media alone writes.

ADR-0079 §1 made #280 a hard prerequisite of the scoped wipe, on the ground that a control
whose central claim is "this touches nothing else" cannot ship while a food wipe visibly empties
another Facet's screen. That prerequisite is discharged here.

### 6. Ownership is declared in the registry, and the registry exists now

ADR-0076 §6 named `src/lib/facets/registry.ts` and deliberately did not write it, because "an
entry pointing at an entry point that has not been built would be a lie in code." That refusal
is narrow and it is about entry points. Who owns `gtin:` is true today, checkable today, and
ADR-0079 §3 derives a delete button's predicate from it.

So the registry is written now, carrying only what is true: the Tracked Domain roster with each
domain's entity prefixes and `localStorage` namespaces, and the Facet roster with each Facet's
domains and status. Scope, name, icon and `start_url` are **absent**, not stubbed — they arrive
with the entry point that makes them true.

A Facet's prefix set is a derived read over that structure, never a stored field, per §1 and
ADR-0080 §8's surviving rule that no field may re-record a conclusion whose reason is discarded.

**Rejected: the gate parsing `docs/eavt-vocabulary.md`.** #289 §3 proposed it and it makes a
prose table load-bearing for a deletion. The document stays canonical for the reader and the
registry is canonical for the code; §7's second assertion is what keeps them honest.

### 7. The invariant holds by construction, and the gate checks the door

#289 §4 asks for two assertions, and is right that the second is the one that would have failed
on `main`: ADR-0076 §4 already documented the one-owner rule and `isbn:` collided anyway,
because every defect found here is a place where the **code** minted something the documentation
did not know about.

1. **Every declared prefix has exactly one owner.** A pure read over the registry.
2. **Every entity-minting site in `src/` mints a declared prefix.**

The second is enforced by a **chokepoint** rather than by a scan. Every entity id is constructed
by one function, which takes the owning domain and a declared prefix; the gate then asserts only
that nothing else builds an entity id, which is a single cheap source-shape check of the same
species as the worker-closure check `pnpm check` already runs.

A scan alone was rejected because it is the same kind of artifact as the prefix list that rotted:
a claim about code that nobody re-reads, passing quietly the day someone adds a seventeenth
minting site. A chokepoint makes the invariant true by construction and reduces the scan to a
door-check. There are ~15 minting sites, so the refactor is bounded and one-off.

It joins **`pnpm check`**, not [ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md)'s
`pnpm check:facets`: it needs no `dist/`, and `check:facets` is about entry points.

### 8. Prefixes are compared by containment, never by equality

Two prefixes conflict when one is a **prefix of** the other, not only when they are equal. Live
pairs today: `url:temp_` inside `url:`, and `twin:manual_` inside `twin:`; §3 adds seven more
inside `twin:`. An equality check passes all of them, and would have passed
`consent:log_export` against a `consent:log_export_rations` that ADR-0085 §3 rejected on exactly
this ground.

**Same-owner containment is legal and expected** — `twin:gtin_` is inside `twin:` and both are
physical items'. **Cross-owner containment is the defect**, and is what the gate rejects.

## Consequences

**The roster shrinks from 25 entity prefixes to 17.** Six retire into `twin:` (§3) and two are
deleted with the `consent:` family (§2); `gtin:` and `isbn:` each lose their second minting site
and keep their meaning. Every remaining prefix names one Tracked Domain, and every one of the six
domains is represented.

**ADR-0079 §3's prerequisite is discharged**, and so is its other one: #280 is fixed by §5 rather
than separately. The wipe now has a predicate it can derive rather than a rule it must wait for.

**ADR-0085 keeps §1 and loses §2 and §3.** This is a record correcting the record that preceded it
by one commit, which is uncomfortable and is the right outcome: §1's test is sound and was not
applied to its own exceptions. The distinction §2 was reaching for — that some acts belong in the
ledger — survives and is sharper, because the act it named was not one.

**ADR-0014 gains a rule it did not have.** Its decision that entities carry a namespaced
colon-prefix is untouched and is now more true, since one minting site stops delegating the choice
to a web page. What changes is its Consequences: identity aliasing across `isbn:` is now
deliberately produced rather than a hazard to be bridged later (§4).

**What it costs.** A scraped book and a read book are two entities (§4); the two toggles no longer
follow you to a new device (§2); and every food twin in an existing jar carries `twin/brand` and
`twin/raw_provenance` under names nothing will read again. The last is affordable only because the
parent map's decision 8 owes no backwards compatibility, and it will never be cheaper than now.

**What it forecloses.** A minting site that invents its own prefix. After §7 that is a build
failure rather than a defect discovered by a wipe that took the wrong rows.
