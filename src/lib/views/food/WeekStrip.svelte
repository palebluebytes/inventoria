<script lang="ts">
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

  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }
</script>

<div class="week-strip-container">
  <button
    class="nav-arrow"
    onclick={() => changeWeek(-1)}
    aria-label="Previous Week"
  >
    &larr;
  </button>
  <div class="week-days">
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

<style>
  .week-strip-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    border: 1px solid #000;
    border-radius: 0;
    padding: var(--space-xs);
  }
  .nav-arrow {
    background: none;
    border: none;
    color: #000;
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
    border-radius: 0;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: #000;
    flex-shrink: 0;
  }
  .day-btn:hover {
    background: #f4f4f5;
  }
  .day-btn.active {
    background: #000;
    color: #fff;
    border: 1px solid #000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }
  .day-btn.is-today:not(.active) {
    border: 1px solid #000;
    color: #000;
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
