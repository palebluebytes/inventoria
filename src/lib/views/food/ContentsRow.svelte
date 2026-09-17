<script lang="ts">
  // One occasion spelled out: a head that dates it with a figure opposite, and
  // a line per thing in it with its amount. What is on offer is legible without
  // a second tap, which is the whole of ADR-0058 §12's row and what ADR-0110 §6
  // inherits when it puts impromptu dishes on the Recipes screen.
  //
  // Data rather than snippets, deliberately. The two lists differ in what they
  // put opposite the date (a meal's kcal; the meal a dish was made at) and in
  // what a tap does, and in nothing else — so the head and line layout live here
  // once instead of being restated wherever a caller filled a slot.
  let {
    head,
    trailing,
    lines,
    onclick,
    ariaLabel,
  }: {
    /** The row's date line — `dayLabel`, on both surfaces. */
    head: string;
    /** What sits opposite it: the meal's total, or the meal it was made at. */
    trailing: string;
    /** One per thing in it: what it was, and how much. */
    lines: { id: string; label: string; amount: string }[];
    onclick: () => void;
    /**
     * The button's accessible name, where the row's own text is the wrong one.
     * Omitted, the contents are the name — which is right for a row whose
     * contents ARE what it is, and wrong for one whose verb is the point.
     */
    ariaLabel?: string;
  } = $props();
</script>

<button type="button" class="contents-row" {onclick} aria-label={ariaLabel}>
  <span class="cr-head">
    <span class="cr-date">{head}</span>
    <span class="cr-trailing">{trailing}</span>
  </span>
  <span class="cr-lines">
    {#each lines as line (line.id)}
      <span class="cr-line">
        <span>{line.label}</span>
        <span class="cr-amount">{line.amount}</span>
      </span>
    {/each}
  </span>
</button>

<style>
  .contents-row {
    min-height: var(--tap-min);
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    width: 100%;
    padding: var(--space-xs);
    font: inherit;
    text-align: left;
    color: var(--ink);
    background: var(--paper);
    border: var(--edge);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    cursor: pointer;
  }
  .contents-row:active {
    box-shadow: none;
    transform: translate(1px, 1px);
  }
  .contents-row:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .cr-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2xs);
  }
  .cr-date {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .cr-trailing {
    font-size: var(--step-n2);
    font-weight: 700;
  }
  .cr-lines {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding-top: var(--space-3xs);
    border-top: var(--edge-thin);
  }
  .cr-line {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .cr-amount {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
