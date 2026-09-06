<script lang="ts">
  import Card from "../../ui/Card.svelte";

  let {
    avgStrength,
    maxStreak,
    totalHabitsCount,
  }: {
    avgStrength: number;
    maxStreak: number;
    totalHabitsCount: number;
  } = $props();
</script>

<div class="stats-row mt-4">
  <Card class="summary-card">
    <span class="summary-val">{avgStrength}%</span>
    <span class="summary-lbl">Avg Strength 💪</span>
  </Card>
  <Card class="summary-card">
    <span class="summary-val">{maxStreak}</span>
    <span class="summary-lbl">Best Streak 🔥</span>
  </Card>
  <Card class="summary-card">
    <span class="summary-val">{totalHabitsCount}</span>
    <span class="summary-lbl">Active Habits 📋</span>
  </Card>
</div>

<style>
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-s);
  }
  /* Same shape and the same reason as `.stat-card` in `HabitStatCards`: a
     figure over its name, reached through `:global` because the class arrives
     at Card as a prop with no scoping hash of this file's. */
  .stats-row :global(.summary-card) {
    display: flex;
    flex-direction: column;
    align-items: center;
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
    margin-top: var(--space-3xs);
  }
  :global(.mt-4) {
    margin-top: var(--space-m);
  }
</style>
