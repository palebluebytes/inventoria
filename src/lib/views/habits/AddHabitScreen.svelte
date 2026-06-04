<script lang="ts">
  import { habitsStore } from "../../stores/habits.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";

  let {
    dbReady,
    onClose,
    initialScheduleType = "daily_multiple",
    initialUseSubtargets = false,
  }: {
    dbReady: boolean;
    onClose: () => void;
    initialScheduleType?: "daily_multiple" | "weekly_days" | "weekly_flexible";
    initialUseSubtargets?: boolean;
  } = $props();

  let habitName = $state("");
  let habitCategory = $state("Fitness");
  let habitScheduleType = $state<
    "daily_multiple" | "weekly_days" | "weekly_flexible"
  >(initialScheduleType);

  // daily_multiple options:
  let dailyCount = $state(1);
  let dailyUseSubtargets = $state(initialUseSubtargets);
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

  // Custom Dropdown states
  let categoryDropdownOpen = $state(false);
  let scheduleDropdownOpen = $state(false);

  const categories = ["Fitness", "Mind", "Productivity", "Health", "Other"];
  const scheduleTypes = [
    { value: "daily_multiple", label: "DAILY" },
    { value: "weekly_days", label: "WEEKLY DAYS" },
    { value: "weekly_flexible", label: "WEEKLY FLEXIBLE" },
  ];

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
  <div class="header-container">
    <button class="back-btn" onclick={onClose} aria-label="Go back">
      &lt; BACK
    </button>
    <div class="header-banner">*** CREATE BLUEPRINT ***</div>
  </div>

  <main class="form-container">
    <div class="form-section">
      <label for="habit-name-input" class="label-mono">Habit Name</label>
      <input
        id="habit-name-input"
        placeholder="[ ENTER HABIT TITLE... ]"
        bind:value={habitName}
        class="input-brutal"
      />
    </div>

    <div class="grid-2">
      <div class="form-section">
        <span class="label-mono">Category</span>
        <div class="custom-select-container">
          <button
            type="button"
            class="custom-select-trigger"
            onclick={() => {
              categoryDropdownOpen = !categoryDropdownOpen;
              scheduleDropdownOpen = false;
            }}
          >
            [ {habitCategory.toUpperCase()} [ ▼] ]
          </button>
          {#if categoryDropdownOpen}
            <div class="custom-select-options">
              {#each categories as cat}
                <button
                  type="button"
                  class="custom-select-option"
                  onclick={() => {
                    habitCategory = cat;
                    categoryDropdownOpen = false;
                  }}
                >
                  {cat.toUpperCase()}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="form-section">
        <span class="label-mono">Schedule Type</span>
        <div class="custom-select-container">
          <button
            type="button"
            class="custom-select-trigger"
            onclick={() => {
              scheduleDropdownOpen = !scheduleDropdownOpen;
              categoryDropdownOpen = false;
            }}
          >
            [ {scheduleTypes.find((t) => t.value === habitScheduleType)
              ?.label ?? "DAILY"} [ ▼] ]
          </button>
          {#if scheduleDropdownOpen}
            <div class="custom-select-options">
              {#each scheduleTypes as type}
                <button
                  type="button"
                  class="custom-select-option"
                  onclick={() => {
                    habitScheduleType = type.value as any;
                    scheduleDropdownOpen = false;
                  }}
                >
                  {type.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Daily options -->
    {#if habitScheduleType === "daily_multiple"}
      <div class="schedule-editor-box">
        <button
          type="button"
          class="checkbox-brutal-box"
          onclick={() => (dailyUseSubtargets = !dailyUseSubtargets)}
        >
          <span class="checkbox-label-text">USE SPECIFIC TIME SUB-TARGETS</span>
          <span class="checkbox-indicator"
            >{dailyUseSubtargets ? "[X]" : "[ ]"}</span
          >
        </button>

        {#if dailyUseSubtargets}
          <div class="subtargets-editor">
            <span class="label-mono block-label">Time Targets</span>
            <div class="subtargets-list">
              {#each dailySubtargets as tgt, idx}
                <div class="subtarget-row">
                  <input
                    type="text"
                    placeholder="[ ID (E.G. MORNING) ]"
                    bind:value={tgt.id}
                    class="input-brutal small-input"
                  />
                  <input
                    type="text"
                    placeholder="[ TIME (E.G. 08:00) ]"
                    bind:value={tgt.time_hint}
                    class="input-brutal small-input"
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
              class="input-brutal"
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
            class="input-brutal"
          />
        </div>
      </div>
    {/if}

    <div class="form-section">
      <label for="habit-instrument-input" class="label-mono"
        >Instrument ID (Optional)</label
      >
      <input
        id="habit-instrument-input"
        placeholder="[ E.G. TWIN:KETTLEBELL_16KG ]"
        bind:value={habitInstrument}
        class="input-brutal"
      />
    </div>

    {#if habitStatus === "error"}
      <div class="error-box">
        ERROR: {habitError.toUpperCase()}
      </div>
    {/if}

    <div class="action-footer">
      <button
        onclick={addHabit}
        disabled={habitStatus === "loading" || !dbReady}
        class="btn-submit-brutal"
      >
        SAVE BLUEPRINT
      </button>
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

  .header-container {
    display: flex;
    flex-direction: column;
    padding: var(--space-s) var(--space-m) 0 var(--space-m);
    background: var(--bg-base);
  }

  .back-btn {
    align-self: flex-start;
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    cursor: pointer;
    padding: var(--space-3xs) var(--space-2xs);
    margin-bottom: var(--space-xs);
    outline: none;
  }

  .back-btn:hover {
    text-decoration: underline;
  }

  .header-banner {
    background: #000;
    color: #fff;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    text-align: center;
    padding: var(--space-s);
    border: 2px solid #000;
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
    padding-bottom: var(--space-2xl);
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

  .input-brutal {
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

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
  }

  .custom-select-container {
    position: relative;
    width: 100%;
  }

  .custom-select-trigger {
    width: 100%;
    background: var(--bg-surface);
    border: 2px solid var(--border-accent);
    padding: var(--space-xs) var(--space-s);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    border-radius: 0;
    outline: none;
  }

  .custom-select-options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-surface);
    border: 2px solid var(--border-accent);
    border-top: none;
    z-index: 10;
    display: flex;
    flex-direction: column;
  }

  .custom-select-option {
    width: 100%;
    background: none;
    border: none;
    padding: var(--space-xs) var(--space-s);
    padding-left: var(--space-m); /* Indent options like mockup */
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    outline: none;
  }

  .custom-select-option:hover,
  .custom-select-option:focus {
    background: var(--bg-input);
  }

  .schedule-editor-box {
    border: 2px solid var(--border-accent);
    padding: var(--space-s);
    background: var(--bg-surface);
  }

  .checkbox-brutal-box {
    width: 100%;
    background: var(--bg-surface);
    border: 2px solid var(--border-accent);
    padding: var(--space-s);
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    outline: none;
  }

  .checkbox-label-text {
    text-align: left;
  }

  .checkbox-indicator {
    font-size: var(--step-0);
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

  .small-input {
    padding: var(--space-2xs);
    font-size: var(--step-n2);
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
    background: var(--bg-surface);
    border: 2px solid var(--border-accent);
    padding: var(--space-3xs) var(--space-xs);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    cursor: pointer;
  }

  .btn-agenda-action:hover {
    background: var(--bg-input);
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
    border: 2px solid var(--border-accent);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--bg-surface);
    user-select: none;
  }

  .day-chip.selected {
    background: var(--amber-bg);
    color: var(--amber);
  }

  .day-chip input {
    display: none;
  }

  .error-box {
    border: 2px solid var(--red-bg);
    background: var(--red-bg);
    color: #fff;
    padding: var(--space-s);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
  }

  .action-footer {
    margin-top: var(--space-xl);
    display: flex;
    justify-content: center;
  }

  .btn-submit-brutal {
    width: 100%;
    background: #000;
    color: #fff;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    border: 2px solid #000;
    padding: var(--space-s);
    text-transform: uppercase;
    cursor: pointer;
    -webkit-box-reflect: below 2px
      linear-gradient(transparent, rgba(0, 0, 0, 0.3));
    outline: none;
  }

  .btn-submit-brutal:active {
    background: var(--bg-input);
    color: var(--text-primary);
  }
</style>
