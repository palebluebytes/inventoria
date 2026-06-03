<script lang="ts">
  import { habitsStore } from "../stores/habits.store";
  import HabitDetailView from "./habits/HabitDetailView.svelte";
  import BottomSheet from "../ui/BottomSheet.svelte";
  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";

  // Subcomponents
  import HabitStats from "./habits/HabitStats.svelte";
  import HabitForm from "./habits/HabitForm.svelte";
  import HabitItem from "./habits/HabitItem.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

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

  let avgStrength = $derived.by(() => {
    if ($habitsStore.length === 0) return 0;
    const totalScore = $habitsStore.reduce((acc, l) => acc + l.score, 0);
    return Math.round((totalScore / $habitsStore.length) * 100);
  });

  let maxStreak = $derived.by(() => {
    if ($habitsStore.length === 0) return 0;
    return Math.max(...$habitsStore.map((l) => l.streak));
  });

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
      console.error(e);
    }
  }
</script>

<header class="page-header">
  <h1>Habits</h1>
  <p>
    Define Habit Blueprints and log Execution Events to build habit strength.
  </p>
</header>

<HabitStats {avgStrength} {maxStreak} {totalHabitsCount} />

<HabitForm {dbReady} />

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
      {#each $habitsStore as lineage (lineage.head.entity)}
        <HabitItem {lineage} onSelect={selectHabit} onLog={logHabitEvent} />
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
  .habit-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    margin-top: var(--space-s);
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
