<script lang="ts">
  import { consumptionStore } from "../../stores/calorie.store";
  import { occasionsOf } from "../../food/recipe-occasions";
  import { dayLabel } from "../../food/past-meals";

  // Every day this twin was made, newest first (ADR-0110 §7). CONTEXT.md has
  // said since ADR-0022 that a template's instantiations over time are its
  // history, and nothing has shown it until now.
  //
  // It reads the same for both kinds, because the history is the same fact
  // either way — and because promotion leaves it untouched: the id survives
  // naming (§5), and the events name the id.
  //
  // **No kcal per occasion.** The figures are frozen per occasion and
  // legitimately differ between days — a bigger portion, a corrected
  // ingredient — so putting them side by side invites a comparison this screen
  // is not making.
  let {
    entity,
  }: {
    /** The twin whose days these are. */
    entity: string;
  } = $props();

  let occasions = $derived(occasionsOf($consumptionStore, entity));

  // "Not logged on any day yet" is a statement about the user's history, and
  // the projection's initial value is indistinguishable from a real empty one
  // (`LedgerLoadStatus`), so it would be false for the length of the database's
  // boot. Said only once the read has happened; `failed` counts as known, since
  // nothing more is coming and what is held is then the truthful reading.
  const consumptionStatus = consumptionStore.status;
  let known = $derived($consumptionStatus !== "pending");
</script>

<section class="history" data-testid="recipe-history">
  <h3 class="history-head">History</h3>
  {#if occasions.length === 0}
    {#if known}<p class="history-empty">Not logged on any day yet.</p>{/if}
  {:else}
    <ul class="history-list">
      {#each occasions as occasion (occasion.id)}
        <li>
          <span class="history-date">{dayLabel(occasion.date)}</span>
          <span class="history-meal">{occasion.meal_type.toUpperCase()}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .history {
    margin-top: var(--space-m);
  }
  /* Names a section rather than a control, so it takes the type the ingredient
     list's own section heads take (`.section-head`) rather than FieldCaption. */
  .history-head {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: var(--space-2xs);
  }
  .history-empty {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }
  .history-list {
    list-style: none;
    border-top: var(--edge-thin);
  }
  .history-list li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2xs);
    padding: var(--space-2xs) 0;
    border-bottom: var(--edge-thin);
  }
  .history-date {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .history-meal {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
</style>
