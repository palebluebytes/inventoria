# ADR 0094: A tap floor takes no condition, because no query knows which pointer is in use

**Status:** Accepted  
**Date:** 2026-09-05  
**Amends:** [ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md) (Consequences: the floor that varies is foreclosed permanently, not "for now")  
**Implemented:** #363 — `tests/unit/tap-floor.test.ts`'s pointer sweep and the `MODELLED` split (`ff6119b`)

## Context

[#337](https://github.com/palebluebytes/inventoria/issues/337)'s grilling settled
eleven decisions about Rations on a desktop. Ten of them reached
[ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md) or the
sub-issues #340 to #348. The eleventh, decision 10, reached neither:

> **Layout plus pointer polish.** Hit areas may go below `--tap-min` where
> `@media (hover: hover) and (pointer: fine)` proves there is no finger — the
> first condition ever attached to that token.

It is the only one of the eleven that changes a rule the rest of the app already
obeys.
[ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) §3 argues
`--tap-min: 48px` as "a floor set by the size of a finger, which does not change
with the screen", and
[ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md) then swept
fifteen boxes up to it and installed an unconditional guard. Left unrecorded, the
relaxation would have arrived later as a mechanism nobody argued for: boxes
shrinking back under 48 reading as a regression, and `SHORT_BY_ARGUMENT` — kept
deliberately empty at #338 — filling with entries whose argument lived in a
closed issue.

### The query does not prove what it was asked to prove

`hover` and `pointer` describe the **primary** input mechanism, and only that.
`any-hover` and `any-pointer` describe every mechanism available. So a Windows
touchscreen laptop driven from its trackpad reports `hover: hover` _and_
`pointer: fine` — matching decision 10's query in full — while also reporting
`any-pointer: coarse`, because the glass is still there and a finger is six
inches from it. The query proves a fine pointer is **primary**. It was asked to
prove a finger is **absent**.

The honest form of the question is the negative one, `not (any-pointer: coarse)`:
no coarse pointer is attached to this machine at all. That is a real proof, and
it is a proof of the wrong thing. It answers whether touch **hardware** exists,
never whether the hand now reaching for the screen is using it. A Surface docked
to a monitor and driven entirely by mouse keeps the floor for ever; a laptop
whose owner just folded it into a tablet loses it at exactly the wrong moment.

This is not a defect in one query. **A media query reports which pointing
devices are available. It cannot report which one is in use**, and a tap floor
depends on the second.

### The cost that motivated it was never measured

#363 named three dense surfaces the relaxation would pay for. Two of them are not
tap-floor populations at all:

- **The Reports table.** Every row on that page is an `<li>` holding a name, a
  reading and a `Meter`. Nothing in it takes a tap; the only control is the
  period `Tabs.Trigger` above the list. ADR-0093 §1 never bound these boxes.
- **The `.cf-*` rows.** ADR-0093 records this one dissolving already: `.cf-row`
  stood 48px before #338 touched it, so the vertical space was spent and the
  proposed density exemption bought nothing.
- **The rail.** `MonthCalendar`'s `.month-day` genuinely is a 48px interactive
  cell in a narrow column. It is also a `<div>` calendar day, which is
  [#361](https://github.com/palebluebytes/inventoria/issues/361)'s control sweep
  and not this record's field population.

What the floor actually grew is one primitive: `ui/Checkbox`, from 21px to 48,
across ten importers, several of them rendering into lists. ADR-0093's
Consequences answered that case in advance — "if a settings list reads as
crowded afterwards, the answer is the list's spacing and not the control's
floor" — and no screen has since been named as reading wrong.

### The alternatives that were live

**Keep decision 10 as written.** Accept that a touchscreen laptop draws 32px
rows, on the grounds that its finger is the secondary way in. Rejected: the
premise is that the finger will not be used, and the machine offers no way to
know that. It is the same guess the query was supposed to replace.

**Correct it to `not (any-pointer: coarse)`.** Rejected on reach rather than on
truth. The machines it relaxes are desktops with no touch hardware, a shrinking
population; every convertible, every touchscreen laptop and every iPad with a
keyboard stays floored. That is a condition attached to the app's most
load-bearing size token in exchange for 27px per checkbox row on some desktops.

**Read the pointer at runtime instead.** `PointerEvent.pointerType` reports
`"mouse"`, `"pen"` or `"touch"` per event, so a last-pointer-wins attribute on
`<html>` — the shape ADR-0089 §1 already uses for `--vv-*` — would genuinely know
which device was last used. Rejected, and see §3: it is refused on stronger
grounds than the query, not weaker ones.

**Relax at a width instead**, using the shell breakpoint the roster already
sources. Rejected as a worse guess wearing better clothes: a 1920px screen is a
touchscreen laptop plugged into a monitor as often as it is a desktop, and the
roster's own gate exists because width is the axis this app already reasons
about, not because width knows anything about hands.

### Scope

This record covers **whether `--tap-min` may be made conditional, and on what**.
It does not cover:

- **The floor's value.** ADR-0089 §3's, and settled.
- **Which box the floor binds.** ADR-0093's, and settled.
- **Which boxes are in the population.** ADR-0093 covers text fields; #361
  widens to buttons, toggle cells and calendar days. §1 to §3 below bind that
  population unchanged, which is why this record did not wait for that sweep.
- **Keyboard navigation**, which #337 decision 10 separated out on its own.

## Decision

### 1. A media query may not carry a decision that depends on which pointer is in use

`hover`, `any-hover`, `pointer` and `any-pointer` report which pointing devices
are **available**. No CSS feature reports which one is being used. A rule whose
correctness depends on the second may not be keyed on the first.

`--tap-min` is such a rule. It is a floor on the box a finger lands on, and the
finger arrives or does not arrive independently of what hardware is attached.

### 2. A pointer condition may add an affordance, and may never subtract a floor

This is the general form, and it is a rule about direction rather than about the
features.

The two errors do not cost the same. A machine wrongly told it cannot hover loses
a lift, which nobody notices. A machine wrongly told it has no finger loses a
target, which is the failure the floor exists to prevent. Where a condition can
only be wrong in one direction, it may only be used in the direction where being
wrong is cheap.

`ui/Card`'s `@media (hover: hover)` is the sanctioned shape: it adds a hover
transform on machines that can hover, and moves no height. It is not an exception
carved out of this rule; it is the rule's positive case.

### 3. The runtime mechanism is refused too, and on stronger grounds

`PointerEvent.pointerType` answers the question §1 says CSS cannot. It is still
refused, for two reasons that do not apply to the query:

- **The first frame knows nothing.** A pointer event arrives after paint. At the
  moment the floor is first drawn the mechanism has exactly the information the
  media query had — none — so it must guess, and then change its mind visibly.
- **It moves the target while you reach for it.** A 32px row that grows to 48 the
  instant a finger lands grew _after_ the tap was aimed. A 48px row that shrinks
  when an idle hand nudges the mouse reflows a page nobody asked to change. The
  floor's whole value is that it is settled before the gesture starts.

A floor that responds to the pointer is a floor that is wrong at the only moment
it matters.

### 4. The guard enforces the direction, over the whole tree

`tests/unit/tap-floor.test.ts` fails when a rule under an `@media` naming any of
the four pointer features declares a height input — `min-height`, `height`,
`padding`, `border`, `font`, `font-size`, `line-height` and their longhands.

Three properties of that guard are load-bearing:

- **Its population is every stylesheet in `src/`, not the file's field sweep.**
  The densest boxes a relaxation would ever have reached are controls rather than
  fields, so a rule keyed on fields would have left exactly those open until #361
  lands.
- **It keys on height inputs alone.** `MODELLED` splits in two: a pointer query
  that hides a hover-only affordance declares `display` and is legitimate under
  §2, while one that moves a height is not. The union keeps `read`'s conditional
  refusal exactly as ADR-0093's amendment left it.
- **It reads raw text rather than going through `rulesOf`,** which flattens a
  rule to its innermost enclosing at-rule and so would lose a pointer query
  wrapped in a breakpoint. That nesting was written and caught before this
  record landed.

An exemption therefore still costs a diff in that file, which is ADR-0093 §6
holding.

## Consequences

**ADR-0089 §3 is confirmed, not amended.** Its sentence — the floor "does not
change with the screen" — stays true word for word, and this record adds a second
axis it also does not change with. That is why §3 carries no `Amended by` line
pointing here: the trailer means part of a record was revised, and nothing in §3
was. What is revised is ADR-0093's Consequences, which foreclosed a varying floor
"for now" and predicted that #363 "will argue the first condition ever attached
to it". The argument happened and returned no.

**One number, on every machine, for the life of the token.** That is the whole
benefit and it is not small: `--tap-min` can be read, cited and swept without
asking what is plugged in. Every clause of ADR-0093 stays a statement about a
box rather than about a box under a condition.

**Some desktops carry rows larger than a mouse needs.** This is the honest cost,
and it is concentrated in `ui/Checkbox`'s ten importers. It is accepted rather
than dismissed.

**What reopens this is a cost, not a mechanism.** A named screen with a measured
density complaint is a real argument and this record does not foreclose it. What
it forecloses is the _answer_ being a pointer condition. The first thing to try
there is the list's spacing, per ADR-0093; the second is that surface's own
layout. A proposal arriving with `pointerType` attached has been answered by §3
and needs to argue against it rather than around it.

**#361 inherits an unconditional number.** The control sweep now widens a
population under one floor rather than under a floor plus a condition, which is
the simpler of the two jobs and the reason this record did not wait for it.
