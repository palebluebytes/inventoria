<script lang="ts">
  import type { MealType } from "../../food/meal-type";
  import type { ConsumptionEvent } from "../../stores/calorie.store";
  import { totalNutrition } from "../../food/consumption-state";
  import {
    buildMealRdaView,
    formatCalories,
    SECTION_MACROS,
    SECTION_MICROS,
  } from "../../food/nutrient-display";
  import NutritionPanel from "./NutritionPanel.svelte";
  import NutritionPanelCell from "./NutritionPanelCell.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";
  import NutrientGroupHead from "./NutrientGroupHead.svelte";
  import SendFace from "./SendFace.svelte";
  import WayOutIcon from "./WayOutIcon.svelte";

  // One meal, entire — and the way out of it (ADR-0074 §1, §2 and §3).
  //
  // **This is the Full-day panel one scale down, not a lookalike**: the same
  // `NutritionPanel` shell and the same `NutritionPanelCell`, reached from two
  // controls that were already on the screen doing nothing — the meal's name
  // and its subtotal line. The meal header keeps its five ways in and gains no
  // sixth.
  //
  // **The panel turns into the code and back.** It opens no second surface to
  // hand the meal over, because this screen already IS "this meal, entire", and
  // sending is the act of giving somebody this meal entire.
  let {
    meal_type,
    date,
    items,
    targets,
    calorieDecimals,
    onClose,
  }: {
    meal_type: MealType;
    /** The day the meal was logged on — what the way out writes (§7). */
    date: Date;
    /** This meal's logged rows, already narrowed to it by the dashboard. */
    items: ConsumptionEvent[];
    /** The resolved daily targets, read only to decide which cards exist. */
    targets: Partial<Record<string, number>>;
    calorieDecimals: number;
    onClose: () => void;
  } = $props();

  let totals = $derived(totalNutrition(items));
  let rda = $derived(buildMealRdaView(totals, targets, { calorieDecimals }));

  // ── The way out ─────────────────────────────────────────────────────────
  //
  // Two states worth designing and no third: showing a code and waiting, then
  // done. Gathering the meal takes a measured 155 ms and the wait after it is a
  // human, so there is no intermediate to animate — and no progress bar that
  // depends on meal size, because the code does not grow with the meal.
  //
  // **The session is `SendFace`'s, and it is the whole of that component's
  // life.** Mounting it starts the send and unmounting it cancels, so this
  // panel keeps one flag and no lifecycle: closing, Escape, the backdrop and a
  // Tab change all end the session by unmounting the surface it lives on.
  /** Whether the panel has turned into the code. The figures are gone from here. */
  let handing = $state(false);
</script>

<NutritionPanel
  title={meal_type.toUpperCase()}
  testId="meal-nutrient-breakdown"
  {onClose}
>
  <!-- The way out sits beside the meal's name, because it is a control on the
       SUBJECT of the panel rather than on the panel. There is no footer: a dock
       under the sections would make handing the meal over the panel's purpose,
       and the panel's purpose is the meal. -->
  {#snippet actions()}
    <!-- Only before the send. Once a code is minted there is no way back to
         the numbers: the code is live and the other person is being handed it,
         so an affordance that looked like undo would be one.

         Absent rather than disabled on a meal with nothing in it, on ADR-0059
         §4's rule that any control which can be dead on arrival is hidden —
         the same precedent the iOS boundary leans on. -->
    {#if !handing && items.length > 0}
      <button
        type="button"
        class="way-out"
        data-testid="meal-way-out"
        aria-label="Hand this {meal_type} to someone"
        title="Hand this {meal_type} to someone"
        onclick={() => (handing = true)}
      >
        <WayOutIcon />
      </button>
    {/if}
  {/snippet}

  {#snippet body()}
    {#if handing}
      <SendFace
        roots={items.map((item) => item.id)}
        foods={items.length}
        calories={totals.calories}
        {date}
        {calorieDecimals}
      />
    {:else if items.length === 0}
      <p class="inset fine">Nothing logged.</p>
    {:else}
      <!-- The day panel's two card sections and nothing else. Biggest gaps,
           Limits, Not tracked and every target are readings of a day rather
           than of a meal — see `buildMealRdaView`, which is where that argument
           lives, and `NutritionPanelCell`'s `showTarget`. -->
      <NutrientGroupHead label={SECTION_MACROS} />
      <NutrientCardGrid>
        {#each rda.macros as row (row.key)}
          <NutritionPanelCell {row} showTarget={false} />
        {/each}
      </NutrientCardGrid>

      {#if rda.micros.length > 0}
        <NutrientGroupHead label={SECTION_MICROS} />
        <NutrientCardGrid>
          {#each rda.micros as row (row.key)}
            <NutritionPanelCell {row} showTarget={false} />
          {/each}
        </NutrientCardGrid>
      {/if}
    {/if}
  {/snippet}
</NutritionPanel>

<style>
  /* The shared panel's body carries no padding, so a section that is prose
     rather than a card grid insets itself. */
  .inset {
    padding: var(--space-xs) var(--space-m) var(--space-s);
  }
  /* A header control on the panel's subject, sized to sit beside the close —
     and unframed like it, since the close button next to it wears no box either
     and two header controls should read as one row of marks. */
  .way-out {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    background: none;
    border: 0;
    padding: 0;
    color: var(--text-primary);
    line-height: 1;
    cursor: pointer;
  }
  /* Sized against the close button beside it, which sits at 1.75rem. */
  .way-out :global(svg) {
    width: 1.35rem;
    height: 1.35rem;
  }
  .fine {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
