# ADR 0101: The ways into a day are one bar, anchored where the hand is

**Status:** Accepted  
**Date:** 2026-09-13  
**Amends:** [ADR-0059](0059-the-meal-header-offers-every-way-in.md) §1 (a way in stops being a control in the meal header; the roster of five, their order, their labels and their single-purpose sheets are all untouched)  
**Amends:** [ADR-0078](0078-a-facet-contains-no-way-out.md) §1 (Rations gains a permanent pinned surface; the no-way-_out_ rule it was written to protect is untouched, because this bar links nowhere)  
**Amends:** [ADR-0088](0088-a-selection-is-a-mode-with-its-own-verbs-and-its-own-way-out.md) §3 (a Selection owns the foot of the screen on a phone and the head of the day's column on a desktop; it owns one slot either way)  
**Implemented:** [#416](https://github.com/palebluebytes/inventoria/issues/416) — `src/lib/views/food/WayInBar.svelte` (§1, §2, §3, §5, §6), `src/lib/views/food/WayInRail.svelte` (the panel), `src/lib/views/food/DailyDashboard.svelte` (the slot, and the meal header losing its five), `src/lib/views/FoodView.svelte` (the Selection bar handed down as a snippet), `src/lib/views/food/SelectionBar.svelte` and `src/lib/views/food/ScaleTier.svelte` (§4), `src/lib/food/ways-in.ts` (the caption), `CONTEXT.md` (§7). The prototype that settled it is branch `prototype/meal-header-one-line` (14 commits, `?variant=E2` on the real food screen), and it is a primary source rather than the patch

## Context

[ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md) and
[ADR-0098](0098-a-tap-floor-binds-every-control-not-every-field.md) floored every
control at `--tap-min`. [ADR-0059](0059-the-meal-header-offers-every-way-in.md)
§1 puts five controls "in line with the meal name". Those two decisions do not
fit on a phone, and the arithmetic says so exactly:

| piece                                     | width      |
| ----------------------------------------- | ---------- |
| 5 × `--tap-min`                           | 240px      |
| 4 × `--space-2xs` gaps                    | 36px       |
| **the row**                               | **276px**  |
| "BREAKFAST" at `--step-n1` / 700 / 0.05em | ~93px      |
| **the header therefore needs**            | **~378px** |

`.main` spends `2 × --space-s` on its gutter, so the header stops fitting below a
**~414px viewport**. That is not a narrow-phone edge case: a 390pt iPhone, a
375pt SE and a 360dp Android are all under it. `.meal-actions` has carried
`flex-wrap: wrap` since ADR-0059 shipped, deliberately — _"they wrap rather than
push the meal name off, so a narrow screen shows the squeeze"_ — and the tap
floor turned an occasional squeeze into the permanent state of every phone.

**The row itself is not too wide.** 276px fits inside a 320px phone's gutters
with room to spare. What does not fit is the row _sharing a line with the meal's
name_. Every alternative below is a way of giving the five their own line.

### What the prototype showed

Seven shapes on a facsimile of the real day, over real data, switched by
`?variant=` (branch `prototype/meal-header-one-line`):

- **A rail under the meal's rule.** The smallest change: the header keeps its
  name, the five drop to a full-width line beneath it, and each cell grows from a
  48px square to ~60px wide. Costs ~58px × 4 meals of day scroll, permanently.
- **The doors as the meal's body** — the dashed "No breakfast logged yet" box
  keeps its frame and loses its sentence. Free on an empty meal, which is the
  state all four are in at the start of a day, and it fixes the quieter problem
  underneath this one: five unlabelled glyphs repeated four times. Rejected only
  because the next shape does the same work once instead of four times.
- **One bar for the whole day** — chosen, then re-prototyped three times over
  the row that says which meal.

The one-bar shapes are where the interesting measurement was. The first draft put
four boxed chips at `1fr` above the rail and read as cramped, and the cause was
arithmetic rather than taste: on a 390px phone the bar has 336px inside its own
padding, four chips less three gaps is **80.6px each**, and "BREAKFAST" at
`--step-n2` / 700 / 0.05em is **~77px**. The longest of the four words cleared its
own border by under two pixels a side. The rail beneath it was never squeezed by
the same sum — five cells at 60px against a 37px "SEARCH" caption — so all three
follow-ups left the rail alone and did something different to the row above it:
collapse it to one `ui/Select`, unbox it into tabs, or delete it and infer the
meal from scroll position.

### Alternatives that were genuinely live

**Keep the five in the meal header and let them wrap.** The status quo. It is not
broken so much as untrue: the header claims a row it cannot hold, on every phone.

**Shrink the controls below the floor on a phone.** Foreclosed, and by name.
ADR-0094 refuses a pointer-conditional floor permanently, and ADR-0093 §3
rejected 44 as "on the losing side" of ADR-0089 §3's choice of 48.

**Infer the meal from scroll position and delete the selector.** The cheapest
answer to the squeeze — the day is already a list of four meal sections, so the
page can answer "which meal" and no control has to. Rejected on the review it got:
a target that moves while you read is a target you have to re-check before every
tap, and the bar saying `→ LUNCH` does not undo that. The selector stays and it
is explicit.

**`ui/Segmented` for the selector.** It fits: it is this app's one-of-N control
whose selection must persist, its sibling `ui/ToggleGroup` being the one that may
clear. It lost on what the control **claims**. A radiogroup says "pick one of four
values"; a tab list says "this panel belongs to the one you picked", and the
second is the true sentence here because the rail's contents change with the
meal — the past-meal control appears only for a meal with history (ADR-0059 §4).
`Segmented` also folds a four-cell row to a 2×2 grid below 26rem of container,
which on a phone spends the height this record exists to save.

### Scope

This record covers where the ways into a day live and how that surface behaves
when a Selection takes the screen. It does **not** cover the roster of five, their
order, their three glosses or the sheets they open — all ADR-0059's, all
unrevised. It does not change `AddIngredientSheet`, which has no meal header and
keeps its dock. It does not touch ADR-0089 §3's value of `--tap-min`.

## Decision

### 1. The ways into a day are one bar, and the meal is a tab

There is one way-in bar per day, not one row per meal. It carries a tab list of
the four meal types and, below it, the five ways in from ADR-0059 — which are the
selected tab's **panel**.

The panel is the point, and it is why this is a tab list rather than a group of
toggles: the rail's contents belong to the chosen meal and change with it. A
`role="tab"` with no `role="tabpanel"` behind it is how this component is usually
misused, and it is not what this is.

The behaviour comes from **bits-ui `Tabs`** — the roles, the roving tabindex and
the arrow keys — which is ADR-0068 §1's test satisfied rather than bypassed: the
platform supplies no tab control, so this is the side of the line bits is for.

**A way in stops being a control in the meal header**, which is the whole of what
this amends in ADR-0059. The meal header keeps its name, its nutrition-panel
control and its subtotal.

### 2. The meal is chosen and never inferred

Only the tabs move the target. The clock picks the **first** one — the meal
nearest the current hour — and that is a starting value rather than a change:
nothing moves under you once the screen is up.

Scroll-position inference was built and refused (see Alternatives). The rule it
leaves behind is general: **a target that decides where a tap lands may not move
on its own**, because the cost of it being wrong is paid silently, one meal at a
time, in a ledger whose whole design is that nothing is edited afterwards.

### 3. The bar is anchored at the edge the hand is on, and the number is already ours

Below `BREAKPOINTS.sheet` (768) the bar is pinned to the foot of the visible band
(`bottom: var(--vv-bottom)`, ADR-0089 §1's one declaration). At 768 and above it
is sticky at the head of the day's timeline column.

**No new breakpoint.** `BREAKPOINTS.sheet`'s own docblock already carries this
argument for the overlay shape — below it a surface anchors to the band's bottom
edge _"because that edge is where the hand is"_, above it one rising from the far
end of a large screen _"is imitating a device that is not there"_ (ADR-0089 §6).
A way-in bar is that question asked about a different surface, so it takes the
same answer and `lib/ui/breakpoints.ts` gains nothing.

Two pieces of box geometry this cost, both measured rather than reasoned:

- **A scroll container's start padding sits inside its scrollport.** `.main` pays
  `var(--space-l)` above 768, so a box asking for `top: 0` comes to rest 49.7px
  down. The flush offset is `calc(-1 * var(--space-l))` — the shell's own token
  restated, never a measurement of the gap — and it is `FoodStager`'s existing
  idiom rather than a new trick. Nothing is clipped at that offset: stuck, the
  slot's top and the groove's top both measure y = 0.
- **An auto inline margin on a flex item overrides `stretch`.** `.timeline` is a
  flex column, so `margin-inline: auto` — correct for the phone's full-bleed
  fixed bar — silently shrank the desktop bar to fit-content and centred it. Both
  the cap and the margin are the phone's, and both are dropped above 768.

### 4. A Selection takes the slot, and the way-in bar folds out of it

The two surfaces share one slot. A Selection is a mode with its own verbs and
adding is not one of them, so the way-in bar does not merely go behind the
Selection bar — it leaves.

- **On a phone** both are pinned to the band's bottom edge and the Selection
  covers by z-index, as it always has. The fold is what stops the way-in bar
  standing proud of the Selection's upper edge, which read as two bars fighting
  over the foot of the screen.
- **At 768 and above** the slot is a one-cell grid holding both, the Selection
  second in the markup and therefore painting over — the same order z-index gives
  it below. It arrives on a full `translateY(-100%)`: the exact mirror of the
  phone's `slideUp`, clipped by the slot so the travel happens out of sight.

**The slot owns the sticky and the bars do not**, and that is structural: a sticky
box can only travel inside a containing block taller than itself, and a two-item
stack is not one.

This amends ADR-0088 §3, which gave a Selection the foot of the screen. It owns
one slot, and which edge that slot is on is §3 above's question, not a Selection's.

**A tier opens away from the edge its bar is anchored to.** `ScaleTier` sits above
the verbs on a phone, where the bar grows up into the screen and the verbs stay
where the thumb left them; above 768 it takes `order: 1` and opens below them, so
the verb row keeps the corner. One tier, one place in the markup, on whichever
side the anchor puts it — and the rule between the two rows flips with it.

### 5. The bar's own corner is the slot's corner

Above 768 the bar drops its top and side padding so the tab groove's corner **is**
the bar's corner, which is the point the Selection bar's corner lands on when it
takes the slot. A 9px inset there is 9px of drift visible every time the mode
changes. The phone keeps its inset: down there the bar is a surface standing over
the day, and the padding is what makes it read as one.

For the same reason the desktop bar takes `--bg-base` rather than `--paper`. On a
phone it is in front of something — the band's edge below it, a hard rule above —
and white says so. Stuck to the head of the column it is in front of nothing: the
day slides under it and reappears the colour it went in, and a white plate up
there would be a panel the screen does not otherwise have.

### 6. A region may be animated when nobody asked for it to leave

`app.css` states the opposite position, and it is right about the case it
describes: _"The region below a disclosure appears at once — it is a `hidden`
attribute, not a height animation."_ A disclosure's region is the thing you asked
for, and waiting for it is waiting for your own tap.

This is the other case. Nobody asked the way-in bar to leave; a Selection took the
screen out from under it. A surface that vanishes between frames reads as a
glitch, and one that folds reads as getting out of the way. The fold is ADR-0003
§4's sharp move on `--ease-snap` with no overshoot, and under
`prefers-reduced-motion` its duration is zero and the state change survives —
`app.css`'s own opt-out shape.

Two mechanics are part of the decision because both are load-bearing and neither
is obvious:

- **`grid-template-rows: 1fr → 0fr`**, because it is the only way to animate to
  and from a height nobody has measured — and this bar's height is genuinely
  unknown, since the rail drops a cell for a meal with no past.
- **The travel goes one box further in than it looks like it should.** The grid
  item's used height **is** the row's height, so `translateY(-100%)` on it is a
  percentage of a box collapsing at the same time. Sampled through a slowed fold
  it peaked at **12px of travel against a 134px bar**, which is why the first
  attempt read as the bar being squashed rather than leaving. The travel belongs
  on a child that keeps its natural height.

### 7. The bar is not a Dock, and it is not a way out

`CONTEXT.md` spends **Dock** on the pinned foot of a _sheet_ and lists "footer",
"action bar", "toolbar" and "sticky bar" under _Avoid_. This surface is none of
those and needs its own word before it needs more code; **Way-in bar** is the one
this record uses, built on _Way in_, which `CONTEXT.md` already defines.

ADR-0078 §1 said Rations' chrome is the food screen itself and that it carries no
persistent bar; `SelectionBar` is pinned but **modal**, existing only while a
Selection does. This one is permanent, which is the amendment. What ADR-0078 was
written to protect is untouched: the bar links nowhere, so a way _out_ of the
Facet remains unexpressible rather than merely forbidden.

## Consequences

- **The day loses fifteen controls.** Twenty way-in buttons become five. The
  header of every meal goes back to a name, a subtotal and the panel control.
- **Adding to a meal you are not looking at costs one extra tap**, and adding to
  the one the clock picked costs none. That is the trade §2 refuses to dodge by
  inferring.
- **The groove does not earn a `ui/` member**, on ADR-0100's own test. Trigger A
  fails at one copy once `ui/Segmented` is subtracted. Trigger B is arguable — a
  tab list is a behaviour neither the platform nor the roster has — but the brake
  is what settles it: a `ui/Tabs` with one consumer removes no surface. The call
  site holds bits-ui directly and wears the skin locally, and `ui/Tabs` is earned
  the day a second tab list exists. ADR-0100 §9's "falling reach never evicts"
  does not apply in reverse.
- **`ui/Select` was written into a prototype and then removed from it**, which is
  worth recording because the primitive is fine and the fit was not: a native
  `<select>` opening the OS picker is the right answer for a form field and the
  wrong one for a control whose whole job is that all four options are readable at
  a glance.
- **Four real components change hands.** `SelectionBar` is rendered by
  `DailyDashboard` rather than beside it, because a box can only stick where it
  stands. `FoodView` passes it down as a snippet; `ScaleTier` learns its
  direction; `DailyDashboard` owns the slot.
- **The e2e suite drives `.selbar`, whose DOM position moved.** Nothing about
  the selectors changes, but the suite is the first thing that should be believed
  or not on this.
- **The empty-meal box is still a dashed frame saying nothing you can act on.**
  The rejected "doors as the meal's body" shape fixed that for free and this one
  does not. It remains open, and it is a better ticket now than it was, because
  the header no longer has five controls competing with it.

## Amendment (2026-09-13): the tab-list census was wrong, and it was wrong in the direction that matters

Consequences said _"a `ui/Tabs` with one consumer removes no surface … `ui/Tabs`
is earned the day a second tab list exists"_. The second tab list already
existed when that sentence was written, and so did the third: `FoodStager`'s
`.method` row (ADR-0059 §2's staging methods) and `ReportsPage`'s `.period` row
are both bits-ui `Tabs`, and this bar makes **three**. The count was taken by
looking at the screen the record was about.

What survives is the verdict, and for a reason the original sentence stated
badly. **The copy ADR-0100 §2 counts here is the groove, not the import.** The
three call sites share the bits wiring — one import line each — and share none
of the rules that draw them: a recessed track with an ink-filled cell, a row of
staging methods inside a sheet, and a period row on a report are three skins,
not three instances of one. A `ui/Tabs` that wrapped only the wiring would add a
list-and-panels contract to remove three imports, which is ADR-0100's brake
failing in the ordinary way.

So the correction is to the trigger for reopening it. It is **not** "a second tab
list": that test has been met since before this record was drafted and would have
mandated a primitive nobody wants. It is a second copy of the **groove** — a
second surface wanting a recessed track with an ink-filled cell — at which point
Trigger A is met on the thing that is actually shared, and the brake has three
skins' worth of rules to weigh rather than three imports.

## Amendment (2026-09-13): the band's bottom edge is not the app's floor in the shell that has a tab bar

§3 pins the bar below 768 with `bottom: var(--vv-bottom)`, "ADR-0089 §1's one
declaration". That is right on the screen this record was drawn on and wrong on
the other one it ships to.

The prototype ran at `/food/?variant=E2` — **Rations**, whose shell has no tab
bar and no sidebar, by ADR-0078 §1. `DailyDashboard` also renders inside
`App.svelte`, where the root shell's `Sidebar` is a flex item at the foot of a
`100svh` box below 768, roughly 68px tall and at `z-index: 100`. A permanent bar
on the band's bottom edge at `z-index: 90` therefore lands **behind** it and
loses its lower half — the rail, which is the part that does anything.

Raising the bar above the nav is not the fix either, and the reason is §4's:
`SelectionBar` may cover that tab bar because a Selection is a mode with its own
way out, and this bar is permanent. A permanent surface over a shell's navigation
takes the navigation away.

So the anchor gains a second term and the rule stays one declaration:

```css
bottom: calc(var(--vv-bottom) + var(--shell-floor));
```

`--shell-floor` is **how much of the band's bottom edge the shell's own chrome
already occupies**. `src/app.css` declares it `0px` on `:root`, for the reason it
already declares `--vv-*` there: a consumer writes it bare and is correct before
any measurement has run, in a shell that never takes one, and in a third shell
nobody has written. Rations never writes it, so §3 holds there verbatim.
`App.svelte` overrides it with its nav's **measured** `offsetHeight`, and zeroes
it again above 768 where the aside is a left rail and takes none of that edge.

Measured rather than restated, which is the same rule this ticket applies to the
day's own bottom reserve: the nav's height is `--tap-min` plus two paddings plus
a safe-area inset the device picks, and a sum of those written anywhere else is
the copy that goes stale.

**What this does not change.** The bar is still pinned to the band below 768 and
sticky at the head of the column above it; the breakpoint is still
`BREAKPOINTS.sheet` and no number was added; the reason the phone anchors where
it does — that edge is where the hand is — is untouched. What was missing was
that "that edge" is the shell's floor rather than the viewport's wherever a shell
puts something there.
