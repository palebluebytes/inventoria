<script lang="ts">
  import { untrack } from "svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import {
    computeEnergyAndMacros,
    mifflinStJeorBmr,
    type ActivityLevel,
    type BiologicalSex,
    type EnergyGoal,
  } from "../../food/personalized-energy-macros";
  import {
    formatCalories,
    formatNutrientValue,
  } from "../../food/nutrient-display";
  import { roundFoodDisplay } from "../../food/nutrition";
  import {
    nutritionDisplayDecimals,
    type FoodProfile,
  } from "../../stores/settings.store";

  // The personalized calorie/macro calculator (ADR-0033 §1/§4, ticket #45): a
  // throwaway helper that turns body metrics into a suggested energy + macro set.
  // It is a *pure form* — it computes a live preview via the #44 module and hands
  // the accepted numbers back through {@link onApply}; the editor owns the
  // persistence (overwrite four target keys, auto-track the macros) so this sheet
  // never touches the ledger except to save its own inert pre-fill profile.
  let {
    profile = null,
    onApply,
    onClose,
  }: {
    /** Last-used inputs to pre-fill the form (ADR-0033 §2); null → blank. */
    profile?: FoodProfile | null;
    /**
     * Called on Apply with the accepted targets (already rounded to the display
     * precision the preview showed) and the profile to persist. The editor merges
     * the four keys into `settings/food/targets`, auto-tracks the macros, and
     * writes the profile — this sheet stays persistence-free beyond that call.
     */
    onApply: (
      targets: {
        energy: number;
        protein: number;
        fat: number;
        carbs: number;
      },
      profile: FoodProfile
    ) => void;
    /** Forwarded to BottomSheet so the parent unmounts on any close. */
    onClose: () => void;
  } = $props();

  // The sheet is mounted fresh each open, so the form seeds once from the profile
  // prop at construction — a bumped weight then re-apply is painless (ADR-0033 §2).
  // `untrack` states that one-time capture explicitly and silences the "only
  // captures the initial value" warning, exactly as ScheduleRuleEditor does.
  const seed = untrack(() => profile);
  let open = $state(true);
  let sex = $state<BiologicalSex | null>(seed?.sex ?? null);
  let ageRaw = $state(seed ? String(seed.age) : "");
  let heightRaw = $state(seed ? String(seed.height_cm) : "");
  let weightRaw = $state(seed ? String(seed.weight_kg) : "");
  let activity = $state<ActivityLevel>(seed?.activity ?? "low_active");
  let goal = $state<EnergyGoal>(seed?.goal ?? "maintain");
  // The manual calorie nudge (ADR-0033 §4): null → the field tracks the computed
  // energy; a number → an explicit override (still floored at BMR by the module).
  let nudgeKcal = $state<number | null>(null);

  const ACTIVITY_OPTIONS: {
    value: ActivityLevel;
    label: string;
    hint: string;
  }[] = [
    {
      value: "sedentary",
      label: "Sedentary",
      hint: "Little or no exercise; mostly sitting.",
    },
    {
      value: "low_active",
      label: "Low active",
      hint: "Light exercise or walking a few days a week.",
    },
    {
      value: "active",
      label: "Active",
      hint: "Moderate exercise most days of the week.",
    },
    {
      value: "very_active",
      label: "Very active",
      hint: "Hard exercise daily, or a physically demanding job.",
    },
  ];
  const GOAL_OPTIONS: { value: EnergyGoal; label: string }[] = [
    { value: "lose", label: "Lose" },
    { value: "maintain", label: "Maintain" },
    { value: "gain", label: "Gain" },
  ];

  // Number("") is 0, so a blank field reads as invalid (not-> 0) rather than
  // feeding a zero into the equation.
  const ageN = $derived(Number(ageRaw));
  const heightN = $derived(Number(heightRaw));
  const weightN = $derived(Number(weightRaw));
  const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
  const valid = $derived(
    sex !== null && positive(ageN) && positive(heightN) && positive(weightN)
  );

  // Resting burn — the safety floor the module clamps to. Only the manual nudge
  // can request a value below it (the −20 % "Lose" goal at the sedentary PAL lands
  // at ≈ BMR, never under), so the floor note is a nudge-only concern.
  const bmr = $derived(
    valid ? mifflinStJeorBmr(sex!, weightN, heightN, ageN) : null
  );
  // The computed set with no nudge — seeds the nudge field's default value.
  const base = $derived(
    valid
      ? computeEnergyAndMacros({
          sex: sex!,
          weightKg: weightN,
          heightCm: heightN,
          ageYr: ageN,
          activity,
          goal,
        })
      : null
  );
  // The live preview: the computed set with the nudge applied (floored at BMR).
  const result = $derived(
    valid
      ? computeEnergyAndMacros({
          sex: sex!,
          weightKg: weightN,
          heightCm: heightN,
          ageYr: ageN,
          activity,
          goal,
          energyOverrideKcal: nudgeKcal ?? undefined,
        })
      : null
  );
  // The nudge field shows the user's override, else tracks the computed energy so
  // it recomputes as fields change until they touch it.
  const nudgeValue = $derived(
    nudgeKcal !== null
      ? String(nudgeKcal)
      : base !== null
        ? String(Math.round(base.energy))
        : ""
  );
  // The floor bites only when the user nudged below their own resting burn.
  const floored = $derived(
    valid && nudgeKcal !== null && bmr !== null && nudgeKcal < bmr
  );

  function editNudge(raw: string) {
    const trimmed = raw.trim();
    nudgeKcal = trimmed === "" ? null : Number(trimmed);
  }
  function resetNudge() {
    nudgeKcal = null;
  }

  // Hand the accepted numbers to the editor, rounded to the same display precision
  // the preview showed (ADR-0033 §4: "the live preview already showed what is being
  // accepted"), plus the profile to persist for next time.
  function applyTargets(close: () => void) {
    if (result === null || sex === null) return;
    const d = $nutritionDisplayDecimals;
    onApply(
      {
        energy: roundFoodDisplay(result.energy, d),
        protein: roundFoodDisplay(result.protein, d),
        fat: roundFoodDisplay(result.fat, d),
        carbs: roundFoodDisplay(result.carbs, d),
      },
      {
        sex,
        age: ageN,
        height_cm: heightN,
        weight_kg: weightN,
        activity,
        goal,
      }
    );
    close();
  }
