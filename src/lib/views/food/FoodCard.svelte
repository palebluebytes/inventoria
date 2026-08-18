<script lang="ts">
  import type { Snippet } from "svelte";
  import type { EntityPayload } from "../../ingestion/ingest";
  import type { NutritionInfo, Portion } from "../../food/nutrition";
  import { deriveNovaVerdict, type NovaVerdict } from "../../food/nova-verdict";
  import {
    deriveDietaryVerdict,
    deriveAllergenVerdict,
    type DietaryVerdict,
  } from "../../food/off-signals";
  import { dietaryTagsView } from "../../food/dietary-tag";
  import { foodSourceView, type FoodSourceKind } from "../../food/food-source";
  import FoodAmountPanel from "./FoodAmountPanel.svelte";
  import AllergenSafetyBlock from "./AllergenSafetyBlock.svelte";
  import NovaBadge from "./NovaBadge.svelte";
  import SourceTag from "./SourceTag.svelte";

  // ONE food card, whatever brought the user to it: the screen that stages a
  // food to add (FoodStager) and the screen that edits an already-logged one
  // (IngredientAmountSheet) are the same card, differing only in the sheet
  // header above them. Everything it shows derives from the twin `payload`, so
  // neither host re-derives a verdict, a tag or a brand of its own and the two
  // screens cannot drift apart again.
  //
  // Its parts, top to bottom: the corner tag cluster (origin · source · NOVA)
  // over the name, the meta row (brand · dietary marks), the caller's own
  // `beforeAmount` content, the shared amount panel, and the allergen block.
  //
  // Every explainer is a handoff: this owns the tappable marks, the host owns
  // the sheets they open (each callback carries what the sheet needs).
  let {
    payload,
    name,
    panel = undefined,
    portions = [],
    hydrating = false,
    grams = $bindable(100),
    onEdit,
    onExplainSource,
    onExplainNova,
    onExplainDietary,
    beforeAmount,
  }: {
    /** The food twin every mark on this card is read from. */
    payload: EntityPayload;
    /** Display name — the host's, since a logged event may carry its own. */
    name: string;
    /** The `nutrition/info` panel, per its own serving basis. */
    panel?: NutritionInfo;
    /** Household portions surfaced as picker chips (ADR-0030). */
    portions?: Portion[];
    /** True while a searched food's portions are still being fetched. */
    hydrating?: boolean;
    grams?: number;
    /**
     * Correct this food from its label. Drives the pencil origin badge, which
     * shows only for a twin that already carries a label capture (§7) — an
     * origin worth restating; omit where the host has no edit surface.
     */
    onEdit?: () => void;
    /** Tap-through on the source tag → the per-origin trust explainer. */
    onExplainSource?: (kind: FoodSourceKind) => void;
    /** Tap-through on the NOVA mark → the processing explainer (#92). */
    onExplainNova?: (verdict: NovaVerdict) => void;
    /** Tap-through on a dietary mark → the on-pack claims explainer. */
    onExplainDietary?: (verdict: DietaryVerdict) => void;
    /** Host content between the meta row and the amount panel (the staging
     *  screen's found-but-poor nudge). */
    beforeAmount?: Snippet;
  } = $props();

  // The origin badge (§7), driven purely by the PRESENCE of a
  // `food/label_capture` datom: "edited from label" when source provenance sits
  // beside it (a corrected `gtin:` twin), "your entry" when it stands alone (a
  // `food:custom_` mint). Advisory only — it never changes logging.
  let origin = $derived.by<null | "edited" | "your">(() => {
    const attrs = payload.attributes;
    if (!attrs?.["food/label_capture"]) return null;
    return attrs["twin/raw_provenance"] ? "edited" : "your";
  });

  // Where the food's data came from (ADR-0043 §2) — always present, so the tag
  // always shows.
  let source = $derived(foodSourceView(payload));
  // The NOVA processing verdict (ADR-0041 §4/§5), read back off the captured
  // `food/assessment` at render time — never a written attribute. `not-rated`
  // for a blank/non-OFF food, so a mark is always shown.
  let nova = $derived<NovaVerdict | null>(deriveNovaVerdict(payload));
  // The dietary verdict (ADR-0043 §4): the present-only on-pack claims plus the
  // additives count riding the NOVA disc. Absent (silent) for a non-OFF food.
  let dietary = $derived<DietaryVerdict | null>(deriveDietaryVerdict(payload));
  let dietaryTags = $derived(dietary ? dietaryTagsView(dietary) : []);
  // The additives disc rides the NOVA tag ONLY when the NOVA explainer will
  // actually detail those additives — i.e. an OFF-rated verdict (the sole branch
  // where `deriveNovaVerdict` carries the additives as evidence). Otherwise the
  // disc would promise a count the explainer withholds (an OFF food with
  // additives but no NOVA group reads "not rated"). Gating here keeps the disc
  // and the explainer's additive list driven by the same condition.
  let additivesCount = $derived(
    nova?.state === "rated" && nova.source === "off"
      ? (dietary?.additivesCount ?? 0)
      : 0
  );
  let brand = $derived<string | undefined>(
    payload.attributes?.["twin/brand"] as string | undefined
  );
  // Allergens (ADR-0043 §3): present-only, silent when OFF carries none.
  let allergen = $derived(deriveAllergenVerdict(payload));
</script>

