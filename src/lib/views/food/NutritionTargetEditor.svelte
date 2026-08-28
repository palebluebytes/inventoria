<script lang="ts">
  import {
    settingsStore,
    saveFoodTargets,
    saveFoodLimits,
    saveCalculatorPlan,
    type FoodProfile,
  } from "../../stores/settings.store";
  import {
    calorieDisplayDecimals,
    visibleNutrients,
    roundNutritionPref,
    setVisibleNutrients,
    setRoundNutrition,
  } from "../../stores/device-settings";
  import { get } from "svelte/store";
  import type { EnergyMacros } from "../../food/personalized-energy-macros";
  import { roundFoodDisplay } from "../../food/nutrition";
  import {
    MACRO_DESCRIPTORS,
    MICRO_DESCRIPTORS,
    LIMIT_DESCRIPTORS,
    SECTION_MACROS,
    SECTION_MICROS,
    SECTION_LIMITS,
    nutrientDisplayValue,
    parseNutrientEntry,
    type NutrientUnit,
  } from "../../food/nutrient-display";
  import {
    BAKED_NUTRIENT_LIMITS_G,
    ENERGY_TARGET_KEY,
    PERSONALIZED_TARGET_KEYS,
    defaultNutrientTargets,
  } from "../../food/nutrition-targets";
  import { onDestroy } from "svelte";
  import NutrientCard from "./NutrientCard.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";
  import NutrientGroupHead from "./NutrientGroupHead.svelte";
  import CalorieCalculatorSheet from "./CalorieCalculatorSheet.svelte";
  import TargetRationaleSheet from "./TargetRationaleSheet.svelte";
  import {
    TARGET_RATIONALES,
    type TargetRationale,
  } from "../../food/target-rationale";

  // The unit a target is typed in: a display unit for a nutrient, or kcal for the
  // always-on Calories card. Mirrors parseNutrientEntry's signature.
  type TargetUnit = NutrientUnit | "kcal";

  // The Nutrition Display card (tickets #29 + #41): which nutrients appear on the
  // food dashboard/pills, and the daily target each reach-toward nutrient aims
  // for. Shares the modal's card layout and grouping (ticket #42) — the whole card
  // is the visibility toggle (no separate control) and the allowance is edited
  // inside it. Owns its own slice of settings so the parent Settings screen stays
  // thin (CODING_STANDARDS §4). Visibility and the targets keep their own writers
  // and are no longer even the same kind of thing — one is a device setting, the
  // other a datom (ADR-0063) — but they are not strictly independent: setting a
  // positive custom target auto-tracks the nutrient (customising implies "show it").

  // Visible-nutrient selection (ticket #29), a device setting read synchronously,
  // so each toggle persists through its own setter with nothing to clobber.
  // Calories are always shown and are not selectable.
  let visible_nutrients = $state<string[]>([...get(visibleNutrients)]);
  // Whether calories read rounded to whole numbers (display-only, ticket #29).
  let round_nutrition = $state(get(roundNutritionPref));
  // Per-nutrient target overrides (ticket #41, ADR-0031 §3): mirrors the
  // `settings/food/targets` blob — a partial map keyed by breakdown key in the
  // baked map's canonical unit (grams for mass, kcal for `energy`). Absent → the
  // baked default (placeholder); `> 0` → an override (shown as the input value);
  // `0` → an opt-out ("hidden" hint).
  let food_targets = $state<Partial<Record<string, number>>>({});
  // Per-nutrient limit overrides (ticket #43, ADR-0032 §3): the stay-under twin of
  // `food_targets`, mirroring the `settings/food/limits` blob. Absent → the baked
  // cap (placeholder); `> 0` → an override; `0` → an opt-out ("no limit" hint).
  // Written independently via saveFoodLimits — a limit has no dashboard meter, so
  // this never touches `visible_nutrients`.
  let food_limits = $state<Partial<Record<string, number>>>({});
  // The calculator's frozen result (ADR-0033 Amendment): the DEFAULT layer
  // for energy + the three macros, mirroring `settings/food/calculated_targets`.
  // Not edited by an input — only replaced wholesale when "Calculate from body
  // metrics" is applied — so an absent key here means "no personalized default,
  // use the baked reference" (see `defaultTargets` / `placeholderFor`).
  let food_calculated_targets = $state<Partial<Record<string, number>>>({});
  // Only the three target blobs need seeding from the ledger, and only they can
  // arrive late. The two display preferences above are read synchronously at
  // construction (ADR-0063), so they never pass through here.
  let initialized = $state(false);
  $effect(() => {
    if (!initialized && $settingsStore) {
      food_targets = { ...$settingsStore.food_targets };
      food_limits = { ...$settingsStore.food_limits };
      food_calculated_targets = { ...$settingsStore.food_calculated_targets };
      initialized = true;
    }
  });

  // The resolved default each reach-toward target reverts to: the baked reference
  // with the calculator's frozen energy/macro set layered on top (ADR-0033 §4).
  // Once the helper has run, this is the computed figure, so ↺ and the greyed
  // placeholder show it instead of the generic 2000-kcal reference.
  const defaultTargets = $derived(
    defaultNutrientTargets(food_calculated_targets)
  );

  // Whether a nutrient is shown as a dashboard meter (the whole-card toggle).
  const isTracked = (key: string): boolean => visible_nutrients.includes(key);

  // The baked/calculated default or an override as the plain number the user sees
  // in the card's display unit — the input's placeholder / value. `energy` is in
  // kcal already (a personalized default can be fractional); every other key is
  // baked in grams and reformats to g/mg/µg. Only the kcal branch honours the
  // whole-number toggle ($calorieDisplayDecimals) — the same scope the dashboard,
  // pills, and calculator apply it at; a gram target always shows its decimals.
  const displayNumber = (grams: number, unit: TargetUnit): string =>
    unit === "kcal"
      ? String(roundFoodDisplay(grams, $calorieDisplayDecimals))
      : String(nutrientDisplayValue(grams, unit));
  // The placeholder is the resolved default (baked, or the calculator's frozen
  // figure once it has run) — what the field reverts to when its override clears.
  const placeholderFor = (key: string, unit: TargetUnit): string =>
    displayNumber(defaultTargets[key], unit);
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

  // The stay-under twins (ADR-0032): a limit's baked cap / override in its display
  // unit, and its `0` opt-out. No energy member here, so no clamp exception.
  const placeholderForLimit = (key: string, unit: TargetUnit): string =>
    displayNumber(BAKED_NUTRIENT_LIMITS_G[key], unit);
  const valueForLimit = (key: string, unit: TargetUnit): string => {
    const override = food_limits[key];
    return typeof override === "number" ? displayNumber(override, unit) : "";
  };
  const isLimitOptedOut = (key: string): boolean => food_limits[key] === 0;

  // Edit a target as the user types: an empty field clears the override back to
  // the baked default (like ↺); otherwise convert the display-unit entry to
  // canonical grams/kcal via #40's parseNutrientEntry (non-numeric reads as 0 =
  // opt-out). Setting a POSITIVE custom target also tracks the nutrient — adds its
  // dashboard meter — since customising something means you want to see it (the
  // `0` opt-out and Calories never track this way). The value auto-saves on a
  // short debounce so nothing needs a blur; a blur/enter ({@link commitTarget})
  // flushes it at once.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let visibilityDirty = false;
  function editTarget(key: string, unit: TargetUnit, raw: string) {
    const trimmed = raw.trim();
    let parsed: number | undefined;
    if (trimmed === "") {
      delete food_targets[key];
    } else {
      parsed = parseNutrientEntry(Number(trimmed), unit);
      food_targets[key] = parsed;
    }
    food_targets = { ...food_targets };
    if (
      typeof parsed === "number" &&
      parsed > 0 &&
      key !== ENERGY_TARGET_KEY &&
      !visible_nutrients.includes(key)
    ) {
      visible_nutrients = [...visible_nutrients, key];
      visibilityDirty = true;
    }
    scheduleSave();
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  // Flush the debounced save immediately (on blur/enter), so leaving the field —
  // or navigating away — always persists the allowance and any auto-track.
  function flushSave() {
    clearTimeout(saveTimer);
    void persistFoodTargets();
    if (visibilityDirty) {
      visibilityDirty = false;
      void persistNutritionDisplay();
    }
  }
  function commitTarget() {
    flushSave();
  }
  onDestroy(() => {
    clearTimeout(saveTimer);
    clearTimeout(limitSaveTimer);
  });

  // Clear a single override back to its resolved default — the baked reference,
  // or the calculator's frozen figure once the helper has run (the ↺ control).
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

  // Edit a limit as the user types — the stay-under twin of editTarget, but with
  // NO auto-track (a limit has no dashboard meter) and no visibility side effect:
  // an empty field clears the override back to the baked cap; otherwise the
  // display-unit entry converts to canonical grams (non-numeric = 0 = opt-out).
  // Auto-saves on the same short debounce; blur/enter flushes it.
  let limitSaveTimer: ReturnType<typeof setTimeout> | undefined;
  function editLimit(key: string, unit: TargetUnit, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      delete food_limits[key];
    } else {
      food_limits[key] = parseNutrientEntry(Number(trimmed), unit);
    }
    food_limits = { ...food_limits };
    scheduleLimitSave();
  }
  function scheduleLimitSave() {
    clearTimeout(limitSaveTimer);
    limitSaveTimer = setTimeout(flushLimitSave, 400);
  }
  function flushLimitSave() {
    clearTimeout(limitSaveTimer);
    void persistFoodLimits();
  }
  function commitLimit() {
    flushLimitSave();
  }
  // Clear a single limit override back to its baked cap (the ↺ control).
  async function resetLimit(key: string) {
    delete food_limits[key];
    food_limits = { ...food_limits };
    await persistFoodLimits();
  }
  // Persist the whole limit override map as the `settings/food/limits` datom,
  // independent of the targets/visibility/round datoms (ADR-0032 §2/§3).
  async function persistFoodLimits() {
    try {
      await saveFoodLimits(food_limits);
    } catch (err) {
      console.error("Failed to save food limits", err);
    }
  }

  async function toggleNutrient(key: string) {
    visible_nutrients = visible_nutrients.includes(key)
      ? visible_nutrients.filter((k) => k !== key)
      : [...visible_nutrients, key];
    persistNutritionDisplay();
  }

  async function toggleRoundNutrition() {
    round_nutrition = !round_nutrition;
    persistNutritionDisplay();
  }

  // Both are view preferences (ADR-0063), so each goes straight to its own
  // synchronous setter. No ledger write, and nothing to read through: this used
  // to carry the scraper proxy and the OFF consent along just to avoid clobbering
  // them, and that whole hazard is gone with the datom.
  function persistNutritionDisplay() {
    setVisibleNutrients(visible_nutrients);
    setRoundNutrition(round_nutrition);
  }

  // The personalized calorie/macro calculator (ADR-0033 §4, ticket #45): an action
  // card in the Energy & macros grid's empty cell opens a BottomSheet helper. It
  // hands its accepted numbers back here so this editor — which already owns the
  // targets/visibility state and their writers — performs the writes, rather than
  // the sheet re-deriving the persistence.
  let showCalculator = $state(false);

  // The open "Why these defaults?" rationale sheet (ADR-0033 §5, ticket #46), or
  // null when none is open. Set by the four ⓘ buttons (three section heads + the
  // calculator card); the sheet is mounted only while non-null so it re-seeds fresh.
  let rationale = $state<TargetRationale | null>(null);

  // Whether the "how this section works" help text is revealed. Collapsed by
  // default — tucked behind the ⓘ inline with the heading so the section leads
  // straight into the nutrient grids; the ⓘ toggles it open on demand.
  let showHelp = $state(false);

  // The reach-toward keys the helper auto-tracks so their meters appear — the
  // three macros plus fibre (now personalized too, ADR-0033 Amendment 2). Energy is
  // the always-on ring, never a visible-nutrient meter.
  const CALCULATED_MACRO_KEYS = [
    "protein",
    "fat",
    "carbs",
    "fiber_content",
  ] as const;

  // Apply the helper's result (ADR-0033 §4 + Amendment). The computed set becomes
  // the new DEFAULT for energy + the three macros — its own `calculated_targets`
  // datom, the layer under the overrides — rather than an override, so clearing a
  // field (↺) returns to the computed figure, not the generic baked reference. So
  // we also CLEAR any explicit override on those four keys, letting the fresh
  // default show through as the greyed placeholder. The three macros are still
  // auto-tracked so their meters appear (Calories is always-on), and the inert
  // pre-fill profile is saved for the next open. All of it — defaults, cleared
  // overrides, auto-track, profile — is one atomic append (`saveCalculatorPlan`,
  // Coding Standards §5): a mid-write failure can never strand new defaults over
  // stale overrides.
  async function applyCalculatorResult(
    targets: EnergyMacros,
    profile: FoodProfile
  ) {
    food_calculated_targets = {
      [ENERGY_TARGET_KEY]: targets.energy,
      protein: targets.protein,
      fat: targets.fat,
      carbs: targets.carbs,
      fiber_content: targets.fiber_content,
    };
    for (const key of PERSONALIZED_TARGET_KEYS) delete food_targets[key];
    food_targets = { ...food_targets };
    const toTrack = CALCULATED_MACRO_KEYS.filter(
      (k) => !visible_nutrients.includes(k)
    );
    if (toTrack.length > 0)
      visible_nutrients = [...visible_nutrients, ...toTrack];
    // The meter list is no longer part of the plan's atomic append — it is a
    // preference now, not a datom. What the transaction protects is the
    // defaults-versus-overrides pair, which is intact; the worst a half-applied
    // plan can cost is a meter row shown or not shown.
    if (toTrack.length > 0) setVisibleNutrients(visible_nutrients);
    try {
      await saveCalculatorPlan({
        calculated_targets: food_calculated_targets,
        targets: food_targets,
        profile,
      });
    } catch (err) {
      console.error("Failed to apply calculator result", err);
    }
  }
