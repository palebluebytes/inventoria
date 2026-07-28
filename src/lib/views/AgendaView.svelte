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
  import {
    annotateSchedule,
    clusterByTime,
    type RawScheduleItem,
  } from "../cal_events/schedule-grouping";
  import HabitDetailView from "./habits/HabitDetailView.svelte";
  import AddHabitScreen from "./habits/AddHabitScreen.svelte";
  import AddEventScreen from "./habits/AddEventScreen.svelte";
  import AgendaHeader from "./habits/AgendaHeader.svelte";
  import ScheduleSection from "./habits/ScheduleSection.svelte";
  import HabitsSection from "./habits/HabitsSection.svelte";
  import BottomSheet from "../ui/BottomSheet.svelte";

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
  // Fuse timed habit sub-targets and projected calendar-event slots into one
  // raw list; the annotate/cluster math lives in `schedule-grouping.ts`.
  let allScheduleItems = $derived.by(() => {
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

    return annotateSchedule(raw);
  });

  let scheduleGroups = $derived(clusterByTime(allScheduleItems));

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

<AgendaHeader
  dateLabel={dateTodayStr}
  onPrev={() => navigateDay(-1)}
  onNext={() => navigateDay(1)}
/>

<div class="agenda-container" id="agenda-view">
  <ScheduleSection
    groups={scheduleGroups}
    count={totalScheduleCount}
    {selected_date_str}
    {selected_date_ms}
    {nowMs}
    onSelectHabit={selectHabit}
    onLogHabit={logHabitEvent}
    onLongPressHabit={handleLongPress}
    onConfirmOccurrence={logOccurrence}
    onAddEvent={() => (isAddingEvent = true)}
  />

  <HabitsSection
    lineages={generalHabitItems}
    {selected_date_str}
    {selected_date_ms}
    onSelectHabit={selectHabit}
    onLogHabit={logHabitEvent}
    onLongPressHabit={handleLongPress}
    onAddHabit={() => openAddHabit("habit")}
  />
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
  /* ── Layout ── */
  .agenda-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
    margin-top: var(--space-m);
    padding-bottom: var(--space-l);
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
</style>
