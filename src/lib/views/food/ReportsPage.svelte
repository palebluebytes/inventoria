<script lang="ts">
  import { DateRangePicker, Separator, Tabs } from "bits-ui";
  import type { DateRange } from "bits-ui";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Meter from "../../ui/Meter.svelte";
  import type { ConsumptionEvent } from "../../food/consumption-state";
  import { fromCalendarDate } from "../../food/logged-days";
  import {
    ABSENT_NUTRIENT,
    formatCalories,
    formatNutrientValue,
    nutrientLabel,
  } from "../../food/nutrient-display";
  import {
    PERIODS,
    dayEnergyLabel,
    energyByDay,
    energyShares,
    eventsIn,
    foodCounts,
    periodLabel,
    periodOf,
    type PeriodKind,
  } from "../../food/reports";

  // **Reports** (ADR-0091 §6, §7, #346): a period, and three readings of the
  // ledger.
  //
  // Every figure on this screen is **derived on read**. Nothing here is stored,
  // nothing is appended, and no report is a datom — a report is a question asked
  // of the facts, so it cannot fall out of step with them and needs no attribute
  // of its own. That is also why this file is a drawing and `food/reports.ts` is
  // the work: the decisions are all in the folds, and what is left here is which
  // bar is how long.
  //
  // **This page has no sheet form and therefore no control below the shell
  // breakpoint** (ADR-0091 §7), which is `pages.ts`'s `hasSheetForm` rather than
  // anything this component knows. It never asks how wide the window is.
  //
  // The frame is `BottomSheet`'s `inline` (#341), the same one Settings and
  // Recipes wear as pages. Reports replaces no sheet, so this is not that rule —
  // it is the plainer half of it: `inline` **is** the page frame, and a second
  // hand-rolled header-over-body box would be the duplication #341 removed,
  // re-introduced by the one page that had no sheet to inherit it from.
  let {
    events,
    today = new Date(),
  }: {
    /** Every Consumption Event, from the projection. Narrowed here to a period. */
    events: ConsumptionEvent[];
    /**
     * The day the rolling periods end on. A prop with a real default rather than
     * a `Date.now()` in a fold: `reports.ts` is pure and takes its clock, so the
     * only place a clock is read is here, once, when the page is mounted.
     */
    today?: Date;
  } = $props();

  // Which period is being asked about. Weekly leads because it is the question
  // somebody opening this screen most often has, and because it is the shortest
  // window that has a shape.
  let kind = $state<PeriodKind>("weekly");

  // The custom range, as the picker has it so far. **Both keys present, either
  // one `undefined`** — that is `DateRange`'s shape, and it is the right one: a
  // range with one end chosen is a range in progress, not a range missing a
  // field.
  let range = $state<DateRange>({ start: undefined, end: undefined });

  // The window, or `null` while a custom range has only one of its ends. A
  // half-chosen range is not a period (ADR-0091 §6), so there is no report yet
  // rather than a report of a window nobody asked for.
  let period = $derived(
    periodOf(kind, today, {
      start: range.start ? fromCalendarDate(range.start) : undefined,
      end: range.end ? fromCalendarDate(range.end) : undefined,
    })
  );

  let logged = $derived(period ? eventsIn(events, period) : []);

  let days = $derived(energyByDay(logged));
  let shares = $derived(energyShares(logged));
  let foods = $derived(foodCounts(logged));

  // Each reading's bars are drawn against its own tallest, because the three
  // measure different things and a shared scale would be a comparison none of
  // them makes. `0` where nothing was measured, which is what keeps a fill from
  // dividing by it.
  let peakEnergy = $derived(
    days.reduce((most, day) => Math.max(most, day.kcal ?? 0), 0)
  );
  let peakCount = $derived(
    foods.reduce((most, food) => Math.max(most, food.count), 0)
  );

  /**
   * One drawn row, and the only shape the bar snippet below knows.
   *
   * The three readings assemble this and nothing else, so an absent measurement
   * is resolved **once per row** rather than three times inside a template — the
   * name, the visible reading and the spoken one all follow from the same `if`.
   */
  interface Bar {
    /** The `{#each}` key, and unique inside its own reading. */
    key: string;
    name: string;
    /** What the row prints beside the name. */
    reading: string;
    /** Bar length 0–100, or absent for a row with no measurement to draw. */
    fill?: number;
    /**
     * The bar's `aria-valuetext`, and absent exactly when `fill` is.
     *
     * `Meter` renders a value-less row as a striped, role-less track rather
     * than as an empty progress bar (ADR-0037), which is the right reading of
     * ADR-0048 — a day with food but no frozen energy is not a day of zero
     * calories — and it means there is no meter there to carry a `valuetext`.
     * What says it instead is the row's own two lines of text, which a screen
     * reader reaches either way.
     */
    valueText?: string;
  }

  /**
   * A bar's length as a percent of its reading's tallest, or `undefined` where
   * there is no measurement to draw. A genuine zero against a genuine peak is a
   * real reading and gets a real bar of no length; only an absent value is
   * striped.
   */
  function fillOf(value: number | undefined, peak: number): number | undefined {
    if (value === undefined) return undefined;
    return peak > 0 ? (value / peak) * 100 : 0;
  }

  /** Whole kcal. A report is read at a glance, and a decimal place is noise. */
  const kcal = (n: number) => formatCalories(n, 0);

  let dayBars = $derived(
    days.map((day): Bar => {
      const name = dayEnergyLabel(day.date, today);
      if (day.kcal === undefined) {
        return { key: day.dayKey, name, reading: ABSENT_NUTRIENT };
      }
      return {
        key: day.dayKey,
        name,
        reading: kcal(day.kcal),
        fill: fillOf(day.kcal, peakEnergy),
        valueText: `${name}, ${kcal(day.kcal)}`,
      };
    })
  );

  let macroBars = $derived(
    shares.map((share): Bar => {
      const name = nutrientLabel(share.macro);
      if (share.percent === undefined || share.grams === undefined) {
        return { key: share.macro, name, reading: ABSENT_NUTRIENT };
      }
      const percent = Math.round(share.percent);
      return {
        key: share.macro,
        name,
        reading: `${percent}%`,
        fill: share.percent,
        valueText: `${name}, ${percent}% of energy, ${formatNutrientValue(share.grams, "g")}`,
      };
    })
  );

  let foodBars = $derived(
    foods.map(
      (food): Bar => ({
        key: food.name,
        name: food.name,
        reading: `${food.count}×`,
        fill: fillOf(food.count, peakCount),
        // A reading that says "1 times" is a reading nobody proof-read.
        valueText: `${food.name}, logged ${food.count} ${food.count === 1 ? "time" : "times"}`,
      })
    )
  );
