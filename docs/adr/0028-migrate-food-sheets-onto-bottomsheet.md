# ADR 0028: Migrate the food sheets onto the shared BottomSheet primitive

**Status:** Accepted  
**Implemented:** `ui/BottomSheet.svelte`, the five food sheets

## Context

ADR-0027 grew `BottomSheet` to cover the two shapes the food sheets needed — a
pinned docked footer and correct over-dialog behaviour — but deliberately
stopped at "expand + demo": no sheet was migrated. That left five hand-rolled
sheets still carrying their own fixed-position chrome:

- `LogFoodSheet`, `InstantiationSheet`, `RecipeModal` — `Modal` + a bespoke
  `.sheet` / `.grab` / `.head` / `.body` / `.foot` shell.
- `AddIngredientSheet`, `IngredientAmountSheet` — plain sibling overlays (not
  even `Modal`-backed) that each re-derived the `pointer-events: auto` fix by
  hand and picked their own z-index (1700/1800) to sit over the recipe dialog.

The chrome was copy-pasted, so "one sheet look and behaviour" only held by
discipline, and every over-dialog sheet re-discovered the
`pointer-events: none`-on-`<body>` trap.

## Decision

**Fold all five food sheets onto `BottomSheet`, and grow the primitive the last
bit each needs so every sheet becomes thin — header + body + optional docked
footer wrapped around its own content (the shared `FoodStager` /
`IngredientListEditor`).**

The primitive gains four small, general props:

- **`onClose` passthrough.** Forwarded to `Modal`, which already turns a bound
  `open → false` into one `onClose` call across Escape / backdrop / close
  button. A conditionally-mounted caller (every food sheet) passes its `onClose`
  straight through and unmounts on close, without re-encoding that quirk.
- **`class` passthrough.** Lands on the sheet content so a caller can tag/scope
  its sheet — `IngredientAmountSheet` keeps its `.amount-sheet` hook, and
  `AddIngredientSheet` gets `.add-ingredient-sheet`.
- **Header back affordance (`onBack` / `backLabel`).** An optional leading "‹"
  control in the header. `LogFoodSheet` uses it for "Change food" (only once a
  food is staged); `AddIngredientSheet` for "Back" (staged) / "Cancel" (not).
- **`flushBody`.** Hands the body region's layout to its child. The body becomes
  a bare flex column (no padding, no scroll) so `FoodStager` — which owns its
  own scrollable stage and pinned method dock — fills it and manages both,
  instead of fighting a second scroll container.

One more layering prop closes a gap the migration itself opened:

- **`elevated`.** Raises a sheet to 1800/1801 (backdrop/content) instead of the
  default 1700/1701. Before this ticket the recipe/instantiation sheets were
  `Modal` dialogs at z 1600, so a sheet raised over them at 1700/1800 cleared
  them. Migrating those parents onto `BottomSheet` lifted them to the primitive's
  1701 layer — so a child left at 1701 tied with its parent, and on a short
  (mobile) viewport the stacked-at-the-same-layer content never settled enough
  to click. `AddIngredientSheet` and `IngredientAmountSheet` set `elevated`, so
  their backdrop dims — and their content floats above — the parent sheet again.

## Consequences

- **One sheet, five callers.** The bespoke `.sheet` / `.dock` / `.foot` / `.grab`
  chrome and the duplicated `pointer-events: auto` fix are deleted at every food
  call site. A change to sheet behaviour is now one edit in the primitive.
- **Nested-sheet stacking is a single flag.** `elevated` replaces the ad-hoc
  1600 / 1700 / 1800 z-index picks with a two-level model: a sheet, or a sheet
  raised over a sheet. New over-sheet sheets set one boolean instead of choosing
  a number.
- **`AddIngredientSheet` restyles.** It was a full-bleed opaque overlay covering
  the builder; it is now a bottom-anchored sheet with its own dim over the
  builder. That is the intended unification, not a regression.
- **e2e.** The add-ingredient selectors move from the structural
  `.sheet:has(> header h2:text-is("Add ingredient"))` to `.add-ingredient-sheet`;
  the amount sheet keeps `.amount-sheet` via the `class` passthrough, so its
  specs are untouched. The full food e2e suite (desktop + Mobile Chrome), the
  `bottomsheet-demo`, habits, and agenda suites pass; `pnpm check` is clean.
- Standalone `BottomSheet` consumers (habits, agenda) and the demo are unchanged:
  all five new props default off.
