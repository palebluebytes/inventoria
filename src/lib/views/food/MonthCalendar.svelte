<script lang="ts">
  import { Calendar } from "bits-ui";
  import type { DateValue } from "@internationalized/date";
  import {
    toCalendarDate,
    fromCalendarDate,
    isLoggedDay,
  } from "../../food/logged-days";
  import { spokenDate } from "../../food/past-meals";

  // The rail's top block above the shell breakpoint (ADR-0091 §2, #344): a full
  // month, and the phone's `WeekStrip` one scale up rather than a second date
  // control. ADR-0091 §1 is what lets the two swap — the same part presented
  // differently is not a part added — and it is also why exactly one of them is
  // on screen at a time. Two date controls on one screen would be two answers
  // to one question, so `DailyDashboard` owns the swap and this component never
  // asks how wide the window is.
  //
  // **The marks are the argument.** A bare month grid is only a date picker,
  // and the week strip is already a good one in a fraction of the room. What
  // earns the rail's top block is showing where the history actually is, so
  // every day with food on it carries a bar. `loggedDays` arrives as the day
  // keys rather than as the events, because the fold is a pure one and belongs
  // with `dayKeyOf` (`lib/food/logged-days.ts`), not in a drawing.
  let {
    selectedDate = $bindable(new Date()),
    loggedDays,
  }: {
    selectedDate: Date;
    /** `dayKeyOf` keys for the days with food on them (`loggedDayKeys`). */
    loggedDays: ReadonlySet<string>;
  } = $props();

  // `selectedDate` stays the one source of truth and this is the view of it the
  // calendar's date type can read. Derived rather than copied into state: a
  // second store of the same day is a second thing that can be stale, and the
  // day moves from outside this component too (the header's snap-back to
  // today). Both directions convert through local calendar fields — never an
  // ISO string, which would hand a late-evening day to its UTC neighbour.
  let value = $derived(toCalendarDate(selectedDate));

  function chooseDay(next: DateValue | undefined) {
    // `preventDeselect` means bits-ui never clears the selection, so this is
    // total in practice; the guard is the type's, not a case.
    if (next) selectedDate = fromCalendarDate(next);
  }

  // The whole reading of a cell, in the app's own voice rather than bits-ui's
  // "Wednesday, September 3, 2026". `spokenDate` is literally the string the
  // week strip's day buttons carry — one reading of a date shared by the two
  // controls that swap for each other — plus the one thing the bar says and a
  // label otherwise would not.
  function dayLabel(date: DateValue): string {
    const said = spokenDate(fromCalendarDate(date));
    return isLoggedDay(loggedDays, date) ? `${said}, food logged` : said;
  }
</script>

