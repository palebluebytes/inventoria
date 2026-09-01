# ADR 0087: A hand-typed panel is a door of its own, not a rescue from a failed scan

**Status:** Accepted  
**Date:** 2026-09-01  
**Amends:** [ADR-0035](0035-custom-food-intent-chooser.md) (§1's closing sentence — "The label form is **not** an option in this chooser" — is reversed; the label form becomes the chooser's fourth tile)  
**Implemented:** #318 — `ManualEntryFlow.svelte` (the tile and its `onOpenPanel` callback), `FoodStager.svelte` (`openPanelForm`, `panelDoor`)

## Context

[ADR-0034](0034-label-photo-food-capture.md) built the full-panel **label form**:
a transcription surface with pack size, the per-100 basis line, Macros ·
fats/fibre/sugar/salt · vitamins and minerals, portions, categories, ingredients
and the photo tile. [ADR-0035](0035-custom-food-intent-chooser.md) then took it
out of the Custom tab and left it on the three barcode doors — missing,
found-but-poor, unreadable — replacing the tab with a chooser of three
calories-only intents.

§1 of that record closes with a flat sentence: the label form is not an option in
the chooser. Its stated reason was that "a packaged food has a barcode and belongs
in Scan", so a manual route to the form would duplicate a door the user already
has. That reason describes the form as somewhere scans **land**, and it is wrong
about a case that turns out not to be rare.

**The case.** `https://www.gradegracia.cat/granola-tahin-0-sucre-eco-p-8-57-325-o-10/`
— Granola Tahin 0% Sucre Eco, Gra de Gràcia, a 100 g bag. A real packaged food,
a complete printed panel reproduced on a webshop page, **no EAN anywhere on
screen**, and no Open Food Facts record behind it. Scan cannot start: there is no
barcode to read. The three manual intents can start, and each of them would throw
away nine of the eleven figures on the page — energy, fat, saturated fat, carbs,
sugars, protein, fibre, calcium, magnesium and iron all have a row in the form
already, and `MICROS` (`src/lib/food/label-form.ts`) is a fixed roster rather
than one gated on which nutrients the user tracks. Salt is absent from that
panel, which is what the "none on label" tap exists for.

So the app's one surface built for reading a panel was reachable only by a route
that case cannot take. ADR-0035 §1 did not weigh that case; it weighed the
duplicate-door risk alone.

