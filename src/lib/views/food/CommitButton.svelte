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
  .commit {
    width: 100%;
    background: #ccff00;
    color: #000;
    border: var(--edge-thick);
    padding: var(--space-s);
    font-family: inherit;
    font-size: var(--step-1);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 60px;
    /* Pin the line box so the button is the same height for every label — a
       fullwidth glyph like "＋" would otherwise inflate `normal` line-height and
       make the Recipe tab's button taller than the others, shifting the dock. */
    line-height: 1;
  }
  .commit:active:not(:disabled) {
    transform: scale(0.98);
  }
  .commit:disabled {
    background: #e4e4e7;
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
</style>
