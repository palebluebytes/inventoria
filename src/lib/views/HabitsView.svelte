<script lang="ts">
  import { habitsStore, type HabitLineage } from "../stores/habits.store";
  import HabitDetailView from "./habits/HabitDetailView.svelte";
  import { toUTCDateStr } from "../habits/habits";
  import type { ScheduleRule, DayOfWeek } from "../habits/habits";
  import BottomSheet from "../ui/BottomSheet.svelte";

  import Card from "../ui/Card.svelte";
  import Input from "../ui/Input.svelte";
  import Button from "../ui/Button.svelte";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Create Habit States
  let habitName = $state("");
  let habitCategory = $state("Fitness");
  let habitScheduleType = $state<
    "daily_multiple" | "weekly_days" | "weekly_flexible"
  >("daily_multiple");

  // daily_multiple options:
  let dailyCount = $state(1);
  let dailyUseSubtargets = $state(false);
  let dailySubtargets = $state<{ id: string; time_hint: string }[]>([
    { id: "morning", time_hint: "08:00" },
    { id: "evening", time_hint: "20:00" },
  ]);

  // weekly_days options:
  let weeklyDaysSelected = $state<{ [key: string]: boolean }>({
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  });

  // weekly_flexible options:
  let weeklyFlexCount = $state(3);

  let habitInstrument = $state("");
  let habitStatus = $state<"idle" | "loading" | "error">("idle");
  let habitError = $state("");

  // Detail View State
  let selectedHabitId = $state<string | null>(null);
  let selectedLineage = $derived(
    $habitsStore.find((l) => l.head.entity === selectedHabitId) || null
  );
  let isBottomSheetOpen = $state(false);

  function selectHabit(id: string) {
    selectedHabitId = id;
    isBottomSheetOpen = true;
  }

  $effect(() => {
    if (!isBottomSheetOpen) {
      selectedHabitId = null;
    }
  });

  // Global summary stats
  let totalHabitsCount = $derived($habitsStore.length);

  // Calculate average habit strength across all active habits
  let avgStrength = $derived.by(() => {
    if ($habitsStore.length === 0) return 0;
    const totalScore = $habitsStore.reduce((acc, l) => acc + l.score, 0);
    return Math.round((totalScore / $habitsStore.length) * 100);
  });

  // Calculate highest streak
  let maxStreak = $derived.by(() => {
    if ($habitsStore.length === 0) return 0;
    return Math.max(...$habitsStore.map((l) => l.streak));
  });

  async function addHabit() {
    if (!habitName.trim()) return;
    habitStatus = "loading";
    habitError = "";

    // Construct schedule rules
    let scheduleRules: ScheduleRule;
    if (habitScheduleType === "daily_multiple") {
      if (dailyUseSubtargets) {
        scheduleRules = {
          type: "daily_multiple",
          targets: dailySubtargets
            .filter((t) => t.id.trim() !== "")
            .map((t) => ({
              id: t.id.trim(),
              time_hint: t.time_hint.trim() || undefined,
            })),
        };
      } else {
        scheduleRules = {
          type: "daily_multiple",
          count: dailyCount,
        };
      }
    } else if (habitScheduleType === "weekly_days") {
      const days = (Object.keys(weeklyDaysSelected) as DayOfWeek[]).filter(
        (d) => weeklyDaysSelected[d]
      );
      scheduleRules = {
        type: "weekly_days",
        days,
      };
    } else {
      scheduleRules = {
        type: "weekly_flexible",
        count: weeklyFlexCount,
      };
    }

    try {
      await habitsStore.createHabit(
        habitName.trim(),
        habitCategory,
        scheduleRules,
        habitInstrument
      );
      // Reset form on success
      habitName = "";
      habitInstrument = "";
      habitCategory = "Fitness";
      habitScheduleType = "daily_multiple";
      dailyCount = 1;
      dailyUseSubtargets = false;
      dailySubtargets = [
        { id: "morning", time_hint: "08:00" },
        { id: "evening", time_hint: "20:00" },
      ];
      weeklyDaysSelected = {
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: false,
        sun: false,
      };
      weeklyFlexCount = 3;
      habitStatus = "idle";
    } catch (e: any) {
      habitStatus = "error";
      habitError = e.message ?? String(e);
    }
  }

  async function logHabitEvent(
    habitId: string,
    status: "completed" | "exempt",
    targetId?: string
  ) {
    try {
      await habitsStore.logExecution(
        habitId,
        "", // instrumentId
        undefined, // metadata
        status,
        targetId
      );
    } catch (e: any) {
      habitError = e.message ?? String(e);
    }
  }

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

