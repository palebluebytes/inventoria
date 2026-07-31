<script lang="ts">
  import type { Snippet } from "svelte";

  // The one nutrient card both the full-day RDA modal (#42) and the Settings
  // target editor (#41) render, so the two surfaces are literally the same
  // component — a labelled tile (label on top, body below) that tiles into a
  // {@link NutrientCardGrid}. The body differs by surface (the modal shows a
  // value/target + fill bar; the editor an allowance input) and is passed as
  // `children`; only the shell — padding, surface, label, muted state — lives here.
  //
  // `toggle` renders the whole card as a <label> so a click anywhere toggles the
  // control passed in `control` (the editor's visibility checkbox). A <label>
  // ignores clicks on its interactive descendants, so a target input in the body
  // stays independently editable and never flips the toggle. Without `toggle` the
  // card is a plain <div> (the read-only modal, and the always-on Calories card).
  let {
    label,
    rowKey = undefined,
    untracked = false,
    toggle = false,
    control = undefined,
    children,
  }: {
    label: string;
    /** `data-nutrient-row` hook for tests / per-nutrient styling. */
    rowKey?: string;
    /** Mute the label — the editor's "not shown on the dashboard" state. */
    untracked?: boolean;
    /** Render as a whole-card <label> toggle rather than a plain <div>. */
    toggle?: boolean;
    /** Top-right control (e.g. the visibility checkbox), rendered in the label row. */
    control?: Snippet;
    /** The card body below the label — value/bar (modal) or allowance (editor). */
    children: Snippet;
  } = $props();
</script>

<svelte:element
  this={toggle ? "label" : "div"}
  class="nutrient-card {rowKey ? `nutrient-${rowKey}` : ''}"
  class:untracked
  data-nutrient-row={rowKey}
>
  <span class="card-top">
    <span class="card-label">{label}</span>
    {#if control}{@render control()}{/if}
  </span>
  {@render children()}
</svelte:element>

<style>
  .nutrient-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-s);
    background: var(--food-surface-bg, #fff);
  }
  :global(label.nutrient-card) {
    cursor: pointer;
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2xs);
    min-height: 1.35em;
  }
  .card-label {
    font-size: clamp(0.62rem, 3.4cqi, var(--step-n1));
    font-weight: 700;
    line-height: 1.25;
    text-transform: uppercase;
    color: #000;
  }
  /* Not shown on the dashboard: mute the label so the tracked cards stand out. */
  .nutrient-card.untracked .card-label {
    color: var(--text-muted);
  }
</style>
