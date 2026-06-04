<script lang="ts">
  import { habitsStore } from "../../stores/habits.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import Input from "../../ui/Input.svelte";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";

  let { dbReady, onClose }: { dbReady: boolean; onClose: () => void } =
    $props();

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
      onClose();
    } catch (e: any) {
      habitStatus = "error";
      habitError = e.message ?? String(e);
    }
  }
</script>

<div class="add-screen">
  <header class="agenda-header">
    <button class="back-btn" onclick={onClose} aria-label="Go back">
      &larr; BACK
    </button>
    <div class="header-title">*** CREATE BLUEPRINT ***</div>
    <div style="width: 60px;"></div>
    <!-- visual spacer -->
  </header>

  <main class="form-container">
    <div class="form-section">
      <label for="habit-name-input" class="label-mono">Habit Name</label>
      <Input
        id="habit-name-input"
        placeholder="e.g., Kettlebell Swings"
        bind:value={habitName}
        class="input-agenda"
      />
    </div>

    <div class="grid-2">
      <div class="form-section">
        <label for="habit-category" class="label-mono">Category</label>
        <select
          id="habit-category"
          bind:value={habitCategory}
          class="select-agenda"
        >
          <option value="Fitness">Fitness</option>
          <option value="Mind">Mind</option>
          <option value="Productivity">Productivity</option>
          <option value="Health">Health</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div class="form-section">
        <label for="habit-schedule" class="label-mono">Schedule Type</label>
        <select
          id="habit-schedule"
          bind:value={habitScheduleType}
          class="select-agenda"
        >
          <option value="daily_multiple">Daily (Count / Targets)</option>
          <option value="weekly_days">Weekly (Specific Days)</option>
          <option value="weekly_flexible">Weekly (Flexible Count)</option>
        </select>
      </div>
    </div>

    <!-- Daily options -->
    {#if habitScheduleType === "daily_multiple"}
      <div class="schedule-editor-box">
        <div class="checkbox-row">
          <input
            id="use-subtargets"
            type="checkbox"
            bind:checked={dailyUseSubtargets}
            class="checkbox-agenda"
          />
          <label for="use-subtargets" class="label-mono checkbox-label">
            Use Specific Time Sub-Targets (e.g. morning at 08:00)
          </label>
        </div>

        {#if dailyUseSubtargets}
          <div class="subtargets-editor">
            <span class="label-mono block-label">Time Targets</span>
            <div class="subtargets-list">
              {#each dailySubtargets as tgt, idx}
                <div class="subtarget-row">
                  <input
                    type="text"
                    placeholder="ID (e.g., morning)"
                    bind:value={tgt.id}
                    class="input-agenda-small"
                  />
                  <input
                    type="text"
                    placeholder="Time (e.g., 08:00)"
                    bind:value={tgt.time_hint}
                    class="input-agenda-small"
                  />
                  <button
                    type="button"
                    class="btn-agenda-delete"
                    onclick={() =>
                      (dailySubtargets = dailySubtargets.filter(
                        (_, i) => i !== idx
                      ))}
                  >
                    [X]
                  </button>
                </div>
              {/each}
            </div>
            <button
              type="button"
              class="btn-agenda-action"
              onclick={() =>
                (dailySubtargets = [
                  ...dailySubtargets,
                  { id: "", time_hint: "" },
                ])}
            >
              + ADD TARGET
            </button>
          </div>
        {:else}
          <div class="form-section">
            <label for="habit-daily-count" class="label-mono"
              >Target Reps Per Day</label
            >
            <input
              id="habit-daily-count"
              type="number"
              min="1"
              bind:value={dailyCount}
              class="input-agenda-number"
            />
          </div>
        {/if}
      </div>
    {/if}

    <!-- Weekly specific days -->
    {#if habitScheduleType === "weekly_days"}
      <div class="schedule-editor-box">
        <span class="label-mono block-label">Scheduled Days</span>
        <div class="days-flex">
          {#each ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as day}
            <label class="day-chip" class:selected={weeklyDaysSelected[day]}>
              <input type="checkbox" bind:checked={weeklyDaysSelected[day]} />
              {day.toUpperCase()}
            </label>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Weekly flexible count -->
    {#if habitScheduleType === "weekly_flexible"}
      <div class="schedule-editor-box">
        <div class="form-section">
          <label for="habit-weekly-count" class="label-mono"
            >Completions Per Week</label
          >
          <input
            id="habit-weekly-count"
            type="number"
            min="1"
            max="7"
            bind:value={weeklyFlexCount}
            class="input-agenda-number"
          />
        </div>
      </div>
    {/if}

    <div class="form-section">
      <label for="habit-instrument-input" class="label-mono"
        >Instrument ID (Optional)</label
      >
      <Input
        id="habit-instrument-input"
        placeholder="e.g., twin:kettlebell_16kg"
        bind:value={habitInstrument}
        class="input-agenda"
      />
    </div>

    {#if habitStatus === "error"}
      <Alert variant="error" class="error-alert">{habitError}</Alert>
    {/if}

    <div class="action-footer">
      <Button
        onclick={addHabit}
        disabled={habitStatus === "loading" || !dbReady}
        loading={habitStatus === "loading"}
        class="btn-agenda-submit"
      >
        SAVE BLUEPRINT
      </Button>
    </div>
  </main>
</div>

<style>
  .add-screen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-base);
    z-index: 1000;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .agenda-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid var(--border-accent);
    padding: var(--space-s) var(--space-m);
    background: var(--bg-surface);
  }

  .back-btn {
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    cursor: pointer;
    padding: var(--space-3xs) var(--space-2xs);
    border: 1px solid transparent;
  }

  .back-btn:hover {
    border-color: var(--border-accent);
    background: var(--bg-input);
  }

  .header-title {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }

  .form-container {
    padding: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
    flex: 1;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  .label-mono {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .block-label {
    display: block;
    margin-bottom: var(--space-xs);
  }

  :global(.input-agenda) {
    font-family: var(--font-mono) !important;
    border: 2px solid var(--border-accent) !important;
    border-radius: 0 !important;
    background: var(--bg-surface) !important;
  }

  .select-agenda,
  .input-agenda-number {
    width: 100%;
    background: var(--bg-surface);
    border: 2px solid var(--border-accent);
    padding: var(--space-xs) var(--space-s);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    color: var(--text-primary);
    outline: none;
    border-radius: 0;
  }

  .select-agenda:focus,
  .input-agenda-number:focus {
    box-shadow: 0px 0px 0px 1px var(--border-accent);
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
  }

  .schedule-editor-box {
    border: 2px dashed var(--border-accent);
    padding: var(--space-s);
    background: rgba(0, 0, 0, 0.02);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    margin-bottom: var(--space-2xs);
  }

  .checkbox-agenda {
    width: 18px;
    height: 18px;
    accent-color: var(--border-accent);
  }

  .checkbox-label {
    margin-bottom: 0;
    cursor: pointer;
  }

  .subtargets-editor {
    margin-top: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .subtargets-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .subtarget-row {
    display: flex;
    gap: var(--space-3xs);
    align-items: center;
  }

  .input-agenda-small {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border-accent);
    padding: var(--space-2xs);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-primary);
    border-radius: 0;
    outline: none;
  }

  .btn-agenda-delete {
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--red-bg);
    cursor: pointer;
    padding: var(--space-3xs) var(--space-2xs);
  }

  .btn-agenda-action {
    align-self: flex-start;
    background: var(--bg-input);
    border: 1px solid var(--border-accent);
    padding: var(--space-3xs) var(--space-xs);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    cursor: pointer;
  }

  .btn-agenda-action:hover {
    background: var(--border);
  }

  .days-flex {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
  }

  .day-chip {
    flex: 1;
    min-width: 45px;
    text-align: center;
    padding: var(--space-2xs);
    border: 1px solid var(--border-accent);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--bg-input);
    user-select: none;
  }

  .day-chip.selected {
    background: var(--green-bg);
    color: var(--green);
    box-shadow: 2px 2px 0px 0px var(--border-accent);
    transform: translate(-1px, -1px);
  }

  .day-chip input {
    display: none;
  }

  :global(.error-alert) {
    margin-top: var(--space-s) !important;
  }

  .action-footer {
    margin-top: var(--space-l);
    display: flex;
    justify-content: flex-end;
  }

  :global(.btn-agenda-submit) {
    width: 100% !important;
    background: #000 !important;
    color: #fff !important;
    font-family: var(--font-mono) !important;
    font-size: var(--step-n1) !important;
    font-weight: 700 !important;
    border-radius: 0 !important;
    border: 2px solid var(--border-accent) !important;
    padding: var(--space-s) !important;
  }

  :global(.btn-agenda-submit:hover:not(:disabled)) {
    background: var(--green-bg) !important;
    color: var(--green) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent) !important;
  }
</style>
