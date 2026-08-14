# ADR 0033: A personalized energy/macro helper and default-rationale info buttons

**Status:** Accepted  
**Date:** 2026-07-31  
**Implemented:** `src/lib/food/personalized-energy-macros.ts`, `CalorieCalculatorSheet.svelte`; see the amendment below

## Amendment (2026-07-31): calculated targets are a frozen default layer

Decision 1 below wrote the helper's `energy`/`protein`/`fat`/`carbs` into `settings/food/targets`
as **overrides**. In use this was wrong: because an override reverts to the _baked_ default when
cleared, the editor's ↺ reset (and the greyed placeholder) sent a user who had just calculated
2,670 kcal back to the generic 2,000-kcal reference — "the default should be what the calculator
returned" is unreachable under the override model.

**The fix reverses Decision 1's persistence target.** _Apply targets_ now writes the four computed
numbers to a **new blob datom `settings/food/calculated_targets`** and **clears** any override on
those keys. This is a **default layer** between the baked reference and `settings/food/targets`:
`defaultNutrientTargets(calculated)` composes `baked ⊕ calculated` and is passed as the `baked`
argument of ADR-0031's `resolveNutrientTargets`, so the single-resolved-map invariant is intact —
the precedence is just **baked → calculated-default → override** now. A cleared override therefore
falls back to the computed figure. (Fibre was later folded into the calculated layer too — see
[Amendment 2](#amendment-2-2026-07-31-fibre-is-energy-scaled-in-the-calculated-layer); the twelve
micros remain never personalized.)

This is the "third precedence layer" the original ADR rejected under Alternatives — but the rejection
was about a layer that **re-derives live from the profile** (a "live-vs-stale coupling"). This layer
does **not**: the numbers are **frozen at apply-time** (the profile stays inert, Decision 2), never
recomputed, so a later tweak to the helper's constants can't silently shift a user's defaults, and
re-applying after a weight change is still a conscious act. The live-vs-stale objection does not
apply to a frozen snapshot. Registered in `docs/eavt-vocabulary.md` alongside the profile blob.

## Amendment 2 (2026-07-31): fibre is energy-scaled in the calculated layer

Decision 1 left **fibre** at its baked default (28 g) even after the calculator ran, on the reasoning
that "the helper writes four keys." That reasoning was scope, not principle — and it left the helper
**internally inconsistent**. Fibre's guideline is not a fixed amount: the IOM 2005 Total Fiber
Adequate Intake is **14 g / 1000 kcal**, a rate. The baked 28 g is just that rate applied to the
2,000-kcal reference diet. Once the calculator personalizes **energy**, pinning fibre to the old
reference means a user targeting 2,800 kcal reaches toward only 28 g when the app's own cited basis
says ~39 g, and a 1,600-kcal user is over-targeted.

**The fix:** `computeEnergyAndMacros` now also returns **`fiber_content` = 14 g / 1000 kcal × the
(BMR-clamped) energy**, and `fiber_content` joins `PERSONALIZED_TARGET_KEYS` so it flows through the
frozen calculated-default layer exactly like the three macros — auto-tracked on Apply, shown in the
live preview, reverting to the computed figure (not the baked 28 g) on ↺.

This is **not** a new guideline or a contested product choice; it applies the fibre AI's _own_
per-kcal definition to the number the calculator already computes. It reproduces the baked **28 g
exactly at 2,000 kcal**, so a user at the reference diet is unchanged, and the baked default (for
anyone who never runs the calculator) stays 28 g. It scales off the clamped energy, so it also
respects the resting-burn floor and tracks the manual calorie nudge. The twelve micronutrients have
no energy-linked basis and remain baked-only.

## Context

ADR-0031 gave the food panel a **baked, cited, generic** target model: one 2,000-kcal profile
(active-adult macros + FDA micronutrient Daily Values), user-overridable per key via the
`settings/food/targets` blob. It **explicitly deferred personalization**, recording under
Alternatives considered: _"Personalized DRIs (age / sex / pregnancy / activity + a demographic
profile). Out of scope — the static-DV destination rules it out; a fresh effort if pursued."_

