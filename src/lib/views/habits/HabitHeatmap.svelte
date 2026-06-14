<script lang="ts">
  import { getDailyLineageStates, toLocalDateStr } from "../../habits/habits";
  import type { HabitLineage } from "../../stores/habits.store";
  import Card from "../../ui/Card.svelte";

  let {
    blueprints,
    executions,
  }: {
    blueprints: HabitLineage["blueprints"];
    executions: HabitLineage["executions"];
  } = $props();

  // Derived: map of dateStr -> DailyState
  let dailyStates = $derived.by(() => {
    return getDailyLineageStates(blueprints, executions, Date.now());
  });

  // Generate heatmap days (last 12 weeks, ending today)
  let heatmapDays = $derived.by(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const distanceToMonday = (currentDayOfWeek + 6) % 7;
    const startOfWeek = new Date(today);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(today.getDate() - distanceToMonday);

    const heatmapStart = new Date(startOfWeek);
    heatmapStart.setDate(startOfWeek.getDate() - 11 * 7);

    const cells = [];
    const temp = new Date(heatmapStart);

    for (let i = 0; i < 84; i++) {
      const cellDate = new Date(temp);
      const dateStr = toLocalDateStr(cellDate.getTime());
      const isToday = dateStr === toLocalDateStr(today.getTime());

      const state = dailyStates.get(dateStr);
      const status = state?.status || "off";

      cells.push({
        date: cellDate,
        dateStr,
        status, // 'completed', 'failed', 'exempt', 'off'
        isFuture: cellDate.getTime() > today.getTime(),
        isToday,
      });
      temp.setDate(temp.getDate() + 1);
    }
    return cells;
  });
</script>

<Card class="mt-4 shadow-brutal">
  <h2>12-Week Execution Heatmap</h2>
  <div class="heatmap-container">
    <div class="heatmap-labels-y">
      <span>Mon</span>
      <span>Wed</span>
      <span>Fri</span>
    </div>
    <div class="heatmap-grid">
      {#each heatmapDays as cell}
        <div
          class="heatmap-cell"
          class:completed={cell.status === "completed"}
          class:failed={cell.status === "failed"}
          class:exempt={cell.status === "exempt"}
          class:off={cell.status === "off"}
          class:future={cell.isFuture}
          class:today={cell.isToday}
          title="{cell.dateStr}: {cell.status.toUpperCase()}"
        ></div>
      {/each}
    </div>
  </div>
  <div class="heatmap-legend mt-2">
    <span class="legend-item"
      ><div class="heatmap-cell legend-cell off"></div>
      Off-day / No Schedule</span
    >
    <span class="legend-item"
      ><div class="heatmap-cell legend-cell completed"></div>
      Completed</span
    >
    <span class="legend-item"
      ><div class="heatmap-cell legend-cell failed"></div>
      Failed / Incomplete</span
    >
    <span class="legend-item"
      ><div class="heatmap-cell legend-cell exempt"></div>
      Exempt / Skipped</span
    >
    <span class="legend-item"
      ><div class="heatmap-cell legend-cell today"></div>
      Today</span
    >
  </div>
</Card>

<style>
  .heatmap-container {
    display: flex;
    gap: var(--space-2xs);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    width: 100%;
  }
  .heatmap-labels-y {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted);
    padding-top: 4px;
    padding-bottom: 4px;
    height: 98px;
    user-select: none;
  }
  .heatmap-grid {
    display: grid;
    grid-template-rows: repeat(7, 12px);
    grid-auto-flow: column;
    grid-auto-columns: 12px;
    gap: 2px;
  }
  .heatmap-cell {
    width: 12px;
    height: 12px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    transition: all 0.2s;
  }
  .heatmap-cell.completed {
    background-color: var(--green-bg);
    border-color: var(--border-accent);
  }
  .heatmap-cell.failed {
    background-color: var(--red-bg);
    border-color: var(--border-accent);
  }
  .heatmap-cell.exempt {
    background-color: var(--amber-bg);
    border-color: var(--border-accent);
  }
  .heatmap-cell.off {
    background-color: var(--bg-input);
    border-color: var(--border);
  }
  .heatmap-cell.today {
    outline: 2px solid var(--border-accent);
    outline-offset: -1px;
  }
  .heatmap-cell.future {
    opacity: 0.15;
    pointer-events: none;
  }
  .heatmap-legend {
    display: flex;
    gap: var(--space-s);
    font-size: var(--step-n2);
    color: var(--text-secondary);
    flex-wrap: wrap;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
  }
  .legend-cell {
    display: inline-block;
  }
  .shadow-brutal {
    border: 2px solid var(--border-accent) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent);
  }
</style>
