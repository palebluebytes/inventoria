<script lang="ts">
  import { onMount } from "svelte";
  import type { ReceiveOpening } from "../../p2p/receive-link";
  import type { ReceivedMealPayload } from "../../p2p/meal-reader";
  import type { SendCode } from "../../p2p/send-code";
  import { receiveMealPayload } from "../../p2p/meal-send";
  import { readReceivedMeal, type ReceivedMeal } from "../../p2p/received-meal";
  import { acceptMealPayload } from "../../p2p/meal-accept";
  import {
    MEAL_HAS_NOTHING,
    mealCodeBrokenWords,
    mealLandedWords,
    receiveEndingWords,
    type ReceiveWords,
  } from "../../p2p/receive-words";
  import { writeDate } from "../../p2p/send-date";
  import { formatCalories } from "../../food/nutrient-display";
  import { calorieDisplayDecimals } from "../../stores/device-settings";
  import Button from "../../ui/Button.svelte";
  import EndingLine from "./EndingLine.svelte";
  import NutritionPanel from "./NutritionPanel.svelte";

  // The **Receiving surface**: the meal itself, with nothing in front of it
  // (ADR-0074 §4, ADR-0073 §10).
  //
  // It is the mirror of the way out, and it is deliberately the same panel: the
  // sender's meal panel turns into the code, and the code turns back into a
  // meal panel here. There is no lobby, no inbox and no list — a meal reaches
  // you by a link you opened or a code you scanned, and both land you on it
  // deciding.
  //
  // **This surface IS the hold.** The payload lives in this component for the
  // life of this view and nowhere else: no `localStorage`, no OPFS file, no
  // second table, no expiry timer and no sweep. So **leaving is declining**, by
  // any route — the close button, Escape, the backdrop, wandering to another
  // Tab (which unmounts the food screen under it), backgrounding, an OS purge.
  // The runtime cannot tell those apart, so they behave identically, and
  // **leaving does not ask**: guarding a loss ADR-0073 §10 prices as cheap with
  // a modal would be incoherent, and it would be the first chrome in a flow
  // built with none. The recovery is that a send is synchronous, so the sender
  // is still standing there and mints another code.
  let {
    opening,
    selectedDate,
    dbReady,
    onLeave,
  }: {
    /**
     * What this was opened on: the Send code a link or a scan carried, or the
     * reason there is no code in it. A damaged code opens the surface too,
     * because somebody tapped a link and being shown nothing at all reads as a
     * broken app rather than as a broken code.
     */
    opening: ReceiveOpening;
    /** The day the food screen is showing, which is where the meal lands. */
    selectedDate: Date;
    dbReady: boolean;
    /** Unmounts this surface, which is the whole of declining. */
    onLeave: () => void;
  } = $props();

  /** The payload, held here and nowhere else, for as long as this exists. */
  let payload = $state<ReceivedMealPayload | null>(null);
  /** What the payload turns out to be: the meal, as a meal. */
  let meal = $state<ReceivedMeal | null>(null);
  /** How this ended — a refusal, or the meal landing. Null while it is live. */
  let ended = $state<ReceiveWords | null>(null);
  /** True while the accept path is writing, so the offer cannot be taken twice. */
  let keeping = $state(false);

  /** Live while we are waiting: leaving aborts it, which is what declining is. */
  const session = new AbortController();

  // The wait starts with the surface and cannot outlive it. A receive is not
  // started by anything else in the app — nothing listens for a send it was not
  // asked for (ADR-0072 §5) — so this is the only place a room is ever joined
  // to wait in.
  //
  // `onMount` rather than an `$effect`, because this must happen exactly once:
  // a code is single-use, so an effect re-running on a prop it happened to read
  // would abort a live session and rejoin its room with a spent code. What
  // opens this surface is settled by the act that opened it.
  onMount(() => {
    // A damaged code joins no room: there is no room in it to join, and the
    // sender's own code is still live and still theirs.
    if (opening.kind === "broken") ended = mealCodeBrokenWords(opening.reason);
    else void waitForMeal(opening.code);
    return () => session.abort();
  });

  async function waitForMeal(code: SendCode) {
    try {
      const arrived = await receiveMealPayload(code, {
        signal: session.signal,
      });
      // The seven refusals are already spent: `receiveMealPayload` judged them
      // as the bytes arrived, before anything could reach this screen
      // (ADR-0073 §8). What is left is whether there is a meal in it.
      const read = readReceivedMeal(arrived);
      if (read === null) {
        ended = MEAL_HAS_NOTHING;
        return;
      }
      payload = arrived;
      meal = read;
    } catch (failure) {
      ended = receiveEndingWords(failure);
    }
  }

  /**
   * Keeps the meal: re-logged on this device's clock, into the meal it was sent
   * as, on the day the food screen is showing (ADR-0073 §5 and §7).
   *
   * **The day is the food screen's, exactly as it is for every other way into a
   * meal.** A received meal is `copyPastMeal` with a wire in front of it (§5),
   * and that copy lands on the day being viewed; a receive that overrode it
   * with "today" would be the one door in the app that ignores the week strip.
   * A link opened cold is not an exception — the food screen starts on today,
   * so the cold case reaches the same day by the ordinary rule rather than by a
   * special one.
   */
  async function keep() {
    const held = payload;
    const kept = meal;
    if (!held || !kept || keeping) return;
    keeping = true;
    try {
      const landed = await acceptMealPayload(
        held,
        kept.meal_type,
        selectedDate
      );
      ended = mealLandedWords(landed, kept.meal_type);
    } catch (failure) {
      ended = receiveEndingWords(failure);
    } finally {
      keeping = false;
      // The hold ends the moment the decision is made, whichever way it went.
      payload = null;
    }
  }