</script>

<BottomSheet
  bind:isOpen={open}
  {onClose}
  title="Calorie & macro calculator"
  class="calorie-calc"
>
  {#snippet children()}
    <p class="intro">
      Turn your body metrics into a suggested daily energy and macro target.
      This is a one-off calculator — Apply writes the numbers into your targets,
      where they stay editable. Nothing recalculates behind your back.
    </p>

    <!-- Biological sex — a metabolic-estimate input only (ADR-0033 §6). -->
    <fieldset class="field">
      <legend>Biological sex</legend>
      <div class="segmented two">
        <button
          type="button"
          class="seg"
          class:on={sex === "female"}
          data-sex="female"
          onclick={() => (sex = "female")}>Female</button
        >
        <button
          type="button"
          class="seg"
          class:on={sex === "male"}
          data-sex="male"
          onclick={() => (sex = "male")}>Male</button
        >
      </div>
      <p class="hint">
        Used only to estimate your resting metabolism — Mifflin-St Jeor is
        defined for two groups. It affects nothing else, and you can adjust the
        calories below.
      </p>
    </fieldset>

    <!-- Metric only (kg/cm): Mifflin-St Jeor is natively metric (ADR-0033 §1). -->
    <div class="metrics">
      <label class="field">
        <span class="field-label">Age</span>
        <input
          type="number"
          class="num"
          min="0"
          step="1"
          inputmode="numeric"
          data-field="age"
          placeholder="years"
          bind:value={ageRaw}
        />
      </label>
      <label class="field">
        <span class="field-label">Height</span>
        <span class="num-with-unit">
          <input
            type="number"
            class="num"
            min="0"
            step="any"
            inputmode="decimal"
            data-field="height"
            placeholder="cm"
            bind:value={heightRaw}
          />
          <span class="unit">cm</span>
        </span>
      </label>
      <label class="field">
        <span class="field-label">Weight</span>
        <span class="num-with-unit">
          <input
            type="number"
            class="num"
            min="0"
            step="any"
            inputmode="decimal"
            data-field="weight"
            placeholder="kg"
            bind:value={weightRaw}
          />
          <span class="unit">kg</span>
        </span>
      </label>
    </div>

    <!-- Four-way IOM PAL activity picker + a one-sentence explanation. -->
    <fieldset class="field">
      <legend>Activity</legend>
      <div class="segmented four">
        {#each ACTIVITY_OPTIONS as opt (opt.value)}
          <button
            type="button"
            class="seg"
            class:on={activity === opt.value}
            data-activity={opt.value}
            onclick={() => (activity = opt.value)}>{opt.label}</button
          >
        {/each}
      </div>
      <p class="hint">
        Your activity level scales resting burn into a daily total, using the
        IOM Physical Activity Level bands.
        <span class="hint-strong"
          >{ACTIVITY_OPTIONS.find((o) => o.value === activity)?.hint}</span
        >
      </p>
    </fieldset>

    <!-- Three-way goal picker. -->
    <fieldset class="field">
      <legend>Goal</legend>
      <div class="segmented three">
        {#each GOAL_OPTIONS as opt (opt.value)}
          <button
            type="button"
            class="seg"
            class:on={goal === opt.value}
            data-goal={opt.value}
            onclick={() => (goal = opt.value)}>{opt.label}</button
          >
        {/each}
      </div>
    </fieldset>

    <!-- Live preview: calories + the three macro grams, recomputing as fields
         change. Reads as an estimate, not a saved target, until Apply. -->
    <div class="preview" class:ready={result !== null} data-preview>
      <span class="preview-head">Suggested daily target</span>
      {#if result !== null}
        <div class="preview-cals" data-preview-calories>
          {formatCalories(result.energy, $nutritionDisplayDecimals)}
        </div>
        <div class="preview-macros">
          <span class="macro" data-preview-protein
            ><span class="macro-label">Protein</span>
            <span class="macro-val"
              >{formatNutrientValue(
                result.protein,
                "g",
                $nutritionDisplayDecimals
              )}</span
            ></span
          >
          <span class="macro" data-preview-fat
            ><span class="macro-label">Fat</span>
            <span class="macro-val"
              >{formatNutrientValue(
                result.fat,
                "g",
                $nutritionDisplayDecimals
              )}</span
            ></span
          >
          <span class="macro" data-preview-carbs
            ><span class="macro-label">Carbs</span>
            <span class="macro-val"
              >{formatNutrientValue(
                result.carbs,
                "g",
                $nutritionDisplayDecimals
              )}</span
            ></span
          >
        </div>

        <!-- Manual nudge on the final calorie number. -->
        <div class="nudge">
          <label class="nudge-label" for="calc-nudge">Adjust calories</label>
          <span class="num-with-unit">
            <input
              id="calc-nudge"
              type="number"
              class="num"
              min="0"
              step="10"
              inputmode="numeric"
              data-field="nudge"
              value={nudgeValue}
              oninput={(e) => editNudge(e.currentTarget.value)}
            />
            <span class="unit">kcal</span>
          </span>
          <button
            type="button"
            class="nudge-reset"
            data-nudge-reset
            disabled={nudgeKcal === null}
            onclick={resetNudge}
            aria-label="Reset calories to the computed value">↺</button
          >
        </div>
        {#if floored}
          <p class="hint floor-note" data-floor-note>
            Kept at your resting burn ({formatCalories(
              bmr ?? 0,
              $nutritionDisplayDecimals
            )}) — the helper won't suggest eating below it.
          </p>
        {/if}
      {:else}
        <p class="preview-empty">
          Enter your sex, age, height and weight to see a suggestion.
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet footer({ close })}
    <button
      type="button"
      class="apply-btn"
      data-apply
      disabled={!valid}
      onclick={() => applyTargets(close)}>Apply targets</button
    >
  {/snippet}
</BottomSheet>

<style>
  .intro {
    margin: 0 0 var(--space-m);
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }

  .field {
    display: block;
    margin: 0 0 var(--space-m);
    padding: 0;
    border: none;
  }
  legend,
  .field-label {
    display: block;
    padding: 0;
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: #000;
  }

  .hint {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .hint-strong {
    display: block;
    margin-top: var(--space-3xs);
    font-weight: 700;
    color: #000;
  }

  /* Brutalist segmented control: black-bordered cells, the selected one inverts
     to black-on-white. Shared by the sex/activity/goal pickers. */
  .segmented {
    display: grid;
    gap: var(--space-2xs);
  }
  .segmented.two {
    grid-template-columns: repeat(2, 1fr);
  }
  .segmented.three {
    grid-template-columns: repeat(3, 1fr);
  }
  .segmented.four {
    grid-template-columns: repeat(2, 1fr);
  }
  @container (min-width: 26rem) {
    .segmented.four {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .seg {
    padding: var(--space-2xs) var(--space-xs);
    border: 2px solid #000;
    background: #fff;
    color: #000;
    font-family: inherit;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    cursor: pointer;
  }
  .seg:hover:not(.on) {
    background: var(--track, #f4f4f5);
  }
  .seg.on {
    background: #000;
    color: #fff;
  }
  .seg:focus-visible {
    outline: 2px solid #000;
    outline-offset: 2px;
  }

  /* Age / height / weight in one responsive row. */
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-s);
    margin: 0 0 var(--space-m);
  }
  .num-with-unit {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .unit {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  /* Brutalist numeric box, matching the target-editor inputs. */
  .num {
    width: 100%;
    min-width: 0;
    padding: var(--space-2xs) var(--space-xs);
    font-family: monospace;
    font-weight: 700;
    font-size: var(--step-n1);
    color: #000;
    background: #fff;
    border: 2px solid #000;
    border-radius: 0;
    box-shadow: inset 2px 2px 0 #e4e4e7;
  }
  .num:focus {
    outline: none;
    background: #000;
    color: #fff;
    box-shadow: none;
  }
  .num::-webkit-outer-spin-button,
  .num::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .num {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* The live preview panel: a bordered block that reads as an estimate. */
  .preview {
    margin: var(--space-m) 0 0;
    padding: var(--space-s) var(--space-m);
    border: 3px solid #000;
    background: color-mix(in srgb, var(--green-bg, #ccff00) 22%, #fff);
  }
  .preview-head {
    display: block;
    font-size: var(--step-n2);
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .preview-cals {
    margin-top: var(--space-3xs);
    font-family: monospace;
    font-size: var(--step-2);
    font-weight: 800;
    color: #000;
  }
  .preview-macros {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-l);
    margin-top: var(--space-2xs);
  }
  .macro {
    display: flex;
    flex-direction: column;
  }
  .macro-label {
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .macro-val {
    font-family: monospace;
    font-size: var(--step-0);
    font-weight: 700;
    color: #000;
  }
  .preview-empty {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }

  .nudge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-m);
    padding-top: var(--space-s);
    border-top: 2px solid #000;
  }
  .nudge-label {
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: #000;
  }
  .nudge .num {
    width: 6rem;
  }
  .nudge-reset {
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #000;
    background: #fff;
    color: #000;
    font-size: var(--step-0);
    line-height: 1;
    cursor: pointer;
  }
  .nudge-reset:hover:not(:disabled) {
    background: #000;
    color: #fff;
  }
  .nudge-reset:disabled {
    border-color: var(--border-subtle, #e4e4e7);
    color: var(--border-subtle, #e4e4e7);
    cursor: default;
  }
  .floor-note {
    color: #000;
    font-weight: 600;
  }

  .apply-btn {
    width: 100%;
    padding: var(--space-s);
    border: 3px solid #000;
    background: var(--green-bg, #ccff00);
    color: #000;
    font-family: inherit;
    font-size: var(--step-0);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 3px 3px 0 #000;
  }
  .apply-btn:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 #000;
  }
  .apply-btn:active:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 #000;
  }
  .apply-btn:disabled {
    background: var(--track, #f4f4f5);
    color: var(--text-muted);
    box-shadow: none;
    cursor: not-allowed;
  }
</style>
