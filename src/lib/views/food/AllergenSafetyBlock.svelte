<script lang="ts">
  import Disclosure from "../../ui/Disclosure.svelte";
  import type { AllergenVerdict } from "../../food/off-signals";
  import { allergenBlockView } from "../../food/allergen-block";
  import {
    ensureTaxonomy,
    resolveTag,
    type TaxonomyKind,
  } from "../../food/off-taxonomy";

  // The allergen SAFETY block (ADR-0043 §3, #104) — a static block below the
  // quantity row, NOT a tap-through tag (allergens are safety-critical, so the
  // information is always in view rather than a tap away). A dumb renderer of the
  // already-ordered `deriveAllergenVerdict` output (via `allergenBlockView`, which
  // narrows Free-from to declared allergen claims): three precedence-ordered
  // groups — Contains › May-contain › Free-from — each allergen on its own line.
  //
  // One hard rule the ADR bakes in: **surface only what is positively present;
  // never infer allergen-freeness from absence.** When OFF carries no allergen /
  // traces / free-from data at all, the block is silent (renders nothing) — there
  // is no "not rated" state. The mandatory disclaimer behind the (i) toggle makes
  // the honest reading explicit: an empty allergens list means "none found in the
  // parsed ingredients", NOT "allergen-free" (research/95 §6).
  let {
    verdict,
  }: {
    /** The staged food's allergen verdict from `deriveAllergenVerdict` (§4). */
    verdict: AllergenVerdict;
  } = $props();

  // Apply the render-layer Free-from narrowing; may degrade to "absent".
  let view = $derived(allergenBlockView(verdict));

  // The three precedence-ordered lines as one structure — label, its taxonomy,
  // and the raw `en:` tags — so the resolver and the markup iterate ONE list
  // rather than three copy-pasted triples. Non-empty lines only. Contains /
  // May-contain resolve against the allergens taxonomy; Free-from claims
  // (`en:no-gluten`, …) live in the labels taxonomy.
  let lines = $derived(
    view.state === "present"
      ? (
          [
            {
              key: "contains",
              label: "Contains",
              kind: "allergens",
              tags: view.contains,
            },
            {
              key: "may",
              label: "May contain",
              kind: "allergens",
              tags: view.mayContain,
            },
            {
              key: "free",
              label: "Free from",
              kind: "labels",
              tags: view.freeFrom,
            },
          ] as const satisfies readonly {
            key: string;
            label: string;
            kind: TaxonomyKind;
            tags: string[];
          }[]
        ).filter((line) => line.tags.length > 0)
      : []
  );

  // A reactive tick bumped once each needed taxonomy finishes loading, so the
  // resolved names recompute from the freshly-populated cache (`resolveTag` is a
  // plain sync read Svelte can't otherwise observe — the NovaExplainer pattern).
  // Until then (or if the fetch fails) names fall back to prettified slugs, so a
  // missing taxonomy NEVER blanks a safety line.
  let taxonomyTick = $state(0);
  $effect(() => {
    for (const kind of new Set(lines.map((line) => line.kind))) {
      void ensureTaxonomy(kind).then(() => taxonomyTick++);
    }
  });

  // Each line's tags zipped to their display names — one object per allergen, so
  // the markup keys and reads from a single list (no index-aligned parallel array).
  let resolvedLines = $derived.by(() => {
    taxonomyTick;
    return lines.map((line) => ({
      key: line.key,
      label: line.label,
      items: line.tags.map((tag) => ({
        tag,
        name: resolveTag(line.kind, tag),
      })),
    }));
  });

  // The disclaimer is tucked behind the (i) toggle (like the nutrition-editor's
  // section help), so the block leads with the allergens themselves.
  let showDisclaimer = $state(false);
</script>

