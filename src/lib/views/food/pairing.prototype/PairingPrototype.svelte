<script lang="ts">
  import BottomSheet from "../../../ui/BottomSheet.svelte";
  import NutritionPanel from "../NutritionPanel.svelte";
  import NutrientGroupHead from "../NutrientGroupHead.svelte";
  import NutrientCardGrid from "../NutrientCardGrid.svelte";
  import NutrientCard from "../NutrientCard.svelte";
  import FoodAmountPanel from "../FoodAmountPanel.svelte";
  import AmountField from "../AmountField.svelte";
  import Pills from "./Pills.svelte";
  import VariantA from "./VariantA.svelte";
  import VariantB from "./VariantB.svelte";
  import VariantC from "./VariantC.svelte";
  import BandMeter from "./BandMeter.svelte";
  import PrototypeSwitcher from "./PrototypeSwitcher.svelte";
  import { annotate } from "./annotate";
  import { buildDayBands } from "./day";
  import { PAIRED_FOODS, OPENING_AMOUNT } from "./data";
  import { basisCaption, type MeasuredUnit } from "../../../food/nutrition";
  import { type Variant } from "./variants";

  // THROWAWAY (#244) — the host. Two sheets, because #244 is two questions:
  // a food's panel, and the day's meter. Both are the app's own shells
  // (`BottomSheet`, `NutritionPanel`, `NutrientCardGrid`, `NutrientCard`) with
  // real tokens and real density, so a variant that only looks good in a
  // vacuum has nowhere to hide.
  let { variant, subject }: { variant: Variant; subject: string } = $props();

  let food = $derived(
    PAIRED_FOODS.find((f) => f.id === subject) ?? PAIRED_FOODS[0]
  );
  let amount = $state(OPENING_AMOUNT[subject] ?? 100);
  let unit = $state<MeasuredUnit>("g");
  let showing = $state<"panel" | "day">("panel");

  // Switching subject re-opens the panel at that food's own amount: 14 g of
  // oil and 200 g of kefir are both ordinary and 100 g of neither is.
  $effect(() => {
    amount = OPENING_AMOUNT[subject] ?? 100;
  });

  let annotation = $derived(annotate(food, amount));
  let bands = $derived(buildDayBands());
  let untouched = $derived(variant === "now" || variant === "B");
</script>

<PrototypeSwitcher {variant} {subject} />

<div class="proto-tabs">
  <button
    type="button"
    class:on={showing === "panel"}
    onclick={() => (showing = "panel")}>The panel</button
  >
  <button
    type="button"
    class:on={showing === "day"}
    onclick={() => (showing = "day")}>The meter</button
  >
</div>

{#if showing === "panel"}
  <BottomSheet isOpen title={food.name} testId="pairing-proto-panel">
    <p class="why">{food.note}</p>

    {#if untouched}
      <!-- The shipped panel, whole and unedited. On `now` that is the entire
           screen; on B the second band goes underneath it. -->
      <FoodAmountPanel
        panel={food.label}
        portions={food.reference.portions}
        bind:amount
        bind:unit
      />
      {#if variant === "B"}
        <VariantB {annotation} />
      {/if}
    {:else}
      <AmountField
        bind:amount
        bind:unit
        panelUnit="g"
        portions={food.reference.portions}
        caption={basisCaption(food.label.serving_size, undefined)}
      />
      <div class="pills">
        <Pills breakdown={annotation.measured} />
      </div>
      {#if variant === "A"}
        <div class="body"><VariantA {annotation} /></div>
      {:else}
        <VariantC {annotation} />
      {/if}
    {/if}

    <p class="tally">
      {annotation.fills} of the twelve metered micronutrients come from the reference
      food · energy {food.energyRatio.toFixed(2)}× the label's
    </p>
  </BottomSheet>
{:else}
  <NutritionPanel title="Today" testId="pairing-proto-day">
    {#snippet body()}
      <p class="why day-why">
        Six packs: the four paired foods and two #243 adjudicated
        <code>none</code>. The pairings move
        <b>{bands.moved} of the twelve</b> meters, and
        <b>{bands.silentWithout}</b> of those read as nothing without them.
      </p>
      <NutrientGroupHead label="Vitamins &amp; minerals" />
      <NutrientCardGrid>
        {#each bands.rows as row (row.key)}
          <NutrientCard label={row.label} rowKey={row.key}>
            {#snippet children()}
              <span class="vt" class:absent={row.measuredAbsent}>
                {row.measured}
                <span class="target">/ {row.target}</span>
              </span>
              <BandMeter {row} {variant} />
            {/snippet}
          </NutrientCard>
        {/each}
      </NutrientCardGrid>
    {/snippet}
  </NutritionPanel>
{/if}

<style>
  /* stylelint-disable -- THROWAWAY chrome, deliberately off the design system. */
  .proto-tabs {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    gap: 2px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
  .proto-tabs button {
    background: #2a2a33;
    color: #fff;
    border: 0;
    padding: 6px 12px;
    min-height: var(--tap-min);
    cursor: pointer;
  }
  .proto-tabs button.on {
    background: #7dd3fc;
    color: #101014;
  }

  /* The rest is the prototype's own copy, in real tokens — it sits inside the
     app's sheets and must not look like debug chrome. */
  .why {
    margin: 0 0 var(--space-s);
    padding: var(--space-2xs);
    background: var(--highlight-bg);
    font-size: var(--step-n2);
    line-height: 1.35;
  }
  .day-why {
    margin: var(--space-s);
  }
  .pills {
    margin-top: var(--space-m);
  }
  .body {
    margin-top: var(--space-m);
  }
  .tally {
    margin: var(--space-m) 0 0;
    font-size: var(--step-n3);
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }
  .vt {
    font-size: var(--step-n1);
    font-weight: 800;
    color: var(--text-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .vt.absent {
    color: var(--text-muted);
  }
  .target {
    font-size: var(--step-n3);
    font-weight: 500;
    color: var(--text-muted);
  }
</style>
