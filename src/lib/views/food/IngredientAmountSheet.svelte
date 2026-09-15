<script lang="ts">
  import type { EntityPayload } from "../../ingestion/ingest";
  import {
    reportsNoEnergy,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import type { NovaVerdict } from "../../food/nova-verdict";
  import type { DietaryVerdict } from "../../food/off-signals";
  import type { FoodSourceKind } from "../../food/food-source";
  import type { FoodDensity } from "../../food/density";
  import type { MeasuredUnit } from "../../food/nutrition";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import FoodCard from "./FoodCard.svelte";
  import CommitButton from "./CommitButton.svelte";

  // Edits a single food line's amount in a sheet raised over the
  // recipe/instantiation dialog or the dashboard. The same picker serves both:
  // it edits a working copy and reports the chosen amount once on Done, so the
  // caller commits it its own way — a recipe mutates the ingredient in memory,
  // the dashboard retract-and-replaces the logged event (append-only, ADR-0008)
  // — without this sheet knowing which. The amount is in the food's OWN panel
  // unit and nothing converts (ADR-0060 §1/§2): grams for a weight basis,
  // millilitres for a drink published per 100 ml. The control names that unit and
  // the caption above it names the basis, both read off the panel this sheet is
  // handed. A per-serving food is passed in with its serving surfaced as a
  // "1 serving — N g" portion chip (via the caller's servingSizePortion), so a
  // whole-serving food is edited by measurement too.
  //
  // The body IS the staging screen's food card (FoodCard): the same tags, name,
  // meta row, amount control and allergen block, derived from the same twin. The
  // two screens differ only in the sheet header above them — "Edit amount" here,
  // the meal there. This sheet adds only the over-dialog chrome (BottomSheet,
  // ADR-0027/0028) and the docked Done action.
  let {
    payload,
    name,
    amount,
    unit,
    portions = [],
    panel,
    onEdit,
    onExplainNova,
    onExplainSource,
    onExplainDietary,
    onAssertDensity,
    onCommit,
    onClose,
  }: {
    /** The food twin behind the logged line — every mark on the card reads from
     *  it, exactly as the staging screen's does. */
    payload: EntityPayload;
    name: string;
    amount: number;
    /** The unit `amount` is in. On a food carrying a Density Class this is what
     *  the row was entered in and not what its panel implies (ADR-0105 §7), so
     *  it is handed in and handed back rather than re-derived here. */
    unit: MeasuredUnit;
    /** The food's household portions (ADR-0030) plus any synthesised serving,
     *  shown as picker chips. Empty for a portion-less food. */
    portions?: Portion[];
    /** The food's `nutrition/info` panel, per its serving basis. When present the
     *  sheet shows the basis caption + macro preview + full breakdown scaled to
     *  the working amount; omit it to render the plain amount picker. */
    panel?: NutritionInfo;
    /** Correct this food from its label — the card's pencil badge and the source
     *  explainer's edit action. Omit where the host has no edit surface. */
    onEdit?: () => void;
    /** Tap-through on the NOVA badge — the explainer handoff seam (#92). */
    onExplainNova?: (verdict: NovaVerdict) => void;
    /** Tap-through on the source tag — the per-origin trust explainer. */
    onExplainSource?: (kind: FoodSourceKind) => void;
    /** Tap-through on a dietary mark — the on-pack claims explainer. */
    onExplainDietary?: (verdict: DietaryVerdict) => void;
    /** The user has said what kind of liquid this food is (ADR-0105 §1). The
     *  twin behind this sheet already exists, so the host persists it rather
     *  than carrying it to a commit the way a staging screen does. Omit on a
     *  host with nowhere to put it, and the field offers only the panel's unit. */
    onAssertDensity?: (density: FoodDensity) => void;
    onCommit: (amount: number, unit: MeasuredUnit) => void;
    onClose: () => void;
  } = $props();

  // A working copy — nothing is committed until Done, so closing via the scrim
  // or ✕ leaves the row untouched. Seeded once from `amount`: the sheet is
  // mounted fresh each time a row is opened, so it never needs to track later
  // prop changes.
  // svelte-ignore state_referenced_locally
  let value = $state(amount);
  // The unit travels with the working copy: the card below offers the toggle on
  // a food that can be weighed, so Done reports what the user left it on.
  // svelte-ignore state_referenced_locally
  let valueUnit = $state<MeasuredUnit>(unit);

  // A panel that reports no energy cannot be committed at any amount, and the
  // card says why (ADR-0048 §6). Held here as well as on the staging screen
  // because Done writes a fresh row — a retract-and-replace on the dashboard,
  // an in-memory ingredient in the builder — and both would carry the zero
  // forward. Nothing is migrated (§ Consequences), so an entry already written
  // against such a food keeps its zero; the row's ✕ is the way out of it.
  let noEnergy = $derived(reportsNoEnergy(panel));

  function done() {
    onCommit(value, valueUnit);
    onClose();
  }
</script>

<!-- The header carries the VERB, not the food: it is one nowrap line that
     ellipsises, and a food name ("Bananas, ripe and…") is exactly what that
     truncates. The name belongs in the card, where it can wrap and be read in
     full — under the same top-right tag corner the staged card uses.

     `fillHeight`, on both halves of ADR-0089 §5's rule. It holds a text field —
     the amount — and a sheet sized to its content puts that field wherever the
     card happens to end, which is the geometry a raised keyboard is worst
     against. And its height is a fact about the food rather than about the
     edit: a food with two portion chips and a nutrition panel makes a tall
     sheet, one with neither makes a short one, and the same verb should not be
     a different shape per row. It is the staging screen's card under a
     different header, and that screen is `flushBody` — pinned by the same rule.
     No `centred`: neither sibling takes it, so above 768px this stays the
     bottom-anchored 85vh card they are. -->
<BottomSheet
  isOpen
  title="Edit amount"
  class="amount-sheet"
  fillHeight
  elevated
  {onClose}
>
  <FoodCard
    {payload}
    {name}
    {panel}
    {portions}
    bind:amount={value}
    bind:unit={valueUnit}
    {onEdit}
    {onExplainSource}
    {onExplainNova}
    {onExplainDietary}
    {onAssertDensity}
  />

  {#snippet footer()}
    <CommitButton id="amount-done-btn" disabled={noEnergy} onclick={done}
      >Done</CommitButton
    >
  {/snippet}
</BottomSheet>

<style>
  /* The staging screen's stage pads at --space-s; this body defaults to the
     prose --space-m, which made the identical card sit narrower and lower. Match
     it, so the two screens differ only in their header. */
  :global(.amount-sheet .bottom-sheet-body) {
    padding: var(--space-s);
  }
</style>
