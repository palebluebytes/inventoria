<script lang="ts">
  import Badge from "../../ui/Badge.svelte";
  import HabitItem from "./HabitItem.svelte";
  import EventItem from "./EventItem.svelte";
  import type {
    ScheduleItem,
    TimeGroup,
  } from "../../cal_events/schedule-grouping";

  // The agenda's SCHEDULE section: a time-gutter timeline that stacks timed
  // habit sub-targets and calendar-event slots into per-time rows. The grouping
  // math lives in `schedule-grouping.ts`; this renders the already-clustered
  // groups and forwards every interaction to the agenda view.
  let {
    groups,
    count,
    selected_date_str,
    selected_date_ms,
    nowMs,
    onSelectHabit,
    onLogHabit,
    onLongPressHabit,
    onConfirmOccurrence,
    onAddEvent,
  }: {
    groups: TimeGroup[];
    count: number;
    selected_date_str: string;
    selected_date_ms: number;
    nowMs: number;
    onSelectHabit: (id: string) => void;
    onLogHabit: (
      habitId: string,
      status: "completed" | "exempt" | "uncompleted",
      targetId?: string
    ) => Promise<void>;
    onLongPressHabit: (habitId: string, targetId?: string) => void;
    onConfirmOccurrence: (calEventId: string, slotId?: string) => Promise<void>;
    onAddEvent: () => void;
  } = $props();

  // Stable per-item key for the {#each}: habits key on their target, events on
  // their slot (falling back to the cal-event id for single-slot events).
  function itemKey(item: ScheduleItem): string {
    return item.kind === "habit"
      ? item.kind + item.targetId
      : item.kind + (item.slot.slotId ?? item.slot.calEventId);
  }
</script>

<section class="agenda-section">
  <div class="section-title-bar">
    <h2>SCHEDULE</h2>
    <Badge id="schedule-count" variant="default" class="mono-badge">
      {count}
    </Badge>
  </div>

  <div class="schedule-timeline">
    {#each groups as group (group.time + group.items.map(itemKey).join(","))}
      <!-- If the first item in this group has a continuation bar from a block above -->
      {@const firstItem = group.items[0]}
      <div class="schedule-row" class:during-block={firstItem.isDuring}>
        <!-- Time gutter -->
        <div class="time-gutter">
          <span class="time-start">{group.time}</span>
          {#if group.isBlock && group.dtendTime}
            <span class="time-pipe">│</span>
            <span class="time-end">{group.dtendTime}</span>
          {/if}
        </div>

        <!-- Items stacked -->
        <div class="time-slot-items">
          {#each group.items as item (itemKey(item))}
            {#if item.kind === "habit"}
              <div class="habit-wrap" class:is-overlap={item.isOverlap}>
                <HabitItem
                  lineage={item.lineage}
                  targetId={item.targetId}
                  {selected_date_str}
                  {selected_date_ms}
                  onSelect={onSelectHabit}
                  onLog={onLogHabit}
                  onLongPress={onLongPressHabit}
                />
              </div>
            {:else}
              <div class="event-wrap" class:is-overlap={item.isOverlap}>
                <EventItem
                  blueprint={item.blueprint}
                  slot={item.slot}
                  occurrence={item.occurrence}
                  {nowMs}
                  onConfirm={onConfirmOccurrence}
                />
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="add-row-group">
    <button type="button" class="add-agenda-row" onclick={onAddEvent}>
      + ADD EVENT
    </button>
  </div>
</section>

<style>
  /* ── Shared agenda-section chrome ──
     Duplicated verbatim in HabitsSection: Svelte scopes these class rules per
     component, so each self-contained section carries its own copy rather than
     depend on a global sheet. See ADR-0029 for the trade-off. */
  .agenda-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .section-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3xs);
  }

  .section-title-bar h2 {
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 800;
    color: var(--ink);
    margin: 0;
  }

  :global(.mono-badge) {
    font-family: var(--font-mono) !important;
    font-weight: 700 !important;
    border: none !important;
    background: var(--ink) !important;
    color: var(--paper) !important;
    border-radius: var(--radius) !important;
  }

  .add-agenda-row {
    flex: 1;
    border: 2px dashed var(--ink);
    padding: var(--space-s);
    text-align: center;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    background: transparent;
    cursor: pointer;
    outline: none;
    letter-spacing: 0.05em;
    -webkit-tap-highlight-color: transparent;
  }
  .add-agenda-row:hover,
  .add-agenda-row:focus {
    background: var(--bg-input);
  }
  .add-agenda-row:active {
    background: var(--ink);
    color: var(--paper);
  }

  /* ── Time-gutter layout ── */
  .schedule-timeline {
    display: flex;
    flex-direction: column;
    border: var(--edge);
  }

  .schedule-row {
    display: grid;
    grid-template-columns: 52px 1fr;
    border-bottom: var(--edge);
  }
  .schedule-row:last-child {
    border-bottom: none;
  }

  /* Continuation bar: item falls within an active block */
  .schedule-row.during-block {
    border-left: 4px solid var(--text-secondary);
  }

  .time-gutter {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: var(--space-xs) 0;
    border-right: var(--edge);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
    background: var(--paper);
    gap: var(--space-3xs);
    min-height: 48px;
  }

  .time-start {
    color: var(--ink);
  }

  .time-pipe {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1;
  }

  .time-end {
    color: var(--text-muted);
    font-size: 10px;
  }

  .time-slot-items {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    flex: 1;
    min-width: 0;
  }

  .habit-wrap,
  .event-wrap {
    position: relative;
    border-top: var(--edge);
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .habit-wrap:first-child,
  .event-wrap:first-child {
    border-top: none;
  }

  .habit-wrap.is-overlap,
  .event-wrap.is-overlap {
    border-left: 8px solid var(--ink);
  }

  /* ── Add buttons ── */
  .add-row-group {
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-3xs);
  }
</style>
