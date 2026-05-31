<script lang="ts">
  import { dbClient } from "../db/db.client";
  import { createQueryStore } from "../stores/datoms.store";
  import { logExecution, computeStreak } from "../habits/habits";
  import { ingestEntity } from "../ingestion/ingest";

  import Card from "../ui/Card.svelte";
  import Input from "../ui/Input.svelte";
  import Button from "../ui/Button.svelte";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  let habitName = $state("");
  let habitInstrument = $state("");
  let habitStatus = $state<"idle" | "loading" | "error">("idle");
  let habitError = $state("");

  const habitsStore = createQueryStore<{ entity: string; value: string }>(
    "SELECT entity, value FROM datoms WHERE attribute = 'habit/name' ORDER BY time DESC LIMIT 20"
  );

  const execsStore = createQueryStore<{
    entity: string;
    value: string;
    time: number;
  }>(
    "SELECT entity, value, time FROM datoms WHERE attribute = 'event/type' AND value = '\"ExerciseAction\"' ORDER BY time DESC LIMIT 50"
  );

  let streak = $derived(
    computeStreak($execsStore.map((r) => ({ time: r.time })))
  );

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  async function addHabit() {
    if (!habitName.trim()) return;
    habitStatus = "loading";
    habitError = "";
    try {
      const payload = {
        entity: `habit:${habitName.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`,
        attributes: {
          "habit/name": habitName.trim(),
          ...(habitInstrument.trim()
            ? { "habit/instrument": habitInstrument.trim() }
            : {}),
        },
      };
      await dbClient.append(ingestEntity(payload));
      habitName = "";
      habitInstrument = "";
      habitStatus = "idle";
    } catch (e: any) {
      habitStatus = "error";
      habitError = e.message ?? String(e);
    }
  }

  async function logHabitExecution(habitId: string) {
    try {
      await dbClient.append(logExecution(habitId, ""));
    } catch (e: any) {
      habitError = e.message ?? String(e);
    }
  }
</script>

<header class="page-header">
  <h1>Habits</h1>
  <p>Define Habit Blueprints and log Execution Events to track your streak.</p>
</header>

<div class="streak-banner">
  <span class="streak-num">{streak}</span>
  <span class="streak-label">day streak 🔥</span>
</div>

<Card class="mt-4">
  <h2>New Habit Blueprint</h2>
  <div class="form-group">
    <Input
      id="habit-name-input"
      placeholder="Habit name (e.g. 1-Arm Swings)"
      bind:value={habitName}
    />
    <Input
      id="habit-instrument-input"
      placeholder="Instrument (optional, e.g. twin:kettlebell_16kg)"
      bind:value={habitInstrument}
    />
    <Button
      onclick={addHabit}
      disabled={habitStatus === "loading" || !dbReady}
      loading={habitStatus === "loading"}
    >
      Add Habit
    </Button>
  </div>
  {#if habitStatus === "error"}
    <Alert variant="error">{habitError}</Alert>
  {/if}
</Card>

<Card class="mt-4">
  <h2>
    Habit Blueprints <Badge variant="default" class="ml-2"
      >{$habitsStore.length}</Badge
    >
  </h2>
  {#if $habitsStore.length === 0}
    <p class="empty">No habits yet. Add one above.</p>
  {:else}
    <ul class="twin-list">
      {#each $habitsStore as row}
        <li class="twin-item">
          <span class="twin-entity">{row.entity}</span>
          <span class="twin-name">{JSON.parse(row.value)}</span>
          <Button
            variant="secondary"
            onclick={() => logHabitExecution(row.entity)}>Log ✓</Button
          >
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<Card class="mt-4">
  <h2>
    Recent Executions <Badge variant="default" class="ml-2"
      >{$execsStore.length}</Badge
    >
  </h2>
  {#if $execsStore.length === 0}
    <p class="empty">No executions logged yet.</p>
  {:else}
    <ul class="twin-list">
      {#each $execsStore.slice(0, 10) as row}
        <li class="twin-item">
          <span class="twin-entity">{row.entity}</span>
          <span class="twin-name muted">{formatTime(row.time)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

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
  .streak-banner {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    background: linear-gradient(
      135deg,
      var(--amber-bg),
      rgba(245, 158, 11, 0.05)
    );
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 16px;
    padding: var(--space-m) var(--space-l);
    margin-bottom: var(--space-s);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 4px 20px rgba(245, 158, 11, 0.1);
    animation: slideUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .streak-num {
    font-size: var(--step-4);
    font-weight: 800;
    color: var(--amber);
    line-height: 1;
    text-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
  }
  .streak-label {
    font-size: var(--step-0);
    color: var(--amber);
    opacity: 0.9;
    font-weight: 500;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .twin-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    margin-top: var(--space-s);
  }
  .twin-item {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    padding: var(--space-2xs) 0;
    border-bottom: 1px solid var(--border);
    transition: background 0.2s;
  }
  .twin-item:last-child {
    border-bottom: none;
  }
  .twin-entity {
    font-family: monospace;
    font-size: var(--step-n2);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .twin-name {
    color: var(--text-primary);
    font-size: var(--step-n1);
    font-weight: 500;
    flex: 1;
  }
  .twin-name.muted {
    color: var(--text-muted);
    font-weight: 400;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
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
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
