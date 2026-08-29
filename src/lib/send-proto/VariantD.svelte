<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // VARIANT D — in the meal's own numbers.
  //
  // The premise: the meal already ends in a line of figures that does nothing.
  // Tap it and you get the meal in full — the same surface the day's aggregates
  // open, one scale down — and THAT is where handing it over lives, because
  // that screen already IS "this meal, entire", and sending is the act of
  // giving someone this meal entire. Nothing is added to the meal header, the
  // page header, or anywhere else.
  //
  // Receiving has no door at all. There is no inbox, no control, no count. A
  // meal reaches you two ways and only two: you open a link, or you point the
  // barcode scanner you already have at their code and it turns out not to be a
  // barcode. Both land you on the meal itself, deciding.
  //
  // Its refusal call: the same as A's — one line — because with no inbox there
  // is no list to explain a missing row in, and the refusal is read by someone
  // standing in front of the person who sent it.
  import Button from "../ui/Button.svelte";
  import NutritionPanel from "../views/food/NutritionPanel.svelte";
  import NutritionPanelCell from "../views/food/NutritionPanelCell.svelte";
  import NutrientCardGrid from "../views/food/NutrientCardGrid.svelte";
  import NutrientGroupHead from "../views/food/NutrientGroupHead.svelte";
  import WayOutIcon from "./WayOutIcon.svelte";
  import QrBlock from "./QrBlock.svelte";
  import MealBrief from "./MealBrief.svelte";
  import { formatDate } from "./proto-date";
  import { proto, ONE_LINE, REFUSALS } from "./proto-state.svelte";
  import { consumptionStore, consumptionForDay } from "../stores/calorie.store";
  import { totalNutrition } from "../food/consumption-state";
  import {
    buildDayRdaView,
    SECTION_MACROS,
    SECTION_MICROS,
    type DayRdaRow,
  } from "../food/nutrient-display";
  import {
    resolveNutrientTargets,
    defaultNutrientTargets,
  } from "../food/nutrition-targets";
  import { settingsStore } from "../stores/settings.store";
  import { calorieDisplayDecimals } from "../stores/device-settings";

  let showCause = $state(false);
  let copied = $state(false);

  // The meal on screen, recomputed from the ledger rather than handed a total —
  // the panel is the meal's own figures, so it reads them the way the day's
  // panel reads the day's.
  let mealItems = $derived(
    proto.mealPanel
      ? consumptionForDay($consumptionStore, proto.mealPanel.date).filter(
          (i) =>
            (i.meal_type || "snack").toLowerCase() ===
            proto.mealPanel!.meal_type
        )
      : []
  );
  let mealTotals = $derived(totalNutrition(mealItems));
  let targets = $derived(
    resolveNutrientTargets(
      $settingsStore.food_targets,
      defaultNutrientTargets($settingsStore.food_calculated_targets)
    )
  );
  let rda = $derived(
    buildDayRdaView(mealTotals, targets, {
      calorieDecimals: $calorieDisplayDecimals,
    })
  );

  /**
   * A row worth a cell.
   *
   * The day panel prints every reach-toward nutrient, absent ones as `—`,
   * because a day is a thing you are trying to fill and a gap is the news. A
   * meal is not trying to fill anything: it either contains a nutrient or it
   * does not, and forty cards reading `0 µg` say only that most foods are not
   * most nutrients. `parseFloat` catches both cases — `—` is NaN, "0 µg" is 0.
   */
  const carried = (row: DayRdaRow) => {
    const n = parseFloat(row.value);
    return Number.isFinite(n) && n !== 0;
  };
  let macros = $derived(rda.macros.filter(carried));
  let micros = $derived(rda.micros.filter(carried));

  let mealKcal = $derived(
    Math.round(mealItems.reduce((n, i) => n + (Number(i.calories) || 0), 0))
  );

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* a prototype does not need a fallback */
    }
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  function closePanel() {
    proto.mealPanel = null;
    proto.closeSend();
  }
</script>

