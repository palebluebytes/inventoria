# ADR 0107: A row you have just logged is revealed in three rules, and the third one is the fallback

**Status:** Accepted  
**Date:** 2026-09-15  
**Implemented:** [#440](https://github.com/palebluebytes/inventoria/issues/440) — `src/lib/food/reveal-logged.ts` (the arithmetic), `tests/unit/reveal-logged.test.ts` (the table), `src/lib/views/food/DailyDashboard.svelte` (the measuring and the scroll), `src/lib/views/FoodView.svelte` and the five sheets that report what they wrote

## Context

The day is a long scrolling page with a bar pinned over its foot
([ADR-0101](0101-the-ways-into-a-day-are-one-bar-anchored-where-the-hand-is.md)),
and a way in logs into whichever meal the bar is pointing at rather than into the
part of the day you happen to be reading. So the row you just made lands wherever
its meal is: under the bar, below the fold, or three meals further down. Before
this record nothing moved, and the only evidence that the act had worked was the
day's totals changing somewhere off screen.

**The alternatives that were genuinely live.**

_"Scroll to the new row, always."_ The obvious one, and wrong in the common case.
A food logged into a meal that is only just off screen arrives alone at the foot
of the page with its heading and its siblings above the fold, which reads as a new
list rather than as a row joining one. It is also wrong in the _other_ common
case: the row is already on screen, and scrolling to it moves the page for no
reason. A gesture that says "something moved" when nothing did is worse than
stillness.

_`element.scrollIntoView()`._ The platform's version of the same mistake, plus
two of its own. It scrolls the nearest scrollable ancestor to put the element at a
block position named by an enum, and none of the three positions is "the bottom of
the part of the page nothing is standing on" — `"end"` aligns to the scrollport's
bottom edge, which is **under the pinned bar**. It also cannot express rule 2,
whose subject is the meal and whose condition is about the row.

_"Fold the day so the target meal is the only one open."_ Considered and dropped
as a much larger decision wearing a small one's clothes: it changes what the day
IS, and the day's shape is ADR-0091's.

**Scope.** This record covers where the day scrolls when a Consumption Event is
written by an act the person on this device just performed. It does not cover what
happens to a row afterwards — no highlight, no flash, no "added" toast — and it
says nothing about arrivals the person did not cause, which is the one exclusion
§3 states outright.

## Decision

### 1. Three rules, in order, over three boxes

Given the new row, the meal section it sits in, and the **band**:

1. the row is wholly inside the band, so **nothing moves**;
2. it is not, but it would be with the meal's top at the top of the band, so
   **the meal goes to the top**;
3. neither, so **the row's bottom edge goes to the bottom of the band**.

The order is the specification. Rule 2 is the one that earns the record: where the
whole meal fits, the meal is the thing to show, because a row's meaning is the
list it joined. Rule 3 is the fallback and is written to always terminate — it is
the least travel that puts the row on screen, and it leaves it next to the bar the
doors are on, which is where the hand already is.

**Wholly, not partly.** A row half under the pinned bar is precisely what these
rules exist to prevent, so rule 1 does not claim it.

**A row taller than the band loses its top, not its bottom.** Rule 3 aligns
bottom edges, and that is the rule as intended rather than an oversight: a logged
row ends with its own figures.

### 2. The band is the scrollport minus what is standing in front of the row

Never the viewport, never the scroll container's own box. The Way-in bar is pinned
over the foot below 768, stuck to the head between 768 and 1440, and beside the
meals in a flank above that — three geometries, and **the band is measured off
that bar's own rect rather than derived from the breakpoint that put it there**. A
band written as a sum of tokens would be a fourth copy of the bar's geometry, and
ADR-0101 §3 already refused exactly that copy over exactly this box.

**A surface only obstructs a row it actually covers.** The test is horizontal as
well as vertical: in the flank layout the bar is _beside_ the rows, so it takes
nothing off the band. Without that clause the widest screen would reserve 50px it
does not owe.

### 3. The reveal follows the act, and the act reports itself

**Every path that writes a row says which ids it wrote; nothing infers it from the
day.** Watching the projection for new ids would be one seam instead of six, and
it would be wrong in both directions:

- **An amount edit is not an arrival.** Correcting a logged food retracts and
  replaces (ADR-0008), so it mints a **fresh id** for a row already on screen. A
  watcher cannot tell that from a new food; the act can, and reports nothing.
- **A peer's meal is not your act.** A row that lands from a sync is not something
  this person just did, and moving the page under them is the wrong reading of the
  same event. The accept path calls the same copy helper and deliberately drops
  the ids it returns.

**Only ids that were actually written.** A partial past-meal copy reports what it
copied and not what it lost, because the day waits for **every** id it is handed
to appear before it moves, and an id for an append that threw would hold that wait
open forever.

**A group is revealed by its last row down the page**, chosen by where the rows
landed rather than by the order they were appended: the day groups by meal, so the
last id written is not the lowest row. Rule 2 then covers the whole group in the
usual case.

### 4. The arithmetic is a pure function and the DOM is the caller

`food/reveal-logged.ts` takes three spans and returns a delta or `null`, with no
DOM, no clock and no component. Every case is then a row in a table
(`tests/unit/reveal-logged.test.ts`) rather than a screen someone has to
reproduce, and the three rules can be read in one screenful.

**`null` is not a delta of zero.** Rule 1 must not start a smooth scroll that
travels nowhere, so the two answers are different values and the caller acts on
the difference.

## Consequences

**The page moves under a finger that has just left a button.** That is the cost,
and it is paid on purpose: the alternative is an act with no visible result. Rule
1 keeps it from being paid when it buys nothing, which is the common case for the
meal you are already reading. The gesture is smooth by default and instant under
`prefers-reduced-motion`, which is `app.css`'s own shape for that opt-out.

**Six call sites report, and a seventh would be silent.** A new way into a meal
that forgets to report simply does not scroll — a soft failure, invisible in
tests, and the honest cost of §3's refusal to watch the projection. What makes it
tolerable is that the reporting is a parameter on the sheets rather than a
convention: a path that logs and returns `void` is visible in the type.

**The day is still moving when the row arrives, so the reveal waits for it to
stop.** Found by building rather than by reading: consolidating a Selection into
a recipe computed a 408px scroll and moved the row 113px, because that one act
writes two appends — the recipe, then a retraction per ingredient it replaced —
which land as separate projection updates, while the Way-in bar unfolds out of
the Selection over 0.22s and the day's foot reserve changes with it. So the
caller waits for two consecutive frames in which the page's own geometry has not
moved, which covers all of that without naming any of it.

**That wait carries a timer as well as frames, and the timer is the load-bearing
half.** A tab that is not painting is handed no animation frames at all — zero in
600ms, measured — so a wait built on `requestAnimationFrame` alone does not time
out, it never ends, and the reveal is lost rather than late. The frames decide
_when_; the 700ms timer guarantees _whether_. (The same absence makes
`behavior: "smooth"` a no-op in such a tab, which is correct: a page nobody is
looking at has nothing to animate.)

**A scroll can be clamped and that is correct.** Rule 2 can ask for more travel
than the page has, and the browser stops at the end of the range; the row is still
wholly visible, because it is inside a meal whose foot fits. Measured in the app:
a dinner logged into an empty day travelled to `scrollTop === maxScroll` and
landed 181px down.

**Not covered, and deliberately:** a highlight on the revealed row (nothing marks
it once it is there), a reveal for the row a Selection verb _changed_ rather than
added, and any reveal on a day you are not looking at — logging onto another date
is not something the ways in can currently do.
