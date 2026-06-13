<script lang="ts">
  import { habitsStore, type HabitLineage } from "../../stores/habits.store";
  import { dbClient } from "../../db/db.client";
  import {
    getDailyLineageStates,
    toLocalDateStr,
    getActiveExecutions,
    type ScheduleRule,
    type DayOfWeek,
  } from "../../habits/habits";
  import Card from "../../ui/Card.svelte";
  import Input from "../../ui/Input.svelte";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import Badge from "../../ui/Badge.svelte";

  // Svelte 5 props
  let {
    lineage,
    onBack,
    onUpdateId,
  }: {
    lineage: HabitLineage;
    onBack: () => void;
    onUpdateId?: (id: string) => void;
  } = $props();

  // Form states for editing
  let habitName = $state(lineage.head.name);
  let habitCategory = $state(lineage.head.category);
  let habitScheduleType = $state<
    "daily_multiple" | "weekly_days" | "weekly_flexible"
  >(
    lineage.head.schedule_rules?.type === "daily_multiple" ||
      lineage.head.schedule_rules?.type === "weekly_days" ||
      lineage.head.schedule_rules?.type === "weekly_flexible"
      ? lineage.head.schedule_rules.type
      : "daily_multiple"
  );

  // daily_multiple options:
  let dailyCount = $state(
    lineage.head.schedule_rules?.type === "daily_multiple"
      ? (lineage.head.schedule_rules.count ?? 1)
      : 1
  );
  let dailyUseSubtargets = $state(
    lineage.head.schedule_rules?.type === "daily_multiple" &&
      !!lineage.head.schedule_rules.targets
  );
  let dailySubtargets = $state<{ id: string; time_hint: string }[]>(
    lineage.head.schedule_rules?.type === "daily_multiple" &&
      lineage.head.schedule_rules.targets
      ? lineage.head.schedule_rules.targets.map((t) => ({
          id: t.id,
          time_hint: t.time_hint || "",
        }))
      : [
          { id: "slot_1", time_hint: "08:00" },
          { id: "slot_2", time_hint: "20:00" },
        ]
  );

  // weekly_days options:
  let weeklyDaysSelected = $state<{ [key: string]: boolean }>(
    lineage.head.schedule_rules?.type === "weekly_days"
      ? {
          mon: lineage.head.schedule_rules.days.includes("mon"),
          tue: lineage.head.schedule_rules.days.includes("tue"),
          wed: lineage.head.schedule_rules.days.includes("wed"),
          thu: lineage.head.schedule_rules.days.includes("thu"),
          fri: lineage.head.schedule_rules.days.includes("fri"),
          sat: lineage.head.schedule_rules.days.includes("sat"),
          sun: lineage.head.schedule_rules.days.includes("sun"),
        }
      : {
          mon: true,
          tue: true,
          wed: true,
          thu: true,
          fri: true,
          sat: false,
          sun: false,
        }
  );

  // weekly_flexible options:
  let weeklyFlexCount = $state(
    lineage.head.schedule_rules?.type === "weekly_flexible"
      ? lineage.head.schedule_rules.count
      : 3
  );

  let habitInstrument = $state(lineage.head.instrument || "");
  let saveStatus = $state<"idle" | "loading" | "error" | "success">("idle");
  let saveError = $state("");

  // Log Execution state
  let logNote = $state("");
  let logDifficulty = $state<"easy" | "medium" | "hard">("medium");
  let logDuration = $state<number | undefined>(undefined);
  let logStatusValue = $state<"completed" | "exempt">("completed");
  let logTargetId = $state<string>("");
  let logStatus = $state<"idle" | "loading" | "error" | "success">("idle");
  let logError = $state("");

  // Derived: map of dateStr -> DailyState
  let dailyStates = $derived.by(() => {
    return getDailyLineageStates(
      lineage.blueprints,
      lineage.executions,
      Date.now()
    );
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

  // Calculate stats
  let activeExecs = $derived(getActiveExecutions(lineage.executions));
  let totalCompletions = $derived(
    activeExecs.filter((e) => e.status === "completed").length
  );
  let totalExemptions = $derived(
    activeExecs.filter((e) => e.status === "exempt").length
  );

  async function handleSaveBlueprint() {
    if (!habitName.trim()) {
      saveError = "Habit name cannot be empty";
      saveStatus = "error";
      return;
    }

    saveStatus = "loading";
    saveError = "";

    // Construct schedule rules
    let scheduleRules: ScheduleRule;
    if (habitScheduleType === "daily_multiple") {
      if (dailyUseSubtargets) {
        scheduleRules = {
          type: "daily_multiple",
          targets: dailySubtargets
            .filter((t) => t.time_hint.trim() !== "")
            .map((t) => ({
              id:
                t.id.trim() ||
                "slot_" + Math.random().toString(36).substring(2, 9),
              time_hint: t.time_hint.trim(),
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
      const newId = await habitsStore.updateHabit(
        lineage.head,
        habitName.trim(),
        habitCategory,
        scheduleRules,
        habitInstrument
      );
      saveStatus = "success";
      if (onUpdateId) {
        onUpdateId(newId);
      }
      setTimeout(() => {
        saveStatus = "idle";
      }, 2000);
    } catch (e: any) {
      saveStatus = "error";
      saveError = e.message ?? String(e);
    }
  }

  async function handleLogExecution() {
    logStatus = "loading";
    logError = "";
    try {
      const metadata =
        logNote.trim() || logDuration
          ? {
              note: logNote.trim() || undefined,
              difficulty: logDifficulty,
              duration: logDuration || undefined,
            }
          : undefined;

      await habitsStore.logExecution(
        lineage.head.entity,
        habitInstrument.trim(),
        metadata,
        logStatusValue,
        logTargetId || undefined
      );

      logNote = "";
      logDuration = undefined;
      logDifficulty = "medium";
      logTargetId = "";
      logStatusValue = "completed";
      logStatus = "success";

      setTimeout(() => {
        logStatus = "idle";
      }, 2000);
    } catch (e: any) {
      logStatus = "error";
      logError = e.message ?? String(e);
    }
  }

  async function handleArchive() {
    if (
      confirm(
        "Are you sure you want to archive this habit? History will be preserved, but it will be hidden from the active list."
      )
    ) {
      try {
        await habitsStore.archiveHabit(lineage.head.entity);
        onBack();
      } catch (e: any) {
        saveStatus = "error";
        saveError = e.message ?? String(e);
      }
    }
  }

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

<div class="habit-detail-view">
  <header class="detail-header mt-2">
    <div class="header-title-row">
      <span
        class="badge-custom"
        style={getCategoryColor(lineage.head.category)}
      >
        {lineage.head.category}
      </span>
    </div>
    <p class="schedule-summary">
      Schedule: {formatSchedule(lineage.head.schedule_rules)}
      {#if lineage.head.instrument}
        • Instrument: <code class="instrument-code"
          >{lineage.head.instrument}</code
        >
      {/if}
    </p>
  </header>

  <!-- Stats Cards Grid -->
  <div class="stats-grid mt-4">
    <Card class="stat-card shadow-brutal">
      <span class="stat-value">{Math.round(lineage.score * 100)}%</span>
      <span class="stat-label">Habit Strength 💪</span>
    </Card>
    <Card class="stat-card shadow-brutal">
      <span class="stat-value">{lineage.streak}</span>
      <span class="stat-label">Day Streak 🔥</span>
    </Card>
    <Card class="stat-card shadow-brutal">
      <span class="stat-value">{totalCompletions}</span>
      <span class="stat-label">Logged Completions 📈</span>
    </Card>
    <Card class="stat-card shadow-brutal">
      <span class="stat-value">{totalExemptions}</span>
      <span class="stat-label">Exemptions ⏳</span>
    </Card>
  </div>

  <!-- Heatmap Visualisation -->
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

  <div class="view-columns mt-4">
    <!-- Log new execution -->
    <div class="view-column">
      <Card class="shadow-brutal height-full">
        <h2>Log Completion</h2>
        <div class="form-group mt-2">
          <div class="row-group">
            <!-- Logging Status Selector -->
            <div class="col-group">
              <label for="log-status-val" class="field-label">Log Status</label>
              <select
                id="log-status-val"
                bind:value={logStatusValue}
                class="select-brutal"
              >
                <option value="completed">Completed</option>
                <option value="exempt">Exempt (Sick/Travel/Rest)</option>
              </select>
            </div>

            <!-- Optional Subtarget Selector -->
            {#if lineage.head.schedule_rules?.type === "daily_multiple" && lineage.head.schedule_rules.targets}
              <div class="col-group">
                <label for="log-target" class="field-label">Target Area</label>
                <select
                  id="log-target"
                  bind:value={logTargetId}
                  class="select-brutal"
                >
                  <option value="">General / Unspecified</option>
                  {#each lineage.head.schedule_rules.targets as tgt}
                    <option value={tgt.id}
                      >{tgt.id}
                      {tgt.time_hint ? `(${tgt.time_hint})` : ""}</option
                    >
                  {/each}
                </select>
              </div>
            {/if}
          </div>

          <label for="log-note" class="field-label">Qualitative Notes</label>
          <textarea
            id="log-note"
            placeholder="How did it feel? (optional)"
            bind:value={logNote}
            class="textarea-brutal"
          ></textarea>

          <div class="row-group">
            <div class="col-group">
              <label for="log-difficulty" class="field-label">Difficulty</label>
              <select
                id="log-difficulty"
                bind:value={logDifficulty}
                class="select-brutal"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div class="col-group">
              <label for="log-duration" class="field-label"
                >Duration (mins)</label
              >
              <input
                id="log-duration"
                type="number"
                min="1"
                placeholder="Duration"
                bind:value={logDuration}
                class="input-number-brutal"
              />
            </div>
          </div>

          <Button
            onclick={handleLogExecution}
            disabled={logStatus === "loading"}
            loading={logStatus === "loading"}
          >
            Submit Log
          </Button>

          {#if logStatus === "success"}
            <Alert variant="success">Execution event logged successfully!</Alert
            >
          {/if}
          {#if logStatus === "error"}
            <Alert variant="error">{logError}</Alert>
          {/if}
        </div>
      </Card>
    </div>

    <!-- Edit blueprint -->
    <div class="view-column">
      <Card class="shadow-brutal height-full">
        <h2>Edit Blueprint</h2>
        <p class="description-small">
          Editing chains a new blueprint version to preserve history.
        </p>
        <div class="form-group mt-2">
          <label for="edit-name" class="field-label">Habit Name</label>
          <Input id="edit-name" placeholder="Name" bind:value={habitName} />

          <div class="row-group">
            <div class="col-group">
              <label for="edit-category" class="field-label">Category</label>
              <select
                id="edit-category"
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
              <label for="edit-sched-type" class="field-label"
                >Schedule Type</label
              >
              <select
                id="edit-sched-type"
                bind:value={habitScheduleType}
                class="select-brutal"
              >
                <option value="daily_multiple">Daily (Single / Multiple)</option
                >
                <option value="weekly_days">Weekly (Specific Days)</option>
                <option value="weekly_flexible">Weekly (Flexible Count)</option>
              </select>
            </div>
          </div>

          <!-- Contextual schedule editors -->
          {#if habitScheduleType === "daily_multiple"}
            <div class="col-group section-inner">
              <div class="row-group align-center">
                <input
                  id="edit-use-subtargets"
                  type="checkbox"
                  bind:checked={dailyUseSubtargets}
                />
                <label for="edit-use-subtargets" class="field-label mt-0"
                  >Define specific time-of-day targets</label
                >
              </div>

              {#if dailyUseSubtargets}
                <div class="subtargets-editor mt-2">
                  <label class="field-label">Time Targets</label>
                  <div class="subtargets-list mt-1">
                    {#each dailySubtargets as tgt, idx}
                      <div class="subtarget-row">
                        <input
                          type="time"
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
                        {
                          id:
                            "slot_" +
                            Math.random().toString(36).substring(2, 9),
                          time_hint: "",
                        },
                      ])}
                  >
                    + Add Target
                  </button>
                </div>
              {:else}
                <div class="col-group mt-2">
                  <label for="edit-daily-count" class="field-label"
                    >Target repetitions per day</label
                  >
                  <input
                    id="edit-daily-count"
                    type="number"
                    min="1"
                    bind:value={dailyCount}
                    class="input-number-brutal"
                  />
                </div>
              {/if}
            </div>
          {/if}

          {#if habitScheduleType === "weekly_days"}
            <div class="col-group section-inner">
              <label class="field-label">Select Scheduled Days</label>
              <div class="days-grid mt-1">
                {#each ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as day}
                  <label
                    class="day-btn"
                    class:selected={weeklyDaysSelected[day]}
                  >
                    <input
                      type="checkbox"
                      bind:checked={weeklyDaysSelected[day]}
                    />
                    {day.toUpperCase()}
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          {#if habitScheduleType === "weekly_flexible"}
            <div class="col-group section-inner">
              <label for="edit-weekly-count" class="field-label"
                >Target completions per week</label
              >
              <input
                id="edit-weekly-count"
                type="number"
                min="1"
                max="7"
                bind:value={weeklyFlexCount}
                class="input-number-brutal"
              />
            </div>
          {/if}

          <label for="edit-instrument" class="field-label"
            >Instrument ID (optional)</label
          >
          <Input
            id="edit-instrument"
            placeholder="twin:kettlebell_16kg"
            bind:value={habitInstrument}
          />

          <div class="action-buttons-row">
            <Button
              onclick={handleSaveBlueprint}
              disabled={saveStatus === "loading"}
              loading={saveStatus === "loading"}
            >
              Update Blueprint
            </Button>
            <Button variant="danger" onclick={handleArchive}
              >Archive Habit</Button
            >
          </div>

          {#if saveStatus === "success"}
            <Alert variant="success"
              >Blueprint updated! Chain updated in background.</Alert
            >
          {/if}
          {#if saveStatus === "error"}
            <Alert variant="error">{saveError}</Alert>
          {/if}
        </div>
      </Card>
    </div>
  </div>

  <!-- Execution logs with notes -->
  <Card class="mt-4 shadow-brutal">
    <h2>Execution & Quality Logs</h2>
    {#if lineage.executions.length === 0}
      <p class="empty">No executions logged yet.</p>
    {:else}
      <ul class="logs-timeline">
        {#each [...lineage.executions].reverse() as exec}
          <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-time">{formatTime(exec.time)}</span>
                <span class="badge-status {exec.status || 'completed'}">
                  {exec.status || "completed"}
                </span>
                {#if exec.target_id}
                  <span class="badge-target">{exec.target_id}</span>
                {/if}
                {#if exec.metadata?.difficulty}
                  <span class="badge-difficulty {exec.metadata.difficulty}">
                    {exec.metadata.difficulty}
                  </span>
                {/if}
                {#if exec.metadata?.duration}
                  <span class="badge-duration">{exec.metadata.duration}m</span>
                {/if}
              </div>
              {#if exec.metadata?.note}
                <blockquote class="timeline-note">
                  “{exec.metadata.note}”
                </blockquote>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>

<style>
  .habit-detail-view {
    animation: fadeIn 0.3s ease-out;
  }
  .header-nav {
    display: flex;
    justify-content: flex-start;
  }
  .detail-header h1 {
    font-size: var(--step-3);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text-primary);
  }
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
    border: 1px solid var(--border-accent);
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
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: var(--space-s);
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-m);
    text-align: center;
  }
  .stat-value {
    font-size: var(--step-3);
    font-weight: 800;
    color: var(--text-primary);
  }
  .stat-label {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-weight: 500;
    margin-top: var(--space-3xs);
    text-transform: uppercase;
    line-height: 1.2;
  }
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
  .view-columns {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-m);
  }
  .height-full {
    height: 100%;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
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
  .textarea-brutal {
    width: 100%;
    height: 80px;
    background: transparent;
    border: 1px solid var(--border-accent);
    padding: var(--space-2xs) var(--space-s);
    font-family: inherit;
    font-size: var(--step-n1);
    color: var(--text-primary);
    outline: none;
    resize: none;
  }
  .textarea-brutal:focus {
    background: #fff;
    box-shadow: 0 0 0 1px #000;
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
  .action-buttons-row {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }
  .description-small {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .shadow-brutal {
    border: 2px solid var(--border-accent) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent);
  }

  /* Timeline Styles */
  .logs-timeline {
    list-style: none;
    position: relative;
    padding-left: var(--space-s);
    margin-top: var(--space-s);
  }
  .logs-timeline::before {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 4px;
    width: 2px;
    background-color: var(--border-accent);
  }
  .timeline-item {
    position: relative;
    margin-bottom: var(--space-m);
  }
  .timeline-item:last-child {
    margin-bottom: 0;
  }
  .timeline-marker {
    position: absolute;
    left: -20px;
    top: 6px;
    width: 10px;
    height: 10px;
    background-color: var(--bg-base);
    border: 2px solid var(--border-accent);
    border-radius: 50%;
  }
  .timeline-content {
    background: var(--bg-input);
    padding: var(--space-2xs) var(--space-xs);
    border: 1px solid var(--border);
  }
  .timeline-header {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    flex-wrap: wrap;
  }
  .timeline-time {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-weight: 500;
  }
  .badge-difficulty {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 4px;
    border: 1px solid var(--border-accent);
  }
  .badge-difficulty.easy {
    background: var(--green-bg);
    color: var(--green);
  }
  .badge-difficulty.medium {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .badge-difficulty.hard {
    background: var(--red-bg);
    color: var(--red);
  }

  .badge-duration {
    font-size: 10px;
    background: #000;
    color: #fff;
    padding: 1px 4px;
    font-weight: 500;
  }
  .badge-status {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 4px;
    border: 1px solid var(--border-accent);
  }
  .badge-status.completed {
    background: var(--green-bg);
    color: var(--green);
  }
  .badge-status.exempt {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .badge-target {
    font-size: 10px;
    font-weight: 600;
    background: var(--bg-input);
    border: 1px solid var(--border-accent);
    padding: 1px 4px;
  }
  .timeline-note {
    font-size: var(--step-n1);
    color: var(--text-primary);
    margin-top: var(--space-3xs);
    font-style: italic;
    border-left: 2px solid var(--text-muted);
    padding-left: var(--space-2xs);
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Advanced inner editor styling */
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
    min-width: 40px;
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
