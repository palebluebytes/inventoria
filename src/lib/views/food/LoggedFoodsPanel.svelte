<script lang="ts">
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

  // A set of logged foods, entire — and the way out of it (ADR-0074 §1, §2 and
  // §3, as ADR-0088 §9 widened them).
  //
  // **This is the Full-day panel at another scale, not a lookalike**: the same
  // `NutritionPanel` shell and the same `NutritionPanelCell`. It serves a meal,
  // reached from two controls that were already on the screen doing nothing —
  // the meal's name and its subtotal line — and a **Selection**, reached by
  // tapping the count on the Selection bar. Which set it holds is the caller's
  // business; the panel only ever knows "these foods, entire".
  //
  // That is why it takes a `title` rather than a `meal_type`: the third scale
  // has no meal, and a component named for one of its callers would have to lie
  // to serve the others. The meal header still keeps its five ways in and gains
  // no sixth.
  //
  // **The panel turns into the code and back.** It opens no second surface to
  // hand the foods over, because this screen already IS "these foods, entire",
  // and sending is the act of giving somebody them.
  let {
    title,
    subject,
    testId,
    wayOutTestId,
    date,
    items,
    targets,
    calorieDecimals,
    onClose,
    onHandOff,
  }: {
    /** The panel's heading — a meal's name, or how many foods were picked. */
    title: string;
    /** What the way out is handing over, as it reads in a sentence: "this
     *  breakfast", "these 3 foods". */
    subject: string;
    /** The panel's own test hook. A shipped contract at the meal scale. */
    testId: string;
    /** The way out's test hook, likewise. */
    wayOutTestId: string;
    /** The day these foods were logged on — what the way out writes (§7). */
    date: Date;
    /** The rows, already narrowed by the caller. */
    items: ConsumptionEvent[];
    /** The resolved daily targets, read only to decide which cards exist. */
    targets: Partial<Record<string, number>>;
    calorieDecimals: number;
    onClose: () => void;
    /**
     * Fired once, when the Way out is pressed and this panel turns into the
     * code. The caller cannot watch for it any other way: a send has no
     * completion of its own — the session is this component's life — so this is
     * the only moment anything outside knows a hand-off happened.
     */
    onHandOff?: () => void;
  } = $props();

  let totals = $derived(totalNutrition(items));
  let rda = $derived(buildMealRdaView(totals, targets, { calorieDecimals }));

  // ── The way out ─────────────────────────────────────────────────────────
  //
  // Two states worth designing and no third: showing a code and waiting, then
  // done. Gathering a meal takes a measured 155 ms and the wait after it is a
  // human, so there is no intermediate to animate — and no progress bar that
  // depends on how much was picked, because the code does not grow with it.
  //
  // **The session is `SendFace`'s, and it is the whole of that component's
  // life.** Mounting it starts the send and unmounting it cancels, so this
  // panel keeps one flag and no lifecycle: closing, Escape, the backdrop and a
  // Tab change all end the session by unmounting the surface it lives on.
  /** Whether the panel has turned into the code. The figures are gone from here. */
  let handing = $state(false);
</script>

<NutritionPanel {title} {testId} {onClose}>
  <!-- The way out sits beside the panel's name, because it is a control on the
       SUBJECT of the panel rather than on the panel. There is no footer: a dock
       under the sections would make handing the meal over the panel's purpose,
       and the panel's purpose is the meal. -->
  {#snippet actions()}
    <!-- Only before the send. Once a code is minted there is no way back to
         the numbers: the code is live and the other person is being handed it,
         so an affordance that looked like undo would be one.

         Absent rather than disabled on a set with nothing in it, on ADR-0059
         §4's rule that any control which can be dead on arrival is hidden —
         the same precedent the iOS boundary leans on. -->
    {#if !handing && items.length > 0}
      <button
        type="button"
        class="way-out"
        data-testid={wayOutTestId}
        aria-label="Hand {subject} to someone"
        title="Hand {subject} to someone"
        onclick={() => {
          handing = true;
          onHandOff?.();
        }}
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
