<script lang="ts">
  import type { ScheduleRule } from "../../habits/habits";

  let {
    category,
    scheduleRules,
    instrument,
  }: {
    category: string;
    scheduleRules: ScheduleRule | undefined;
    instrument?: string;
  } = $props();

  function getCategoryColor(cat: string): string {
    switch (cat.toLowerCase()) {
      case "fitness":
        return "background-color: var(--green-bg); color: var(--ink); border-color: var(--ink);";
      case "health":
        return "background-color: var(--red-bg); color: var(--ink); border-color: var(--ink);";
      case "mind":
        return "background-color: var(--ink); color: var(--paper); border-color: var(--ink);";
      case "productivity":
        return "background-color: var(--amber-bg); color: var(--ink); border-color: var(--ink);";
      default:
        return "background-color: var(--border); color: var(--ink); border-color: var(--ink);";
    }
  }

  function formatSchedule(rules: ScheduleRule | undefined): string {
    if (!rules) return "Daily";
    switch (rules.type) {
      case "daily_multiple":
        if (rules.targets) {
          return `Daily: ${rules.targets.map((t) => t.id).join(", ")}`;
        }
        return `Daily: ${rules.count ?? 1}x/day`;
      case "weekly_days":
        return `Weekly: ${rules.days.map((d) => d.toUpperCase()).join(", ")}`;
      case "weekly_flexible":
        return `Weekly: ${rules.count}x/week`;
      default:
        return "Daily";
    }
  }
</script>

<header class="detail-header mt-2">
  <div class="header-title-row">
    <span class="badge-custom" style={getCategoryColor(category)}>
      {category}
    </span>
  </div>
  <p class="schedule-summary">
    Schedule: {formatSchedule(scheduleRules)}
    {#if instrument}
      • Instrument: <code class="instrument-code">{instrument}</code>
    {/if}
  </p>
</header>

<style>
  .header-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    flex-wrap: wrap;
  }
  .badge-custom {
    display: inline-flex;
    padding: var(--space-3xs) var(--space-2xs);
    font-weight: 700;
    font-size: var(--step-n2);
    text-transform: uppercase;
    border: var(--edge-thin);
  }
  .schedule-summary {
    color: var(--text-secondary);
    font-size: var(--step-n1);
    margin-top: var(--space-3xs);
  }
  .instrument-code {
    background: var(--bg-input);
    padding: 2px 6px;
    font-family: monospace;
    font-size: 0.9em;
  }
</style>
