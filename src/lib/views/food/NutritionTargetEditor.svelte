<script lang="ts">
  import {
    settingsStore,
    saveSettings,
    saveFoodTargets,
  } from "../../stores/settings.store";
  import {
    MACRO_DESCRIPTORS,
    MICRO_DESCRIPTORS,
    SECTION_MACROS,
    SECTION_MICROS,
    nutrientDisplayValue,
    parseNutrientEntry,
    type NutrientUnit,
  } from "../../food/nutrient-display";
  import {
    BAKED_NUTRIENT_TARGETS_G,
    ENERGY_TARGET_KEY,
  } from "../../food/nutrition-targets";
  import { onDestroy } from "svelte";
  import Card from "../../ui/Card.svelte";
  import NutrientCard from "./NutrientCard.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";

  // The unit a target is typed in: a display unit for a nutrient, or kcal for the
  // always-on Calories card. Mirrors parseNutrientEntry's signature.
  type TargetUnit = NutrientUnit | "kcal";

  // The Nutrition Display card (tickets #29 + #41): which nutrients appear on the
  // food dashboard/pills, and the daily target each reach-toward nutrient aims
  // for. Shares the modal's card layout and its grouping (ticket #42) — the whole
  // card is the visibility toggle and the allowance is edited inside it. Owns its
  // own slice of settings so the parent Settings screen stays thin (CODING_STANDARDS
  // §4). Visibility and the target overrides are two independent datoms sharing a
  // card (ADR-0031 §2/§3): a save of one never rewrites the other.

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

  // Whether a nutrient is shown as a dashboard meter (the whole-card toggle).
  const isTracked = (key: string): boolean => visible_nutrients.includes(key);

  // The baked default / an override as the plain number the user sees in the
  // card's display unit — the input's placeholder / value. `energy` is baked in
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
  // A `0` override opts the nutrient out of a target (no dashboard bar); the card
  // flags it inline. `energy` never opts out — a non-positive entry clamps back
  // to the baked 2000 kcal at read time (ADR-0031 §2) — so it shows no hint.
  const isOptedOut = (key: string): boolean =>
    food_targets[key] === 0 && key !== ENERGY_TARGET_KEY;

  // Edit a target as the user types: an empty field clears the override back to
  // the baked default (like ↺); otherwise convert the display-unit entry to
  // canonical grams/kcal via #40's parseNutrientEntry (non-numeric reads as 0 =
  // opt-out). The value auto-saves on a short debounce so nothing needs a blur;
  // a blur/enter ({@link commitTarget}) flushes it at once. Two independent datoms
  // per card — this never touches the visibility selection (ADR-0031 §2/§3).
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function editTarget(key: string, unit: TargetUnit, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      delete food_targets[key];
    } else {
      food_targets[key] = parseNutrientEntry(Number(trimmed), unit);
    }
    food_targets = { ...food_targets };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistFoodTargets(), 400);
  }
  // Flush the debounced save immediately (on blur/enter), so leaving the field —
  // or navigating away — always persists the current allowance.
  function commitTarget() {
    clearTimeout(saveTimer);
    void persistFoodTargets();
  }
  onDestroy(() => clearTimeout(saveTimer));

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

