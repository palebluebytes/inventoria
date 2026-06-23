<script lang="ts">
  // Already-computed macro values; the caller decides whether they are a
  // proportional preview or an aggregate total.
  let {
    calories,
    protein,
    fat,
    carbs,
  }: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  } = $props();
</script>

<div class="preview-grid">
  <div class="preview-pill cal">
    <span class="pill-label">Calories</span>
    <span class="pill-val">{calories} kcal</span>
  </div>
  <div class="preview-pill prot">
    <span class="pill-label">Protein</span>
    <span class="pill-val">{protein}g</span>
  </div>
  <div class="preview-pill fat">
    <span class="pill-label">Fat</span>
    <span class="pill-val">{fat}g</span>
  </div>
  <div class="preview-pill carbs">
    <span class="pill-label">Carbs</span>
    <span class="pill-val">{carbs}g</span>
  </div>
</div>

<style>
  .preview-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3xs);
  }
  .preview-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--food-surface-bg, #fff);
    border: var(--food-surface-border, 1px solid #000);
    border-radius: var(--food-pill-radius, 0);
    padding: var(--space-2xs);
  }
  .pill-label {
    font-size: var(--step-n4);
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .pill-val {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    margin-top: 2px;
  }
</style>
