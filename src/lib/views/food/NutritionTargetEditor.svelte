<script lang="ts">
  import {
    settingsStore,
    saveSettings,
    saveFoodTargets,
  } from "../../stores/settings.store";
  import {
    NUTRIENT_CATALOGUE,
    nutrientDisplayValue,
    parseNutrientEntry,
    type NutrientUnit,
  } from "../../food/nutrient-display";
  import {
    BAKED_NUTRIENT_TARGETS_G,
    REACH_TOWARD_KEYS,
    ACTIVE_ADULT_MACROS_G,
    ENERGY_TARGET_KEY,
  } from "../../food/nutrition-targets";
  import Card from "../../ui/Card.svelte";

  // The unit a target is typed in: a display unit for a nutrient, or kcal for the
  // always-on Calories row. Mirrors parseNutrientEntry's signature.
  type TargetUnit = NutrientUnit | "kcal";

  // The Nutrition Display card (ticket #29 + #41): which nutrients appear on the
  // food dashboard/pills, and the daily target each reach-toward nutrient aims
  // for. Owns its own slice of settings so the parent Settings screen stays thin
  // (CODING_STANDARDS §4). Visibility/rounding and the target overrides are two
  // independent datoms sharing a row (ADR-0031 §2/§3): a save of one never
  // rewrites the other.

  // Visible-nutrient selection (ticket #29). Each toggle persists immediately,
  // re-writing the already-saved API keys from the store so an unsaved edit in
  // the credentials form is never clobbered. Calories are always-on via the ring.
  let visible_nutrients = $state<string[]>([]);
  // Whether nutrition reads rounded to whole numbers (display-only, ticket #29).
  let round_nutrition = $state(false);
  // Per-nutrient target overrides (ticket #41, ADR-0031 §3): mirrors the
  // `settings/food/targets` blob — a partial map keyed by breakdown key in the
  // baked map's canonical unit (grams for mass, kcal for `energy`). Absent → the
  // baked default (placeholder); `> 0` → an override (shown as the input value);
  // `0` → an opt-out ("hidden" hint).
  let food_targets = $state<Partial<Record<string, number>>>({});
  let initialized = $state(false);
  $effect(() => {
    if (!initialized && $settingsStore) {
      visible_nutrients = [...$settingsStore.visible_nutrients];
      round_nutrition = $settingsStore.round_nutrition;
      food_targets = { ...$settingsStore.food_targets };
      initialized = true;
    }
  });

  // The rows split by the reach-toward set (ADR-0031 §1/§3): the four macro/fibre
  // keys group under "Macros" and the twelve label micronutrients under "Vitamins
  // & Minerals"; Calories (`energy`) is pinned above both as a target-only,
  // always-on row. A catalogue nutrient outside the reach-toward set (a limit
  // nutrient like sodium) keeps its visibility toggle but has no baked target, so
  // its row shows no target field.
  const MACRO_TARGET_KEYS = new Set(
    Object.keys(ACTIVE_ADULT_MACROS_G).filter((k) => k !== ENERGY_TARGET_KEY)
  );
  const isMicronutrient = (key: string): boolean =>
    REACH_TOWARD_KEYS.has(key) && !MACRO_TARGET_KEYS.has(key);
  const MACRO_ROWS = NUTRIENT_CATALOGUE.filter((n) => !isMicronutrient(n.key));
  const MICRO_ROWS = NUTRIENT_CATALOGUE.filter((n) => isMicronutrient(n.key));

  // A targetable row (reach-toward) shows the target field; a limit nutrient does
  // not (it has no baked default to reach toward).
  const hasTarget = (key: string): boolean => REACH_TOWARD_KEYS.has(key);

  // The baked default / an override as the plain number the user sees in the
  // row's display unit — the input's placeholder / value. `energy` is baked in
  // kcal already; every other key is baked in grams and reformats to g/mg/µg.
  const displayNumber = (grams: number, unit: TargetUnit): string =>
    unit === "kcal" ? String(grams) : String(nutrientDisplayValue(grams, unit));
  const placeholderFor = (key: string, unit: TargetUnit): string =>
    displayNumber(BAKED_NUTRIENT_TARGETS_G[key], unit);
  // A set override shown in the same display unit — the input's value; absent →
  // empty, so the placeholder (baked default) shows through instead.
  const valueFor = (key: string, unit: TargetUnit): string => {
    const override = food_targets[key];
    return typeof override === "number" ? displayNumber(override, unit) : "";
  };
  // A `0` override opts the nutrient out of a target (no dashboard bar); the row
  // flags it inline. `energy` never opts out — a non-positive entry clamps back
  // to the baked 2000 kcal at read time (ADR-0031 §2) — so it shows no hint.
  const isOptedOut = (key: string): boolean =>
    food_targets[key] === 0 && key !== ENERGY_TARGET_KEY;

  // Commit a typed target: an empty field clears the override back to the baked
  // default (like ↺); otherwise convert the display-unit entry to canonical
  // grams/kcal via #40's parseNutrientEntry (non-numeric reads as 0 = opt-out).
  // Fires on change (blur/enter), so a save lands per committed edit, not per
  // keystroke, mirroring the card's other save-on-change controls.
  async function setTarget(key: string, unit: TargetUnit, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      delete food_targets[key];
    } else {
      food_targets[key] = parseNutrientEntry(Number(trimmed), unit);
    }
    food_targets = { ...food_targets };
    await persistFoodTargets();
  }

  // Clear a single override back to its baked default (the ↺ control).
  async function resetTarget(key: string) {
    delete food_targets[key];
    food_targets = { ...food_targets };
    await persistFoodTargets();
  }

  // Persist the whole override map as the `settings/food/targets` datom —
  // independent of the visibility/round datoms (ADR-0031 §2/§3).
  async function persistFoodTargets() {
    try {
      await saveFoodTargets(food_targets);
    } catch (err) {
      console.error("Failed to save food targets", err);
    }
  }

  async function toggleNutrient(key: string) {
    visible_nutrients = visible_nutrients.includes(key)
      ? visible_nutrients.filter((k) => k !== key)
      : [...visible_nutrients, key];
    await persistNutritionDisplay();
  }

  async function toggleRoundNutrition() {
    round_nutrition = !round_nutrition;
    await persistNutritionDisplay();
  }

  // Persist the visibility/round datoms, carrying the current API credentials
  // through untouched (an unsaved edit in the credentials form is never
  // clobbered) — the target overrides ride their own writer, so they're
  // untouched here too.
  async function persistNutritionDisplay() {
    try {
      await saveSettings({
        usda_api_key: $settingsStore.usda_api_key,
        tmdb_api_key: $settingsStore.tmdb_api_key,
        scraper_proxy_url: $settingsStore.scraper_proxy_url,
        visible_nutrients,
        round_nutrition,
      });
    } catch (err) {
      console.error("Failed to save nutrition display settings", err);
    }
  }
