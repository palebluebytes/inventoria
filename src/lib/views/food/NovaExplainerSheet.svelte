<script lang="ts">
  import type { NovaVerdict } from "../../food/nova-verdict";
  import { novaExplainerView } from "../../food/nova-explainer";
  import BottomSheet from "../../ui/BottomSheet.svelte";

  // The NOVA processing explainer (ADR-0041 §6, ticket C/#92) — the tap-through
  // sheet the badge (#91) hands its verdict to. One house `BottomSheet` with three
  // faces keyed off the verdict, all shaped by the pure `novaExplainerView`:
  //
  //  • rated    — the hero tier, the four-group scale, THIS product's evidence
  //               (additives + the `nova_group_debug` trail, degrading gracefully
  //               when a pre-#90 food carries neither), and visible ODbL
  //               attribution to Open Food Facts wherever OFF data is shown.
  //  • inferred — our own NOVA-1 read for a basic USDA whole food: hero + scale,
  //               no OFF evidence and no OFF attribution (it isn't OFF data).
  //  • not-rated— an honest coverage statement, never a safe/unsafe verdict.
  //
  // Conditionally mounted by each surface (FoodStager, FoodView) off a
  // `novaExplain` state and closed via `onClose` → that state back to null, so
  // this owns only the sheet body — the badge and its handoff seam are #91's.
  let {
    verdict,
    onClose,
  }: {
    /** The tapped verdict from `deriveNovaVerdict` (ADR-0041 §4), parked in the
     *  surface's `novaExplain` state. */
    verdict: NovaVerdict;
    /** Dismiss — the surface clears its `novaExplain` back to null. */
    onClose: () => void;
  } = $props();

  let view = $derived(novaExplainerView(verdict));
</script>

<!-- Elevated so it floats over the sheet the badge was tapped in (the log sheet in
     FoodStager, the amount sheet in FoodView), matching the reader/amount-sheet
     over-sheet precedent (ADR-0027/0028). -->
<BottomSheet
  isOpen
  elevated
  title="NOVA processing"
  class="nova-explainer"
  {onClose}
