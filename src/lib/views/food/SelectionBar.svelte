<script lang="ts">
  import type { Snippet } from "svelte";
  import WayInIcon from "./WayInIcon.svelte";
  import WayOutIcon from "./WayOutIcon.svelte";
  import SelectionVerbIcon from "./SelectionVerbIcon.svelte";

  // The Selection bar (ADR-0088 §2): the strip a long-press raises at the foot
  // of the Food screen. `✕ · [scale][move][hand off][recipe]`.
  //
  // Three rules here are load-bearing rather than stylistic:
  //
  //   The ✕ leads. It is first in flow order, so neither a verb nor a status
  //   line can wrap the only exit off the bar — which matters because the bar
  //   deliberately covers the tab bar and IS the way out of the mode.
  //
  //   The bar says nothing. It carried an `N selected ›` control, which was
  //   both the count and the door to the Selection's panel; the rows already
  //   say which foods are picked, and a bar of verbs does not need to restate
  //   it. The door it was became a verb of its own — see the Amendment to §9.
  //
  //   The verbs are drawn marks, not words. Labelled verbs were measured and
  //   do not fit at 360px, where the space scale bottoms out. Recipe is
  //   `WayInIcon kind="recipe"` verbatim, which retired the 🍲 the bar carried,
  //   and the hand-off is `WayOutIcon` verbatim for the same reason: a
  //   Selection's Way out is the day's Way out at a third scale (ADR-0084).
  //
  // `tier` is the Scale expansion (§5). It renders above the main row so the ✕
  // and the verbs stay on screen while it is open.
  let {
    count,
    note = "",
    scaleOpen = false,
    onDismiss,
    onHandOff,
    onScale,
    onMove,
    onRecipe,
    tier,
  }: {
    /**
     * How many foods are selected. The bar is not rendered at zero, and never
     * draws this — it is what the verbs name themselves by, so a screen reader
     * still hears the size of what it is about to act on.
     */
    count: number;
    /** The one status line every verb shares. Empty on success (§2). */
    note?: string;
    /** Whether the Scale tier is open, so its verb can show as active. */
    scaleOpen?: boolean;
    onDismiss: () => void;
    onHandOff: () => void;
    onScale: () => void;
    onMove: () => void;
    onRecipe: () => void;
    tier?: Snippet;
  } = $props();

  // The same phrasing the move sheet uses, so the two never disagree.
  const subject = $derived(count === 1 ? "this food" : `these ${count} foods`);
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

    <span class="sb-verbs">
      <button
        type="button"
        class="sb-verb"
        class:active={scaleOpen}
        data-testid="selection-scale"
        aria-pressed={scaleOpen}
        aria-label="Scale {subject}"
        onclick={onScale}><SelectionVerbIcon kind="scale" /></button
      >
      <button
        type="button"
        class="sb-verb"
        data-testid="selection-move"
        aria-label="Move {subject} to another meal"
        onclick={onMove}><SelectionVerbIcon kind="move" /></button
      >
      <!-- Opens the Selection's panel, where the Way out and what these foods
           add up to both live. It replaced the `N selected ›` control that used
           to be the only door to it. -->
      <button
        type="button"
        class="sb-verb"
        data-testid="selection-hand-off"
        aria-haspopup="dialog"
        aria-label="Hand over {subject}"
        onclick={onHandOff}><WayOutIcon /></button
      >
      <!-- The id is a shipped DOM contract: the recipe e2e locates it. -->
      <button
        type="button"
        class="sb-verb primary"
        id="build-recipe-btn"
        data-testid="selection-recipe"
        aria-label="Build a recipe from {subject}"
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