</script>

{#snippet targetRow(
  key: string,
  label: string,
  unit: TargetUnit,
  hasVisibility: boolean
)}
  <div class="nutrient-row" data-nutrient-row={key}>
    {#if hasVisibility}
      <input
        class="row-visible"
        type="checkbox"
        data-nutrient={key}
        checked={visible_nutrients.includes(key)}
        onchange={() => toggleNutrient(key)}
        aria-label="Show {label}"
      />
    {:else}
      <span class="row-visible-spacer" aria-hidden="true"></span>
    {/if}
    <span class="row-label">
      <span class="row-label-text">{label}</span>
      {#if isOptedOut(key)}
        <span class="row-optout">hidden</span>
      {/if}
    </span>
    {#if hasTarget(key)}
      <input
        class="row-target"
        type="number"
        min="0"
        step="any"
        inputmode="decimal"
        data-target={key}
        placeholder={placeholderFor(key, unit)}
        value={valueFor(key, unit)}
        onchange={(e) => setTarget(key, unit, e.currentTarget.value)}
        aria-label="{label} target"
      />
      <span class="row-unit">{unit}</span>
      <button
        type="button"
        class="row-reset"
        data-reset={key}
        disabled={food_targets[key] === undefined}
        onclick={() => resetTarget(key)}
        aria-label="Reset {label} to default"
      >
        ↺
      </button>
    {/if}
  </div>
{/snippet}

<Card class="mt-4">
  <h2>Nutrition Display</h2>
  <p class="mt-2">
    Choose which nutrients appear on the food dashboard summary and the
    staged-food pills, and set the daily target each one reaches toward. A blank
    target keeps the baked default (shown greyed); ↺ clears an override; enter 0
    to opt out of a target. Calories are always shown.
  </p>
  <div class="nutrient-target-list mt-4">
    {@render targetRow(ENERGY_TARGET_KEY, "Calories", "kcal", false)}
    <h3 class="group-head">Macros</h3>
    {#each MACRO_ROWS as nutrient (nutrient.key)}
      {@render targetRow(nutrient.key, nutrient.label, nutrient.unit, true)}
    {/each}
    <h3 class="group-head">Vitamins &amp; Minerals</h3>
    {#each MICRO_ROWS as nutrient (nutrient.key)}
      {@render targetRow(nutrient.key, nutrient.label, nutrient.unit, true)}
    {/each}
  </div>

  <div class="round-toggle mt-4">
    <label class="toggle-label">
      <input
        type="checkbox"
        id="round-nutrition-toggle"
        checked={round_nutrition}
        onchange={toggleRoundNutrition}
      />
      <span class="toggle-text">Round nutrition to whole numbers</span>
    </label>
    <span class="help-text"
      >Show calories and nutrients as whole numbers. Stored values keep full
      precision either way.</span
    >
  </div>
</Card>

<style>
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: #000;
    text-transform: uppercase;
    margin: 0;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .help-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Nutrient target editor (ticket #41): one aligned grid so every row's
     [visible] [label] [target] [unit] [↺] lines up column-for-column. Each row
     is a subgrid spanning all five parent tracks, so its cells snap to the
     shared columns while a row without a target simply leaves the
     target/unit/reset tracks empty — no cell ever bleeds into the next row. */
  .nutrient-target-list {
    container-type: inline-size;
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    gap: var(--space-2xs) var(--space-xs);
  }
  .nutrient-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
  }
  /* A section heading spanning the whole grid. */
  .group-head {
    grid-column: 1 / -1;
    font-size: var(--step-n2);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin: var(--space-xs) 0 var(--space-3xs);
    padding-bottom: var(--space-3xs);
    border-bottom: 1px solid var(--border, #000);
  }
  .row-label {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 0.5em;
    min-width: 0;
    /* Scale with the list width so a long single-word label (CALORIES,
       VITAMIN B12) shrinks to fit a narrow card rather than spilling under the
       target field, while a wide card keeps the full step-n1 size. */
    font-size: clamp(0.62rem, 3.4cqi, var(--step-n1));
    font-weight: 700;
    line-height: 1.35;
    text-transform: uppercase;
    color: #000;
  }
  /* The `0`-opt-out flag: plain inline text (not a chip, not a meter) so the row
     reads as "deliberately un-targeted" without a colour cue (ADR-0003). */
  .row-optout {
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  /* Compact numeric field — a brutalist box (2px border, inset, black-on-focus)
     trimmed to a right-aligned column that fits a five-figure micro target
     (e.g. 4700 mg potassium). */
  .row-target {
    width: 4.25rem;
    min-width: 0;
    padding: var(--space-3xs) var(--space-2xs);
    font-family: monospace;
    font-weight: 700;
    font-size: var(--step-n1);
    text-align: right;
    color: #000;
    background: #fff;
    border: 2px solid #000;
    border-radius: 0;
    box-shadow: inset 2px 2px 0 #e4e4e7;
  }
  .row-target:focus {
    outline: none;
    background: #000;
    color: #fff;
    box-shadow: none;
  }
  /* Strip the spinner buttons so the field stays a clean brutalist box. */
  .row-target::-webkit-outer-spin-button,
  .row-target::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .row-target {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  /* On a narrow card the fixed right-hand controls would crowd the label track,
     so tighten the numeric field and its unit until the label has room again. */
  @container (max-width: 380px) {
    .row-target {
      width: 3.25rem;
      font-size: var(--step-n2);
    }
    .row-unit {
      font-size: var(--step-n3);
    }
  }
  .row-unit {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  /* Reset-to-default control: a bare ↺ glyph, disabled (and muted) whenever the
     row is already at its baked default so "custom vs default" reads from the
     enabled state alone. */
  .row-reset {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 2px solid #000;
    background: #fff;
    color: #000;
    font-size: var(--step-0);
    line-height: 1;
    cursor: pointer;
  }
  .row-reset:hover:not(:disabled) {
    background: #000;
    color: #fff;
  }
  .row-reset:focus-visible {
    outline: 2px solid #000;
    outline-offset: 2px;
  }
  .row-reset:disabled {
    border-color: var(--border-subtle, #e4e4e7);
    color: var(--border-subtle, #e4e4e7);
    cursor: default;
  }

  /* Whole-number toggle: the label + its help text stacked, with a container
     context so the shared .toggle-label font sizing resolves against this block
     rather than the viewport. */
  .round-toggle {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .toggle-label {
    display: flex;
    align-items: center;
    /* em-based so the checkbox, gap and text scale together as one unit. */
    gap: 0.65em;
    font-size: min(var(--step-n1), 5.3cqi);
    font-weight: 700;
    line-height: 1.4;
    color: #000;
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
  }
  /* The caps sit ~0.08em above the line-box centre; nudge them down optically
     where text-box-trim isn't available. */
  .toggle-text {
    position: relative;
    top: 0.08em;
  }
  @supports (text-box-trim: trim-both) {
    .toggle-text {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      top: 0;
    }
  }
  /* Custom retro checkbox shared by the round toggle and every visibility row:
     appearance:none lets the control fill its own box so it centres cleanly
     against the label, matching the 2px black borders used across Settings. */
  .toggle-label input[type="checkbox"],
  .nutrient-row input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: grid;
    place-content: center;
    width: 1.35em;
    height: 1.35em;
    margin: 0;
    border: 2px solid #000;
    background: #fff;
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"]::before,
  .nutrient-row input[type="checkbox"]::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: #000;
    transform: scale(0);
  }
  .toggle-label input[type="checkbox"]:checked::before,
  .nutrient-row input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .toggle-label input[type="checkbox"]:focus-visible,
  .nutrient-row input[type="checkbox"]:focus-visible {
    outline: 2px solid #000;
    outline-offset: 2px;
  }

  .mt-2 {
    margin-top: var(--space-xs);
  }
  .mt-4 {
    margin-top: var(--space-m);
  }
</style>
