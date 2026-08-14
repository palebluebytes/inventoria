# ADR 0031: Baked, user-overridable daily nutrition targets for the food panel

**Status:** Accepted  
**Date:** 2026-07-30  
**Amended by:** ADR-0032 (the deferred stay-under half), ADR-0033 (a frozen personalized default layer)  
**Implemented:** #41 (`65b1dac`, `25151a5`), #42 (`8c1993e`); `src/lib/food/nutrition-targets.ts`

## Context

The food dashboard already renders a target-relative view: `buildNutrientMeters`
(`src/lib/food/nutrient-display.ts`) takes a `targets` map (grams, keyed by
breakdown key) and draws a fill bar for any nutrient with a positive target, and
`CalorieRing` fills against a calorie goal. But the targets it consumes are a
**hardcoded generic-adult, macro-only constant** in
`DailyDashboard.svelte` — `targetCalories = 2000` and
`{ protein: 130, fat: 70, carbs: 220 }` (magic numbers, no citation). Micronutrients
— the twelve the panel now carries after ADR-0030 — have no target at all, so they
render as bare totals with an empty track.

This ADR decides **where the target numbers come from, how a user overrides them,
and the two surfaces that display the full target picture**. It is the target
counterpart to ADR-0030 (which added the micronutrient _values_ but explicitly
deferred surfacing them): ADR-0030 gave the panel a numerator, this ADR gives it a
cited, overridable denominator. Implementation is a separate effort, as ADR-0030's
was — this ADR plus its `ready-for-agent` tickets are the hand-off.

