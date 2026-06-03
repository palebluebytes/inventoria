<script lang="ts">
  import { habitsStore } from "../../stores/habits.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import Card from "../../ui/Card.svelte";
  import Input from "../../ui/Input.svelte";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

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
</script>

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
    <Alert variant="error" class="mt-2">{habitError}</Alert>
  {/if}
</Card>

<style>
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
    display: flex;
    align-items: center;
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
  .shadow-brutal {
    border: 2px solid var(--border-accent) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent);
  }
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
  :global(.mt-4) {
    margin-top: var(--space-m);
  }
  :global(.mt-2) {
    margin-top: var(--space-s);
  }
</style>
