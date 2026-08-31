<script lang="ts">
  import { tick } from "svelte";
  import Button from "../../ui/Button.svelte";
  import {
    evaluateAmount,
    AMOUNT_EXPRESSION_CHARS,
  } from "../../food/amount-expression";
  import {
    measuredUnitName,
    roundFood,
    portionPresets,
    resolvePortionAmount,
    type MeasuredUnit,
    type Portion,
  } from "../../food/nutrition";

  // The app's one amount control: a boxed field — you type a plain number *or* a
  // little sum like `65 / 2` and the field logs the result — with the ÷ / × keys
  // the number pad omits.
  // When the food carries household portions (ADR-0030, ticket #27) they render
  // as a chip row below: tapping "1 medium — 118 g" fills the resolved amount.
  // A portion-less food shows just the field. Only the
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

  // The unit's own spelling, resolved in one place so the label, the aria-label
  // and the box suffix cannot name three things.
  let unitName = $derived(measuredUnitName(unit));

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

  // Keep only characters a sum can be built from; evaluate live so any macro
  // preview tracks a complete expression as it's typed. While the
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
</script>

<div class="af">
  <!-- Amount box: the unit-naming label inline-left, the value right-aligned.
       One bordered card; the ÷ / × sum keys ride the row below
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

  <!-- The ÷ / × keys insert "/" and "*" (what the parser reads) at the caret;
       `pointerdown` is prevented so tapping one never blurs the field
       mid-expression.

       There was a slider skimming the amount here, and it is gone. It carried a
       whole-unit step and wrote its position back through `onValueChange`, so a
       typed 12.34 was re-reported as 12 and the field silently lost what the
       user had entered — the number they typed being overruled by a control they
       had not touched. Typing is the primary way an amount is entered and the
       sums the two keys below build are the secondary one; neither needs a
       coarse skim beside them. -->
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

  /* The ÷ / × keys, which the number pad omits. They sat in two auto columns
     beside a slider; with the slider gone they are the whole row. */
  .ops {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2xs);
    width: 100%;
  }
  .op {
    width: 2.6rem;
    min-height: 40px;
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
