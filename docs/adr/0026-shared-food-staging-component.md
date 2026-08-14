# ADR 0026: One food-staging component, shared by the direct-log and add-ingredient sheets

**Status:** Accepted  
**Implemented:** `FoodStager.svelte`, `food-staging.ts`

## Context

The food **staging** flow — Search / Scan / Custom method switching, the
staged-food card with its live macro preview, and the bottom method dock (search
input · method tabs · primary action) — was implemented **twice**,
near-identically:

- `LogFoodSheet` (the direct-log sheet), the richer copy: real camera barcode
  scanning, a custom form with an optional photo, edit-mode pre-staging, and an
  extra Recipe browser tab.
- `AddIngredientSheet` (the recipe builder's add flow), a thinner copy:
  manual-only barcode, a photo-less custom form, no editing.

Two near-copies of the same debounced search, the same barcode lookup, the same
`QuantityGrams` staging card, the same dock, and the same enable/label logic. A
change to staging had to be made — and kept in step — in both. The custom fields
also used bespoke `<input>` styles rather than the shared `ui/Input` primitive.

## Decision

**Extract one presentational staging component, `FoodStager`, that both sheets
consume. It owns the method state and the Search / Scan / Custom sub-flows, the
staged result + amount, and the method dock; it emits the chosen food and lets
the host decide what to do with it.**

- **`FoodStager`** renders the stage (results / scanner / custom form / staged
  card) and the dock (input · method tabs · primary action). It owns everything
  staging: the debounced USDA search with result caching, the barcode lookup
  (camera + manual), the custom form, and the `QuantityGrams` amount card with
  its live `MacroPills` preview (ADR-0023). It never logs or persists: it hands
  the resolved food back through **`onChoose(choice)`** and awaits the host's
  `{ ok, message? }`, staying open on a refusal (issue #14) and letting the host
  close on success.
- **`FoodChoice`** (in `food-staging.ts`) is the emit boundary: a searched /
  scanned `{ kind: "food", food, grams }`, or a hand-entered
  `{ kind: "custom", … }`. `LogFoodSheet.onChoose` ingests the twin and appends a
  Consumption Event (retracting the edited one, append-only);
  `AddIngredientSheet.onChoose` maps it to a `RecipeIngredient` and hands it to
  the builder. The stager knows neither path.
- **Hosts keep only their shell.** `LogFoodSheet` keeps its `Modal`, its header,
  its edit-mode `seed`, its `onChoose`, and injects the Recipe browser as an
  **extra tab** (`extraTabs` + a `tabContent` snippet) — a browser, not a staging
  method, so it lives with the log flow. `AddIngredientSheet` keeps its overlay
  shell and header. `bind:staged` lets each header's back button clear the staged
  food ("Change food" / "Back") without owning the staging state.
- **Behaviour converges on the richer copy.** The add flow now gets real camera
  scanning and the four-macro `MacroPills` preview; both flows hide the method
  switcher once a food is staged. The staging text inputs (search, barcode,
  custom name, custom macros) adopt `ui/Input`, folding in the "raw inputs in
  food sheets" cleanup. Per-host DOM ids are passed in (`ids`) so each sheet
  keeps its own e2e selectors.

## Consequences

- Staging a food behaves identically whether logging directly or adding a recipe
  ingredient, and the flow's logic lives in one component. `LogFoodSheet` and
  `AddIngredientSheet` shrink to shell + host action; the duplicated markup and
  logic are gone from both.
- `QuantityGrams` (ADR-0023) is now reused by the log flow, the add-ingredient
  flow, the recipe rows, and the dashboard through this one card.
- The emit boundary keeps the append-only ledger rule where it belongs: the
  stager proposes a food, the host commits it (log-and-retract, or fold into a
  recipe), so neither surface can drift on persistence.
- Covered by the existing food e2e suite (search → stage → set amount → log /
  add; custom entry; the recipe browser and add-ingredient seams), which passes
  unchanged against the shared component.
- **Deferred:** unifying the two shells (`Modal` vs bare overlay) is left as-is —
  they differ meaningfully (a bottom sheet with a grab handle vs a dialog-sibling
  overlay), and the staging body is what mattered to share.
