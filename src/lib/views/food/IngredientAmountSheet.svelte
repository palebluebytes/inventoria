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
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import FoodCard from "./FoodCard.svelte";
  import CommitButton from "./CommitButton.svelte";

  // Edits a single food line's gram amount in a small sheet raised over the
  // recipe/instantiation dialog or the dashboard. The same picker serves both:
  // it edits a working copy and reports the chosen amount once on Done, so the
  // caller commits it its own way — a recipe mutates the ingredient in memory,
  // the dashboard retract-and-replaces the logged event (append-only, ADR-0008)
  // — without this sheet knowing which. Grams only: a per-serving food is passed
  // in with its serving surfaced as a "1 serving — N g" portion chip (via the
  // caller's servingSizePortion), so a whole-serving food is edited in grams too.
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
    portions = [],
    panel,
    onEdit,
    onExplainNova,
    onExplainSource,
    onExplainDietary,
    onCommit,
    onClose,
  }: {
    /** The food twin behind the logged line — every mark on the card reads from
     *  it, exactly as the staging screen's does. */
    payload: EntityPayload;
    name: string;
    amount: number;
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
    onCommit: (amount: number) => void;
    onClose: () => void;
  } = $props();

  // A working copy — nothing is committed until Done, so closing via the scrim
  // or ✕ leaves the row untouched. Seeded once from `amount`: the sheet is
  // mounted fresh each time a row is opened, so it never needs to track later
  // prop changes.
  // svelte-ignore state_referenced_locally
  let value = $state(amount);

  // A panel that reports no energy cannot be committed at any amount, and the
  // card says why (ADR-0048 §6). Held here as well as on the staging screen
  // because Done writes a fresh row — a retract-and-replace on the dashboard,
  // an in-memory ingredient in the builder — and both would carry the zero
  // forward. Nothing is migrated (§ Consequences), so an entry already written
  // against such a food keeps its zero; the row's ✕ is the way out of it.
  let noEnergy = $derived(reportsNoEnergy(panel));

  function done() {
    onCommit(value);
    onClose();
  }
</script>

<!-- The header carries the VERB, not the food: it is one nowrap line that
     ellipsises, and a food name ("Bananas, ripe and…") is exactly what that
     truncates. The name belongs in the card, where it can wrap and be read in
     full — under the same top-right tag corner the staged card uses. -->
<BottomSheet isOpen title="Edit amount" class="amount-sheet" elevated {onClose}>
  <FoodCard
    {payload}
    {name}
    {panel}
    {portions}
    bind:grams={value}
    {onEdit}
    {onExplainSource}
    {onExplainNova}
    {onExplainDietary}
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