<div class="month">
  <Calendar.Root
    type="single"
    weekStartsOn={1}
    weekdayFormat="short"
    fixedWeeks
    preventDeselect
    calendarLabel="Day shown"
    bind:value={() => value, chooseDay}
  >
    {#snippet children({ months, weekdays })}
      <Calendar.Header>
        {#snippet child({ props })}
          <header {...props} class="month-bar">
            <!-- ◀ and ▶ (U+25C0/U+25B6) are outside every unicode-range Epilogue
                 is served in, so the browser would substitute a face for exactly
                 these two glyphs beside an Epilogue month name — #317 in
                 miniature, and the same reason the Nutrition disclosure's caret
                 is drawn. One shape at two rotations rather than two paths, so
                 the pair cannot drift apart. -->
            <Calendar.PrevButton>
              {#snippet child({ props })}
                <button
                  {...props}
                  class="month-nav"
                  aria-label="Previous month"
                >
                  <svg
                    class="month-arrow back"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M7 6 L17 12 L7 18 Z" fill="currentColor"></path>
                  </svg>
                </button>
              {/snippet}
            </Calendar.PrevButton>
            <Calendar.Heading>
              {#snippet child({ props, headingValue })}
                <div {...props} class="month-name">{headingValue}</div>
              {/snippet}
            </Calendar.Heading>
            <Calendar.NextButton>
              {#snippet child({ props })}
                <button {...props} class="month-nav" aria-label="Next month">
                  <svg
                    class="month-arrow"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M7 6 L17 12 L7 18 Z" fill="currentColor"></path>
                  </svg>
                </button>
              {/snippet}
            </Calendar.NextButton>
          </header>
        {/snippet}
      </Calendar.Header>

      {#each months as month}
        <Calendar.Grid class="month-grid">
          <Calendar.GridHead>
            <Calendar.GridRow>
              {#each weekdays as weekday}
                <Calendar.HeadCell class="month-weekday">
                  {weekday.slice(0, 2)}
                </Calendar.HeadCell>
              {/each}
            </Calendar.GridRow>
          </Calendar.GridHead>
          <Calendar.GridBody>
            {#each month.weeks as week}
              <Calendar.GridRow>
                {#each week as date}
                  <!-- No `{@const}` anywhere in this loop, deliberately. It
                       compiles to a derived owned by this block's effect, and
                       bits-ui rebuilds the grid's rows whenever the month
                       changes — which reads that derived after its owner is
                       gone and trips `derived_inert`. The two questions a cell
                       asks are function calls instead. -->
                  <Calendar.Cell {date} month={month.value} class="month-cell">
                    <Calendar.Day>
                      {#snippet child({ props })}
                        <div
                          {...props}
                          class="month-day"
                          aria-label={dayLabel(date)}
                        >
                          <span class="month-number">{date.day}</span>
                          <!-- The mark's box is permanent and only its ink is
                               conditional, so a month whose marks move does not
                               move the rows they sit in. -->
                          <span
                            class="month-mark"
                            class:is-logged={isLoggedDay(loggedDays, date)}
                            aria-hidden="true"
                          ></span>
                        </div>
                      {/snippet}
                    </Calendar.Day>
                  </Calendar.Cell>
                {/each}
              </Calendar.GridRow>
            {/each}
          </Calendar.GridBody>
        </Calendar.Grid>
      {/each}
    {/snippet}
  </Calendar.Root>
</div>

<style>
  /* The mark's own geometry. A bar rather than a dot because `--radius` is 0 and
     a squared-off dot is a square, which reads as a second selected day.

     Its thickness is a px named here for the reason `HabitHeatmap` names
     `--cell` and `--seam`: a rule under a numeral is a drawing, not a piece of
     the page's rhythm, and no step on the space scale expresses it —
     `--space-3xs` is 4.5px and would draw a block. Its length is a fraction
     instead, because the one thing it has to stay in proportion to is the cell
     it sits in, and that is set by how wide the rail is. */
  .month {
    --mark-h: 3px;
    --mark-w: 45%;
    border: var(--edge);
    background: var(--paper);
  }

  /* The title bar is ink, which is what makes the month name the rail's own
     heading rather than a caption on a widget.

     Be exact about what it says: the month of the view, which is not always the
     month of the selected day — page to October with the 3rd of September
     selected and the bar reads October. What names the *day* is the inverted
     cell, under a column headed with its weekday, which is how a wall calendar
     has always named one. That is the sense in which this replaces the
     `.dashboard-header` banner: not by restating "Thursday, Sep 3" in a second
     place, which is what the banner was doing. */
  .month-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--ink);
    color: var(--paper);
  }
  .month-name {
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  /* A square the size of a finger, so the pair clears the tap floor without the
     bar needing padding of its own. */
  .month-nav {
    display: grid;
    place-items: center;
    width: var(--tap-min);
    height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
  }
  /* Inverted back, because the bar is already ink: `--accent` is #09090b and
     would be a hover nobody could see against #000. */
  .month-nav:hover {
    background: var(--paper);
    color: var(--ink);
  }
  .month-nav:focus-visible {
    outline: 2px solid var(--paper);
    outline-offset: -4px;
  }
  .month-arrow {
    width: 1em;
    height: 1em;
    font-size: var(--step-n1);
  }
  .month-arrow.back {
    transform: rotate(180deg);
  }

  /* A ruled grid drawn the way `NutrientCardGrid` draws one: the gaps show the
     table's own background through as the rules, so there is one line between
     two cells rather than two borders meeting. `table-layout: fixed` keeps the
     seven columns equal whatever the numerals are. */
  .month :global(.month-grid) {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: var(--hairline);
    background: var(--border);
  }
  .month :global(.month-weekday) {
    background: var(--paper);
    padding: var(--space-3xs) 0;
    font-size: var(--step-n2);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .month :global(.month-cell) {
    background: var(--paper);
    padding: 0;
  }

  .month-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3xs);
    min-height: var(--tap-min);
    font-size: var(--step-n1);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    cursor: pointer;
  }
  .month-day:hover {
    background: var(--bg-input);
  }
  .month-day:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }
  /* The days either side of the month are drawn rather than blanked, because a
     grid with holes in it stops reading as a calendar. They are dimmed and not
     selectable — they are not the month being looked at — but one with food on
     it still carries its bar, dimmed with the rest of the cell. Suppressing it
     would have the calendar say there was nothing there, which is the one thing
     a mark that means "history" may never do. */
  .month-day[data-outside-month] {
    color: var(--text-secondary);
    opacity: 0.45;
    cursor: default;
  }
  .month-day[data-outside-month]:hover {
    background: none;
  }

  /* Today and the selected day are two marks, not one, because both can be true
     at once and each answers a different question: what day it is does not
     move, and which day you are looking at does. Selected inverts the cell —
     the same mark the week strip's chosen day wears. Today is a drawn edge
     inside it, in `currentColor` so it stays visible after the invert. */
  .month-day[data-selected] {
    background: var(--ink);
    color: var(--paper);
  }
  .month-day[data-today] {
    box-shadow: inset 0 0 0 var(--hairline) currentColor;
  }

  /* Tight to its own box, so the gap below it is the gap the flex column set
     and not the numeral's leading as well. */
  .month-number {
    line-height: 1;
  }

  .month-mark {
    width: var(--mark-w);
    height: var(--mark-h);
    background: none;
  }
  /* `currentColor` for the same reason today's edge is: the bar has to survive
     the selected day's invert, and a fixed ink bar on an ink cell is no bar. */
  .month-mark.is-logged {
    background: currentColor;
  }
</style>
