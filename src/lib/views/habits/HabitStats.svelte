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

<style>
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
  .shadow-brutal {
    border: 2px solid var(--border-accent) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent);
  }
  :global(.mt-4) {
    margin-top: var(--space-m);
  }
</style>
