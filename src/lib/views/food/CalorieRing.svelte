<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import { roundFoodDisplay } from "../../food/nutrition";

  // The dashboard's calorie progress ring: a precision-instrument SVG dial that
  // fills toward the day's calorie target. Purely presentational — the caller
  // owns both the running total and the goal.
  let {
    totalCalories,
    targetCalories,
  }: {
    totalCalories: number;
    targetCalories: number;
  } = $props();

  // SVG Progress Ring calculations
  let calProgress = $derived(Math.min(totalCalories / targetCalories, 1));
  const ringRadius = 90;
  const ringCircumference = 2 * Math.PI * ringRadius; // 565.487
  let ringOffset = $derived(
    ringCircumference - calProgress * ringCircumference
  );
</script>

<Card class="ring-card">
  <div class="ring-container">
    <svg class="progress-ring" width="240" height="240">
      <!-- Subtle radial tick marks to add a premium, precision-instrument layout -->
      <circle
        class="progress-ring-ticks"
        stroke="var(--text-muted)"
        stroke-width="1"
        stroke-dasharray="2 6"
        fill="transparent"
        r={ringRadius - 12}
        cx="120"
        cy="120"
        opacity="0.25"
      />
      <circle
        class="progress-ring-bg"
        stroke="var(--border)"
        stroke-width="4"
        fill="transparent"
        r={ringRadius}
        cx="120"
        cy="120"
      />
      <circle
        class="progress-ring-circle"
        stroke="var(--accent)"
        stroke-width="8"
        fill="transparent"
        r={ringRadius}
        cx="120"
        cy="120"
        stroke-dasharray={ringCircumference}
        stroke-dashoffset={ringOffset}
        stroke-linecap="round"
      />
    </svg>
    <div class="ring-label">
      <span class="calories-num">{roundFoodDisplay(totalCalories)}</span>
      <span class="calories-sub">{targetCalories} kcal</span>
    </div>
  </div>
</Card>

<style>
  :global(.ring-card) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-m) !important;
  }
  .ring-container {
    position: relative;
    width: 240px;
    height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .progress-ring {
    transform: rotate(-90deg);
    width: 240px;
    height: 240px;
  }
  .progress-ring-circle {
    transition: stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ring-label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    pointer-events: none;
  }
  .calories-num {
    font-size: var(--step-4);
    font-weight: 800;
    color: var(--text-primary);
    line-height: 0.85;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .calories-sub {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: var(--space-3xs);
    line-height: 1;
    white-space: nowrap;
  }
</style>
