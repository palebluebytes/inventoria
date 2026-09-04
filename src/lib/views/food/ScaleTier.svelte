<script lang="ts">
  import ToggleGroup from "../../ui/ToggleGroup.svelte";
  import Button from "../../ui/Button.svelte";
  import {
    DEFAULT_SCALE_FACTOR,
    parseScaleFactor,
    type ScaleOp,
  } from "../../food/scale-amount";

  // The Scale tier (ADR-0088 §5): a fixed-height expansion of the Selection
  // bar, not a BottomSheet — a sheet dims what is behind it, and what is behind
  // it is the list being previewed.
  //
  // Operator first, then the factor: it reads as an operation applied to a
  // number rather than a number waiting for one. The operators are the shared
  // ToggleGroup, so tapping the active one clears it and cancels the preview
  // (ADR-0040's deselect behaviour), which is why there is no cancel control.
  //
  // **The tier is paper where the bar is ink**, which the ADR does not state.
  // ToggleGroup's selected cell is `background: var(--ink)`, so on the bar's
  // black field the chosen operator would be invisible; the alternatives were
  // re-skinning a shared primitive from a call site that has no class channel,
  // or hand-rolling a control ADR-0040 exists to forbid. A distinct surface for
  // the control the bar opened is the cheaper answer.
  let {
    factor = $bindable(DEFAULT_SCALE_FACTOR),
    op = $bindable(""),
    onApply,
    busy = false,
  }: {
    /** The typed factor. Free text, not a number input: `parseScaleFactor`
     *  takes the amount-field expression grammar, so `3/2` parses. */
    factor?: string;
    /** `""` is nothing chosen, which is ToggleGroup's own empty value. */
    op?: "" | ScaleOp;
    onApply: (factor: number, op: ScaleOp) => void;
    /** True while a run is in flight, so a second tap cannot land mid-write. */
    busy?: boolean;
  } = $props();

  let parsed = $derived(parseScaleFactor(factor));
  let ready = $derived(parsed !== null && op !== "" && !busy);
  let sym = $derived(op === "divide" ? "÷" : "×");
</script>

<div class="sb-scale">
  <ToggleGroup
    bind:value={op}
    ariaLabel="Operation"
    testid="scale-op"
    options={[
      { value: "multiply", label: "×" },
      { value: "divide", label: "÷" },
    ]}
  />

  <input
    class="sb-factor"
    inputmode="decimal"
    autocomplete="off"
    aria-label="Scale factor"
    aria-invalid={parsed === null}
    data-testid="scale-factor"
    bind:value={factor}
  />

  <span class="sb-apply">
    <Button
      variant="primary"
      size="sm"
      disabled={!ready}
      data-testid="scale-apply"
      onclick={() => ready && parsed !== null && onApply(parsed, op as ScaleOp)}
      >{ready ? `Apply ${sym}${factor}` : "Apply"}</Button
    >
  </span>
</div>

<style>
  .sb-scale {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-s);
    background: var(--paper);
    color: var(--ink);
    border-bottom: var(--edge);
  }

  /* ToggleGroup is `width: 100%` by default, which would push the rest of the
     tier off the row. Two cells need no more than their content. */
  .sb-scale :global(.togglegroup-field) {
    width: auto;
    flex-shrink: 0;
  }
  /* The operators are marks, not words: they carry no uppercase tracking and
     want a square cell big enough to hit. */
  .sb-scale :global(.tg-row .tg) {
    min-width: 2.75rem;
    min-height: 2.75rem;
    font-size: var(--step-0);
  }

  .sb-factor {
    flex-shrink: 0;
    width: 4rem;
    min-height: var(--tap-min);
    padding: 0 var(--space-2xs);
    background: var(--bg-input);
    border: var(--edge);
    color: var(--ink);
    font-family: inherit;
    font-size: var(--step-0);
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .sb-factor[aria-invalid="true"] {
    background: var(--red-bg);
  }

  .sb-apply {
    margin-left: auto;
  }
</style>
