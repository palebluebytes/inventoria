<script lang="ts">
  import { Slider } from "bits-ui";
  import Button from "../../ui/Button.svelte";

  // Amount control for a staged food: a full-width numeric field (the primary,
  // precise entry — tapping it opens the numeric keyboard via `inputmode`), a
  // slider that skims the common range, and preset chips for one-tap jumps.
  // The slider is a coarse accelerator only: typed values may exceed `sliderMax`,
  // in which case the thumb pins at the end while `grams` keeps the exact number.
  let {
    grams = $bindable(100),
    sliderMax = 500,
    presets = [25, 50, 100, 150, 200, 300],
  }: {
    grams: number;
    sliderMax?: number;
    presets?: number[];
  } = $props();

  const HARD_MAX = 10000;
  const clamp = (v: number) => Math.max(0, Math.min(HARD_MAX, Math.round(v)));

  // The field keeps its own raw string so typing (and a transient empty field)
  // isn't clobbered; `grams` is the source of truth everything else drives.
  let raw = $state(String(grams));
  let focused = $state(false);
  $effect(() => {
    if (!focused) raw = String(grams);
  });

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    raw = e.currentTarget.value.replace(/[^0-9]/g, "");
    if (raw !== "") grams = clamp(Number(raw));
  }
  function commit() {
    focused = false;
    grams = clamp(Number(raw) || 0);
    raw = String(grams);
  }

  let sliderValue = $derived(Math.min(grams, sliderMax));
</script>

<div class="qty">
  <label class="field">
    <input
      class="num"
      inputmode="numeric"
      aria-label="Quantity in grams"
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
