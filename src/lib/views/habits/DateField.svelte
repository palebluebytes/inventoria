<script lang="ts">
  import { DatePicker } from "bits-ui";
  import type { CalendarDate } from "@internationalized/date";
  import CalendarBlank from "phosphor-svelte/lib/CalendarBlank";

  // One date field for the add-event form: a bits-ui date input with a brutalist
  // calendar popover, and an optional adjacent time input. The start, end, and
  // "until" rows are all this component — the calendar markup and its over-sheet
  // styling used to be copy-pasted three times.
  let {
    date = $bindable<CalendarDate | undefined>(undefined),
    time = $bindable<string>(""),
    showTime = false,
    iconSize = 16,
    onChange,
  }: {
    date: CalendarDate | undefined;
    /** Only bound/used when showTime is true. */
    time?: string;
    showTime?: boolean;
    iconSize?: number;
    /** Fires on any date or time change (callers use it to clear validation). */
    onChange?: () => void;
  } = $props();
</script>

<DatePicker.Root bind:value={date} onValueChange={onChange}>
  <div class="date-time-row">
    <DatePicker.Input class="date-input">
      {#snippet children({ segments })}
        {#each segments as { part, value }}
          <DatePicker.Segment {part}>{value}</DatePicker.Segment>
        {/each}
      {/snippet}
    </DatePicker.Input>
    <DatePicker.Trigger class="bits-trigger" aria-label="Open calendar">
      <CalendarBlank size={iconSize} />
    </DatePicker.Trigger>
    {#if showTime}
      <input
        class="time-input"
        type="time"
        bind:value={time}
        oninput={onChange}
      />
    {/if}
  </div>

  <DatePicker.Portal>
    <DatePicker.Content sideOffset={4} align="start" class="bits-calendar">
      <DatePicker.Calendar class="bits-calendar-wrapper">
        {#snippet children({ months, weekdays })}
          <DatePicker.Header class="bits-calendar-header">
            <DatePicker.PrevButton class="bits-nav-btn">◀</DatePicker.PrevButton
            >
            <DatePicker.Heading class="bits-heading" />
            <DatePicker.NextButton class="bits-nav-btn">▶</DatePicker.NextButton
            >
          </DatePicker.Header>
          {#each months as month}
            <DatePicker.Grid class="bits-grid">
              <DatePicker.GridHead>
                <DatePicker.GridRow class="bits-weekdays">
                  {#each weekdays as weekday}
                    <DatePicker.HeadCell class="bits-weekday-cell">
                      {weekday.slice(0, 2)}
                    </DatePicker.HeadCell>
                  {/each}
                </DatePicker.GridRow>
              </DatePicker.GridHead>
              <DatePicker.GridBody>
                {#each month.weeks as weekDates}
                  <DatePicker.GridRow class="bits-grid-row">
                    {#each weekDates as date}
                      <DatePicker.Cell
                        {date}
                        month={month.value}
                        class="bits-cell"
                      >
                        <DatePicker.Day class="bits-day"
                          >{date.day}</DatePicker.Day
                        >
                      </DatePicker.Cell>
                    {/each}
                  </DatePicker.GridRow>
                {/each}
              </DatePicker.GridBody>
            </DatePicker.Grid>
          {/each}
        {/snippet}
      </DatePicker.Calendar>
    </DatePicker.Content>
  </DatePicker.Portal>
</DatePicker.Root>

<style>
  /* Date + trigger + optional time input row */
  .date-time-row {
    display: flex;
    align-items: stretch;
    gap: 0;
    width: 100%;
  }

  .time-input {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    background: var(--bg-input);
    border: var(--edge);
    padding: var(--space-2xs) var(--space-xs);
    outline: none;
    flex: 1;
    max-width: 120px;
  }

  /* Bits UI Calendar Brutalist Styles */
  :global(.bits-calendar) {
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-2);
    padding: var(--space-s);
    font-family: var(--font-mono);
    /* The picker portals to <body>, a sibling of the sheet, so it must clear the
       sheet content (z 1701) rather than the old full-screen z 100. It also
       re-enables pointer events: the open sheet's bits-ui dialog sets
       `pointer-events: none` on <body>, which this portaled layer would
       otherwise inherit, leaving the calendar visible but unclickable. */
    z-index: 1810;
    pointer-events: auto;
    /* Suppress any background bits-ui adds to the floating element itself */
    color: var(--ink);
  }
  /* bits-ui wraps Content in a data-bits-* div — reset any inherited bg, and
     carry the same over-sheet stacking + pointer-events onto that wrapper. */
  :global([data-bits-date-picker-content]) {
    background: transparent !important;
    z-index: 1810;
    pointer-events: auto;
  }
  :global(.bits-calendar-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-s);
    padding-bottom: var(--space-xs);
    border-bottom: var(--edge);
  }
  :global(.bits-nav-btn) {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: var(--step-0);
    padding: var(--space-xs);
  }
  :global(.bits-trigger) {
    background: transparent;
    border: none;
    border-left: var(--edge);
    cursor: pointer;
    padding: 0 var(--space-xs);
    margin-left: auto;
    display: flex;
    align-items: center;
    height: 100%;
    color: var(--text-secondary, #666);
  }
  :global(.bits-trigger:hover) {
    background: var(--bg-input, #f5f5f5);
  }
  :global(.bits-nav-btn:hover) {
    background: var(--bg-input);
  }
  :global(.bits-heading) {
    font-weight: 700;
    text-transform: uppercase;
  }
  :global(.bits-weekdays) {
    display: flex;
  }
  :global(.bits-weekday-cell) {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--step-n1);
  }
  :global(.bits-grid-row) {
    display: flex;
  }
  :global(.bits-cell) {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  :global(.bits-day) {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--step-n1);
  }
  :global(.bits-day:hover) {
    background: var(--bg-input);
  }
  :global(.bits-day[data-selected]) {
    background: var(--green-bg);
    border: var(--edge);
    font-weight: 900;
  }
  :global(.bits-day[data-today]) {
    text-decoration: underline;
    font-weight: 700;
  }
  :global(.date-input[data-invalid]) {
    border-color: red;
  }

  /* Native time input clock icon color */
  ::-webkit-calendar-picker-indicator {
    filter: invert(0);
    cursor: pointer;
  }
</style>
