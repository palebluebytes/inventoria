<script lang="ts">
  import { toUTCDateStr } from "../../habits/habits";
  import type { HabitLineage } from "../../stores/habits.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";

  let {
    lineage,
    onSelect,
    onLog,
  }: {
    lineage: HabitLineage;
    onSelect: (id: string) => void;
    onLog: (
      habitId: string,
      status: "completed" | "exempt",
      targetId?: string
    ) => Promise<void>;
  } = $props();

  let todayStr = $derived(toUTCDateStr(Date.now()));
  let todayExecs = $derived(
    lineage.executions.filter((e) => toUTCDateStr(e.time) === todayStr)
  );
  let isExempt = $derived(todayExecs.some((e) => e.status === "exempt"));
  let completedReps = $derived(
    todayExecs.filter((e) => e.status === "completed")
  );
  let completedCount = $derived(completedReps.length);
  let rules = $derived(lineage.head.schedule_rules);

  function getCategoryColor(cat: string): string {
    switch (cat.toLowerCase()) {
      case "fitness":
        return "background-color: var(--green-bg); color: var(--green); border-color: var(--border-accent);";
      case "health":
        return "background-color: #38bdf8; color: #000; border-color: var(--border-accent);";
      case "mind":
        return "background-color: #c084fc; color: #000; border-color: var(--border-accent);";
      case "productivity":
        return "background-color: var(--amber-bg); color: var(--amber); border-color: var(--border-accent);";
      default:
        return "background-color: #94a3b8; color: #fff; border-color: var(--border-accent);";
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

<li class="habit-item">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="habit-info-panel"
    onclick={() => onSelect(lineage.head.entity)}
    role="button"
    tabindex="0"
  >
    <div class="habit-title-row">
      <span class="habit-name">{lineage.head.name}</span>
      <span
        class="badge-custom"
        style={getCategoryColor(lineage.head.category)}
      >
        {lineage.head.category}
      </span>
    </div>
    <div class="habit-meta">
      <span class="meta-item">
        Schedule: {formatSchedule(lineage.head.schedule_rules)}
      </span>
      {#if lineage.head.instrument}
        <span class="meta-separator">•</span>
        <span class="meta-item code">{lineage.head.instrument}</span>
      {/if}
    </div>
    <div class="habit-mini-stats mt-2">
      <span class="mini-stat strength" title="Habit Strength">
        💪 {Math.round(lineage.score * 100)}%
      </span>
      <span class="mini-stat streak" title="Current Streak">
        🔥 {lineage.streak}d
      </span>
    </div>
  </div>

  <!-- Stats & Quick Actions -->
  <div class="habit-checkin-panel">
    {#if rules}
      {#if rules.type === "daily_multiple" && rules.targets}
        <div class="checkin-group">
          <span class="checkin-label">Today's Targets</span>
          <div class="checkin-buttons">
            {#each rules.targets as tgt}
              {@const isDone = todayExecs.some(
                (e) => e.target_id === tgt.id && e.status === "completed"
              )}
              <button
                type="button"
                class="checkin-btn target-btn"
                class:completed={isDone}
                disabled={isDone}
                onclick={() => onLog(lineage.head.entity, "completed", tgt.id)}
              >
                {isDone ? "✓" : "+"}
                {tgt.id}
                {#if tgt.time_hint}
                  <span class="time-hint">{tgt.time_hint}</span>
                {/if}
              </button>
            {/each}
            {#if !isExempt}
              <button
                type="button"
                class="checkin-btn skip-btn"
                onclick={() => onLog(lineage.head.entity, "exempt")}
                title="Skip Today"
              >
                Skip
              </button>
            {:else}
              <span class="status-badge skipped">Skipped</span>
            {/if}
          </div>
        </div>
      {:else if rules.type === "daily_multiple"}
        <div class="checkin-group">
          <span class="checkin-label">Repetitions</span>
          <div class="checkin-buttons">
            {#each Array(rules.count ?? 1) as _, idx}
              {@const isDone = idx < completedCount}
              <button
                type="button"
                class="checkin-btn rep-btn"
                class:completed={isDone}
                disabled={isDone}
                onclick={() => onLog(lineage.head.entity, "completed")}
              >
                {isDone ? "✓" : idx + 1}
              </button>
            {/each}
            {#if !isExempt}
              <button
                type="button"
                class="checkin-btn skip-btn"
                onclick={() => onLog(lineage.head.entity, "exempt")}
                title="Skip Today"
              >
                Skip
              </button>
            {:else}
              <span class="status-badge skipped">Skipped</span>
            {/if}
          </div>
        </div>
      {:else if rules.type === "weekly_days"}
        {@const daysOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]}
        {@const utcDayStr = daysOfWeek[new Date().getUTCDay()] as DayOfWeek}
        {@const isScheduledToday = rules.days.includes(utcDayStr)}
        <div class="checkin-group">
          <div class="checkin-buttons">
            {#if isScheduledToday}
              {#if completedCount > 0}
                <span class="status-badge completed">Done ✓</span>
              {:else if isExempt}
                <span class="status-badge skipped">Skipped ↷</span>
              {:else}
                <button
                  type="button"
                  class="checkin-btn success-btn"
                  onclick={() => onLog(lineage.head.entity, "completed")}
                >
                  Complete
                </button>
                <button
                  type="button"
                  class="checkin-btn skip-btn"
                  onclick={() => onLog(lineage.head.entity, "exempt")}
                >
                  Skip
                </button>
              {/if}
            {:else}
              <span class="status-badge off">Off Day</span>
              <button
                type="button"
                class="checkin-btn extra-btn"
                onclick={() => onLog(lineage.head.entity, "completed")}
              >
                Log Extra
              </button>
            {/if}
          </div>
        </div>
      {:else if rules.type === "weekly_flexible"}
        {@const last7DaysExecs = lineage.executions.filter(
          (e) => e.time >= Date.now() - 7 * 24 * 60 * 60 * 1000
        )}
        {@const weeklyDoneDays = new Set(
          last7DaysExecs.map((e) => toUTCDateStr(e.time))
        ).size}
        <div class="checkin-group">
          <span class="checkin-label">
            {weeklyDoneDays} / {rules.count} this week
          </span>
          <div class="checkin-buttons">
            {#if completedCount > 0}
              <span class="status-badge completed">Done Today ✓</span>
            {:else if isExempt}
              <span class="status-badge skipped">Skipped Today ↷</span>
            {:else}
              <button
                type="button"
                class="checkin-btn success-btn"
                onclick={() => onLog(lineage.head.entity, "completed")}
              >
                Complete
              </button>
              <button
                type="button"
                class="checkin-btn skip-btn"
                onclick={() => onLog(lineage.head.entity, "exempt")}
              >
                Skip
              </button>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</li>

<style>
  .habit-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    padding: var(--space-s);
    border: 1px solid var(--border-accent);
    background: var(--bg-input);
    transition: all 0.2s;
  }
  @media (min-width: 768px) {
    .habit-item {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }
  .habit-info-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    cursor: pointer;
    outline: none;
    user-select: none;
  }
  .habit-info-panel:hover .habit-name {
    text-decoration: underline;
  }
  .habit-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    flex-wrap: wrap;
  }
  .habit-name {
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }
  .badge-custom {
    display: inline-flex;
    padding: 1px 6px;
    font-weight: 700;
    font-size: var(--step-n2);
    text-transform: uppercase;
    border: 1px solid var(--border-accent);
  }
  .habit-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .meta-item.code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 4px;
  }
  .meta-separator {
    color: var(--text-muted);
  }
  .habit-checkin-panel {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }
  .checkin-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    align-items: flex-start;
  }
  @media (min-width: 768px) {
    .checkin-group {
      align-items: flex-end;
    }
  }
  .checkin-label {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .checkin-buttons {
    display: flex;
    gap: var(--space-2xs);
    flex-wrap: wrap;
    align-items: center;
  }
  .checkin-btn {
    font-family: inherit;
    font-size: var(--step-n1);
    font-weight: 700;
    padding: var(--space-2xs) var(--space-xs);
    border: 2px solid var(--border-accent);
    background: #fff;
    cursor: pointer;
    transition: all 0.1s;
    user-select: none;
  }
  .checkin-btn:hover:not(:disabled) {
    box-shadow: 2px 2px 0px 0px var(--border-accent);
    transform: translate(-1px, -1px);
  }
  .checkin-btn:active:not(:disabled) {
    box-shadow: 0px 0px 0px 0px var(--border-accent);
    transform: translate(1px, 1px);
  }
  .checkin-btn.completed {
    background: var(--green-bg);
    color: var(--green);
    cursor: default;
    box-shadow: none;
    transform: none;
  }
  .checkin-btn.success-btn:hover:not(:disabled) {
    background: var(--green-bg);
    color: var(--green);
  }
  .checkin-btn.skip-btn:hover:not(:disabled) {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .checkin-btn.extra-btn:hover:not(:disabled) {
    background: #c084fc;
    color: #000;
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: var(--space-2xs) var(--space-xs);
    font-weight: 700;
    font-size: var(--step-n1);
    border: 2px solid var(--border-accent);
  }
  .status-badge.completed {
    background: var(--green-bg);
    color: var(--green);
  }
  .status-badge.skipped {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .status-badge.off {
    background: var(--bg-input);
    color: var(--text-muted);
    border-style: dashed;
  }
  .time-hint {
    font-size: 0.8em;
    font-weight: 500;
    opacity: 0.7;
    margin-left: 4px;
  }
  .habit-mini-stats {
    display: flex;
    gap: var(--space-xs);
    font-size: var(--step-n1);
    font-weight: 600;
    margin-top: var(--space-s);
  }
  .mini-stat {
    display: inline-flex;
    align-items: center;
    padding: var(--space-3xs) var(--space-2xs);
    border: 1px dashed var(--text-muted);
    background: #fff;
  }
</style>
