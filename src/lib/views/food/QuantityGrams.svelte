<script lang="ts">
  import { tick } from "svelte";
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
    hydrating = false,
  }: {
    grams: number;
    sliderMax?: number;
    presets?: number[];
    portions?: Portion[];
    // True while the food's portions are being fetched (ADR-0030 §5): the slot
    // shows skeleton chips so the real ones land in place, no layout shift.
    hydrating?: boolean;
  } = $props();

  // The chip view-models are derived once from the raw portions by the food
  // domain helper; the .svelte file holds no portion mapping of its own.
  let portionOptions = $derived(portionPresets(portions));
  // Reserve the portion row while portions exist OR are loading, so the real
  // chips replace the skeleton in the same space. Only a food that finishes
  // hydrating with no portions collapses the slot (a rare, gentle upward move).
  let showPortionSlot = $derived(portionOptions.length > 0 || hydrating);

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
  let inputEl = $state<HTMLInputElement>();
  $effect(() => {
    if (!focused) raw = String(grams);
  });

  // The number pad has no operator keys, so the only sum we support (× and ÷)
  // rides two on-screen keys. Each inserts its operator at the caret, keeps the
  // field focused (the key's pointerdown is prevented so it never steals focus
  // and triggers a blur/commit), and re-evaluates live like a keystroke would.
  async function insertOp(op: "*" | "/") {
    const el = inputEl;
    if (!el) return;
    const start = el.selectionStart ?? raw.length;
    const end = el.selectionEnd ?? raw.length;
    focused = true; // hold the $effect off while we rewrite `raw`
    const next = raw.slice(0, start) + op + raw.slice(end);
    raw = [...next].filter((ch) => AMOUNT_EXPRESSION_CHARS.test(ch)).join("");
    const result = evaluateAmount(raw);
    if (result !== null) grams = clamp(result);
    await tick(); // let Svelte push the new value before we place the caret
    el.focus();
    const caret = start + op.length;
    el.setSelectionRange(caret, caret);
  }

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
  <div class="entry">
    <label class="field">
      <input
        bind:this={inputEl}
        class="num"
        inputmode="decimal"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Quantity in grams — a number, or a sum with the × and ÷ keys"
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
    <!-- Sum keys: the number pad omits operators, so ÷ and × live here. They
         insert "/" and "*" (what the parser reads) at the caret. `pointerdown`
         is prevented so tapping a key never blurs the field mid-expression. -->
    <div class="ops">
      <button
        type="button"
        class="op"
        aria-label="Divide"
        onpointerdown={(e) => e.preventDefault()}
        onclick={() => insertOp("/")}>÷</button
      >
      <button
        type="button"
        class="op"
        aria-label="Multiply"
        onpointerdown={(e) => e.preventDefault()}
        onclick={() => insertOp("*")}>×</button
      >
    </div>
  </div>

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

  {#if showPortionSlot}
    <div
      class="portions"
      data-testid="portion-presets"
      aria-busy={portionOptions.length === 0 && hydrating}
    >
      {#if portionOptions.length > 0}
        {#each portionOptions as p (p.label)}
          <Button
            variant={grams === p.grams ? "primary" : "secondary"}
            class="portion-chip"
            onclick={() => pickPortion(p.label, p.grams)}>{p.display}</Button
          >
        {/each}
      {:else}
        <!-- Portions loading: skeleton chips holding the row's height so the
             real chips replace them without shifting the picker below. -->
        <span class="portion-skeleton" style="width: 6.5rem" aria-hidden="true"
          >&nbsp;</span
        >
        <span class="portion-skeleton" style="width: 7.5rem" aria-hidden="true"
          >&nbsp;</span
        >
        <span class="sr-only" role="status">Loading portion sizes…</span>
      {/if}
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
  .entry {
    display: flex;
    align-items: stretch;
    gap: var(--space-2xs);
    width: 100%;
  }
  .field {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    border: 3px solid var(--border-accent);
    padding: var(--space-2xs) var(--space-xs);
    cursor: text;
  }
  /* Sum keys sit flush beside the field, sized to match its height. */
  .ops {
    display: flex;
    gap: var(--space-2xs);
  }
  .op {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    border: 3px solid var(--border-accent);
    background: var(--bg-surface);
    font-family: inherit;
    font-size: var(--step-2);
    font-weight: 800;
    line-height: 1;
    color: var(--text-primary);
    cursor: pointer;
  }
  .op:active {
    background: var(--green-bg);
  }
  .op:focus-visible {
    outline: 3px solid var(--border-accent);
    outline-offset: 3px;
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
  /* Placeholder chips shown while portions hydrate. Same padding/border/font as
     a real .portion-chip so the row is exactly one chip tall and the real chips
     drop straight in — no layout shift. The &nbsp; forces the matching line box. */
  .portion-skeleton {
    display: inline-block;
    box-sizing: border-box;
    padding: var(--space-2xs) var(--space-xs);
    border: 1px solid var(--border-accent);
    font-size: var(--step-n2);
    overflow: hidden;
    background: var(--bg-surface);
    opacity: 0.55;
    animation: portion-pulse 1.1s ease-in-out infinite;
  }
  .portion-skeleton:nth-of-type(2) {
    animation-delay: 0.18s;
  }
  @keyframes portion-pulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 0.7;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .portion-skeleton {
      animation: none;
      opacity: 0.5;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
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