The design decisions below were each grilled and closed as child tickets of the
[wayfinder map (#32)](https://github.com/inkpot-monkey/inventoria/issues/32); this
ADR is the synthesis. Two primary-source reference assets underpin the numbers:
`docs/reference/fda-daily-values.md` (the 21 CFR 101.9 Daily Values, #33) and
`docs/reference/active-adult-macros.md` (the IOM-2005-derived active-adult macros,
#34 / #38).

**Scope is goal-nutrients only.** The reach-toward set — energy, the three macros,
fibre, and the twelve label micronutrients — gets a baked target. Limit nutrients
(sodium, saturated fat, cholesterol, trans fat, sugar) get no target this effort;
a "stay-under" semantic with amber-past-100% rendering is a deliberately deferred
follow-up (see Out of scope). Personalized DRIs (age / sex / activity) are ruled out
by the static-DV destination.

## Decision

### 1. Baked targets live in one reference module, reach-toward set only

A new module (beside the reference assets it is transcribed from) exports the baked
target map — every value in its **consumer's canonical unit**: grams for mass,
**kcal** for energy — keyed by the food-panel breakdown key:

- **Energy + the four macro/fibre keys** come from `ACTIVE_ADULT_MACROS_G`
  (`docs/reference/active-adult-macros.md`, #34 / #38): energy **2000 kcal**,
  protein **125 g**, fat **67 g**, carbs **225 g**, `fiber_content` **28 g**. These
  are a 25 / 30 / 45 %-energy split at the high-protein end of the IOM 2005 AMDRs
  (Atwater 4/4/9, summing to exactly 2000 kcal), with fibre from the DRI Total Fiber
  AI (14 g/1000 kcal). This is the **active-adult** basis, not the FDA reference
  diet — the panel renders a personal fill bar (`value / target`), not a label's
  "% DV" number, so it targets a profile rather than the generic denominator (#34).
- **The twelve label micronutrients** come from `FDA_DAILY_VALUES_G`
  (`docs/reference/fda-daily-values.md`, #33): the 21 CFR 101.9 RDIs converted to
  grams — `vitamin_d` 0.00002, `calcium` 1.3, `iron` 0.018, `potassium` 4.7,
  `vitamin_a` 0.0009, `vitamin_c` 0.09, `vitamin_e` 0.015, `vitamin_b6` 0.0017,
  `vitamin_b12` 0.0000024, `folate` 0.0004, `magnesium` 0.42, `zinc` 0.011. Units
  are equivalence-weighted at source (vit A µg RAE, vit E mg α-tocopherol, folate
  µg DFE) — the stored gram is a straight unit conversion, no IU math.

The baked map is exactly these seventeen keys — the **reach-toward set**. Limit
nutrients are absent from it by construction, so they never get a fill bar. Fibre
(28 g) and energy (2000 kcal) coincide between the two bases, so composing "FDA
micros, then active-adult macros" needs no reconciliation.

This obeys the panel invariant (ADR-0021: one fixed unit per field) and the "new
nutrient is a new key" move — a future target is one more entry, no schema change.

### 2. Overrides are one blob datom, with presence/absence semantics

User overrides live in a **single blob datom** `settings/food/targets` (a JSON
object value, per ADR-0009's flexible-blob precedent), a **partial** `{ key: number }`
map filtered to the reach-toward key set, each value in the **same canonical unit as
the baked map** (grams for mass, kcal for energy). It mirrors the existing food
settings' shape and rides the append-only `settings:global` entity (ADR-0001).

**Presence/absence in that map is the model** — three states per key:

- **absent** → use the baked default (the common case; the blob only carries keys
  the user has actually touched);
- **`> 0`** → an override; use this number instead of the baked default;
- **`0`** → an explicit **opt-out**; the nutrient has _no_ target (no fill bar, no
  meter target), even if a baked default exists.

A **merge resolver** layers `override ?? baked` per key into the resolved targets map
**before** `buildNutrientMeters` and the calorie ring consume it, so both surfaces
read one already-resolved map and neither re-implements the precedence. The `0`
opt-out resolves to "no target" (the key is dropped / left non-positive so
`buildNutrientMeters` renders it bar-less), distinct from absent (which resolves to
the baked default).

**Calories is override-number-only.** The ring is always on and cannot be removed,
so a non-positive calorie override (including a `0` that would mean "opt out"
everywhere else) **clamps back to the baked 2000 kcal** rather than hiding the ring.
Only calories carries this clamp; every other key honours the `0` opt-out.

Target entry is in the nutrient's **fixed display unit** (mg/µg for micros, g for
macros, kcal for energy) via a new pure `parseNutrientEntry` — the inverse of
`formatNutrientValue` — which converts the typed display value back to the stored
canonical unit. `formatNutrientValue` / `parseNutrientEntry` are a round-trip pair.

### 3. Settings editor: the Nutrition Display card grows a per-row target field

No new settings card (#36, Variant A — three layouts prototyped, this one chosen).
The existing **Nutrition Display** card's per-nutrient rows each grow a target field,
so a row reads:

```
[visible ✓]  [label]  [target input]  [unit]  [↺ reset]
```

- Rows are grouped **Macros** and **Vitamins & Minerals**, with **Calories** pinned
  first (its visibility toggle is absent — the ring is always on — and its target is
  override-number-only per Decision 2).
- **No changed-state colour.** An acid-green "custom" border was prototyped and
  rejected; custom-vs-default reads from **placeholder-vs-value** (the baked default
  shows as placeholder text; a set override shows as an entered value) plus the
  **enabled ↺** alone (reset is disabled when the row is at its baked default).
- **Opt-out (`0`)** shows an inline **"hidden"** hint on the row — not a chip, not a
  live meter — so the user can see the nutrient is deliberately un-targeted.
- **Visibility and target are two independent datoms** that merely share a row:
  `settings/food/visible_nutrients` and `settings/food/targets` save separately.
  Toggling visibility never touches the target and vice versa.

The editor reads the Decision-2 model directly (baked map + override blob +
resolver) and writes the override blob via the settings store. Prototype asset:
`scratchpad/target-editor-prototype.html`.

### 4. Full-day view: a grouped RDA-vs-target modal (#37, Variant C)

The existing day-breakdown modal (opened by tapping the dashboard aggregates, #31)
gains the full RDA-vs-target picture — **independent of `visible_nutrients`**: it
shows everything the day actually carried, not just the selected meters. One modal,
four consistent `.group-head` sections (Variant C — three layouts prototyped, this
one chosen):

- **Biggest gaps** — a severity strip ranking the reach-toward nutrients furthest
  from target. This strip carries the **only** percentage in the modal, and it is a
  _ranking_ signal, not a "% DV" readout. (Amended: the gaps strip alone is scoped
  to the tracked selection — see
  [Amendment](#amendment-2026-07-31-the-biggest-gaps-strip-follows-the-visible-nutrient-selection).
  The two reference sections below stay independent of `visible_nutrients` as stated.)
- **Energy & macros** — energy, protein, fat, carbs, fibre.
- **Vitamins & minerals** — the twelve micronutrients.
- **Not tracked** — the no-target limit nutrients the day carried (plain value, no
  bar), so nothing the food reported is silently dropped.

Each targeted row renders `value / target` plus a fill bar and **no % number in the
ledger** (upholding #34's fill-bar-not-%DV stance, reusing the dashboard-meter
idiom). Rendering rules:

- an **absent** targeted nutrient (the day carried none) renders **`— / target`** —
  distinct from a nutrient the food reported as `0` (absent ≠ 0, ADR-0030 / #21);
- an **over-target** nutrient fills the bar full and tints **amber** (the one place a
  reach-toward nutrient can exceed 100%);
- a nutrient with **no target** (limit nutrients, or a `0` opt-out) lands in
  **Not tracked** with a plain value and no bar.

Implementation is a **new pure builder** beside `buildNutrientBreakdown` in
`nutrient-display.ts` that takes the day total, the resolved targets, and the baked
target set, and returns the four grouped view-model sections; the `.svelte` modal
just renders them. Prototype assets: `scratchpad/day-rda-modal-prototype.html` and
the [interactive prototype](https://claude.ai/code/artifact/89f643fd-221e-4f7f-98e6-8143a665ae1a).

### 5. Rename the food settings into a `settings/food/…` namespace

`settings/visible_nutrients` → `settings/food/visible_nutrients` and
`settings/round_nutrition` → `settings/food/round_nutrition`, joining the new
`settings/food/targets` under one namespace. **No back-compat / no migration** —
there are no existing users, so the old attribute names are simply replaced (#35).
The API-key settings (`settings/usda_api_key` etc.) are unrelated and keep their
names.

## Consequences

- **`DailyDashboard.svelte`'s hardcoded `targetCalories` / `NUTRIENT_TARGETS`
  constant is deleted**, replaced by the resolved targets map (baked ⊕ override)
  feeding both `buildNutrientMeters` and the calorie ring. Micronutrient meters that
  are visible now render a fill bar (they were bar-less before).
- **A new blob attribute** `settings/food/targets` and **two renamed attributes**
  (`settings/food/visible_nutrients`, `settings/food/round_nutrition`) must be
  registered in `docs/eavt-vocabulary.md`; the old names are removed.
- **The consumption snapshot is untouched.** Targets are a display-time denominator
  only — no `event/metrics` or recipe-instantiation row changes; the frozen snapshot
  (ADR-0022) is unaffected.
- **The day-breakdown modal now shows more than `visible_nutrients`** — it becomes
  the "everything, against target" surface, while the dashboard meters stay gated by
  the selection (no regression to the summary).
- **A round-trip parse/format pair** (`parseNutrientEntry` ⇆ `formatNutrientValue`)
  now exists; any future numeric nutrient entry reuses it.
- **The baked module is a transcription** of two primary-source reference docs; if a
  DV or AMDR figure is ever corrected, the reference doc and the module move together.
- **Limit nutrients still have no target**, so a day heavy in sodium/saturated fat
  shows those only in the modal's _Not tracked_ section — the "stay-under" view is a
  later effort.

## Alternatives considered

- **FDA reference-diet macros (protein 50 / fat 78 / carbs 275).** Rejected for the
  macro targets: the panel renders a _personal fill bar_, not a label %DV, so the
  active-adult profile is the right denominator (#34). The FDA numbers are still used
  for the twelve micronutrients, where no active-adult alternative applies.
- **Personalized DRIs** (age / sex / pregnancy / activity + a demographic profile).
  Out of scope — the static-DV destination rules it out; a fresh effort if pursued.
- **A per-key target datom** instead of one blob. Rejected: the targets are one
  coherent user preference edited as a set, matching the blob granularity ADR-0009
  and the existing food settings already use; a datom-per-key multiplies writes and
  read-folding for no gain.
- **A changed-state colour** on custom rows (acid-green border). Prototyped and
  rejected (#36): placeholder-vs-value plus the enabled ↺ already reads as
  custom-vs-default without adding a colour the brutalist-minimal UI (ADR-0003) avoids.
- **A "% DV" number in the modal ledger.** Rejected (#37): a percentage per row
  reframes the panel as a label readout; the fill bar carries proportion visually and
  the gaps strip carries the single ranking %.
- **A `settings/food/targets` value in native display units** (mg/µg). Rejected:
  storing grams keeps the panel invariant (one unit per field) intact end-to-end;
  the mg/µg display is a `parseNutrientEntry`/`formatNutrientValue` concern at the
  editor edge only.

## Amendment (2026-07-31): the Biggest-gaps strip follows the visible-nutrient selection

Decision 4 above framed the whole modal — sections **and** the Biggest-gaps strip —
as "independent of `visible_nutrients`". Implementation split that: the two reference
sections (**Energy & macros**, **Vitamins & minerals**) stay independent and show
every reach-toward nutrient the day carried, but the **Biggest-gaps strip is scoped
to the tracked selection** (the user's visible meters, plus the always-on Calories).
An omitted selection still ranks every targeted nutrient.

The reasoning is that the two surfaces answer different questions. The sections are a
_reference_ — "here is the whole day against target", so they must be exhaustive. The
gaps strip is an _action prompt_ — "what to eat next" — and an action prompt is only
useful about goals the user has actually chosen to pursue: ranking a nutrient they
deliberately left untracked isn't something they can act on. Scoping the strip to the
selection keeps it a personal to-do list rather than a second, redundant reference.

The strip's ordering is unchanged from Decision 4: reach-toward nutrients **furthest
from target** first, which means a **tracked nutrient the day carried none of ranks
at the top** (zero intake is the maximal gap and the loudest "eat this next" signal),
ahead of the lowest-fill present nutrients. This is `buildDayRdaView`'s `selection`
parameter and its `tracked` predicate in `src/lib/food/nutrient-display.ts`; the
dashboard passes `settingsStore.visible_nutrients`. The sections' independence is
preserved — they are built from the shared `MACRO_DESCRIPTORS` / `MICRO_DESCRIPTORS`
sets, not the selection.
