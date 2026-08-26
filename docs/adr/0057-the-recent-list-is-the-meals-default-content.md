# ADR 0057: The Recent list is the meal's default content, closed to that meal

**Status:** Accepted  
**Date:** 2026-08-26  
**Implemented:** [#128](https://github.com/palebluebytes/inventoria/issues/128); `src/lib/food/recent-foods.ts` (the walk and the empty line), `src/lib/views/food/LogFoodSheet.svelte` (the cap and the catalogue rule), `src/lib/views/food/FoodStager.svelte` (where both render)

## Context

Searching `banana` for breakfast put it in the Recent list for lunch, dinner and
snack too. The list was built from the whole consumption history, newest first,
with no reference to the meal being logged, so a food eaten at exactly one meal
competed for the twelve slots at the other three.

The information needed to fix that was already at both ends. The log sheet takes
`meal_type` as a prop, and every Consumption Event carries `event/meal_type`
written from the `+ Add {meal}` button that opened the sheet. Nothing new has to
be stored, and there is no migration: this is a read over facts already held.

### What the surface actually is

[#128](https://github.com/palebluebytes/inventoria/issues/128) was first framed
as a choice between two treatments of a list — filter the foods from other meals
out, or leave them in and let the meal decide their rank. Both framings were
wrong about the surface.

Recent is not a result list. It is **the default content of a sheet whose own
title is the meal** (`LogFoodSheet.svelte`, `title={meal_type}`). A user who
taps `+ Add breakfast` has already said what they are doing; what appears before
they type is a suggestion, not an answer to a query.

That distinction settles the rest of this record, because a default is judged on
being **right**, not on being **complete**. Completeness has somewhere else to
live: the search box directly above the list, which reaches the whole corpus and
the whole ledger. Nothing is lost by narrowing a default that sits beside its own
escape hatch.

### Alternatives that were genuinely live

**Rank rather than filter** — keep every recent food, order same-meal foods
first. It satisfies the complaint (a breakfast food can then only be displaced by
another breakfast food) and it never withholds anything. It was the recommended
answer under the list framing and it does not survive the default framing: a
shortcut whose tail is padded with foods you did not ask for is filling twelve
slots rather than serving one meal.

**Split the list** into "Breakfast" and "Also recent" sections. Honest, and it
doubles a surface that exists to save the user a decision.

**Time of day instead of the meal label.** Rejected deliberately rather than by
omission. `meal_type` is explicit user intent, already stored, and free; clock
time infers that intent and infers it wrongly for anyone eating breakfast at 3pm.

**A setting to choose.** The original ticket asked for one and this record
refuses it; §6 gives the reason.

### A premise that turned out to be false

The ticket held that scoping snack risked stranding foods logged with no explicit
meal, because `asMealType` falls back to `"snack"`. It does not. There is exactly
one writer of a Consumption Event (`calorie.store.ts`) and it always writes
`event/meal_type`. `asMealType` is a **read-side** guard narrowing an arbitrary
ledger string back to the four-member union at the single read boundary; the
fallback fires for an out-of-set value, not for an absent one. No such population
exists, so §3 scopes snack like any other meal.

### Scope

This record covers what the log sheet offers before the user types. It does not
cover the ordering key within that offer (§8), the Recipe tab (§8), or anything
about how a food is searched for, ranked, or stored.

## Decision

### 1. Recent is the meal's default content

The Recent list shows the foods previously logged **at the meal being logged**.
It is read from `event/meal_type` per event, so a twin logged at both breakfast
and dinner is default content for both. There is no stored attribute and no
migration; the scoping is a read.

### 2. Closed, and twelve is a cap rather than a target

The list is never topped up from other meals to reach a length. A meal with three
foods behind it correctly offers three, and a meal with none correctly offers
none (§5).

The twelve-slot cap survives as a ceiling only. Padding a default to a fixed
length with foods from other meals would reintroduce exactly what §1 removes,
and would do it in the least visible way — at the bottom of a list, where a user
cannot tell a suggestion from a filler.

### 3. Snack is a meal

Snack scopes like breakfast, lunch and dinner. It is a button the user pressed,
not a residue, and the Context above records why the argument for exempting it
rested on a population that does not exist.

### 4. The walk is pure, and uncapped

The candidate walk lives in `src/lib/food/recent-foods.ts` as
`recentCandidatesForMeal(events, meal_type)`, taking the consumption history and
returning every distinct food logged at that meal, newest first. It reaches no
database and holds no clock, so the rule in §1 is asserted directly in unit tests
rather than through the component that renders it.

**It is uncapped, and the previous `RECENT_CANDIDATES = 40` is removed.** A
meal's default cannot be computed from the newest N events, because the N+1th may
hold the only breakfast in the history. Under the old cap, a user logging three
meals a day pushed their breakfast foods out of the newest forty events within a
fortnight.

Removing the cap costs nothing that matters. The walk already sorted the entire
consumption history on every recompute, so a forty-element early exit was never
what the work cost, and the recompute fires when the store **changes** — a log or
a retraction — not on render.

The catalogue rule ([ADR-0035](0035-custom-food-intent-chooser.md) §6) and the
twelve-slot cap both stay in the caller, because both need the resolved food
twin and fetching twins is I/O this fold must not do
(`CODING_STANDARDS.md` §2.1). The two rules compose without either being aware of
the other: ADR-0035 §6 decides what a food **is**, this record decides what the
surface is **for**.

### 5. An empty default names its meal

When a meal's default is empty, the Search tab says so in one line that names the
meal, rather than rendering the silence it rendered before.

The line is not decoration. A first-run user reads a blank surface correctly; a
user with months of history opening a meal they have never logged does not, and
silence there reads as broken. The line therefore states that there is nothing
**for this meal**, and says what fills it, since the mechanism is not visible
from an empty surface.

It offers no route out, because the route out is the search box already above it.

The line waits on the twin resolution having settled. An unguarded empty check is
true for the moment before the first twin lands, which would flash the line on a
meal that has plenty.

### 6. No setting

There is no toggle, and no new `settings/food/…` attribute.

A preference earns its place when the wrong answer is expensive to escape. Here
the escape is typing, in a box already on screen and already the primary
interaction on that tab. Against that, a toggle would cost a permanent entry in
`docs/eavt-vocabulary.md`, a row in Food Settings for the life of the app, and
its own writer to avoid the clobber hazard that already forced
`saveLogExportConsent` out of `saveSettings` — every caller of that function must
echo back every key it does not own, so a screen that forgets one silently
reverts it.

This clause is recorded because the ticket asked for the opposite. Read as a
refusal, not as an oversight.

### 7. ADR-0055 §1 governs the corpus, not a default surface

[ADR-0055](0055-who-eats-a-food-ranks-it-and-never-drops-it.md) §1 holds that
prevalence is a ranking reason and never a dropping reason. This record narrows
what a user is offered on the ground that they do not eat it at this meal, so the
relationship needs stating rather than leaving for a later reader to trip over.

**It does not reach here, and this record does not amend it.** ADR-0055 §1 is
about the search corpus, and its stated reason is that "being wrong deletes a
food with no way for a user to discover the loss". That reason is what fixes its
scope. A default narrowed to your own history deletes nothing and hides nothing:
every food remains in the corpus, in the index, and one query away on the same
screen. The recovery ADR-0055 §1 says a dropped row has no path to is, here, the
box above the list.

The boundary runs between a **corpus**, which must be complete because it is the
only place a food can be found, and a **default**, which must be apt because
something else is already complete. A future argument for narrowing what search
itself returns gains nothing from this record.

### 8. What this record does not decide

- **The ordering key.** The list remains ordered by recency. A default arguably
  wants habit over chronology — the banana logged forty times, not the sardines
  logged once yesterday — and scoping makes that gap more visible, since twelve
  slots now serve a smaller and more repetitive population. That is a
  ranking-key change and it is
  [#165](https://github.com/palebluebytes/inventoria/issues/165), not a rider
  here. [#130](https://github.com/palebluebytes/inventoria/issues/130) and
  [#143](https://github.com/palebluebytes/inventoria/issues/143) are both records
  of this project adopting a ranking key that measurement then refuted, and
  ADR-0055 §2 sets the bar such a change has to clear.
- **The Recipe tab.** It stays unscoped. It is not default content — the sheet
  opens on Search — and a tab reached by a deliberate tap owes the user what they
  asked for. A recipe also has no meal identity of its own; only its
  instantiations do, so the signal would have to be built rather than read.
- **Recording the empty case.**
  [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)
  records an empty food _search_ locally, and the two shapes look alike enough
  that the omission would otherwise read as accidental. An empty search is
  evidence about a corpus this project bundles and can act on. An empty meal
  default is evidence that the user has not logged that meal yet; it self-heals
  the first time they do, and there is no action behind it.
  [ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md) §2
  is "no channel without a reader", and this channel would have none.

## Consequences

**A meal you have never logged now offers nothing.** This is the change's real
cost and §5 is the whole of the mitigation. Before, such a user got twelve foods
from elsewhere; now they get a sentence and a search box. That is honest and it
is worse for exactly one session per meal, after which the meal fills itself.

**A food logged at the wrong meal is invisible in the default for the right
one.** Log a banana under snack when you meant breakfast, and breakfast will not
offer it until you log it there. Searching for it still works, and doing so fixes
the default. The alternative — inferring that a snack banana probably belongs to
breakfast — is the time-of-day guess the Context rejected.

**Four meal defaults fill four times more slowly than one shared list did.** The
list is a per-meal habit now, and a habit takes longer to establish across four
buckets than one. There is no way to have scoping without this; it is the same
property viewed from the other side.

**The unit a food carries is now read per meal.** `isCatalogueFood` is decided by
the unit of the newest log **at that meal**, not the newest overall. This is
strictly more correct — a serving logged at dinner no longer governs how the same
food qualifies at breakfast — and it is a behaviour change beyond the scoping
itself, so it is pinned as a test rather than left to be discovered.

**The walk is now testable and the sheet is thinner.** Extracting it moved domain
logic out of a `.svelte` file (`CODING_STANDARDS.md` §2.2) and made the rule
assertable datoms-in / result-out, including a synthetic-ledger bench over five
thousand events that pins the removal of the forty-candidate cap against the
performance criterion #128 set.

**The empty-state hint is host-supplied.** `FoodStager` takes it as a prop rather
than deriving it from an empty `recent`, because the stager has another host —
`AddIngredientSheet` — with no Recent concept at all, for which silence remains
correct. A stager that inferred the message would have to special-case that host.

**If the ordering key changes (#165), the heading becomes a lie.** "Recent" is
accurate only while the order is recency. That is a constraint on #165, not a
defect here, and it is recorded so #165 inherits it.
