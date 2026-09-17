<script lang="ts">
  import {
    recipePerServingNutrition,
    recipeTwinsStore,
  } from "../../stores/recipe.store";
  import {
    roundFoodDisplay,
    type NutritionBreakdown,
  } from "../../food/nutrition";
  import { parseDatomValue } from "../../db/datom-fold";
  import { calorieDisplayDecimals } from "../../stores/device-settings";

  // The saved Recipe Twins, as a list of pickable rows. Two surfaces browse the
  // same recipes for different reasons — the log sheet's Recipe tab, where
  // picking one logs it onto a meal, and the food screen's recipe library, where
  // picking one opens it to read and amend — so the list itself lives here and
  // each caller says what a pick means.
  //
  // What a row shows is not what a recipe stores. A twin holds bare ingredient
  // refs (ADR-0021), so the per-serving figures are derived from the ledger by
  // `recipePerServingNutrition`, exactly as the instantiation editor derives
  // them. That is why the name appears at once and the macros line fills in
  // behind it.
  let {
    onPick,
    emptyHint,
    heading = "Your recipes",
  }: {
    /** What picking a row does — instantiate it, or open it for review. */
    onPick: (entity: string) => void;
    /** Shown in place of the list when nothing is saved yet. */
    emptyHint: string;
    /** The label above the list. */
    heading?: string;
  } = $props();

  // Deduped by entity, newest first from the store's HLC-desc order.
  let recipes = $derived.by(() => {
    const seen = new Set<string>();
    const out: { entity: string; name: string }[] = [];
    for (const row of $recipeTwinsStore) {
      if (seen.has(row.entity)) continue;
      seen.add(row.entity);
      const name = String(parseDatomValue("recipe/name", row.value));
      out.push({ entity: row.entity, name });
    }
    return out;
  });

  // Re-derived whole on every ledger change, and held by nothing in between
  // (#488). This map used to be a cache keyed by entity, which is the one input
  // to the figures that an edit leaves alone: amending a recipe's ingredients or
  // its yield appended new datoms, the name above the macros updated from the
  // store, and the macros line went on reporting what the recipe was worth when
  // the list first rendered. The read it saved was never the one its comment
  // claimed either — the map is component state, so re-opening the browser
  // started it empty regardless.
  //
  // The map is replaced rather than filled in, so a row keeps its last figures
  // until the new ones land instead of blanking. Rows resolve concurrently, and
  // the effect reads nothing it writes, so a run settles rather than re-arming
  // itself.
  //
  // It re-arms on ANY append, not only an edit of a recipe — a ledger store
  // reloads on every invalidation, so logging a food while this is on screen
  // re-derives the lot. That is affordable because of where the list is, not
  // because the work is small: it is a handful of rows, and it is mounted only
  // while somebody is looking at the recipe browser, which is not a surface the
  // rest of the app writes underneath.
  let recipeNutrition = $state<Map<string, NutritionBreakdown | null>>(
    new Map()
  );
  $effect(() => {
    const list = recipes;
    let cancelled = false;
    void (async () => {
      const panels = await Promise.all(
        list.map((r) => recipePerServingNutrition(r.entity))
      );
      if (cancelled) return;
      recipeNutrition = new Map(list.map((r, i) => [r.entity, panels[i]]));
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

{#if recipes.length === 0}
  <p class="hint">{emptyHint}</p>
{:else}
  <p class="recipes-head">{heading}</p>
  <ul class="recipe-list">
    {#each recipes as r (r.entity)}
      {@const panel = recipeNutrition.get(r.entity)}
      <li>
        <!-- The recipe row mirrors the stager's Recent/Results card
             (`.result-item`): flat thin-edge tile, two-line details (name + a
             muted per-serving macros line) and a trailing arrow. `.recipe-pick`
             stays the e2e hook. -->
        <button
          type="button"
          class="recipe-pick"
          onclick={() => onPick(r.entity)}
        >
          <span class="recipe-details">
            <span class="recipe-pick-name">{r.name}</span>
            {#if panel}
              <span class="recipe-pick-macros">
                Per serving: {roundFoodDisplay(
                  panel.calories,
                  $calorieDisplayDecimals
                )} kcal | P: {roundFoodDisplay(panel.protein)}g | F: {roundFoodDisplay(
                  panel.fat
                )}g | C: {roundFoodDisplay(panel.carbs)}g
              </span>
            {/if}
          </span>
          <span class="recipe-pick-go" aria-hidden="true">→</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .hint {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin-top: var(--space-s);
  }
  /* Matches the stager's "Recent" / "Results" heading (`.results-head`) so the
     recipe browser reads as the same surface as the search results. */
  .recipes-head {
    display: block;
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .recipe-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }
  /* The row mirrors the stager's Recent/Results card (`.result-item` in
     FoodStager): a flat thin-edge tile — no Card shadow — so the recipe browser
     reads as the same surface as the search results the user just came from. */
  .recipe-pick {
    min-height: var(--tap-min);
    width: 100%;
    background: var(--paper);
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-xs) var(--space-s);
    /* `.result-item` is a <div> and inherits the page line-height (1.5); this
       row is a <button>, which UA-resets to `line-height: normal` and shrinks
       the two-line card. `font: inherit` restores the inherited metrics so the
       card is the same height as a Recent food card. */
    font: inherit;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    cursor: pointer;
    transition: background 0.2s;
  }
  .recipe-pick:hover {
    background: var(--bg-input);
  }
  .recipe-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .recipe-pick-name {
    font-weight: 600;
    font-size: var(--step-n1);
  }
  .recipe-pick-macros {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-top: var(--space-3xs);
  }
  .recipe-pick-go {
    color: var(--text-muted);
    font-size: var(--step-0);
  }
</style>
