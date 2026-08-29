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
  import Modal from "../ui/Modal.svelte";
  import Button from "../ui/Button.svelte";
  import Meter from "../ui/Meter.svelte";
  import NutrientCard from "../views/food/NutrientCard.svelte";
  import NutrientCardGrid from "../views/food/NutrientCardGrid.svelte";
  import NutrientGroupHead from "../views/food/NutrientGroupHead.svelte";
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
    SECTION_LIMITS,
    type DayRdaRow,
  } from "../food/nutrient-display";
  import {
    resolveNutrientTargets,
    resolveNutrientLimits,
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
  let limits = $derived(resolveNutrientLimits($settingsStore.food_limits));
  let rda = $derived(
    buildDayRdaView(mealTotals, targets, {
      calorieDecimals: $calorieDisplayDecimals,
      limits,
    })
  );

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

<!-- One cell, lifted from the day panel's own so the two surfaces read as the
     same thing at two scales. -->
{#snippet rdaCell(row: DayRdaRow)}
  <NutrientCard label={row.label} rowKey={row.key}>
    {#snippet children()}
      <span class="cell-vt" class:over={row.over} class:absent={row.absent}>
        {row.value} <span class="cell-target">/ {row.target}</span>
      </span>
      <Meter
        fill={row.fill}
        over={row.over}
        valueText={`${row.value} of ${row.target}`}
      />
    {/snippet}
  </NutrientCard>
{/snippet}

<!-- ── THE MEAL, IN FULL — and the way out inside it ─────────────────────── -->
{#if proto.mealPanel}
  {@const panel = proto.mealPanel}
  <Modal onClose={closePanel} title="{panel.meal_type} nutrition">
    {#snippet children({ props, close })}
      <div {...props} class="panel">
        <header class="panel-head">
          <h3>{panel.meal_type}</h3>
          <button
            type="button"
            class="panel-close"
            aria-label="Close"
            onclick={close}>&times;</button
          >
        </header>

        <div class="panel-body">
          {#if proto.send}
            {@const s = proto.send}
            <!-- The panel does not open a second surface to hand the meal over.
                 It turns into the code, and back again. One place, two faces. -->
            {#if s.phase === "showing"}
              <div class="centre">
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
              </div>
            {:else}
              <div class="centre outcome" class:ok={s.phase === "delivered"}>
                <p class="big">
                  {#if s.phase === "delivered"}They have it.
                  {:else if s.phase === "inbox-full"}They cannot take it now.
                  {:else if s.phase === "relay-down"}No route to them.
                  {:else}They could not read it.{/if}
                </p>
                <p class="fine">
                  {#if s.phase === "delivered"}
                    What they do with it is theirs. Inventoria will not tell
                    you.
                  {:else if s.phase === "inbox-full"}
                    Their device is already holding as many as it will hold.
                    Nothing was lost.
                  {:else if s.phase === "relay-down"}
                    Nothing left this device. Hand it over as a file instead.
                  {:else}
                    {ONE_LINE} The code is spent.
                  {/if}
                </p>
              </div>
            {/if}
          {:else}
            <p class="caption">
              This {panel.meal_type} on {formatDate(panel.date)}, against your
              daily targets.
            </p>

            {#if mealItems.length === 0}
              <p class="caption">Nothing logged.</p>
            {:else}
              <!-- No Biggest-gaps strip, deliberately. The day panel ranks what
                   the DAY is short of; one meal is short of nearly everything by
                   construction, so the same strip here would say nothing every
                   time. The rest is the day panel's structure unchanged. -->
              <NutrientGroupHead label={SECTION_MACROS} />
              <NutrientCardGrid>
                {#each rda.macros as row (row.key)}
                  {@render rdaCell(row)}
                {/each}
              </NutrientCardGrid>

              {#if rda.micros.length > 0}
                <NutrientGroupHead label={SECTION_MICROS} />
                <NutrientCardGrid>
                  {#each rda.micros as row (row.key)}
                    {@render rdaCell(row)}
                  {/each}
                </NutrientCardGrid>
              {/if}

              {#if rda.limits.length > 0}
                <NutrientGroupHead label={SECTION_LIMITS} />
                <NutrientCardGrid>
                  {#each rda.limits as row (row.key)}
                    {@render rdaCell(row)}
                  {/each}
                </NutrientCardGrid>
              {/if}

              {#if rda.untracked.length > 0}
                <NutrientGroupHead
                  label="Not tracked ({rda.untracked.length})"
                />
                {#each rda.untracked as row (row.key)}
                  <div class="untracked nutrient-{row.key}">
                    <span>{row.label}</span>
                    <span class="untracked-value">{row.value}</span>
                  </div>
                {/each}
              {/if}
            {/if}
          {/if}
        </div>

        <div class="panel-dock">
          {#if !proto.send}
            <Button
              variant="primary"
              disabled={mealItems.length === 0}
              onclick={() =>
                proto.startSend(
                  panel.meal_type,
                  formatDate(panel.date),
                  mealItems.length,
                  mealKcal
                )}
            >
              Hand this {panel.meal_type} over
            </Button>
          {:else if proto.send.phase === "showing"}
            <Button variant="ghost" onclick={() => proto.closeSend()}>
              Back to the numbers
            </Button>
          {:else if proto.send.phase === "delivered"}
            <Button variant="primary" onclick={close}>Done</Button>
          {:else}
            <Button variant="ghost" onclick={() => proto.closeSend()}>
              Back to the numbers
            </Button>
            <Button variant="primary" onclick={() => proto.sendAgain()}>
              Send again
            </Button>
          {/if}
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- ── A MEAL ARRIVING, WITH NOTHING IN FRONT OF IT ──────────────────────── -->
{#if proto.arriving}
  {@const p = proto.arriving}
  <Modal onClose={() => (proto.arriving = null)} title="A meal was sent to you">
    {#snippet children({ props, close })}
      <div {...props} class="panel">
        <header class="panel-head">
          <h3>A {p.meal_type}</h3>
          <button
            type="button"
            class="panel-close"
            aria-label="Close"
            onclick={close}>&times;</button
          >
        </header>
        <div class="panel-body">
          <p class="caption">They logged this on {p.senderDay}.</p>
          <MealBrief payload={p} />
          <p class="fine">
            Adding it logs this as your {p.meal_type}, today, at these amounts.
            The recipe comes with it and joins your recipes.
          </p>
        </div>
        <div class="panel-dock">
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
  </Modal>
{/if}

<!-- A refusal, read by someone standing in front of the person who sent it. -->
{#if proto.receivePhase === "refused"}
  <Modal onClose={() => proto.closeReceive()} title="That was refused">
    {#snippet children({ props, close })}
      <div {...props} class="panel">
        <div class="panel-body centre outcome">
          <p class="big">
            {proto.receiveRefusal?.id === "seal"
              ? proto.receiveRefusal.plain
              : ONE_LINE}
          </p>
          <p class="fine">Nothing was added to your day.</p>
          <button
            type="button"
            class="cause-toggle"
            aria-expanded={showCause}
            onclick={() => (showCause = !showCause)}
          >
            {showCause ? "Hide" : "Show"} why
          </button>
          {#if showCause}
            <p class="cause">{proto.receiveRefusal?.cause}</p>
          {/if}
        </div>
        <div class="panel-dock">
          <Button variant="primary" onclick={close}>Close</Button>
        </div>
      </div>
    {/snippet}
  </Modal>
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
  .panel {
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    background: var(--bg-surface);
    border: var(--edge);
    box-shadow: var(--shadow-3);
    width: min(94vw, 34rem);
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-s);
    border-bottom: var(--edge);
  }
  .panel-head h3 {
    margin: 0;
    font-size: var(--step-0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .panel-close {
    background: none;
    border: 0;
    font-size: var(--step-1);
    line-height: 1;
    cursor: pointer;
  }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-xs) var(--space-s);
  }
  .panel-dock {
    display: flex;
    gap: var(--space-2xs);
    justify-content: flex-end;
    padding: var(--space-xs) var(--space-s);
    border-top: var(--edge);
  }
  .caption {
    margin: 0 0 var(--space-xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
    text-transform: none;
  }
  .cell-vt {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
  }
  .cell-vt.absent {
    color: var(--text-muted);
  }
  .cell-vt.over {
    color: var(--rda-over);
  }
  .cell-target {
    font-weight: 400;
    font-size: var(--step-n3);
    color: var(--text-muted);
  }
  .untracked {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2xs);
    padding: var(--space-3xs) 0;
    border-bottom: var(--edge-thin);
    font-size: var(--step-n2);
  }
  .untracked-value {
    font-family: var(--font-mono);
  }
  .centre {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    text-align: center;
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
    margin: 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .waiting {
    margin: 0;
    color: var(--text-muted);
  }
  .outcome {
    padding: var(--space-s) 0;
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
  .cause-toggle {
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
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    color: var(--text-muted);
  }
  .doors-rig {
    position: fixed;
    left: 50%;
    bottom: 5.5rem;
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
