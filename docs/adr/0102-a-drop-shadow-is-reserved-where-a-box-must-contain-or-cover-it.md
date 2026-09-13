# ADR 0102: A drop shadow is reserved where a box must contain or cover it

**Status:** Accepted  
**Date:** 2026-09-13  
**Amends:** [ADR-0038](0038-named-brutalist-frame-tokens.md) (the elevation tokens gain a companion each — how far the shadow reaches past the element — because the recipe as tokenized says what the shadow looks like and nothing about what it costs in layout)  
**Implemented:** [#416](https://github.com/palebluebytes/inventoria/issues/416) — `src/app.css` (§1, beside the shadows), `src/lib/ui/Row.svelte` (§3), `src/lib/views/food/WayInRail.svelte` (§2's grid cell), and `tests/unit/shadow-reach.test.ts`, which is the guard Consequences asked for: the derivation is asserted from `--shadow-N` rather than restated

## Context

ADR-0038 tokenized the brutalist elevation as `--shadow-1/2/3`, each a solid
offset with a 1px spread so it **overlaps** the element's own edge rather than
abutting it — the fractional-device-pixel argument written on the token block
itself. What it did not say, because nothing had yet needed it, is that the
result is painted **outside** the element's box and takes no layout space at all.

That is invisible while the shadow falls into a gap, and it is a defect the moment
something has to **contain** the element or **cover** it. Both failures were on one
screen at once, and both were found by measuring rather than by looking:

- **One cell in four wore a different edge.** The four way-in cells each paint
  `--shadow-1` two pixels past their own right edge. For the first three that
  lands in the grid's gap and reads as part of the frame. The fourth's landed
  outside the last track, where its container's `overflow: hidden` cut it off. At
  1280 the cell's right edge and its container's both measured **1100.0** —
  exactly flush, and therefore exactly clipped.
- **A pinned bar could not cover a selected row.** `.row.selected` paints
  `--shadow-2` **four** pixels past the column. The bar that covers the day is
  exactly the column's width, so four pixels of ink stayed visible past its right
  edge however far the row scrolled under it.

One cause, two symptoms, and neither is specific to the surfaces that exposed
them. Every `ui/Button` in the app carries the same 2px overhang, because the
shadow belongs to the primitive.

### Alternatives that were live

**Give the container the padding instead.** It works and it lies about which box
is the wrong size: the element is what overflows, so a container compensating for
it has to be found and fixed again at every new container. It also breaks the one
alignment ADR-0101 §5 exists to hold — a bar whose right edge is inset to make
room for its last child's shadow no longer shares a corner with the surface that
replaces it.

**Reserve it only on the state that has the shadow.** `.row.selected` is the only
row that draws one, so reserving there is the smallest possible change. Refused:
it shrinks the row by 4px at the exact moment it is being highlighted, which is a
worse artefact than the one being fixed.

**Use an inset shadow.** Not an alternative — a different design. ADR-0101 §5's
groove uses one deliberately, and it is a recess rather than an elevation.

**Write `4px` at the sites that need it.** The reason this record exists rather
than two patches: a literal is a number that silently stops matching `--shadow-2`
the day that token moves, and ADR-0038's whole argument is that the recipe has one
home.

## Decision

### 1. Each elevation token gains a reach

`app.css` declares, beside the shadows themselves:

```css
--shadow-1-reach: 2px;
--shadow-2-reach: 4px;
--shadow-3-reach: 8px;
```

Each is that shadow's **offset plus its spread**, which is how far it travels past
the element on the right and on the bottom. Left and top are zero, and that is the
same arithmetic ADR-0038's overlap is written on: the spread expands by 1 and the
offset moves by at least 1, so nothing crosses those two edges.

A reach is derived, not chosen. A change to `--shadow-N` changes its reach, and
the pair must move together.

### 2. Reach is reserved where a box must contain the element or cover it

Not everywhere. A shadow falling into a gap, into a container's own padding, or
off the end of something nothing has to align with costs nothing and should pay
nothing. The reservation is owed in exactly two situations:

- the element sits in a **track, cell or column** whose edge is the last thing
  before a clip or a boundary; or
- something else has to **draw over** the element — a pinned surface, a sheet, a
  bar — and is sized to the element's box rather than to its ink.

Where it is owed it is reserved as `margin-right` and `margin-bottom` of the
matching `--shadow-N-reach`, and the element is that much smaller for it. That is
the trade, stated plainly: the shadow is inside the length, so the length is
shorter.

### 3. A shadow that appears with a state is reserved in every state

Where the reservation is owed and the shadow is conditional, the space is held
whether the shadow is drawn or not.

`ui/Row` is the worked case: only `.selected` draws one, and reserving at
selection time moves the row at the moment it is highlighted. Holding the space
always costs every row 4px of width and 4px of separation, which is visible, is
uniform, and never moves.

### 4. Scope, and the part deliberately left undone

This record covers `ui/Row` and the way-in rail's cells — the two boxes where a
missing reservation is a defect on a shipped screen.

It does **not** convert `ui/Button`, whose `--shadow-1` overhangs by 2px at
fifty-three call sites. The overhang is real there and is almost everywhere
harmless: a button in a gap, in a dock, or at the end of a row nothing clips is
not a problem to be solved. Converting the primitive would move fifty-three
layouts to fix the handful that are inside a clip, and the handful are not
enumerated. The rule above is what a future sweep needs; the sweep itself is a
ticket, not this record.

## Consequences

- **Every `ui/Row` is 4px narrower and carries 4px more beneath it.** Four
  consumers today. It is the price of a pinned surface being able to cover one.
- **The measurement is repeatable**, which is what makes this checkable rather
  than aesthetic: after the change, the last cell's right edge plus its reach, the
  selected row's right edge plus its reach, and the covering bar's right edge all
  land on the same number.
- **A reach is a second number that can drift from a first.** Nothing enforces the
  pair today. If `--shadow-N` ever moves, the guard worth having is the one this
  repo already reaches for — a unit test asserting the derivation rather than a
  comment asking for it.
- **This is a layout property living in the elevation block**, which reads oddly
  until you accept the premise: a shadow that something has to contain is a
  layout fact, and the only place that cannot drift from the shadow is next to it.
