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
  import Button from "../../ui/Button.svelte";
  import NutritionPanel from "./NutritionPanel.svelte";
  import NutritionPanelCell from "./NutritionPanelCell.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";
  import NutrientGroupHead from "./NutrientGroupHead.svelte";
  import EndingLine from "./EndingLine.svelte";
  import SendCodeSymbol from "./SendCodeSymbol.svelte";
  import WayOutIcon from "./WayOutIcon.svelte";
  import LedgerExportButton from "../ledger/LedgerExportButton.svelte";
  import { buildMealPayload } from "../../p2p/meal-payload";
  import { ledgerEntityRows } from "../../p2p/ledger-rows";
  import { sendMealPayload } from "../../p2p/meal-send";
  import {
    burnSendCode,
    mintSendCode,
    sendCodeLink,
    type SendCode,
  } from "../../p2p/send-code";
  import { writeDate } from "../../p2p/send-date";
  import {
    MEAL_DELIVERED,
    sendEndingWords,
    type SendWords,
  } from "../../p2p/send-words";

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
  /** Whether the panel has turned into the code. The figures are gone from here. */
  let handing = $state(false);
  let code = $state<SendCode | null>(null);
  let ended = $state<SendWords | null>(null);
  let copied = $state<"yes" | "no" | null>(null);

  /** Live while a send is: closing the panel aborts it, which burns the code. */
  let session: AbortController | null = null;

  let link = $derived(code ? sendCodeLink(code, location.origin) : null);

  async function handOver() {
    // A send at a time. Nothing on screen can start a second one while one is
    // live — the way out is gone and "Send again" only exists once a session
    // has ended — so this is the invariant stated rather than a case handled.
    endSession();
    const pulled = new AbortController();
    session = pulled;
    handing = true;
    code = null;
    ended = null;
    copied = null;
    try {
      // The roots are this meal's own Consumption Events; everything else in
      // the payload is reached by walking what they point at.
      const payload = await buildMealPayload(
        items.map((item) => item.id),
        ledgerEntityRows
      );
      // The code is drawn once there is a meal to hand over, and not before.
      // The measured shape is gather, then the code, then a human: a symbol on
      // screen while the ledger is still being read is a live secret standing
      // in for work that may yet fail.
      const drawn = mintSendCode();
      code = drawn;
      await sendMealPayload(drawn, payload, { signal: pulled.signal });
      ended = MEAL_DELIVERED;
    } catch (failure) {
      ended = sendEndingWords(failure);
    }
  }

  /**
   * Closing cancels, and cancelling burns the code (ADR-0072 §6.3).
   *
   * The session burns it too, once it is far enough in to see the cancellation
   * — but a code drawn and shown while the socket was still being dialled can
   * come back as an unreachable relay, which is deliberately not a burn there.
   * It must not outlive the screen that showed it, so this end says so itself.
   */
  function endSession() {
    session?.abort();
    session = null;
    if (code) burnSendCode(code);
  }

  // Every route out of the panel ends the session, including the ones the panel
  // does not draw: Escape, the backdrop, and a tab change that unmounts it.
  $effect(() => () => endSession());

  function closePanel() {
    endSession();
    onClose();
  }

  async function copyLink(carrier: string) {
    try {
      await navigator.clipboard.writeText(carrier);
      copied = "yes";
    } catch {
      // Refused permission, or no clipboard at all. The link is on screen
      // either way, so this says so rather than claiming a copy that did not
      // happen.
      copied = "no";
    }
  }
</script>

<NutritionPanel
  title={meal_type.toUpperCase()}
  testId="meal-nutrient-breakdown"
  onClose={closePanel}
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
        onclick={handOver}
      >
        <WayOutIcon />
      </button>
    {/if}
  {/snippet}

  {#snippet body()}
    {#if handing}
      <div class="inset centre" data-testid="meal-send">
        <!-- What is being handed over, once the figures have gone. It writes a
             date rather than "Today" or "Tuesday" (§7): a second person is
             looking at this screen, and a weekday names nothing across two
             devices while "Today" is a claim about whose day. -->
        <p class="kicker">
          {items.length}
          {items.length === 1 ? "food" : "foods"} · {formatCalories(
            totals.calories,
            calorieDecimals
          )} · {writeDate(date)}
        </p>

        {#if !ended}
          <!-- The symbol's own placeholder stands in while the meal is read,
               which is the whole of the 155 ms before a code exists. -->
          <SendCodeSymbol {link} />
          {#if link}
            <p class="say">Let them scan this.</p>
            <div class="linkrow">
              <code class="link">{link}</code>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => copyLink(link)}
              >
                {copied === "yes"
                  ? "Copied"
                  : copied === "no"
                    ? "Cannot copy"
                    : "Copy"}
              </Button>
            </div>
            <p class="fine">
              The link carries the key that opens the meal. It works once.
            </p>
            <p class="waiting" role="status">Waiting for them…</p>
          {/if}
        {:else}
          <!-- One line, in the app's voice, with the technical cause behind a
               "show why" (§6) — the shape both ends of a send print. -->
          <EndingLine words={ended} ok={ended.ending === "delivered"} />
          {#if ended.retry}
            <button type="button" class="plain" onclick={handOver}>
              Send again
            </button>
          {/if}
          <!-- The named step-down (ADR-0072 §14). The same button and the same
               file as `Settings → Export Ledger` — the whole Ledger rather than
               this meal, which is what the line above it says. It reads the
               ledger the moment it mounts, which is the moment the send failed,
               so the count is already there when the button is pressed. A dead
               end and a step-down differ by one button. -->
          {#if ended.stepDown}
            <div class="stepdown" data-testid="send-step-down">
              <p class="fine">
                The file still works. A Ledger export writes every datom this
                device holds to a file you can hand over however you like. That
                is the whole Ledger, not this meal.
              </p>
              <LedgerExportButton size="sm" />
            </div>
          {/if}
        {/if}
      </div>
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
  .centre {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    text-align: center;
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
  .kicker {
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
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
  /* The step-down reads as a second thought under the ending, not as a second
     offer beside it, so it is separated and left-aligned against the centred
     column above it. */
  .stepdown {
    width: 100%;
    margin-top: var(--space-s);
    padding-top: var(--space-s);
    border-top: var(--edge-thin);
    text-align: left;
  }
  .plain {
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
</style>
