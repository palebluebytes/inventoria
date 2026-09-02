<script lang="ts">
  import type { Snippet } from "svelte";

  // The one commit button for the food-addition flows: a full-width lime CTA
  // pinned at the bottom of every sheet that logs food onto a day (Search, Scan,
  // Custom/label, Manual entry, Recipe instantiate/define) plus the recipe-builder
  // sub-sheets. It is style-only — the label (children) and behaviour stay with
  // each flow — so the whole system speaks one visual language from one source
  // rather than four copy-pasted `.primary`/`.save`/`.mini-save`/`.done` blocks.
  let {
    id = undefined,
    testid = undefined,
    disabled = false,
    type = "button",
    onclick,
    children,
  }: {
    id?: string;
    /** Optional data-testid, so flows that pinned a selector keep it. */
    testid?: string;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button class="commit" {id} data-testid={testid} {type} {disabled} {onclick}>
  {@render children?.()}
</button>

<style>
  /* Written mobile-first: this is the phone, and 768px is the override.
     A one-word button was ~64px — a whole result row of the scarcest space on
     the screen, taken from the only region ADR-0089 §8 lets give any up. The
     smaller pair lands it near 51px, still clear of `--tap-min`, which is the
     floor a finger sets and so the only honest `min-height` here. */
  .commit {
    width: 100%;
    background: var(--green-bg);
    color: var(--ink);
    border: var(--edge-thick);
    padding: var(--space-xs);
    font-family: inherit;
    font-size: var(--step-0);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: var(--tap-min);
    /* Pin the line box so the button is the same height for every label — a
       fullwidth glyph like "＋" would otherwise inflate `normal` line-height and
       make the Recipe tab's button taller than the others, shifting the dock. */
    line-height: 1;
  }
  /* Above 768px the room is there and the keyboard does not eat the screen, so
     the button returns to its full size. One design that widens (ADR-0089 §5). */
  @media (min-width: 768px) {
    .commit {
      padding: var(--space-s);
      font-size: var(--step-1);
      min-height: 60px;
    }
  }
  .commit:active:not(:disabled) {
    transform: scale(0.98);
  }
  .commit:disabled {
    background: var(--border);
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
</style>
