<script lang="ts">
  import { tick } from "svelte";
  import { Slider } from "bits-ui";
  import Button from "../../ui/Button.svelte";
  import {
    evaluateAmount,
    AMOUNT_EXPRESSION_CHARS,
  } from "../../food/amount-expression";
  import {
    amountDefaults,
    measuredUnitName,
    roundFood,
    portionPresets,
    resolvePortionAmount,
    type MeasuredUnit,
    type Portion,
  } from "../../food/nutrition";

  // The app's one amount control: a boxed field (the primary, precise entry —
  // you can type a plain number *or* a little sum like `65 / 2` and the field logs
  // the result) and a slider that skims the common range.
  // The slider is a coarse accelerator only: typed values may exceed its max,
  // in which case the thumb pins at the end while `amount` keeps the exact number.
  // When the food carries household portions (ADR-0030, ticket #27) they render
  // as a chip row below the slider: tapping "1 medium — 118 g" fills the resolved
  // amount. A portion-less food shows just the field and slider. Only the
  // portions stated in THIS field's unit become chips — a 330 ml can offers its
  // "1 can" back (ADR-0060 §6), and a gram serving on a millilitre food offers
  // nothing, because filling it in would convert by pretending not to.
  //
  // The unit is a property of the CONTROL, never of the input: every keystroke is
  // filtered to `AMOUNT_EXPRESSION_CHARS`, so a unit can't be typed even if we
  // wanted it to be. It comes from the food's panel basis and nothing converts
  // (ADR-0060 §1/§2) — which is why this is `AmountField` rather than the
  // `QuantityGrams` it used to be: the label was a millilitre field wearing a
  // gram name, and "quantity" is the ledger's word for the frozen `event/quantity`
  // string, not for a live input.
  let {
    amount = $bindable(),
    unit,
    portions = [],
  }: {
    amount: number;
    /** The unit this amount is entered in — the food's panel basis unit. */
    unit: MeasuredUnit;
    portions?: Portion[];
  } = $props();

  // The unit's own spellings and range, resolved in one place so the label, the
  // aria-label, the box suffix and the slider's scale cannot name four things.
  let unitName = $derived(measuredUnitName(unit));
  let sliderMax = $derived(amountDefaults(unit).sliderMax);

  // The chip view-models are derived once from the raw portions by the food
  // domain helper; the .svelte file holds no portion mapping of its own.
  let portionOptions = $derived(portionPresets(portions, unit));

  // Tapping a portion chip fills its resolved amount — via the shared resolver so
  // the picker and any downstream reader agree — falling back to the preset's
  // pre-rounded amount if the label somehow can't be resolved. The unit rides
  // along, so a chip resolves against the portion the field can actually hold
  // and never against a same-named one stated in the other unit.
  function pickPortion(label: string, fallback: number) {
    amount = resolvePortionAmount(portions, label, unit) ?? fallback;
  }

  const HARD_MAX = 10000;
  // Held to the food precision (`roundFood`) so a typed sum like `65 / 2` keeps
  // its `32.5` instead of being rounded away to a whole gram; a value with no
  // fractional part still shows whole (the result is a number, never padded).
  const clamp = (v: number) => Math.max(0, Math.min(HARD_MAX, roundFood(v)));

  // The field keeps its own raw string so typing (and a transient empty field)
  // isn't clobbered; `amount` is the source of truth everything else drives.
  let raw = $state(String(amount));
  let focused = $state(false);
  let inputEl = $state<HTMLInputElement>();
  $effect(() => {
    if (!focused) raw = String(amount);
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
    if (result !== null) amount = clamp(result);
    await tick(); // let Svelte push the new value before we place the caret
    el.focus();
    const caret = start + op.length;
    el.setSelectionRange(caret, caret);
  }

  // Keep only characters a sum can be built from; evaluate live so the slider
  // and any macro preview track a complete expression as it's typed. While the
  // field is mid-expression (`65 /`) or otherwise not yet a number, `evaluateAmount`
  // returns null and `amount` simply holds its last good value — never clobbered.
  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    raw = [...e.currentTarget.value]
      .filter((ch) => AMOUNT_EXPRESSION_CHARS.test(ch))
      .join("");
    const result = evaluateAmount(raw);
    if (result !== null) amount = clamp(result);
  }
  // On blur/Enter, collapse whatever was typed to its computed value: a valid
  // sum becomes its result, anything unparseable falls back to the last `amount`.
  function commit() {
    focused = false;
    const result = evaluateAmount(raw);
    amount = clamp(result ?? amount);
    raw = String(amount);
  }

  // The slider skims a 1..sliderMax range (a zero amount is meaningless); the field
  // still holds the exact typed number, so a typed 0 just pins the thumb at 1.
  let sliderValue = $derived(Math.min(Math.max(amount, 1), sliderMax));