<!-- One nutrient card — the shared NutrientCard the dashboard's RDA modal uses
     (ticket #42), its body an allowance editor instead of a value/bar. With
     `hasVisibility` the whole card is a <label> whose click toggles the nutrient's
     dashboard meter (the `control` checkbox); clicks on the inner target input / ↺
     don't toggle it (a <label> ignores its interactive descendants), so editing an
     allowance never flips visibility. Calories (`hasVisibility=false`) is always
     shown, so it renders as a plain card with the allowance only. -->
{#snippet card(
  key: string,
  label: string,
  unit: TargetUnit,
  hasVisibility: boolean
)}
  <NutrientCard
    {label}
    rowKey={key}
    toggle={hasVisibility}
    untracked={hasVisibility && !isTracked(key)}
  >
    {#snippet control()}
      {#if hasVisibility}
        <input
          type="checkbox"
          class="card-check"
          data-nutrient={key}
          checked={isTracked(key)}
          onchange={() => toggleNutrient(key)}
          aria-label="Show {label} on the dashboard"
        />
      {/if}
    {/snippet}
    {#snippet children()}
      <span class="card-allowance">
        <input
          type="number"
          class="card-target"
          min="0"
          step="any"
          inputmode="decimal"
          data-target={key}
          placeholder={placeholderFor(key, unit)}
          value={valueFor(key, unit)}
          oninput={(e) => editTarget(key, unit, e.currentTarget.value)}
          onchange={commitTarget}
          aria-label="{label} target"
        />
        <span class="card-unit">{unit}</span>
        <button
          type="button"
          class="card-reset"
          data-reset={key}
          disabled={food_targets[key] === undefined}
          onclick={() => resetTarget(key)}
          aria-label="Reset {label} to default"
        >
          ↺
        </button>
      </span>
      {#if isOptedOut(key)}
        <span class="card-optout">hidden — no meter</span>
      {/if}
    {/snippet}
  </NutrientCard>
{/snippet}

<Card class="mt-4">
  <h2>Nutrition Display</h2>
  <p class="mt-2">
    Tap a nutrient to show it on the food dashboard, and set the daily allowance
    it reaches toward. A blank target keeps the baked default (shown greyed); ↺
    clears an override; enter 0 to opt out of a target. Calories are always
    shown.
  </p>

  <div class="rda-group-head">{SECTION_MACROS}</div>
  <NutrientCardGrid>
    {@render card(ENERGY_TARGET_KEY, "Calories", "kcal", false)}
    {#each MACRO_DESCRIPTORS as n (n.key)}
      {@render card(n.key, n.label, n.unit, true)}
    {/each}
  </NutrientCardGrid>

  <div class="rda-group-head">{SECTION_MICROS}</div>
  <NutrientCardGrid>
    {#each MICRO_DESCRIPTORS as n (n.key)}
      {@render card(n.key, n.label, n.unit, true)}
    {/each}
  </NutrientCardGrid>

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

  /* Section heading — mirrors the RDA modal's `.rda-group-head` so Settings and
     the modal read the same. */
  .rda-group-head {
    font-size: var(--step-n2);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin: var(--space-m) 0 var(--space-2xs);
    padding-bottom: var(--space-3xs);
    border-bottom: 1px solid var(--border, #000);
  }

  /* The card shell + grid are the shared NutrientCard / NutrientCardGrid; only the
     allowance-editor body below is this surface's own. */

  /* The `0`-opt-out flag: plain inline text (not a chip, not a meter) so the card
     reads as "deliberately un-targeted" without a colour cue (ADR-0003). */
  .card-optout {
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .card-allowance {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  /* Compact numeric field — a brutalist box (2px border, inset, black-on-focus)
     that fits a five-figure micro target (e.g. 4700 mg potassium). */
  .card-target {
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
  .card-target:focus {
    outline: none;
    background: #000;
    color: #fff;
    box-shadow: none;
  }
  /* Strip the spinner buttons so the field stays a clean brutalist box. */
  .card-target::-webkit-outer-spin-button,
  .card-target::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .card-target {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .card-unit {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  /* Reset-to-default control: a bare ↺ glyph, disabled (and muted) whenever the
     card is already at its baked default so "custom vs default" reads from the
     enabled state alone. */
  .card-reset {
    flex-shrink: 0;
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
  .card-reset:hover:not(:disabled) {
    background: #000;
    color: #fff;
  }
  .card-reset:focus-visible {
    outline: 2px solid #000;
    outline-offset: 2px;
  }
  .card-reset:disabled {
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
  /* Custom retro checkbox shared by the round toggle and every nutrient card:
     appearance:none lets the control fill its own box so it centres cleanly,
     matching the 2px black borders used across Settings. */
  .toggle-label input[type="checkbox"],
  .card-check {
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
  .card-check::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: #000;
    transform: scale(0);
  }
  .toggle-label input[type="checkbox"]:checked::before,
  .card-check:checked::before {
    transform: scale(1);
  }
  .toggle-label input[type="checkbox"]:focus-visible,
  .card-check:focus-visible {
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
