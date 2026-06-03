<script lang="ts">
  import { habitsStore, type HabitLineage } from "../stores/habits.store";
  import HabitDetailView from "./habits/HabitDetailView.svelte";

  import Card from "../ui/Card.svelte";
  import Input from "../ui/Input.svelte";
  import Button from "../ui/Button.svelte";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Create Habit States
  let habitName = $state("");
  let habitCategory = $state("Fitness");
  let habitScheduleType = $state<"daily" | "weekly">("daily");
  let habitScheduleValue = $state(3);
  let habitInstrument = $state("");
  let habitStatus = $state<"idle" | "loading" | "error">("idle");
  let habitError = $state("");

  // Detail View State
  let selectedHabitId = $state<string | null>(null);
  let selectedLineage = $derived(
    $habitsStore.find((l) => l.head.entity === selectedHabitId) || null
  );

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
    try {
      await habitsStore.createHabit(
        habitName.trim(),
        habitCategory,
        habitScheduleType,
        habitScheduleValue,
        habitInstrument
      );
      habitName = "";
      habitInstrument = "";
      habitCategory = "Fitness";
      habitScheduleType = "daily";
      habitScheduleValue = 3;
      habitStatus = "idle";
    } catch (e: any) {
      habitStatus = "error";
      habitError = e.message ?? String(e);
    }
  }

  async function logHabitQuick(habitId: string) {
    try {
      await habitsStore.logExecution(habitId, "");
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
</script>

{#if selectedLineage}
  <HabitDetailView
    lineage={selectedLineage}
    onBack={() => {
      selectedHabitId = null;
    }}
    onUpdateId={(id) => {
      selectedHabitId = id;
    }}
  />
{:else}
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
          <label for="habit-schedule" class="field-label">Schedule</label>
          <select
            id="habit-schedule"
            bind:value={habitScheduleType}
            class="select-brutal"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {#if habitScheduleType === "weekly"}
        <div class="col-group">
          <label for="habit-schedule-val" class="field-label"
            >Target Days per Week</label
          >
          <input
            id="habit-schedule-val"
            type="number"
            min="1"
            max="7"
            bind:value={habitScheduleValue}
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
          <li class="habit-item">
            <div class="habit-info">
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
                  Schedule: {lineage.head.schedule_type === "daily"
                    ? "Daily"
                    : `${lineage.head.schedule_value}x/week`}
                </span>
                {#if lineage.head.instrument}
                  <span class="meta-separator">•</span>
                  <span class="meta-item code">{lineage.head.instrument}</span>
                {/if}
              </div>
            </div>

            <!-- Stats & Quick Actions -->
            <div class="habit-actions">
              <div class="habit-mini-stats">
                <span class="mini-stat strength" title="Habit Strength">
                  💪 {Math.round(lineage.score * 100)}%
                </span>
                <span class="mini-stat streak" title="Current Streak">
                  🔥 {lineage.streak}d
                </span>
              </div>

              <div class="buttons-row">
                <Button
                  variant="secondary"
                  onclick={() => {
                    selectedHabitId = lineage.head.entity;
                  }}
                >
                  Details & Logs
                </Button>
                <Button
                  variant="primary"
                  onclick={() => logHabitQuick(lineage.head.entity)}
                >
                  Quick Log ✓
                </Button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}

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
  .habit-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
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
  .habit-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    align-items: flex-start;
  }
  @media (min-width: 768px) {
    .habit-actions {
      align-items: flex-end;
    }
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
  .buttons-row {
    display: flex;
    gap: var(--space-2xs);
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
</style>
