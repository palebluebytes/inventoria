<script lang="ts">
  import { untrack } from "svelte";
  import { habitsStore, type HabitLineage } from "../../stores/habits.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import Card from "../../ui/Card.svelte";
  import Input from "../../ui/Input.svelte";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import HabitDetailHeader from "./HabitDetailHeader.svelte";
  import HabitStatCards from "./HabitStatCards.svelte";
  import HabitHeatmap from "./HabitHeatmap.svelte";
  import HabitExecutionTimeline from "./HabitExecutionTimeline.svelte";

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
  // Snapshot the lineage head once so these initializers don't stay reactive.
  const init = untrack(() => lineage.head);
  let habitName = $state(init.name);
  let habitCategory = $state(init.category);
  let habitScheduleType = $state<
    "daily_multiple" | "weekly_days" | "weekly_flexible"
  >(
    init.schedule_rules?.type === "daily_multiple" ||
      init.schedule_rules?.type === "weekly_days" ||
      init.schedule_rules?.type === "weekly_flexible"
      ? init.schedule_rules.type
      : "daily_multiple"
  );

  // daily_multiple options:
  let dailyCount = $state(
    init.schedule_rules?.type === "daily_multiple"
      ? (init.schedule_rules.count ?? 1)
      : 1
  );
  let dailyUseSubtargets = $state(
    init.schedule_rules?.type === "daily_multiple" &&
      !!init.schedule_rules.targets
  );
  let dailySubtargets = $state<{ id: string; time_hint: string }[]>(
    init.schedule_rules?.type === "daily_multiple" &&
      init.schedule_rules.targets
      ? init.schedule_rules.targets.map((t) => ({
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
    init.schedule_rules?.type === "weekly_days"
      ? {
          mon: init.schedule_rules.days.includes("mon"),
          tue: init.schedule_rules.days.includes("tue"),
          wed: init.schedule_rules.days.includes("wed"),
          thu: init.schedule_rules.days.includes("thu"),
          fri: init.schedule_rules.days.includes("fri"),
          sat: init.schedule_rules.days.includes("sat"),
          sun: init.schedule_rules.days.includes("sun"),
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
    init.schedule_rules?.type === "weekly_flexible"
      ? init.schedule_rules.count
      : 3
  );

  let habitInstrument = $state(init.instrument || "");
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

</script>

<div class="habit-detail-view">
  <HabitDetailHeader
    category={lineage.head.category}
    scheduleRules={lineage.head.schedule_rules}
    instrument={lineage.head.instrument}
  />

  <HabitStatCards
    score={lineage.score}
    streak={lineage.streak}
    executions={lineage.executions}
  />

  <HabitHeatmap
    blueprints={lineage.blueprints}
    executions={lineage.executions}
  />

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
                  <span class="field-label">Time Targets</span>
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
              <span class="field-label">Select Scheduled Days</span>
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

  <HabitExecutionTimeline executions={lineage.executions} />
</div>

<style>
  .habit-detail-view {
    animation: fadeIn 0.3s ease-out;
  }
  .view-columns {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-m);
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
