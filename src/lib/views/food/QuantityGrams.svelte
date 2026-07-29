<script lang="ts">
  import { Slider } from "bits-ui";
  import Button from "../../ui/Button.svelte";
  import {
    evaluateAmount,
    AMOUNT_EXPRESSION_CHARS,
  } from "../../food/amount-expression";
  import {
    roundFood,
    portionPresets,
    resolvePortionGrams,
    type Portion,
  } from "../../food/nutrition";

  // Amount control for a staged food: a full-width field (the primary, precise
  // entry — you can type a plain number *or* a little sum like `65 / 2` and the
  // field logs the result), a slider that skims the common range, and preset
  // chips for one-tap jumps.
  // The slider is a coarse accelerator only: typed values may exceed `sliderMax`,
  // in which case the thumb pins at the end while `grams` keeps the exact number.
  // When the food carries household portions (ADR-0030, ticket #27) they render
  // as an extra chip row above the gram presets: tapping "1 medium — 118 g" fills
  // the resolved grams. A portion-less food shows the control exactly as before.
  let {
    grams = $bindable(100),
    sliderMax = 500,
    presets = [25, 50, 100, 150, 200, 300],
    portions = [],
  }: {
    grams: number;
    sliderMax?: number;
    presets?: number[];
    portions?: Portion[];
  } = $props();

  // The chip view-models are derived once from the raw portions by the food
  // domain helper; the .svelte file holds no portion mapping of its own.
  let portionOptions = $derived(portionPresets(portions));

  // Tapping a portion chip fills its resolved grams — via the shared resolver so
  // the picker and any downstream reader agree — falling back to the preset's
  // pre-rounded grams if the label somehow can't be resolved.
  function pickPortion(label: string, fallback: number) {
    grams = resolvePortionGrams(portions, label) ?? fallback;
  }

  const HARD_MAX = 10000;
  // Held to the food precision (`roundFood`) so a typed sum like `65 / 2` keeps
  // its `32.5` instead of being rounded away to a whole gram; a value with no
  // fractional part still shows whole (the result is a number, never padded).
  const clamp = (v: number) => Math.max(0, Math.min(HARD_MAX, roundFood(v)));

  // The field keeps its own raw string so typing (and a transient empty field)
  // isn't clobbered; `grams` is the source of truth everything else drives.
  let raw = $state(String(grams));
  let focused = $state(false);
  $effect(() => {
    if (!focused) raw = String(grams);
  });

  // Keep only characters a sum can be built from; evaluate live so the slider
  // and any macro preview track a complete expression as it's typed. While the
  // field is mid-expression (`65 /`) or otherwise not yet a number, `evaluateAmount`
  // returns null and `grams` simply holds its last good value — never clobbered.
  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    raw = [...e.currentTarget.value]
      .filter((ch) => AMOUNT_EXPRESSION_CHARS.test(ch))
      .join("");
    const result = evaluateAmount(raw);
    if (result !== null) grams = clamp(result);
  }
  // On blur/Enter, collapse whatever was typed to its computed value: a valid
  // sum becomes its result, anything unparseable falls back to the last `grams`.
  function commit() {
    focused = false;
    const result = evaluateAmount(raw);
    grams = clamp(result ?? grams);
    raw = String(grams);
  }

  let sliderValue = $derived(Math.min(grams, sliderMax));
</script>

<div class="qty">
  <label class="field">
    <input
      class="num"
      inputmode="text"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="Quantity in grams — a number or a sum like 65 / 2"
      value={raw}
      oninput={onInput}
      onfocus={(e) => {
        focused = true;
        e.currentTarget.select();
      }}
      onblur={commit}
      onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
    <span class="unit">g</span>
  </label>

  <Slider.Root
    type="single"
    value={sliderValue}
    onValueChange={(v) => (grams = v)}
    min={0}
    max={sliderMax}
    step={1}
    class="qty-slider"
  >
    {#snippet children({ thumbItems })}
      <span class="qty-rail"></span>
      <Slider.Range class="qty-range" />
      {#each thumbItems as { index } (index)}
        <Slider.Thumb {index} class="qty-thumb" />
      {/each}
    {/snippet}
  </Slider.Root>
  <div class="scale"><span>0</span><span>{sliderMax} g</span></div>

  {#if portionOptions.length > 0}
    <div class="portions" data-testid="portion-presets">
      {#each portionOptions as p (p.label)}
        <Button
          variant={grams === p.grams ? "primary" : "secondary"}
          class="portion-chip"
          onclick={() => pickPortion(p.label, p.grams)}>{p.display}</Button
        >
      {/each}
    </div>
  {/if}

  <div class="presets">
    {#each presets as p}
      <Button
        variant={grams === p ? "primary" : "secondary"}
        class="chip-fit"
        onclick={() => (grams = p)}>{p}</Button
      >
    {/each}
  </div>
</div>

<style>
  .qty {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
  }
  .field {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    border: 3px solid var(--border-accent);
    padding: var(--space-2xs) var(--space-xs);
    cursor: text;
  }
  .field:focus-within {
    outline: 3px solid var(--border-accent);
    outline-offset: 3px;
  }
  .num {
    width: 100%;
    border: none;
    outline: none;
    text-align: center;
    font-family: inherit;
    font-size: var(--step-4);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .unit {
    font-size: var(--step-1);
    font-weight: 700;
  }

  /* bits-ui renders these elements itself, so target them with :global. */
  :global(.qty-slider) {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 44px;
    touch-action: none;
  }
  :global(.qty-rail) {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 12px;
    transform: translateY(-50%);
    background: var(--bg-surface);
    border: 3px solid var(--border-accent);
  }
  :global(.qty-range) {
    position: absolute;
    top: 50%;
    height: 12px;
    transform: translateY(-50%);
    background: var(--green-bg);
    border: 3px solid var(--border-accent);
  }
  :global(.qty-thumb) {
    position: absolute;
    top: 50%;
    width: 30px;
    height: 30px;
    transform: translate(-50%, -50%);
    background: var(--bg-surface);
    border: 3px solid var(--border-accent);
    border-radius: 50%;
    cursor: grab;
  }
  :global(.qty-thumb:focus-visible) {
    outline: 3px solid var(--border-accent);
    outline-offset: 3px;
  }
  .scale {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-top: -8px;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  /* Portion chips wrap (a food can offer several measures, and each label is
     wider than a gram number), sitting above the fixed gram-preset row. */
  .portions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
    width: 100%;
  }
  .portions :global(.portion-chip) {
    flex: 0 1 auto;
    min-width: 0;
    padding-left: var(--space-xs);
    padding-right: var(--space-xs);
    font-size: var(--step-n2);
  }
  .presets {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--space-3xs);
    width: 100%;
  }
  /* Reuse the app's <Button> (secondary/primary), just make the presets share
     the row equally and shrink instead of wrap — override its wide padding. */
  .presets :global(.chip-fit) {
    flex: 1 1 0;
    min-width: 0;
    padding-left: var(--space-3xs);
    padding-right: var(--space-3xs);
    font-size: var(--step-n2);
  }
</style>