</script>

<div class="af">
  <!-- Amount box: the unit-naming label inline-left, the value right-aligned.
       One bordered card; the ÷ / × sum keys ride the slider row below
       (ADR-0043 §2 relayout). -->
  <div class="af-row">
    <span class="af-label">Amount ({unitName})</span>
    <label class="value">
      <input
        bind:this={inputEl}
        class="num"
        inputmode="decimal"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Amount in {unitName} — a number, or a sum with the × and ÷ keys"
        value={raw}
        oninput={onInput}
        onfocus={(e) => {
          focused = true;
          e.currentTarget.select();
        }}
        onblur={commit}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span class="unit">{unit}</span>
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
      onValueChange={(v) => (amount = v)}
      min={1}
      max={sliderMax}
      step={1}
      thumbPositioning="exact"
      class="af-slider"
    >
      {#snippet children({ thumbItems })}
        <span class="af-rail"></span>
        <Slider.Range class="af-range" />
        {#each thumbItems as { index } (index)}
          <Slider.Thumb {index} class="af-thumb" />
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
    <div class="scale"><span>1</span><span>{sliderMax} {unit}</span></div>
  </div>

  {#if portionOptions.length > 0}
    <!-- Portion chips, taking the control's full width (the NOVA badge that used
         to share this row now rides the head with the other tags, which is also
         what gives a long portion label room to sit on its own line). A food's
         portions arrive with it now (ADR-0047 §6), so the row is either there or
         it is not — there is no loading state left to hold space for. -->
    <div class="portions" data-testid="portion-presets">
      {#each portionOptions as p (p.label)}
        <Button
          variant={amount === p.amount ? "primary" : "secondary"}
          class="portion-chip"
          onclick={() => pickPortion(p.label, p.amount)}>{p.display}</Button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .af {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
    margin-top: var(--space-m);
  }
  /* When the control leads a padded body it would double its own top margin up
     on that body's padding, so collapse it there. A basis caption above the
     control collapses the same margin from its own side (FoodAmountPanel). */
  .af:first-child {
    margin-top: 0;
  }
  /* Amount box: the label inline-left, the value right-aligned. One
     bordered card that frames the value (which carries no border of its own). */
  .af-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-xs);
    border: var(--edge);
    box-shadow: var(--shadow-1);
  }
  .af-row:focus-within {
    outline: var(--edge-thick);
    outline-offset: 3px;
  }
  .af-label {
    font-weight: 700;
  }
  /* The value rides flush right in the amount box, right-aligned. */
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
  :global(.af-slider) {
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
  :global(.af-rail) {
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
  :global(.af-range) {
    position: absolute;
    top: 50%;
    height: 6px;
    margin-inline-start: 3px;
    transform: translateY(-50%);
    background: var(--green-bg);
  }
  :global(.af-thumb) {
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
  :global(.af-thumb:focus-visible) {
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
  /* Portion chips wrap (a food can offer several measures, and each label is
     wider than a gram number). */
  .portions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
    width: 100%;
    min-width: 0;
  }
  /* A USDA portion label is a sentence ("Potato large (3\" to 4-1/4\" dia) —
     369 g"), far wider than any chip. Button defaults to one nowrap line clipped
     at both ends by its own overflow:hidden, which cut the label mid-word on
     BOTH sides and read as broken. Here the label wraps inside the chip and the
     chip is capped at the row's width, so a portion always fits its container —
     tall chips, never clipped ones. Left-aligned, since a wrapped sentence
     centred over two lines reads worse than a block of text. */
  .portions :global(.portion-chip) {
    flex: 0 1 auto;
    max-width: 100%;
    min-width: 0;
    padding-left: var(--space-xs);
    padding-right: var(--space-xs);
    font-size: var(--step-n2);
    white-space: normal;
    /* Last-resort break, so even a label with no space or hyphen to break at
       stays inside the chip rather than spilling out of it. */
    overflow-wrap: anywhere;
    text-align: left;
    justify-content: flex-start;
  }
</style>
