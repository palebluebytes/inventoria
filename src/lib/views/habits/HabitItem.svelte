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
  class="agenda-row"
  class:completed={isCompleted}
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
    <div class="row-left time-col">
      {getTimeHint()}
    </div>
    <div class="row-middle">
      <div class="habit-title">
        <span class="habit-name">{lineage.head.name}</span>
        <span class="target-name">({targetId})</span>
      </div>
      <div class="meta-row">
        <span class="meta-tag">{getCategoryLabel(lineage.head.category)}</span>
        <span class="meta-stats">🔥 {lineage.streak}d</span>
      </div>
    </div>
    <div class="row-right">
      {#if isCompleted}
        <span class="state-indicator done">[X]</span>
      {:else if isExempt}
        <span class="state-indicator exempt">[~]</span>
      {:else}
        <span class="state-indicator todo">[ ]</span>
      {/if}
    </div>
  {:else}
    <!-- General / Untimed Habit Layout -->
    <div class="row-middle pl-s">
      <div class="habit-title">
        <span class="habit-name">{lineage.head.name}</span>
      </div>
      <div class="meta-row">
        <span class="meta-tag">{getCategoryLabel(lineage.head.category)}</span>
        <span class="meta-stats">🔥 {lineage.streak}d</span>
        {#if rules && rules.type === "weekly_flexible"}
          {@const last7DaysExecs = lineage.executions.filter(
            (e) => e.time >= Date.now() - 7 * 24 * 60 * 60 * 1000
          )}
          {@const weeklyDoneDays = new Set(
            last7DaysExecs.map((e) => toUTCDateStr(e.time))
          ).size}
          <span class="meta-weekly">{weeklyDoneDays}/{rules.count} wky</span>
        {/if}
      </div>
    </div>
    <div class="row-right">
      {#if rules && rules.type === "daily_multiple" && !rules.targets}
        <div class="reps-indicator">
          {#each Array(rules.count ?? 1) as _, idx}
            <span class="rep-box" class:checked={idx < completedCount}>
              {idx < completedCount ? "■" : "□"}
            </span>
          {/each}
        </div>
      {:else if rules && rules.type === "weekly_days"}
        {@const daysOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]}
        {@const utcDayStr = daysOfWeek[new Date().getUTCDay()] as DayOfWeek}
        {@const isScheduledToday = rules.days.includes(utcDayStr)}
        {#if isScheduledToday}
          {#if isCompleted}
            <span class="state-indicator done">[X]</span>
          {:else if isExempt}
            <span class="state-indicator exempt">[~]</span>
          {:else}
            <span class="state-indicator todo">[ ]</span>
          {/if}
        {:else}
          <div class="off-day-indicator">
            <span class="off-label">OFF</span>
            {#if isCompleted}
              <span class="state-indicator done">[X]</span>
            {/if}
          </div>
        {/if}
      {:else if rules && rules.type === "weekly_flexible"}
        {#if isCompleted}
          <span class="state-indicator done">[X]</span>
        {:else if isExempt}
          <span class="state-indicator exempt">[~]</span>
        {:else}
          <span class="state-indicator todo">[ ]</span>
        {/if}
      {:else}
        <!-- Fallback standard indicator -->
        {#if isCompleted}
          <span class="state-indicator done">[X]</span>
        {:else if isExempt}
          <span class="state-indicator exempt">[~]</span>
        {:else}
          <span class="state-indicator todo">[ ]</span>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .agenda-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--border-accent);
    border-bottom: 2px solid var(--border-accent);
    background: var(--bg-surface);
    padding: var(--space-xs) var(--space-s);
    cursor: pointer;
    user-select: none;
    outline: none;
    transition:
      background-color 0.1s,
      transform 0.05s;
    -webkit-tap-highlight-color: transparent;
  }

  .agenda-row:active {
    background-color: var(--bg-input);
    transform: translateY(1px);
  }

  .agenda-row.completed {
    border-color: var(--border-accent);
  }

  .agenda-row.exempt {
    opacity: 0.6;
    background-color: var(--bg-input);
  }

  .row-left {
    flex-shrink: 0;
    width: 60px;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-secondary);
    border-right: 1px dashed var(--border-accent);
    padding-right: var(--space-xs);
    margin-right: var(--space-s);
  }

  .time-col {
    color: var(--text-primary);
  }

  .row-middle {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    min-width: 0; /* Prevents overflow of text */
  }

  .pl-s {
    padding-left: var(--space-xs);
  }

  .habit-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-3xs);
  }

  .habit-name {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .target-name {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  .meta-tag {
    font-family: var(--font-mono);
    font-weight: 700;
    background: var(--bg-input);
    border: 1px solid var(--border-accent);
    padding: 0px 4px;
  }

  .meta-stats {
    font-size: var(--step-n2);
  }

  .meta-weekly {
    font-family: var(--font-mono);
    opacity: 0.8;
  }

  .row-right {
    flex-shrink: 0;
    margin-left: var(--space-s);
  }

  .state-indicator {
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 700;
    display: inline-block;
    padding: var(--space-3xs) var(--space-2xs);
  }

  .state-indicator.todo {
    color: var(--text-muted);
  }

  .state-indicator.done {
    color: var(--green);
    background: var(--green-bg);
    border: 1px solid var(--border-accent);
  }

  .state-indicator.exempt {
    color: var(--amber);
    background: var(--amber-bg);
    border: 1px solid var(--border-accent);
  }

  .reps-indicator {
    display: flex;
    gap: 2px;
  }

  .rep-box {
    font-family: var(--font-mono);
    font-size: var(--step-0);
    line-height: 1;
  }

  .rep-box.checked {
    color: var(--green-bg);
    text-shadow: 1px 1px 0px var(--border-accent);
  }

  .off-day-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
  }

  .off-label {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-muted);
    border: 1px dashed var(--text-muted);
    padding: 1px 4px;
  }
</style>
