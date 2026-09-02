# ADR 0088: A selection is a mode with its own verbs, and one of them is a third scale of the Way out

**Status:** Accepted  
**Date:** 2026-09-02  
**Amends:** [ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md) (§3's "the same control at two scales" becomes three: an arbitrary selection of logged foods gains a nutrition panel, and the Way out sits in it)  
**Implemented:** #321, #322 `ed47e35` (`SelectionBar.svelte`, `ScaleTier.svelte`, `SelectionVerbIcon.svelte`, the Provisional figure in `FoodItemRow.svelte`), #323 `569c482` (`moveLoggedFoodsToMeal`, `MoveMealSheet.svelte`), #324 `faa7221` (`MealNutritionPanel` becomes `LoggedFoodsPanel`)

## Context

Long-press a logged food and a bar appears at the foot of the Food screen. It has
been there since the recipe builder needed a way to pick several foods at once, and
it was never designed: it is inline markup in `FoodView.svelte:910-929` holding a
bare count, a free-text factor field, `×`, `÷`, `Clear` and `🍲 Build recipe`, and it
wraps on a phone.

Three things were wrong with it at once, and they are not the same kind of wrong.

**It could not be read.** `×` and `÷` sit beside a number with nothing saying what
they act on. They are a bulk portion rescale — `×2` for a second helping, `÷2` when
you ate half of what you logged — and the only way to find that out is to do it,
which appends a new Consumption Event and retracts the old one for every selected
food.

**Two things people want were missing.** A food logged at the wrong meal cannot be
moved; [ADR-0057](0057-the-recent-list-is-the-meals-default-content.md) names the
consequence and offers no remedy. And a Way out exists for one meal and for a whole
day, but not for three foods picked off a day.

**It was accidental rather than decided.** It covers the bottom tab bar because its
`z-index` is 900 and the Sidebar's is 100, not because anyone chose that. Its count
never pruned itself, so changing the date left a number naming foods no longer on
screen. No test rendered it.

### What was live and what ruled it out

**Labelled verbs on one line** was the first shape drawn and the clearest to read.
It was eliminated by measurement, not by taste: at 360px, where the Utopia space
scale bottoms out, `✕ · N selected · Scale Move Recipe` wraps. Losing it is what
moves the burden of naming onto the icons and the surfaces behind them.

**A two-row bar** with the count promoted to its own line survives 360px and reads
well. It was kept as the runner-up. It costs about fifty pixels of a 727px screen at
rest, and the Scale tier would put a third tier on top of that.

**Putting the verbs behind a sheet** — a bar showing the count and one control that
opens a menu — was refused for the reason
[ADR-0059](0059-the-meal-header-offers-every-way-in.md) refused the `+`: a control
that opens a surface which then asks what you meant is a lobby rather than a door.
The `+` was a lobby because nothing had been chosen yet. Here the object is already
chosen and the bar is a verb list for it, which is what a selection bar is; hiding
the verbs would rebuild the lobby one level down.

**A visible way into selection** — a "Select" control in the day's
`.aggregates-head`, beside "Full day" — was drawn and refused. Long-press remains
the only way in. This is a deliberate choice and not an oversight: the two new
capabilities below ship behind a gesture nothing on screen advertises, and a later
reader should not treat that as a defect to be fixed without deciding it again.

**Previewing a scale as a kcal total** was refused twice over. Amounts do not sum
across a mixed selection —
[ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) forbids converting
between a weight and a volume, so there is no single total amount — and calories are
not what this app leads with.

**Scope.** This record settles the bar, what its verbs do, how a move is written,
and where a selection's Send code lives. It does not settle the payload, the
transport or the accept path, which
[ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md),
[ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) and
ADR-0074 already settle and which need no work. It does not settle whether the app
should lead with calories anywhere else.

The three shapes and the preview were prototyped before this record was written;
the prototype is kept on the `prototype/321-selection-bar` branch as the evidence
for the two verdicts measurement produced.

## Decision

### 1. The bar is the Selection bar, and the set it acts on is the Selection

Neither had a name. **Selection bar** names the strip; **Selection** names the set of
long-pressed Consumption Events. Plain words are used deliberately: the house style
is evocative where a reader has no prior word for the thing, and a selection is not
one of those.

### 2. Its shape is `✕ · N selected › · [scale][move][recipe]`

- **`✕` leads.** It is first in flow order, so no status line and no long count can
  wrap it off the bar. It is the only `✕` on screen while a selection is live,
  because a selected row swaps its remove `✕` for the `✓` corner
  (`DailyDashboard.svelte:430`, `Row.svelte:83`).
- **The count is a control**, not a label, and opens the Selection's nutrition panel
  (§8).
- **The three verbs are drawn marks** following `WayInIcon.svelte`'s spec: a 24×24
  box, `currentColor`, a 2.25 square-capped stroke, no fill. Recipe reuses that
  component's own pot path, which **retires the `🍲` emoji**: ADR-0059 §5 already
  holds that these marks are drawn rather than borrowed because an emoji reads as a
  sticker in a grayscale header, and the bar was the last place one survived.
- **One status line** serves every verb. It carries `role="status"` and is **silent
  on success**. A verb whose effect you can watch does not need narrating.

### 3. A Selection is a mode, and it has three exits

The Selection bar covers the bottom tab bar deliberately. While a Selection is live
the bar owns the bottom of the screen and you leave the mode before you leave the
screen.

Because the ordinary exit has been taken away, back must mean the nearest thing
available: **`✕`, `Escape` and the platform back gesture all leave the Selection**,
and back only leaves Food once nothing is selected. A mode that covers the
navigation and does not answer back is a trap.

### 4. A Selection belongs to one day

Changing the viewed date clears it, and an id that leaves `dayItems` is pruned; if
that empties the set the bar dismisses itself.

Carrying a Selection across days would leave one verb working and three not: Move is
same-day by definition, the Selection's panel is a day-scale readout, and Build
recipe consolidates within a day. A count naming foods you cannot see is the
affordance that lies which ADR-0074 §6 already refused when it rejected a receive
badge.

### 5. Scale is a tier of the bar, never a sheet, and the rows are the preview

The Scale control is a **fixed-height expansion of the Selection bar**: its height
does not change with the size of the Selection. It is not a `BottomSheet`, because a
sheet dims what is behind it and may cover most of the screen, and what is behind it
is the thing being previewed.

`[× | ÷] [factor] [Apply ×2]`, in that order — an operation applied to a number
rather than a number awaiting an operation. The operators are a `ui/ToggleGroup`, so
tapping the active one clears it and cancels the preview, which is the deselect
behaviour that primitive already has everywhere else
([ADR-0040](0040-no-monolithic-chip-vocabulary.md)). The factor keeps the
amount-expression grammar `parseScaleFactor` accepts, so `3/2` still parses. `✕` and
the count stay on screen throughout.

**Choosing an operator previews the result on the real food rows.** There is no copy
of the list inside the control, and the tier states no totals.

### 6. A previewed figure is a Provisional figure, and no row ever moves

A figure shown at what it would become wears the **Provisional figure** mark:
inverted, `--ink` fill with `--paper` text. A preview that looked identical to a
stored value would be worse than none, because a scale is a real ledger write and
you would have no way to tell whether you had already done it. `--green-bg` may not
carry this mark: acid green on the row's `--highlight-bg` yellow fails contrast.

**A row's geometry may not change between previewing and not.** Not its height, not
its width, not its order. This is a rule and not an aspiration; four independent
mechanisms break it and each is closed:

1. The mark's box is present at rest with only its colours switching, so toggling an
   operator changes no layout.
2. A negative inline margin cancels the mark's horizontal padding, so the figure sits
   where it would with no mark and the fill bleeds into the row's own padding.
3. The trailing figure's column is width-reserved and set in `tabular-nums`, because
   a scaled figure gaining digits (`97` to `48.5`) otherwise widens that column,
   squeezes the name column and rewraps the food's name.
4. The quantity line may not wrap. It truncates instead, which also keeps it inside
   the frame at 360px.

### 7. A food that cannot be scaled says so before the fact

Recipe instantiations and weightless `1 serving` entries have no amount to scale.
Today that is discovered while the loop runs and reported afterwards. It is resolved
up front instead, and the row carries the reason in place while a preview is live.
Applying still proceeds with the foods that can be scaled.

### 8. A move is one datom, and it is not a supersession

Moving a food to another meal **appends a new `event/meal_type` datom onto the
existing Consumption Event** and does nothing else. The event keeps its id, its
`event/time`, its metrics, its photo, its provenance and its arrival mark, and the
Selection survives the move because no id changes.

This departs on purpose from every other edit in `calorie.store.ts`, which re-logs
and retracts. A retract-and-replace would assert that you un-ate that banana at
breakfast and ate a different one at lunch, leaving two bananas in the history with
one retracted. A move corrects a fact about one event and re-derives no numbers.
`retractConsumptionEvent` already establishes that a Consumption Event may gain an
attribute after the fact.

The destination is chosen from a `BottomSheet` holding four Rows — Breakfast, Lunch,
Dinner, Snack — **always all four, in that order**, including meals that already hold
part of the Selection. A Selection may span meals, so there is no single meal it is
moving _from_ and none to sensibly exclude; a list that is sometimes four items and
sometimes three teaches nothing and is slower the second time.

### 9. The Way out gains a third scale, and the count is its door

An arbitrary Selection of logged foods may be handed to another person. ADR-0074 §3
said the Way out is the same control at two scales; it is now three.

Nothing about the payload changes. `buildMealPayload(roots, read)` already takes an
arbitrary list of `event:consume_` ids — a meal is the roots of one meal and a day is
the roots of every event on the day — and the receive side dispatches per event on
its own `event/meal_type`, so a Selection spanning meals lands correctly with no new
code.

What changes is the surface. ADR-0074 §3 requires the Way out to sit inside a
nutrition panel and requires that panel to turn into the Send code rather than open a
second surface, so **the Selection gets a nutrition panel** and the Way out sits in
its `actions` slot. The panel is reached by tapping the count.

**There is no share verb on the Selection bar.** A one-tap route to a code would
privilege the subset over the two scales that already exist, each of which costs two
taps, and the panel is where you see what you picked before you send it.

### 10. What a verb does to the Selection afterwards

A verb that leaves the foods in the day keeps them selected; a verb that consumes
them into something else does not. Move and the hand-off keep it. Build recipe
clears it, because its subjects no longer exist.

## Consequences

**Two capabilities ship behind an unadvertised gesture.** Long-press is the only way
into a Selection, so moving a food between meals and handing over a few foods are
both reachable only by someone who already knows the gesture exists. This was
decided rather than overlooked (§Context), and it is the most likely thing about this
record to be argued with.

**The bar says nothing in words.** Choosing icons bought the width that labels could
not have at 360px, and the price is that the two sheets and the tier now carry the
whole burden of explaining what the marks meant. If the icons turn out not to read,
the failure will show up as people not using Move rather than as a complaint, which
is the hardest kind of failure to notice. The `move` mark in particular is new to
this record and has no sibling in `WayInIcon` to borrow from.

**`calorie.store.ts` gains a second edit shape.** Five of its functions re-log and
retract; the move appends in place. A reader who infers "every edit is a
supersession" from the others will now be wrong, and the reason is written in §8
rather than left to be rediscovered.

**A nutrition panel is now built from three different item sets.** A meal's, the
day's, and an arbitrary Selection's. That generalisation is cheap today and is worth
watching: a fourth scale with different needs would be the point to ask whether the
panel is doing too much.

**The Provisional figure's four no-move rules are load-bearing and easy to break.**
Each closes a real mechanism found by measurement, and three of them (the reserved
box, the cancelling margin, the reserved column) look like fussy CSS that a later
tidy-up would remove. The rule in §6 is what a reviewer should check against, and the
prototype's own instrument — which measures row-height drift while previewing — is
the fastest way to prove it.

**The reserved trailing column is sized for realistic factors, not all of them.** A
sufficiently large factor still gains enough digits to beat it and rewrap the name.
Clamping was considered and not done; picking it back up would mean deciding what a
figure too wide to show should say.

**Selection state stays in `FoodView.svelte`.** It is component state, not a store,
and this record does not move it. Four verbs now read it, and if a fifth caller
appears outside that component the seam to cut is the Selection itself.

## Amendment (2026-09-02): a scaled row lets go as its own write lands

**§10 is wrong about Scale, and §5 gains the acknowledgement it was missing.**

§10 said a verb that leaves the foods in the day keeps them selected, and named
Scale as one that does. Two things were wrong with that.

**The Selection it kept was of foods nobody picked.** A scale is a
retract-and-replace: every event in the Selection is retracted and a new one
minted. Re-pointing the Selection at the successors — which the pre-ADR code did
deliberately, commenting that this was how "the Selection survives the
operation" — leaves you holding a set of events that did not exist when you
chose. Surviving was the wrong goal.

**Applying looked exactly like cancelling.** Both dropped every Provisional
figure and left plain rows, and only the numbers differed. A write across every
selected food had no acknowledgement at all, while an abandoned preview had the
same one.

So the rule in §10 is narrowed: **a verb that only re-files or copies the foods
keeps the Selection; a verb that rewrites or consumes them ends it.** Move keeps
it, because the events are the same events. The hand-off keeps it, because it
writes nothing here. Scale and Build recipe end it.

**The acknowledgement is the release, not a beat before it.** The row's highlight
washes back to paper over one house-duration transition (0.15s, `--ease-snap`),
and paper is where a deselected row already sits — so there is nothing to flash
back from and no second state to wait through. It lives on `.food-item` rather
than behind a flag, because a row has no way to be deselected-and-not-written: a
cancelled preview leaves its rows selected, so the transition only ever runs when
something happened.

### The run is one write, so it is one gesture

First built as a loop, releasing each row as its own write landed. That read as a
cascade, and the cascade was too slow to be an acknowledgement: per food it cost
three worker round trips and two full re-projections, so a Selection of five took
five visible beats to let go. The stagger was never designed — it was the shape
of the round trips showing through.

Nothing in the run needs the worker until the write. The Scale tier resolves
every panel before it draws, because that is what the live preview derives from,
so the caller already holds what the write needs; `changeLoggedFoodAmount` was
reading each twin a second time. What is left is arithmetic, and the whole
Selection collapses into **one append**: one projection, one frame, every row
taking its new figure and letting go of its mark together.

Two things fall out of the single append beyond speed. No intermediate state is
ever projected — a retract-and-replace split across two appends briefly shows the
day holding both the old food and its replacement, growing a row and then losing
it again. And there is no half-applied run to report: the write is all of them or
none, so a failure means nothing was written rather than some unknown prefix.

What is still per food is the **skip**. A Recipe Instantiation or a weightless
entry never enters the run, and was already saying so on its own row from the
moment the tier opened — which is where that belongs, rather than in an apology
once the run is over.

### And the row has to stay where it is

None of the above is legible if the row moves, and it did. The consumption
projection listed events in arrival order — the order their first datom reached
the ledger — so a replacement, minted at the moment you press Apply, sorted last
and dropped to the bottom of its meal. Scaling three foods reordered the list
under the very transition meant to acknowledge them, and because the meal list is
unkeyed, the flash landed on whichever rows had shifted into those positions
rather than on the foods that were written.

The fold now hands a replacement **the place its predecessor held**, following
the `event/replaced_by` link that `retractConsumptionEvent` was already writing.
Where several events collapse into one, the successor takes the earliest of their
places.

This is not a Selection rule and does not belong to this record alone: every
correction in the domain is append-only, so the amount picker's Done and Build
recipe were dropping rows to the bottom in the same way, and both are fixed by
the same change. Recorded here because this is where it was found. A day nobody
has corrected reads exactly as it did before.

## Amendment (2026-09-02): the bar says nothing, and the hand-off is a verb

§2's shape becomes `✕ · [scale][move][hand off][recipe]`, and §9's "the count is
its door" is withdrawn.

**The `N selected ›` control is removed.** It was doing two jobs and neither
survived scrutiny once the bar was in front of someone. As a count it restated
what the rows already say: a selected row carries a `✓` corner, so the tally was
a second telling of a fact the screen was already showing, in the one place with
the least room for it. As a door it was unmarked — an underline and a chevron are
what a link looks like, not what a nutrition panel looks like — so the Selection's
Way out was reached through the least legible control on the bar.

**The door it was becomes a verb.** `WayOutIcon` joins the row of marks and opens
the same panel, which keeps everything §9 built: the panel still holds what the
foods add up to, the Way out still sits in its `actions` slot, and the payload
work remains none. §9's _"there is no share verb on the Selection bar"_ is
therefore reversed on its surface but not in its substance — the verb is a door to
the panel, not a one-tap route to a code, so handing over a Selection still costs
the same two taps as handing over a meal or a day.

Four marks and a `✕` measure 220px of the 360px floor before gaps, so the
labelled-verb finding that shaped §2 is untouched.

**The count still exists; it is simply never drawn.** The verbs name themselves by
it — _Scale these 3 foods_, _Hand over this food_ — so a screen reader hears the
size of what it is about to act on, which the old markup only ever said once, in a
control a reader had to reach before the verbs made sense.

## Amendment (2026-09-02): a finished verb ends the Selection, whatever it did

§10 is replaced. It said a verb that leaves the foods in the day keeps them
selected and only one that consumes them clears it, which put Move and the
hand-off on one side and Build recipe on the other. The first Amendment above
narrowed that to "re-files or copies keeps it, rewrites or consumes ends it" and
moved Scale across. Both readings were wrong about what the Selection is for.

**A Selection is the subject of a verb, and a verb that has run has no subject
left.** Whether the foods survive the verb is a fact about the foods, not about
the mode; keeping them picked because a move happened to mint no ids offers a
second act on a set the user has already spent. So every verb ends it:

| Verb         | Ends the Selection                          |
| ------------ | ------------------------------------------- |
| Scale        | when the append lands                       |
| Move         | when the last food is re-filed              |
| Hand off     | when the panel closes, if a code was minted |
| Build recipe | when the builder opens, as it always did    |

Three details the rule does not read off its own statement:

**A failure is not a finish.** Scale writes in one append, so a throw wrote
nothing and every id is still live: the whole Selection survives and can be tried
again. A move mints no ids either, so a partial failure keeps all of it. What a
run merely _skipped_ is different — a food with no weight to scale was never
acted on, so it alone stays picked while its neighbours let go, which is a better
answer than the note it used to get, because it points at itself.

**The bar is the only place a note can live**, and an empty Selection unmounts
it. That is not a reason to hold a Selection open, but it is why the two rules
above have to agree: every case that has something to report is also a case that
leaves something picked.

**The hand-off ends on close, not on the press.** The Selection's panel is
mounted behind a non-empty Selection, so clearing at the moment the Way out is
pressed would unmount the panel — and `SendFace`'s mount _is_ the send session
(ADR-0074 §3), so the code would die as it was minted. Closing a panel without
handing over is not an action on the foods and keeps the Selection, which also
makes the panel usable as what it otherwise is: a look at what you picked.

Build recipe is unchanged and still clears at the moment the builder opens rather
than when it saves, so the recipe that lands is never itself selected.

## Amendment (2026-09-02): a move of several foods is one append

§8's title still holds — a move is one datom per food, and not a supersession —
but a move of N foods is now **one append**, not N.

The reasoning is the first Amendment's, applied to the other writing verb.
Appending per food costs a worker round trip and a full re-projection each, so
the foods relocated one at a time and the meal sections redrew once per food. In
one append they arrive together and the sections redraw once. Nothing about the
datoms changes: still one `event/meal_type` per event, still no id minted, still
latest-wins doing the rest.

The write becomes all-or-nothing, replacing a per-food isolation the function
used to advertise. That isolation only ever covered a failing `append` — a
ledger-level fault rather than a fact about one banana — and the count it
returned never said _which_ food failed, so no caller could act on the
distinction. The genuine per-food case survives untouched, because it is not a
failure: a food already at the destination is decided before the write and is
reported as moved even when the append fails, since it was never part of it.