<div class="food-card">
  <!-- Head: the tag cluster rides the card's top-right corner, ABOVE the name,
       so a long food name never squeezes it down beside itself or pushes it onto
       its own left-aligned line. Origin · source · NOVA read as one row. -->
  <div class="card-head">
    <div class="head-badges">
      {#if origin && onEdit}
        <!-- Origin badge (§7): user-entered vs source-corrected, at a glance.
             Clicking it re-opens the label form on this twin to edit it again. -->
        <button
          type="button"
          class="origin-badge"
          data-testid="origin-badge"
          onclick={onEdit}
          title="Edit this entry from the label"
        >
          <span class="origin-badge-icon" aria-hidden="true">✏️</span>
          <span>{origin === "edited" ? "edited from label" : "your entry"}</span
          >
        </button>
      {/if}
      <SourceTag {source} onExplain={onExplainSource} />
      {#if nova}
        <NovaBadge
          verdict={nova}
          {additivesCount}
          onExplain={onExplainNova ? () => onExplainNova(nova) : undefined}
        />
      {/if}
    </div>
    <h3>{name}</h3>
  </div>

  <!-- Meta row: the brand sits left, the dietary claims float right against it.
       Dietary marks are bare placeholder glyphs (no frame); present-only, so the
       cluster is silent when OFF carries none. The framed tags (source, NOVA)
       ride the head above instead.

       The row itself is present-only too: a USDA or hand-entered food has
       neither a brand nor on-pack claims, and an empty row's reserved height
       read as an unexplained band under the name. -->
  {#if brand || dietaryTags.length}
    <div class="meta-row">
      {#if brand}<p class="brand">{brand}</p>{/if}
      {#if dietaryTags.length && dietary}
        <div class="tags" data-testid="food-tags-row">
          {#each dietaryTags as dt (dt.tag)}
            <button
              type="button"
              class="tag-dietary"
              data-testid="dietary-tag"
              aria-label={`${dt.shortForm}. Tap for details`}
              title={dt.shortForm}
              onclick={() => onExplainDietary?.(dietary)}
            >
              <span class="tag-glyph" aria-hidden="true">{dt.glyph}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {@render beforeAmount?.()}

  <FoodAmountPanel {panel} {portions} {hydrating} bind:grams />

  <!-- Allergen safety block (ADR-0043 §3, #104): a static, present-only block
       below the quantity row — Contains › May-contain › Free-from, one allergen
       per line, the mandatory disclaimer behind an (i) toggle. Silent when OFF
       carries no allergen data; never inferred from absence. -->
  {#if allergen}
    <AllergenSafetyBlock verdict={allergen} />
  {/if}
</div>

<style>
  .food-card {
    display: flex;
    flex-direction: column;
  }
  /* The tags own their own line above the name, hard against the right edge.
     They used to share the name's line, which a long name (the USDA descriptions
     run to a full line on a phone) turned into a wrap that dropped them to the
     left below the title — the opposite of the corner they belong in. */
  .card-head {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3xs);
  }
  .food-card h3 {
    font-size: var(--step-1);
    font-weight: 700;
    min-width: 0;
  }
  /* The corner cluster: the edit origin-badge (§7), the source tag (ADR-0043 §2)
     and the NOVA mark (ADR-0041 §5), packed to the right edge and wrapping among
     themselves when three of them won't fit one line. */
  .head-badges {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3xs);
  }
  /* Origin badge (§7) — clicking re-opens the label form to edit this entry
     again. It shares the corner row with the source and NOVA marks, so it
     carries their exact measurements (font, padding, thin edge, no offset
     shadow); a chunkier button beside them read as misaligned rather than as a
     sibling. inline-flex + align-items:center centres the pencil and text on one
     line — a plain baseline layout let the emoji's metrics push the text high in
     the box (its glyph mid-point ≠ the box mid-point). */
  .origin-badge {
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
    cursor: pointer;
    transition: transform 0.06s ease;
  }
  .origin-badge-icon {
    /* Kill the emoji's extra vertical bearing so its optical centre matches the
       label's, then lift it onto the caps' centre line exactly as the source
       tag's ◆ / ✎ glyph is lifted — the two sit side by side. */
    font-size: 0.9em;
    line-height: 1;
    transform: translateY(-0.08em);
  }
  .origin-badge:hover {
    color: var(--ink);
  }
  .origin-badge:active {
    transform: translate(1px, 1px);
  }
  .origin-badge:focus-visible {
    outline: var(--edge);
    outline-offset: 2px;
  }

  /* Meta row (ADR-0043 §2): the brand sits left, the dietary tags float right
     against it (margin-left:auto), sharing one row. The min-height keeps a
     brand-only row the same height as one carrying glyphs — it never pads an
     empty row, since the row does not render without content. */
  .meta-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    margin-top: var(--space-3xs);
    min-height: 1.7rem;
  }
  .brand {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--step-n1);
    min-width: 0;
  }
  /* The tag cluster — floated to the right edge of the brand row. */
  .tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2xs);
    margin-left: auto;
  }
  /* Dietary marks are bare placeholder glyphs (ADR-0043 §2, prototype #97) — no
     frame, no fill, no shadow, no visible text; the short form lives in the
     tag's title/aria-label. They tap through to the dietary explainer. */
  .tag-dietary {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    line-height: 1;
    color: var(--ink);
    background: none;
    border: none;
    padding: 0.1rem;
    cursor: pointer;
    transition: transform 0.06s ease;
  }
  .tag-dietary:active {
    transform: translateY(1px);
  }
  .tag-dietary:focus-visible {
    outline: var(--edge);
    outline-offset: 2px;
  }
  .tag-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--step-0);
    line-height: 1;
  }
</style>
