<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import {
    parseScaleFactor,
    DEFAULT_SCALE_FACTOR,
    type ScaleOp,
  } from "../../food/scale-amount";

  // The shared ×/÷ scaler, used wherever a set of amounts is rescaled in one
  // go: the dashboard's selection bar (every selected Consumption Event) and
  // the recipe ingredient list (every ingredient). It owns the factor and its
  // validity and nothing else — what an operation MEANS is the caller's, so
  // this never touches an amount, a twin, or the ledger.
  //
  // It carries no colours of its own: the field borrows `currentColor`, so the
  // same control reads correctly on the paper-white recipe list and on the
  // ink-dark selection bar.
  let {
    target,
    onScale,
    disabled = false,
  }: {
    /** What the buttons act on, named for their labels: "the selected foods". */
    target: string;
    onScale: (factor: number, op: ScaleOp) => void;
    disabled?: boolean;
  } = $props();

  let factor = $state(DEFAULT_SCALE_FACTOR);
  // Free text rather than type="number" so the amount-field expression grammar
  // works here too ("3/2", ADR-0023). `null` is the single "not a usable factor
  // yet" signal — an empty field, a mid-typed one, a zero — and it only
  // disables the buttons, never rewrites what the user is typing.
  let scale_factor = $derived(parseScaleFactor(factor));
  // localhost/PWA is always a secure context, so randomUUID exists. Two of
  // these can be mounted at once, so the label↔field link needs a unique id.
  const uid = `scale-${crypto.randomUUID()}`;

  function apply(op: ScaleOp) {
    if (scale_factor === null) return;
    onScale(scale_factor, op);
  }
</script>

<div class="scale">
  <label class="sr-only" for={uid}>Scale factor for {target}</label>
  <input
    id={uid}
    class="factor"
    inputmode="decimal"
    autocomplete="off"
    bind:value={factor}
  />
  <Button
    variant="secondary"
    size="sm"
    disabled={disabled || scale_factor === null}
    aria-label="Multiply {target} by {factor}"
    onclick={() => apply("multiply")}>×</Button
  >
  <Button
    variant="secondary"
    size="sm"
    disabled={disabled || scale_factor === null}
    aria-label="Divide {target} by {factor}"
    onclick={() => apply("divide")}>÷</Button
  >
</div>

<style>
  .scale {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .factor {
    width: 3.5rem;
    border: var(--edge-thin);
    border-color: currentColor;
    background: transparent;
    color: inherit;
    padding: var(--space-3xs) var(--space-2xs);
    font-family: inherit;
    font-size: var(--step-n1);
    font-weight: 700;
    text-align: center;
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
