<script lang="ts">
  import { tick, type Snippet } from "svelte";
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

  // Amount control for a staged food: a boxed field (the primary, precise entry —
  // you can type a plain number *or* a little sum like `65 / 2` and the field logs
  // the result) and a slider that skims the common range.
  // The slider is a coarse accelerator only: typed values may exceed `sliderMax`,
  // in which case the thumb pins at the end while `grams` keeps the exact number.
  // When the food carries household portions (ADR-0030, ticket #27) they render
  // as a chip row below the slider: tapping "1 medium — 118 g" fills the resolved
  // grams. A portion-less food shows just the field and slider.
  let {
    grams = $bindable(100),
    sliderMax = 500,
    portions = [],
    hydrating = false,
    badge = undefined,
  }: {
    grams: number;
    sliderMax?: number;
    portions?: Portion[];
    // True while the food's portions are being fetched (ADR-0030 §5): the slot
    // shows skeleton chips so the real ones land in place, no layout shift.
    hydrating?: boolean;
    // Optional content floated to the right of the portions row — the NOVA badge
    // (ADR-0041 §5), passed by both the staged card and the dashboard edit-amount
    // sheet so it reads the same on every screen. The row shows for the badge alone
    // when a food carries no portion chips.
    badge?: Snippet;
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

  // The slider skims a 1..sliderMax range (a 0 g amount is meaningless); the field
  // still holds the exact typed grams, so a typed 0 just pins the thumb at 1.
  let sliderValue = $derived(Math.min(Math.max(grams, 1), sliderMax));
</script>

<div class="qty">
  <!-- Amount box: the "Quantity (grams)" label inline-left, the grams value
       right-aligned. One bordered card; the ÷ / × sum keys ride the slider row
       below (ADR-0043 §2 relayout). -->
  <div class="qty-row">
    <span class="qty-label">Quantity (grams)</span>
    <label class="value">
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
  </div>

  <!-- Slider skims the amount, with the ÷ / × keys as the right-most elements.
       The keys insert "/" and "*" (what the parser reads) at the caret;
       `pointerdown` is prevented so tapping one never blurs the field
       mid-expression. -->
  <div class="ops">
    <Slider.Root
      type="single"
      value={sliderValue}
      onValueChange={(v) => (grams = v)}
      min={1}
      max={sliderMax}
      step={1}
      thumbPositioning="exact"
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
    <!-- The 0 / max scale sits in the slider's grid column only, so its ends line
         up with the track rather than the ÷ / × keys. -->
    <div class="scale"><span>1</span><span>{sliderMax} g</span></div>
  </div>

  {#if showPortionSlot || badge}
    <!-- Portions row: the household-portion chips sit left, the NOVA badge (when
         any) is always floated to the right (ADR-0041 §5 badge, relocated here so
         it reads the same on every screen — staged card and edit-amount sheet).
         The row still shows for the badge alone when a food carries no portions. -->
    <div class="portions-row">
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
                onclick={() => pickPortion(p.label, p.grams)}
                >{p.display}</Button
              >
            {/each}
          {:else}
            <!-- Portions loading: skeleton chips holding the row's height so the
             real chips replace them without shifting the picker below. -->
            <span
              class="portion-skeleton"
              style="width: 6.5rem"
              aria-hidden="true">&nbsp;</span
            >
            <span
              class="portion-skeleton"
              style="width: 7.5rem"
              aria-hidden="true">&nbsp;</span
            >
            <span class="sr-only" role="status">Loading portion sizes…</span>
          {/if}
        </div>
      {/if}
      {#if badge}<div class="qty-badge">{@render badge()}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .qty {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
    margin-top: var(--space-m);
  }
  /* When the control leads a padded sheet body (the edit-amount sheet, where the
     food name lives in the sheet header), it is the body's first child and its
     top margin would double up on the body's own padding. Collapse it there; the
     staged card keeps the margin, since the meta/tags rows precede it. */
  .qty:first-child {
    margin-top: 0;
  }
  /* Amount box: the label inline-left, the grams value right-aligned. One
     bordered card that frames the value (which carries no border of its own). */
  .qty-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-xs);
    border: var(--edge);
    box-shadow: var(--shadow-1);
  }
  .qty-row:focus-within {
    outline: var(--edge-thick);
    outline-offset: 3px;
  }
  .qty-label {
    font-weight: 700;
  }
  /* The grams value rides flush right in the amount box, right-aligned. */
  .value {
    margin-left: auto;
    display: flex;
    align-items: baseline;
    gap: 4px;
    cursor: text;
  }
  .num {
    width: 5rem;
    border: none;
    outline: none;
    text-align: right;
    font-family: inherit;
    font-size: var(--step-1);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .unit {
    font-size: var(--step-n1);
    font-weight: 700;
  }

  /* Slider, the ÷ / × keys, and the 0/max scale on a grid: the slider + scale share
     the 1fr first column (scale on the second row), the keys sit in the two auto
     columns on the first row. This keeps the scale's ends aligned with the track,
     not the keys (the number pad omits operators, so ÷ / × live here). */
  .ops {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    column-gap: var(--space-2xs);
    width: 100%;
  }
  .op {
    grid-row: 1;
    align-self: stretch;
    width: 2.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: var(--edge);
    box-shadow: var(--shadow-1);
    background: var(--paper);
    font-family: inherit;
    font-size: var(--step-1);
    font-weight: 800;
    line-height: 1;
    color: var(--text-primary);
    cursor: pointer;
  }
  .op:active {
    background: var(--green-bg);
    box-shadow: none;
    transform: translate(1px, 1px);
  }
  .op:focus-visible {
    outline: var(--edge-thick);
    outline-offset: 3px;
  }

  /* bits-ui renders these elements itself, so target them with :global. */
  :global(.qty-slider) {
    grid-column: 1;
    grid-row: 1;
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 44px;
    touch-action: none;
    /* `thumbPositioning="exact"` runs the thumb centre to the rail ends (so the
       value tracks exactly and the fill is truly empty at 0); the thumb then
       overflows half its 30px width past each end. This 15px gutter gives that
       overflow room, so it never clips at the left or collides with the ÷ key. */
    margin-inline: 15px;
  }
  :global(.qty-rail) {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 12px;
    transform: translateY(-50%);
    background: var(--bg-surface);
    border: var(--edge-thick);
  }
  /* No border on the fill — the rail already frames the track, and a border here
     would show as a sliver at 0 (zero-width but still stroked). bits-ui sets both
     `left` and `right` on the range, so `margin-inline-start` nudges the fill in
     past the rail's 3px left border (else the fill would paint over it). The 6px
     height matches the rail's inner height, so the top/bottom borders show. */
  :global(.qty-range) {
    position: absolute;
    top: 50%;
    height: 6px;
    margin-inline-start: 3px;
    transform: translateY(-50%);
    background: var(--green-bg);
  }
  :global(.qty-thumb) {
    position: absolute;
    top: 50%;
    width: 30px;
    height: 30px;
    /* Vertical centring only — bits-ui already sets `translate: -50% 0` on the
       thumb to centre it horizontally on the value. A `transform: translateX(-50%)`
       here would stack with that and shift the thumb a whole extra half-width left
       (off the rail end at 0, short of it at max). */
    transform: translateY(-50%);
    background: var(--bg-surface);
    border: var(--edge-thick);
    border-radius: 50%;
    cursor: grab;
  }
  :global(.qty-thumb:focus-visible) {
    outline: var(--edge-thick);
    outline-offset: 3px;
  }
  .scale {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    justify-content: space-between;
    /* Match the slider's 15px thumb gutter so 0 / max sit under the rail ends. */
    margin-inline: 15px;
    margin-top: -8px;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  /* Portions row: chips left (taking the width), the NOVA badge floated right. The
     badge's margin-left:auto also floats it right on its own when a food carries no
     portion chips (then this row holds only the badge). */
  .portions-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    width: 100%;
  }
  .qty-badge {
    display: flex;
    flex: 0 0 auto;
    margin-left: auto;
  }
  /* Portion chips wrap (a food can offer several measures, and each label is
     wider than a gram number). */
  .portions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
    flex: 1 1 auto;
    min-width: 0;
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
    border: var(--edge-thin);
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
</style>
