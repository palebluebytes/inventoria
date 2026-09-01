<script lang="ts">
  import type { Snippet } from "svelte";
  import WayInIcon from "./WayInIcon.svelte";
  import SelectionVerbIcon from "./SelectionVerbIcon.svelte";

  // The Selection bar (ADR-0088 §2): the strip a long-press raises at the foot
  // of the Food screen. `✕ · N selected › · [scale][move][recipe]`.
  //
  // Three rules here are load-bearing rather than stylistic:
  //
  //   The ✕ leads. It is first in flow order, so neither a long count nor a
  //   status line can wrap the only exit off the bar — which matters because
  //   the bar deliberately covers the tab bar and IS the way out of the mode.
  //
  //   The count is a control, not a label. It opens the Selection's nutrition
  //   panel, where the Way out lives, which is why the bar carries no share
  //   verb of its own (§9).
  //
  //   The verbs are drawn marks, not words. Labelled verbs were measured and
  //   do not fit at 360px, where the space scale bottoms out. Recipe is
  //   `WayInIcon kind="recipe"` verbatim, which retired the 🍲 the bar carried.
  //
  // `tier` is the Scale expansion (§5). It renders above the main row so the ✕
  // and the count stay on screen while it is open.
  let {
    count,
    note = "",
    scaleOpen = false,
    onDismiss,
    onCount,
    onScale,
    onMove,
    onRecipe,
    tier,
  }: {
    /** How many foods are selected. The bar is not rendered at zero. */
    count: number;
    /** The one status line every verb shares. Empty on success (§2). */
    note?: string;
    /** Whether the Scale tier is open, so its verb can show as active. */
    scaleOpen?: boolean;
    onDismiss: () => void;
    onCount: () => void;
    onScale: () => void;
    onMove: () => void;
    onRecipe: () => void;
    tier?: Snippet;
  } = $props();
</script>

<div class="selbar">
  {#if tier}{@render tier()}{/if}

  <div class="sb-main">
    <button
      type="button"
      class="sb-dismiss"
      data-testid="selection-dismiss"
      aria-label="Leave selection"
      onclick={onDismiss}>✕</button
    >

    <button
      type="button"
      class="sb-count"
      data-testid="selection-count"
      aria-haspopup="dialog"
      aria-label="Show what these {count} foods add up to"
      onclick={onCount}
      >{count} selected<span class="chev" aria-hidden="true">›</span></button
    >

    <span class="sb-verbs">
      <button
        type="button"
        class="sb-verb"
        class:active={scaleOpen}
        data-testid="selection-scale"
        aria-pressed={scaleOpen}
        aria-label="Scale these foods"
        onclick={onScale}><SelectionVerbIcon kind="scale" /></button
      >
      <button
        type="button"
        class="sb-verb"
        data-testid="selection-move"
        aria-label="Move these foods to another meal"
        onclick={onMove}><SelectionVerbIcon kind="move" /></button
      >
      <!-- The id is a shipped DOM contract: the recipe e2e locates it. -->
      <button
        type="button"
        class="sb-verb primary"
        id="build-recipe-btn"
        data-testid="selection-recipe"
        aria-label="Build a recipe from these foods"
        onclick={onRecipe}><WayInIcon kind="recipe" /></button
      >
    </span>

    {#if note}
      <span class="sb-note" role="status">{note}</span>
    {/if}
  </div>
</div>

<style>
  .selbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    /* Above the Sidebar's 100: a Selection is a mode and owns the foot of the
       screen while it is live (ADR-0088 §3). */
    z-index: 900;
    display: flex;
    flex-direction: column;
    background: var(--ink);
    color: var(--paper);
    animation: slideUp 0.2s var(--ease-snap);
  }

  .sb-main {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    padding: var(--space-s);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
  }

  .sb-dismiss {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    /* Pulled back into the bar's own padding so the mark sits on the margin
       the rows above use, while keeping a full 44px target. */
    margin-left: calc(var(--space-s) * -1 + var(--space-3xs));
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: none;
    color: var(--paper);
    font-family: inherit;
    font-size: var(--step-1);
    line-height: 1;
    cursor: pointer;
  }

  .sb-count {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-3xs);
    min-height: 2.75rem;
    padding: var(--space-3xs) 0;
    background: none;
    border: none;
    /* The one mark saying this is a door and not a caption. */
    border-bottom: 2px solid var(--paper);
    color: var(--paper);
    font-family: inherit;
    font-size: var(--step-n1);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .chev {
    font-size: var(--step-n2);
  }

  .sb-verbs {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    margin-left: auto;
  }

  .sb-verb {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: var(--edge-thin);
    border-color: var(--paper);
    color: var(--paper);
    cursor: pointer;
  }

  .sb-verb.active {
    background: var(--paper);
    color: var(--ink);
  }

  .sb-verb.primary {
    background: var(--green-bg);
    border-color: var(--green-bg);
    color: var(--ink);
  }

  .sb-note {
    flex-basis: 100%;
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--green-bg);
  }

  .selbar :global(button:focus-visible) {
    outline: 2px solid var(--green-bg);
    outline-offset: -3px;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .selbar {
      animation: none;
    }
  }
</style>
