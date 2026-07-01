<script lang="ts">
  import { habitsStore } from "../stores/habits.store";
  import {
    calEventsStore,
    calOccurrencesStore,
  } from "../stores/cal_events.store";
  import {
    projectSlotsForDate,
    findOccurrence,
  } from "../cal_events/cal_events";
  import { isScheduleRuleActive } from "../recurrence/rules";
  import { localDateStrToDate, eventTimestampForDay } from "../habits/habits";
  import type {
    CalEventBlueprint,
    ProjectedSlot,
    OccurrenceRecord,
  } from "../cal_events/cal_events";
  import type { HabitLineage } from "../stores/habits.store";
  import HabitDetailView from "./habits/HabitDetailView.svelte";
  import AddHabitScreen from "./habits/AddHabitScreen.svelte";
  import AddEventScreen from "./habits/AddEventScreen.svelte";
  import EventItem from "./habits/EventItem.svelte";
  import BottomSheet from "../ui/BottomSheet.svelte";
  import Badge from "../ui/Badge.svelte";
  import HabitItem from "./habits/HabitItem.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // ── Overlay state ──────────────────────────────────────────────
  let isAddingHabit = $state(false);
  let isAddingEvent = $state(false);

  let initialScheduleType = $state<
    "daily_multiple" | "weekly_days" | "weekly_flexible"
  >("daily_multiple");
  let initialUseSubtargets = $state(false);

  function openAddHabit(type: "schedule" | "habit") {
    if (type === "schedule") {
      initialScheduleType = "daily_multiple";
      initialUseSubtargets = true;
    } else {
      initialScheduleType = "daily_multiple";
      initialUseSubtargets = false;
    }
    isAddingHabit = true;
  }

  // ── Habit detail / context ─────────────────────────────────────
  let selectedHabitId = $state<string | null>(null);
  let selectedLineage = $derived(
    $habitsStore.find((l) => l.head.entity === selectedHabitId) || null
  );
  let isBottomSheetOpen = $state(false);
  let activeContextHabitId = $state<string | null>(null);
  let activeContextTargetId = $state<string | undefined>(undefined);
  let isContextOpen = $state(false);
  let contextLineage = $derived(
    $habitsStore.find((l) => l.head.entity === activeContextHabitId) || null
  );

  function selectHabit(id: string) {
    selectedHabitId = id;
    isBottomSheetOpen = true;
  }

  function handleLongPress(habitId: string, targetId?: string) {
    activeContextHabitId = habitId;
    activeContextTargetId = targetId;
    isContextOpen = true;
  }

  $effect(() => {
    if (!isBottomSheetOpen) selectedHabitId = null;
  });

  // ── Date navigation ────────────────────────────────────────────
  const daysOfWeekLong = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  let currentDate = $state(new Date());

  function navigateDay(d: number) {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + d);
    currentDate = next;
  }

  let selected_date_str = $derived.by(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, "0");
    const d = String(currentDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  let selected_date_ms = $derived(
    localDateStrToDate(selected_date_str).getTime()
  );

  let dateTodayStr = $derived(
    `${daysOfWeekLong[currentDate.getDay()]}, ${months[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`
  );

  // Live clock for temporal state
  let nowMs = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => {
      nowMs = Date.now();
    }, 30_000);
    return () => clearInterval(id);
  });

  // ── Habit log ──────────────────────────────────────────────────
  async function logHabitEvent(
    habitId: string,
    status: "completed" | "exempt" | "uncompleted",
    targetId?: string
  ) {
    try {
      await habitsStore.logExecution(
        habitId,
        "",
        undefined,
        status,
        targetId,
        eventTimestampForDay(selected_date_str)
      );
    } catch (e) {
      console.error(e);
    }
  }

  // ── Cal event log ──────────────────────────────────────────────
  async function logOccurrence(calEventId: string, slotId?: string) {
    try {
      await calEventsStore.logOccurrence(calEventId, slotId);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveEvent(
    payload: Parameters<typeof calEventsStore.createCalEvent>[0]
  ) {
    await calEventsStore.createCalEvent(payload);
    isAddingEvent = false;
  }

  // ── Unified SCHEDULE items ─────────────────────────────────────
  type HabitSlot = {
    kind: "habit";
    lineage: HabitLineage;
    targetId: string;
    time: string;
    hasEnd: false;
    dtendTime: undefined;
    isDuring: boolean;
    isOverlap: boolean;
  };

  type EventSlot = {
    kind: "event";
    blueprint: CalEventBlueprint;
    slot: ProjectedSlot;
    occurrence: OccurrenceRecord | undefined;
    time: string;
    hasEnd: boolean;
    dtendTime: string | undefined;
    isDuring: boolean;
    isOverlap: boolean;
  };

  type ScheduleItem = HabitSlot | EventSlot;

  type RawHabitSlot = Omit<HabitSlot, "isDuring" | "isOverlap">;
  type RawEventSlot = Omit<EventSlot, "isDuring" | "isOverlap">;
  type RawScheduleItem = RawHabitSlot | RawEventSlot;

  let allScheduleItems = $derived.by((): ScheduleItem[] => {
    const raw: RawScheduleItem[] = [];

    // Timed habits (daily_multiple with sub-targets)
    for (const lineage of $habitsStore) {
      const rules = lineage.head.schedule_rules;
      if (rules && rules.type === "daily_multiple" && rules.targets) {
        for (const target of rules.targets) {
          raw.push({
            kind: "habit",
            lineage,
            targetId: target.id,
            time: target.time_hint ?? "00:00",
            hasEnd: false,
            dtendTime: undefined,
          });
        }
      }
    }

    // Calendar event projected slots
    for (const blueprint of $calEventsStore) {
      const slots = projectSlotsForDate(blueprint, selected_date_str);
      for (const slot of slots) {
        const occurrence = findOccurrence(
          $calOccurrencesStore,
          blueprint.entity,
          slot.slotId,
          selected_date_str
        );
        raw.push({
          kind: "event",
          blueprint,
          slot,
          occurrence,
          time: slot.scheduledTime,
          hasEnd: slot.hasEnd,
          dtendTime: slot.dtendTime,
        });
      }
    }

    // Sort by time (with "ALL DAY" / untimed events first)
    raw.sort((a, b) => {
      if (a.time === "ALL DAY" && b.time !== "ALL DAY") return -1;
      if (b.time === "ALL DAY" && a.time !== "ALL DAY") return 1;
      return a.time.localeCompare(b.time);
    });

    // Annotate: isDuring (point-in-time item falls within a block event's window)
    const blocks = raw.filter((item) => item.hasEnd && item.dtendTime);
    return raw.map((item) => {
      const isDuring =
        !item.hasEnd &&
        item.time !== "ALL DAY" &&
        blocks.some(
          (block) =>
            block !== item &&
            item.time > block.time &&
            item.time < (block.dtendTime ?? "99:99")
        );

      const isOverlap =
        item.hasEnd &&
        !!item.dtendTime &&
        blocks.some(
          (block) =>
            block !== item &&
            block.hasEnd &&
            block.dtendTime &&
            item.time < block.dtendTime &&
            block.time < item.dtendTime!
        );

      return { ...item, isDuring, isOverlap } as ScheduleItem;
    });
  });

  // Group consecutive items with the same time into a cluster
  type TimeGroup = {
    time: string;
    dtendTime: string | undefined;
    isBlock: boolean;
    items: ScheduleItem[];
  };

  let scheduleGroups = $derived.by((): TimeGroup[] => {
    const groups: TimeGroup[] = [];
    for (const item of allScheduleItems) {
      const last = groups[groups.length - 1];
      if (last && last.time === item.time) {
        last.items.push(item);
        // If any item in group is a block, show the range
        if (item.hasEnd && item.dtendTime) {
          last.isBlock = true;
          last.dtendTime = item.dtendTime;
        }
      } else {
        groups.push({
          time: item.time,
          dtendTime: item.hasEnd ? item.dtendTime : undefined,
          isBlock: item.hasEnd,
          items: [item],
        });
      }
    }
    return groups;
  });

  let generalHabitItems = $derived(
    $habitsStore.filter((lineage) => {
      const rules = lineage.head.schedule_rules;
      // Exclude timed sub-target habits — they appear in the SCHEDULE section
      if (rules && rules.type === "daily_multiple" && rules.targets)
        return false;
      // Only show habits that are scheduled for the selected date
      if (!rules) return false;
      return isScheduleRuleActive(rules, selected_date_str);
    })
  );

  let totalScheduleCount = $derived(allScheduleItems.length);
</script>

<header class="agenda-view-header">
  <div class="agenda-ascii-box">
    <div class="agenda-ascii-title-container">
      <button
        type="button"
        class="nav-arrow"
        onclick={() => navigateDay(-1)}
        aria-label="Previous day"
      >
        &lt;
      </button>
      <div class="agenda-ascii-center">
        <div class="agenda-ascii-title">DAILY AGENDA</div>
        <div class="agenda-ascii-date">{dateTodayStr.toUpperCase()}</div>
      </div>
      <button
        type="button"
        class="nav-arrow"
        onclick={() => navigateDay(1)}
        aria-label="Next day"
      >
        &gt;
      </button>
    </div>
  </div>
</header>

<div class="agenda-container" id="agenda-view">
  <!-- ── SCHEDULE section (time-gutter layout) ── -->
  <section class="agenda-section">
    <div class="section-title-bar">
      <h2>SCHEDULE</h2>
      <Badge id="schedule-count" variant="default" class="mono-badge">
        {totalScheduleCount}
      </Badge>
    </div>

    <div class="schedule-timeline">
      {#each scheduleGroups as group (group.time + group.items
          .map( (i) => (i.kind === "habit" ? i.targetId : (i.slot.slotId ?? i.slot.calEventId)) )
          .join(","))}
        <!-- If the first item in this group has a continuation bar from a block above -->
        {@const firstItem = group.items[0]}
        <div
          class="schedule-row"
          class:during-block={(firstItem as any).isDuring}
        >
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
            {#each group.items as item (item.kind === "habit" ? item.kind + item.targetId : item.kind + (item.slot.slotId ?? item.slot.calEventId))}
              {#if item.kind === "habit"}
                <div
                  class="habit-wrap"
                  class:is-overlap={(item as HabitSlot).isOverlap}
                >
                  <HabitItem
                    lineage={(item as HabitSlot).lineage}
                    targetId={(item as HabitSlot).targetId}
                    {selected_date_str}
                    {selected_date_ms}
                    onSelect={selectHabit}
                    onLog={logHabitEvent}
                    onLongPress={handleLongPress}
                  />
                </div>
              {:else}
                <div
                  class="event-wrap"
                  class:is-overlap={(item as EventSlot).isOverlap}
                >
                  <EventItem
                    blueprint={(item as EventSlot).blueprint}
                    slot={(item as EventSlot).slot}
                    occurrence={(item as EventSlot).occurrence}
                    {nowMs}
                    onConfirm={logOccurrence}
                  />
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}

      <!-- Add buttons -->
    </div>

    <div class="add-row-group">
      <button
        type="button"
        class="add-agenda-row"
        onclick={() => (isAddingEvent = true)}
      >
        + ADD EVENT
      </button>
    </div>
  </section>

  <!-- ── HABITS section (untimed) ── -->
  <section class="agenda-section">
    <div class="section-title-bar">
      <h2>HABITS</h2>
      <Badge id="habits-count" variant="default" class="mono-badge">
        {generalHabitItems.length}
      </Badge>
    </div>

    <div class="agenda-list">
      {#each generalHabitItems as lineage (lineage.head.entity)}
        <HabitItem
          {lineage}
          {selected_date_str}
          {selected_date_ms}
          onSelect={selectHabit}
          onLog={logHabitEvent}
          onLongPress={handleLongPress}
        />
      {/each}
      <button
        type="button"
        class="add-agenda-row"
        onclick={() => openAddHabit("habit")}
      >
        + ADD HABIT
      </button>
    </div>
  </section>
</div>

<!-- Add Event overlay -->
{#if isAddingEvent}
  <AddEventScreen onSave={saveEvent} onClose={() => (isAddingEvent = false)} />
{/if}

<!-- Add Habit overlay -->
{#if isAddingHabit}
  <AddHabitScreen
    {dbReady}
    {initialScheduleType}
    {initialUseSubtargets}
    onClose={() => (isAddingHabit = false)}
  />
{/if}

<!-- Habit detail bottom sheet -->
<BottomSheet
  bind:isOpen={isBottomSheetOpen}
  title={selectedLineage?.head.name ?? "Habit Details"}
>
  {#if selectedLineage}
    <HabitDetailView
      lineage={selectedLineage}
      onBack={() => {
        isBottomSheetOpen = false;
        selectedHabitId = null;
      }}
      onUpdateId={(id) => {
        selectedHabitId = id;
      }}
    />
  {/if}
</BottomSheet>

<!-- Context menu (skip / details) -->
<BottomSheet
  bind:isOpen={isContextOpen}
  title={contextLineage
    ? `Action: ${contextLineage.head.name}`
    : "Habit Action"}
>
  {#if contextLineage}
    <div class="context-actions-grid">
      <button
        type="button"
        onclick={async () => {
          if (activeContextHabitId) {
            await logHabitEvent(
              activeContextHabitId,
              "exempt",
              activeContextTargetId
            );
          }
          isContextOpen = false;
        }}
        class="context-menu-btn skip-action"
      >
        ~ SKIP TODAY
      </button>

      <button
        type="button"
        onclick={() => {
          if (activeContextHabitId) selectHabit(activeContextHabitId);
          isContextOpen = false;
        }}
        class="context-menu-btn detail-action"
      >
        VIEW DETAILS &amp; HISTORY
      </button>

      <button
        type="button"
        onclick={() => (isContextOpen = false)}
        class="context-menu-btn cancel-action"
      >
        CANCEL
      </button>
    </div>
  {/if}
</BottomSheet>

<style>
  /* ── Header ── */
  .agenda-view-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }

  .agenda-ascii-box {
    padding: var(--space-s) var(--space-m);
    background: #000;
    color: #fff;
    font-family: var(--font-mono);
    text-align: center;
  }

  .agenda-ascii-title-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .nav-arrow {
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-3);
    font-weight: 900;
    color: #999;
    cursor: pointer;
    padding: var(--space-2xs) var(--space-xs);
  }
  .nav-arrow:hover {
    color: #fff;
  }

  .agenda-ascii-center {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .agenda-ascii-title {
    font-size: var(--step-0);
    font-weight: 900;
    color: #fff;
  }

  .agenda-ascii-date {
    font-size: var(--step-n2);
    font-weight: 700;
    color: #999;
    margin-top: 4px;
  }

  /* ── Layout ── */
  .agenda-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
    margin-top: var(--space-m);
    padding-bottom: var(--space-l);
  }

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
    color: #000;
    margin: 0;
  }

  :global(.mono-badge) {
    font-family: var(--font-mono) !important;
    font-weight: 700 !important;
    border: none !important;
    background: #000 !important;
    color: #fff !important;
    border-radius: 0 !important;
  }

  /* ── Time-gutter layout ── */
  .schedule-timeline {
    display: flex;
    flex-direction: column;
    border: 2px solid #000;
  }

  .schedule-row {
    display: grid;
    grid-template-columns: 52px 1fr;
    border-bottom: 2px solid #000;
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
    border-right: 2px solid #000;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    color: #666;
    background: #fff;
    gap: 2px;
    min-height: 48px;
  }

  .time-start {
    color: #000;
  }

  .time-pipe {
    color: #999;
    font-size: 10px;
    line-height: 1;
  }

  .time-end {
    color: #999;
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
    border-top: 2px solid #000;
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
    border-left: 8px solid #000;
  }

  /* ── Add buttons ── */
  .add-row-group {
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-3xs);
  }

  .add-agenda-row {
    flex: 1;
    border: 2px dashed #000;
    padding: var(--space-s);
    text-align: center;
    color: #000;
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
    background: #000;
    color: #fff;
  }

  /* ── General habits list ── */
  .agenda-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  /* ── Context menu ── */
  .context-actions-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    padding: var(--space-s) 0;
  }

  .context-menu-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-s);
    border: 2px solid var(--border-accent);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    cursor: pointer;
    background: var(--bg-surface);
    text-align: left;
  }
  .context-menu-btn:active {
    background: var(--bg-input);
  }

  .skip-action {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .cancel-action {
    background: var(--bg-input);
    color: var(--text-secondary);
    border-style: dashed;
    justify-content: center;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
