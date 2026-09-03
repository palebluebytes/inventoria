<script lang="ts">
  import {
    consumptionStore,
    consumptionForDay,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import { hasPastMeal, type CopyNote } from "../../food/past-meals";
  import { WAYS_IN, wayInLabel, type WayIn } from "../../food/ways-in";
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
  import FoodItemRow from "./FoodItemRow.svelte";
  import MacroMeters from "./MacroMeters.svelte";
  import WeekStrip from "./WeekStrip.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";
  import NutrientGroupHead from "./NutrientGroupHead.svelte";
  import NutritionPanel from "./NutritionPanel.svelte";
  import SendFace from "./SendFace.svelte";
  import WayOutIcon from "./WayOutIcon.svelte";
  import NutritionPanelCell from "./NutritionPanelCell.svelte";
  import { longpress } from "../../actions/longpress";
  import type { ScalePreview } from "../../food/scale-amount";
  import WayInIcon from "./WayInIcon.svelte";
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
  }: {
    dbReady: boolean;
    selectedDate: Date;
    /** A header control was tapped: which meal, and which way in (ADR-0059). */
    onEnterMeal: (meal_type: MealType, kind: WayIn) => void;
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

<!-- Week Strip date selector -->
<WeekStrip bind:selectedDate />

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
    <button
      type="button"
      class="aggregates-toggle"
      aria-expanded={$nutritionPanelOpen}
      aria-controls={metersId}
      onclick={() => setNutritionPanelOpen(!$nutritionPanelOpen)}
    >
      <!-- One shape rotated rather than two glyphs swapped, so the word beside
           it cannot shift sideways when the open mark is a different width from
           the closed one. -->
      <svg
        class="aggregates-caret"
        class:is-open={$nutritionPanelOpen}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M7 6 L17 12 L7 18 Z" fill="currentColor"></path>
      </svg>
      <span class="aggregates-title">Nutrition</span>
    </button>
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
<div class="timeline mt-6">
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
        <!-- Every way into this meal is its own control, in line with the meal
             name, and there is no `+` (ADR-0059 §1). All five are secondary:
             with the `+` gone there is no primary action left to protect, and
             electing one of the five would be a claim nothing supports (§3).
             The past-meal control is absent, not disabled, until the meal has
             history (§4) — and since it leads the row, the row shortens from
             the meal name's end. -->
        <div class="meal-actions">
          {#each WAYS_IN as kind (kind)}
            {#if kind !== "past" || mealHasPast[meal_type]}
              <Button
                variant="secondary"
                size="sm"
                class="way-in"
                disabled={!dbReady}
                aria-label={wayInLabel(kind, meal_type)}
                title={wayInLabel(kind, meal_type)}
                onclick={() => onEnterMeal(meal_type, kind)}
              >
                <WayInIcon {kind} />
              </Button>
            {/if}
          {/each}
        </div>
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
              {#if pill.key !== "calories"}<span class="meal-total-label"
                  >{nutrientShortLabel(pill.key)}</span
                >{/if}<span class="meal-total-value">{pill.value}</span>
            </span>
          {/each}
        </button>
      {/if}
    </div>
  {/each}
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
    width: 2rem;
    height: 2rem;
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

  /* The strip shows the day number; this line is what carries the month. It
     rides tight against the strip on a phone and opens up on a wide screen.
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
  @media (min-width: 768px) {
    .dashboard-header {
      margin-top: var(--space-xs);
    }
    .dashboard-header h2 {
      font-size: var(--step-1);
    }
  }

  .aggregates {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-xs);
  }
  @media (min-width: 768px) {
    .aggregates {
      gap: var(--space-xs);
      margin-top: var(--space-m);
    }
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
     the caret. Bare: the frame belongs to the Button beside it. */
  .aggregates-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  /* The same hard offset ring the Button and the pressable Card carry
     (ADR-0039), since this one draws its own chrome. */
  .aggregates-toggle:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  /* A drawn mark rather than a glyph. `▸` and `▾` (U+25B8/U+25BE) fall outside
     every unicode-range Epilogue is served in, so neither was ever OUR mark:
     both were drawn by whatever fallback the platform happened to have, at that
     font's size, width and height above the baseline. That is what sat the
     closed triangle about 3px below the centre of the word beside it, and it
     sits somewhere else again on every other device. A square box of our own
     geometry, blockified as a flex item, centres against the title exactly.
     Sized in `em` off the title's own step so the mark tracks the type ramp. */
  .aggregates-caret {
    width: 1em;
    height: 1em;
    flex-shrink: 0;
    font-size: var(--step-n1);
    color: var(--text-secondary);
    /* The shared turn (app.css), which is `none` under prefers-reduced-motion.
       Turning is only possible because the mark is drawn: two swapped glyphs
       have nothing to interpolate between. */
    transition: var(--turn-mark);
  }
  /* The ink is symmetric about the centre of the box, so a quarter turn is the
     open mark, the row's geometry does not change with it, and the rotation has
     no apparent centre to drift from. */
  .aggregates-caret.is-open {
    transform: rotate(90deg);
  }
  /* Tight to the em, as the panel header's title is (#304). That sets the row's
     height; it does NOT centre the letters, because leading is added
     symmetrically above and below and so never moves ink relative to its own
     box. What moves the ink is the font: measured off the bundled
     `epilogue-latin-wght-normal.woff2`, Epilogue's ascent is 0.79em against a
     0.7375em cap height and a 0.235em descent, so the caps of an all-caps
     string sit 0.091em ABOVE the centre of their box at every line-height. Flex
     centring aligns boxes, so the mark beside them landed ~1.5px low at this
     step. Fallback for engines without text-box-trim: nudge the text down by
     that measured offset, the same repair as ui/Checkbox.svelte's label. */
  .aggregates-title {
    position: relative;
    top: 0.09em;
    font-size: var(--step-n1);
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-primary);
  }
  /* Preferred: trim the box to the cap-height/baseline block so the box IS the
     letters. Flex centring then centres what the eye sees, at every step, with
     no magic number. Chromium and Safari honour this; anywhere else the nudge
     above stands in. */
  @supports (text-box-trim: trim-both) {
    .aggregates-title {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      top: 0;
    }
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
       noticed, not where it applies. */
    padding-bottom: var(--space-2xl);
  }
  @media (min-width: 768px) {
    .timeline {
      gap: var(--space-l);
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
  .meal-section-header {
    display: flex;
    justify-content: space-between;
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
  /* Icon-only actions — the meal header names the meal, so each just reads as
     its own verb. The frame, hover-invert, press-flush and focus ring are the
     shared Button (secondary) (ADR-0039 / #78). */
  /* Five squares plus their gaps is roughly 12rem of header. They wrap rather
     than push the meal name off, so a narrow screen shows the squeeze. The
     fixed square sizing stays here, reached via `:global` under the scoped
     header since the class rides a child Button. */
  .meal-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2xs);
  }
  /* The button form of the subtotal line: the same box it has always been, so
     only the affordance is added and the tally does not move. */
  .meal-total-btn {
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

  .meal-section-header :global(.way-in) {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    padding: 0;
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
  @media (min-width: 768px) {
    .empty-meal,
    .meal-skeleton {
      padding: var(--space-m);
    }
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
  /* `.meal-total-label` carries no rule of its own on purpose: the label is
     written in the case `nutrientShortLabel` writes it in, and the tracking
     that came with setting it in caps went with them. It stays a span because
     the gap above is what separates it from its value. */
  /* The card is now a bare interactive wrapper — the bordered row visual and
     its selected highlight live in the shared FoodItemRow. */
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
  @media (min-width: 768px) {
    :global(.mt-6) {
      margin-top: var(--space-l);
    }
  }
</style>
