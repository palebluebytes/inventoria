<script lang="ts">
  import { toUTCDateStr } from "../../habits/habits";
  import type { HabitLineage } from "../../stores/habits.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";

  let {
    lineage,
    targetId,
    onSelect,
    onLog,
    onLongPress,
  }: {
    lineage: HabitLineage;
    targetId?: string;
    onSelect: (id: string) => void;
    onLog: (
      habitId: string,
      status: "completed" | "exempt",
      targetId?: string
    ) => Promise<void>;
    onLongPress: (habitId: string, targetId?: string) => void;
  } = $props();

  let todayStr = $derived(toUTCDateStr(Date.now()));
  let todayExecs = $derived(
    lineage.executions.filter((e) => toUTCDateStr(e.time) === todayStr)
  );

  // Status check for this specific row (could be target-specific or general)
  let isCompleted = $derived(
    targetId
      ? todayExecs.some(
          (e) => e.target_id === targetId && e.status === "completed"
        )
      : todayExecs.some((e) => e.status === "completed")
  );

  let isExempt = $derived(
    targetId
      ? todayExecs.some(
          (e) =>
            (e.target_id === targetId || !e.target_id) && e.status === "exempt"
        )
      : todayExecs.some((e) => e.status === "exempt")
  );

  let completedReps = $derived(
    todayExecs.filter((e) => e.status === "completed")
  );
  let completedCount = $derived(completedReps.length);
  let rules = $derived(lineage.head.schedule_rules);

  let last7DaysExecs = $derived(
    lineage.executions.filter(
      (e) => e.time >= Date.now() - 7 * 24 * 60 * 60 * 1000
    )
  );
  let weeklyDoneDays = $derived(
    new Set(last7DaysExecs.map((e) => toUTCDateStr(e.time))).size
  );

  let isDone = $derived.by(() => {
    if (isExempt) return false;
    if (targetId) return isCompleted;
    if (rules) {
      if (rules.type === "daily_multiple" && !rules.targets) {
        return completedCount >= (rules.count ?? 1);
      }
      if (rules.type === "weekly_flexible") {
        return weeklyDoneDays >= (rules.count ?? 1);
      }
    }
    return isCompleted;
  });

  let isInProgress = $derived.by(() => {
    if (isExempt) return false;
    if (targetId) return false;
    if (rules) {
      if (rules.type === "daily_multiple" && !rules.targets) {
        const target = rules.count ?? 1;
        return completedCount > 0 && completedCount < target;
      }
      if (rules.type === "weekly_flexible") {
        const target = rules.count ?? 1;
        return weeklyDoneDays > 0 && weeklyDoneDays < target;
      }
    }
    return false;
  });

  // Gestures
  let longPressTimer: any;
  let isLongPressActive = false;
  let preventClick = false;

  function handleTouchStart(e: TouchEvent) {
    isLongPressActive = false;
    longPressTimer = setTimeout(() => {
      isLongPressActive = true;
      preventClick = true;
      if (navigator.vibrate) {
        navigator.vibrate(50); // haptic feedback
      }
      onLongPress(lineage.head.entity, targetId);
    }, 600);
  }

  function handleTouchEnd(e: TouchEvent) {
    clearTimeout(longPressTimer);
    if (isLongPressActive) {
      e.preventDefault();
    }
    setTimeout(() => {
      preventClick = false;
    }, 100);
  }

  function handleTouchMove() {
    clearTimeout(longPressTimer);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    onLongPress(lineage.head.entity, targetId);
  }

  function handleClick(e: MouseEvent) {
    if (preventClick) {
      e.preventDefault();
      return;
    }

    if (isExempt) return;

    if (targetId) {
      // Timed Habit target
      if (!isCompleted) {
        onLog(lineage.head.entity, "completed", targetId);
      }
    } else {
      // General Habit target
      if (rules) {
        if (rules.type === "daily_multiple" && !rules.targets) {
          const limit = rules.count ?? 1;
          if (completedCount < limit) {
            onLog(lineage.head.entity, "completed");
          }
        } else if (rules.type === "weekly_days") {
          const daysOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
          const utcDayStr = daysOfWeek[new Date().getUTCDay()] as DayOfWeek;
          const isScheduledToday = rules.days.includes(utcDayStr);
          if (isScheduledToday && completedCount === 0) {
            onLog(lineage.head.entity, "completed");
          } else if (!isScheduledToday) {
            onLog(lineage.head.entity, "completed");
          }
        } else if (rules.type === "weekly_flexible") {
          if (completedCount === 0) {
            onLog(lineage.head.entity, "completed");
          }
        }
      }
    }
  }

  // Helpers
  function getCategoryLabel(cat: string): string {
    return cat.substring(0, 3).toUpperCase();
  }

  function getTimeHint(): string {
    if (targetId && rules && rules.type === "daily_multiple" && rules.targets) {
      const tgt = rules.targets.find((t) => t.id === targetId);
      return tgt?.time_hint ?? "--:--";
    }
    return "--:--";
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="agenda-row habit-item"
  class:completed={isDone}
  class:in-progress={isInProgress}
  class:exempt={isExempt}
  onclick={handleClick}
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  ontouchmove={handleTouchMove}
  oncontextmenu={handleContextMenu}
  role="button"
  tabindex="0"
>
  {#if targetId}
    <!-- Timed Habit Target Layout -->
    <span class="time-col">{getTimeHint()}</span>

    <div class="habit-details">
      <span class="habit-name">{lineage.head.name.toUpperCase()}</span>
      <span class="habit-category">{lineage.head.category.toUpperCase()}</span>
    </div>
  {:else}
    <!-- General / Untimed Habit Layout -->
    <div class="habit-details">
      <span class="habit-name">{lineage.head.name.toUpperCase()}</span>
      <span class="habit-category">{lineage.head.category.toUpperCase()}</span>
    </div>

    <div class="spacer"></div>

    {#if rules && rules.type === "daily_multiple" && !rules.targets}
      <div class="reps-count-display">
        {completedCount}/{rules.count ?? 1}
      </div>
    {:else if rules && rules.type === "weekly_days"}
      {@const daysOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]}
      {@const utcDayStr = daysOfWeek[new Date().getUTCDay()] as DayOfWeek}
      {@const isScheduledToday = rules.days.includes(utcDayStr)}
      {#if !isScheduledToday}
        <div class="off-day-indicator">
          <span class="off-label">OFF</span>
        </div>
      {/if}
    {:else if rules && rules.type === "weekly_flexible"}
      <div class="reps-count-display">
        {weeklyDoneDays}/{rules.count ?? 1}
      </div>
    {/if}
  {/if}
</div>

<style>
  .agenda-row {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    border: 2px solid var(--border-accent);
    margin-top: -2px; /* collapses borders when stacked */
    background: var(--bg-surface);
    padding: var(--space-xs) var(--space-s);
    cursor: pointer;
    user-select: none;
    outline: none;
    font-family: var(--font-mono);
    text-transform: uppercase;
    transition: background-color 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .agenda-row.completed {
    background-color: var(--green-bg);
  }
  .agenda-row.completed:active {
    background-color: #b3e600; /* slightly darker green */
  }

  .agenda-row.in-progress {
    background-color: var(--amber-bg);
  }
  .agenda-row.in-progress:active {
    background-color: #e6b800; /* slightly darker yellow */
  }

  .agenda-row:active {
    background-color: var(--bg-input);
  }

  .agenda-row.exempt {
    opacity: 0.6;
    background-color: var(--bg-input);
  }

  .time-col {
    font-weight: 700;
    color: var(--text-primary);
    padding-right: var(--space-2xs);
  }

  .habit-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .habit-name {
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .habit-category {
    font-size: var(--step-n2);
    font-weight: 500;
    opacity: 0.7;
    text-transform: uppercase;
  }

  .spacer {
    flex: 1;
  }

  .reps-count-display {
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text-primary);
  }

  .off-day-indicator {
    display: flex;
    align-items: center;
  }

  .off-label {
    font-size: var(--step-n2);
    color: var(--text-muted);
    border: 1px dashed var(--text-muted);
    padding: 1px 4px;
  }
</style>
