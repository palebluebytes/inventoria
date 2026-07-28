<script lang="ts">
  import Badge from "../../ui/Badge.svelte";
  import HabitItem from "./HabitItem.svelte";
  import type { HabitLineage } from "../../stores/habits.store";

  // The agenda's HABITS section: the untimed habits scheduled for the selected
  // day, plus the "add habit" affordance. Presentational — the caller supplies
  // the already-filtered lineages and handles every interaction.
  let {
    lineages,
    selected_date_str,
    selected_date_ms,
    onSelectHabit,
    onLogHabit,
    onLongPressHabit,
    onAddHabit,
  }: {
    lineages: HabitLineage[];
    selected_date_str: string;
    selected_date_ms: number;
    onSelectHabit: (id: string) => void;
    onLogHabit: (
      habitId: string,
      status: "completed" | "exempt" | "uncompleted",
      targetId?: string
    ) => Promise<void>;
    onLongPressHabit: (habitId: string, targetId?: string) => void;
    onAddHabit: () => void;
  } = $props();
</script>

<section class="agenda-section">
  <div class="section-title-bar">
    <h2>HABITS</h2>
    <Badge id="habits-count" variant="default" class="mono-badge">
      {lineages.length}
    </Badge>
  </div>

  <div class="agenda-list">
    {#each lineages as lineage (lineage.head.entity)}
      <HabitItem
        {lineage}
        {selected_date_str}
        {selected_date_ms}
        onSelect={onSelectHabit}
        onLog={onLogHabit}
        onLongPress={onLongPressHabit}
      />
    {/each}
    <button type="button" class="add-agenda-row" onclick={onAddHabit}>
      + ADD HABIT
    </button>
  </div>
</section>

<style>
  /* ── Shared agenda-section chrome ──
     Duplicated verbatim in ScheduleSection: Svelte scopes these class rules per
     component, so each self-contained section carries its own copy rather than
     depend on a global sheet. See ADR-0029 for the trade-off. */
  .agenda-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .section-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3xs);
  }

  .section-title-bar h2 {
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 800;
    color: #000;
    margin: 0;
  }

  :global(.mono-badge) {
    font-family: var(--font-mono) !important;
    font-weight: 700 !important;
    border: none !important;
    background: #000 !important;
    color: #fff !important;
    border-radius: 0 !important;
  }

  .add-agenda-row {
    flex: 1;
    border: 2px dashed #000;
    padding: var(--space-s);
    text-align: center;
    color: #000;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    background: transparent;
    cursor: pointer;
    outline: none;
    letter-spacing: 0.05em;
    -webkit-tap-highlight-color: transparent;
  }
  .add-agenda-row:hover,
  .add-agenda-row:focus {
    background: var(--bg-input);
  }
  .add-agenda-row:active {
    background: #000;
    color: #fff;
  }

  /* ── General habits list ── */
  .agenda-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
</style>
