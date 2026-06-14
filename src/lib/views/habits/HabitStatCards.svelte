<script lang="ts">
  import { getActiveExecutions } from "../../habits/habits";
  import type { HabitLineage } from "../../stores/habits.store";
  import Card from "../../ui/Card.svelte";

  let {
    score,
    streak,
    executions,
  }: {
    score: number;
    streak: number;
    executions: HabitLineage["executions"];
  } = $props();

  let activeExecs = $derived(getActiveExecutions(executions));
  let totalCompletions = $derived(
    activeExecs.filter((e) => e.status === "completed").length
  );
  let totalExemptions = $derived(
    activeExecs.filter((e) => e.status === "exempt").length
  );
</script>

<div class="stats-grid mt-4">
  <Card class="stat-card shadow-brutal">
    <span class="stat-value">{Math.round(score * 100)}%</span>
    <span class="stat-label">Habit Strength 💪</span>
  </Card>
  <Card class="stat-card shadow-brutal">
    <span class="stat-value">{streak}</span>
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

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: var(--space-s);
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
</style>
