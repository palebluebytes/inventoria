<script lang="ts">
  import type { NutrientPill } from "../../food/nutrient-display";

  // A row of nutrient pills — Calories always leads, followed by the caller's
  // selected nutrients (staged-food preview) or a fixed macro set (recipe
  // per-serving). Presentational: each pill's label and formatted value are
  // built by buildNutrientPills; this only lays them out. The stable class hooks
  // (cal/prot/fat/carbs) keep existing selectors working for those keys.
  let { pills }: { pills: NutrientPill[] } = $props();

  // Map a breakdown key to the legacy pill class so e2e selectors that target
  // `.cal`/`.prot`/`.fat`/`.carbs` keep resolving; other nutrients use their key.
  const PILL_CLASS: Record<string, string> = {
    calories: "cal",
    protein: "prot",
    fat: "fat",
    carbs: "carbs",
  };
  const pillClass = (key: string) => PILL_CLASS[key] ?? key;
</script>

<div class="preview-grid">
  {#each pills as pill (pill.key)}
    <div class="preview-pill {pillClass(pill.key)}">
      <span class="pill-label">{pill.label}</span>
      <span class="pill-val">{pill.value}</span>
    </div>
  {/each}
</div>

<style>
  .preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(4.5rem, 1fr));
    gap: var(--space-3xs);
  }
  .preview-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    background: var(--food-surface-bg, #fff);
    border: var(--food-surface-border, 1px solid #000);
    border-radius: var(--food-pill-radius, 0);
    padding: var(--space-2xs) var(--space-3xs);
  }
  .pill-label {
    max-width: 100%;
    font-size: var(--step-n4);
    color: var(--text-muted);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill-val {
    max-width: 100%;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