</script>

<!-- One nutrient card — the shared NutrientCard the dashboard's RDA modal uses
     (ticket #42), its body an allowance editor instead of a value/bar. With
     `hasVisibility` the whole card IS the visibility toggle (no separate control);
     clicks on the inner target input / ↺ don't toggle it, so editing an allowance
     never flips visibility. Calories (`hasVisibility=false`) is always shown, so it
     renders as a plain card with the allowance only. -->
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
    tracked={!hasVisibility || isTracked(key)}
    onToggle={() => toggleNutrient(key)}
  >
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

<!-- A stay-under limit card (ticket #43, ADR-0032 §3): the same shared NutrientCard
     and allowance idiom as above, but a plain toggle-less card (like Calories) —
     a limit has no dashboard meter, so there is no visibility to flip. The body
     edits the `settings/food/limits` cap; `0` flags an inline "no limit" hint. -->
{#snippet limitCard(key: string, label: string, unit: TargetUnit)}
  <NutrientCard {label} rowKey={key}>
    {#snippet children()}
      <span class="card-allowance">
        <input
          type="number"
          class="card-target"
          min="0"
          step="any"
          inputmode="decimal"
          data-limit={key}
          placeholder={placeholderForLimit(key, unit)}
          value={valueForLimit(key, unit)}
          oninput={(e) => editLimit(key, unit, e.currentTarget.value)}
          onchange={commitLimit}
          aria-label="{label} limit"
        />
        <span class="card-unit">{unit}</span>
        <button
          type="button"
          class="card-reset"
          data-reset-limit={key}
          disabled={food_limits[key] === undefined}
          onclick={() => resetLimit(key)}
          aria-label="Reset {label} to default"
        >
          ↺
        </button>
      </span>
      {#if isLimitOptedOut(key)}
        <span class="card-optout">no limit</span>
      {/if}
    {/snippet}
  </NutrientCard>
{/snippet}

<!-- The "Why these defaults?" ⓘ affordance (ADR-0033 §5, #46): a small circular
     button that opens the matching rationale sheet. Rendered into NutrientGroupHead's
     optional `info` slot for the three section heads, and beside the calculator card. -->
{#snippet infoButton(r: TargetRationale)}
  <button
    type="button"
    class="info-btn"
    data-info={r.referenceDoc}
    aria-label="Why these defaults? {r.title}"
    onclick={() => (rationale = r)}
  >
    i
  </button>
{/snippet}

<section class="nutrition-editor">
  <div class="section-head-row">
    <h2>Nutrition Display</h2>
    <!-- The section help is tucked behind this ⓘ, inline with the heading, so the
         section leads straight into the grids. Toggles the paragraph below. -->
    <button
      type="button"
      class="info-btn"
      aria-expanded={showHelp}
      aria-controls="nutrition-display-help"
      aria-label="How Nutrition Display works"
      onclick={() => (showHelp = !showHelp)}
    >
      i
    </button>
  </div>
  {#if showHelp}
    <p id="nutrition-display-help" class="mt-2">
      Tap a nutrient to show it on the food dashboard, and set the daily
      allowance it reaches toward. A blank target keeps the baked default (shown
      greyed); ↺ clears an override; enter 0 to opt out of a target. Calories
      are always shown. The limits below are caps to stay under — the day tints
      amber once you go over.
    </p>
  {/if}

  <!-- The heading bands and card grids bleed to the card's edges so the section
       reads edge-to-edge like the dashboard's full-day modal. -->
  <div class="nutrient-sections">
    <NutrientGroupHead label={SECTION_MACROS}>
      {#snippet info()}
        {@render infoButton(TARGET_RATIONALES.macros)}
      {/snippet}
    </NutrientGroupHead>
    <NutrientCardGrid>
      {@render card(ENERGY_TARGET_KEY, "Calories", "kcal", false)}
      {#each MACRO_DESCRIPTORS as n (n.key)}
        {@render card(n.key, n.label, n.unit, true)}
      {/each}
      <!-- The calculator's entry point fills the grid's empty sixth cell as an
           ACTION button — a solid black fill (never the acid-green tracked cards'
           fill) so it reads unmistakably as a button to press, not a target
           masquerading as a nutrient (ADR-0033 §4). Its own ⓘ sits in the corner —
           the fourth "Why these defaults?" button (#46), kept a sibling of the
           action button so it stays separately clickable. -->
      <div class="calc-cell">
        <button
          type="button"
          class="calc-action"
          data-open-calculator
          aria-label="Calculate targets from body metrics"
          onclick={() => (showCalculator = true)}
        >
          <span class="calc-action-label">Calculate</span>
        </button>
        {@render infoButton(TARGET_RATIONALES.calculator)}
      </div>
    </NutrientCardGrid>

    <NutrientGroupHead label={SECTION_MICROS}>
      {#snippet info()}
        {@render infoButton(TARGET_RATIONALES.micros)}
      {/snippet}
    </NutrientGroupHead>
    <NutrientCardGrid>
      {#each MICRO_DESCRIPTORS as n (n.key)}
        {@render card(n.key, n.label, n.unit, true)}
      {/each}
    </NutrientCardGrid>

    <NutrientGroupHead label={SECTION_LIMITS}>
      {#snippet info()}
        {@render infoButton(TARGET_RATIONALES.limits)}
      {/snippet}
    </NutrientGroupHead>
    <NutrientCardGrid>
      {#each LIMIT_DESCRIPTORS as n (n.key)}
        {@render limitCard(n.key, n.label, n.unit)}
      {/each}
    </NutrientCardGrid>
  </div>

  <div class="round-toggle mt-4">
    <label class="toggle-label">
      <input
        type="checkbox"
        id="round-nutrition-toggle"
        checked={round_nutrition}
        onchange={toggleRoundNutrition}
      />
      <span class="toggle-text">Round calories to whole numbers</span>
    </label>
    <span class="help-text"
      >Show calorie figures as whole numbers. Nutrient amounts always keep their
      decimals, and stored values keep full precision either way.</span
    >
  </div>
</section>

<!-- Mounted only while open so the form seeds fresh from the current profile each
     time; onClose unmounts it (the slide-out animation runs first). -->
{#if showCalculator}
  <CalorieCalculatorSheet
    profile={$settingsStore.food_profile}
    onApply={applyCalculatorResult}
    onClose={() => (showCalculator = false)}
  />
{/if}

<!-- The "Why these defaults?" rationale sheet (#46) — mounted only while a
     rationale is selected, so it slides in fresh; onClose unmounts it. -->
{#if rationale}
  <TargetRationaleSheet {rationale} onClose={() => (rationale = null)} />
{/if}

<style>
  /* Borderless, full-width surface (no Card box): the heading and copy carry the
     same `--space-l` horizontal inset the Card used to pad, so the group-heads
     and grids' `-space-l` bleed still lands flush against this section's edges —
     the parent stretches this section to the full sheet width. */
  .nutrition-editor {
    padding-inline: var(--space-l);
  }
  /* Heading + its ⓘ disclosure on one row, the info button sitting inline right
     after the title. */
  .section-head-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
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

  /* Bleed the shared group-heads + grids out to the enclosing Card's edges (it
     pads `--space-l` horizontally), so the bands and dividers run edge-to-edge
     exactly like the modal. The heads/grids/cards themselves are the shared
     NutrientGroupHead / NutrientCardGrid / NutrientCard; only the allowance-editor
     body below is this surface's own. */
  .nutrient-sections {
    margin: var(--space-m) calc(-1 * var(--space-l)) 0;
    border-top: 1px solid var(--border, var(--ink));
  }

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
    /* A tight gap so the input + unit + reset ↺ fit the narrow phone column
       without the numeric field shrinking below a four-digit value (e.g. 4700). */
    gap: var(--space-3xs);
  }

  /* The grid cell wrapping the calculator action + its ⓘ. A positioning context
     so the info button can sit in the corner without nesting inside the action
     button (a button-in-button is invalid). Fills the grid cell so the action
     stretches to the row height like every other card. */
  .calc-cell {
    position: relative;
    display: flex;
    min-height: 100%;
  }

  /* The calculator entry point: an ACTION button filling the grid's empty sixth
     cell. Deliberately NOT a nutrient card — a solid black fill (never the
     acid-green tracked fill) reads unmistakably as "a button to press", not "a
     target you've set" (ADR-0033 §4). Inverts to white-on-hover, matching the
     reset ↺ / info ⓘ controls' idiom (not green, which would read as a tracked
     nutrient). The opaque fill also lets the grid's 1px hairline gaps draw its
     dividers like every other cell. */
  .calc-action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: var(--space-s);
    background: var(--ink);
    border: none;
    color: var(--paper);
    font-family: inherit;
    cursor: pointer;
  }
  .calc-action:hover {
    background: var(--paper);
    color: var(--ink);
  }
  .calc-action:focus-visible {
    outline: 2px solid var(--paper);
    outline-offset: -6px;
  }
  .calc-action-label {
    font-size: clamp(0.62rem, 3.4cqi, var(--step-n1));
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
    text-align: center;
  }

  /* The "Why these defaults?" ⓘ affordance: a small circular black-bordered "i"
     button. Sits in a section-head band (transparent, inheriting the band's
     colour) or, with .calc-info, pinned in the calculator cell's top-right
     corner over the action. Lowercase serif-less "i" reads as the info glyph. */
  .info-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.35rem;
    height: 1.35rem;
    padding: 0;
    border: 2px solid currentColor;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font-family: var(--font-serif);
    font-size: var(--step-n1);
    font-weight: 700;
    font-style: italic;
    line-height: 1;
    cursor: pointer;
  }
  .info-btn:hover {
    background: var(--ink);
    color: var(--paper);
  }
  .info-btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  /* The calculator's ⓘ, pinned hard into the cell's top-right corner and lifted
     above the action. Tight to the corner (`--space-3xs`) so it clears the
     centred action label rather than crowding it. Inverted to sit on the
     button's solid black fill: white "i" and white border (border is
     `currentColor`) over black, flipping to black-on-white on hover to match the
     action button's own invert. */
  .calc-cell .info-btn {
    position: absolute;
    top: var(--space-3xs);
    right: var(--space-3xs);
    z-index: 1;
    background: var(--ink);
    color: var(--paper);
  }
  .calc-cell .info-btn:hover {
    background: var(--paper);
    color: var(--ink);
  }
  /* Compact numeric field — a brutalist box (2px border, inset, black-on-focus)
     that fits a five-figure micro target (e.g. 4700 mg potassium). */
  .card-target {
    width: 4.25rem;
    min-width: 0;
    /* Snug horizontal padding — the field is only ~4rem wide in a phone column,
       so a wider inset would clip a four/five-figure target's own digits. */
    padding: var(--space-3xs);
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--step-n1);
    text-align: right;
    color: var(--ink);
    background: var(--paper);
    border: var(--edge);
    border-radius: var(--radius);
    box-shadow: inset 2px 2px 0 var(--border);
  }
  .card-target:focus {
    outline: none;
    background: var(--ink);
    color: var(--paper);
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
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    font-size: var(--step-0);
    line-height: 1;
    cursor: pointer;
  }
  .card-reset:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }
  .card-reset:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .card-reset:disabled {
    border-color: var(--border-subtle, var(--border));
    color: var(--border-subtle, var(--border));
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
    /* Keep the whole label on ONE line: the caps text never wraps, and the font
       shrinks with the container so it always fits. `min(step-n1, X·cqi)` caps at
       the normal size on a wide container and rides X·cqi down on a narrow one.
       X = 100 / row-width-in-em; the "ROUND TO WHOLE NUMBERS" row measures
       ≈ 15.3em (checkbox + gap + caps) — with a little headroom for the checkbox's
       sub-pixel growth at small sizes, 6cqi keeps it flush to one line at any
       width, shrinking only once the container is too narrow for the capped size. */
    font-size: min(var(--step-n1), 6cqi);
    font-weight: 700;
    line-height: 1.4;
    color: var(--ink);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
    white-space: nowrap;
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
  /* Custom retro checkbox for the round toggle: appearance:none lets the control
     fill its own box so it centres cleanly, matching the 2px black borders used
     across Settings. (Nutrient cards toggle via the whole card, no visible box.) */
  .toggle-label input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: grid;
    place-content: center;
    width: 1.35em;
    height: 1.35em;
    margin: 0;
    border: var(--edge);
    background: var(--paper);
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"]::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: var(--ink);
    transform: scale(0);
  }
  .toggle-label input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .toggle-label input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .mt-2 {
    margin-top: var(--space-xs);
  }
  .mt-4 {
    margin-top: var(--space-m);
  }
</style>
