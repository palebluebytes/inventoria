<script lang="ts">
  import type { DietaryVerdict } from "../../food/off-signals";
  import { dietaryTagsView } from "../../food/dietary-tag";
  import ExplainerSheet from "./ExplainerSheet.svelte";

  // The dietary explainer (ADR-0043 §2, ticket B/#103) — the tap-through sheet a
  // dietary tag hands its verdict to. One house `BottomSheet`: it lists each
  // present claim with its placeholder glyph + short form and a one-line gloss,
  // then the load-bearing caveat — these are the PACK's own on-label claims, read
  // back from Open Food Facts, NOT a verdict this app makes.
  //
  // Conditionally mounted by FoodStager off a `dietaryExplain` state, closed via
  // `onClose` → null, mirroring the NOVA / source explainer seams.
  let {
    verdict,
    onClose,
  }: {
    /** The tapped food's dietary verdict from `deriveDietaryVerdict` (§4). */
    verdict: DietaryVerdict;
    /** Dismiss — the surface clears its `dietaryExplain` back to null. */
    onClose: () => void;
  } = $props();

  let tags = $derived(dietaryTagsView(verdict));

  // A one-line gloss per claim, keyed off the `en:` tag the view carries.
  const GLOSS: Record<string, string> = {
    "en:vegan": "No animal-derived ingredients.",
    "en:vegetarian": "No meat or fish.",
    "en:organic": "Certified organically farmed.",
  };
</script>

<ExplainerSheet title="Dietary labels" class="dietary-explainer" {onClose}>
  <ul class="claims">
    {#each tags as tag (tag.tag)}
      <li class="claim">
        <!-- Placeholder glyph — real iconography is settled by research #100. -->
        <span class="claim-glyph" aria-hidden="true">{tag.glyph}</span>
        <div class="claim-text">
          <span class="claim-word">{tag.shortForm}</span>
          <span class="claim-gloss">{GLOSS[tag.tag] ?? ""}</span>
        </div>
      </li>
    {/each}
  </ul>

  <!-- The load-bearing caveat (ADR-0043 §2): these ride the pack, not our judgement. -->
  <p class="caveat">
    These are the <strong>label's own claims</strong>, read back from Open Food
    Facts — not a verdict this app makes. Check the packaging if a claim matters
    for you.
  </p>
</ExplainerSheet>

<style>
  .claims {
    list-style: none;
    margin: 0 0 var(--space-m);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .claim {
    display: flex;
    align-items: flex-start;
    gap: var(--space-s);
    padding: var(--space-s);
    border: var(--edge-thin);
    border-radius: var(--radius);
    background: var(--paper);
  }
  .claim-glyph {
    font-size: var(--step-1);
    line-height: 1;
    flex: 0 0 auto;
  }
  .claim-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .claim-word {
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--step-n1);
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  .claim-gloss {
    font-size: var(--step-n1);
    line-height: 1.35;
    color: var(--ink);
  }
  .caveat {
    margin: 0;
    padding-top: var(--space-s);
    border-top: var(--edge-thin);
    font-size: var(--step-n1);
    line-height: 1.45;
    color: var(--text-secondary);
  }
</style>
