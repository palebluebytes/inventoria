<script lang="ts">
  import type { Snippet } from "svelte";

  // The one nutrient card both the full-day RDA modal (#42) and the Settings
  // target editor (#41) render, so the two surfaces are literally the same
  // component — a labelled tile (label on top, body below) that tiles into a
  // {@link NutrientCardGrid}. The body differs by surface (the modal shows a
  // value/target + fill bar; the editor an allowance input) and is passed as
  // `children`; only the shell — padding, surface, label, tracked state — lives
  // here.
  //
  // With `toggle`, the WHOLE card is the visibility toggle: it renders as a
  // <label> around a visually-hidden checkbox, so a click (or Space) anywhere on
  // the card flips `tracked` — there is no separate visible control. A <label>
  // ignores clicks on its interactive descendants, so a target input / reset in
  // the body stays independently editable and never flips the toggle. `tracked`
  // drives the visual state (a muted label when off). Without `toggle` the card is
  // an inert <div> (the read-only modal, and the always-on Calories card).
  let {
    label,
    rowKey = undefined,
    toggle = false,
    tracked = false,
    onToggle = undefined,
    children,
  }: {
    label: string;
    /** `data-nutrient-row` hook for tests / per-nutrient styling. */
    rowKey?: string;
    /** Render the whole card as a visibility toggle (a <label>). */
    toggle?: boolean;
    /** Whether the nutrient is shown on the dashboard — drives the visual state. */
    tracked?: boolean;
    /** Fired when the card (as a toggle) is clicked/keyed. */
    onToggle?: () => void;
    /** The card body below the label — value/bar (modal) or allowance (editor). */
    children: Snippet;
  } = $props();
</script>

<svelte:element
  this={toggle ? "label" : "div"}
  class="nutrient-card {rowKey ? `nutrient-${rowKey}` : ''}"
  class:toggleable={toggle}
  class:tracked
  class:untracked={toggle && !tracked}
  data-nutrient-row={rowKey}
>
  {#if toggle}
    <!-- Visually hidden, but a real (focusable, announced) checkbox — the <label>
         above makes the whole card its click target. -->
    <input
      type="checkbox"
      class="card-toggle"
      data-nutrient={rowKey}
      checked={tracked}
      onchange={onToggle}
      aria-label="Show {label} on the dashboard"
    />
  {/if}
  <span class="card-top">
    <span class="card-label">{label}</span>
  </span>
  {@render children()}
</svelte:element>

<style>
  .nutrient-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-s);
    background: var(--food-surface-bg, var(--paper));
  }
  .nutrient-card.toggleable {
    cursor: pointer;
  }
  /* Tracked / shown on the dashboard: a pale acid-green fill — the app's
     "on/positive" colour (--green-bg) — so a tracked card reads as clearly active,
     not just by its darker label. Includes the always-on Calories card. Off cards
     stay white; a grey wash on hover hints a toggleable one will flip on. */
  .nutrient-card.tracked {
    background: color-mix(in srgb, var(--green-bg) 40%, var(--paper));
  }
  .nutrient-card.toggleable.tracked:hover {
    background: color-mix(in srgb, var(--green-bg) 55%, var(--paper));
  }
  .nutrient-card.toggleable.untracked:hover {
    background: var(--track, var(--bg-input));
  }
  /* The toggle checkbox stays a real (focusable, announced, test-driveable)
     control, but is invisible — the surrounding <label> is the visible target, so
     a click anywhere on the card flips it. Kept full-opacity-0 (not clipped) so it
     still has a hit region for keyboard/automation. */
  .card-toggle {
    position: absolute;
    top: var(--space-xs);
    right: var(--space-s);
    width: 1.2em;
    height: 1.2em;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .nutrient-card:has(.card-toggle:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
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
    color: var(--ink);
  }
  /* Not shown on the dashboard: mute the label so tracked cards stand out. */
  .nutrient-card.untracked .card-label {
    color: var(--text-muted);
  }
</style>
