<script lang="ts">
  import {
    getLocalFoodTwin,
    seedRowsFromTemplate,
    recipeTwinsStore,
  } from "../../stores/calorie.store";
  import {
    toReferenceIngredient,
    panelFromIngredients,
  } from "../../food/recipe-ingredient";
  import {
    deriveRecipeNutrition,
    sanitizeYield,
  } from "../../food/recipe-nutrition";
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
  // refs (ADR-0021), so the per-serving figures are derived: fetch the twin,
  // resolve its ingredients, run the shared `deriveRecipeNutrition`, exactly as
  // the instantiation editor does. That is why the name appears at once and the
  // macros line fills in behind it.
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

  // Cached by entity (the `.has` guard) so re-opening the list doesn't refetch.
  let recipeNutrition = $state<Map<string, NutritionBreakdown | null>>(
    new Map()
  );
  $effect(() => {
    const list = recipes;
    let cancelled = false;
    void (async () => {
      const next = new Map(recipeNutrition);
      let changed = false;
      for (const r of list) {
        if (next.has(r.entity)) continue;
        let panel: NutritionBreakdown | null = null;
        const twin = await getLocalFoodTwin(r.entity);
        if (twin) {
          const rows = await seedRowsFromTemplate(twin.attributes);
          const refs = rows.map(toReferenceIngredient);
          const resolve = (ref: string) => panelFromIngredients(rows, ref);
          const y = sanitizeYield(
            (twin.attributes["recipe/yield"] as number) ?? 1
          );
          panel = deriveRecipeNutrition(refs, y, resolve);
        }
        if (cancelled) return;
        next.set(r.entity, panel);
        changed = true;
      }
      if (!cancelled && changed) recipeNutrition = next;
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
