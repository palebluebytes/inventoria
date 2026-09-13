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

  /* **A tier opens away from the edge its bar is anchored to** (ADR-0101 §4).

     On a phone the Selection bar sits on the band's bottom edge, so a tier above
     the verbs is the only place it can go — it grows up, into the screen, and
     the verbs stay where the thumb left them. Above 768 the bar is anchored the
     other way round, stuck at the head of the day's column, and the same markup
     would then put the tier at that corner and shove the verb row down the page.
     That corner is the one the Way-in bar hands over — `WayInBar`'s desktop
     padding exists to make the two match — so it is the one thing in this bar
     that must not move.

     `order` rather than a second render: one tier, in one place in the markup,
     sitting on whichever side of the verbs the anchor puts it. The rule flips
     with it, because it is the seam between the two rows and belongs to
     whichever edge faces them. */
  @media (min-width: 768px) {
    .sb-scale {
      order: 1;
      border-bottom: 0;
      border-top: var(--edge);
      animation: tierDown 0.2s var(--ease-snap);
    }
  }

  /* The same gesture the bar itself arrives on, restated rather than shared:
     Svelte scopes a `@keyframes` name to its component, so `SelectionBar`'s
     `dropIn` is not reachable from here. Both are ADR-0003 §4's sharp move — a
     short drop and no overshoot, because a tier that overshoots reads as a thing
     that wobbled. */
  @keyframes tierDown {
    from {
      opacity: 0;
      transform: translateY(-0.5rem);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-scale {
      animation: none;
    }
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
    /* Both were 2.75rem — Apple's 44pt, on the losing side of ADR-0089 §3, and
       #361's exhibit: the field four lines below carried the same wrong number
       and #338 could only see that one. A `:global` rule outranks the
       primitive's own floor, so restating it here is not redundant. */
    min-width: var(--tap-min);
    min-height: var(--tap-min);
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
