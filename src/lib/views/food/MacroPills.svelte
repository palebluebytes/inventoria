<script lang="ts">
  import { round2 } from "../../food/nutrition";

  // Already-computed macro values; the caller decides whether they are a
  // proportional preview or an aggregate total. Values are display-rounded to
  // 2 decimals here so summed/derived floats don't leak their mantissa.
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
    <span class="pill-val">{round2(calories)} kcal</span>
  </div>
  <div class="preview-pill prot">
    <span class="pill-label">Protein</span>
    <span class="pill-val">{round2(protein)}g</span>
  </div>
  <div class="preview-pill fat">
    <span class="pill-label">Fat</span>
    <span class="pill-val">{round2(fat)}g</span>
  </div>
  <div class="preview-pill carbs">
    <span class="pill-label">Carbs</span>
    <span class="pill-val">{round2(carbs)}g</span>
  </div>
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