This ADR is that fresh effort (branch `feat/nutrition-target-editor`). It reopens the deferred
door with **two paired features** that meet at the Calories card:

- **Part A — "Why these defaults?" info buttons.** The baked numbers each trace to a primary-source
  reference doc, but nothing in the running app surfaces _why_ a target is what it is. This adds an
  ⓘ affordance that opens the source and reasoning behind each group of defaults.
- **Part B — a personalized calorie/macro helper.** A Settings calculator that turns a user's body
  metrics into a suggested energy + macro target. Its numbers are cited to a new reference asset,
  `docs/reference/personalized-energy-and-macros.md` (Mifflin-St Jeor BMR + IOM PAL activity + ISSN
  protein), and it surfaces its _own_ rationale through the same Part-A info machinery — which is why
  the two features are one ADR.

Crucially, Part B is designed **not** to disturb ADR-0031's model. It is a **throwaway calculator**
that writes the same kind of override numbers a user could type by hand — so there is no new resolver
tier, no third precedence layer, and the dashboard keeps reading one already-resolved targets map.
The static-DV destination that ruled personalization out is preserved as the _baseline_; the helper
is an optional _input aid_ that produces overrides on top of it. Implementation is a separate effort,
as ADR-0030/0031/0032's were — this ADR plus its `ready-for-agent` tickets are the hand-off.

## Decision

### 1. The helper is a throwaway calculator that writes the existing override blob

The calculator takes **biological sex, age, height (cm), weight (kg)** plus an **activity level** and
a **goal**, computes a suggested **`energy` + `protein` + `fat` + `carbs`** set, and on _Apply_ writes
those four keys into `settings/food/targets` — the exact blob the manual editor already writes
(ADR-0031 §2). No new resolver, no new dashboard read path: the helper is an alternative way to
_produce_ overrides, not a new kind of target. Fibre and the twelve micronutrients are **untouched** —
they keep their baked defaults.

**Metric only** (kg/cm). Mifflin-St Jeor is natively metric; the stored profile holds metric
regardless, so an imperial display is a later display-edge change if ever wanted.

### 2. Body metrics persist in an inert `settings/food/profile` blob (pre-fill only)

The helper's inputs are saved to a **new blob datom** `settings/food/profile` — a JSON object
`{ sex, age, height_cm, weight_kg, activity, goal }` — so re-opening the helper is pre-filled (bump
your weight, re-apply). This blob **drives nothing live**: the dashboard never reads it, the resolver
never sees it. It exists purely to seed the form. This keeps Decision 1 honest — the profile is an
input memory, not a personalization layer that re-derives targets behind the user's back. It joins the
`settings/food/…` family and rides the append-only `settings:global` entity (ADR-0001), snake_case
per house convention.

### 3. The formula: Mifflin-St Jeor → IOM PAL → percentage goal → protein-anchored macros

All numbers and their derivation live in `docs/reference/personalized-energy-and-macros.md`; the
module is a transcription of it (a corrected figure moves the doc and the module together, exactly
as `nutrition-targets.ts` mirrors the baked reference docs).

- **BMR — Mifflin-St Jeor (1990).** `10·kg + 6.25·cm − 5·age + s`, `s = +5` (male) / `−161` (female).
  The Academy of Nutrition & Dietetics' recommended predictive equation; statistically unbiased,
  ±10 % for ~70–82 % of adults. Its **binary-sex constant** is a documented limitation, not hidden
  (Decision 6).
