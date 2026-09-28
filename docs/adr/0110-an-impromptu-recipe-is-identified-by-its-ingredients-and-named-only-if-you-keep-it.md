# ADR 0110: An impromptu recipe is identified by its ingredients, and named only if you keep it

**Status:** Accepted  
**Date:** 2026-09-17  
**Amends:** [ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md) §4 (Consolidate's row becomes conditional — it creates **or reuses** a twin — and a name stops being required of it) and its 2026-08-28 amendment (review-and-edit keeps its screen and gains a second entry point)  
**Amends:** [ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) §5 (a minted twin id can now collide, and collision is the mechanism rather than the objection it was answered as)  
**Charted by:** #470

## Context

Consolidating logged foods into one dish mints a `recipe:` twin that is named,
permanent, and listed beside the recipes you sat down and wrote. #470 was filed
on the premise that this is unwanted: the twin is structurally required by
ADR-0022 §2 (an instantiation must name what it was seeded from), a name is
made mandatory by the builder, the browse list filters nothing, and nothing can
remove one. "Your recipes" grows by an entry you did not ask for, monotonically.

**The measurement refuted the premise.** The #241 export — 3,645 datoms, 15
days, one device — holds four recipes. Consolidate leaves a unique signature:
its victims carry `event/replaced_by` pointing at a `recipe:` entity where an
ordinary edit points at an `event:` (163 against 19, across three recipes).
**Three of the four came from Consolidate, and two of those three were cooked
again on a later day** — Bean salad at +1.6 days, Chia pudding at +4. Only
Peanut noodles was never reused, and its three events fall inside 52 minutes.
So the twin is not scaffolding to be suppressed; it is usually the point.

What the measurement also showed is that **the two cases are different in kind**.
"I keep eating this combination, now it has a name" and "on that day I made a
dressing from these ingredients" are both real, and the app had one shape for
both. This record gives the second its own shape rather than hiding it.

### Alternatives that were live

- **A reusability flag on the twin**, the recipe analogue of
  `food/manual_entry.kind` (ADR-0035 §6). Rejected once the display problem was
  priced: an unnamed twin needs a display answer anyway, and once it has one the
  flag is a second representation of a fact the name already carries, which a
  fold would then have to arbitrate between.
- **Archiving or soft-deleting a twin**, mirroring `habit/status` (ADR-0008).
  Rejected as the wrong default: it makes the library grow on every
  consolidation and asks you to tidy up after. Removal of a recipe remains
  impossible and remains out of scope.
- **No template at all** — letting `event/instantiation.based_on` be absent.
  Rejected: it gives the app two shapes of logged recipe and rewrites ADR-0022's
  model to avoid a problem that a missing name solves.
- **Ordering the library by frecency.** Rejected as a measured no-op, not on
  principle. `Frecency.recent` is a ring position over `FRECENCY_HISTORY` = 100
  distinct targets; this ledger has 95, so no two candidates ever tie and
  `frequent` is never consulted. The output is newest-first, which is what the
  list already renders. It becomes real work when #165 replaces the ring with
  wall-clock freshness bands.
- **A content lookup at consolidate time** rather than a derived id. Rejected on
  precedent: every one of the 17 `FROM datoms` queries in `src/` filters by
  entity, attribute or prefix, none filters on `value`, and there is no index on
  it. Every dedupe in this repo works by reconstructing a deterministic id.
- **Collapsing the browser's rows by identical composition.** Refused by
  ADR-0058 §12 with measurement, and that refusal is inherited here.

### Scope

This record covers what Consolidate mints, how an unnamed dish is identified and
displayed, where it is read, and how it becomes a named recipe.

It does **not** cover: removing or archiving any recipe, which remains
impossible; the ordering of either list, which waits on #165; or `food:custom_`,
whose reusability rule is ADR-0035 §6 and which this record deliberately leaves
alone. A later reader should not treat those silences as rulings.

## Decision

### 1. A recipe twin with no name is an Impromptu Recipe

`recipe/name` becomes optional. A `recipe:` twin that carries one is a **Recipe
Twin** and belongs to the library; one that does not is an **Impromptu Recipe**
and does not. Both are complete, durable records. An Impromptu Recipe is not a
recipe missing something, and nothing in the app asks you to finish it.

**The absence of the name is the entire discriminant.** No attribute records
which verb minted a twin, no flag records its kind, and nothing defaults on
absence, because absence _is_ the value.

### 2. The library is the named twins, and nothing else filters

`recipeTwinsStore`'s query is unchanged: `WHERE attribute = 'recipe/name'`. What
was an unfiltered accident becomes correct by construction — the library is, by
definition, the things you named.

This is the whole of the membership rule. An Impromptu Recipe is excluded from
the library and from the log sheet's Recipe tab, and from **nothing else**: it
appears on its day, in reports, in past-meal copy, in a sent meal, and in the
"Your foods" search block. The library answers _what do I cook_; every other
surface answers _what did I eat_, and an impromptu dish is a true answer to the
second.

### 3. A nameless dish is displayed from its own frozen snapshot

`consumption-state.ts` assigns `event.foodName` in one place. That assignment
gains a fallback: where the target twin has no name, the label is derived from
the event's own `event/instantiation` ingredient rows — "Olive oil, lemon,
mustard". Nothing is stored; `recipe/name` stays genuinely absent.

**The derived label is never written into `recipe/name`.** A stored label would
masquerade as authorship: editable, promotable, indistinguishable from a name
you typed. Derived at render it is what it actually is, a description of
contents.

The snapshot is the right source because it already denormalizes a per-ingredient
`name` for exactly this reason (ADR-0022 §2, display resilience). It is frozen,
so the label is per-occasion and survives the twin changing; and it is already
on the event, so the fallback needs no second read.

This one line is what makes absence survivable at all. Without it `foodName` is
`undefined`, and the day renders `Unknown Food` — the string reserved for a twin
that no longer resolves — while `partitionCopyable` sorts the row into `lost`,
a sent meal drops it on landing, and search and reports skip it.

### 4. Consolidate mints or reuses, and the ingredients are the id

An Impromptu Recipe's entity id is **derived from its content**: the first half
of a SHA-256 over its ingredient `ref`s, sorted, rendered hex. Consolidating the
same ingredients again computes the same id and therefore lands on the twin that
already exists, logging a second instantiation against it.

This is ADR-0014's stated purpose — "two offline devices must independently
generate the exact same entity identifier so that their datoms merge cleanly" —
reached the same way ADR-0073 §5 reaches it for `event:consume_`.

**Only the sorted refs go into the key.** Amounts, units, yield and batch weight
are excluded. They vary per occasion, they are already frozen on the event, and
including them would make the reuse a no-op in practice, because amounts are
floats that `scaleAmount` deliberately leaves unrounded in some paths. This is
ADR-0022 §2's boundary applied to identity: **the twin is what the dish is, the
event is what you made that day.**

The sort is what makes the key canonical, and it costs the stored ingredient
order where two twins collapse into one. That order is user-visible and nothing
normalises it today, so one of the two orders wins.

**The reuse pool is exactly the twins whose id is content-derived.** No kind
test, no name test. A recipe born named through Define or Create has a random
id and is never matched, which is right: a named recipe is its name,
instructions, notes and image as much as its ingredients, and two recipes with
one ingredient list and two methods are different things. An Impromptu Recipe is
nothing but its refs, so a hash captures the whole of it.

### 5. Promotion is naming, and naming is `edit`

An Impromptu Recipe becomes a Recipe Twin when you give it a name: one appended
`recipe/name` datom, after which it is in the library. Nothing else changes, no
event is touched, and every past instantiation of it is retroactively an
instantiation of the named recipe.

This is **not a new verb**. It scores the same as `edit` on all three of ADR-0022
§4's columns — creates no twin, logs nothing, retracts nothing — and writes the
same attribute on the same entity. What feels distinct about it is the change in
membership, and membership is derived rather than written.

**The id survives promotion**, because ids are immutable. So a promoted twin
stays in the reuse pool, and consolidating those ingredients again lands on the
named recipe — the consolidation becomes an instantiation of it, with no
re-pointing and no verb. Re-minting instead would orphan every existing
instantiation, whose `event/target` names the old id.

### 6. Impromptu recipes are read from a second list on the Recipes screen

Below "Your recipes", a list of impromptu dishes: **one row per occasion**, its
day and meal as the row's head and its ingredient lines beneath, newest first,
uncapped, flat. It is the `pastMealsFor` row anatomy, and it is a read over
facts the ledger already holds — no attribute, no projection.

Rows are not grouped under date headings and not collapsed by composition. A day
on which you made two dishes contributes two rows and repeats its date, which
ADR-0058 §12 settled for the picker and which holds here for the same reason.

It goes on the Recipes screen because that surface already exists to read
recipes rather than log them, and **nothing on it can put food on a day**. It is
not a sixth way in: the rail's five controls already need more width than the
header has, and a browse surface that reads history is the case CONTEXT.md's
Send face already set a precedent for refusing.

Picking a row opens the twin on the shared screen of §7.

### 7. One screen shows a twin, and it shows every day the twin was made

Both kinds open the builder in `edit` mode — ADR-0022's 2026-08-28 amendment
already settled that review and edit are one screen, and this record only adds a
second entry point to it.

The screen gains a **history**: every day this twin was instantiated, by date and
meal, using the same `dayLabel` the picker and reports share. A template's
instantiations over time are its history, which CONTEXT.md has said all along and
nothing has shown until now.

**An Impromptu Recipe's ingredients are read-only there.** Its identity is its
ingredient set, so editing them would make its id a lie: a later consolidation of
the new contents would mint a second twin, while one of the old contents would
land on this twin, whose ingredients had moved. Naming it is the only edit it
takes, and nothing is lost, because each occasion's real amounts are frozen on
its own event.

## Consequences

**A consolidation is one tap shorter and mints nothing you have to look at.** The
complaint #470 was filed on is answered by the model, not by a filter: there is
no list to keep clean, because an impromptu dish was never in it.

**"I keep eating this" becomes visible and then actionable.** Because identical
consolidations converge on one twin, frecency counts them as one target, the
history shows every day at once, and promoting reaches all of them with a single
datom. Under a per-consolidation mint, naming one dressing would have left the
other four unnamed forever.

**A `recipe:` id is no longer opaque.** ADR-0073 §5 defends twins crossing
verbatim partly on the grounds that a minted uuid "cannot collide"; for an
Impromptu Recipe collision is now the mechanism, and the id is a fingerprint of a
sorted ref set. Two people can test whether they hold the same dish by comparing
ids. That is what `gtin:` already does for barcodes, and it is stated here rather
than arrived at silently.

**A sent impromptu dish loses nothing on landing, and a named one still can.**
ADR-0073 §6 discards every line a payload carries for an entity the recipient
already holds. An Impromptu Recipe has no name, notes, steps or image to lose, so
the rule is free for it. A promoted twin keeps its derived id, so where both
devices hold it the sender's name and notes are discarded and the meal logs
against the recipient's copy — the rule working as designed, with a visible
result.

**Two twins that share an ingredient set can no longer be kept apart**, and there
is no escape hatch. If you assemble the same three things meaning two different
dishes, they are one dish. The recovery is to name one of them, which takes it
out of the impromptu case but not out of the pool.

**The stored ingredient order stops being reliable** for a twin reached by reuse:
the key sorts, so the surviving order is whichever consolidation minted it first.

**Nothing reaches back.** Existing twins were all authored with typed names, so
they land in the library correctly and keep their random ids; they are simply
never matched. No migration, and the freedom to break compatibility went unspent.

**Deferred behind a seam.** The two lists are unordered beyond newest-first.
#165's replacement of the ring-position key with wall-clock freshness bands is
what makes a frecency order say anything, and is the trigger for picking this up.

**Two defects must be fixed first.** #468, so that a reused twin does not spread
the `event/replaced_by`-names-a-twin defect across consolidations from different
days; and the "Your foods" search block, where a logged recipe already renders as
a row with no text at all — `mapPayloadToFoodResult` reads `food/name` and
`nutrition/info`, which no recipe twin carries — and can be the first, inverted,
best-marked row. That one is live today for named recipes; this record multiplies
the rows that hit it.