{#if view.state === "present"}
  <section class="allergens" data-testid="allergen-block">
    <div class="allergen-head">
      <h4 class="allergen-title">Allergens</h4>
      <!-- Mandatory disclaimer (ADR-0043 §3), tucked behind this ⓘ: an empty
           allergens list is "none found in the parsed ingredients", not
           "allergen-free" — so the honest caveat is always one tap away. -->
      <Disclosure
        class="info-open"
        data-testid="allergen-disclaimer-toggle"
        open={showDisclaimer}
        controls="allergen-disclaimer"
        aria-label="How this allergen reading is made"
        onToggle={() => (showDisclaimer = !showDisclaimer)}
      >
        {#snippet mark()}<span class="info-mark">i</span>{/snippet}
      </Disclosure>
    </div>
    <p
      id="allergen-disclaimer"
      class="allergen-disclaimer"
      role="note"
      hidden={!showDisclaimer}
    >
      This is <strong>Open Food Facts' reading of the ingredients</strong>, not
      a verdict this app makes — always check the packaging. A missing allergen
      means none was found in the parsed ingredients, not that the food is free
      from it.
    </p>

    <!-- Contains › May-contain › Free-from, in precedence order (§3). May-contain
         is a DISTINCT line ("may contain" ≠ "contains"); Free-from is declared
         `en:no-*` claims ONLY, never synthesised from an empty allergens list. -->
    {#each resolvedLines as line (line.key)}
      <div class="allergen-group" data-line={line.key}>
        <span class="allergen-label">{line.label}</span>
        <ul class="allergen-list">
          {#each line.items as item (item.tag)}
            <li>{item.name}</li>
          {/each}
        </ul>
      </div>
    {/each}
  </section>
{/if}

<style>
  /* A framed safety block, set apart from the amount panel above it so it reads
     as its own always-present statement rather than an inline mark. The heavier
     edge + hard offset shadow (prototype #97) mark it as the card's one safety
     statement, distinct from the lighter nutrient rows. */
  .allergens {
    margin-top: var(--space-s);
    padding: var(--space-s);
    border: var(--edge-thick);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    background: var(--paper);
  }
  .allergen-head {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .allergen-title {
    margin: 0;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink);
  }
  /* The disclaimer ⓘ — the nutrition-editor's small circular black-bordered "i"
     idiom (a lowercase italic serif "i" reads as the info glyph). */
  /* The ⓘ ring, drawn by the mark rather than by the button around it.

     Before #316 this was a `::before` on the button, because ADR-0098 §3's
     recipe is what a control drawing its own mark in CSS has to do: the box
     carries the floor, the pseudo-element draws the 1.35rem circle, and hover
     and focus relocate onto it. `ui/Disclosure` carries the floor now and takes
     a `mark` snippet, so the mark can simply *be* an element — which is also
     what keeps this rule scoped. Anchoring the old class under `:global` to
     reach a component put a 21.6px width on a box that takes a tap, and
     `tap-floor.test.ts` convicted it, correctly: a sweep cannot tell a ring
     drawn inside a floored box from a control shrunk by a rule reaching across
     a component. */
  .info-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.35rem;
    height: 1.35rem;
    border: 2px solid currentColor;
    border-radius: 50%;
    color: var(--ink);
    font-family: var(--font-serif);
    font-size: var(--step-n1);
    font-weight: 700;
    font-style: italic;
    line-height: 1;
  }
  /* The whole floored button inverts the ring, not the 21.6px ring itself, so
     the hover target is the thing a finger can actually land on. The mark is
     this file's element and carries its scoping hash; the button is
     `ui/Disclosure`'s and wears the class as a prop, so only that half goes
     through `:global`. */
  .allergen-head :global(.info-open:hover .info-mark) {
    background: var(--ink);
    color: var(--paper);
  }
  /* `hidden` collapses it, and the attribute is what the trigger's
     `aria-expanded` describes — so it leaves the accessibility tree with it.
     It was an `{#if}` before #316, which `aria-expanded` cannot describe. */
  .allergen-disclaimer[hidden] {
    display: none;
  }
  .allergen-disclaimer {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n1);
    line-height: 1.45;
    color: var(--text-secondary);
  }
  .allergen-group {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2xs) var(--space-xs);
    margin-top: var(--space-xs);
  }
  .allergen-label {
    flex: 0 0 auto;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  /* Precedence read at a glance (prototype #97): the "Contains" label is red,
     and the whole "Free from" line reads green. May-contain stays ink. */
  .allergen-group[data-line="contains"] .allergen-label {
    color: var(--red-text);
  }
  .allergen-group[data-line="free"] .allergen-label,
  .allergen-group[data-line="free"] .allergen-list {
    color: var(--green-text);
  }
  /* One allergen per line (ADR-0043 §3) — a stacked list, never a comma-jammed
     run, so each surfaced allergen is read on its own. */
  .allergen-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: var(--step-n1);
    line-height: 1.35;
    color: var(--ink);
  }
</style>