**Scope.** One tile in one chooser, and the state that lets it open the existing
form. Ruled **out**: any change to the label form's internals, to the three
barcode doors, to `food/label_capture`, to the Open Food Facts contribution path,
or to the three ADR-0035 intents; a trimmed macros-only variant of the form; a
`source_url` on the provenance envelope (attractive, but it widens a type three
other paths write — its own ticket); and local search over hand-typed foods
(§6, [#320](https://github.com/palebluebytes/inventoria/issues/320)).

## Decision

### 1. The reversal, stated as a rule

A hand-typed nutrition panel is **a way of recording a food**, not a fallback for
a scan that failed. Where the label form is offered follows from what the user
has in front of them — a printed panel — and never from whether some other door
was tried first.

ADR-0035 §1's closing sentence is reversed on that ground. The rest of §1 stands:
the three intents keep their own mini-forms, and the chooser is still the Custom
tab's first screen.

### 2. A fourth tile, last

The chooser gains:

- **🏷️ From a nutrition panel** — _"Type in the figures, from a pack or a shop page"_

It sits **last**. The list reads fastest-to-slowest and twenty typed numbers is
still the slowest thing in it.

The tile opens ADR-0034's label form **verbatim** — the same component, the same
fields, the same save. There is no macros-only variant of it: a second form is a
second thing to maintain, and it would produce a poorer record than the Open Food
Facts and USDA foods this door exists to sit beside.

### 3. The tile is not an intent, in types

`ManualEntryKind` is unchanged. There is no fourth kind, and the chooser's
`activeIntent` — which drives the host's dock and back button — stays
`ManualEntryKind | null`.

The chooser's own tile list widens **locally** to `ManualEntryKind | "panel"`, and
the fourth tile fires a callback up to the host instead of selecting an intent.
Nothing downstream of `ManualEntryKind` learns about a door that never writes the
envelope that type describes.

The component keeps its name. The type refers to the envelope; in plain English a
typed panel is still a manual entry.

### 4. No reason banner, and therefore no barcode field

Every barcode door sets a `captureReason` and the form renders a banner
explaining why the scan landed there. This door sets none: it was chosen, and it
has nothing to explain.

The optional "Barcode digits" input lives **inside** that banner, so dropping the
banner drops the field. That is deliberate rather than incidental. The save
therefore always mints `food:custom_` and never keys `gtin:`. The pack in your
hand has a barcode and the Scan tab is one tap away, already handling it four
ways; a second, worse barcode path on the manual door would invite the user past
the good one.

### 5. It behaves like its sibling tiles, not like a barcode door

- **It does not hide the method tabs.** A barcode door does, because that flow is
  a focused "fill in what the scan could not find" task; this door is one of four
  peers on a tab the user is free to leave, so it leaves the switcher's own rule
  alone. On the one host that shows the chooser today the tabs are absent anyway,
  because a way in already chose the method and that host passes no method dock
  ([ADR-0059](0059-the-meal-header-offers-every-way-in.md) §2). The rule
  is stated for the surface, not for what is on screen this week.
- **Header-back returns to the chooser**, through the host's shared back button,
  exactly as a mini-form's does.
- **The draft survives a trip back to the chooser**, keyed like the barcode doors
  are on a `manual:` key naming no food. The mini-forms blank on every intent
  switch so a menu's Place cannot haunt a later quick estimate; that argument does
  not reach a form with no sibling to bleed into, and this one is twenty typed
  numbers long. What ends a draft is leaving the sheet, which unmounts the whole
  staging surface, so the next visit starts blank. (A tap on the **Custom tab**
  clears the key too, but the one host showing the chooser today has no tabs — see
  the bullet above.)

### 6. Provenance is unchanged, and so is what reuse means

A save through this door writes `food/label_capture` with `method: "manual"`, the
same envelope the always-on manual tab already wrote before ADR-0035 moved it. No
new provenance type, no `adapter_version` bump.

The envelope records **how the values were obtained** — a human typed them, with
no model in the loop — not **which surface displayed them**. A shop page
reproducing a pack's own panel is the same act as reading the pack. That is why
there was never a fourth `ManualEntryKind` to add: the discriminator that already
exists answers the question the envelope asks.

**What reuse actually is, today.** A food saved here is logged in grams, so it
passes `isCatalogueFood` (`src/lib/food/food-search.ts`) on its **first** clause:
a measured log qualifies regardless of provenance. That puts it in **Recent** —
which is meal-scoped, newest-first, capped at twelve, and shown only while the
search box is empty.

It does **not** put it in Search. Typed queries in this app go to the bundled
USDA and Open Food Facts sources alone; **there is no local-twin search**. Type
"granola" and the record you just made will not appear. This record claims Recent
and claims nothing about Search. Closing that gap is
[#320](https://github.com/palebluebytes/inventoria/issues/320), and it is
ADR-sized on its own: ranking a hand-typed twin against a 4,238-row reference
corpus is a decision, not a wiring job.

### 7. `AddIngredientSheet` is untouched

That host passes `manualIntents = false`, so its Custom tab is already the bare
label form and has no chooser to add a tile to. Adding an ingredient to a recipe
is not eating out — quick-estimate and from-a-photo mean nothing there, and a
chooser would put a one-tile-that-matters list in front of every ingredient.

## Consequences

- **The Custom tab's chooser has four tiles, and one of them is a full-panel
  form.** The tab's own sheet title is still "Quick entry"
  (`wayInTitle("custom")`), which is now true of three tiles out of four. Left
  alone: the title names the way in, and renaming it is a separate judgement. Its
  sibling `wayInLegend("custom")` is **not** left alone — a legend enumerates what
  a way in leads to, so an enumeration missing a quarter of it is simply wrong,
  and the fourth tile is named there.
- **The label form now has five routes in, not the four ADR-0034 §1 counted.**
  Three barcode doors, the always-on manual tab on a host with no chooser, and
  this tile. The retired fourth of ADR-0034 §1 (the always-on tab on a chooser
  host) stays retired; this is a different door with a different reason.
- **A hand-typed packaged food is recordable at all**, which it was not. The
  motivating product has eleven figures and every one of them has a home.
- **Two surfaces can now reach the same form with different chrome**, so the form
  reads one flag (a set `captureReason`) for the banner and the barcode field, and
  another for which of the two Custom surfaces is showing. That is one more piece
  of state on an already large component; it is a flag rather than a fifth
  `CaptureReason` precisely because every reason in that union states why a _scan_
  landed there and renders a sentence saying so.
- **A food saved here is findable only in that meal's Recent**, for twelve
  entries. Anyone reading this record should not tell a user their typed food is
  "in Search". See #320.
- **The provenance envelope stays narrow.** The cost is that a figure read off a
  shop page is indistinguishable, later, from one read off the pack — including
  the URL that would let you re-check it years on. Accepted here and deferred:
  `source_url` widens a type the barcode doors also write, so it gets its own
  ticket rather than riding this one.

## Alternatives considered

- **Leave ADR-0035 §1 standing and route the case through Scan.** Rejected — the
  case has no barcode on screen at all, so Scan has nothing to start from.
- **A trimmed macros-only panel form for this tile.** Rejected — a second form to
  maintain, and it would save a poorer record than the sourced foods it sits
  beside, for a user who is holding a complete panel.
- **A fourth `ManualEntryKind` (`"panel"`).** Rejected — the kind discriminates
  `food/manual_entry` envelopes and this door writes `food/label_capture`. Adding
  one would make every reader of that union handle a value it can never see, and
  it would buy nothing: the catalogue rule admits this food on its measured log,
  not on its kind.
- **Keep the barcode field, without the banner.** Rejected — it is a second,
  worse barcode path sitting on the manual door, one tap from the Scan tab that
  already handles a code four ways.
- **A `source_url` on `food/label_capture` for the shop-page case.** Deferred to
  its own ticket, not refused: it is the one thing that would let a figure be
  re-checked years later, and it widens a provenance type three other paths write.
- **Add the tile to `AddIngredientSheet` too.** Rejected — that host has no
  chooser, and giving it one would front every recipe ingredient with a list whose
  other three entries are meaningless there.
