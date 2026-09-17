# ADR 0111: A correction is another datom on the event, never another event

**Status:** Accepted  
**Date:** 2026-09-16  
**Amends:** [ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md) §2 (its "editing is by supersession, retract-and-replace per ADR-0008" bullet; the snapshot principle itself is untouched), [ADR-0088](0088-a-selection-is-a-mode-with-its-own-verbs-and-its-own-way-out.md) §8 and its 2026-09-02 "a scaled row lets go" amendment (a move stops being the exception and the release keeps one of its two reasons), [ADR-0107](0107-a-row-you-have-just-logged-is-revealed-in-three-rules.md) (its exclusion of corrections keeps its rule and loses its reason)  
**Implemented:** §5 [#468](https://github.com/palebluebytes/inventoria/issues/468) `src/lib/food/consumption-state.ts`; §6 [#470](https://github.com/palebluebytes/inventoria/issues/470) `8fb7ed3e`. §1 is [#467](https://github.com/palebluebytes/inventoria/issues/467), not yet landed.

## Context

`calorie.store.ts` corrects a logged occasion two different ways and has never
said which is which. `changeLoggedFoodAmount`, `scaleLoggedFoods` and
`correctInstantiation` **re-log and retract**: they append a whole new event, then
write `event/status = "retracted"` and `event/replaced_by` onto the old one, so a
correction mints a fresh entity id every time. `moveLoggedFoodsToMeal` **appends in
place** — one `event/meal_type` datom onto the event that is already there — and
ADR-0088 §8 argues at length that this is deliberately not what the rest of the
module does.

The line §8 drew was "corrects a fact about one event" against "re-derives
numbers". It does not hold. Re-deriving numbers produces a new **value** for
`event/metrics`, and storing a new value for an attribute is what an append is.
Every other reason §8 gave for keeping the id — the event keeps its time, its
metrics, its photo, its provenance, its arrival mark, and a caller holding the old
id needs nothing back — applies word for word to an amount correction.

**Retract-and-replace does not converge, and this is measured.** Scratch fold over
a hand-built ledger ([#463](https://github.com/palebluebytes/inventoria/issues/463));
`computeConsumption` is pure, so nothing needed mocking. `event:e1` is a banana
logged at 100 g / 89 kcal and both devices hold it. Neither has seen the other when
it corrects, which is what a sleeping peer is
([ADR-0096](0096-devices-converge-without-both-being-awake-through-a-store-of-sealed-deltas.md)):

- phone, `T+10`: appends `event:e2` (200 g, 178 kcal), then writes
  `status=retracted` + `replaced_by=event:e2` onto `event:e1`;
- laptop, `T+11`: appends `event:e3` (300 g, 267 kcal), then writes
  `status=retracted` + `replaced_by=event:e3` onto `event:e1`.

Union the streams, sort by HLC, fold:

```
RESULT rows:      [ 'event:e3 300g 267kcal', 'event:e2 200g 178kcal' ]  day total: 445 kcal
COMPARISON rows:  [ 'event:e1 300g 267kcal' ]                          day total: 267 kcal
```

One banana shows **twice** and the day totals **445 kcal** where the truth is 267.
The fold filters on `e.status !== "retracted"`; only `event:e1` is retracted, and
the two replacements carry no status of their own, so both survive. Nothing asks
whether two live events claim the same predecessor. The same divergence appended
onto one entity yields one row and the later value. Controls both pass: one device
correcting once gives one row, and one device correcting twice in a chain gives one
row, so the two-row result is the divergence and not the fixture.

The slot walk then makes it harder to see. `event:e1`'s folded `replaced_by` is
`event:e3`, so `event:e3` takes `event:e1`'s place while `event:e2` keeps its own
arrival position — **in a fuller meal the two copies are not adjacent**, and the
duplicate does not read as one food.

**The alternatives that were genuinely live.**

_Keep replacing, and heal the fork on read._ A read-side rule alone would hide the
duplicate without stopping it being written, so every read would pay, forever, to
undo a write mechanism nothing else needs. It also leaves the id churn in place,
and the id churn is the thing the `event/replaced_by` slot walk exists to reverse.
Rejected as the primary answer; adopted below as the **secondary** one, because
ledgers that have already forked stay forked whatever the writer does next.

_Show the user a conflict._ It would be the app's only conflict surface, built for
a case whose two versions are usually near-identical, on a single person's own
devices where "the last thing I typed wins" is the intuition. Rejected in §2, and
named there rather than left implied, because a correction is the first attribute
whose losing value was somebody's visible intent.

_Leave it alone._ Not available. This is a wrong number displayed as a right one,
on `main`, reachable by any pair of the user's own devices.

**What retract-and-replace was buying.** Two things, and both are given up
knowingly. A **separately addressable snapshot per correction** — the 200 g version
had an id you could point at, and after this record it is a superseded value inside
one entity's datom stream. And a **free "this row is new" signal**: a fresh id is a
cheap way for a caller to notice a write landed. Neither is in use. No caller
consumes a replacement id anywhere in the repo: `changeLoggedFoodAmount` returns one
and both call sites discard it, `correctInstantiation`'s only caller deliberately
calls `onCommitted()` bare, and `scaleLoggedFoods` returns a **count** because the
ids it mints never leave the function.

**The convention was inherited, not derived.** `retractConsumptionEvent` cites
[ADR-0008](0008-immutable-habit-blueprints-via-version-chaining.md), and ADR-0022 §2
cites it again. ADR-0008 is about Habit Blueprints, and its argument is that an
Execution Event must target a fixed _version_ of the thing it scores against —
"Execution Events target a specific blueprint version with a fixed frequency,
making scoring algorithms vastly simpler". Nothing targets a Consumption Event; it
is a leaf. The citation is struck rather than amended: it was never load-bearing
here, and ADR-0008 remains Accepted and correct about habits.

**Scope.** This record covers how a Consumption Event is corrected, how concurrent
corrections converge, what `event/replaced_by` means afterwards, and the one
read-side rule that repairs ledgers already forked. It does not cover what a
correction looks like on screen, it does not change any sheet or control, and it
does not touch the four sanctioned destructive operations in `db.core.ts`. It says
nothing about corrections to media, habit, calendar or acquisition events, whose
`event/status` values are a different vocabulary in the same attribute.

## Decision

### 1. A correction appends onto the event it corrects

**`event/metrics`, `event/instantiation`, `event/quantity` and `event/meal_type`
are appended onto the existing Consumption Event. No correction mints an event, and
no correction retracts one.** The event keeps its id, its place in its meal, and its
`time`.

This makes [AGENTS.md](../../AGENTS.md) §3's first red line true as written rather
than true-with-an-exception: state shifts really are managed solely by appending a
newer datom that wins on its HLC stamp. It is also what
[ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md) already decided, in
as many words — it rejected retraction as standing scope and admitted it only "if
an attribute must be cleared rather than overwritten". A corrected amount
overwrites. It does not clear.

**A correction no longer moves an event's clock.** An event takes its _first_
datom's time (`datom-fold.ts` seeds `firstTime` and never moves it;
`consumption-state.ts` reads `time: g.firstTime`), so appending changes nothing.
Today a replacement _does_ move it: `consumptionDatoms` overwrites the hour and
minute with `now`, so correcting a 9am banana at 5pm restamps it 5pm. This is the
preservation ADR-0088 §8 claimed for a move, arriving for every correction.

**A removal is unchanged and was never a replacement.** `event/status =
"retracted"` alone, no link, one datom onto the event that is already there.

### 2. Concurrent corrections converge by last writer, and the loser leaves no mark

**Two devices correcting the same event converge to the later HLC's value, and the
earlier correction disappears from every surface with nothing said.** Its datom
stays in the ledger behind the winner, where every superseded value stays.

This is stated rather than implied because it is a real cost and the first place
the project pays it visibly: the losing value was a person's deliberate edit, not
bookkeeping. It is nonetheless what
[ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md) already promises for
every other attribute, and the alternative is a conflict surface this app has
nowhere else, built for a disagreement between one person's own two devices.

### 3. A frozen set is frozen together or not at all

**Every datom of one correction rides one `dbClient.append`.**

[ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md) §2 freezes
`event/metrics` and `event/instantiation` at the moment of writing, and a
replacement froze them together on one fresh entity, so no reader could ever see a
new headline beside an old breakdown. Appending onto a live entity makes that
mixture _representable_ for the first time, and the P2P payload builder's
`winningRows` narrows per `(entity, attribute)` — exactly the granularity at which
a half-arrived set would split. `scaleLoggedFoods` already rides one append;
`changeLoggedFoodAmount` and `correctInstantiation` use two and must fold onto one.

### 4. The line is arity

**There is one mechanism — appending onto entities that already exist — and
`event/replaced_by` is not a second one.** What varies between acts is how many
events they start and end with:

| Act                      | Arity | What is written                                         |
| ------------------------ | ----- | ------------------------------------------------------- |
| Correction               | 1 → 1 | datoms onto the event                                   |
| Removal                  | 1 → 0 | `event/status` onto the event                           |
| Log, copy, accepted meal | 0 → 1 | a new event; nothing is retracted                       |
| **Consolidation**        | N → 1 | one new event, and `event/replaced_by` on each of the N |

**N → 1 is the only act with no single entity to append onto**, which is why it is
the only act that mints one. The earlier proposal — that the line is "the set of
events changes" — sorts a removal and a copy onto the retract-and-replace side,
and neither has ever used it.

A 1 → 1 replacement was therefore always a degenerate use of a many-to-one link.

### 5. A replacement is live only where it is claimed

Ledgers that have already forked stay forked: the datoms are there forever and no
writer removes them. §1 stops new correction forks and does nothing for the old
ones, and Consolidate goes on forking because it cannot become an append. One rule
covers both:

> **An event that appears as the value of _any_ `event/replaced_by` datom was
> minted as a replacement. A replacement is live only where it is the folded
> winner for at least one predecessor.** An event that appears as no predecessor's
> link is an ordinary log and is never touched.

The fold must read the **raw** datoms for this, not `groupByEntity`'s output: the
superseded `replaced_by` values are precisely what the latest-wins fold discards,
and they are the evidence. `computeConsumption` already receives the rows.

Against the measured fixture: `event:e1`'s link folds to `event:e3`; `event:e2`
appears as a superseded value, so it is a replacement that won nothing and is not
live; the day totals 267 kcal, which is the truth. Both controls still pass, and a
chain `e1 → e2 → e3` is unaffected because each link in it is its predecessor's
winner.

**Two devices that consolidated overlapping foods converge to one recipe.** Where
both consumed the same foods, one consolidation wins every predecessor and the
other is unclaimed. Where they overlap only partly, **both stay** and the shared
food is counted in both — accepted deliberately: those are two genuinely different
acts, and every alternative shape loses a food rather than double-counting one.

**This rule drops a real logged event, and that is the cost.** The defence is that
it did not lose a log, it lost a **link**: it was superseded on the one attribute
that defines it as a replacement, by the same latest-wins discipline every other
attribute obeys. Set against a day total that is wrong while looking right.

### 6. `event/replaced_by` is a many-to-one link and nothing else

It did three jobs. **The many-to-one Consolidate link survives and becomes its only
job**: the reference from an event consumed into another event to the event that
consumed it. **The audit trail is not a job** — `calorie.store.ts` calls the link
"an auditable trail" and nothing in the repo audits it; §8 puts history elsewhere.
**The slot hint stays**, for two populations and neither of them corrections:
legacy chains already in ledgers, which must still hold their place, and
Consolidate.

**The link names the successor _event_, never a twin.** `RecipeBuilder.svelte`
currently passes `recipeId` — the `recipe:` **template** — where every other caller
passes an `event:consume_` id. It contradicts
[`eavt-vocabulary.md`](../eavt-vocabulary.md), it contradicts the ends the ADR-0105
§7 partition gate declares for the attribute, and it means the slot walk's
`slot < held` minimum — written for Consolidate and for nothing else — donates a
slot to an id no row has, so a consolidated recipe silently falls to the bottom of
its meal instead of taking its first ingredient's place. Fixing it is a
prerequisite of §5, not a tidy-up.

### 7. The rule is the projection's

**§5 lives in `computeConsumption`, and a reader that takes `ConsumptionEvent[]`
has already had it applied.**

This is stated because the codebase invites the opposite conclusion.
`frecency.ts` and `ledger-foods.ts` each keep their own `status !== "retracted"`
guard even though both are fed post-filter, which makes the projection look like
one seam among several. It is not, and §5 cannot be copied into either of them: an
unclaimed replacement is **not retracted**, so it is invisible to a `status` test,
and a pure function over already-projected events cannot construct the raw-datom
view the rule needs. A shared predicate would be a shape those readers could never
call.

### 8. A correction's history is one entity's datoms in HLC order

Not a chain of entities walked backwards. It carries **when** each correction landed
and **which device** made it, which a chain of ids does not, and it needs no link to
walk.

**Nothing reads a correction history today.** `event/replaced_by` has exactly one
reader in the repo — the slot walk — and that walk is forward and discards the
predecessor's identity one line after using it. There is no reverse index and no
"edited from" surface. This section is a claim about the future, not a migration of
a live reader. Legacy chains stay readable in the ledger regardless; nothing is
rewritten.

### 9. What does not move

**A correction still does not reveal its row**
([ADR-0107](0107-a-row-you-have-just-logged-is-revealed-in-three-rules.md)), and
the reason changes. It was "a replacement mints a fresh id for a row you were
already looking at". It is now that **your attention is already on the row you just
corrected**, and moving the page under a hand that has just committed an edit is
what the three rules exist to prevent. Note the mechanism would otherwise fire
_immediately_ rather than not at all, since the id is already in the day.

**A finished verb still ends the Selection**
([ADR-0088](0088-a-selection-is-a-mode-with-its-own-verbs-and-its-own-way-out.md)),
and one of its two reasons goes. "The Selection it kept was of foods nobody picked"
was true only because a scale retracted them; after §1 the events the person chose
are still there and still theirs. The release survives on its second reason —
applying and cancelling must not look identical — and on the older one CONTEXT.md
already states without reference to retraction: a Selection is the subject of a
verb, and a verb that has run has no subject left. Scale keeps clearing.

Against keeping the Selection alive through a scale: it would make Scale the only
verb that survives itself, and repeated scaling would compound silently — `×2`
twice is `×4`, with nothing on screen saying so. `scaleLoggedFoods` _could_ now
return the ids it wrote, and should still return a count, because nothing should
want them.

## Consequences

**The measured defect closes twice over**, which is the point of doing both halves:
§1 stops corrections forking, and §5 repairs the ledgers that forked before anyone
noticed. Either ships without the other.

**Three writes get cheaper.** A replacement rewrote every attribute of an event plus
two datoms on its predecessor; an in-place correction writes only what changed.

**The `event/replaced_by` slot walk starts working.** It has been dead in the only
case it was written for — many-to-one, Consolidate — for as long as Consolidate has
pointed it at a template.

**A superseded correction becomes unreachable in the UI**, where before it was an
entity with an id. Nothing pointed at one, but the capability is gone and getting it
back means a reverse index, not a flag.

**Partial-overlap consolidations double-count the shared food.** Named in §5 and
accepted; it is the one shape where two people-acts genuinely produced two recipes.
If it turns out to bite, the trigger for reopening is a user seeing a day total they
cannot account for, and the fix is a conflict surface, which is the thing §2
refused.

**`event/status` stays a shared attribute across four domains** with four unrelated
value spaces, scoped by entity prefix in the projection SQL rather than by
attribute. §5 adds no second overload of it: an unclaimed replacement carries no
status at all, which is exactly why it needed a name.

**The ADR-0105 §7 hole narrows and does not close.** A meal payload carrying an
`event/replaced_by` would still land a row pointing at an entity that did not travel
with it. After §1 the only events carrying the link are consolidated-away ones,
which are retracted and therefore can never be a send root, so the population
shrinks to nothing reachable. Carried by
[#427](https://github.com/palebluebytes/inventoria/issues/427), unchanged in kind.

**Deferred behind a seam:** a surface that reads §8's history. Nothing reads one
now; the trigger is a feature that wants to show what a logged occasion used to say.

## Amendment (2026-09-17, #468): §6's prerequisite shipped, and §5 is now the projection's

§6 says `RecipeBuilder.svelte` **currently** passes `recipeId`, the `recipe:`
template, where the attribute is defined as one event naming another. That was
true of `main` the day this record was written and is false now:
[#470](https://github.com/palebluebytes/inventoria/issues/470)'s consolidation
work fixed the call site (`8fb7ed3e`, on `main` as `42ec90f5`), so Consolidate's
retraction hands `retractConsumptionEvent` the `event:consume_` it has just
logged. The argument above is left as written; what changed is the code.

Two things follow, and the second is why §6 called the fix a prerequisite rather
than a tidy-up.

**The slot walk fires for the first time.** Its `slot < held` minimum was written
for Consolidate and for nothing else, and a `recipe:` id is in no event group, so
it had never once run: a consolidated dish fell to the bottom of its meal instead
of taking its first ingredient's place. `calorie-store.test.ts` covered the walk
with event ids throughout and so never saw this.

**§5's test is whether a folded link names an event.** A link naming a template
names nothing the projection can claim, so no consolidation could ever have been
claimed or unclaimed — the rule would have been inert on the population it exists
for.

§5 now ships in `computeConsumption` and nowhere else, as §7 requires: the set of
ids appearing as **any** `event/replaced_by` value, read off the raw datoms
before the fold discards the superseded ones, against the successors the folded
links still name. An id in the first set and not the second is an Unclaimed
replacement and is dropped. `tests/unit/unclaimed-replacement.test.ts` carries the
#463 fixture at 267 kcal, both its controls, the two consolidation shapes §5
decided between — same foods converging to one dish, partial overlap staying two
and counting the shared food twice — and the slot the surviving dish lands in,
which is the walk above running for the first time.

§1 is unchanged and still [#467](https://github.com/palebluebytes/inventoria/issues/467)'s.
Corrections go on forking until it lands; this half repairs the ledgers that
forked before either did, which is the independence the Consequences claimed.
