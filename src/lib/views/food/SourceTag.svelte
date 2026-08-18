<script lang="ts">
  import type { FoodSourceKind, FoodSourceView } from "../../food/food-source";

  // The source tag (ADR-0043 §2): where a food's numbers came from — ◆ OFF /
  // ◆ USDA / ◆ Recipe / ✎ Manual — read off the twin by the pure
  // `foodSourceView`. Extracted from the staged card so the dashboard's
  // edit-amount sheet shows the same mark on an already-logged food: the
  // question "how far do I trust this panel?" is the same question there.
  //
  // Tapping emits `onExplain` with the origin kind, the seam SourceExplainerSheet
  // hooks into; without it the tag renders as a passive label (still shown —
  // every food has an origin, so this tag is never absent).
  let {
    source,
    onExplain,
  }: {
    source: FoodSourceView;
    onExplain?: (kind: FoodSourceKind) => void;
  } = $props();
</script>

{#if onExplain}
  <button
    type="button"
    class="tag"
    data-testid="source-tag"
    data-kind={source.kind}
    aria-label={`Source: ${source.label}. Tap for details`}
    title={`Source: ${source.label}`}
    onclick={() => onExplain(source.kind)}
  >
    <span class="tag-icon" aria-hidden="true">{source.icon}</span>{source.label}
  </button>
{:else}
  <span
    class="tag"
    data-testid="source-tag"
    data-kind={source.kind}
    aria-label={`Source: ${source.label}`}
    title={`Source: ${source.label}`}
  >
    <span class="tag-icon" aria-hidden="true">{source.icon}</span>{source.label}
  </span>
{/if}

<style>
  /* A quiet mark, not a button-sized chip: thin edge, no offset shadow, tight
     padding. It is provenance you glance at, so it stays subordinate to the food
     name it sits above — the NOVA badge carries the same measurements so the two
     read as one row of marks. The press feedback is the whole affordance. */
  .tag {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-family: inherit;
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    background: var(--paper);
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: 0.2rem 0.36rem;
    white-space: nowrap;
    transition: transform 0.06s ease;
  }
  button.tag {
    cursor: pointer;
  }
  button.tag:hover {
    color: var(--ink);
  }
  button.tag:active {
    transform: translate(1px, 1px);
  }
  button.tag:focus-visible {
    outline: var(--edge);
    outline-offset: 2px;
  }
  /* The leading origin glyph (◆ / ✎) is em-centred and reads low beside all-caps
     text, so lift it a hair onto the caps' optical centre. */
  .tag-icon {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    transform: translateY(-0.08em);
  }
</style>