<!-- ── THE MEAL, IN FULL — and the way out inside it ─────────────────────── -->
{#if proto.mealPanel}
  {@const panel = proto.mealPanel}
  <NutritionPanel
    title={panel.meal_type}
    testId="meal-nutrient-breakdown"
    onClose={closePanel}
  >
    <!-- The way out sits beside the meal's name, because it is a control on the
         SUBJECT of the panel rather than on the panel. There is no footer: a
         dock under the sections would make handing the meal over the panel's
         purpose, and the panel's purpose is the meal. -->
    {#snippet actions()}
      <!-- Only before the send. Once a code is minted there is no "back to the
           numbers": the code is live, the other person is being handed it, and
           an affordance that looks like undo would be one. Closing the panel is
           the only way out, and it is the honest one. -->
      {#if !proto.send}
        <button
          type="button"
          class="head-btn"
          aria-label="Hand this {panel.meal_type} over"
          disabled={mealItems.length === 0}
          onclick={() =>
            proto.startSend(
              panel.meal_type,
              formatDate(panel.date),
              mealItems.length,
              mealKcal
            )}
        >
          <WayOutIcon kind="send" />
        </button>
      {/if}
    {/snippet}

    {#snippet body()}
      {#if proto.send}
        {@const s = proto.send}
        <!-- The panel does not open a second surface to hand the meal over. It
             turns into the code, and back again. One place, two faces. -->
        <div class="inset centre">
          {#if s.phase === "showing"}
            <QrBlock link={s.code.link} size="min(70vw, 15rem)" />
            <p class="say">Let them scan this.</p>
            <div class="linkrow">
              <code class="link">{s.code.link}</code>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => copyLink(s.code.link)}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p class="fine">
              The link carries the key that opens the meal. It works once.
            </p>
            <p class="waiting" role="status">Waiting for them…</p>
          {:else}
            <div class="outcome" class:ok={s.phase === "delivered"}>
              <p class="big">
                {#if s.phase === "delivered"}They have it.
                {:else if s.phase === "inbox-full"}They cannot take it now.
                {:else if s.phase === "relay-down"}No route to them.
                {:else}They could not read it.{/if}
              </p>
            </div>
            <p class="fine">
              {#if s.phase === "delivered"}
                What they do with it is theirs. Inventoria will not tell you.
              {:else if s.phase === "inbox-full"}
                Their device is already holding as many as it will hold. Nothing
                was lost.
              {:else if s.phase === "relay-down"}
                Nothing left this device. Hand it over as a file instead.
              {:else}
                {ONE_LINE} The code is spent.
              {/if}
            </p>
            {#if s.phase !== "delivered"}
              <button
                type="button"
                class="again"
                onclick={() => proto.sendAgain()}>Send again</button
              >
            {/if}
          {/if}
        </div>
      {:else if mealItems.length === 0}
        <p class="inset fine">Nothing logged.</p>
      {:else}
        <!-- The day panel's sections, minus the three that are about a day
             rather than a meal. No Biggest gaps: it ranks what the DAY is short
             of, and one meal is short of nearly everything by construction. No
             Limits and no Not tracked: both are readings of a whole day against
             a cap. And no targets or bars — see NutritionPanelCell. -->
        <NutrientGroupHead label={SECTION_MACROS} />
        <NutrientCardGrid>
          {#each macros as row (row.key)}
            <NutritionPanelCell {row} showTarget={false} />
          {/each}
        </NutrientCardGrid>

        {#if micros.length > 0}
          <NutrientGroupHead label={SECTION_MICROS} />
          <NutrientCardGrid>
            {#each micros as row (row.key)}
              <NutritionPanelCell {row} showTarget={false} />
            {/each}
          </NutrientCardGrid>
        {/if}
      {/if}
    {/snippet}
  </NutritionPanel>
{/if}

<!-- ── A MEAL ARRIVING, WITH NOTHING IN FRONT OF IT ──────────────────────── -->
{#if proto.arriving}
  {@const p = proto.arriving}
  <NutritionPanel
    title="A {p.meal_type} was sent to you"
    testId="meal-arriving"
    onClose={() => (proto.arriving = null)}
  >
    {#snippet body({ close })}
      <div class="inset">
        <p class="fine">They logged this on {p.senderDay}.</p>
        <MealBrief payload={p} />
        <p class="fine">
          Adding it logs this as your {p.meal_type}, today, at these amounts.
          The recipe comes with it and joins your recipes.
        </p>
        <div class="dock">
          <Button variant="ghost" onclick={close}>Not now</Button>
          <Button
            variant="primary"
            onclick={() => proto.acceptArriving(p.meal_type)}
          >
            Add to my {p.meal_type}
          </Button>
        </div>
      </div>
    {/snippet}
  </NutritionPanel>
{/if}

<!-- A refusal, read by someone standing in front of the person who sent it. -->
{#if proto.receivePhase === "refused"}
  <NutritionPanel title="That was refused" onClose={() => proto.closeReceive()}>
    {#snippet body({ close })}
      <div class="inset centre">
        <div class="outcome">
          <p class="big">
            {proto.receiveRefusal?.id === "seal"
              ? proto.receiveRefusal.plain
              : ONE_LINE}
          </p>
        </div>
        <p class="fine">Nothing was added to your day.</p>
        <button
          type="button"
          class="again"
          aria-expanded={showCause}
          onclick={() => (showCause = !showCause)}
        >
          {showCause ? "Hide" : "Show"} why
        </button>
        {#if showCause}
          <p class="cause">{proto.receiveRefusal?.cause}</p>
        {/if}
        <div class="dock">
          <Button variant="primary" onclick={close}>Close</Button>
        </div>
      </div>
    {/snippet}
  </NutritionPanel>
{/if}

<!-- The rig's two doors in, since D has none of its own by design. -->
<div class="doors-rig">
  <button type="button" onclick={() => proto.arrive(0)}>
    (rig) open a link they sent
  </button>
  <button type="button" onclick={() => proto.arrive(1)}>
    (rig) scan a code with the barcode scanner
  </button>
  <button
    type="button"
    onclick={() => {
      proto.receiveRefusal = REFUSALS[6];
      proto.receivePhase = "refused";
    }}
  >
    (rig) scan a code that is refused
  </button>
</div>

<style>
  /* The shared panel's body carries no padding, so a section that is prose
     rather than a card grid insets itself. */
  .inset {
    padding: var(--space-xs) var(--space-m) var(--space-s);
  }
  .centre {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    text-align: center;
  }
  /* A header control on the panel's subject, sized to sit beside the close —
     and unframed like it, since the close button next to it wears no box
     either and two header controls should read as one row of marks. */
  .head-btn {
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
  .head-btn :global(svg) {
    width: 1.35rem;
    height: 1.35rem;
  }
  .head-btn[disabled] {
    opacity: 0.35;
    cursor: default;
  }
  .say {
    margin: 0;
    font-weight: 700;
  }
  .linkrow {
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
    width: 100%;
  }
  .link {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    background: var(--bg-input);
    border: var(--edge-thin);
    padding: var(--space-3xs) var(--space-2xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fine {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .waiting {
    margin: var(--space-2xs) 0 0;
    color: var(--text-muted);
  }
  .outcome {
    padding: var(--space-s) 0 0;
  }
  .big {
    margin: 0;
    font-size: var(--step-1);
    font-weight: 700;
    line-height: 1.15;
    background: var(--amber-bg);
    padding: 0 var(--space-3xs);
  }
  .outcome.ok .big {
    background: var(--green-bg);
  }
  .again {
    margin-top: var(--space-2xs);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n2);
    color: var(--text-secondary);
    text-decoration: underline;
    cursor: pointer;
  }
  .cause {
    margin: var(--space-3xs) 0 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    color: var(--text-muted);
  }
  .dock {
    display: flex;
    gap: var(--space-2xs);
    justify-content: flex-end;
    margin-top: var(--space-s);
  }
  .doors-rig {
    position: fixed;
    left: 50%;
    /* Clear of both the switcher and the "added to your breakfast" note, which
       share the foot of the screen. */
    bottom: 8.5rem;
    transform: translateX(-50%);
    z-index: 450;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: center;
  }
  .doors-rig button {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n3);
    color: var(--text-muted);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
