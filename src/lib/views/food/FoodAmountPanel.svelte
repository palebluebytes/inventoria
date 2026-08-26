<script lang="ts">
  import {
    basisCaption,
    basisUnit,
    parseBasisQuantity,
    scaleNutrition,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import AmountField from "./AmountField.svelte";
  import NutrientPreview from "./NutrientPreview.svelte";

  // The shared amount-and-preview body of a food: the basis caption ("Per 100 g"
  // or "Per serving (30 g)"), the AmountField control in the panel's own unit
  // (with any household portions as chips), a live macro-pill preview, and the
  // collapsed full-panel breakdown — all scaled to the amount in view. Extracted
  // from the FoodStager staged card so the same screen serves the search/scan
  // staging flow AND the dashboard's edit-amount sheet (IngredientAmountSheet),
  // keeping the two DRY.
  //
  // Scaling reads the panel's OWN basis via `parseBasisQuantity(serving_size)` —
  // 100 for a per-100 g source (USDA/OFF), the serving weight for a per-serving
  // label food — so a `30 g`-serving food scales by grams/30, not grams/100. A
  // panel-less food (a manual ingredient with no source panel) renders just the
  // amount control, exactly as before.
  //
  // The caption and the control answer two different questions — "what are these
  // figures per?" versus "what am I typing?" — and they coincide only on a
  // per-100 panel (ADR-0060 §3). Both are read off the same `serving_size`, so a
  // drink published per 100 ml is entered in millilitres under a caption that
  // says so, and nothing converts between a volume and a weight.
  let {
    panel = undefined,
    portions = [],
    amount = $bindable(),
  }: {
    /** The food's `nutrition/info` panel, per its serving basis. Omit for a
     *  panel-less food — then only the amount control renders. */
    panel?: NutritionInfo;
    /** Household portions surfaced as picker chips (ADR-0030). */
    portions?: Portion[];
    amount: number;
  } = $props();

  // The unit the amount is entered in, and what the panel's figures are per.
  let unit = $derived(basisUnit(panel?.serving_size));
  let caption = $derived(basisCaption(panel?.serving_size));

  // The amount total: the full panel scaled from its own basis to the typed amount.
  let factor = $derived(
    panel ? amount / parseBasisQuantity(panel.serving_size) : 0
  );
  let breakdown = $derived(scaleNutrition(panel, factor));
</script>

{#if caption}
  <!-- What the figures below are measured against, which the amount control
       above them cannot say: it names the unit being typed, not the divisor. -->
  <p class="basis">{caption}</p>
{/if}

<AmountField bind:amount {unit} {portions} />

{#if panel}
  <!-- The shared preview (#97 prototype): the tracked figures as a 2-column grid,
       the rest behind the full-nutrition disclosure. The recipe surface shows its
       derived figures through the very same component. -->
  <div class="preview">
    <NutrientPreview {breakdown} testid="food-nutrient-breakdown" />
  </div>
{/if}

<style>
  .basis {
    margin: var(--space-m) 0 0;
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-secondary);
  }
  /* The control carries its own top margin, which is the gap the caption now
     owns; collapse it to a hairline where the caption leads, so the two read as
     one block rather than as two stranded rows. */
  .basis + :global(.af) {
    margin-top: var(--space-2xs);
  }
  .preview {
    margin-top: var(--space-m);
  }
</style>
