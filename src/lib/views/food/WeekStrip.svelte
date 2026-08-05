<script lang="ts">
  import Button from "../../ui/Button.svelte";

  // The dashboard's week-strip date selector: a Monday-aligned row of seven day
  // buttons with prev/next-week arrows. Owns its own week math; the selected day
  // is two-way bound so the dashboard reacts to taps here.
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

  // Snap back to the current day — the escape hatch after paging away by week
  // or tapping an earlier day.
  function goToToday() {
    selectedDate = new Date();
  }

  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  // Only offer "Today" when we've navigated off it — no point when the selected
  // day already is today.
  let onToday = $derived(isSameDay(selectedDate, new Date()));

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

<div class="week-strip">
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
        <button
          class="day-btn"
          class:active
          class:is-today={isToday}
          onclick={() => selectDate(day)}
        >
          <span class="day-label">
            {day.toLocaleDateString("en-US", { weekday: "short" })}
          </span>
          <span class="day-number">{day.getDate()}</span>
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
  {#if !onToday}
    <Button variant="secondary" size="sm" class="today-btn" onclick={goToToday}
      >Today</Button
    >
  {/if}
</div>

<style>
  .week-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }
  .week-strip-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--paper);
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-xs);
    width: 100%;
  }
  /* "Today" snap-back: the paper→ink invert, frame, shadow and press are the
     shared Button (secondary) now (ADR-0039 / #78); only its uppercase caps and
     roomier horizontal padding stay here, reached via `:global` under the scoped
     strip since the class rides a child Button. Only rendered when off today. */
  .week-strip :global(.today-btn) {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-inline: var(--space-m);
  }
  .nav-arrow {
    background: none;
    border: none;
    color: var(--ink);
    font-size: var(--step-0);
    padding: var(--space-xs);
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
  .day-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: none;
    border: 1px solid transparent;
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--ink);
    flex-shrink: 0;
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
  .day-number {
    font-size: var(--step-n1);
    font-weight: 700;
    margin-top: var(--space-3xs);
  }
</style>