>
  {#if view.face === "not-rated"}
    <!-- Honest coverage, never a warning (ADR-0041 §2). -->
    <div class="hero" data-tone="not-rated">
      <span class="hero-pip" aria-hidden="true">—</span>
      <span class="hero-word">Not rated</span>
    </div>
    <p class="lead">
      There's no processing rating for this food. About 3 in 4 products aren't
      rated yet, and every food entered by hand starts here too.
    </p>
    <p class="note">
      This is a gap in the data, <strong>not</strong> a safe-or-unsafe verdict — an
      unrated food isn't a worse food.
    </p>
  {:else}
    <!-- rated + inferred share the hero + scale; only rated carries OFF evidence. -->
    <div class="hero" data-tone={view.tone}>
      <span class="hero-pip" aria-hidden="true">{view.tier}</span>
      <span class="hero-word">{view.word}</span>
    </div>

    {#if view.face === "inferred"}
      <p class="lead">
        A single basic whole food — a banana, an egg, plain rice — reads as
        <strong>NOVA 1 — Unprocessed</strong> on the four-group processing scale.
      </p>
    {:else}
      <p class="lead">
        Open Food Facts classifies this as <strong
          >NOVA {view.tier} — {view.word}</strong
        > on the four-group processing scale.
      </p>
    {/if}

    <!-- The static four-group NOVA scale (a public academic method — no OFF
         attribution owed on the scale itself), current tier marked. -->
    <ol class="scale">
      {#each view.scale as row (row.tier)}
        <li
          class="scale-row"
          data-tone={row.tone}
          class:current={row.tier === view.tier}
          aria-current={row.tier === view.tier ? "true" : undefined}
        >
          <span class="scale-pip" aria-hidden="true">{row.tier}</span>
          <div class="scale-text">
            <span class="scale-word">{row.word}</span>
            <span class="scale-blurb">{row.blurb}</span>
          </div>
        </li>
      {/each}
    </ol>

    {#if view.face === "rated"}
      <!-- This product's evidence (ADR-0041 §6/§7). Degrades gracefully: for a
           pre-#90 food carrying a tier but no trail, `present` is false and the
           section thins to a single honest line instead of empty headings. -->
      <section class="evidence" aria-label="Evidence for this product">
        <h3 class="evidence-head">Why this rating</h3>
        {#if view.evidence.present}
          {#if view.evidence.additives.length > 0}
            <div class="ev-block">
              <span class="ev-label">Additives flagged</span>
              <ul class="additives">
                {#each view.evidence.additives as e (e)}
                  <li class="additive">{e}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if view.evidence.debug}
            <div class="ev-block">
              <span class="ev-label">Open Food Facts' trail</span>
              <p class="ev-debug">{view.evidence.debug}</p>
            </div>
          {/if}
        {:else}
          <p class="ev-thin">
            Open Food Facts gave the tier but no detailed trail for this product
            — it was captured before we started keeping the evidence.
          </p>
        {/if}
      </section>

      <!-- ODbL attribution — required wherever OFF data is shown (#86, map §5). -->
      <p class="attribution">
        NOVA rating and additives from
        <strong>Open Food Facts</strong>, made available under the
        <span class="odbl">Open Database License (ODbL)</span>.
      </p>
    {/if}
  {/if}
</BottomSheet>

<style>
  /* The hero band — a big word-first restatement of the badge that opened the
     sheet, coloured by the same tone buckets (backgrounds only, ADR-0003 palette
     amendment; only tier 4 reads red/caution). */
  .hero {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-s) var(--space-m);
    border: var(--edge);
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: var(--shadow-2);
    margin-bottom: var(--space-m);
  }
  .hero-pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.35rem;
    border: var(--edge-thin);
    border-radius: var(--radius);
    background: var(--paper);
    font-size: var(--step-1);
    font-weight: 700;
    color: var(--ink);
  }
  .hero-word {
    font-size: var(--step-1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink);
  }

  /* Tone weights — the same lime → pale-lime → amber → red-caution ramp the badge
     wears (ADR-0041 §1); not-rated stays a quiet greyed chip (§2). */
  .hero[data-tone="unprocessed"],
  .scale-row[data-tone="unprocessed"] {
    background: var(--green-bg);
  }
  .hero[data-tone="ingredient"],
  .scale-row[data-tone="ingredient"] {
    background: color-mix(in srgb, var(--green-bg) 45%, var(--paper));
  }
  .hero[data-tone="processed"],
  .scale-row[data-tone="processed"] {
    background: var(--amber-bg);
  }
  .hero[data-tone="ultra"],
  .scale-row[data-tone="ultra"] {
    background: var(--red-bg);
  }
  .hero[data-tone="not-rated"] {
    background: var(--paper);
    box-shadow: none;
  }
  .hero[data-tone="not-rated"] .hero-word {
    color: var(--text-muted);
  }
  .hero[data-tone="not-rated"] .hero-pip {
    color: var(--text-muted);
    border-color: var(--text-muted);
  }

  .lead {
    margin: 0 0 var(--space-m);
    font-size: var(--step-0);
    line-height: 1.4;
    color: var(--ink);
  }
  .note {
    margin: 0 0 var(--space-m);
    font-size: var(--step-n1);
    line-height: 1.4;
    color: var(--text-secondary);
  }

  /* The four-group scale. The current tier is pulled out with a heavier edge +
     shadow; the others sit flat at reduced emphasis so the eye lands on this
     food's group. */
  .scale {
    list-style: none;
    margin: 0 0 var(--space-m);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .scale-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-s);
    padding: var(--space-s);
    border: var(--edge-thin);
    border-radius: var(--radius);
    opacity: 0.62;
  }
  .scale-row.current {
    border: var(--edge);
    box-shadow: var(--shadow-1);
    opacity: 1;
  }
  .scale-pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    border: var(--edge-thin);
    border-radius: var(--radius);
    background: var(--paper);
    font-weight: 700;
    color: var(--ink);
    flex: 0 0 auto;
  }
  .scale-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .scale-word {
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--step-n1);
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  .scale-blurb {
    font-size: var(--step-n1);
    line-height: 1.35;
    color: var(--ink);
  }

  /* Evidence — additives as E-number chips + the OFF debug trail; both thin out
     when absent (ADR-0041 §7). */
  .evidence {
    border-top: var(--edge);
    padding-top: var(--space-m);
    margin-bottom: var(--space-m);
  }
  .evidence-head {
    margin: 0 0 var(--space-s);
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  .ev-block {
    margin-bottom: var(--space-s);
  }
  .ev-label {
    display: block;
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .additives {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .additive {
    font-size: var(--step-n1);
    font-weight: 700;
    padding: 0.2rem 0.45rem;
    border: var(--edge-thin);
    border-radius: var(--radius);
    background: var(--paper);
    color: var(--ink);
    white-space: nowrap;
  }
  .ev-debug {
    margin: 0;
    font-size: var(--step-n1);
    line-height: 1.4;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .ev-thin {
    margin: 0;
    font-size: var(--step-n1);
    line-height: 1.4;
    color: var(--text-secondary);
  }

  /* ODbL attribution — quiet but visible, per the OFF licence (#86). */
  .attribution {
    margin: 0;
    padding-top: var(--space-s);
    border-top: var(--edge-thin);
    font-size: var(--step-n2);
    line-height: 1.4;
    color: var(--text-secondary);
  }
  .odbl {
    white-space: nowrap;
  }
</style>
