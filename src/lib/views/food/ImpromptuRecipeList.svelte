<script lang="ts">
  import { consumptionStore } from "../../stores/calorie.store";
  import { recipeTwinsStore } from "../../stores/recipe.store";
  import { impromptuOccasions } from "../../food/recipe-occasions";
  import { dayLabel } from "../../food/past-meals";
  import { quantityLabel } from "../../food/recipe-ingredient";
  import ContentsRow from "./ContentsRow.svelte";

  // The dishes you assembled but never named (ADR-0110 §6), below the library on
  // the Recipes screen.
  //
  // **One row per occasion**, not per twin and not per day: a dressing made on
  // two days is two rows that open one twin, and a day on which two dishes were
  // assembled repeats its date. ADR-0058 §12 refused collapsing for the picker,
  // with measurement, and §6 inherits that refusal rather than re-arguing it.
  // Newest first, uncapped, flat — no date headings.
  //
  // **Nothing here logs.** That is the property separating this surface from the
  // meal browsers, and it is why the list is not a sixth way in: the rail's five
  // controls already need more width than the header has (ADR-0101).
  let {
    onPick,
  }: {
    /** Picking a row opens its twin on the shared screen (§7). */
    onPick: (entity: string) => void;
  } = $props();

  // Membership comes from the library's own query — `recipeTwinsStore` is
  // `WHERE attribute = 'recipe/name'`, so it IS the named twins (§2). The event
  // cannot answer it: since §3 an impromptu dish carries a derived `foodName`
  // indistinguishable from a typed one, and §1 forbids the flag that would tell
  // them apart. Reading both lists off one query is what keeps them from
  // disagreeing about which twins are named.
  let named = $derived(new Set($recipeTwinsStore.map((row) => row.entity)));
  let occasions = $derived(impromptuOccasions($consumptionStore, named));

  // **Both reads have to have happened**, and this list is the reason the rule
  // cuts both ways. A ledger store's initial value is indistinguishable from a
  // real empty result (`LedgerLoadStatus`), so while the library query is still
  // pending the named set is empty and EVERY recipe occasion in the ledger
  // reads as impromptu — the dishes you named listed under a heading that says
  // you did not. A day's dashboard guards the other direction, against saying
  // "nothing logged" before it knows; this guards the same mistake made
  // affirmatively. `failed` counts as known, for the dashboard's reason: there
  // is nothing more coming, and what is held is then the truthful reading.
  const consumptionStatus = consumptionStore.status;
  const twinsStatus = recipeTwinsStore.status;
  let known = $derived(
    $consumptionStatus !== "pending" && $twinsStatus !== "pending"
  );
</script>

<!-- Nothing at all when there is nothing, rather than an empty hint. The
     projection starts as `[]` while it loads, so a hint here would be a false
     statement about the user's history for the length of the database's boot —
     the failure `LedgerLoadStatus` exists to name. A heading that appears when
     it has something under it says nothing either way. -->
{#if known && occasions.length > 0}
  <!-- The heading is the CONTEXT.md term. The vocabulary and the screen copy
       are pinned to each other, so renaming one renames the other. -->
  <p class="impromptu-head">Impromptu recipes</p>
  <ul class="impromptu-list" data-testid="impromptu-recipe-list">
    {#each occasions as occasion (occasion.id)}
      <li>
        <!-- No accessible name of its own: an impromptu dish IS its contents,
             so the lines the row already reads out are the truest name it has,
             and two dishes at one meal on one day are told apart by nothing
             else. -->
        <ContentsRow
          head={dayLabel(occasion.date)}
          trailing={occasion.meal_type.toUpperCase()}
          lines={occasion.ingredients.map((row) => ({
            id: row.ref,
            label: row.name,
            amount: quantityLabel(row.amount, row.unit),
          }))}
          onclick={() => onPick(occasion.target)}
        />
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* The library's own heading (`.recipes-head` in RecipeList), so the two lists
     read as one screen rather than as a page with a footnote. */
  .impromptu-head {
    display: block;
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: var(--space-l);
    margin-bottom: var(--space-xs);
  }
  .impromptu-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
</style>
