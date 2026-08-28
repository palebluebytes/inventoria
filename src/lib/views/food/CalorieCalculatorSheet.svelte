<script lang="ts">
  import { untrack } from "svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Segmented from "../../ui/Segmented.svelte";
  import {
    computeEnergyAndMacros,
    mifflinStJeorBmr,
    type ActivityLevel,
    type BiologicalSex,
    type EnergyGoal,
    type EnergyMacros,
    type EnergyMacrosInput,
  } from "../../food/personalized-energy-macros";
  import {
    formatCalories,
    formatNutrientValue,
  } from "../../food/nutrient-display";
  import { roundFoodDisplay } from "../../food/nutrition";
  import { type FoodProfile } from "../../stores/settings.store";
  import { calorieDisplayDecimals } from "../../stores/device-settings";

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
     * precision the preview showed) and the profile to persist. The editor stores
     * the four keys as the new *default* layer (`settings/food/calculated_targets`)
     * and clears any override on them, auto-tracks the macros, and writes the
     * profile — this sheet stays persistence-free beyond that call.
     */
    onApply: (targets: EnergyMacros, profile: FoodProfile) => void;
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

  const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
  ];
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
  // The shared math input — built once so the two computes below can't drift.
  const metrics = $derived<EnergyMacrosInput | null>(
    valid
      ? {
          sex: sex!,
          weightKg: weightN,
          heightCm: heightN,
          ageYr: ageN,
          activity,
          goal,
        }
      : null
  );
  // The computed set with no nudge — seeds the nudge field's default value.
  const base = $derived(metrics ? computeEnergyAndMacros(metrics) : null);
  // The live preview: the computed set with the nudge applied (floored at BMR).
  const result = $derived(
    metrics
      ? computeEnergyAndMacros({
          ...metrics,
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
  // accepted") — the whole-number toggle for the kcal figure, the fixed nutrient
  // precision for the macro grams — plus the profile to persist for next time.
  function applyTargets(close: () => void) {
    if (result === null || sex === null) return;
    onApply(
      {
        energy: roundFoodDisplay(result.energy, $calorieDisplayDecimals),
        protein: roundFoodDisplay(result.protein),
        fat: roundFoodDisplay(result.fat),
        carbs: roundFoodDisplay(result.carbs),
        fiber_content: roundFoodDisplay(result.fiber_content),
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

    <!-- Biological sex — a metabolic-estimate input only (ADR-0033 §6). Starts
         empty (null), so mark the group required. -->
    <div class="field">
      <Segmented
        label="Biological sex"
        options={SEX_OPTIONS}
        bind:value={sex}
        required
        testid="calc-sex"
      />
      <p class="hint">
        Used only to estimate your resting metabolism — Mifflin-St Jeor is
        defined for two groups. It affects nothing else, and you can adjust the
        calories below.
      </p>
    </div>

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
    <div class="field">
      <Segmented
        label="Activity"
        options={ACTIVITY_OPTIONS}
        bind:value={activity}
        testid="calc-activity"
      />
      <p class="hint">
        Your activity level scales resting burn into a daily total, using the
        IOM Physical Activity Level bands.
        <span class="hint-strong"
          >{ACTIVITY_OPTIONS.find((o) => o.value === activity)?.hint}</span
        >
      </p>
    </div>

    <!-- Three-way goal picker. -->
    <div class="field">
      <Segmented
        label="Goal"
        options={GOAL_OPTIONS}
        bind:value={goal}
        testid="calc-goal"
      />
    </div>

    <!-- Live preview: calories + the three macro grams, recomputing as fields
         change. Reads as an estimate, not a saved target, until Apply. -->
    <div class="preview" class:ready={result !== null} data-preview>
      <span class="preview-head">Suggested daily target</span>
      {#if result !== null}
        <div class="preview-cals" data-preview-calories>
          {formatCalories(result.energy, $calorieDisplayDecimals)}
        </div>
        <div class="preview-macros">
          <span class="macro" data-preview-protein
            ><span class="macro-label">Protein</span>
            <span class="macro-val"
              >{formatNutrientValue(result.protein, "g")}</span
            ></span
          >
          <span class="macro" data-preview-fat
            ><span class="macro-label">Fat</span>
            <span class="macro-val">{formatNutrientValue(result.fat, "g")}</span
            ></span
          >
          <span class="macro" data-preview-carbs
            ><span class="macro-label">Carbs</span>
            <span class="macro-val"
              >{formatNutrientValue(result.carbs, "g")}</span
            ></span
          >
          <span class="macro" data-preview-fiber
            ><span class="macro-label">Fibre</span>
            <span class="macro-val"
              >{formatNutrientValue(result.fiber_content, "g")}</span
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
              $calorieDisplayDecimals
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
  .field-label {
    display: block;
    padding: 0;
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
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
    color: var(--ink);
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
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--step-n1);
    color: var(--ink);
    background: var(--paper);
    border: var(--edge);
    border-radius: var(--radius);
    box-shadow: inset 2px 2px 0 var(--border);
  }
  .num:focus {
    outline: none;
    background: var(--ink);
    color: var(--paper);
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
    border: var(--edge-thick);
    background: color-mix(in srgb, var(--green-bg) 22%, var(--paper));
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
    font-family: var(--font-mono);
    font-size: var(--step-2);
    font-weight: 800;
    color: var(--ink);
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
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--ink);
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
    border-top: var(--edge);
  }
  .nudge-label {
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
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
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    font-size: var(--step-0);
    line-height: 1;
    cursor: pointer;
  }
  .nudge-reset:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }
  .nudge-reset:disabled {
    border-color: var(--border-subtle, var(--border));
    color: var(--border-subtle, var(--border));
    cursor: default;
  }
  .floor-note {
    color: var(--ink);
    font-weight: 600;
  }

  .apply-btn {
    width: 100%;
    padding: var(--space-s);
    border: var(--edge-thick);
    background: var(--green-bg);
    color: var(--ink);
    font-family: inherit;
    font-size: var(--step-0);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--shadow-2);
  }
  .apply-btn:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-2);
  }
  .apply-btn:active:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: var(--shadow-1);
  }
  .apply-btn:disabled {
    background: var(--track, var(--bg-input));
    color: var(--text-muted);
    box-shadow: none;
    cursor: not-allowed;
  }
</style>
