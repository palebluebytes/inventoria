<script lang="ts">
  import type { NovaVerdict } from "../../food/nova-verdict";
  import { novaBadgeView } from "../../food/nova-badge";

  // The word-first NOVA processing badge (ADR-0041 §1, §2, ticket B/#91). A thin
  // skin over the pure `novaBadgeView` presentation model: it leads with a
  // plain-language word (Unprocessed · Ingredient · Processed · Ultra-processed),
  // carries the numeral in a small tier pip, and is colour-weighted by tone —
  // lime → pale-lime → amber → the lone red caution on tier 4. Everything unrated
  // wears the same quiet, greyed "— not rated"; it is never a warning and never
  // silent (§2). The inferred NOVA-1 `·est` state (reserved for #93) draws a
  // visually distinct dashed edge + "est" tag so it can never pose as OFF's
  // authoritative rating (§3).
  //
  // Tapping the badge emits `onExplain` — the seam the explainer sheet (#92) hooks
  // into. This component owns only the badge; #92 owns the sheet contents. When no
  // `onExplain` is given the badge renders as a passive label (still always shown).
  let {
    verdict,
    onExplain,
  }: {
    /** The food's NOVA verdict from `deriveNovaVerdict(payload)` (ADR-0041 §4). */
    verdict: NovaVerdict;
    /** Tap-through intent — the explainer handoff seam (#92). Omit for a passive
     *  label. */
    onExplain?: () => void;
  } = $props();

  let view = $derived(novaBadgeView(verdict));
  // The pip carries the tier numeral; unrated has none, so it shows an em dash —
  // giving the neutral badge its "— not rated" reading (ADR-0041 §2).
  let pip = $derived(view.tier == null ? "—" : String(view.tier));
  let label = $derived(
    view.tone === "not-rated"
      ? "NOVA processing: not rated"
      : `NOVA processing: ${view.word}${view.estimated ? " (estimated)" : ""}`
  );
</script>

{#if onExplain}
  <button
    type="button"
    class="nova-badge"
    class:est={view.estimated}
    data-tone={view.tone}
    data-testid="nova-badge"
    aria-label={`${label}. Tap for details`}
    title={label}
    onclick={onExplain}
  >
    <span class="pip" aria-hidden="true">{pip}</span>
    <span class="word">{view.word}</span>
    {#if view.estimated}<span class="est-tag" aria-hidden="true">est</span>{/if}
  </button>
{:else}
  <span
    class="nova-badge"
    class:est={view.estimated}
    data-tone={view.tone}
    data-testid="nova-badge"
    aria-label={label}
    title={label}
  >
    <span class="pip" aria-hidden="true">{pip}</span>
    <span class="word">{view.word}</span>
    {#if view.estimated}<span class="est-tag" aria-hidden="true">est</span>{/if}
  </span>
{/if}

<style>
  /* A brutalist chip: ink edge + hard offset shadow that presses on tap (matching
     the origin badge's idiom, §5). The tone is a background fill only; foreground
     stays ink, per the ADR-0003 palette amendment. */
  .nova-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.34em;
    font-family: inherit;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    color: var(--ink);
    background: var(--paper);
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: 0.3rem 0.5rem;
    white-space: nowrap;
    box-shadow: var(--shadow-1);
    transition:
      box-shadow 0.06s ease,
      transform 0.06s ease;
  }
  button.nova-badge {
    cursor: pointer;
  }
  button.nova-badge:hover {
    box-shadow: var(--shadow-2);
    transform: translate(-1px, -1px);
  }
  button.nova-badge:active {
    box-shadow: none;
    transform: translate(2px, 2px);
  }
  button.nova-badge:focus-visible {
    outline: var(--edge);
    outline-offset: 2px;
  }

  /* Colour weights (ADR-0041 §1) — lime → pale-lime → amber → red caution. */
  .nova-badge[data-tone="unprocessed"] {
    background: var(--green-bg);
  }
  .nova-badge[data-tone="ingredient"] {
    background: color-mix(in srgb, var(--green-bg) 45%, var(--paper));
  }
  .nova-badge[data-tone="processed"] {
    background: var(--amber-bg);
  }
  .nova-badge[data-tone="ultra"] {
    background: var(--red-bg);
  }
  /* Not rated (ADR-0041 §2) — a quiet, greyed chip: no fill, muted ink, no
     shadow, so it reads as an honest coverage statement, never a caution. */
  .nova-badge[data-tone="not-rated"] {
    background: var(--paper);
    color: var(--text-muted);
    box-shadow: none;
  }
  .nova-badge[data-tone="not-rated"]:hover {
    box-shadow: none;
    transform: none;
  }

  /* The tier pip carries the numeral (or the em dash when unrated). */
  .pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.15em;
    height: 1.15em;
    padding: 0 0.2em;
    border: var(--edge-thin);
    border-radius: var(--radius);
    font-size: 0.82em;
    background: var(--paper);
  }
  .nova-badge[data-tone="not-rated"] .pip {
    border-color: var(--text-muted);
  }

  /* Inferred `·est` (ADR-0041 §3) — visually distinct: a dashed edge + an "est"
     tag, so an estimate never poses as OFF's authoritative rating. */
  .nova-badge.est {
    border-style: dashed;
  }
  .est-tag {
    font-size: 0.72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0 0.28em;
    border: 1px dashed var(--ink);
    border-radius: var(--radius);
  }
</style>