- **Activity — four IOM PAL categories.** TDEE = BMR × PAL, using representative multipliers
  **Sedentary 1.25 / Low active 1.5 / Active 1.75 / Very active 2.2** — the midpoints of the IOM 2005
  PAL bands (1.0–1.4 / 1.4–1.6 / 1.6–1.9 / 1.9–2.5). The **bands are primary-sourced; the midpoint is
  a product choice**. PAL is _defined_ as total-energy ÷ basal-energy, so it is a BMR multiplier by
  definition — but IOM's own EER equations don't use MSJ as the basal term, so the reference doc and
  the info copy state plainly that MSJ×PAL is a sound-but-not-IOM-blessed pairing.
- **Goal — percentage of TDEE, not a flat kcal delta.** **Lose 0.80 / Maintain 1.00 / Gain 1.10.**
  A percentage keeps the _relative_ deficit/surplus constant across body sizes and activity levels
  (a flat ±500 is ~31 % of a small sedentary TDEE but ~16 % of an athlete's), and it coheres with the
  safety clamp: at the sedentary PAL, −20 % of TDEE ≈ BMR, so the percentage floor and the clamp
  agree. −20 % matches the "never below 80 % TDEE" first-phase guidance; +10 % lands in the
  200–300 kcal lean-bulk band for typical TDEEs.
- **Safety clamp.** The goal-adjusted target is **floored at the user's own BMR** — the helper never
  suggests eating below resting burn — with a short UI note when the floor bites. Personalized
  (scales to the individual), needs no citation beyond the BMR already computed.
- **Macros — protein anchored to bodyweight, carbs the remainder.** Protein **1.6 g/kg** (Morton
  2018 breakpoint, inside the ISSN 2017 1.4–2.0 g/kg range); fat **30 % of energy** (mid-AMDR,
  matching the baked split); carbs **the remaining energy at 4 kcal/g, clamped ≥ 0**. The g/kg
  protein anchor is deliberate: on a cut it holds protein steady while calories fall, where a
  %-energy split would drop it — the reason Decision 1 writes macros at all rather than energy alone.

### 4. Helper UI: a distinct action card in the Energy & macros grid → a BottomSheet

The Nutrition Display card's **Energy & macros** grid is a 2-column grid holding five cards
(Calories, Protein, Fat, Carbs, Fibre), leaving the **sixth (bottom-right) cell empty**. The helper's
entry point fills that cell as an **action card, styled to read as an action, not a nutrient card**
(e.g. inverted / dashed, not the acid-green tracked fill), so it sits naturally in the grid without
masquerading as a target.

Tapping it opens a **`BottomSheet`** (ADR-0027, "the one sheet primitive") containing the form:
biological sex, age, height, weight, the **four-way activity picker** (with a one-sentence in-UI
explanation of the IOM PAL categories), and the **three-way goal picker**. The sheet shows a **live
preview** — computed calories + the three macro grams, recomputing as fields change — with a **manual
calorie nudge** on the final number. **_Apply targets_** writes `energy`/`protein`/`fat`/`carbs` into
`settings/food/targets`, **overwriting** any existing values for those four keys (the live preview
already showed what is being accepted), and **auto-tracks** protein/fat/carbs into
`visible_nutrients` — matching the editor's existing "customising implies show it" behaviour
(Calories is always-on already). Then it closes, returning the user to the editor where the written
numbers are visible and further tweakable.

### 5. "Why these defaults?" info buttons: per-section, BottomSheet, cited, Settings-only

An ⓘ affordance opens the source-and-reasoning behind a group of defaults. Granularity is
**one button per section head (3) + one on the calculator (1) = four** — because the reasoning maps
**1:1 to the reference docs**, and everything in a section shares one source:

| Info button         | Reference doc                       |
| ------------------- | ----------------------------------- |
| Energy & macros     | `active-adult-macros.md`            |
| Vitamins & minerals | `fda-daily-values.md`               |
| Limits              | `daily-nutrient-limits.md`          |
| The calculator      | `personalized-energy-and-macros.md` |

- **Surface: `BottomSheet`** (the same primitive as the helper form) opened from the ⓘ.
- **Content: baked-in authored copy** (offline-first — a local-first PWA can't fetch), transcribed
  from the reference docs into one content module, with **full citations + clickable source links**.
  Copy and source doc move together, like the numbers do. The calculator's sheet additionally states
  the MSJ×PAL and binary-sex caveats plainly (Decision 3/6).
- **Settings-only for v1**, implemented as an **optional info slot on the shared `NutrientGroupHead`**
  component. The full-day RDA modal renders the same heads but passes no info, so it stays a clean
  day-vs-target readout — and its "Biggest gaps" / "Not tracked" heads aren't source-groups anyway
  (only two of its four sections would have anything to show). Extending to the modal later is a
  one-line change (pass the info). The calculator's ⓘ is Settings-only regardless — the calculator
  lives there.

### 6. Biological sex is a two-option field, framed as a metabolic-estimate input

Mifflin-St Jeor has exactly two forms (the `+5`/`−161` constant); there is no validated non-binary
coefficient. The field is labelled **"Biological sex"** with two options (Female / Male) and a helper
line making clear it is used **only** to estimate resting metabolism — _"Used only to estimate your
resting metabolism (Mifflin-St Jeor is defined for two groups). It affects nothing else, and you can
adjust the result — see ⓘ."_ The manual nudge and the fully-optional helper are the escape hatch for
anyone the equation doesn't fit; the calculator's info sheet explains the limitation and notes
trans/HRT users may prefer to nudge the result. An **invented averaged third constant was rejected**
(see Alternatives).

### 7. Register the new attribute

`settings/food/profile` joins `settings/food/{visible_nutrients,round_nutrition,targets,limits}` in
`docs/eavt-vocabulary.md` (the food-settings family). As with ADR-0031/0032, there are no existing
users, so no migration is needed.

## Consequences

- **A new blob attribute** `settings/food/profile` is added, read-folded into the settings store and
  written by an independent `saveFoodProfile`. It is **inert** — nothing outside the helper form reads
  it — a deliberate departure in role from `targets`/`limits`, which the dashboard does read.
- **A new pure module + its unit tests** (`mifflinStJeorBmr`, `computeEnergyAndMacros`) sit beside
  the baked-target module, transcribed from the new reference doc; a corrected figure moves the doc
  and the module together.
- **The Nutrition Display card gains an action card** in the previously-empty grid cell and a
  `BottomSheet` calculator; **`NutrientGroupHead` gains an optional info slot** and grows four ⓘ
  buttons wired to a new authored-copy content module.
- **The override model, resolver, dashboard, and consumption snapshot are all unchanged.** The helper
  only produces `settings/food/targets` writes; ADR-0031 §2's single-resolved-map invariant holds, and
  the frozen snapshot (ADR-0022) is untouched.
- **ADR-0031's "personalization is out of scope" is now bridged**, not contradicted: the static DVs
  remain the baseline; personalization is an optional override-producing aid layered on top. This ADR
  is the bridge a future reader needs.
- **Deferred follow-ups**, named so they are not lost:
  - **Info buttons in the full-day modal** — pass the info slot to the two source-backed heads there.
  - **Goal-varied protein** — bump the g/kg anchor during a cut (e.g. 1.8–2.2 g/kg on Lose) to better
    preserve lean mass; v1 uses a flat 1.6 g/kg.
  - **Imperial units** — a display-edge toggle over the metric-stored profile.

## Out of scope

- **A persisted personalization layer that re-derives targets live.** Rejected as the model (see
  Alternatives) — the profile is inert, pre-fill only. Auto-re-derivation on weight change is a
  deliberate non-goal; re-applying is a conscious act.
- **A non-binary BMR coefficient** (an averaged or third constant) — unvalidated pseudo-precision
  (Alternatives / Decision 6).
- **Imperial units, goal-varied protein, and modal info buttons** — deferred follow-ups above.
- **Pregnancy / lactation / clinical DRI adjustments** — outside a general-purpose helper.

## Alternatives considered

- **A persisted body-profile that drives a live resolver tier** (baked → profile-derived →
  manual override). Rejected as the model: it adds a third precedence layer and a live-vs-stale
  coupling a personal app doesn't need — you don't change your height, and you'd want to consciously
  re-apply after a weight change anyway. The throwaway-calculator-writing-overrides model (Decision 1)
  keeps ADR-0031's single-resolved-map invariant intact while still persisting inputs (Decision 2) for
  painless re-runs.
- **Energy-only helper** (write `energy`, leave macros as the baked %-split scaled to the new
  calories). Rejected: a %-split can't anchor protein to bodyweight, so on a cut it lowers protein
  grams exactly when they should stay high — the physiologically wrong behaviour. Writing all four
  keys (Decision 3) is the reason to compute macros at all.
- **Harris-Benedict or Katch-McArdle BMR.** Rejected: Harris-Benedict systematically overestimates
  (1919 population); Katch-McArdle needs a body-fat % input a quick helper can't ask for. Mifflin-St
  Jeor is the AND-recommended, unbiased standard using exactly the four inputs the profile carries.
- **The popular 5-tier 1.2–1.9 activity multipliers.** Rejected in favour of the **four IOM PAL
  categories**: the popular multipliers don't trace to one clean primary source, whereas the IOM bands
  do (and the app already cites IOM 2005 for its AMDRs), keeping the whole helper primary-sourced.
- **Flat ±500 kcal goal deltas.** Rejected: a flat delta is an inconsistent fraction of intake across
  body sizes/activity and collides with the BMR clamp for small/sedentary users; percentage-of-TDEE
  (Decision 3) keeps the relative deficit constant and coheres with the clamp.
- **No safety floor on the computed calories.** Rejected: a −20 % cut off a low TDEE can approach or
  dip under resting burn; flooring at the user's own BMR is a responsible, personalized default that a
  tool outputting a calorie goal should carry. A **fixed** floor (1,200 ♀ / 1,500 ♂) was also
  rejected as cruder — it doesn't scale to the individual the way a per-person BMR floor does.
- **An invented non-binary sex constant** (averaging +5 and −161 to −78). Rejected: averaging is not
  physiologically meaningful and hands the user a made-up number while _appearing_ inclusive. Honest
  framing of the real binary limitation (Decision 6), plus the manual nudge and optional helper, is
  the more respectful design.
- **Per-nutrient (~21) or one global info button.** Rejected: per-nutrient buries the same "21 CFR
  101.9 Daily Value" citation a dozen times; a single global button loses the "why _this_ group"
  locality. Per-section (Decision 5) maps 1:1 to the reference docs.
- **Info content as reasoning-only with soft attribution** (no source links). Rejected: the request
  was explicitly for "sources _and_ reasoning," and it matches the codebase ethos that every number
  traces to a cited doc — so the UI exposes the same chain, links included.

## Implementation hand-off (`ready-for-agent` tickets)

1. **Reference doc + baked helper module.** `docs/reference/personalized-energy-and-macros.md` (done,
   this ADR) transcribed into a pure `mifflinStJeorBmr` / `computeEnergyAndMacros` module beside
   `nutrition-targets.ts`, with unit tests covering the worked examples, the BMR clamp, and the
   carbs-≥0 clamp.
2. **The `settings/food/profile` blob + store wiring.** New inert blob datom, `saveFoodProfile`
   writer, read-fold in the settings store, `docs/eavt-vocabulary.md` registration.
3. **The calculator UI.** The distinct action card in the Energy & macros grid's empty cell, the
   `BottomSheet` form (biological-sex/age/height/weight/activity/goal + PAL sentence), live preview,
   manual nudge, and the Apply flow (overwrite four keys + auto-track macros).
4. **The rationale info buttons.** The optional info slot on `NutrientGroupHead`, the four authored-copy
   `BottomSheet`s (three section docs + the calculator), with full citations and clickable links,
   wired Settings-only.
