<script lang="ts">
  import {
    basisCaption,
    basisUnit,
    parseBasisQuantity,
    scaleNutrition,
    type MeasuredUnit,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { amountAgainstBasis, type FoodDensity } from "../../food/density";
  import type { DensityClassId } from "../../food/density-class";
  import AmountField from "./AmountField.svelte";
  import NutrientPreview from "./NutrientPreview.svelte";

  // The shared amount-and-preview body of a food: the AmountField control in the
  // panel's own unit — carrying the basis caption ("Per 100 g" or "Per serving
  // (30 g)") on its head row and any household portions as chips — a live
  // macro-pill preview, and the collapsed full-panel breakdown, all scaled to
  // the amount in view. Extracted
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
  //
  // The density travels with the panel rather than being re-read here, because
  // the twin it is a fact about is the caller's (FoodCard reads both off the
  // same payload). On a food carrying one the amount's unit and the panel's
  // basis can differ, and the factor below is the only place that matters: the
  // amount is put into the panel's unit and the panel is left alone (ADR-0105
  // §5 — a density sits beside a panel and never rescales one).
  let {
    panel = undefined,
    portions = [],
    amount = $bindable(),
    unit = $bindable(),
    density = undefined,
    prefill = undefined,
    onAssertDensity = undefined,
  }: {
    /** The food's `nutrition/info` panel, per its serving basis. Omit for a
     *  panel-less food — then only the amount control renders. */
    panel?: NutritionInfo;
    /** Household portions surfaced as picker chips (ADR-0030). */
    portions?: Portion[];
    amount: number;
    /** The unit `amount` is in. The host seeds it (its context and this food's
     *  memory there decide the opening unit) and the control writes back to it
     *  when the user switches. */
    unit: MeasuredUnit;
    /** What this food's twin asserts about its density (ADR-0105 §4). */
    density?: FoodDensity | undefined;
    /** The class this food's own source names, where it names exactly one. */
    prefill?: DensityClassId | undefined;
    /** The user has said what kind of liquid this is; the host writes it. */
    onAssertDensity?: (density: FoodDensity) => void;
  } = $props();

  // What the panel's figures are per, and the unit they are stated in.
  let basis = $derived(basisUnit(panel?.serving_size));
  let caption = $derived(basisCaption(panel?.serving_size));

  // The amount total: the full panel scaled from its own basis to the typed
  // amount, with that amount put into the panel's own unit first. The panel
  // itself is never rewritten (ADR-0105 §5); what moves is the number divided
  // by it, and on every food carrying no density that move is the identity.
  let factor = $derived(
    panel
      ? amountAgainstBasis(amount, unit, panel.serving_size, density) /
          parseBasisQuantity(panel.serving_size)
      : 0
  );
  let breakdown = $derived(scaleNutrition(panel, factor));
</script>

<!-- The caption — what the figures are measured against, which the amount box
     cannot say, since it names the unit being typed and not the divisor — is
     handed to the control rather than drawn above it: it rides the control's
     head row, sharing it with the − + × ÷ sum keys. -->
<AmountField
  bind:amount
  bind:unit
  {basis}
  {portions}
  {caption}
  {density}
  {prefill}
  {onAssertDensity}
/>

{#if panel}
  <!-- The shared preview (#97 prototype): the tracked figures as a 2-column grid,
       the rest behind the full-nutrition disclosure. The recipe surface shows its
       derived figures through the very same component. -->
  <div class="preview">
    <NutrientPreview {breakdown} testid="food-nutrient-breakdown" />
  </div>
{/if}

<style>
  .preview {
    margin-top: var(--space-m);
  }
</style>
