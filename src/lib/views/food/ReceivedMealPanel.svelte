<script lang="ts">
  import { onMount } from "svelte";
  import type { ReceiveOpening } from "../../p2p/receive-link";
  import type { ReceivedMealPayload } from "../../p2p/meal-reader";
  import type { SendCode } from "../../p2p/send-code";
  import { receiveMealPayload } from "../../p2p/meal-send";
  import {
    readReceivedMeals,
    type ReceivedMeal,
  } from "../../p2p/received-meal";
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
  /**
   * What the payload turns out to be: its meals, as meals.
   *
   * Plural because a day can be handed over (ADR-0073's 2026-09-01 amendment),
   * and one meal is the case where this has one entry rather than a shape of
   * its own — so the surface has one thing to render and no branch about which
   * kind of hand-off it is holding.
   */
  let meals = $state<ReceivedMeal[]>([]);
  /** How this ended — a refusal, or the meal landing. Null while it is live. */
  let ended = $state<ReceiveWords | null>(null);
  /** True while the accept path is writing, so the offer cannot be taken twice. */
  let keeping = $state(false);

  /**
   * What the panel is called. One meal is named; several is a day, because the
   * sender handed over a whole day's panel and naming four meal types in a
   * heading would say less than the word does.
   */
  let panelTitle = $derived(
    meals.length === 1
      ? meals[0].meal_type.toUpperCase()
      : meals.length > 1
        ? "A DAY"
        : "A MEAL"
  );

  /** The whole hand-off as one line's worth of figures, meal or day. */
  let foods = $derived(
    meals.reduce((count, meal) => count + meal.items.length, 0)
  );
  let calories = $derived(
    meals.reduce((total, meal) => total + meal.calories, 0)
  );

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
      const read = readReceivedMeals(arrived);
      if (read.length === 0) {
        ended = MEAL_HAS_NOTHING;
        return;
      }
      payload = arrived;
      meals = read;
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
    const offered = meals.length;
    if (!held || offered === 0 || keeping) return;
    keeping = true;
    try {
      // No meal type is passed: every event lands in the one it carries, which
      // is the whole of what lets a day arrive as a day.
      const landed = await acceptMealPayload(held, selectedDate);
      ended = mealLandedWords(landed, offered);
    } catch (failure) {
      ended = receiveEndingWords(failure);
    } finally {
      keeping = false;
      // The hold ends the moment the decision is made, whichever way it went.
      payload = null;
    }
  }
</script>

<NutritionPanel title={panelTitle} testId="received-meal" onClose={onLeave}>
  {#snippet body()}
    <div class="inset centre" data-testid="received-meal-body">
      {#if ended}
        <!-- One line, in the app's voice, with the technical cause behind a
             "show why" (ADR-0074 §6) — the shape both ends of a send print. -->
        <EndingLine words={ended} ok={ended.ending === "landed"} />
        <Button variant="secondary" size="sm" onclick={onLeave}>Done</Button>
      {:else if meals.length > 0}
        <!-- What is being handed over. It writes a date rather than "Today" or
             "Tuesday" (ADR-0074 §7): this is somebody else's day, and a weekday
             names nothing across two devices. -->
        <p class="kicker">
          {foods}
          {foods === 1 ? "food" : "foods"} · {formatCalories(
            calories,
            $calorieDisplayDecimals
          )} · {writeDate(meals[0].date)}
        </p>

        <!-- One list per meal, headed only when there is more than one: a
             single meal is already named by the panel above it, and heading it
             again would be the same word twice. A day needs the headings,
             because which meal each food is going into is the thing that
             distinguishes it from a pile. -->
        {#each meals as meal (meal.meal_type)}
          {#if meals.length > 1}
            <p class="meal-name">{meal.meal_type.toUpperCase()}</p>
          {/if}
          <ul class="foods">
            {#each meal.items as item (item.id)}
              <li>
                <span class="name">{item.foodName}</span>
                <span class="kcal"
                  >{formatCalories(
                    item.calories,
                    $calorieDisplayDecimals
                  )}</span
                >
              </li>
            {/each}
          </ul>
        {/each}

        <Button
          variant="primary"
          disabled={!dbReady || keeping}
          onclick={keep}
          data-testid="received-meal-keep"
        >
          {keeping
            ? "Adding…"
            : meals.length === 1
              ? `Add to my ${meals[0].meal_type}`
              : "Add to my day"}
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
  /* Names the meal a group of foods is going into, on a day carrying several.
     Left-aligned against the list under it rather than centred with the column,
     because it labels that list. */
  .meal-name {
    width: 100%;
    margin: var(--space-2xs) 0 var(--space-3xs);
    font-size: var(--step-n2);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    text-align: left;
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