</script>

<!-- `inline` and nothing else: this surface is only ever a page. `isOpen` is
     left at its default because the inline branch never reaches `Modal` — it is
     a dialog's state, and there is no dialog here. -->
<BottomSheet inline title="Reports" class="reports">
  <!-- The period, and the panel it switches. `Tabs` rather than `Segmented`
       because a panel really is switched: Custom brings a range picker with it
       that the other three have no use for, and Segmented's own entry in
       `CONTEXT.md` reserves itself for the case where nothing is. -->
  <Tabs.Root
    value={kind}
    onValueChange={(next) => (kind = next as PeriodKind)}
    class="periods"
  >
    <Tabs.List class="period-row" aria-label="Period">
      {#each PERIODS as p (p)}
        <Tabs.Trigger value={p} class="period">{periodLabel(p)}</Tabs.Trigger>
      {/each}
    </Tabs.List>

    {#each PERIODS as p (p)}
      <Tabs.Content value={p} class="period-panel">
        <!-- Only the panel you are on holds anything. The three you are not on
             are still rendered, because that is what wires a tab to the region
             it controls, but a hidden panel that had folded the ledger four
             times over would be three readings nobody asked for. -->
        {#if kind === p}
          {#if p === "custom"}
            <!-- The only control on this screen that changes what it says.
                 `type` is what tells each half of the field which end it is —
                 `part` belongs to the segments inside it. -->
            <DateRangePicker.Root bind:value={range} weekStartsOn={1}>
              <div class="range">
                <DateRangePicker.Label class="range-label">
                  Range
                </DateRangePicker.Label>
                <div class="range-field">
                  <DateRangePicker.Input type="start" class="range-end">
                    {#snippet children({ segments })}
                      {#each segments as { part, value } (part)}
                        <DateRangePicker.Segment {part} class="range-segment">
                          {value}
                        </DateRangePicker.Segment>
                      {/each}
                    {/snippet}
                  </DateRangePicker.Input>
                  <span class="range-dash" aria-hidden="true">–</span>
                  <DateRangePicker.Input type="end" class="range-end">
                    {#snippet children({ segments })}
                      {#each segments as { part, value } (part)}
                        <DateRangePicker.Segment {part} class="range-segment">
                          {value}
                        </DateRangePicker.Segment>
                      {/each}
                    {/snippet}
                  </DateRangePicker.Input>
                  <DateRangePicker.Trigger
                    class="range-trigger"
                    aria-label="Pick a range on a calendar"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect
                        x="3"
                        y="5"
                        width="18"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      ></rect>
                      <path
                        d="M3 10 H21 M8 3 V7 M16 3 V7"
                        stroke="currentColor"
                        stroke-width="2"
                      ></path>
                    </svg>
                  </DateRangePicker.Trigger>
                </div>
              </div>
              <DateRangePicker.Content sideOffset={4} class="range-pop">
                <DateRangePicker.Calendar class="range-cal">
                  {#snippet children({ months, weekdays })}
                    <DateRangePicker.Header class="range-cal-bar">
                      <DateRangePicker.PrevButton class="range-nav">
                        ‹
                      </DateRangePicker.PrevButton>
                      <DateRangePicker.Heading class="range-cal-name" />
                      <DateRangePicker.NextButton class="range-nav">
                        ›
                      </DateRangePicker.NextButton>
                    </DateRangePicker.Header>
                    {#each months as month (month.value)}
                      <DateRangePicker.Grid class="range-grid">
                        <DateRangePicker.GridHead>
                          <DateRangePicker.GridRow>
                            {#each weekdays as weekday (weekday)}
                              <DateRangePicker.HeadCell class="range-weekday">
                                {weekday.slice(0, 2)}
                              </DateRangePicker.HeadCell>
                            {/each}
                          </DateRangePicker.GridRow>
                        </DateRangePicker.GridHead>
                        <DateRangePicker.GridBody>
                          {#each month.weeks as week, i (i)}
                            <DateRangePicker.GridRow>
                              {#each week as date (date.toString())}
                                <DateRangePicker.Cell
                                  {date}
                                  month={month.value}
                                  class="range-cell"
                                >
                                  <DateRangePicker.Day class="range-day">
                                    {date.day}
                                  </DateRangePicker.Day>
                                </DateRangePicker.Cell>
                              {/each}
                            </DateRangePicker.GridRow>
                          {/each}
                        </DateRangePicker.GridBody>
                      </DateRangePicker.Grid>
                    {/each}
                  {/snippet}
                </DateRangePicker.Calendar>
              </DateRangePicker.Content>
            </DateRangePicker.Root>
          {/if}

          {#if period === null}
            <p class="nothing">Pick both ends of a range to read a report.</p>
          {:else if logged.length === 0}
            <p class="nothing">No food logged in this period.</p>
          {:else}
            {@render readings()}
          {/if}
        {/if}
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</BottomSheet>

<!-- One row, and every row on this page is one of these: a name, its reading,
     and a `Meter` under both. The meter is the shared primitive rather than a
     div with a width, so a bar carries `role="meter"` and says its own figure to
     a screen reader instead of being mute (ADR-0037). It takes a whole {@link
     Bar} rather than four positionals, so the absent case is resolved where the
     row is assembled and never half-resolved here. -->
{#snippet bar(row: Bar)}
  <li class="bar">
    <div class="bar-meta">
      <span class="bar-name">{row.name}</span>
      <span class="bar-reading">{row.reading}</span>
    </div>
    <Meter fill={row.fill} valueText={row.valueText} />
  </li>
{/snippet}

{#snippet readings()}
  <section class="reading">
    <h3>Energy by day</h3>
    <!-- A row per day that **has food on it**. An untouched day is absent
         rather than a bar of no height (ADR-0048): a gap here is a gap in the
         eating, and a zero would be a measurement nobody took. -->
    <ul class="bars">
      {#each dayBars as row (row.key)}
        {@render bar(row)}
      {/each}
    </ul>
  </section>

  <Separator.Root class="reading-rule" />

  <section class="reading">
    <h3>Where the energy came from</h3>
    <!-- Priced by the Atwater factors, 4/9/4, and shared against the energy the
         three carry between them rather than against the logged calories — the
         two disagree, and dividing by the second would leave a remainder
         nothing on the reading accounts for. -->
    <p class="reading-note">
      By Atwater factors — 4 kcal a gram of protein and of carbs, 9 of fat.
    </p>
    <ul class="bars">
      {#each macroBars as row (row.key)}
        {@render bar(row)}
      {/each}
    </ul>
  </section>

  <Separator.Root class="reading-rule" />

  <section class="reading">
    <h3>What you eat most</h3>
    <!-- Counted by name, so one food reached through a search, a scan and a
         past meal is one answer rather than three. -->
    <ul class="bars">
      {#each foodBars as row (row.key)}
        {@render bar(row)}
      {/each}
    </ul>
  </section>
{/snippet}

<style>
  /* ── The period ───────────────────────────────────────────────────────────
     bits-ui renders the tabs itself, so they are reached through `:global`
     under this page's own class — the same shape `Segmented` and
     `MonthCalendar` use for their bits parts. */
  :global(.reports .periods) {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  :global(.reports .period-row) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }
  /* The same cell Segmented draws, and deliberately: two single-choice rows in
     one app should not be two shapes. */
  :global(.reports .period) {
    padding: var(--space-2xs) var(--space-s);
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    font-family: inherit;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    cursor: pointer;
  }
  :global(.reports .period:hover[data-state="inactive"]) {
    background: var(--bg-input);
  }
  /* Ink and paper, which is how this frame states selection — the same mark the
     header's current page and the month calendar's chosen day wear. */
  :global(.reports .period[data-state="active"]) {
    background: var(--ink);
    color: var(--paper);
  }
  :global(.reports .period:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  :global(.reports .period-panel) {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  /* ── The custom range ───────────────────────────────────────────────────
     A brutalist skin over bits-ui's range picker, written here rather than
     shared with `views/habits/DateField.svelte`, which wears nearly the same
     one over the single-date picker.

     **That is a Facet boundary, not an oversight.** `views/habits/` belongs to
     the habits Tracked Domain and Rations holds only food, so importing it here
     would put a root-only view module inside Rations' build — which
     `pnpm check:facets` fails by design (ADR-0083 §5). Sharing it properly means
     a `ui/` primitive both Facets can hold, which is a `CONTEXT.md` term and an
     argument this ticket does not have; until then the duplication is the price
     of the split, and it is written down rather than left to be discovered. */
  .range {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  :global(.reports .range-label) {
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
  }
  .range-field {
    display: flex;
    align-items: stretch;
    width: fit-content;
    max-width: 100%;
    border: var(--edge);
    background: var(--bg-input);
  }
  :global(.reports .range-end) {
    display: flex;
    align-items: center;
    padding: var(--space-2xs) var(--space-xs);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
  }
  :global(.reports .range-segment[data-placeholder]) {
    color: var(--text-secondary);
  }
  :global(.reports .range-segment:focus) {
    background: var(--ink);
    color: var(--paper);
    outline: none;
  }
  .range-dash {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
  }
  :global(.reports .range-trigger) {
    display: flex;
    align-items: center;
    padding: 0 var(--space-xs);
    border: none;
    border-left: var(--edge);
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
  }
  :global(.reports .range-trigger:hover) {
    background: var(--paper);
    color: var(--ink);
  }
  :global(.reports .range-trigger svg) {
    width: 1em;
    height: 1em;
    font-size: var(--step-0);
  }

  /* The popover the trigger opens. Its own frame, because it floats over the
     page and has to be opaque to be read. */
  :global(.reports .range-pop) {
    z-index: 1810;
    padding: var(--space-s);
    border: var(--edge);
    background: var(--paper);
    box-shadow: var(--shadow-2);
  }
  :global(.reports .range-cal-bar) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2xs);
  }
  :global(.reports .range-cal-name) {
    font-weight: 700;
    text-transform: uppercase;
  }
  :global(.reports .range-nav) {
    padding: 0 var(--space-2xs);
    border: none;
    background: none;
    color: inherit;
    font-size: var(--step-1);
    cursor: pointer;
  }
  :global(.reports .range-nav:hover) {
    background: var(--bg-input);
  }
  /* The same ruled grid the month calendar draws: the gaps show the table's own
     background through as the rules, so two neighbouring cells share one line. */
  :global(.reports .range-grid) {
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: var(--hairline);
    background: var(--border);
  }
  :global(.reports .range-weekday) {
    padding: var(--space-3xs) 0;
    background: var(--paper);
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  :global(.reports .range-cell) {
    background: var(--paper);
  }
  :global(.reports .range-day) {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    font-size: var(--step-n1);
    cursor: pointer;
  }
  :global(.reports .range-day[data-outside-month]) {
    color: var(--text-secondary);
    opacity: 0.5;
  }
  :global(.reports .range-day:hover) {
    background: var(--bg-input);
  }
  /* The days between the two ends, and the two ends themselves. Inverted at the
     ends and tinted between them, so the range reads as one run rather than as
     two chosen days. */
  :global(.reports .range-day[data-highlighted]),
  :global(.reports .range-day[data-selected]) {
    background: var(--bg-input);
  }
  :global(.reports .range-day[data-selection-start]),
  :global(.reports .range-day[data-selection-end]) {
    background: var(--ink);
    color: var(--paper);
    font-weight: 900;
  }

  /* ── The readings ─────────────────────────────────────────────────────── */
  .reading h3 {
    margin: 0 0 var(--space-3xs) 0;
    font-size: var(--step-0);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .reading-note {
    margin: 0 0 var(--space-2xs) 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .bar-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-xs);
    margin-bottom: var(--space-3xs);
  }
  .bar-name {
    font-size: var(--step-n1);
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .bar-reading {
    flex: none;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }
  /* A rule between readings, not a gap: the three answer different questions
     and the line says where one stops. */
  :global(.reports .reading-rule) {
    height: var(--hairline);
    background: var(--border);
  }
  .nothing {
    margin: 0;
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }
</style>
