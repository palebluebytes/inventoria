<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    consumptionStore,
    consumptionForDay,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import { hasPastMeal, type CopyNote } from "../../food/past-meals";
  import { loggedDayKeys } from "../../food/logged-days";
  import type { WayIn } from "../../food/ways-in";
  import { MEAL_TYPES, type MealType } from "../../food/meal-type";
  import { totalNutrition } from "../../food/consumption-state";
  import {
    buildNutrientMeters,
    buildNutrientPills,
    buildDayRdaView,
    macroNutrients,
    nutrientShortLabel,
    SECTION_MACROS,
    SECTION_MICROS,
    SECTION_LIMITS,
  } from "../../food/nutrient-display";
  import {
    resolveNutrientTargets,
    resolveNutrientLimits,
    defaultNutrientTargets,
  } from "../../food/nutrition-targets";
  import {
    foodTargets,
    foodLimits,
    foodCalculatedTargets,
  } from "../../stores/device-settings";
  import {
    visibleNutrients,
    caloriesTracked,
    nutritionPanelOpen,
    setNutritionPanelOpen,
    calorieDisplayDecimals,
  } from "../../stores/device-settings";
  import { parseLoggedQuantity } from "../../food/recipe-ingredient";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Skeleton from "../../ui/Skeleton.svelte";
  import Button from "../../ui/Button.svelte";
  import Disclosure from "../../ui/Disclosure.svelte";
  import FoodItemRow from "./FoodItemRow.svelte";
  import MacroMeters from "./MacroMeters.svelte";
  import WeekStrip from "./WeekStrip.svelte";
  import MonthCalendar from "./MonthCalendar.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";
  import NutrientGroupHead from "./NutrientGroupHead.svelte";
  import NutritionPanel from "./NutritionPanel.svelte";
  import SendFace from "./SendFace.svelte";
  import WayOutIcon from "./WayOutIcon.svelte";
  import NutritionPanelCell from "./NutritionPanelCell.svelte";
  import { longpress } from "../../actions/longpress";
  import type { ScalePreview } from "../../food/scale-amount";
  import WayInBar from "./WayInBar.svelte";
  import LoggedFoodsPanel from "./LoggedFoodsPanel.svelte";

  let {
    dbReady,
    selectedDate = $bindable(new Date()),
    onEnterMeal,
    copyNote = null,
    selectedIds,
    onLongPressItem,
    onTapItem,
    onEditItem,
    onRemoveItem,
    scalePreview,
    scaleNotes,
    selectionBar,
  }: {
    dbReady: boolean;
    selectedDate: Date;
    /** A way in was tapped on the day's Way-in bar: which meal, which way in
     *  (ADR-0059's roster, ADR-0101's surface). */
    onEnterMeal: (meal_type: MealType, kind: WayIn) => void;
    /**
     * The Selection bar, handed in rather than rendered beside the day, so that
     * ONE render can sit in two places (ADR-0101 §4).
     *
     * Below 768 it is `position: fixed` and where it stands in the markup buys
     * nothing. Above it, it is sticky in the slot the Way-in bar occupies — and
     * a box can only stick where it stands, which is the whole reason this is a
     * prop and not a sibling in `FoodView`.
     *
     * Required, not optional: the day has exactly one host and it always passes
     * one. The snippet is empty while no Selection exists, which is where that
     * condition belongs — a day with no bar to render is not a case this
     * component has, and an `?` here would be an invariant papered over
     * (CODING_STANDARDS §3.2).
     */
    selectionBar: Snippet;
    /** The line a partial copy left behind (ADR-0058 §11), or null after a
     *  clean one. The host only passes one that belongs to the day on screen. */
    copyNote?: CopyNote | null;
    selectedIds: Set<string>;
    onLongPressItem: (id: string) => void;
    onTapItem: (id: string) => void;
    /** Plain click on a card (outside selection mode) opens it for editing. */
    onEditItem: (item: ConsumptionEvent) => void;
    /** The card's ✕ removes the logged entry (append-only retraction). */
    onRemoveItem: (id: string) => void;
    /** What each food WOULD read at while a Scale preview is live, keyed by
     *  Consumption Event id (ADR-0088 §5). The list is the preview surface;
     *  nothing copies it into the control. */
    scalePreview?: Map<string, ScalePreview>;
    /** A word for a food the live preview cannot touch, keyed the same way —
     *  said in place and before the fact, never reported afterwards (§7). */
    scaleNotes?: Map<string, string>;
  } = $props();

  // Long-press a logged item to start selecting; while a selection is active,
  // tapping items toggles them (for building a recipe from them).
  let selectionActive = $derived(selectedIds.size > 0);

  // How much of the day's foot the pinned Way-in bar is standing on, below 768.
  // Measured rather than restated: the bar's height is genuinely unknown, since
  // its rail drops a cell for a meal with no past (ADR-0059 §4) and its captions
  // ride a fluid scale, so a spacer written as a sum of tokens would be a second
  // copy of that geometry and wrong for one of the four meals.
  //
  // **The reserve is the last UNFOLDED measurement**, which is why these are two
  // values rather than one. The bar collapses to nothing while a Selection is
  // live (ADR-0101 §4), and letting the reserve collapse with it would shorten
  // the page's scroll range at the exact moment the Selection bar arrives to
  // stand in the same place at much the same height. The day reserves the foot
  // of the screen for whichever bar is in it.
  let wayInBarMeasured = $state(0);
  let wayInBarReserve = $state(0);
  $effect(() => {
    if (!selectionActive && wayInBarMeasured > 0)
      wayInBarReserve = wayInBarMeasured;
  });

  // A long-press is followed by a synthetic click on release; without this the
  // click would immediately toggle the item we just selected back off.
  let suppressNextClick = false;

  function onCardLongPress(id: string) {
    suppressNextClick = true;
    onLongPressItem(id);
  }

  // Clear the flag at the start of every new pointer gesture. The trailing
  // click belongs to the long-press's own gesture (no fresh pointerdown), so it
  // is still suppressed — but if that click never arrives (a reflow when the
  // selection UI appears can move the card out from under the pointer; touch
  // long-presses often emit no click at all), the flag would otherwise stay set
  // and swallow the user's next tap. Resetting here makes it self-healing.
  function onCardPointerDown() {
    suppressNextClick = false;
  }

  function onCardClick(item: ConsumptionEvent) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    // In selection mode a tap toggles the item; otherwise it opens the editor.
    if (selectionActive) onTapItem(item.id);
    else onEditItem(item);
  }

  // Selected day's consumption, narrowed from the global projection on the main thread
  let dayItems = $derived(consumptionForDay($consumptionStore, selectedDate));

  // Which days in the whole history have food on them, for the month calendar's
  // marks (#344). Read off the same projection the day is narrowed from, and
  // over ALL of it rather than the visible month: the grid draws a fixed six
  // weeks, so it always shows days either side of the month it names, and a
  // window would have to move with the calendar's own paging — which this
  // screen deliberately does not know about.
  let loggedDays = $derived(loggedDayKeys($consumptionStore));

  // Whether the day on screen is a day we have actually read. The projection's
  // placeholder is `[]`, which is the same value as a day with nothing logged, so
  // without this the screen spends the database's whole boot saying "No breakfast
  // logged yet" — a false statement, not a missing spinner. `failed` counts as
  // known: there is nothing more coming, and an empty day is then the truthful
  // reading of what we have.
  const consumptionStatus = consumptionStore.status;
  let dayKnown = $derived($consumptionStatus !== "pending");

  // The resolved daily targets both surfaces read: the default set — the cited
  // baked reference (energy + macros + fibre + the twelve micronutrients) with the
  // calculator's frozen energy/macro figures layered on top (ADR-0033 §4) — under
  // the user's per-nutrient overrides via the merge resolver (ADR-0031 §1/§2). An
  // untouched target stays at that default; a `> 0` override wins; a `0` opts a
  // nutrient out of a bar. `energy` clamps a non-positive override back to the
  // default so the always-on calorie meter can never be target-less. Every visible
  // micronutrient fills against its FDA Daily Value instead of an empty track.
  let resolvedTargets = $derived(
    resolveNutrientTargets(
      $foodTargets,
      defaultNutrientTargets($foodCalculatedTargets)
    )
  );

  // The resolved stay-under limits (ADR-0032): the baked caps layered with the
  // user's stay-under overrides, fed to the modal builder so its
  // Limits section fills each carried limit toward its cap (amber once over).
  let resolvedLimits = $derived(resolveNutrientLimits($foodLimits));

  // The full day breakdown for ANY nutrient, summed from each event's frozen
  // metrics (#28's totalNutrition) — the single source the meters read from, so
  // we never re-derive day totals here.
  let dayTotals = $derived(totalNutrition(dayItems));

  // Turn the user's selection (default Protein/Fat/Carbs/Fibre) + the day totals
  // + the targets into the meter view models the summary renders. Calories lead
  // that list as one more bar — the builder adds them, filling toward the
  // resolved `energy` target, in the same shape as every other nutrient — and
  // are put away like one, through their own preference (see `caloriesTracked`
  // for why it is not a member of the selection list).
  let meters = $derived(
    buildNutrientMeters(
      dayTotals,
      $visibleNutrients,
      resolvedTargets,
      $calorieDisplayDecimals,
      $caloriesTracked
    )
  );

  // Whether the meter block is open. The bars are the page's tallest block and
  // the meals below them are what a user comes back to during the day, so the
  // whole set folds away behind its header.
  //
  // The fold persists, so a user who keeps the bars shut is not reopening them
  // every visit. It reads from `localStorage` rather than the ledger because the
  // FIRST PAINT depends on it: every ledger store waits on the worker, the WASM
  // and OPFS, and until that resolves a settings read returns the unset default —
  // which showed the panel open for seconds before folding it. See
  // `stores/device-settings.ts` for why that makes this a different kind of value
  // from `round_nutrition`, which sits beside it in the ledger quite happily.
  // Stable id so the header's toggle can point `aria-controls` at the body it
  // opens. localhost/PWA is always a secure context, so randomUUID exists.
  const metersId = `day-meters-${crypto.randomUUID()}`;

  // The full-day RDA-vs-target view (ticket #42/#43, ADR-0031 §4 / ADR-0032 §4):
  // the same day totals grouped against the resolved targets and limits — Biggest
  // gaps, Energy & macros, Vitamins & minerals, Limits, and Not tracked.
  // Independent of `visible_nutrients`: the targeted sections carry the whole
  // reach-toward set (an absent nutrient reads `— / target`), so the modal is the
  // "everything, against target" surface while the meters above stay
  // selection-gated. The Limits section shows only the limits the day carried.
  let dayRda = $derived(
    buildDayRdaView(dayTotals, resolvedTargets, {
      calorieDecimals: $calorieDisplayDecimals,
      selection: $visibleNutrients,
      limits: resolvedLimits,
    })
  );

  // Whether any food has been logged for the day. The RDA sections always carry
  // the full reach-toward set (every macro/micro shows, absent ones as
  // `— / target`), so on an untouched day the modal would be a wall of "no data".
  // Gate on real logged items: an empty day shows a plain "no food added" state
  // instead, and only fills the sections once something is logged.
  let hasLoggedFood = $derived(dayItems.length > 0);

  // The day's way out (ADR-0074 §1, amended 2026-09-01). The full-day panel is
  // a meal's panel one scale up and it hands over the same way: the panel turns
  // into the code, and `SendFace` is literally the same component rather than a
  // second copy of a live secret's lifecycle.
  //
  // What crosses is every Consumption Event on the day, and each one lands in
  // the Meal Type it carries — so a day arrives as a day rather than as one
  // enormous breakfast (ADR-0073 §5, amended the same day).
  let handingDay = $state(false);
  let showFullDay = $state(false);

  // Which meal's own panel is open (ADR-0074 §1), reached from the meal's name
  // or from its subtotal line. It holds the meal type rather than the rows, so
  // the panel re-reads the day it is looking at: logging into a meal while its
  // panel is open must not leave the panel showing a total that has moved on.
  let mealPanel = $state<MealType | null>(null);

  function formatDateHeader(date: Date): string {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  // Group events by meal type
  const meal_types = MEAL_TYPES;
  // Which meals have a past instance to copy (ADR-0058 §7 / ADR-0059 §4). The
  // whole history is walked, not the visible day: the control asks about every
  // other day. A meal with none loses its control rather than showing a dead
  // one, so this is read per meal rather than once.
  let mealHasPast = $derived.by(() => {
    const has = {} as Record<MealType, boolean>;
    for (const m of meal_types)
      has[m] = hasPastMeal($consumptionStore, m, selectedDate);
    return has;
  });

  let groupedMeals = $derived.by(() => {
    const groups: Record<(typeof meal_types)[number], any[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const item of dayItems) {
      const type = (
        item.meal_type || "snack"
      ).toLowerCase() as (typeof meal_types)[number];
      if (groups[type]) {
        groups[type].push(item);
      } else {
        groups.snack.push(item);
      }
    }
    return groups;
  });

  // Selected photo modal inside dashboard
  let previewPhoto = $state<string | null>(null);
</script>

<!-- ── The day ────────────────────────────────────────────────────────────
     The day screen, and the element the two-region grid is written on
     (ADR-0091 §3). The grid is scoped to this box rather than to the shell for
     a reason the prototype found by getting it wrong: written on `.main` it
     outlived the screen it was drawn for, and a page — which carries no grid
     area — auto-placed into the timeline's column with the rail sitting empty
     beside it. A page is not the day, so it cannot inherit the day's shape.

     The overlays below stay outside it. They are pinned boxes rather than
     regions of a screen, and a grid should never have to know that one of its
     children took itself out of flow. -->
<div class="day">
  <!-- Week Strip date selector. In a box of its own because a grid places its
       children, and this child is another component's root: the box is this
       screen's handle on where the strip goes, rather than this screen reaching
       into `WeekStrip`'s class names to say it. -->
  <div class="day-strip">
    <WeekStrip bind:selectedDate />
  </div>

  <!-- The rail's top block, and the strip's counterpart rather than a second
       date control: exactly one of the two is on screen at any width, and the
       swap is CSS in this file because it is a fact about the shape of the day
       rather than anything either component knows (ADR-0091 §1, #344). Its own
       box for the same reason the strip has one — a grid places its children,
       and this child is another component's root. -->
  <div class="day-month">
    <MonthCalendar bind:selectedDate {loggedDays} />
  </div>

  <!-- Header Info -->
  <div class="dashboard-header">
    <h2>{formatDateHeader(selectedDate)}</h2>
  </div>

  <!-- The day's totals: one bar per nutrient, Calories first among equals. Its
       header carries both controls — the disclosure that folds the bars away, and
       the way into the full day RDA-vs-target modal (ticket #42), which used to be
       an unlabelled tap on the whole block. The modal control stays in the header
       so it is still reachable with the bars collapsed, and it keeps its old
       accessible name. Always openable: an untouched day opens to a plain "no food
       added" state rather than nothing. -->
  <section class="aggregates">
    <div class="aggregates-head">
      <Disclosure
        class="aggregates-toggle"
        title="Nutrition"
        open={$nutritionPanelOpen}
        controls={metersId}
        onToggle={() => setNutritionPanelOpen(!$nutritionPanelOpen)}
      />
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-label="Show full day nutrition"
        onclick={() => (showFullDay = true)}>Full day</Button
      >
    </div>
    <div
      id={metersId}
      class="aggregates-body"
      hidden={!$nutritionPanelOpen}
      aria-busy={!dayKnown}
    >
      <!-- The rows are drawn either way; unknown withholds their figures rather
           than printing a "0 kcal" nobody has read. -->
      <MacroMeters {meters} loading={!dayKnown} />
    </div>
  </section>

  <!-- Timeline & Logged Meals -->
  <div class="timeline mt-6" style="--way-in-bar-h: {wayInBarReserve}px">
    <!-- The slot the two bars share (ADR-0101 §4). Above 768 they STACK in one
         grid cell rather than following each other down the page, which is what
         lets a Selection cover the Way-in bar up here the way z-index covers it
         on a phone. The slot owns the sticky, because a sticky box can only
         travel inside a containing block taller than itself and a two-item stack
         is not one.

         Both are rendered HERE, in flow, because that is what the sticky half
         needs; the pinned half takes itself out of flow from the same place. -->
    <div class="way-in-slot">
      <WayInBar
        folded={selectionActive}
        {dbReady}
        {mealHasPast}
        {onEnterMeal}
        bind:height={wayInBarMeasured}
      />
      <!-- The Selection's own bar, in the Way-in bar's slot. The two never stand
           here together — the Way-in bar folds the moment a Selection exists,
           which is what `folded` above is — so the slot holds whichever one the
           screen is in. -->
      {@render selectionBar()}
    </div>
    {#each meal_types as meal_type}
      <div class="meal-section">
        <div class="meal-section-header">
          <!-- The meal's name is the way into its own nutrition panel, and the
               one that always works: an empty meal has no subtotal line at all
               (ADR-0074 §1). A button INSIDE the heading rather than a heading
               that is a button, so the row is still the meal's h3 to anything
               reading the page's outline and only the words are the control.

               It is not a sixth way in. ADR-0059's header is untouched: this
               control was already on the screen as inert text. -->
          <h3 class="meal-title">
            <button
              type="button"
              class="meal-title-btn"
              aria-haspopup="dialog"
              onclick={() => (mealPanel = meal_type)}
              >{meal_type.toUpperCase()}</button
            >
          </h3>
          <!-- No way in here. They left for the day's one Way-in bar above
               (ADR-0101 §1), which is the whole of what that record amends in
               ADR-0059: five floored controls plus their gaps is 276px, and the
               header could not hold that beside the meal's name on any phone
               under ~414px. The header keeps its name, its nutrition-panel
               control and its subtotal. -->
        </div>

        {#if copyNote && copyNote.meal_type === meal_type}
          <!-- ADR-0058 §11: a clean copy says nothing, so this exists only when
               something went wrong. -->
          <p class="meal-note" role="status">{copyNote.text}</p>
        {/if}

        {#if !dayKnown}
          <!-- Not "no breakfast" — we have not read the day yet. One row's worth of
               placeholder, which is also the height an empty meal's message takes,
               so neither outcome moves the meals below it. -->
          <div class="meal-skeleton" aria-busy="true">
            <Skeleton height="var(--step-n2)" width="60%" />
          </div>
        {:else if groupedMeals[meal_type].length === 0}
          <div class="empty-meal">
            <p>No {meal_type} logged yet.</p>
          </div>
        {:else}
          {@const mealPills = buildNutrientPills(
            totalNutrition(groupedMeals[meal_type]),
            macroNutrients($visibleNutrients),
            $calorieDisplayDecimals,
            true
          )}
          <div class="meal-items-list">
            {#each groupedMeals[meal_type] as item}
              {@const isSelected = selectedIds.has(item.id)}
              {@const qty = parseLoggedQuantity(item.quantity)}
              <!-- While a selection is active the check takes the remove ✕'s
                   corner: the whole card is the tap target then, so the ✕ has no
                   role, and the check reads where the eye already looks. -->
              {#snippet selectCheck()}
                <span
                  class="select-check"
                  class:on={isSelected}
                  aria-hidden="true">{isSelected ? "✓" : ""}</span
                >
              {/snippet}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <div
                class="meal-item-card"
                class:selectable={selectionActive}
                class:selected={isSelected}
                use:longpress={{ onlongpress: () => onCardLongPress(item.id) }}
                onpointerdown={onCardPointerDown}
                onclick={() => onCardClick(item)}
                onkeydown={(e) =>
                  selectionActive &&
                  (e.key === "Enter" || e.key === " ") &&
                  onTapItem(item.id)}
                role={selectionActive ? "button" : undefined}
                tabindex={selectionActive ? 0 : undefined}
              >
                <FoodItemRow
                  logged
                  name={item.foodName || "Unknown Food"}
                  amount={qty.amount}
                  unit={qty.unit}
                  calories={Number(item.calories) || 0}
                  selected={isSelected}
                  preview={scalePreview?.get(item.id)}
                  note={scaleNotes?.get(item.id) ?? ""}
                  onRemove={() => onRemoveItem(item.id)}
                  corner={selectionActive ? selectCheck : undefined}
                >
                  {#snippet lead()}
                    {#if item.photoBase64}
                      <button
                        type="button"
                        class="meal-item-thumb-btn"
                        aria-label="View {item.foodName} photo"
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={(e) => {
                          e.stopPropagation();
                          if (suppressNextClick) {
                            suppressNextClick = false;
                            return;
                          }
                          if (selectionActive) onTapItem(item.id);
                          else previewPhoto = item.photoBase64;
                        }}
                      >
                        <img
                          src={item.photoBase64}
                          alt={item.foodName}
                          class="meal-item-thumb"
                        />
                      </button>
                    {/if}
                  {/snippet}
                </FoodItemRow>
              </div>
            {/each}
          </div>
          <!-- Subtle one-line subtotal for the section: Calories + just the macros
               the user tracks (micronutrients belong on the full-day RDA surface,
               not a running tally), summed over only this meal's items. Empty
               macros are dropped (hideEmpty) — a "0 g" or absent "–" adds no
               information, and a calories-only meal reads as just its kcal. -->
          <!-- The other way into the meal's own figures (ADR-0074 §1): the line
               of figures a meal already ends in, which did nothing. It is the
               convenience rather than the door — a meal with no rows never
               renders it, which is why the name is the one that always works. -->
          <button
            type="button"
            class="meal-total meal-total-btn"
            data-testid="meal-total-{meal_type}"
            aria-haspopup="dialog"
            aria-label="{meal_type} nutrition"
            onclick={() => (mealPanel = meal_type)}
          >
            {#each mealPills as pill (pill.key)}
              <span class="meal-total-item nutrient-{pill.key}">
                {#if pill.key !== "calories"}<span
                    >{nutrientShortLabel(pill.key)}</span
                  >{/if}<span class="meal-total-value">{pill.value}</span>
              </span>
            {/each}
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- Full day nutrition Modal: opened by tapping the aggregates. The full
     RDA-vs-target picture (ticket #42) — a Biggest-gaps ranking strip, then every
     reach-toward nutrient against its target (absent ones as `— / target`), then
     the untargeted nutrients the day carried. Independent of visible_nutrients. -->
{#if showFullDay}
  <!-- Beside the panel's name, because it is a control on the SUBJECT of the
       panel rather than on the panel — the same place, the same square and
       the same icon as a meal's. Absent while handing, and absent on a day
       with nothing in it, on ADR-0059 §4's rule that a control which can be
       dead on arrival is hidden rather than disabled.

       The condition is on the snippet rather than inside it: the header
       reserves a slot for whatever it is handed, so a snippet that renders
       nothing would leave the rails wide and the title off centre. -->
  {#snippet dayWayOut()}
    <button
      type="button"
      class="way-out"
      data-testid="day-way-out"
      aria-label="Hand this day to someone"
      title="Hand this day to someone"
      onclick={() => (handingDay = true)}
    >
      <WayOutIcon />
    </button>
  {/snippet}

  <NutritionPanel
    title="Full day nutrition"
    testId="day-nutrient-breakdown"
    actions={!handingDay && dayKnown && hasLoggedFood ? dayWayOut : undefined}
    onClose={() => {
      showFullDay = false;
      handingDay = false;
    }}
  >
    {#snippet body()}
      {#if handingDay}
        <SendFace
          roots={dayItems.map((item) => item.id)}
          foods={dayItems.length}
          calories={dayTotals.calories}
          date={selectedDate}
          calorieDecimals={$calorieDisplayDecimals}
        />
      {:else if !dayKnown}
        <!-- The same distinction the dashboard draws: an unread day is not an
                 empty one, and this modal must not claim it is either. -->
        <div class="rda-empty" data-testid="rda-loading" aria-busy="true">
          <p class="rda-empty-title">Reading your day…</p>
        </div>
      {:else if !hasLoggedFood}
        <!-- Nothing logged: the reach-toward sections would be a wall of "no
                 data", so show a plain empty state instead. -->
        <div class="rda-empty" data-testid="rda-empty">
          <p class="rda-empty-title">No food added yet</p>
          <p class="rda-empty-hint">
            Log a meal to see your day against target.
          </p>
        </div>
      {:else}
        {#if dayRda.gaps.length > 0}
          <NutrientGroupHead label="Biggest gaps" />
          <div class="rda-gaps" data-testid="rda-gaps">
            {#each dayRda.gaps as gap (gap.key)}
              <span class="rda-chip nutrient-{gap.key}">
                {gap.label}
                <span class="rda-chip-pct"
                  >{gap.percent === null ? "no data" : `${gap.percent}%`}</span
                >
              </span>
            {/each}
          </div>
        {/if}

        <NutrientGroupHead label={SECTION_MACROS} />
        <NutrientCardGrid>
          {#each dayRda.macros as row (row.key)}
            <NutritionPanelCell {row} />
          {/each}
        </NutrientCardGrid>

        {#if dayRda.micros.length > 0}
          <NutrientGroupHead label={SECTION_MICROS} />
          <NutrientCardGrid>
            {#each dayRda.micros as row (row.key)}
              <NutritionPanelCell {row} />
            {/each}
          </NutrientCardGrid>
        {/if}

        <!-- Stay-under limits (ADR-0032): the same rdaCell, filling toward the
                 cap and tinting amber once over. Only limits the day carried show. -->
        {#if dayRda.limits.length > 0}
          <NutrientGroupHead label={SECTION_LIMITS} />
          <NutrientCardGrid>
            {#each dayRda.limits as row (row.key)}
              <NutritionPanelCell {row} />
            {/each}
          </NutrientCardGrid>
        {/if}

        {#if dayRda.untracked.length > 0}
          <NutrientGroupHead label="Not tracked ({dayRda.untracked.length})" />
          {#each dayRda.untracked as row (row.key)}
            <div class="rda-untracked-row nutrient-{row.key}">
              <span class="rda-untracked-label">{row.label}</span>
              <span class="rda-untracked-value">{row.value}</span>
            </div>
          {/each}
        {/if}
      {/if}
    {/snippet}
  </NutritionPanel>
{/if}

<!-- One meal, entire — and the way out of it (ADR-0074 §1 to §3). The same
     panel the day's aggregates open, one scale down: same shell, same cells,
     minus the five readings that are about a day rather than a meal. -->
{#if mealPanel}
  <LoggedFoodsPanel
    title={mealPanel.toUpperCase()}
    subject="this {mealPanel}"
    testId="meal-nutrient-breakdown"
    wayOutTestId="meal-way-out"
    date={selectedDate}
    items={groupedMeals[mealPanel]}
    targets={resolvedTargets}
    calorieDecimals={$calorieDisplayDecimals}
    onClose={() => (mealPanel = null)}
  />
{/if}

<!-- The photo, on the one overlay shape a phone has (ADR-0089 §6, #329). It was
     a centred card at 90vh with the way out floating 40px above its top edge,
     outside the box; the sheet's header carries that, and the body scrolls on
     the rare photo taller than the band. -->
{#if previewPhoto}
  <BottomSheet
    isOpen
    title="Food log photo"
    onClose={() => (previewPhoto = null)}
  >
    <img src={previewPhoto} alt="Food Log Preview" class="photo-preview" />
  </BottomSheet>
{/if}

<style>
  /* A header control on the panel's subject, sized to sit beside the close and
     unframed like it, so two header controls read as one row of marks. The same
     square `LoggedFoodsPanel` gives a meal's way out; the two are the same
     control at two scales and must not drift apart. */
  .way-out {
    display: grid;
    place-items: center;
    /* Square at the floor. The glyph inside is sized by its own rule, so this
       grows the target and not the mark (ADR-0098 §3). */
    width: var(--tap-min);
    height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    color: var(--text-primary);
    line-height: 1;
    cursor: pointer;
  }
  .way-out :global(svg) {
    width: 1.35rem;
    height: 1.35rem;
  }

  /* The strip shows the day number; this line is what carries the month, and
     that is the whole of why it exists — which is also why it is gone above the
     shell breakpoint, where the calendar's own title bar carries the month in
     ink and this would restate it across the column (#344).
     (It used to carry an `mt-4` class this component never defined, so its only
     spacing was whatever the block below it pushed down.) */
  .dashboard-header {
    text-align: center;
    margin-top: var(--space-2xs);
  }
  .dashboard-header h2 {
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }

  .aggregates {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-xs);
  }
  /* Same rule as a meal's header — a titled row with its controls on the right,
     underlined — so the totals read as one more section of the day. */
  .aggregates-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-s);
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3xs);
  }
  /* The disclosure is the whole title, so the target is the words and not just
     the caret. Bare: the frame belongs to the Button beside it, and the floor,
     the focus ring and the mark's alignment belong to `ui/Disclosure`. What is
     left here is the voice — which the primitive deliberately does not declare,
     because this title is an all-caps section header and the one on an ending
     line is a small underlined aside. `font: inherit` on the button hands it
     down to the label. Reached with `:global` because a class handed to a
     component carries no scoping hash. */
  .aggregates-head :global(.aggregates-toggle) {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-primary);
  }
  /* `hidden` collapses the body; the attribute is what the toggle's
     aria-expanded describes, so the bars leave the accessibility tree with it. */
  .aggregates-body[hidden] {
    display: none;
  }

  /* Untouched-day empty state: a plain centred message in place of the sections. */
  .rda-empty {
    padding: var(--space-xl) var(--space-m);
    text-align: center;
  }
  .rda-empty-title {
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }
  .rda-empty-hint {
    margin-top: var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  /* Biggest gaps: a wrap of severity chips. The only percentage in the modal — a
     shortfall ranking, not a % DV. "no data" marks a nutrient never logged. */
  .rda-gaps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-m);
  }
  .rda-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35em;
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-3xs) var(--space-2xs);
    border: 1.5px solid var(--border, var(--ink));
    background: var(--paper);
    white-space: nowrap;
  }
  .rda-chip-pct {
    font-variant-numeric: tabular-nums;
    color: var(--rda-over);
  }

  /* Not tracked: plain value, no bar — the untargeted nutrients the day carried. */
  .rda-untracked-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-s);
    padding: var(--space-2xs) var(--space-m);
  }
  .rda-untracked-row + .rda-untracked-row {
    border-top: 1px solid var(--border-subtle, var(--border));
  }
  .rda-untracked-label {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .rda-untracked-value {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* The slot the Way-in bar and the Selection bar share (ADR-0101 §4).

     On a phone it is nothing at all, and `display: contents` is how it says so.
     Both children are `position: fixed`, so they take no space here and the
     Selection covers the Way-in bar by z-index alone — but a plain block would
     still be a flex item of `.timeline`, and `.timeline` has a `gap`, so an
     empty one opens `--space-m` of nothing above the first meal on every phone.
     With `contents` there is no box: the two children are what `.timeline` sees,
     and neither is a flex item, because neither is in flow.

     Whatever this box is down there, it may never become a containing block for
     them — a `transform`, a `filter` or `contain` here would drag both off the
     band. `contents` cannot: there is nothing left to be one.

     Above 768 the slot is the sticky thing and the bars are not, for a reason
     that is structural rather than stylistic: a sticky box can only travel
     inside a containing block taller than itself, and a two-item stack is not
     one. So the slot sticks and the bars ride in it. `overflow: hidden` is what
     makes the Selection ARRIVE rather than appear — it starts a full height
     above the cell and is clipped until it enters. */
  .way-in-slot {
    display: contents;
  }
  @media (min-width: 768px) {
    .way-in-slot {
      position: sticky;
      /* `.main` pays `var(--space-l)` of top padding above 768, and a scroll
         container's START padding sits inside its scrollport — so a box asking
         for `top: 0` comes to rest under it rather than on the edge, 49.7px
         down. `FoodStager`'s `.cf-stage` cancels its own container's padding the
         same way. The offset restates the shell's own token rather than
         measuring the gap, so the two cannot drift. */
      top: calc(-1 * var(--space-l));
      z-index: 20;
      margin-bottom: var(--space-s);
      overflow: hidden;
      display: grid;
    }
    /* One cell, two bars. The Selection is second in the markup and therefore
       paints over the Way-in bar, which is the same order the phone gets from
       z-index. */
    .way-in-slot > :global(.way-in-bar),
    .way-in-slot > :global(.selbar) {
      grid-area: 1 / 1;
    }
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    /* Room under the last meal, so Snack does not end flush against the bottom
       of the screen with its empty box half off it.

       On the last child rather than as `padding-bottom` on `.main`, which is
       the `overflow-y: auto` scroll container: a scroll container's own bottom
       padding at the end of its scroll range is the one piece of box geometry
       browsers have historically disagreed about, and a last child's padding is
       not in dispute anywhere. The argument is about boxes rather than about
       widths, so this is unconditional — the desktop shell is where it was
       noticed, not where it applies.

       Below 768 it also buys back the height of the pinned Way-in bar standing
       over the day (ADR-0101 §3). `--way-in-bar-h` is that bar's own measured
       border-box height, written on this element by the script above; it is 0
       before the first measurement, which is the same page this padding already
       described. */
    padding-bottom: calc(var(--space-2xl) + var(--way-in-bar-h, 0px));
  }
  @media (min-width: 768px) {
    /* Up here the bar is in flow at the head of the column and owes the foot of
       the day nothing, so the reserve goes back to being room under the last
       meal and nothing else. */
    .timeline {
      padding-bottom: var(--space-2xl);
    }
  }
  .meal-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    /* A query container so the macro subtotal below can size its text to this
       section's width — it fills the line on a wide phone and shrinks to stay on
       one line on a narrow one, instead of a fixed small size. */
    container-type: inline-size;
  }
  /* One child since the five ways in left (ADR-0101 §1), so there is nothing
     left to space apart; the row is the meal's name on a rule. */
  .meal-section-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3xs);
  }
  .meal-title {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--text-primary);
  }
  /* Inherits every one of the heading's own type properties, so the words do
     not move by becoming a control. */
  .meal-title-btn {
    min-height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
    cursor: pointer;
  }
  .meal-title-btn:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  /* The button form of the subtotal line: the same box it has always been, so
     only the affordance is added and the tally does not move. */
  .meal-total-btn {
    min-height: var(--tap-min);
    width: 100%;
    background: none;
    border: 0;
    /* A button's own padding, not the tally's: the box has to resolve to the
       div this used to be, or the line moves by becoming a control. */
    padding: 0;
    font: inherit;
    cursor: pointer;
    text-align: inherit;
  }
  .meal-total-btn:hover .meal-total-value {
    text-decoration: underline;
  }

  .meal-note {
    margin: var(--space-3xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  /* Four meals a day means up to four of these, so an empty one says its piece
     in as little height as it can get away with. */
  .empty-meal,
  .meal-skeleton {
    padding: var(--space-xs);
  }
  .empty-meal {
    text-align: center;
    background: var(--paper);
    border: 1px dashed var(--ink);
    border-radius: var(--radius);
  }
  /* No dashed frame on the placeholder: the box says "nothing here", and we do
     not yet know that. It carries the same padding so the two resolve to the
     same height. */
  .meal-skeleton {
    display: flex;
    justify-content: center;
  }
  .empty-meal p {
    color: var(--text-muted);
    font-size: var(--step-n2);
  }

  .meal-items-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* One-line macro subtotal under a meal's items — muted and small so it reads
     as a running tally, not another card. Kept to a single line; if the chosen
     nutrient set is wide enough to overrun a narrow section it scrolls sideways
     rather than wrapping. */
  .meal-total {
    display: flex;
    flex-wrap: nowrap;
    align-items: baseline;
    justify-content: center;
    overflow-x: auto;
    scrollbar-width: none;
    /* Container-relative: ~2.9% of the section width makes the default macro set
       span (near-)full width, so the tally grows on a wide phone and shrinks on
       a narrow one. Clamped so it never turns illegibly small nor oversized; a
       broader nutrient selection overruns the clamp and scrolls sideways rather
       than wrapping. */
    font-size: clamp(0.5rem, 2.9cqi, 1rem);
    /* One uniform weight/colour across labels, values, and separators (like the
       headline calories figure) so the whole tally reads at a glance — faint
       labels beside bold values were hard to pick out. */
    font-weight: 700;
    color: var(--text-secondary);
  }
  .meal-total::-webkit-scrollbar {
    display: none;
  }
  /* A middot before every item but the first — the only separator (no flex gap),
     a compact tally that reads as one running line without the width a real gap
     would cost. */
  .meal-total-item + .meal-total-item::before {
    content: "·";
    margin: 0 0.35em;
  }
  .meal-total-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25em;
    white-space: nowrap;
  }
  /* The label beside each value carries no class: it is written in the case
     `nutrientShortLabel` writes it in, and the tracking that came with setting
     it in caps went with them. It stays a span because the `gap` above is what
     separates it from its value, and a flex item is what that gap acts on. */
  /* The card is now a bare interactive wrapper — the bordered row visual and
     its selected highlight live in the shared FoodItemRow. */
  /* The card wraps a `ui/Row`, which clears the floor on its own — declared
     because a height inherited from a child is not one this model can walk, and
     a true thing that cannot be shown is not yet proved (ADR-0093 §5). */
  .meal-item-card {
    min-height: var(--tap-min);
  }
  .meal-item-card.selectable {
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  .select-check {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border: var(--edge);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
  }
  .select-check.on {
    background: var(--ink);
    color: var(--green-bg);
  }
  .meal-item-thumb-btn {
    min-height: var(--tap-min);
    display: inline-flex;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .meal-item-thumb {
    width: 48px;
    height: 48px;
    border-radius: var(--radius);
    object-fit: cover;
    cursor: pointer;
    border: var(--edge-thin);
    transition: transform 0.2s;
  }
  .meal-item-thumb:hover {
    transform: scale(1.05);
  }

  /* The photo, as wide as the sheet's body lets it be and never wider than it
     is. No cap of its own: the sheet caps itself at the visible band and its
     body scrolls, which is the one measurement that is honest with a keyboard
     up (ADR-0089 §3). */
  .photo-preview {
    display: block;
    max-width: 100%;
    height: auto;
    margin-inline: auto;
    border-radius: var(--radius);
    border: var(--edge);
  }

  :global(.mt-6) {
    margin-top: var(--space-m);
  }

  /* The month is the rail's, and the rail does not exist down here — so on a
     phone, and in the root's Food tab at every width, this block is not drawn
     at all. Mobile-first: the absence is the base rule and the query below is
     what reveals it. */
  .day-month {
    display: none;
  }

  /* ── The day's two regions ───────────────────────────────────────────────
     Above the shell breakpoint the day is a meal timeline holding the reading
     edge and a rail of the day's numbers beside it (ADR-0091 §2). Below it —
     which is every phone, and every window narrower than a desktop — `.day` is
     a plain block and this whole section does not exist. The base rules are the
     phone's; the query is the override.

     **`:global(.rations)` is the Facet, and it is load-bearing.** The root
     renders this same component in its Food tab, behind a sidebar and inside
     the same shell rule, and ADR-0091 gives the root that rule and nothing
     else: a rail there would be a third column beside a navigation column, and
     a root screen composition this work explicitly left out (#337 decision 8).
     One foreign class name, naming the shell whose shape this is, rather than
     the alternative of threading a prop through `FoodView` to say the same
     thing in two more files.

     The rail is NOT pinned, and that is decided rather than deferred
     (ADR-0091 §4). Its blocks are siblings of the timeline, not children of a
     rail element, so there is no unit to pin: pinning them separately either
     overlaps them or needs the block above as a constant. A rail that should be
     pinned is a rail that needs a real element, and that is the trigger for
     reopening it. */
  @media (min-width: 1180px) {
    :global(.rations) .day {
      display: grid;
      /* The rail is a fixed column and the timeline takes the slack, because
         the rail holds meters whose width is set by what they say and the
         timeline holds prose-width rows. `minmax(0, 1fr)` rather than `1fr` so
         a long food name shrinks the track instead of pushing the rail off. */
      grid-template-columns: minmax(0, 1fr) var(--rail);
      /* The timeline runs the height of the whole rail. The month leads the
         rail because it is the day's own name and the thing you steer with;
         the numbers are what the chosen day turned out to be.

         The rows are written out because the numbers row must be the flexible
         one, and that is what keeps the rail still. A grid item spanning
         several rows hands the height it has over them to the INTRINSIC rows it
         spans, split between them — so while both rows were `auto`, half of
         whatever the timeline was taller by landed in the month's row, and the
         month's row is what sets where the numbers begin. Collapsing the meters
         then grew the row above by half of what they had measured, and carried
         "Nutrition" and its Full day button a few hundred pixels down the page.
         A flexible track in the span stops that distribution outright: the
         month's row is now sized by the month and nothing else, the timeline's
         spare height goes into the numbers row below where there is nothing to
         move, and the disclosure opens and closes underneath a header that
         stays where it is. `start` keeps the numbers at the top of that row
         however tall it grows. */
      grid-template-areas:
        "meals month"
        "meals numbers";
      grid-template-rows: auto 1fr;
      /* The rail sits at the top of its column; the timeline is as tall as the
         day is. Without it the two stretch to each other and the meters float
         in the middle of a column of air. */
      align-items: start;
      column-gap: var(--space-l);
      /* The rows do the vertical rhythm here, so nothing in the grid has to
         know how tall its neighbour is — which is why the three blocks below
         give up the top margins they carry in the single column. In flow those
         margins ARE the rhythm; side by side they would start the two columns
         on different lines. */
      row-gap: var(--space-m);
    }

    /* The strip and the banner are the phone's, and up here they are gone.
       The month calendar IS the week strip one scale up (ADR-0091 §1: the same
       part presented differently, which is why the swap is allowed at all), and
       leaving both on would be two date controls on one screen — two answers to
       one question. The banner goes with it: it restated "Thursday, Sep 3"
       across the whole column, and the month names the day in ink. Both stay
       below the breakpoint, where the strip shows a day number with no month
       anywhere near it.

       **This reverses #337 decision 3**, which kept the strip across the full
       measure on the grounds that it is a ruler and navigates rather than
       reports. Both halves of that are still true and are exactly why it loses:
       a month that marks the days with food on them navigates the same history
       better, in a column that was going to be there anyway.

       `display: none` rather than an `{#if}`, because which of the two is on
       screen is a fact about the width and nothing else, and a `matchMedia`
       read would put the same number in a second place for this stylesheet to
       drift away from (`lib/ui/breakpoints.ts`). The price is named rather than
       hidden: every phone builds a month grid it will never show, and folds the
       history for its marks. That is about forty divs and one pass over the
       projection, against a screen that already draws a day of meals — cheap
       enough to buy the swap being unable to disagree with itself. #345 brings
       a `matchMedia` read for pages, which decide more than their own width;
       if this ever wants one too, that is where it comes from. */
    :global(.rations) .day > .day-strip,
    :global(.rations) .day > .dashboard-header {
      display: none;
    }

    :global(.rations) .day > .day-month {
      display: block;
      grid-area: month;
    }

    :global(.rations) .day > .timeline {
      grid-area: meals;
      /* `.mt-6` is the gap under the meters, which is what the timeline used to
         follow. Side by side, the two columns start on the same line. */
      margin-top: 0;
    }

    :global(.rations) .day > .aggregates {
      grid-area: numbers;
      margin-top: 0;
    }
  }
</style>