</script>

<NutritionPanel
  title={meal ? meal.meal_type.toUpperCase() : "A MEAL"}
  testId="received-meal"
  onClose={onLeave}
>
  {#snippet body()}
    <div class="inset centre" data-testid="received-meal-body">
      {#if ended}
        <!-- One line, in the app's voice, with the technical cause behind a
             "show why" (ADR-0074 §6) — the shape both ends of a send print. -->
        <EndingLine words={ended} ok={ended.ending === "landed"} />
        <Button variant="secondary" size="sm" onclick={onLeave}>Done</Button>
      {:else if meal}
        <!-- What is being handed over. It writes a date rather than "Today" or
             "Tuesday" (ADR-0074 §7): this is somebody else's day, and a weekday
             names nothing across two devices. -->
        <p class="kicker">
          {meal.items.length}
          {meal.items.length === 1 ? "food" : "foods"} · {formatCalories(
            meal.calories,
            $calorieDisplayDecimals
          )} · {writeDate(meal.date)}
        </p>

        <ul class="foods">
          {#each meal.items as item (item.id)}
            <li>
              <span class="name">{item.foodName}</span>
              <span class="kcal"
                >{formatCalories(item.calories, $calorieDisplayDecimals)}</span
              >
            </li>
          {/each}
        </ul>

        <Button
          variant="primary"
          disabled={!dbReady || keeping}
          onclick={keep}
          data-testid="received-meal-keep"
        >
          {keeping ? "Adding…" : `Add to my ${meal.meal_type}`}
        </Button>
        <!-- Which day it lands on, before the tap rather than after it. A
             written date rather than "Today" for §7's reason, which holds with
             more force here than on the sending screen: the person who sent it
             is standing next to you looking at it, and "Today" is a claim about
             whose day. -->
        <p class="fine">
          It goes in {writeDate(selectedDate)}, on your own clock. Leave and it
          is gone: nothing of theirs is kept unless you keep it.
        </p>
      {:else}
        <p class="waiting" role="status">Waiting for their meal…</p>
        <p class="fine">
          They are holding the code open. Leave and nothing arrives.
        </p>
      {/if}
    </div>
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
  .kicker {
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  /* The meal as a list rather than as cards: nothing here is a reading against
     a target, because none of it is in anybody's day yet. */
  .foods {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    text-align: left;
  }
  .foods li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-s);
    padding: var(--space-3xs) 0;
    border-bottom: var(--edge-thin);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kcal {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }
  .fine {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .waiting {
    margin: var(--space-s) 0 0;
    color: var(--text-muted);
  }
</style>
