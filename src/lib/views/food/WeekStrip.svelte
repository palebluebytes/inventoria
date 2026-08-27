<script lang="ts">
  // The dashboard's week-strip date selector: a Monday-aligned row of seven day
  // buttons with prev/next-week arrows. Owns its own week math; the selected day
  // is two-way bound so the dashboard reacts to taps here.
  //
  // Snapping back to today is NOT here. It used to be a button on a second row
  // that existed only when off today, so the whole page below it jumped by a row
  // whenever you left or returned to the current day. It now lives in the food
  // screen's header (FoodView), where a conditional control costs no layout: the
  // icon row is right-aligned, so a new icon grows into the empty space beside
  // the title and the icons already there do not move.
  let { selectedDate = $bindable(new Date()) }: { selectedDate: Date } =
    $props();

  // Seven days of selectedDate's week, aligned to Monday.
  let weekDays = $derived.by(() => {
    const days = [];
    const base = new Date(selectedDate);
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(base.setDate(diff));

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  });

  function selectDate(d: Date) {
    selectedDate = d;
  }

  function changeWeek(direction: number) {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + direction * 7);
    selectedDate = newDate;
  }

  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  // The scrollable day row. On a narrow strip only ~3 of the 7 days fit, so keep
  // the selected day centred in view — on first render and after every change
  // (a day tap, a week page, or the Today snap-back). Purely horizontal: we set
  // scrollLeft rather than scrollIntoView so the page never scrolls vertically.
  let daysEl = $state<HTMLDivElement>();
  $effect(() => {
    selectedDate; // re-centre whenever the selection moves
    const el = daysEl;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(".day-btn.active");
    if (!active) return;
    // Nudge scrollLeft by the gap between the active button's centre and the
    // viewport's centre. Measured via getBoundingClientRect (not offsetLeft, which
    // is relative to an unpredictable offsetParent), and clamped by the browser at
    // the week's edges — a near-boundary day simply lands as centred as it can.
    const elRect = el.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    el.scrollLeft +=
      aRect.left - elRect.left - (el.clientWidth - aRect.width) / 2;
  });
</script>

<div class="week-strip-container">
  <button
    class="nav-arrow"
    onclick={() => changeWeek(-1)}
    aria-label="Previous Week"
  >
    &larr;
  </button>
  <div class="week-days" bind:this={daysEl}>
    {#each weekDays as day}
      {@const active = isSameDay(day, selectedDate)}
      {@const isToday = isSameDay(day, new Date())}
      <!-- The visible label is as terse as the width allows, so the reading
             lives in aria-label instead: the full weekday and date, with
             aria-pressed carrying the selection a screen reader had no way to
             hear before. Both spans are decorative. -->
      <button
        class="day-btn"
        class:active
        class:is-today={isToday}
        aria-pressed={active}
        aria-label={day.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        onclick={() => selectDate(day)}
      >
        <span class="day-label day-label-narrow" aria-hidden="true">
          {day.toLocaleDateString("en-US", { weekday: "narrow" })}
        </span>
        <span class="day-label day-label-short" aria-hidden="true">
          {day.toLocaleDateString("en-US", { weekday: "short" })}
        </span>
        <span class="day-number" aria-hidden="true">{day.getDate()}</span>
      </button>
    {/each}
  </div>
  <button
    class="nav-arrow"
    onclick={() => changeWeek(1)}
    aria-label="Next Week"
  >
    &rarr;
  </button>
</div>

<style>
  /* Mobile first, and the whole week has to fit: seven days plus two arrows in
     roughly 20rem, so the chrome is pared to the frame itself. The desktop
     query at the bottom restores the roomier original. */
  .week-strip-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--paper);
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-3xs);
    width: 100%;
  }
  .nav-arrow {
    background: none;
    border: none;
    color: var(--ink);
    font-size: var(--step-n1);
    padding: var(--space-3xs) var(--space-2xs);
    cursor: pointer;
    transition: color 0.2s;
    flex-shrink: 0;
  }
  .nav-arrow:hover {
    color: var(--accent);
  }
  .week-days {
    display: flex;
    flex: 1;
    justify-content: space-between;
    gap: var(--space-3xs);
    overflow-x: auto;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }
  .week-days::-webkit-scrollbar {
    display: none; /* Chrome/Safari/Opera */
  }
  /* Every day takes an equal share of what is left, so all seven are on screen
     at once and none can be clipped mid-cell at the strip's edge. */
  .day-btn {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    background: none;
    border: 1px solid transparent;
    padding: var(--space-3xs) var(--space-3xs);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--ink);
  }
  .day-btn:hover {
    background: var(--bg-input);
  }
  .day-btn.active {
    background: var(--ink);
    color: var(--paper);
    border: var(--edge-thin);
    box-shadow: var(--shadow-2);
  }
  .day-btn.is-today:not(.active) {
    border: var(--edge-thin);
    color: var(--ink);
  }
  .day-label {
    font-size: var(--step-n3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }
  /* One letter on a phone (the calendar convention), the three-letter name once
     there is room for it. The full weekday is on the button's aria-label either
     way, so nothing is lost to a screen reader by the narrow form. */
  .day-label-short {
    display: none;
  }
  .day-number {
    font-size: var(--step-n1);
    font-weight: 700;
    margin-top: var(--space-3xs);
  }

  @media (min-width: 768px) {
    .week-strip-container {
      padding: var(--space-xs);
    }
    .nav-arrow {
      font-size: var(--step-0);
      padding: var(--space-xs);
    }
    .day-btn {
      flex: 0 0 auto;
      padding: var(--space-xs) var(--space-s);
    }
    .day-label-narrow {
      display: none;
    }
    .day-label-short {
      display: block;
    }
  }
</style>
