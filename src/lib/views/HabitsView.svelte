<script lang="ts">
  import { habitsStore } from "../stores/habits.store";
  import HabitDetailView from "./habits/HabitDetailView.svelte";
  import AddHabitScreen from "./habits/AddHabitScreen.svelte";
  import BottomSheet from "../ui/BottomSheet.svelte";
  import Badge from "../ui/Badge.svelte";
  import HabitStats from "./habits/HabitStats.svelte";
  import HabitItem from "./habits/HabitItem.svelte";
  import { localDateStrToDate, eventTimestampForDay } from "../habits/habits";

  let { dbReady }: { dbReady: boolean } = $props();

  // Fullscreen Add Habit Overlay
  let isAddingHabit = $state(false);
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

  // Detail View State
  let selectedHabitId = $state<string | null>(null);
  let selectedLineage = $derived(
    $habitsStore.find((l) => l.head.entity === selectedHabitId) || null
  );
  let isBottomSheetOpen = $state(false);

  // Context Menu State for Skipping / Quick actions
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

  function handleLongPress(habitId: string, target_id?: string) {
    activeContextHabitId = habitId;
    activeContextTargetId = target_id;
    isContextOpen = true;
  }

  $effect(() => {
    if (!isBottomSheetOpen) {
      selectedHabitId = null;
    }
  });

  // Global summary stats
  let totalHabitsCount = $derived($habitsStore.length);

  let avgStrength = $derived.by(() => {
    if ($habitsStore.length === 0) return 0;
    const totalScore = $habitsStore.reduce((acc, l) => acc + l.score, 0);
    return Math.round((totalScore / $habitsStore.length) * 100);
  });

  let maxStreak = $derived.by(() => {
    if ($habitsStore.length === 0) return 0;
    return Math.max(...$habitsStore.map((l) => l.streak));
  });

  // Emacs Agenda Header Date
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

  function navigateDay(direction: number) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + direction);
    currentDate = nextDate;
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

  let dateTodayStr = $derived.by(() => {
    return `${daysOfWeekLong[currentDate.getDay()]}, ${months[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  });

  // Derived timeline bifurcation
  let timedHabitItems = $derived.by(() => {
    const list: { lineage: any; target_id: string; time: string }[] = [];
    for (const lineage of $habitsStore) {
      const rules = lineage.head.schedule_rules;
      if (rules && rules.type === "daily_multiple" && rules.targets) {
        for (const target of rules.targets) {
          list.push({
            lineage,
            target_id: target.id,
            time: target.time_hint ?? "??:??",
          });
        }
      }
    }
    return list.sort((a, b) => a.time.localeCompare(b.time));
  });

  let generalHabitItems = $derived.by(() => {
    return $habitsStore.filter((lineage) => {
      const rules = lineage.head.schedule_rules;
      return !(rules && rules.type === "daily_multiple" && rules.targets);
    });
  });

  async function logHabitEvent(
    habitId: string,
    status: "completed" | "exempt" | "uncompleted",
    target_id?: string
  ) {
    try {
      const clickTime = eventTimestampForDay(selected_date_str);
      await habitsStore.logExecution(
        habitId,
        "", // instrumentId
        undefined, // metadata
        status,
        target_id,
        clickTime
      );
    } catch (e: any) {
      console.error(e);
    }
  }
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
        [&lt;]
      </button>
      <div class="agenda-ascii-title">DAILY AGENDA</div>
      <button
        type="button"
        class="nav-arrow"
        onclick={() => navigateDay(1)}
        aria-label="Next day"
      >
        [&gt;]
      </button>
    </div>
    <div class="agenda-ascii-date">{dateTodayStr.toUpperCase()}</div>
  </div>
</header>

<div class="agenda-container" id="habits-blueprints-list">
  <!-- Timed Timeline -->
  <section class="agenda-section">
    <div class="section-title-bar">
      <h2>SCHEDULE</h2>
      <Badge id="timed-habits-count" variant="default" class="mono-badge">
        {timedHabitItems.length}
      </Badge>
    </div>

    <div class="agenda-list">
      {#each timedHabitItems as item (item.lineage.head.entity + "-" + item.target_id)}
        <HabitItem
          lineage={item.lineage}
          targetId={item.target_id}
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
        onclick={() => openAddHabit("schedule")}
      >
        Click to add
      </button>
    </div>
  </section>

  <!-- General Habits -->
  <section class="agenda-section">
    <div class="section-title-bar">
      <h2>HABITS</h2>
      <Badge id="general-habits-count" variant="default" class="mono-badge">
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
        Click to add
      </button>
    </div>
  </section>
</div>

<!-- Fullscreen Add Habit modal -->
{#if isAddingHabit}
  <AddHabitScreen
    {dbReady}
    {initialScheduleType}
    {initialUseSubtargets}
    onClose={() => (isAddingHabit = false)}
  />
{/if}

<!-- Detail view bottom sheet -->
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

<!-- Context Menu overlay (Skips, Details) -->
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
        <span class="btn-indicator">[~]</span> SKIP TODAY
      </button>

      <button
        type="button"
        onclick={() => {
          if (activeContextHabitId) {
            selectHabit(activeContextHabitId);
          }
          isContextOpen = false;
        }}
        class="context-menu-btn detail-action"
      >
        <span class="btn-indicator">[d]</span> VIEW DETAILS & HISTORY
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
  .agenda-view-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }

  .agenda-ascii-box {
    border: 2px solid var(--border-accent);
    padding: var(--space-s) var(--space-m);
    background: var(--bg-surface);
    font-family: var(--font-mono);
    text-align: center;
  }

  .agenda-ascii-title-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-m);
  }

  .nav-arrow {
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 900;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0 var(--space-xs);
    transition: color 0.1s ease;
  }

  .nav-arrow:hover {
    color: var(--text-primary);
  }

  .agenda-ascii-title {
    font-size: var(--step-0);
    font-weight: 900;
    color: var(--text-primary);
  }

  .agenda-ascii-date {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
    margin-top: 4px;
  }

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
    border-bottom: 2px solid var(--border-accent);
    padding-bottom: var(--space-3xs);
    margin-bottom: var(--space-3xs);
  }

  .section-title-bar h2 {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  :global(.mono-badge) {
    font-family: var(--font-mono) !important;
    font-weight: 700 !important;
    border: 1px solid var(--border-accent) !important;
    border-radius: 0 !important;
  }

  .agenda-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  .add-agenda-row {
    width: 100%;
    border: 1px dashed var(--text-muted);
    padding: var(--space-m);
    text-align: center;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    background: rgba(0, 0, 0, 0.01);
    cursor: pointer;
    outline: none;
    transition:
      background-color 0.1s,
      color 0.1s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .add-agenda-row:hover,
  .add-agenda-row:focus {
    background: var(--bg-input);
    color: var(--text-primary);
    border-color: var(--border-accent);
  }

  .add-agenda-row:active {
    background: var(--border-accent);
    color: var(--bg-surface);
  }

  /* Context Menu Styling */
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
    transition: background-color 0.1s;
  }

  .context-menu-btn:active {
    background: var(--bg-input);
  }

  .btn-indicator {
    color: var(--text-secondary);
  }

  .skip-action {
    background: var(--amber-bg);
    color: var(--amber);
  }

  .detail-action {
    background: var(--bg-surface);
    color: var(--text-primary);
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
