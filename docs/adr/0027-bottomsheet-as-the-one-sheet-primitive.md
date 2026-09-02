# ADR 0027: Grow BottomSheet into the one sheet primitive — docked footer + over-dialog

**Status:** Accepted  
**Amended by:** ADR-0089 §5, §6, §7 (the sheet measures the visible band and is full height on a phone; the deferred fold-on of the hand-rolled cards becomes a rule; a phone sheet over a sheet replaces rather than stacks, so `elevated` and the 1800/1801 layer become desktop-only)  
**Implemented:** `ui/BottomSheet.svelte`, `ui/Modal.svelte`

## Context

There are two ways to build a sheet in this codebase:

- The **`ui/BottomSheet`** primitive (a `Modal`-backed bits-ui dialog with a grab
  handle, header, and scrollable body), used by the habits and agenda views.
- **Hand-rolled** fixed-position chrome — `.sheet` / `.dock` / `.foot` / `.grab`
  markup and styles copy-pasted across the food sheets (`LogFoodSheet`,
  `InstantiationSheet`, `AddIngredientSheet`, `IngredientAmountSheet`).

The hand-rolled copies exist because the primitive couldn't express two things
those sheets need:

1. **A pinned dock/footer.** The food sheets keep a primary action (and, in the
   stager, a method switcher) fixed below a scrolling body. `BottomSheet` only
   offered header + body.
2. **Correct rendering over a parent dialog.** `AddIngredientSheet` and
   `IngredientAmountSheet` are raised over the recipe/instantiation dialog. An
   open bits-ui dialog sets `pointer-events: none` on `<body>`; a sibling overlay
   inherits it and its buttons become visually present but **click-through**.
   Both sheets re-derived the same `pointer-events: auto` fix by hand, and the
   dialog layer (z 1600) meant each over-dialog sheet also had to pick a
   higher z-index (1700/1800) so it wasn't painted over.

Duplicated chrome means a change to sheet behaviour has to be made — and kept in
step — in several places, and every new over-dialog sheet re-discovers the
pointer-events trap.

## Decision

**Grow `BottomSheet` so it can express what the hand-rolled sheets need, and
absorb the over-dialog fix into the primitive so callers get it for free. This
ticket expands only — no existing sheet is migrated; a demo proves the shape.**

- **Docked footer slot.** `BottomSheet` takes an optional `footer` snippet,
  rendered in a `.bottom-sheet-footer` dock below the scrollable body. The sheet
  is a flex column with the body `flex: 1; overflow-y: auto` and the footer
  `flex-shrink: 0`, so the dock stays pinned while the body scrolls. The footer
  receives `close`, so a Done/Cancel control can dismiss the sheet. Its styling
  (top border, `--space` padding, `env(safe-area-inset-bottom)`) mirrors the
  food sheets' `.dock` / `.foot` so they can later fold onto it.
- **Over-dialog behaviour, baked in.** The sheet content sets
  `pointer-events: auto` and sits at `z-index: 1701`, above the app's dialog
  layer (dialogs at 1600, over-dialog sheets up to 1800). `Modal` gains an
  optional **`overlayZ`** prop (default 998); `BottomSheet` passes `1700` so its
  own backdrop dims a parent dialog's card rather than sitting under it. Together
  these mean a `BottomSheet` opened over a bits-ui dialog renders with its own
  dim and stays interactive — no click-through, no dead buttons — without the
  caller re-deriving anything.
- **A demo, not a migration.** `BottomSheetDemo` (mounted via `?demo=bottomsheet`)
  raises a `BottomSheet` with a docked method-switcher + primary action over a
  parent `Modal` dialog. A Playwright spec drives it: the footer controls respond
  over the dialog, a button sitting behind the sheet is never hit (no
  click-through), and the dock stays pinned as the body scrolls.

## Consequences

- The primitive now covers the docked-footer and over-dialog shapes the food
  sheets hand-roll, so a later ticket can retire that duplication by folding the
  food sheets onto `BottomSheet` — this ticket deliberately stops at expand +
  demo.
- The over-dialog fix lives in one place. New sheets raised over a dialog inherit
  correct pointer-events and layering from the primitive instead of rediscovering
  the `pointer-events: none`-on-`<body>` trap.
- `Modal`'s overlay stacking is now a prop (`overlayZ`, default 998), so any
  dialog opened over another can raise its dim without editing the shared
  overlay. Existing `Modal` callers are unaffected by the default.
- Standalone `BottomSheet` consumers (habits, agenda) are unchanged in behaviour;
  their overlay/content simply moved to the 1700/1701 layer, still above page
  chrome and below `ReloadPrompt` (9999). Covered by the existing habits e2e
  suite, which passes unchanged.
- **Deferred:** migrating the food sheets onto the primitive, and unifying the
  remaining shell differences (a centered max-width sheet vs a full-bleed
  dialog-sibling overlay), are left for the follow-up migration ticket.