<header class="page-header">
  <h1>Habits</h1>
  <p>
    Define Habit Blueprints and log Execution Events to build habit strength.
  </p>
</header>

<!-- Summary Statistics Row -->
<div class="stats-row mt-4">
  <Card class="summary-card shadow-brutal">
    <span class="summary-val">{avgStrength}%</span>
    <span class="summary-lbl">Avg Strength 💪</span>
  </Card>
  <Card class="summary-card shadow-brutal">
    <span class="summary-val">{maxStreak}</span>
    <span class="summary-lbl">Best Streak 🔥</span>
  </Card>
  <Card class="summary-card shadow-brutal">
    <span class="summary-val">{totalHabitsCount}</span>
    <span class="summary-lbl">Active Habits 📋</span>
  </Card>
</div>

<!-- New Habit Form -->
<Card class="mt-4 shadow-brutal">
  <h2>New Habit Blueprint</h2>
  <div class="form-group mt-2">
    <Input
      id="habit-name-input"
      placeholder="Habit name (e.g. Kettlebell Swings)"
      bind:value={habitName}
    />

    <div class="row-group">
      <div class="col-group">
        <label for="habit-category" class="field-label">Category</label>
        <select
          id="habit-category"
          bind:value={habitCategory}
          class="select-brutal"
        >
          <option value="Fitness">Fitness</option>
          <option value="Mind">Mind</option>
          <option value="Productivity">Productivity</option>
          <option value="Health">Health</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div class="col-group">
        <label for="habit-schedule" class="field-label">Schedule Type</label>
        <select
          id="habit-schedule"
          bind:value={habitScheduleType}
          class="select-brutal"
        >
          <option value="daily_multiple">Daily (Single / Multiple)</option>
          <option value="weekly_days">Weekly (Specific Days)</option>
          <option value="weekly_flexible">Weekly (Flexible Count)</option>
        </select>
      </div>
    </div>

    <!-- Contextual scheduling options -->
    {#if habitScheduleType === "daily_multiple"}
      <div class="col-group section-inner">
        <div class="row-group align-center">
          <input
            id="use-subtargets"
            type="checkbox"
            bind:checked={dailyUseSubtargets}
          />
          <label for="use-subtargets" class="field-label mt-0"
            >Define specific time-of-day targets (e.g., Morning, Night)</label
          >
        </div>

        {#if dailyUseSubtargets}
          <div class="subtargets-editor mt-2">
            <label class="field-label">Time Targets</label>
            <div class="subtargets-list mt-1">
              {#each dailySubtargets as tgt, idx}
                <div class="subtarget-row">
                  <input
                    type="text"
                    placeholder="Target ID (e.g. morning)"
                    bind:value={tgt.id}
                    class="input-brutal-small"
                  />
                  <input
                    type="text"
                    placeholder="Time hint (optional, e.g. 08:00)"
                    bind:value={tgt.time_hint}
                    class="input-brutal-small"
                  />
                  <button
                    type="button"
                    class="btn-danger-small"
                    onclick={() =>
                      (dailySubtargets = dailySubtargets.filter(
                        (_, i) => i !== idx
                      ))}
                  >
                    ✕
                  </button>
                </div>
              {/each}
            </div>
            <button
              type="button"
              class="btn-secondary-small mt-1"
              onclick={() =>
                (dailySubtargets = [
                  ...dailySubtargets,
                  { id: "", time_hint: "" },
                ])}
            >
              + Add Target
            </button>
          </div>
        {:else}
          <div class="col-group mt-2">
            <label for="habit-daily-count" class="field-label"
              >Target repetitions per day</label
            >
            <input
              id="habit-daily-count"
              type="number"
              min="1"
              bind:value={dailyCount}
              class="input-number-brutal"
            />
          </div>
        {/if}
      </div>
    {:else}
      <!-- Off/hidden option spacer -->
    {/if}

    {#if habitScheduleType === "weekly_days"}
      <div class="col-group section-inner">
        <label class="field-label">Select Scheduled Days</label>
        <div class="days-grid mt-1">
          {#each ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as day}
            <label class="day-btn" class:selected={weeklyDaysSelected[day]}>
              <input type="checkbox" bind:checked={weeklyDaysSelected[day]} />
              {day.toUpperCase()}
            </label>
          {/each}
        </div>
      </div>
    {/if}

    {#if habitScheduleType === "weekly_flexible"}
      <div class="col-group section-inner">
        <label for="habit-weekly-count" class="field-label"
          >Target completions per week</label
        >
        <input
          id="habit-weekly-count"
          type="number"
          min="1"
          max="7"
          bind:value={weeklyFlexCount}
          class="input-number-brutal"
        />
      </div>
    {/if}

    <Input
      id="habit-instrument-input"
      placeholder="Instrument ID (optional, e.g. twin:kettlebell_16kg)"
      bind:value={habitInstrument}
    />

    <Button
      onclick={addHabit}
      disabled={habitStatus === "loading" || !dbReady}
      loading={habitStatus === "loading"}
    >
      Add Habit Blueprint
    </Button>
  </div>
  {#if habitStatus === "error"}
    <Alert variant="error">{habitError}</Alert>
  {/if}
</Card>

<!-- Active habits List -->
<Card class="mt-4 shadow-brutal">
  <h2>
    Active Habit Blueprints
    <Badge id="habits-blueprints-count" variant="default" class="ml-2">
      {$habitsStore.length}
    </Badge>
  </h2>

  {#if $habitsStore.length === 0}
    <p class="empty">No habits yet. Add one above.</p>
  {:else}
    <ul id="habits-blueprints-list" class="habit-list">
      {#each $habitsStore as lineage}
        {@const todayStr = toUTCDateStr(Date.now())}
        {@const todayExecs = lineage.executions.filter(
          (e) => toUTCDateStr(e.time) === todayStr
        )}
        {@const isExempt = todayExecs.some((e) => e.status === "exempt")}
        {@const completedReps = todayExecs.filter(
          (e) => e.status === "completed"
        )}
        {@const completedCount = completedReps.length}
        {@const rules = lineage.head.schedule_rules}
        <li class="habit-item">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="habit-info-panel"
            onclick={() => selectHabit(lineage.head.entity)}
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
                        (e) =>
                          e.target_id === tgt.id && e.status === "completed"
                      )}
                      <button
                        type="button"
                        class="checkin-btn target-btn"
                        class:completed={isDone}
                        disabled={isDone}
                        onclick={() =>
                          logHabitEvent(
                            lineage.head.entity,
                            "completed",
                            tgt.id
                          )}
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
                        onclick={() =>
                          logHabitEvent(lineage.head.entity, "exempt")}
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
                        onclick={() =>
                          logHabitEvent(lineage.head.entity, "completed")}
                      >
                        {isDone ? "✓" : idx + 1}
                      </button>
                    {/each}
                    {#if !isExempt}
                      <button
                        type="button"
                        class="checkin-btn skip-btn"
                        onclick={() =>
                          logHabitEvent(lineage.head.entity, "exempt")}
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
                {@const daysOfWeek = [
                  "sun",
                  "mon",
                  "tue",
                  "wed",
                  "thu",
                  "fri",
                  "sat",
                ]}
                {@const utcDayStr = daysOfWeek[
                  new Date().getUTCDay()
                ] as DayOfWeek}
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
                          onclick={() =>
                            logHabitEvent(lineage.head.entity, "completed")}
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          class="checkin-btn skip-btn"
                          onclick={() =>
                            logHabitEvent(lineage.head.entity, "exempt")}
                        >
                          Skip
                        </button>
                      {/if}
                    {:else}
                      <span class="status-badge off">Off Day</span>
                      <button
                        type="button"
                        class="checkin-btn extra-btn"
                        onclick={() =>
                          logHabitEvent(lineage.head.entity, "completed")}
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
                  <span class="checkin-label"
                    >{weeklyDoneDays} / {rules.count} this week</span
                  >
                  <div class="checkin-buttons">
                    {#if completedCount > 0}
                      <span class="status-badge completed">Done Today ✓</span>
                    {:else if isExempt}
                      <span class="status-badge skipped">Skipped Today ↷</span>
                    {:else}
                      <button
                        type="button"
                        class="checkin-btn success-btn"
                        onclick={() =>
                          logHabitEvent(lineage.head.entity, "completed")}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        class="checkin-btn skip-btn"
                        onclick={() =>
                          logHabitEvent(lineage.head.entity, "exempt")}
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
      {/each}
    </ul>
  {/if}
</Card>
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

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.02em;
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
    display: flex;
    align-items: center;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-s);
  }
  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-s);
  }
  .summary-val {
    font-size: var(--step-2);
    font-weight: 800;
  }
  .summary-lbl {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 500;
    margin-top: 2px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .row-group {
    display: flex;
    gap: var(--space-s);
  }
  .row-group.align-center {
    align-items: center;
  }
  .col-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex: 1;
  }
  .field-label {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: -4px;
  }
  .field-label.mt-0 {
    margin-top: 0;
  }
  .select-brutal,
  .input-number-brutal {
    width: 100%;
    background: transparent;
    border: 1px solid var(--border-accent);
    padding: var(--space-2xs) var(--space-s);
    font-family: inherit;
    font-size: var(--step-n1);
    color: var(--text-primary);
    outline: none;
    border-radius: 0;
  }
  .select-brutal:focus,
  .input-number-brutal:focus {
    background: #fff;
    box-shadow: 0 0 0 1px #000;
  }
  .habit-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
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
  }
  .mini-stat {
    display: inline-flex;
    align-items: center;
    padding: var(--space-3xs) var(--space-2xs);
    border: 1px dashed var(--text-muted);
    background: #fff;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
  }
  .shadow-brutal {
    border: 2px solid var(--border-accent) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent);
  }
  :global(.mt-4) {
    margin-top: var(--space-m);
  }
  :global(.ml-2) {
    margin-left: var(--space-2xs);
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Advanced styling */
  .section-inner {
    border: 1px dashed var(--border-accent);
    padding: var(--space-s);
    background: rgba(0, 0, 0, 0.02);
  }
  .subtarget-row {
    display: flex;
    gap: var(--space-3xs);
    align-items: center;
    margin-bottom: var(--space-3xs);
  }
  .input-brutal-small {
    flex: 1;
    background: transparent;
    border: 1px solid var(--border-accent);
    padding: var(--space-3xs) var(--space-2xs);
    font-family: inherit;
    font-size: var(--step-n2);
    color: var(--text-primary);
    outline: none;
    border-radius: 0;
  }
  .input-brutal-small:focus {
    background: #fff;
  }
  .btn-danger-small {
    background: var(--red-bg);
    color: var(--red);
    border: 1px solid var(--border-accent);
    padding: var(--space-3xs) var(--space-2xs);
    cursor: pointer;
    font-weight: 700;
  }
  .btn-secondary-small {
    background: var(--bg-input);
    border: 1px solid var(--border-accent);
    padding: var(--space-3xs) var(--space-2xs);
    cursor: pointer;
    font-size: var(--step-n2);
    font-weight: 600;
  }
  .days-grid {
    display: flex;
    gap: var(--space-3xs);
    flex-wrap: wrap;
  }
  .day-btn {
    flex: 1;
    min-width: 45px;
    text-align: center;
    padding: var(--space-2xs);
    border: 1px solid var(--border-accent);
    cursor: pointer;
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--bg-input);
    user-select: none;
    transition: all 0.1s;
  }
  .day-btn.selected {
    background: var(--green-bg);
    color: var(--green);
    box-shadow: 2px 2px 0px 0px var(--border-accent);
    transform: translate(-1px, -1px);
  }
  .day-btn input {
    display: none;
  }
</style>
